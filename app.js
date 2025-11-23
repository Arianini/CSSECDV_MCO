require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { engine } = require('express-handlebars');
const moment = require('moment');
const multer = require('multer');
const mongoose = require('mongoose');
const util = require('util');

// Import database models
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
// Import authentication middleware

const { 
    isAuthenticated, 
    isAdministrator, 
    isManager,
    canModeratePost,
    canModerateTag,
    canEditOrDelete,
    logActivity,
    attachUserInfo,
    getClientIp,
    // Authentication
    validatePassword,
    isAccountLocked,
    handleFailedLogin,
    handleSuccessfulLogin,
    isPasswordReused,
    updatePasswordHistory,
    canChangePassword,
    validateSecurityQuestion,
    // Authorization
    checkAccess,
    isAuthenticatedEnhanced,
    isAdministratorEnhanced,
    isManagerEnhanced,
    requirePermission
} = require('./middleware/auth');

const { 
    validateRequest,
    validateQuery,
    validateParams,
    validateText,
    validateNumeric,
    validateFile,
    validateObjectId
} = require('./middleware/validation');

const ALLOWED_TAGS = [
    'Food',
    'Coffee', 
    'Baking',
    'Travel',
    'Gaming',
    'Technology',
    'Sports',
    'Music',
    'Art',
    'General'
];
const server = express();

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: "./public/uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Middleware
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Attach user info to all requests (must be after session middleware)
server.use(attachUserInfo);

// View Engine with Handlebars helpers
server.engine('hbs', engine({
    extname: '.hbs',
    layoutsDir: path.join(__dirname, 'views', 'partials', 'layouts'),  
    partialsDir: path.join(__dirname, 'views', 'partials'),  
    defaultLayout: 'main', 
    helpers: {
        eq: function (a, b, options) {
            if (typeof options === 'object' && typeof options.fn === 'function') {
                return a === b ? options.fn(this) : options.inverse(this);
            }
            return a === b;
        },
        
        includes: function (array, value, options) {
            if (!array) return options.inverse(this);
            for (let i = 0; i < array.length; i++) {
                if (typeof array[i] === 'object' && array[i]._id) {
                    if (array[i]._id.toString() === value.toString()) {
                        return options.fn(this);
                    }
                } else if (array[i].toString() === value.toString()) {
                    return options.fn(this);
                }
            }
            return options.inverse(this);
        },
        
        formatDate: function (date, format) {  
            if (!date) return "Invalid Date"; 
            if (typeof format !== "string") format = "YYYY-MM-DD HH:mm:ss"; 
            return moment(date).format(format); 
        },

        toLowerCase: function (str) {
            if (!str) return '';
            return str.toLowerCase();
        },

        substring: function (str, start, end) {
            if (!str) return '';
            return str.substring(start, end);
        },

        gt: function (a, b) {
            return a > b;
        },

        lt: function (a, b) {
            return a < b;
        },

        add: function (a, b) {
            return parseInt(a) + parseInt(b);
        },

        subtract: function (a, b) {
            return parseInt(a) - parseInt(b);
        },

        range: function (start, end) {
            const result = [];
            for (let i = start; i < end; i++) {
                result.push(i);
            }
            return result;
        },

        isAdmin: function (role, options) {
            return role === 'administrator' ? options.fn(this) : options.inverse(this);
        },

        isManager: function (role, options) {
            return role === 'manager' ? options.fn(this) : options.inverse(this);
        },

        isUser: function (role, options) {
            return role === 'user' ? options.fn(this) : options.inverse(this);
        },

        json: function (context) {
            return JSON.stringify(context, null, 2);
        }
    },    
    
    runtimeOptions: {
        allowProtoPropertiesByDefault: true,  
        allowProtoMethodsByDefault: true     
    }
}));

server.set('view engine', 'hbs');
server.set('views', path.join(__dirname, 'views'));
server.render = util.promisify(server.render);

// Serve Static Files
server.use(express.static(path.join(__dirname, 'public')));

// ============================================
// PUBLIC ROUTES
// ============================================

// Landing page - ROOT ROUTE
server.get('/', (req, res) => {
    if (req.session.userId) {
        // If user is already logged in, redirect to home
        return res.redirect('/home');
    }
    // If not logged in, show landing page
    res.render('landing', { 
        hideHeader: true 
    });
});

// Landing page
server.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login', { 
        hideHeader: true 
    });
});
// Login routes
server.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login');
});

// ============================================
// UPDATED LOGIN ROUTE
// ============================================

server.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Case-insensitive username search
        const user = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });

        // 2.1.3 - Generic error message (don't reveal if username exists)
        if (!user) {
            // Log failed attempt even if user doesn't exist
            await logActivity(null, 'FAILED_LOGIN', 'USER', username, 
                            `Failed login attempt for non-existent user: ${username}`, 
                            getClientIp(req));
            
            return res.status(400).send("Invalid username and/or password");
        }

        // 2.1.7 - Check if account is locked
        const lockStatus = await isAccountLocked(user);
        if (lockStatus.locked) {
            await logActivity(user._id, 'LOCKED_LOGIN_ATTEMPT', 'USER', user._id.toString(), 
                            `Login attempt on locked account`, getClientIp(req));
            return res.status(403).send(lockStatus.message);
        }

        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            // 2.1.7 - Handle failed login
            const lockResult = await handleFailedLogin(user);
            
            // 2.1.5 - Log failed attempt
            await logActivity(user._id, 'FAILED_LOGIN', 'USER', user._id.toString(), 
                            `Failed login attempt (${user.failedLoginAttempts}/5)`, 
                            getClientIp(req));
            
            if (lockResult.locked) {
                return res.status(403).send(lockResult.message);
            }
            
            // 2.1.3 - Generic error message
            return res.status(400).send("Invalid username and/or password");
        }

        // 2.1.7 & 2.1.11 - Successful login
        await handleSuccessfulLogin(user);
        
        req.session.userId = user._id;
        
        // Store previous login time to show user
        req.session.previousLogin = user.previousLogin;
        req.session.showLoginMessage = true;
        
        // 2.1.5 - Log successful login
        await logActivity(user._id, 'LOGIN', 'USER', user._id.toString(), 
                         `User logged in successfully`, getClientIp(req));
        
        res.redirect('/home');
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).send("An error occurred. Please try again later.");
    }
});

// ============================================
// UPDATED REGISTRATION ROUTE
// ============================================

server.get('/register', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('register', { 
        hideHeader: true 
    });
});

server.post('/register', async (req, res) => {
    const { username, password, securityAnswer, securityQuestion } = req.body;

    try {
        // Basic validation
        if (!username || !password || !confirmPassword || !securityQuestion || !securityAnswer) {
            // 2.4.4 - Log input validation failure
            await logActivity(null, 'VALIDATION_FAILED', 'REGISTER', username || 'unknown', 
                            'Registration failed: Missing required fields', getClientIp(req));
            return res.status(400).send("All fields are required including security question and answer");
        }
        
        if (password !== confirmPassword) {
            // 2.4.4 - Log input validation failure
            await logActivity(null, 'VALIDATION_FAILED', 'REGISTER', username, 
                            'Registration failed: Passwords do not match', getClientIp(req));
            return res.status(400).send("Passwords do not match");
        }
        
        // 2.1.4 & 2.1.5 - Validate password complexity and length
        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
            // 2.4.4 - Log input validation failure
            await logActivity(null, 'VALIDATION_FAILED', 'REGISTER', username, 
                            `Registration failed: ${passwordValidation.errors.join(', ')}`, getClientIp(req));
            return res.status(400).send(passwordValidation.errors.join('<br>'));
        }
        
        // Check if username already exists (case-insensitive)
        const existingUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (existingUser) {
            // 2.4.4 - Log input validation failure
            await logActivity(null, 'VALIDATION_FAILED', 'REGISTER', username, 
                            'Registration failed: Username already exists', getClientIp(req));
            return res.status(400).send("Username already exists");
        }
        
        // 2.1.8 - Validate security question (now required)
        const sqValidation = validateSecurityQuestion(securityQuestion, securityAnswer);
        if (!sqValidation.valid) {
            // 2.4.4 - Log input validation failure
            await logActivity(null, 'VALIDATION_FAILED', 'REGISTER', username, 
                            `Registration failed: ${sqValidation.message}`, getClientIp(req));
            return res.status(400).send(sqValidation.message);
        }

        // 2.1.2 - Hash password with bcrypt (10 salt rounds)
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Hash security answer (now always provided)
        const hashedSecurityAnswer = await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10);
        
        // Create new user with all authentication fields
        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            userTag: `u/${username}`,
            role: 'user',
            managedTags: [],
            
            // Authentication fields
            failedLoginAttempts: 0,
            accountLockedUntil: null,
            passwordHistory: [],
            passwordChangedAt: new Date(),
            lastLogin: new Date(),
            previousLogin: null,
            securityQuestion: securityQuestion,
            securityAnswer: hashedSecurityAnswer
        });

        await newUser.save();
        console.log('New user registered:', newUser.username);
        
        req.session.userId = newUser._id;
        
        await logActivity(newUser._id, 'REGISTER', 'USER', newUser._id.toString(), 
                         `New user registered`, getClientIp(req));

        res.redirect('/home');
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send("An error occurred during registration. Please try again.");
    }
});

// ============================================
// FORGOT PASSWORD ROUTES
// ============================================

// Step 1: Show forgot password form
server.get('/forgot-password', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('forgot-password', {
        hideHeader: true
    });
});

// Step 2: Verify username and show security question
server.post('/forgot-password/verify-username', async (req, res) => {
    const { username } = req.body;
    
    try {
        // Case-insensitive username search
        const user = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        
        // Don't reveal if user exists for security, but log the attempt
        if (!user) {
            await logActivity(null, 'FAILED_PASSWORD_RESET', 'USER', username, 
                            `Password reset attempt for non-existent user: ${username}`, 
                            getClientIp(req));
            
            // Show generic error to prevent username enumeration
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'If this username exists and has a security question set up, you will see the question.',
                username: username
            });
        }
        
        // Check if user has security question set up
        if (!user.securityQuestion || !user.securityAnswer) {
            await logActivity(user._id, 'FAILED_PASSWORD_RESET', 'USER', user._id.toString(), 
                            `Password reset failed: No security question set up`, 
                            getClientIp(req));
            
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'This account does not have a security question set up. Please contact an administrator.',
                username: username
            });
        }
        
        // Log the password reset attempt
        await logActivity(user._id, 'PASSWORD_RESET_INITIATED', 'USER', user._id.toString(), 
                         `Password reset initiated`, getClientIp(req));
        
        // Show security question
        res.render('forgot-password', {
            hideHeader: true,
            username: username,
            securityQuestion: user.securityQuestion
        });
        
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).render('forgot-password', {
            hideHeader: true,
            error: 'An error occurred. Please try again later.'
        });
    }
});

// Step 3: Verify security answer
server.post('/forgot-password/verify-answer', async (req, res) => {
    const { username, securityAnswer } = req.body;
    
    try {
        // Case-insensitive username search
        const user = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        
        if (!user || !user.securityQuestion || !user.securityAnswer) {
            await logActivity(null, 'FAILED_PASSWORD_RESET', 'USER', username, 
                            `Invalid password reset attempt`, getClientIp(req));
            
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'Invalid request. Please start over.',
                username: username
            });
        }
        
        // Verify security answer (case-insensitive, trimmed)
        const answerMatch = await bcrypt.compare(
            securityAnswer.toLowerCase().trim(), 
            user.securityAnswer
        );
        
        if (!answerMatch) {
            await logActivity(user._id, 'FAILED_PASSWORD_RESET', 'USER', user._id.toString(), 
                            `Incorrect security answer provided`, getClientIp(req));
            
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'Incorrect answer to security question. Please try again.',
                username: username,
                securityQuestion: user.securityQuestion
            });
        }
        
        // Generate a temporary reset token and store in session
        const crypto = require('crypto');
        const resetToken = crypto.randomBytes(32).toString('hex');
        
        // Store reset token in session (expires when session expires)
        req.session.passwordResetToken = resetToken;
        req.session.passwordResetUsername = username;
        req.session.passwordResetExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
        
        await logActivity(user._id, 'PASSWORD_RESET_VERIFIED', 'USER', user._id.toString(), 
                         `Security question answered correctly`, getClientIp(req));
        
        // Show password reset form
        res.render('forgot-password', {
            hideHeader: true,
            verified: true,
            username: username,
            resetToken: resetToken,
            info: 'Security question verified! Please enter your new password.'
        });
        
    } catch (err) {
        console.error('Verify answer error:', err);
        res.status(500).render('forgot-password', {
            hideHeader: true,
            error: 'An error occurred. Please try again later.'
        });
    }
});

// Step 4: Reset password
server.post('/forgot-password/reset-password', async (req, res) => {
    const { username, resetToken, newPassword, confirmPassword } = req.body;
    
    try {
        // Verify session token
        if (!req.session.passwordResetToken || 
            !req.session.passwordResetUsername ||
            req.session.passwordResetToken !== resetToken ||
            req.session.passwordResetUsername !== username ||
            Date.now() > req.session.passwordResetExpires) {
            
            await logActivity(null, 'FAILED_PASSWORD_RESET', 'USER', username, 
                            `Invalid or expired reset token`, getClientIp(req));
            
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'Invalid or expired reset link. Please start over.'
            });
        }
        
        // Validate passwords match
        if (newPassword !== confirmPassword) {
            return res.render('forgot-password', {
                hideHeader: true,
                verified: true,
                username: username,
                resetToken: resetToken,
                error: 'Passwords do not match.'
            });
        }
        
        // Validate password complexity
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.render('forgot-password', {
                hideHeader: true,
                verified: true,
                username: username,
                resetToken: resetToken,
                error: passwordValidation.errors.join('<br>')
            });
        }
        
        // Case-insensitive username search
        const user = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (!user) {
            return res.render('forgot-password', {
                hideHeader: true,
                error: 'User not found. Please start over.'
            });
        }
        
        // Check if password is being reused
        const isReused = await isPasswordReused(user, newPassword);
        if (isReused) {
            await logActivity(user._id, 'FAILED_PASSWORD_RESET', 'USER', user._id.toString(), 
                            `Password reset failed: Password reuse detected`, getClientIp(req));
            
            return res.render('forgot-password', {
                hideHeader: true,
                verified: true,
                username: username,
                resetToken: resetToken,
                error: 'Cannot reuse any of your last 5 passwords. Please choose a different password.'
            });
        }
        
        // Update password with history
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await updatePasswordHistory(user, hashedPassword);
        
        // Clear reset token from session
        delete req.session.passwordResetToken;
        delete req.session.passwordResetUsername;
        delete req.session.passwordResetExpires;
        
        await logActivity(user._id, 'PASSWORD_RESET_SUCCESS', 'USER', user._id.toString(), 
                         `Password successfully reset via forgot password`, getClientIp(req));
        
        // Redirect to login with success message
        res.render('login', {
            hideHeader: true,
            success: 'Password successfully reset! Please log in with your new password.'
        });
        
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).render('forgot-password', {
            hideHeader: true,
            error: 'An error occurred. Please try again later.'
        });
    }
});

// Logout
server.get('/logout', (req, res) => {
    const userId = req.session.userId;
    
    if (userId) {
        logActivity(userId, 'LOGOUT', 'USER', userId, 'User logged out', getClientIp(req));
    }
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send("Internal Server Error");
        }
        res.redirect('/login');
    });
});

// ============================================
// AUTHENTICATED USER ROUTES
// ============================================

// Home feed
server.get('/home', isAuthenticated, async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        // If user is administrator, redirect to admin dashboard
        if (user.role === 'administrator') {
            return res.redirect('/admin');
        }
        
        // If user is manager, redirect to manager dashboard
        if (user.role === 'manager') {
            return res.redirect('/manager');
        }

        // For regular users only, show the normal feed
        const posts = await Post.find()
            .populate('user')
            .populate({
                path: 'comments.user',
                select: 'username profilePic'
            })
            .sort({ createdAt: -1 });

        const postsWithOwnership = posts.map(post => {
            const postObj = post.toObject();

            const updatedComments = postObj.comments.map(comment => ({
                ...comment,
                isOwner: userId && comment.user && comment.user._id.toString() === userId,
                canModerate: user.role === 'administrator' || 
                            (user.role === 'manager' && user.managedTags.includes(postObj.postTag))
            }));

            return {
                ...postObj,
                isOwner: userId && post.user && post.user._id.toString() === userId,
                canModerate: user.role === 'administrator' || 
                            (user.role === 'manager' && user.managedTags.includes(postObj.postTag)),
                comments: updatedComments,
                commentsCount: post.comments ? post.comments.length : 0
            };
        });

        res.render('index', {
            posts: postsWithOwnership,
            userProfile: user,
            showLoginMessage: req.session.showLoginMessage || false,
            previousLogin: req.session.previousLogin || null
        });

        // Clear the flag after showing
        req.session.showLoginMessage = false;
    } catch (err) {
        console.error("Error fetching posts:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/admin/view-feed', isAdministrator, async (req, res) => {
    try {
        const posts = await Post.find()
            .populate('user')
            .populate({
                path: 'comments.user',
                select: 'username profilePic'
            })
            .sort({ createdAt: -1 });

        const user = await User.findById(req.session.userId);

        res.render('admin/view-feed', {
            posts: posts,
            userProfile: user,
            readOnly: true // Flag to disable interactions in the view
        });
    } catch (err) {
        console.error("Error fetching posts:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Search posts
server.get('/search', isAuthenticated, async (req, res) => {
    const query = req.query.q;
    try {
        const posts = await Post.find({ caption: { $regex: query, $options: 'i' } })
            .populate('user')
            .populate('comments.user', 'username profilePic');
        
        const userId = req.session.userId;
        const user = await User.findById(userId);

        const postsWithOwnership = posts.map(post => ({
            ...post.toObject(),
            isOwner: userId && post.user._id.toString() === userId,
            canModerate: user.role === 'administrator' || 
                        (user.role === 'manager' && user.managedTags.includes(post.postTag))
        }));

        res.render('search-results', { query, posts: postsWithOwnership, userProfile: user });
    } catch (err) {
        console.error("Search Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Filter by tags
server.get('/posts/:tag', isAuthenticated, async (req, res) => {
    try {
        const tag = req.params.tag;
        if (!tag) return res.status(400).json({ message: "Tag is required" });

        const posts = await Post.find({ postTag: tag })
            .populate('user', 'username profilePic')
            .populate('comments.user', 'username profilePic')
            .sort({ createdAt: -1 });

        const userId = req.session.userId;
        const user = await User.findById(userId);

        const formattedPosts = posts.map(post => ({
            ...post.toObject(),
            isOwner: userId && post.user._id.toString() === userId,
            canModerate: user.role === 'administrator' || 
                        (user.role === 'manager' && user.managedTags.includes(post.postTag))
        }));
        
        res.render('taggedPosts', { tag, posts: formattedPosts, userProfile: user });  
    } catch (error) {
        console.error("Error fetching posts by tag:", error);
        res.status(500).send("Internal Server Error");
    }
});

// ============================================
// PROFILE ROUTES
// ============================================

server.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId)
            .populate({
                path: 'posts',
                populate: { path: 'comments.user', select: 'username' } 
            })
            .populate('likes')
            .populate('dislikes') 
            .populate('saved') 
            .populate('hidden'); 

        if (!user) {
            return res.redirect('/login');
        }

        // If admin, redirect to admin dashboard
        if (user.role === 'administrator') {
            return res.redirect('/admin');
        }

        //  If manager, redirect to manager dashboard
        if (user.role === 'manager') {
            return res.redirect('/manager');
        }

        // Regular users see their profile
        res.render('profile', { userProfile: user });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/profile/posts', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId)
            .populate('likes')
            .populate('dislikes');

        const userPosts = await Post.find({ user: req.session.userId })
            .populate('user')
            .populate({
                path: 'comments.user',
                select: 'username profilePic'
            });

        const postsWithOwnership = userPosts.map(post => ({
            ...post.toObject(),
            isOwner: true,
            commentsCount: post.comments ? post.comments.length : 0
        }));

        res.render('profile/posts', {
            layout: false,
            posts: postsWithOwnership,
            userProfile: user
        });

    } catch (err) {
        console.error('ÃƒÂ¢Ã‚ÂÃ…â€™ Error fetching user posts for profile:', err);
        res.status(500).send('Internal Server Error');
    }
});

server.get('/profile/likes', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate({
            path: 'likes',
            populate: [
                { path: 'user' },
                { path: 'comments.user', select: 'username profilePic' }
            ]
        });

        const likedPosts = user.likes.map(post => ({
            ...post.toObject(),
            isOwner: post.user._id.toString() === req.session.userId,
            commentsCount: post.comments ? post.comments.length : 0
        }));

        res.render('profile/likes', { layout: false, posts: likedPosts, userProfile: user });
    } catch (err) {
        console.error("ÃƒÂ¢Ã‚ÂÃ…â€™ Error loading liked posts:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/profile/dislikes', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate({
            path: 'dislikes',
            populate: [
                { path: 'user' },
                { path: 'comments.user', select: 'username profilePic' }
            ]
        });

        const dislikedPosts = user.dislikes.map(post => ({
            ...post.toObject(),
            isOwner: post.user._id.toString() === req.session.userId,
            commentsCount: post.comments ? post.comments.length : 0
        }));

        res.render('profile/dislikes', { layout: false, posts: dislikedPosts, userProfile: user });
    } catch (err) {
        console.error("ÃƒÂ¢Ã‚ÂÃ…â€™ Error loading disliked posts:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.post('/update-profile-pic', isAuthenticated, upload.single('profilePic'), async (req, res) => {
    try {
        let user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        user.profilePic = `/uploads/${req.file.filename}`;
        await user.save();

        res.json({ success: true, newProfilePic: user.profilePic });
    } catch (err) {
        console.error("Error updating profile picture:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ============================================
// SETTINGS ROUTES
// ============================================

server.get('/settings', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.redirect('/login');
        }

        res.render('settings', { 
            currentUsername: user.username,
            userProfile: user 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

server.post('/settings', isAuthenticated, async (req, res) => {
    const { newUsername } = req.body;

    try {
        // 2.4.4 - Validate username not empty
        if (!newUsername || newUsername.trim().length === 0) {
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'USERNAME_CHANGE', 
                            req.session.userId, 'Username change failed: Empty username', getClientIp(req));
            return res.status(400).send("ÃƒÂ¢Ã…Â¡Ã‚Â  Username cannot be empty!");
        }

        // Case-insensitive check for existing username
        const existingUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${newUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (existingUser && existingUser._id.toString() !== req.session.userId) {
            // 2.4.4 - Log input validation failure
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'USERNAME_CHANGE', 
                            req.session.userId, 'Username change failed: Username already exists', getClientIp(req));
            return res.status(400).send("ÃƒÂ¢Ã…Â¡Ã‚Â  Username already exists!");
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(400).send("ÃƒÂ¢Ã‚ÂÃ…â€™ User not found!");
        }

        const oldUsername = user.username;
        user.username = newUsername;
        user.userTag = `u/${newUsername}`;
        await user.save();

        await logActivity(user._id, 'CHANGE_USERNAME', 'USER', user._id.toString(), 
                         `Changed username from ${oldUsername} to ${newUsername}`, getClientIp(req));

        res.redirect('/profile');
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// ============================================
// CHANGE PASSWORD ROUTE (with re-authentication)
// ============================================

// GET change password page
server.get('/change-password', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        res.render('changepassword', { 
            userProfile: user,
            previousLogin: req.session.previousLogin 
        });
    } catch (err) {
        console.error('Error loading change password page:', err);
        res.status(500).send('Internal Server Error');
    }
});

// POST change password
server.post('/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    try {
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            return res.status(404).send("User not found");
        }

        // 2.1.12 - Re-authenticate user with current password
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            await logActivity(user._id, 'FAILED_PASSWORD_CHANGE', 'USER', user._id.toString(), 
                            `Failed password change attempt - incorrect current password`, 
                            getClientIp(req));
            return res.status(400).send("Current password is incorrect");
        }

        // Validate new passwords match
        if (newPassword !== confirmNewPassword) {
            return res.status(400).send("New passwords do not match");
        }

        // 2.1.4 & 2.1.5 - Validate new password
        const passwordValidation = validatePassword(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).send(passwordValidation.errors.join('<br>'));
        }

        // 2.1.10 - Check if password is old enough to change
        const ageCheck = canChangePassword(user);
        if (!ageCheck.allowed) {
            return res.status(400).send(ageCheck.message);
        }

        // 2.1.9 - Check if password was used before
        const isReused = await isPasswordReused(user, newPassword);
        if (isReused) {
            return res.status(400).send("Password has been used previously. Please choose a different password.");
        }

        // Hash new password
        const newHashedPassword = await bcrypt.hash(newPassword, 10);

        // 2.1.9 - Update password history and change password
        await updatePasswordHistory(user, newHashedPassword);

        await logActivity(user._id, 'PASSWORD_CHANGE', 'USER', user._id.toString(), 
                         `Password changed successfully`, getClientIp(req));

        res.send("Password changed successfully! <a href='/settings'>Back to Settings</a>");
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).send("An error occurred while changing password");
    }
});

// ============================================
// POST MANAGEMENT ROUTES
// ============================================

server.post('/create-post', isAuthenticated, upload.single("image"), async (req, res) => {
    const caption = req.body.caption?.trim() || "";
    const postTag = req.body.postTag?.trim() || ""; 
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

    // Validate tag
    if (!postTag) {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'POST_CREATE', 
                        req.session.userId, 'Post creation failed: No category selected', getClientIp(req));
        return res.status(400).json({ error: "Please select a category" });
    }
    
    if (!ALLOWED_TAGS.includes(postTag)) {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'POST_CREATE', 
                        req.session.userId, `Post creation failed: Invalid category ${postTag}`, getClientIp(req));
        return res.status(400).json({ error: "Invalid category selected" });
    }

    if (!caption && !req.file) {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'POST_CREATE', 
                        req.session.userId, 'Post creation failed: No caption or image', getClientIp(req));
        return res.status(400).json({ error: "Post must contain either a caption or an image." });
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const newPost = new Post({
            user: user._id,
            caption,
            postTag,
            imageUrl: imageUrl || null
        });

        await newPost.save();
        user.posts.push(newPost._id);
        await user.save();

        await logActivity(user._id, 'CREATE_POST', 'POST', newPost._id.toString(), 
                         `Created post: ${caption.substring(0, 50)}`, getClientIp(req));

        res.json({ success: true, message: "Post created successfully!" });
    } catch (err) {
        console.error("ÃƒÂ°Ã…Â¸Ã…Â¡Ã‚Â¨ Error creating post:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

server.patch('/edit-post/:postId', isAuthenticated, async (req, res) => {
    const { postId } = req.params;
    const { caption } = req.body;

    if (!caption) {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'POST_EDIT', postId, 
                        'Post edit failed: Empty caption', getClientIp(req));
        return res.status(400).json({ error: "Caption cannot be empty!" });
    }

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const canEdit = await canEditOrDelete(req.session.userId, post.user, postId);
        
        if (!canEdit) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'POST_EDIT', postId, 
                            'Unauthorized attempt to edit post', getClientIp(req));
            return res.status(403).json({ error: "You don't have permission to edit this post" });
        }

        post.caption = caption;
        post.edited = true;
        await post.save();

        await logActivity(req.session.userId, 'EDIT_POST', 'POST', postId, 
                         `Edited post caption`, getClientIp(req));

        res.status(200).json({ success: true, message: "Post updated successfully", post });
    } catch (error) {
        console.error("Error updating post:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

server.delete('/delete-post/:postId', isAuthenticated, async (req, res) => {
    const { postId } = req.params;

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: "Post not found" });
        }

        const canDelete = await canEditOrDelete(req.session.userId, post.user, postId);
        
        if (!canDelete) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'POST_DELETE', postId, 
                            'Unauthorized attempt to delete post', getClientIp(req));
            return res.status(403).json({ success: false, error: "You don't have permission to delete this post" });
        }

        await Post.findByIdAndDelete(postId);

        await logActivity(req.session.userId, 'DELETE_POST', 'POST', postId, 
                         `Deleted post: ${post.caption.substring(0, 50)}`, getClientIp(req));

        res.json({ success: true, message: "Post deleted successfully" });
    } catch (err) {
        console.error("Error deleting post:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

// ============================================
// LIKE/DISLIKE ROUTES
// ============================================

server.post('/like/:postId', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const post = await Post.findById(req.params.postId);
        if (!user || !post) return res.status(404).json({ success: false });

        let liked = false;
        let wasDisliked = false;

        if (!user.likes.includes(post._id)) {
            user.likes.push(post._id);
            if (user.dislikes.includes(post._id)) {
                wasDisliked = true;
                user.dislikes = user.dislikes.filter(p => p.toString() !== post._id.toString());
            }
            liked = true;
        } else {
            user.likes = user.likes.filter(p => p.toString() !== post._id.toString());
            liked = false;
        }
        await user.save();

        if (liked) {
            await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: 1 } });
            if (wasDisliked) {
                await Post.findByIdAndUpdate(post._id, { $inc: { dislikesCount: -1 } });
            }
        } else {
            await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: -1 } });
        }
        
        const updatedPost = await Post.findById(post._id);
        res.json({ success: true, liked, likesCount: updatedPost.likesCount, dislikesCount: updatedPost.dislikesCount });
    } catch (err) {
        console.error("Like error:", err);
        res.status(500).json({ success: false });
    }
});

server.post('/dislike/:postId', isAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        const post = await Post.findById(req.params.postId);
        if (!user || !post) return res.status(404).json({ success: false });

        let disliked = false;
        let wasLiked = false;

        if (!user.dislikes.includes(post._id)) {
            user.dislikes.push(post._id);
            if (user.likes.includes(post._id)) {
                wasLiked = true;
                user.likes = user.likes.filter(p => p.toString() !== post._id.toString());
            }
            disliked = true;
        } else {
            user.dislikes = user.dislikes.filter(p => p.toString() !== post._id.toString());
            disliked = false;
        }
        await user.save();

        if (disliked) {
            await Post.findByIdAndUpdate(post._id, { $inc: { dislikesCount: 1 } });
            if (wasLiked) {
                await Post.findByIdAndUpdate(post._id, { $inc: { likesCount: -1 } });
            }
        } else {
            await Post.findByIdAndUpdate(post._id, { $inc: { dislikesCount: -1 } });
        }
        
        const updatedPost = await Post.findById(post._id);
        res.json({ success: true, disliked, likesCount: updatedPost.likesCount, dislikesCount: updatedPost.dislikesCount });
    } catch (err) {
        console.error("Dislike error:", err);
        res.status(500).json({ success: false });
    }
});

// ============================================
// COMMENT ROUTES
// ============================================

server.post('/add-comment/:postId', isAuthenticated, async (req, res) => {
    try {
        const postId = req.params.postId;
        const { commentText } = req.body;

        if (!postId || !commentText) {
            // 2.4.4 - Log input validation failure
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'COMMENT_CREATE', postId, 
                            'Comment creation failed: Missing content', getClientIp(req));
            return res.status(400).json({ error: "Missing postId or commentText." });
        }

        // Additional validation for comment length
        if (commentText.trim().length === 0) {
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'COMMENT_CREATE', postId, 
                            'Comment creation failed: Empty comment', getClientIp(req));
            return res.status(400).json({ error: "Comment cannot be empty." });
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(400).json({ error: "User not found." });
        }

        const newComment = {
            _id: new mongoose.Types.ObjectId(),
            user: user._id,
            profilePic: user.profilePic,
            content: commentText
        };

        await Post.updateOne(
            { _id: postId },
            { $push: { comments: newComment } },
            { runValidators: false }
        );

        await logActivity(user._id, 'CREATE_COMMENT', 'COMMENT', newComment._id.toString(), 
                         `Commented on post ${postId}`, getClientIp(req));

        const renderedComment = await server.render('partials/comment', {
            layout: false,
            _id: newComment._id.toString(),
            postId: postId,
            user: {
                username: user.username,
                profilePic: user.profilePic
            },
            content: commentText,
            likes: [],
            dislikes: [],
            isOwner: true,
            canModerate: false
        });
        
        res.status(200).json({
            success: true,
            html: renderedComment
        });

    } catch (error) {
        console.error("Critical Error in /add-comment route:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

server.put('/edit-comment/:postId/:commentId', isAuthenticated, async (req, res) => {
    const { postId, commentId } = req.params;
    const { updatedContent } = req.body;

    if (!updatedContent.trim()) {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'COMMENT_EDIT', commentId, 
                        'Comment edit failed: Empty content', getClientIp(req));
        return res.status(400).json({ error: "Comment content cannot be empty." });
    }

    try {
        const post = await Post.findOne({ _id: postId, "comments._id": commentId });
        if (!post) {
            return res.status(404).json({ error: "Post or Comment not found." });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ error: "Comment not found." });
        }

        const canEdit = await canEditOrDelete(req.session.userId, comment.user, postId);
        
        if (!canEdit) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'COMMENT_EDIT', commentId, 
                            'Unauthorized attempt to edit comment', getClientIp(req));
            return res.status(403).json({ error: "You don't have permission to edit this comment" });
        }

        await Post.updateOne(
            { _id: postId, "comments._id": commentId },
            { $set: { "comments.$.content": updatedContent } }
        );

        await logActivity(req.session.userId, 'EDIT_COMMENT', 'COMMENT', commentId, 
                         `Edited comment on post ${postId}`, getClientIp(req));

        res.json({ success: true, message: "Comment updated successfully.", updatedComment: updatedContent });
    } catch (error) {
        console.error("Error editing comment:", error);
        res.status(500).json({ error: "Internal Server Error." });
    }
});

server.delete('/delete-comment/:postId/:commentId', isAuthenticated, async (req, res) => {
    const { postId, commentId } = req.params;

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: "Post not found" });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, error: "Comment not found" });
        }

        const canDelete = await canEditOrDelete(req.session.userId, comment.user, postId);
        
        if (!canDelete) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'COMMENT_DELETE', commentId, 
                            'Unauthorized attempt to delete comment', getClientIp(req));
            return res.status(403).json({ success: false, error: "You don't have permission to delete this comment" });
        }

        comment.deleteOne();
        await post.save();

        await logActivity(req.session.userId, 'DELETE_COMMENT', 'COMMENT', commentId, 
                         `Deleted comment from post ${postId}`, getClientIp(req));

        return res.json({ success: true, message: "Comment deleted successfully" });
    } catch (err) {
        console.error("Error deleting comment:", err);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

server.post('/like-comment/:postId/:commentId', isAuthenticated, async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comment not found" });
        }
        
        if (!comment.likes) comment.likes = [];
        if (!comment.dislikes) comment.dislikes = [];
        
        let liked = false;
        const userId = req.session.userId.toString();
        
        if (!comment.likes.includes(userId)) {
            comment.likes.push(userId);
            comment.dislikes = comment.dislikes.filter(uid => uid.toString() !== userId);
            liked = true;
        } else {
            comment.likes = comment.likes.filter(uid => uid.toString() !== userId);
            liked = false;
        }
        post.markModified('comments');

        await post.save();
        return res.json({
            success: true,
            liked,
            likesCount: comment.likes.length,
            dislikesCount: comment.dislikes.length
        });
    } catch (err) {
        console.error("Error in like-comment endpoint:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

server.post('/dislike-comment/:postId/:commentId', isAuthenticated, async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: "Comment not found" });
        }
        
        if (!comment.likes) comment.likes = [];
        if (!comment.dislikes) comment.dislikes = [];
        
        let disliked = false;
        const userId = req.session.userId.toString();
        
        if (!comment.dislikes.includes(userId)) {
            comment.dislikes.push(userId);
            comment.likes = comment.likes.filter(uid => uid.toString() !== userId);
            disliked = true;
        } else {
            comment.dislikes = comment.dislikes.filter(uid => uid.toString() !== userId);
            disliked = false;
        }
        
        post.markModified('comments');

        await post.save();
        return res.json({
            success: true,
            disliked,
            likesCount: comment.likes.length,
            dislikesCount: comment.dislikes.length
        });
    } catch (err) {
        console.error("Error in dislike-comment endpoint:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ============================================
// REPLY ROUTES
// ============================================

server.post('/reply-comment/:postId/:commentId', isAuthenticated, async (req, res) => {
    const { postId, commentId } = req.params;
    const { replyText } = req.body;

    if (!replyText || !replyText.trim()) {
            // 2.4.4 - Log input validation failure
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'REPLY_CREATE', commentId, 
                            'Reply creation failed: Empty content', getClientIp(req));
            return res.status(400).json({ error: "Reply content is required." });
        }

    try {
        const post = await Post.findById(postId);
        const user = await User.findById(req.session.userId);

        if (!post || !user) return res.status(404).json({ success: false });

        const newReply = {
            _id: new mongoose.Types.ObjectId(),
            user: user._id,
            content: replyText,
            createdAt: new Date(),
            likes: [],
            dislikes: []
        };

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false });

        comment.replies.push(newReply);
        post.markModified('comments');
        await post.save();

        const renderedReply = await server.render('partials/reply', {
            layout: false,
            _id: newReply._id.toString(),
            postId: postId,
            commentId: commentId,
            user: {
                username: user.username,
                profilePic: user.profilePic
            },
            content: replyText,
            likes: [],
            dislikes: [],
            isOwner: true,
            isReply: true
        });        

        res.status(200).json({ success: true, html: renderedReply });
    } catch (err) {
        console.error("Reply Error:", err);
        res.status(500).json({ success: false });
    }
});

server.delete('/delete-reply/:postId/:commentId/:replyId', isAuthenticated, async (req, res) => {
    const { postId, commentId, replyId } = req.params;

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, error: "Post not found" });
        }

        const comment = post.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, error: "Comment not found" });
        }

        const reply = comment.replies.id(replyId);
        if (!reply) {
            return res.status(404).json({ success: false, error: "Reply not found" });
        }

        if (reply.user.toString() !== req.session.userId) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'REPLY_DELETE', replyId, 
                            'Unauthorized attempt to delete reply', getClientIp(req));
            return res.status(403).json({ success: false, error: "You can only delete your own replies" });
        }

        reply.deleteOne();
        post.markModified('comments');
        await post.save();

        res.json({ success: true, message: "Reply deleted successfully" });
    } catch (err) {
        console.error("Error deleting reply:", err);
        res.status(500).json({ success: false, error: "Internal Server Error" });
    }
});

server.put('/edit-reply/:postId/:commentId/:replyId', isAuthenticated, async (req, res) => {
    const { postId, commentId, replyId } = req.params;
    const { updatedContent } = req.body;

    if (!updatedContent || updatedContent.trim() === "") {
        // 2.4.4 - Log input validation failure
        await logActivity(req.session.userId, 'VALIDATION_FAILED', 'REPLY_EDIT', replyId, 
                        'Reply edit failed: Empty content', getClientIp(req));
        return res.status(400).json({ success: false, error: "Reply content cannot be empty" });
    }

    try {
        const post = await Post.findById(postId);
        const comment = post.comments.id(commentId);
        const reply = comment.replies.id(replyId);

        if (!post || !comment || !reply) return res.status(404).json({ success: false });

        if (reply.user.toString() !== req.session.userId.toString()) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'REPLY_EDIT', replyId, 
                            'Unauthorized attempt to edit reply', getClientIp(req));
            return res.status(403).json({ success: false, error: "Unauthorized to edit this reply" });
        }

        reply.content = updatedContent;
        post.markModified('comments');
        await post.save();

        res.json({ success: true, updatedReply: updatedContent });
    } catch (err) {
        console.error("Error editing reply:", err);
        res.status(500).json({ success: false });
    }
});

server.post('/reply-like/:postId/:commentId/:replyId', isAuthenticated, async (req, res) => {
    try {
        const { postId, commentId, replyId } = req.params;
        const userId = req.session.userId.toString();
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: "Post not found" });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

        const reply = comment.replies.id(replyId);
        if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });

        reply.likes = reply.likes || [];
        reply.dislikes = reply.dislikes || [];

        let liked = false;
        if (!reply.likes.includes(userId)) {
            reply.likes.push(userId);
            reply.dislikes = reply.dislikes.filter(id => id.toString() !== userId);
            liked = true;
        } else {
            reply.likes = reply.likes.filter(id => id.toString() !== userId);
        }

        post.markModified('comments');
        await post.save();

        res.json({
            success: true,
            liked,
            likesCount: reply.likes.length,
            dislikesCount: reply.dislikes.length
        });
    } catch (err) {
        console.error("Error liking reply:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

server.post('/reply-dislike/:postId/:commentId/:replyId', isAuthenticated, async (req, res) => {
    try {
        const { postId, commentId, replyId } = req.params;
        const userId = req.session.userId.toString();
        const post = await Post.findById(postId);
        if (!post) return res.status(404).json({ success: false, message: "Post not found" });

        const comment = post.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

        const reply = comment.replies.id(replyId);
        if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });

        reply.likes = reply.likes || [];
        reply.dislikes = reply.dislikes || [];

        let disliked = false;
        if (!reply.dislikes.includes(userId)) {
            reply.dislikes.push(userId);
            reply.likes = reply.likes.filter(id => id.toString() !== userId);
            disliked = true;
        } else {
            reply.dislikes = reply.dislikes.filter(id => id.toString() !== userId);
        }

        post.markModified('comments');
        await post.save();

        res.json({
            success: true,
            disliked,
            likesCount: reply.likes.length,
            dislikesCount: reply.dislikes.length
        });
    } catch (err) {
        console.error("Error disliking reply:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ============================================
// MODERATION ROUTES (Manager & Administrator)
// ============================================

// Register all moderation routes (reports, user restrictions, etc.)
const registerModerationRoutes = require('./moderation-routes');
registerModerationRoutes(server, isAuthenticated);

// ============================================
// ADMIN ROUTES (Administrator only)
// ============================================

server.get('/admin', isAdministrator, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalPosts = await Post.countDocuments();
        const totalAdmins = await User.countDocuments({ role: 'administrator' });
        const totalManagers = await User.countDocuments({ role: 'manager' });
        const totalRegularUsers = await User.countDocuments({ role: 'user' });
        
        const recentLogs = await ActivityLog.find()
            .populate('user', 'username role')
            .sort({ timestamp: -1 })
            .limit(20);

        res.render('admin/dashboard', {
            userProfile: req.user,
            stats: {
                totalUsers,
                totalPosts,
                totalAdmins,
                totalManagers,
                totalRegularUsers
            },
            recentLogs
        });
    } catch (err) {
        console.error("Error loading admin dashboard:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/admin/users', isAdministrator, async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });

        res.render('admin/users', {
            layout: 'main',  
            currentUser: req.user,
            userProfile: req.user,
            users
        });
    } catch (err) {
        console.error("Error loading users:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.post('/admin/users/create', isAdministrator, async (req, res) => {
    const { username, password, role, managedTags } = req.body;

    try {
        if (!username || !password || !role) {
            // 2.4.4 - Log input validation failure
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'USER_CREATE', 
                            username || 'unknown', 'User creation failed: Missing required fields', getClientIp(req));
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Case-insensitive check for existing username
        const existingUser = await User.findOne({ 
            username: { $regex: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (existingUser) {
            // 2.4.4 - Log input validation failure
            await logActivity(req.session.userId, 'VALIDATION_FAILED', 'USER_CREATE', username, 
                            'User creation failed: Username already exists', getClientIp(req));
            return res.status(400).json({ error: 'Username already exists' });
        }

        if (!['administrator', 'manager', 'user'].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            username,
            password: hashedPassword,
            userTag: `u/${username}`,
            role,
            managedTags: role === 'manager' && managedTags ? managedTags.split(',').map(t => t.trim()) : []
        });

        await newUser.save();

        await logActivity(req.session.userId, 'CREATE_USER', 'USER', newUser._id.toString(), 
                         `Created ${role} account: ${username}`, getClientIp(req));

        res.json({ success: true, message: "User created successfully", user: newUser });
    } catch (err) {
        console.error("Error creating user:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

server.patch('/admin/users/:userId/role', isAdministrator, async (req, res) => {
    const { userId } = req.params;
    const { role, managedTags } = req.body;

    try {
        if (!['administrator', 'manager', 'user'].includes(role)) {
            return res.status(400).json({ error: "Invalid role" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const oldRole = user.role;
        user.role = role;
        
        if (role === 'manager' && managedTags) {
            user.managedTags = Array.isArray(managedTags) ? managedTags : managedTags.split(',').map(t => t.trim());
        } else if (role !== 'manager') {
            user.managedTags = [];
        }

        await user.save();

        await logActivity(req.session.userId, 'CHANGE_ROLE', 'USER', userId, 
                         `Changed ${user.username}'s role from ${oldRole} to ${role}`, getClientIp(req));

        res.json({ success: true, message: "User role updated successfully" });
    } catch (err) {
        console.error("Error updating user role:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

server.delete('/admin/users/:userId', isAdministrator, async (req, res) => {
    const { userId } = req.params;

    try {
        if (userId === req.session.userId) {
            return res.status(400).json({ error: "You cannot delete your own account" });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        await Post.deleteMany({ user: userId });
        await User.findByIdAndDelete(userId);

        await logActivity(req.session.userId, 'DELETE_USER', 'USER', userId, 
                         `Deleted user account: ${user.username}`, getClientIp(req));

        res.json({ success: true, message: "User deleted successfully" });
    } catch (err) {
        console.error("Error deleting user:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ============================================
// AUDIT LOGS (Administrator only)
// ============================================

server.get('/admin/logs', isAdministrator, async (req, res) => {
    try {
        const { search, action, startDate, endDate, page = 1 } = req.query;
        const limit = 50;
        const skip = (page - 1) * limit;

        let query = {};
        
        if (search) {
            query.username = { $regex: search, $options: 'i' };
        }
        
        if (action) {
            query.action = action;
        }
        
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        const logs = await ActivityLog.find(query)
            .populate('user', 'username role')
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit);

        const totalLogs = await ActivityLog.countDocuments(query);
        const totalPages = Math.ceil(totalLogs / limit);

        const actions = await ActivityLog.distinct('action');

        res.render('admin/logs', {
            userProfile: req.user,
            logs,
            actions,
            currentPage: parseInt(page),
            totalPages,
            search: search || '',
            selectedAction: action || '',
            startDate: startDate || '',
            endDate: endDate || ''
        });
    } catch (err) {
        console.error("Error loading audit logs:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/admin/logs/export', isAdministrator, async (req, res) => {
    try {
        const logs = await ActivityLog.find()
            .populate('user', 'username role')
            .sort({ timestamp: -1 });

        let csv = 'Timestamp,Username,Role,Action,Target Type,Target ID,Details,IP Address\n';
        
        logs.forEach(log => {
            csv += `"${log.timestamp}","${log.username}","${log.user?.role || 'N/A'}","${log.action}","${log.targetType || ''}","${log.targetId || ''}","${log.details || ''}","${log.ipAddress || ''}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
        res.send(csv);

        await logActivity(req.session.userId, 'EXPORT_LOGS', 'SYSTEM', '', 
                         'Exported audit logs to CSV', getClientIp(req));
    } catch (err) {
        console.error("Error exporting logs:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ============================================
// MANAGER ROUTES (Manager and Admin)
// ============================================

server.get('/manager', isManager, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        // Get pending reports count
        const pendingReportsCount = await Report.countDocuments({ status: 'pending' });
        
        // Get posts managed by this manager
        let posts;
        if (user.role === 'administrator') {
            posts = await Post.find()
                .populate('user', 'username profilePic')
                .sort({ createdAt: -1 });
        } else {
            posts = await Post.find({ postTag: { $in: user.managedTags } })
                .populate('user', 'username profilePic')
                .sort({ createdAt: -1 });
        }

        const stats = {
            managedPosts: posts.length,
            managedTags: user.managedTags.length,
            pendingReports: pendingReportsCount,
            tags: user.managedTags
        };

        res.render('manager/dashboard', {
            user: user,
            userProfile: user,
            posts,
            stats,
            isManager: true
        });
    } catch (err) {
        console.error("Error loading manager dashboard:", err);
        res.status(500).send("Internal Server Error");
    }
});

server.get('/manager/posts/:tag', isManager, async (req, res) => {
    try {
        const { tag } = req.params;
        const user = await User.findById(req.session.userId);

        if (user.role !== 'administrator' && !user.managedTags.includes(tag)) {
            // 2.4.6 - Log authorization failure
            await logActivity(req.session.userId, 'AUTHORIZATION_FAILED', 'TAG_MODERATE', tag, 
                            'Unauthorized attempt to moderate tag', getClientIp(req));
            return res.status(403).render('error', {
                message: 'Access Denied',
                detail: 'You do not have permission to moderate this tag'
            });
        }

        const posts = await Post.find({ postTag: tag })
            .populate('user', 'username profilePic')
            .populate('comments.user', 'username profilePic')
            .sort({ createdAt: -1 });

        res.render('manager/posts', {
            userProfile: user,
            posts,
            tag
        });
    } catch (err) {
        console.error("Error loading posts:", err);
        res.status(500).send("Internal Server Error");
    }
});

// ============================================
// ABOUT PAGE
// ============================================

server.get('/about', (req, res) => {
    const packages = [
        { name: 'express', version: '4.18.2' },
        { name: 'path', version: 'Built-in Node.js module' },
        { name: 'express-session', version: '1.17.3' },
        { name: 'bcryptjs', version: '2.4.3' },
        { name: 'express-handlebars', version: '6.0.7' },
        { name: 'moment', version: '2.29.4' },
        { name: 'multer', version: '1.4.5-lts.1' },
        { name: 'mongoose', version: '7.0.4' },
        { name: 'util', version: 'Built-in Node.js module' },
        { name: 'dotenv', version: '16.0.3' }
    ];

    res.render('about', { packages, userProfile: req.user });
});

// Catch-all route for 404 errors
server.use((req, res, next) => {
    res.status(404).render('404', {
        layout: false,
        currentUser: req.session.userId ? res.locals.currentUser : null
    });
});
// General error handler (for 500 errors)
server.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).render('error', {
        message: 'Internal Server Error',
        detail: 'Something went wrong on our end. Please try again later.',
        returnUrl: '/home'
    });
});
// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 9090;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access at: http://localhost:${PORT}`);
});