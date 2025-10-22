const { User, ActivityLog } = require('../database');

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/login');
}

// Middleware to check if user is an administrator
function isAdministrator(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    
    User.findById(req.session.userId)
        .then(user => {
            if (!user) {
                return res.redirect('/login');
            }
            if (user.role === 'administrator') {
                return next();
            }
            res.status(403).render('error', { 
                message: 'Access Denied',
                detail: 'You do not have administrator privileges to access this page.' 
            });
        })
        .catch(err => {
            console.error('Auth error:', err);
            res.status(500).send('Internal Server Error');
        });
}

// Middleware to check if user is a Manager (Moderator)
function isManager(req, res, next) {
    if (!req.session.userId) {
        return res.redirect('/login');
    }
    
    User.findById(req.session.userId)
        .then(user => {
            if (!user) {
                return res.redirect('/login');
            }
            if (user.role === 'manager' || user.role === 'administrator') {
                return next();
            }
            res.status(403).render('error', { 
                message: 'Access Denied',
                detail: 'You need manager or administrator privileges to access this page.' 
            });
        })
        .catch(err => {
            console.error('Auth error:', err);
            res.status(500).send('Internal Server Error');
        });
}

// Check if user can moderate a specific post (based on tag)
async function canModeratePost(userId, postId) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        // Admins can moderate everything
        if (user.role === 'administrator') return true;
        
        // Regular users cannot moderate others' content
        if (user.role === 'user') return false;
        
        // Managers can only moderate posts with tags in their scope
        if (user.role === 'manager') {
            const Post = require('../database').Post;
            const post = await Post.findById(postId);
            if (!post) return false;
            
            // Check if post's tag is in manager's managed tags
            return user.managedTags.includes(post.postTag);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking moderation permission:', err);
        return false;
    }
}

// Check if user can moderate a specific tag
async function canModerateTag(userId, tag) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        // Admins can moderate everything
        if (user.role === 'administrator') return true;
        
        // Managers can only moderate their assigned tags
        if (user.role === 'manager') {
            return user.managedTags.includes(tag);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking tag moderation permission:', err);
        return false;
    }
}

// Check if user owns a resource or can moderate it
async function canEditOrDelete(userId, resourceOwnerId, postId = null) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        // Owner can always edit their own content
        if (userId.toString() === resourceOwnerId.toString()) return true;
        
        // Admin can edit/delete anything
        if (user.role === 'administrator') return true;
        
        // Manager can edit/delete if post is in their scope
        if (user.role === 'manager' && postId) {
            return await canModeratePost(userId, postId);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking edit/delete permission:', err);
        return false;
    }
}

// Log user activity
async function logActivity(userId, action, targetType = '', targetId = '', details = '', ipAddress = '') {
    try {
        const user = await User.findById(userId);
        if (!user) return;
        
        const log = new ActivityLog({
            user: userId,
            username: user.username,
            action,
            targetType,
            targetId,
            details,
            ipAddress
        });
        await log.save();
    } catch (err) {
        console.error('Error logging activity:', err);
    }
}

// Middleware to attach user info to all requests
const attachUserInfo = async (req, res, next) => {
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId).select('-password');
            req.user = user;
            res.locals.currentUser = user;
            
            // Add switch status to locals
            if (req.session.isSwitched) {
                res.locals.isSwitched = true;
                res.locals.originalAdminId = req.session.originalAdminId;
            }
        } catch (err) {
            console.error('Error fetching user:', err);
        }
    }
    next();
};

// Get client IP address
function getClientIp(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket?.remoteAddress ||
           'unknown';
}

module.exports = {
    isAuthenticated,
    isAdministrator,
    isManager,
    canModeratePost,
    canModerateTag,
    canEditOrDelete,
    logActivity,
    attachUserInfo,
    getClientIp
};