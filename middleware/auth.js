const { User, ActivityLog } = require('../database');
const bcrypt = require('bcrypt');

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

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
            // 2.4.6 - Log access control failure
            logActivity(user._id, 'ACCESS_DENIED', 'ADMIN_PAGE', req.path, 
                       `User ${user.username} (${user.role}) attempted to access admin page`, 
                       getClientIp(req));
            
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
            // 2.4.6 - Log access control failure
            logActivity(user._id, 'ACCESS_DENIED', 'MANAGER_PAGE', req.path, 
                       `User ${user.username} (${user.role}) attempted to access manager page`, 
                       getClientIp(req));
            
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

// ============================================
// PASSWORD VALIDATION (2.1.4 & 2.1.5)
// ============================================

function validatePassword(password) {
    const errors = [];
    
    // 2.1.5 - Length requirement (minimum 8 characters)
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    
    if (password.length > 128) {
        errors.push('Password must not exceed 128 characters');
    }
    
    // 2.1.4 - Complexity requirements
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    if (!hasUppercase) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!hasLowercase) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!hasNumber) {
        errors.push('Password must contain at least one number');
    }
    if (!hasSpecial) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// ============================================
// ACCOUNT LOCKOUT (2.1.7)
// ============================================

async function isAccountLocked(user) {
    if (user.accountLockedUntil && user.accountLockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.accountLockedUntil - new Date()) / 60000);
        return {
            locked: true,
            message: `Account is locked. Please try again in ${minutesLeft} minute(s).`
        };
    }
    return { locked: false };
}

async function handleFailedLogin(user) {
    user.failedLoginAttempts += 1;
    
    // Lock account after 5 failed attempts for 15 minutes
    if (user.failedLoginAttempts >= 5) {
        user.accountLockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        await user.save();
        return {
            locked: true,
            message: 'Account has been locked due to multiple failed login attempts. Please try again in 15 minutes.'
        };
    }
    
    await user.save();
    return { locked: false };
}

async function handleSuccessfulLogin(user) {
    // 2.1.11 - Track previous login
    user.previousLogin = user.lastLogin;
    user.lastLogin = new Date();
    user.failedLoginAttempts = 0;
    user.accountLockedUntil = null;
    await user.save();
}

// ============================================
// PASSWORD REUSE PREVENTION (2.1.9)
// ============================================

async function isPasswordReused(user, newPassword) {
    if (!user.passwordHistory || user.passwordHistory.length === 0) {
        return false;
    }
    
    // Check against last 5 passwords
    for (let oldPass of user.passwordHistory) {
        if (await bcrypt.compare(newPassword, oldPass.password)) {
            return true;
        }
    }
    
    return false;
}

async function updatePasswordHistory(user, newHashedPassword) {
    // Add current password to history
    if (!user.passwordHistory) {
        user.passwordHistory = [];
    }
    
    user.passwordHistory.push({
        password: user.password, // Old password
        changedAt: new Date()
    });
    
    // Keep only last 5 passwords
    if (user.passwordHistory.length > 5) {
        user.passwordHistory = user.passwordHistory.slice(-5);
    }
    
    // Update to new password
    user.password = newHashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();
}

// ============================================
// PASSWORD AGE REQUIREMENT (2.1.10)
// ============================================

function canChangePassword(user) {
    if (!user.passwordChangedAt) {
        return { allowed: true }; // First time changing password
    }
    
    const daysSinceChange = (new Date() - user.passwordChangedAt) / (1000 * 60 * 60 * 24);
    
    if (daysSinceChange < 1) {
        return {
            allowed: false,
            message: 'Password can only be changed once per day. Please try again tomorrow.'
        };
    }
    
    return { allowed: true };
}

// ============================================
// SECURITY QUESTIONS (2.1.8)
// ============================================

function validateSecurityQuestion(question, answer) {
    const weakAnswers = [
        'the bible', 'bible', 'jesus', 'god', 
        'pizza', 'blue', 'red', 'black', 'white',
        'mom', 'dad', 'mother', 'father',
        '123', 'password', 'admin'
    ];
    
    const answerLower = answer.toLowerCase().trim();
    
    if (weakAnswers.includes(answerLower)) {
        return {
            valid: false,
            message: 'Security answer is too common. Please choose a more unique answer.'
        };
    }
    
    if (answerLower.length < 3) {
        return {
            valid: false,
            message: 'Security answer must be at least 3 characters long.'
        };
    }
    
    return { valid: true };
}

// ============================================
// AUTHORIZATION - ENHANCED (2.2.1, 2.2.2, 2.2.3)
// ============================================

// 2.2.1 - Single site-wide access control component
async function checkAccess(req, requiredRole, resourceType = null, resourceId = null) {
    try {
        // Must be authenticated first
        if (!req.session.userId) {
            await logActivity(null, 'ACCESS_DENIED', resourceType || 'PAGE', resourceId || req.path, 
                            'Unauthenticated access attempt', getClientIp(req));
            return {
                allowed: false,
                reason: 'NOT_AUTHENTICATED',
                message: 'You must be logged in to access this resource'
            };
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return {
                allowed: false,
                reason: 'USER_NOT_FOUND',
                message: 'User account not found'
            };
        }

        // Check role-based access
        if (requiredRole) {
            const hasRole = checkRole(user.role, requiredRole);
            if (!hasRole) {
                // 2.4.6 - Log access control failure
                await logActivity(user._id, 'ACCESS_DENIED', resourceType || 'PAGE', 
                                resourceId || req.path, 
                                `User role '${user.role}' attempted to access '${requiredRole}' resource`, 
                                getClientIp(req));
                
                return {
                    allowed: false,
                    reason: 'INSUFFICIENT_ROLE',
                    message: `Access denied. Required role: ${requiredRole}`
                };
            }
        }

        // Additional resource-specific checks
        if (resourceType && resourceId) {
            const canAccess = await checkResourceAccess(user, resourceType, resourceId);
            if (!canAccess) {
                await logActivity(user._id, 'ACCESS_DENIED', resourceType, resourceId, 
                                `Unauthorized access attempt to ${resourceType}`, 
                                getClientIp(req));
                
                return {
                    allowed: false,
                    reason: 'RESOURCE_ACCESS_DENIED',
                    message: 'You do not have permission to access this resource'
                };
            }
        }

        return { allowed: true };

    } catch (error) {
        console.error('Access check error:', error);
        return {
            allowed: false,
            reason: 'SYSTEM_ERROR',
            message: 'An error occurred while checking permissions'
        };
    }
}

// Helper: Check if user role meets requirement
function checkRole(userRole, requiredRole) {
    const roleHierarchy = {
        'administrator': 3,
        'manager': 2,
        'user': 1
    };

    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

// Helper: Check resource-specific access
async function checkResourceAccess(user, resourceType, resourceId) {
    try {
        switch (resourceType) {
            case 'POST':
                return await canAccessPost(user, resourceId);
            case 'COMMENT':
                return await canAccessComment(user, resourceId);
            case 'USER':
                return await canAccessUser(user, resourceId);
            default:
                return true;
        }
    } catch (error) {
        console.error('Resource access check error:', error);
        return false;
    }
}

// Resource-specific access checks
async function canAccessPost(user, postId) {
    const Post = require('../database').Post;
    const post = await Post.findById(postId);
    if (!post) return false;

    // Admin can access all
    if (user.role === 'administrator') return true;

    // Manager can access posts in their scope
    if (user.role === 'manager') {
        return user.managedTags.includes(post.postTag);
    }

    // Users can only access their own posts (for editing/deleting)
    return post.user.toString() === user._id.toString();
}

async function canAccessComment(user, commentId) {
    // Admin can access all
    if (user.role === 'administrator') return true;

    // For now, all authenticated users can access comments
    return true;
}

async function canAccessUser(user, userId) {
    // Admin can access all users
    if (user.role === 'administrator') return true;

    // Users can only access their own profile
    return user._id.toString() === userId.toString();
}

// 2.2.2 - Enhanced middleware with secure error handling
function isAuthenticatedEnhanced(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    
    // 2.4.6 - Log access control failure
    logActivity(null, 'ACCESS_DENIED', 'PAGE', req.path, 
               'Unauthenticated access attempt', getClientIp(req));
    
    // 2.2.2 - Fail securely with error message
    res.status(401).render('error', {
        message: 'Authentication Required',
        detail: 'You must be logged in to access this page.',
        returnUrl: '/login'
    });
}

function isAdministratorEnhanced(req, res, next) {
    if (!req.session.userId) {
        logActivity(null, 'ACCESS_DENIED', 'ADMIN_PAGE', req.path, 
                   'Unauthenticated admin access attempt', getClientIp(req));
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
            
            // 2.4.6 - Log access control failure
            logActivity(user._id, 'ACCESS_DENIED', 'ADMIN_PAGE', req.path, 
                       `User with role '${user.role}' attempted to access admin page`, 
                       getClientIp(req));
            
            // 2.2.2 - Fail securely with clear error
            res.status(403).render('error', { 
                message: 'Access Denied',
                detail: 'You do not have administrator privileges to access this page.',
                returnUrl: '/home'
            });
        })
        .catch(err => {
            console.error('Auth error:', err);
            res.status(500).render('error', {
                message: 'System Error',
                detail: 'An error occurred while verifying your permissions.',
                returnUrl: '/home'
            });
        });
}

function isManagerEnhanced(req, res, next) {
    if (!req.session.userId) {
        logActivity(null, 'ACCESS_DENIED', 'MANAGER_PAGE', req.path, 
                   'Unauthenticated manager access attempt', getClientIp(req));
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
            
            // 2.4.6 - Log access control failure
            logActivity(user._id, 'ACCESS_DENIED', 'MANAGER_PAGE', req.path, 
                       `User with role '${user.role}' attempted to access manager page`, 
                       getClientIp(req));
            
            // 2.2.2 - Fail securely
            res.status(403).render('error', { 
                message: 'Access Denied',
                detail: 'You need manager or administrator privileges to access this page.',
                returnUrl: '/home'
            });
        })
        .catch(err => {
            console.error('Auth error:', err);
            res.status(500).render('error', {
                message: 'System Error',
                detail: 'An error occurred while verifying your permissions.',
                returnUrl: '/home'
            });
        });
}

// 2.2.3 - Enforce business rules using RBAC
function requirePermission(resourceType, action = 'read') {
    return async (req, res, next) => {
        try {
            if (!req.session.userId) {
                await logActivity(null, 'ACCESS_DENIED', resourceType, req.params.id || req.path, 
                                `Unauthenticated ${action} attempt on ${resourceType}`, 
                                getClientIp(req));
                return res.status(401).json({ 
                    success: false, 
                    error: 'Authentication required' 
                });
            }

            const user = await User.findById(req.session.userId);
            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }

            const resourceId = req.params.postId || req.params.commentId || req.params.userId;
            const hasAccess = await checkResourcePermission(user, resourceType, resourceId, action);

            if (!hasAccess) {
                await logActivity(user._id, 'ACCESS_DENIED', resourceType, resourceId, 
                                `Unauthorized ${action} attempt by ${user.role}`, 
                                getClientIp(req));
                
                return res.status(403).json({ 
                    success: false, 
                    error: 'You do not have permission to perform this action' 
                });
            }

            req.user = user;
            next();

        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'An error occurred while checking permissions' 
            });
        }
    };
}

async function checkResourcePermission(user, resourceType, resourceId, action) {
    // Admin can do everything
    if (user.role === 'administrator') return true;

    switch (resourceType) {
        case 'POST':
            return await checkPostPermission(user, resourceId, action);
        case 'COMMENT':
            return await checkCommentPermission(user, resourceId, action);
        case 'USER':
            return await checkUserPermission(user, resourceId, action);
        default:
            return false;
    }
}

async function checkPostPermission(user, postId, action) {
    const Post = require('../database').Post;
    const post = await Post.findById(postId);
    if (!post) return false;

    switch (action) {
        case 'read':
            return true;
        case 'edit':
        case 'delete':
            if (post.user.toString() === user._id.toString()) return true;
            if (user.role === 'manager') {
                return user.managedTags.includes(post.postTag);
            }
            return false;
        default:
            return false;
    }
}

async function checkCommentPermission(user, commentId, action) {
    switch (action) {
        case 'read':
            return true;
        case 'edit':
        case 'delete':
            return true; // Simplified
        default:
            return false;
    }
}

async function checkUserPermission(user, userId, action) {
    switch (action) {
        case 'read':
            return true;
        case 'edit':
            return user._id.toString() === userId;
        default:
            return false;
    }
}

// ============================================
// EXISTING AUTHORIZATION FUNCTIONS
// ============================================

async function canModeratePost(userId, postId) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        if (user.role === 'administrator') return true;
        if (user.role === 'user') return false;
        
        if (user.role === 'manager') {
            const Post = require('../database').Post;
            const post = await Post.findById(postId);
            if (!post) return false;
            return user.managedTags.includes(post.postTag);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking moderation permission:', err);
        return false;
    }
}

async function canModerateTag(userId, tag) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        if (user.role === 'administrator') return true;
        
        if (user.role === 'manager') {
            return user.managedTags.includes(tag);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking tag moderation permission:', err);
        return false;
    }
}

async function canEditOrDelete(userId, resourceOwnerId, postId = null) {
    try {
        const user = await User.findById(userId);
        if (!user) return false;
        
        if (userId.toString() === resourceOwnerId.toString()) return true;
        if (user.role === 'administrator') return true;
        
        if (user.role === 'manager' && postId) {
            return await canModeratePost(userId, postId);
        }
        
        return false;
    } catch (err) {
        console.error('Error checking edit/delete permission:', err);
        return false;
    }
}

// ============================================
// ACTIVITY LOGGING
// ============================================

async function logActivity(userId, action, targetType = '', targetId = '', details = '', ipAddress = '') {
    try {
        let username = 'Unknown';
        if (userId) {
            const user = await User.findById(userId);
            if (user) {
                username = user.username;
            }
        } else if (targetId) {
            username = targetId;
        }
        
        const log = new ActivityLog({
            user: userId,
            username: username,
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

// ============================================
// UTILITY FUNCTIONS
// ============================================

const attachUserInfo = async (req, res, next) => {
    if (req.session && req.session.userId) {
        try {
            const user = await User.findById(req.session.userId).select('-password');
            req.user = user;
            res.locals.currentUser = user;
            
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

function getClientIp(req) {
    return req.headers['x-forwarded-for'] || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           req.connection.socket?.remoteAddress ||
           'unknown';
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
    // Basic middleware
    isAuthenticated,
    isAdministrator,
    isManager,
    attachUserInfo,
    
    // Enhanced middleware (2.2.2)
    isAuthenticatedEnhanced,
    isAdministratorEnhanced,
    isManagerEnhanced,
    
    // Password validation (2.1.4, 2.1.5)
    validatePassword,
    
    // Account lockout (2.1.7)
    isAccountLocked,
    handleFailedLogin,
    handleSuccessfulLogin,
    
    // Password reuse prevention (2.1.9)
    isPasswordReused,
    updatePasswordHistory,
    
    // Password age (2.1.10)
    canChangePassword,
    
    // Security questions (2.1.8)
    validateSecurityQuestion,
    
    // Authorization - Single component (2.2.1)
    checkAccess,
    requirePermission,
    checkResourcePermission,
    
    // Existing authorization
    canModeratePost,
    canModerateTag,
    canEditOrDelete,
    
    // Logging (2.4.5, 2.4.6)
    logActivity,
    getClientIp
};