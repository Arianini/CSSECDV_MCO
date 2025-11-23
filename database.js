const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config(); // load .env

// Single source of truth for the URI
const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tiktalk_db';
console.log('[DB] Using URI:', uri);

// Connect ONCE
if (mongoose.connection.readyState === 0) {
  mongoose.connect(uri)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));
}

// ----- Schemas below -----

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    profilePic: { type: String, default: 'profile-placeholder.png' },
    userTag: { type: String, required: true },
    role: { 
        type: String, 
        enum: ['administrator', 'manager', 'user'], 
        default: 'user',
        required: true 
    },
    managedTags: { 
        type: [String], 
        default: [] 
    },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    
    // ===== NEW FIELDS FOR AUTHENTICATION =====
    
    // 2.1.7 - Account lockout
    failedLoginAttempts: { type: Number, default: 0 },
    accountLockedUntil: { type: Date, default: null },
    
    // 2.1.9 - Password history (store last 5 passwords)
    passwordHistory: [{ 
        password: String, 
        changedAt: { type: Date, default: Date.now }
    }],
    
    // 2.1.10 - Password age tracking
    passwordChangedAt: { type: Date, default: Date.now },
    
    // 2.1.11 - Last login tracking (already exists, but add previousLogin)
    previousLogin: { type: Date },
    
    // 2.1.8 - Security questions for password reset
    securityQuestion: { type: String },
    securityAnswer: { type: String }, // Store hashed!
    
    // ===== END NEW FIELDS =====

    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    dislikes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    saved: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    hidden: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
});

const User = mongoose.model('User', userSchema);

// Activity Log Schema for audit trails
const activityLogSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true }, // Store username for easier search
    action: { type: String, required: true }, // 'LOGIN', 'CREATE_POST', 'EDIT_POST', 'DELETE_POST', 'ROLE_CHANGE', etc.
    targetType: { type: String }, // 'POST', 'COMMENT', 'USER', etc.
    targetId: { type: String }, // ID of affected resource
    details: { type: String }, // Additional information
    ipAddress: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// Indexes for efficient searching
activityLogSchema.index({ username: 1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ timestamp: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

const postSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caption: { type: String, required: false, default: "" },
    imageUrl: { type: String, required: false, default: '' },
    postTag: { type: String, required: false, default: "" },
    comments: [
        {
            _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            content: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            likes: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
            dislikes: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
            replies: [
                {
                    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
                    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
                    content: { type: String, required: true },
                    createdAt: { type: Date, default: Date.now },
                    likes: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
                    dislikes: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }
                }
            ]
        }
    ],
    createdAt: { type: Date, default: Date.now },
    likesCount: { type: Number, default: 0 },
    dislikesCount: { type: Number, default: 0 }
});

const Post = mongoose.model('Post', postSchema);

// Updated sample users with forum roles
const sampleUsers = [
    { 
        username: "admin", 
        password: "admin123", 
        userTag: "u/admin", 
        role: "administrator",
        managedTags: [], // Admins have access to everything
        profilePic: "https://static.wikia.nocookie.net/valorant/images/b/b0/Omen_icon.png" 
    },
    { 
        username: "moderator_food", 
        password: "mod123", 
        userTag: "u/moderator_food", 
        role: "manager",
        managedTags: ["Food", "Coffee", "Baking"], // Can moderate food-related content
        profilePic: "https://static.wikia.nocookie.net/valorant/images/d/d4/Yoru_icon.png" 
    },
    { 
        username: "moderator_travel", 
        password: "mod123", 
        userTag: "u/moderator_travel", 
        role: "manager",
        managedTags: ["Travel", "Gaming"], // Can moderate travel & gaming content
        profilePic: "https://static.wikia.nocookie.net/valorant/images/3/35/Jett_icon.png" 
    },
    { 
        username: "john_doe", 
        password: "user123", 
        userTag: "u/john_doe", 
        role: "user",
        managedTags: [],
        profilePic: "https://static.wikia.nocookie.net/valorant/images/7/74/Sage_icon.png" 
    },
    { 
        username: "jane_smith", 
        password: "user123", 
        userTag: "u/jane_smith", 
        role: "user",
        managedTags: [],
        profilePic: "https://static.wikia.nocookie.net/valorant/images/4/4d/Brimstone_icon.png" 
    }
];

const samplePosts = [
    {
        username: "john_doe",
        caption: "Love this new recipe! 🍛",
        imageUrl: "https://hips.hearstapps.com/hmg-prod/images/190509-coconut-chicken-curry-157-1558039780.jpg?crop=1xw:0.8435280189423836xh;center,top&resize=1200:*",
        postTag: "Food",
        comments: [
            { username: "jane_smith", content: "Looks Yummy!" },
            { username: "moderator_food", content: "Great post! 👍" }
        ]
    },
    {
        username: "jane_smith",
        caption: "Trying out this new coffee shop! ☕",
        imageUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e4/Latte_and_dark_coffee.jpg",
        postTag: "Coffee",
        comments: [
            { username: "john_doe", content: "That looks delicious!" },
            { username: "moderator_food", content: "Where is this?" }
        ]
    },
    {
        username: "john_doe",
        caption: "Beautiful sunset at the beach! 🌅",
        imageUrl: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/17/e0/ce/85/sunset-beach.jpg?w=1200&h=-1&s=1",
        postTag: "Travel",
        comments: [
            { username: "moderator_travel", content: "Stunning view!" },
            { username: "jane_smith", content: "Perfect vacation spot!" }
        ]
    }
];

async function seedUsers() {
    const existingUsers = await User.find();
    if (existingUsers.length === 0) {
        for (let user of sampleUsers) {
            user.password = await bcrypt.hash(user.password, 10);
        }
        await User.insertMany(sampleUsers);
        console.log('✅ Sample Users Added with Forum Roles');
        console.log('   - Admin: admin/admin123');
        console.log('   - Moderator (Food): moderator_food/mod123');
        console.log('   - Moderator (Travel): moderator_travel/mod123');
        console.log('   - Users: john_doe/user123, jane_smith/user123');
    } else {
        console.log('⚡ Users Already Exist');
    }
}

async function seedPosts() {
    const existingPosts = await Post.find();
    if (existingPosts.length === 0) {
        console.log('⚡ Seeding posts...');

        const users = await User.find();
        const userMap = {};
        users.forEach(user => {
            userMap[user.username] = user._id;
        });

        const formattedPosts = samplePosts.map(post => ({
            user: userMap[post.username],
            caption: post.caption,
            imageUrl: post.imageUrl,
            postTag: post.postTag,
            comments: post.comments.map(comment => ({
                user: userMap[comment.username] || null,
                content: comment.content,
                likes: [],
                dislikes: []
            }))
        }));

        await Post.insertMany(formattedPosts);
        console.log('✅ Sample Posts Added');
    } else {
        console.log('⚡ Posts Already Exist');
    }
}

// 🆕 SEED DEFAULT SECURITY QUESTIONS FOR EXISTING USERS
async function seedSecurityQuestions() {
    try {
        // Find users without security questions
        const usersWithoutSecurity = await User.find({
            $or: [
                { securityQuestion: { $exists: false } },
                { securityQuestion: null },
                { securityQuestion: '' }
            ]
        });

        if (usersWithoutSecurity.length === 0) {
            console.log('⚡ All users already have security questions');
            return;
        }

        console.log(`⚡ Adding security questions to ${usersWithoutSecurity.length} users...`);

        // Default security questions pool
        const defaultQuestions = [
            "What is your favorite color?",
            "What city were you born in?",
            "What is your mother's maiden name?",
            "What was the name of your first pet?",
            "What is your favorite food?"
        ];

        // Update each user with a default security question/answer
        for (let user of usersWithoutSecurity) {
            // Assign a question based on user index (spread them out)
            const questionIndex = usersWithoutSecurity.indexOf(user) % defaultQuestions.length;
            const question = defaultQuestions[questionIndex];
            
            // Default answer based on role for easy demo
            let answer;
            if (user.role === 'administrator') {
                answer = 'admin2024'; // Easy to remember for admin
            } else if (user.role === 'manager') {
                answer = 'manager2024'; // Easy to remember for managers
            } else {
                answer = 'user2024'; // Easy to remember for regular users
            }

            // Hash the security answer (same as password)
            const hashedAnswer = await bcrypt.hash(answer.toLowerCase(), 10);

            // Update the user
            await User.findByIdAndUpdate(user._id, {
                securityQuestion: question,
                securityAnswer: hashedAnswer
            });

            console.log(`   ✓ ${user.username} (${user.role}): "${question}" / Answer: "${answer}"`);
        }

        console.log('✅ Security questions seeded successfully!');
        console.log('\n📝 Default Security Answers by Role:');
        console.log('   - Administrators: admin2024');
        console.log('   - Managers: manager2024');
        console.log('   - Users: user2024');
        console.log('   (All answers are case-insensitive)\n');
        
    } catch (error) {
        console.error('❌ Error seeding security questions:', error);
    }
}

mongoose.connection.once('open', async () => {
    console.log('🚀 MongoDB connection established.');
    await seedUsers();
    await seedPosts();
    await seedSecurityQuestions(); // 🆕 Automatically add security Q&A to all users
});

const { Report, UserRestriction, PostModeration } = require('./moderation-schemas');

module.exports = { 
    mongoose, 
    User, 
    Post, 
    ActivityLog,
    Report,            
    UserRestriction,    
    PostModeration    
};
