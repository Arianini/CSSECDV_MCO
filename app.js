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
const { User, Post, ActivityLog } = require('./database');

// Import authentication middleware
const { 
    isAuthenticated, 
    isAdministrator, 
    isManager,
    canModeratePost,
    canEditOrDelete,
    logActivity,
    attachUserInfo,
    getClientIp
} = require('./middleware/auth');

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

// Landing page
server.get('/', async (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('landing', { layout: false });
});

// Login routes
server.get('/login', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('login');
});

server.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).send("❌ Invalid username or password!");
        }

        req.session.userId = user._id;
        
        user.lastLogin = new Date();
        await user.save();
        
        await logActivity(user._id, 'LOGIN', 'USER', user._id.toString(), 
                         `User logged in`, getClientIp(req));
        
        res.redirect('/home');
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
    }
});

// Register routes
server.get('/register', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/home');
    }
    res.render('register');
});

server.post('/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).send("⚠ Username already exists!");
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ 
            username, 
            password: hashedPassword, 
            userTag: `u/${username}`,
            role: 'user',
            managedTags: []
        });

        await newUser.save();
        console.log('New user registered:', newUser);
        
        req.session.userId = newUser._id;
        
        await logActivity(newUser._id, 'REGISTER', 'USER', newUser._id.toString(), 
                         `New user registered`, getClientIp(req));

        res.redirect('/home');
    } catch (err) {
        console.error(err);
        res.status(500).send("Internal Server Error");
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
        const posts = await Post.find()
            .populate('user')
            .populate({
                path: 'comments.user',
                select: 'username profilePic'
            })
            .sort({ createdAt: -1 });

        const userId = req.session.userId;
        const user = await User.findById(userId).populate('likes dislikes');

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
            userProfile: user
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
        console.error('❌ Error fetching user posts for profile:', err);
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
        console.error("❌ Error loading liked posts:", err);
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
        console.error("❌ Error loading disliked posts:", err);
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
        const existingUser = await User.findOne({ username: newUsername });
        if (existingUser && existingUser._id.toString() !== req.session.userId) {
            return res.status(400).send("⚠ Username already exists!");
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(400).send("❌ User not found!");
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

// Change password
server.get('/change-password', isAuthenticated, async (req, res) => {
    res.render('change-password', { userProfile: req.user });
});

server.post('/change-password', isAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: "New passwords do not match" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Current password is incorrect" });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        await logActivity(user._id, 'CHANGE_PASSWORD', 'USER', user._id.toString(), 
                         'Password changed', getClientIp(req));

        res.json({ success: true, message: "Password changed successfully" });
    } catch (err) {
        console.error("Error changing password:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ============================================
// POST MANAGEMENT ROUTES
// ============================================

server.post('/create-post', isAuthenticated, upload.single("image"), async (req, res) => {
    const caption = req.body.caption?.trim() || "";
    const postTag = req.body.postTag?.trim() || ""; 
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : "";

    if (!caption && !req.file) {
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
        console.error("🚨 Error creating post:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

server.patch('/edit-post/:postId', isAuthenticated, async (req, res) => {
    const { postId } = req.params;
    const { caption } = req.body;

    if (!caption) {
        return res.status(400).json({ error: "Caption cannot be empty!" });
    }

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ error: "Post not found" });
        }

        const canEdit = await canEditOrDelete(req.session.userId, post.user, postId);
        
        if (!canEdit) {
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
            return res.status(400).json({ error: "Missing postId or commentText." });
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

    try {
        const post = await Post.findById(postId);
        const comment = post.comments.id(commentId);
        const reply = comment.replies.id(replyId);

        if (!post || !comment || !reply) return res.status(404).json({ success: false });

        if (reply.user.toString() !== req.session.userId) {
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
            return res.status(400).json({ error: "Username, password, and role are required" });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: "Username already exists" });
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
            tags: user.managedTags
        };

        res.render('manager/dashboard', {
            userProfile: user,
            posts,
            stats
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

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 9090;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Access at: http://localhost:${PORT}`);
});
