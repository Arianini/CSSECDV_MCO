// ============================================
// MODERATION ROUTES MODULE
// ============================================

const { Report, UserRestriction, PostModeration } = require('./moderation-schemas');
const { User, Post, ActivityLog } = require('./database');

// Helper function for logging
async function logModerationAction(userId, action, details) {
    try {
        const user = await User.findById(userId);
        await ActivityLog.create({
            user: userId,
            username: user.username,
            action: action,
            targetType: 'MODERATION',
            details: details,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error logging action:', error);
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
            console.error('Error in requireRole:', error);
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
        
        console.log('Report submission attempt:', { postId, reason, description, userId });
        
        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            console.log('Post not found:', postId);
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Check if user already reported this post
        const existingReport = await Report.findOne({ 
            post: postId, 
            reportedBy: userId 
        });
        
        if (existingReport) {
            console.log('Duplicate report attempt');
            return res.json({ error: 'You have already reported this post' });
        }
        
        // Create report
        const newReport = await Report.create({
            post: postId,
            reportedBy: userId,
            reason: reason,
            description: description
        });
        
        console.log('Report created successfully:', newReport._id);
        
        // Log the report
        await logModerationAction(userId, 'USER_REPORT', `Reported post ${postId} for: ${reason}`);
        
        res.json({ success: true, message: 'Report submitted successfully' });
        
    } catch (error) {
        console.error('Error reporting post:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to submit report', details: error.message });
    }
});

// ============================================
// MANAGER ROUTES - Handle Reports
// ============================================

// View all reports (pending first)
app.get('/manager/reports', requireAuth, requireRole(['manager', 'administrator']), async (req, res) => {
    try {
        console.log('Manager reports route hit');
        console.log('User from middleware:', req.currentUser);
        
        const reports = await Report.find()
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
            });
        
        console.log(`Found ${reports.length} reports`);
        
        res.render('manager-reports', { 
            user: req.currentUser,
            reports: reports 
        });
        
    } catch (error) {
        console.error('Error fetching reports:', error);
        console.error('Error stack:', error.stack);
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
        const { action, notes } = req.body;
        
        const report = await Report.findById(reportId).populate('post');
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        const managerId = req.session.userId;
        const postAuthorId = report.post.user;
        
        // Perform action based on type
        switch(action) {
            case 'hide_post':
                // Hide the post
                await Post.findByIdAndUpdate(report.post._id, {
                    isHidden: true,
                    hiddenReason: notes || 'Violates community guidelines'
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
                
                await logModerationAction(managerId, 'HIDE_POST', `Hid post ${report.post._id}`);
                break;
                
            case 'delete_post':
                // Delete the post
                await Post.findByIdAndDelete(report.post._id);
                
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
                
                await logModerationAction(managerId, 'DELETE_POST', `Deleted post ${report.post._id}`);
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
                
                await logModerationAction(managerId, 'WARN_USER', `Warned user ${postAuthorId}`);
                break;
                
            case 'restrict_user':
                // Restrict user for 48 hours
                const restrictionEnd = new Date();
                restrictionEnd.setHours(restrictionEnd.getHours() + 48);
                
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
                
                await logModerationAction(managerId, 'RESTRICT_USER', `Restricted user ${postAuthorId} for 48 hours`);
                break;
                
            case 'dismiss':
                // Just dismiss the report
                await Report.findByIdAndUpdate(reportId, {
                    status: 'dismissed',
                    handledBy: managerId,
                    adminNotes: notes,
                    resolvedAt: new Date()
                });
                
                await logModerationAction(managerId, 'DISMISS_REPORT', `Dismissed report ${reportId}`);
                break;
                
            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
        
        res.json({ success: true, message: 'Report handled successfully' });
        
    } catch (error) {
        console.error('Error handling report:', error);
        res.status(500).json({ error: 'Failed to handle report' });
    }
});

// Escalate report to admin (manager only)
app.post('/manager/reports/:reportId/escalate', requireAuth, requireRole('manager'), async (req, res) => {
    try {
        const reportId = req.params.reportId;
        const { reason } = req.body;
        
        const report = await Report.findById(reportId);
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Update report to escalated status
        await Report.findByIdAndUpdate(reportId, {
            status: 'escalated',
            adminNotes: `Escalated by manager: ${reason}`
        });
        
        await logModerationAction(req.session.userId, 'ESCALATE_REPORT', `Escalated report ${reportId} to admin`);
        
        res.json({ success: true, message: 'Report escalated to administrator' });
        
    } catch (error) {
        console.error('Error escalating report:', error);
        res.status(500).json({ error: 'Failed to escalate report' });
    }
});

// ============================================
// ADMIN ROUTES - User Management
// ============================================

// Get admin user management page
app.get('/admin/users', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const users = await User.find().select('-password -passwordHistory -securityAnswer');
        
        res.render('admin-users', {
            user: req.currentUser,
            users: users
        });
        
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('error', {
            message: 'Failed to load users',
            user: req.currentUser
        });
    }
});

// Permanent ban (admin only)
app.post('/admin/users/:userId/ban', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { reason } = req.body;
        
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
        
        await logModerationAction(req.session.userId, 'PERMANENT_BAN', `Permanently banned user ${userId}`);
        
        res.json({ success: true, message: 'User permanently banned' });
        
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ error: 'Failed to ban user' });
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
        
        await logModerationAction(req.session.userId, 'UNBAN_USER', `Unbanned user ${userId}`);
        
        res.json({ success: true, message: 'User unbanned successfully' });
        
    } catch (error) {
        console.error('Error unbanning user:', error);
        res.status(500).json({ error: 'Failed to unban user' });
    }
});

// Create manager account (admin only)
app.post('/admin/create-manager', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const { username, password, managedTags } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Create new manager account
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({
            username: username,
            password: hashedPassword,
            role: 'manager',
            managedTags: managedTags || []
        });
        
        await logModerationAction(req.session.userId, 'CREATE_MANAGER', `Created manager account: ${username}`);
        
        res.json({ success: true, message: 'Manager account created successfully' });
        
    } catch (error) {
        console.error('Error creating manager:', error);
        res.status(500).json({ error: 'Failed to create manager account' });
    }
});

// Change user role (admin only)
app.post('/admin/users/:userId/role', requireAuth, requireRole('administrator'), async (req, res) => {
    try {
        const userId = req.params.userId;
        const { role } = req.body;
        
        await User.findByIdAndUpdate(userId, { role });
        
        await logModerationAction(req.session.userId, 'CHANGE_ROLE', `Changed user ${userId} role to ${role}`);
        
        res.json({ success: true, message: 'User role updated successfully' });
        
    } catch (error) {
        console.error('Error changing role:', error);
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
        
        await logModerationAction(req.session.userId, 'DELETE_USER', `Deleted user account ${userId}`);
        
        res.json({ success: true, message: 'User deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

}; // End of module.exports function