const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import our database configuration
const DatabaseConfig = require('./database-config');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const dbConfig = new DatabaseConfig();
let db = null;

// Initialize database connection
async function initializeDatabase() {
    try {
        db = await dbConfig.connect();
        console.log('✅ Database initialized successfully');
        
        // Run migration if in production
        if (process.env.NODE_ENV === 'production') {
            const { migrateToPostgres } = require('./migrate-to-postgres');
            await migrateToPostgres();
        }
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        process.exit(1);
    }
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'dance-registration-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to false for Railway deployment
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));

// Utility functions
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const requireAuth = (req, res, next) => {
    if (req.session.adminId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Routes

// Serve main registration page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve admin dashboard
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Routes

// Admin Authentication
app.post('/api/admin/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const admin = await dbConfig.get('SELECT * FROM admin_users WHERE username = $1', [username]);
    
    if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await dbConfig.run('UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [admin.id]);
    
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    
    res.json({ 
        success: true, 
        admin: { 
            id: admin.id, 
            username: admin.username, 
            email: admin.email 
        } 
    });
}));

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ success: true });
    });
});

// Check admin authentication status
app.get('/api/admin/status', (req, res) => {
    if (req.session.adminId) {
        res.json({ 
            authenticated: true, 
            username: req.session.adminUsername 
        });
    } else {
        res.json({ authenticated: false });
    }
});

// System Settings
app.get('/api/settings', asyncHandler(async (req, res) => {
    const settings = await dbConfig.all('SELECT * FROM system_settings');
    const settingsObj = {};
    settings.forEach(setting => {
        settingsObj[setting.setting_key] = setting.setting_value;
    });
    
    // Set default Venmo username if not configured
    if (!settingsObj.venmo_username) {
        settingsObj.venmo_username = 'sangou';
    }
    
    res.json(settingsObj);
}));

app.put('/api/settings', requireAuth, asyncHandler(async (req, res) => {
    const updates = req.body;
    
    for (const [key, value] of Object.entries(updates)) {
        if (dbConfig.isProduction) {
            await dbConfig.run(
                'INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = CURRENT_TIMESTAMP',
                [key, value]
            );
        } else {
            await dbConfig.run(
                'INSERT OR REPLACE INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
                [key, value]
            );
        }
    }
    
    res.json({ success: true });
}));

// Courses
app.get('/api/courses', asyncHandler(async (req, res) => {
    const { active_only } = req.query;
    
    let query = `
        SELECT c.*,
               COUNT(DISTINCT r.id) as registration_count,
               (c.capacity - COUNT(DISTINCT r.id)) as available_spots
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed'
    `;
    
    const params = [];
    const conditions = [];
    
    if (active_only === 'true') {
        if (dbConfig.isProduction) {
            conditions.push('c.is_active = true');
        } else {
            conditions.push('c.is_active = 1');
        }
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY c.id ORDER BY c.created_at DESC';
    
    const courses = await dbConfig.all(query, params);
    res.json(courses);
}));

// Drop-in classes endpoint (returns empty array for now)
app.get('/api/drop-in-classes', asyncHandler(async (req, res) => {
    // For now, return empty array since drop-in classes aren't implemented yet
    // This prevents the 404 error on the frontend
    res.json([]);
}));

app.post('/api/courses', requireAuth, asyncHandler(async (req, res) => {
    const {
        name, description, course_type, duration_weeks,
        level, capacity, price, start_date, end_date,
        day_of_week, start_time, end_time, location, instructor
    } = req.body;
    
    if (!name || !course_type || !capacity || !price) {
        return res.status(400).json({ error: 'Required fields missing: name, course_type, capacity, and price are required' });
    }
    
    const result = await dbConfig.run(`
        INSERT INTO courses (
            name, description, course_type, duration_weeks,
            level, capacity, price, start_date, end_date,
            day_of_week, start_time, end_time, location, instructor
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
        name, description, course_type, duration_weeks || 1,
        level || 'All Levels', capacity, price, start_date, end_date,
        day_of_week, start_time, end_time, location, instructor
    ]);
    
    res.json({ success: true, courseId: result.lastID || result.id });
}));

app.put('/api/courses/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        name, description, course_type, duration_weeks,
        level, capacity, price, start_date, end_date,
        day_of_week, start_time, end_time, location, instructor, is_active
    } = req.body;
    
    await dbConfig.run(`
        UPDATE courses SET
            name = $1, description = $2, course_type = $3, duration_weeks = $4,
            level = $5, capacity = $6, price = $7, start_date = $8, end_date = $9,
            day_of_week = $10, start_time = $11, end_time = $12, location = $13, 
            instructor = $14, is_active = $15, updated_at = CURRENT_TIMESTAMP
        WHERE id = $16
    `, [
        name, description, course_type, duration_weeks,
        level, capacity, price, start_date, end_date,
        day_of_week, start_time, end_time, location, instructor, is_active, id
    ]);
    
    res.json({ success: true });
}));

// Students and Registrations
app.post('/api/register', asyncHandler(async (req, res) => {
    const {
        first_name, last_name, email, phone, date_of_birth,
        emergency_contact_name, emergency_contact_phone, medical_conditions,
        dance_experience, instagram_handle, instagram_id, how_heard_about_us,
        course_id, payment_amount, special_requests
    } = req.body;
    
    // Handle both instagram_handle and instagram_id field names
    const instagram = instagram_handle || instagram_id;
    
    if (!email || !course_id || !payment_amount) {
        return res.status(400).json({ error: 'Required fields missing: email, course_id, and payment_amount are required' });
    }
    
    // Check if registration is open
    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    if (settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }
    
    // Check capacity
    const course = await dbConfig.get(`
        SELECT c.capacity, COUNT(r.id) as current_registrations
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed'
        WHERE c.id = $1 AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
        GROUP BY c.id
    `, [course_id]);
    
    if (!course) {
        return res.status(400).json({ error: 'Course not found or inactive' });
    }
    
    if (course.current_registrations >= course.capacity) {
        return res.status(400).json({ error: 'Course is full' });
    }
    
    // Create or update student
    let student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);
    
    if (student) {
        await dbConfig.run(`
            UPDATE students SET 
                first_name = $1, last_name = $2, phone = $3, date_of_birth = $4,
                emergency_contact_name = $5, emergency_contact_phone = $6, 
                medical_conditions = $7, dance_experience = $8, instagram_handle = $9,
                how_heard_about_us = $10, updated_at = CURRENT_TIMESTAMP 
            WHERE id = $11
        `, [
            first_name || 'Student', last_name || '', phone, date_of_birth,
            emergency_contact_name, emergency_contact_phone, medical_conditions,
            dance_experience, instagram, how_heard_about_us, student.id
        ]);
    } else {
        const result = await dbConfig.run(`
            INSERT INTO students (
                first_name, last_name, email, phone, date_of_birth,
                emergency_contact_name, emergency_contact_phone, medical_conditions,
                dance_experience, instagram_handle, how_heard_about_us
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
            first_name || 'Student', last_name || '', email, phone, date_of_birth,
            emergency_contact_name, emergency_contact_phone, medical_conditions,
            dance_experience, instagram, how_heard_about_us
        ]);
        student = { id: result.lastID || result.id, email, first_name: first_name || 'Student', last_name: last_name || '' };
    }
    
    // Create registration
    const registrationResult = await dbConfig.run(`
        INSERT INTO registrations (
            student_id, course_id, payment_amount, payment_status, special_requests
        ) VALUES ($1, $2, $3, 'pending', $4)
    `, [student.id, course_id, payment_amount, special_requests]);
    
    res.json({ 
        success: true, 
        registrationId: registrationResult.lastID || registrationResult.id,
        studentId: student.id
    });
}));

// Get registrations
app.get('/api/registrations', requireAuth, asyncHandler(async (req, res) => {
    const { course_id, payment_status } = req.query;
    
    let query = `
        SELECT r.*, s.first_name, s.last_name, s.email, s.phone, s.dance_experience,
               c.name as course_name, c.course_type, c.price
        FROM registrations r
        JOIN students s ON r.student_id = s.id
        LEFT JOIN courses c ON r.course_id = c.id
    `;
    
    const params = [];
    const conditions = [];
    
    if (course_id) {
        conditions.push('r.course_id = $' + (params.length + 1));
        params.push(course_id);
    }
    
    if (payment_status) {
        conditions.push('r.payment_status = $' + (params.length + 1));
        params.push(payment_status);
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY r.registration_date DESC';
    
    const registrations = await dbConfig.all(query, params);
    res.json(registrations);
}));

// Update registration payment status
app.put('/api/registrations/:id/payment', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { payment_status, venmo_transaction_id, payment_method } = req.body;
    
    if (!payment_status) {
        return res.status(400).json({ error: 'Payment status is required' });
    }
    
    // Update registration with payment details
    await dbConfig.run(`
        UPDATE registrations SET
            payment_status = $1,
            paypal_transaction_id = $2,
            payment_method = $3,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
    `, [payment_status, venmo_transaction_id || null, payment_method || 'Venmo', id]);
    
    // If payment is completed, log success
    if (payment_status === 'completed') {
        console.log('✅ Payment confirmed for registration:', id);
    }
    
    res.json({ success: true });
}));

// Admin confirm payment endpoint
app.put('/api/admin/registrations/:id/confirm-payment', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { venmo_transaction_note } = req.body;
    
    // Update registration to completed status
    await dbConfig.run(`
        UPDATE registrations SET
            payment_status = 'completed',
            payment_method = 'Venmo',
            paypal_transaction_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
    `, [venmo_transaction_note || `Venmo payment confirmed by admin`, id]);
    
    console.log('✅ Admin confirmed Venmo payment for registration:', id);
    
    res.json({ success: true, message: 'Payment confirmed successfully' });
}));

// Generate Venmo payment link
app.post('/api/generate-venmo-link', asyncHandler(async (req, res) => {
    const { registrationId, amount, courseName } = req.body;
    
    if (!registrationId || !amount) {
        return res.status(400).json({ error: 'Registration ID and amount are required' });
    }
    
    // Get Venmo username from settings
    const venmoSetting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['venmo_username']);
    const venmoUsername = venmoSetting ? venmoSetting.setting_value : 'sangou';
    
    // Create payment note
    const paymentNote = `Dance Registration #${registrationId}${courseName ? ` - ${courseName}` : ''}`;
    
    // Generate Venmo deep link
    const venmoLink = `venmo://paycharge?txn=pay&recipients=${venmoUsername}&amount=${amount}&note=${encodeURIComponent(paymentNote)}`;
    
    // Generate web fallback link
    const webLink = `https://venmo.com/${venmoUsername}?txn=pay&amount=${amount}&note=${encodeURIComponent(paymentNote)}`;
    
    res.json({
        success: true,
        venmoLink,
        webLink,
        paymentNote,
        venmoUsername
    });
}));

// Dashboard stats
app.get('/api/dashboard/stats', requireAuth, asyncHandler(async (req, res) => {
    const totalRegistrations = await dbConfig.get('SELECT COUNT(*) as count FROM registrations');
    const totalRevenue = await dbConfig.get('SELECT SUM(payment_amount) as total FROM registrations WHERE payment_status = \'completed\'');
    const activeCourses = await dbConfig.get(`SELECT COUNT(*) as count FROM courses WHERE is_active = ${dbConfig.isProduction ? 'true' : '1'}`);
    const pendingPayments = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE payment_status = \'pending\'');
    
    res.json({
        totalRegistrations: totalRegistrations.count || 0,
        totalRevenue: totalRevenue.total || 0,
        activeCourses: activeCourses.count || 0,
        pendingPayments: pendingPayments.count || 0
    });
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Initialize database and start server
async function startServer() {
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`🎉 Dance Registration Portal running on http://localhost:${PORT}`);
        console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
        console.log(`🎓 Student Portal: http://localhost:${PORT}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    try {
        await dbConfig.close();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start the server
startServer().catch(console.error);
