// ============================================
// MODERATION ROUTES MODULE
// ============================================

const { Report, UserRestriction, PostModeration } = require('./moderation-schemas');
const { User, Post, ActivityLog } = require('./database');

// Helper function to get client IP
function getClientIp(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket?.remoteAddress ||
           'unknown';
}

// Helper function for logging
async function logModerationAction(userId, action, details, ipAddress = 'unknown') {
    try {
        const user = await User.findById(userId);
        await ActivityLog.create({
            user: userId,
            username: user.username,
            action: action,
            targetType: 'MODERATION',
            details: details,
            ipAddress: ipAddress,
            timestamp: new Date()
        });
    } catch (error) {

    }
}

// requireRole middleware to handle arrays
function requireRole(roles) {
    return async (req, res, next) => {
        try {
            if (!req.session.userId) {
                return res.status(401).redirect('/login');
            }
            
            // Fetch user from database
            const user = await User.findById(req.session.userId);
            if (!user) {
                return res.status(401).redirect('/login');
            }
            
            // Convert single role to array
            const allowedRoles = Array.isArray(roles) ? roles : [roles];
            
            if (!allowedRoles.includes(user.role)) {
                return res.status(403).render('error', {
                    message: 'Access denied. Insufficient permissions.',
                    user: user
                });
            }
            
            // Attach user to request for use in route handlers
            req.currentUser = user;
            next();
        } catch (error) {

            return res.status(500).render('error', {
                message: 'Internal server error'
            });
        }
    };
}

// Export function that registers all moderation routes
module.exports = function(app, requireAuth) {

// ============================================
// USER ROUTES - Report Posts
// ============================================

// Report a post
app.post('/report/post/:postId', requireAuth, async (req, res) => {
    try {
        const postId = req.params.postId;
        const { reason, description } = req.body;
        const userId = req.session.userId;
        
        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Check if user already reported this post
        const existingReport = await Report.findOne({ 
            post: postId, 
            reportedBy: userId 
        });
        
        if (existingReport) {
            return res.json({ error: 'You have already reported this post' });
        }
        
        // Create report (post uses soft delete, so it will always be accessible)
        const newReport = await Report.create({
            post: postId,
            reportedBy: userId,
            reason: reason,
            description: description
        });
        
        // Log the report
        await logModerationAction(userId, 'USER_REPORT', `Reported post ${postId} for: ${reason}`, getClientIp(req));
        
        res.json({ success: true, message: 'Report submitted successfully' });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit report', details: error.message });
    }
});

// ============================================
// MANAGER ROUTES - Handle Reports
// ============================================

// View all reports (pending first) - FILTERED BY MANAGED TAGS FOR MANAGERS
app.get('/manager/reports', requireAuth, requireRole(['manager', 'administrator']), async (req, res) => {
    try {
        const currentUser = req.currentUser;
        
        let query = {};
        
        // If user is a manager, filter reports by tags they manage
        if (currentUser.role === 'manager') {
            // Get all posts with tags the manager moderates
            const managedPosts = await Post.find({ 
                postTag: { $in: currentUser.managedTags || [] } 
            }).select('_id');
            
            const managedPostIds = managedPosts.map(post => post._id);
            
            // Filter reports to only include posts with managed tags
            query = { post: { $in: managedPostIds } };
        }
        // Administrators see all reports (no filter)
        
        const reports = await Report.find(query)
            .populate('post')
            .populate('reportedBy', 'username profilePic')
            .populate({
                path: 'post',
                populate: { path: 'user', select: 'username profilePic' }
            })
            .populate('handledBy', 'username')
            .sort({ 
                status: 1,  // pending first
                createdAt: -1 
            })
            .lean(); // Convert to plain JavaScript objects
        
        // Convert ObjectIds to strings for Handlebars (posts are soft deleted, so they still exist)
        const reportsWithStringIds = reports.map(report => ({
            ...report,
            _id: report._id.toString(),
            post: report.post ? {
                ...report.post,
                _id: report.post._id.toString(),
                user: report.post.user ? {
                    ...report.post.user,
                    _id: report.post.user._id.toString()
                } : null
            } : null,
            reportedBy: report.reportedBy ? {
                ...report.reportedBy,
                _id: report.reportedBy._id.toString()
            } : null,
            handledBy: report.handledBy ? {
                ...report.handledBy,
                _id: report.handledBy._id.toString()
            } : null
        }));
        
        // Calculate counts for dashboard stats
        const pendingCount = reportsWithStringIds.filter(r => 
            r.status === 'pending' || r.status === 'escalated'
        ).length;
        const resolvedCount = reportsWithStringIds.filter(r => 
            r.status === 'resolved' || r.status === 'dismissed'
        ).length;
        
        res.render('manager-reports', { 
            user: currentUser,
            reports: reportsWithStringIds,
            pendingCount: pendingCount,
            resolvedCount: resolvedCount
        });
    } catch (error) {


        res.status(500).render('error', { 
            message: 'Failed to load reports: ' + error.message,
            user: req.currentUser 
        });
    }
});

// Handle a report (manager action)
app.post('/manager/reports/:reportId/handle', requireAuth, requireRole(['manager', 'administrator']), async (req, res) => {
    try {

        
        const reportId = req.params.reportId;
        const { action, notes, hours } = req.body;
        
        if (!action || !notes) {

            return res.status(400).json({ error: 'Action and notes are required' });
        }
        
        const report = await Report.findById(reportId).populate('post');
        if (!report) {

            return res.status(404).json({ error: 'Report not found' });
        }
        
        if (!report.post) {

            return res.status(404).json({ error: 'Post associated with report not found' });
        }
        
        const managerId = req.session.userId;
        const manager = await User.findById(managerId);
        const postAuthorId = report.post.user;
        
        // Check if manager has permission for this post's tag
        if (manager.role === 'manager') {
            const postTag = report.post.postTag;
            if (!manager.managedTags || !manager.managedTags.includes(postTag)) {

                return res.status(403).json({ error: 'You do not have permission to moderate this post' });
            }
        }
        

        
        // Perform action based on type
        switch(action) {
            case 'hide_post':
                // Hide the post
                const hideReason = notes || 'Violates community guidelines';
                await Post.findByIdAndUpdate(report.post._id, {
                    isHidden: true,
                    hiddenReason: hideReason,
                    hiddenBy: managerId,
                    hiddenAt: new Date()
                });
                
                // Log moderation action
                await PostModeration.create({
                    post: report.post._id,
                    moderatedBy: managerId,
                    action: 'hidden',
                    reason: notes
                });
                
                // Update report status
                await Report.findByIdAndUpdate(reportId, {
                    status: 'resolved',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'HIDE_POST', `Hid post ${report.post._id}. Reason: "${hideReason}". Changed isHidden: false Ã¢â€ â€™ true`, getClientIp(req));
                break;
                
            case 'delete_post':
                // Soft delete the post (mark as deleted, don't remove from DB)
                await Post.findByIdAndUpdate(report.post._id, {
                    isDeleted: true,
                    deletedBy: managerId,
                    deletedAt: new Date(),
                    deletionReason: notes || 'Removed by moderator'
                });
                
                // Log moderation action
                await PostModeration.create({
                    post: report.post._id,
                    moderatedBy: managerId,
                    action: 'deleted',
                    reason: notes
                });
                
                // Update report status
                await Report.findByIdAndUpdate(reportId, {
                    status: 'resolved',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'DELETE_POST', `Deleted post ${report.post._id}`, getClientIp(req));
                break;
                
            case 'warn_user':
                // Issue warning to user
                await UserRestriction.create({
                    user: postAuthorId,
                    restrictedBy: managerId,
                    restrictionType: 'warning',
                    reason: notes || 'Violated community guidelines',
                    isActive: true
                });
                
                // Update report
                await Report.findByIdAndUpdate(reportId, {
                    status: 'resolved',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'WARN_USER', `Issued warning to user ${postAuthorId}`, getClientIp(req));
                break;
                
            case 'restrict_user':
                // Restrict user for specified hours (default 48, max 48 for managers)
                const restrictHours = parseInt(hours) || 48;
                const maxHours = 48;
                const finalHours = Math.min(restrictHours, maxHours);
                
                const restrictionEnd = new Date();
                restrictionEnd.setHours(restrictionEnd.getHours() + finalHours);
                
                await UserRestriction.create({
                    user: postAuthorId,
                    restrictedBy: managerId,
                    restrictionType: 'temporary_ban',
                    reason: notes || 'Violated community guidelines',
                    startDate: new Date(),
                    endDate: restrictionEnd,
                    isActive: true
                });
                
                // Update report
                await Report.findByIdAndUpdate(reportId, {
                    status: 'resolved',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'RESTRICT_USER', `Restricted user ${postAuthorId} for ${finalHours} hours. Reason: "${notes}". End date: ${restrictionEnd.toISOString()}`, getClientIp(req));
                break;
                
            case 'dismiss':
                // Just dismiss the report
                await Report.findByIdAndUpdate(reportId, {
                    status: 'dismissed',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'DISMISS_REPORT', `Dismissed report ${reportId}`, getClientIp(req));
                break;
                
            default:

                return res.status(400).json({ error: 'Invalid action' });
        }
        

        res.json({ success: true, message: 'Report handled successfully' });
        
    } catch (error) {


        res.status(500).json({ error: 'Failed to handle report', details: error.message });
    }
});

// Escalate report to admin
app.post('/manager/reports/:reportId/escalate', requireAuth, requireRole(['manager', 'administrator']), async (req, res) => {
    try {
        const reportId = req.params.reportId;
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ error: 'Reason for escalation is required' });
        }
        
        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Update report status to escalated
        await Report.findByIdAndUpdate(reportId, {
            status: 'escalated',
            escalationReason: reason,
            escalatedBy: req.session.userId,
            escalatedAt: new Date()
        });
        
        await logModerationAction(req.session.userId, 'ESCALATE_REPORT', 
            `Escalated report ${reportId} to admin. Reason: "${reason}"`, getClientIp(req));
        
        res.json({ success: true, message: 'Report escalated to administrator' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to escalate report' });
    }
});

// ============================================
// ADMIN ROUTES - User Management
// ============================================

// Permanently ban user (admin only)
app.post('/admin/users/:userId/ban', requireAuth, requireRole('administrator'), async (req, res) => {
    try {

        
        const userId = req.params.userId;
        const { reason } = req.body;
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {

            return res.status(404).json({ error: 'User not found' });
        }
        

        
        // Create permanent restriction
        await UserRestriction.create({
            user: userId,
            restrictedBy: req.session.userId,
            restrictionType: 'permanent_ban',
            reason: reason || 'Violated community guidelines',
            startDate: new Date(),
            endDate: null, // null = permanent
            isActive: true
        });
        
        await logModerationAction(req.session.userId, 'PERMANENT_BAN', 
            `Permanently banned user ${userId}. Reason: "${reason || 'Violated community guidelines'}". Restriction type: permanent_ban, isActive: false Ã¢â€ â€™ true`);
        

        res.json({ success: true, message: 'User permanently banned' });
        
    } catch (error) {


        res.status(500).json({ error: 'Failed to ban user', details: error.message });
    }
});

// Unban user (admin only)
app.post('/admin/users/:userId/unban', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Deactivate all active restrictions for this user
        await UserRestriction.updateMany(
            { user: userId, isActive: true },
            { isActive: false }
        );
        
        await logModerationAction(req.session.userId, 'UNBAN_USER', 
            `Unbanned user ${userId}. Changed isActive: true Ã¢â€ â€™ false`);
        
        res.json({ success: true, message: 'User unbanned successfully' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to unban user' });
    }
});

// Temporary restrict user (manager - max 48 hours)
app.post('/manager/users/:userId/restrict', requireAuth, requireRole(['manager', 'administrator']), async (req, res) => {
    try {

        
        const userId = req.params.userId;
        const { hours, reason } = req.body;
        
        if (!hours || !reason) {

            return res.status(400).json({ error: 'Hours and reason are required' });
        }
        
        const hoursNum = parseInt(hours);
        if (isNaN(hoursNum) || hoursNum <= 0) {

            return res.status(400).json({ error: 'Invalid hours value' });
        }
        
        // Manager restriction limit: max 48 hours
        if (hoursNum > 48) {

            return res.status(400).json({ error: 'Managers can only restrict users for up to 48 hours' });
        }
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {

            return res.status(404).json({ error: 'User not found' });
        }
        
        // Calculate end date based on hours
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + hoursNum);
        

        
        // Create temporary restriction
        await UserRestriction.create({
            user: userId,
            restrictedBy: req.session.userId,
            restrictionType: 'temporary_ban',
            reason: reason || 'Temporary restriction',
            startDate: new Date(),
            endDate: endDate,
            isActive: true
        });
        
        await logModerationAction(req.session.userId, 'RESTRICT_USER', 
            `Manager temporarily restricted user ${userId}. Duration: ${hoursNum} hours. Reason: "${reason || 'Temporary restriction'}". End date: ${endDate.toISOString()}. isActive: false Ã¢â€ â€™ true`);
        

        res.json({ success: true, message: 'User restricted successfully' });
        
    } catch (error) {


        res.status(500).json({ error: 'Failed to restrict user', details: error.message });
    }
});

// Temporary restrict user (admin only)
app.post('/admin/users/:userId/restrict', requireAuth, requireRole('administrator'), async (req, res) => {
    try {

        
        const userId = req.params.userId;
        const { hours, reason } = req.body;
        
        if (!hours || !reason) {

            return res.status(400).json({ error: 'Hours and reason are required' });
        }
        
        const hoursNum = parseInt(hours);
        if (isNaN(hoursNum) || hoursNum <= 0) {

            return res.status(400).json({ error: 'Invalid hours value' });
        }
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {

            return res.status(404).json({ error: 'User not found' });
        }
        
        // Calculate end date based on hours
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + hoursNum);
        

        
        // Create temporary restriction
        await UserRestriction.create({
            user: userId,
            restrictedBy: req.session.userId,
            restrictionType: 'temporary_ban',
            reason: reason || 'Temporary restriction',
            startDate: new Date(),
            endDate: endDate,
            isActive: true
        });
        
        await logModerationAction(req.session.userId, 'RESTRICT_USER', 
            `Temporarily restricted user ${userId}. Duration: ${hoursNum} hours. Reason: "${reason || 'Temporary restriction'}". End date: ${endDate.toISOString()}. isActive: false Ã¢â€ â€™ true`);
        

        res.json({ success: true, message: 'User restricted successfully' });
        
    } catch (error) {


        res.status(500).json({ error: 'Failed to restrict user', details: error.message });
    }
});

// Create manager account (admin only)
app.post('/admin/create-manager', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const { username, password, userTag, managedTags } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Create new manager account
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username: username,
            userTag: userTag,
            password: hashedPassword,
            role: 'manager',
            managedTags: managedTags || []
        });
        
        await logModerationAction(req.session.userId, 'CREATE_MANAGER', `Created manager account: ${username}`, getClientIp(req));
        
        res.json({ success: true, message: 'Manager account created successfully' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to create manager account' });
    }
});

// Create administrator account (admin only)
app.post('/admin/create-admin', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const { username, password, userTag } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Create new administrator account
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username: username,
            userTag: userTag,
            password: hashedPassword,
            role: 'administrator'
        });
        
        await logModerationAction(req.session.userId, 'CREATE_ADMIN', `Created administrator account: ${username}`, getClientIp(req));
        
        res.json({ success: true, message: 'Administrator account created successfully' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to create administrator account' });
    }
});

// Change user role (admin only)
app.post('/admin/users/:userId/role', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { role } = req.body;
        
        await User.findByIdAndUpdate(userId, { role });
        
        await logModerationAction(req.session.userId, 'CHANGE_ROLE', `Changed user ${userId} role to ${role}`, getClientIp(req));
        
        res.json({ success: true, message: 'User role updated successfully' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to change user role' });
    }
});

// Delete user (admin only)
app.delete('/admin/users/:userId', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const userId = req.params.userId;
        
        // Prevent deleting yourself
        if (userId === req.session.userId.toString()) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        
        await User.findByIdAndDelete(userId);
        
        await logModerationAction(req.session.userId, 'DELETE_USER', `Deleted user account ${userId}`, getClientIp(req));
        
        res.json({ success: true, message: 'User deleted successfully' });
        
    } catch (error) {

        res.status(500).json({ error: 'Failed to delete user' });
    }
});

}; // End of module.exports function