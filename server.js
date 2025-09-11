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
const { sendRegistrationConfirmationEmail, sendEmailWithFallback, verifyEmailTransport } = require('./utils/mailer');
const { fetchCourseWithSlots } = require('./utils/schedule');

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

        // Ensure practice_date column exists on course_slots
        try {
            if (dbConfig.isProduction) {
                await dbConfig.run('ALTER TABLE course_slots ADD COLUMN IF NOT EXISTS practice_date DATE');
            } else {
                // SQLite: ignore if column exists
                await dbConfig.run('ALTER TABLE course_slots ADD COLUMN practice_date TEXT').catch(() => {});
            }
            console.log('✅ Ensured course_slots.practice_date column exists');
        } catch (e) {
            console.log('ℹ️ practice_date column check skipped:', e.message || e);
        }
        
        // Run migration if in production (non-blocking so server can start listening)
        if (process.env.NODE_ENV === 'production') {
            const { migrateToPostgres } = require('./migrate-to-postgres');
            migrateToPostgres()
                .then(() => console.log('✅ Background migration completed'))
                .catch((err) => console.error('❌ Background migration failed:', err));
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
app.set('trust proxy', 1);
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

// Local date helpers to avoid timezone shifts when formatting YYYY-MM-DD
function formatLocalDate(dateStr) {
    // Accept both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
        : (dateStr ? new Date(dateStr).toLocaleDateString() : '');
}
function formatLocalDateShort(dateStr) {
    // Accept both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : (dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
}

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
        settingsObj.venmo_username = 'monicaradd';
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
               COUNT(DISTINCT r.id) as registration_count
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
    
    // Get slots and pricing for each course
    const coursesWithSlots = await Promise.all(courses.map(async (course) => {
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed'
            WHERE cs.course_id = $1
            GROUP BY cs.id
            ORDER BY cs.created_at ASC
        `, [course.id]);
        
        // Get pricing for each slot
        const slotsWithPricing = await Promise.all(slots.map(async (slot) => {
            const pricing = await dbConfig.all(`
                SELECT pricing_type, price 
                FROM course_pricing 
                WHERE course_slot_id = $1
            `, [slot.id]);
            
            const pricingObj = {};
            pricing.forEach(p => {
                pricingObj[p.pricing_type] = parseFloat(p.price);
            });
            
            return {
                ...slot,
                pricing: pricingObj
            };
        }));
        
        // Calculate total capacity and available spots across all slots
        const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (slot.available_spots || 0), 0);
        
        // Debug: log slots for crew_practice to verify practice_date coming from DB
        if (course.course_type === 'crew_practice') {
            try {
                console.log('🧪 Course slots', {
                    course_id: course.id,
                    name: course.name,
                    slots: slotsWithPricing.map(s => ({
                        id: s.id,
                        practice_date: s.practice_date,
                        start_time: s.start_time,
                        end_time: s.end_time,
                        location: s.location
                    }))
                });
            } catch (e) {}
        }
        // Build computed schedule_info from slots so frontend always gets full schedule text with times
        let computedScheduleInfo = '';
        const scheduleItems = slotsWithPricing.map(s => {
            const parts = [];
            if (course.course_type === 'crew_practice' && s.practice_date) {
                const dateStr = formatLocalDate(s.practice_date);
                parts.push(dateStr);
            } else if (s.day_of_week) {
                parts.push(`${s.day_of_week}s`);
            }
            const st = s.start_time;
            const et = s.end_time;
            if (st && et) {
                parts.push(`${st} - ${et}`);
            } else if (st) {
                parts.push(st);
            }
            if (s.location) parts.push(`at ${s.location}`);
            return parts.join(' ');
        }).filter(Boolean);

        if (scheduleItems.length > 0) {
            let dateInfo = '';
            const hasPracticeDates = slotsWithPricing.some(s => !!s.practice_date);
            if (!hasPracticeDates) {
                if (course.start_date && course.end_date) {
                    const startDate = formatLocalDate(course.start_date);
                    const endDate = formatLocalDate(course.end_date);
                    dateInfo = ` (${startDate} - ${endDate})`;
                } else if (course.start_date) {
                    const startDate = formatLocalDate(course.start_date);
                    dateInfo = ` (Starts ${startDate})`;
                }
            }
            computedScheduleInfo = scheduleItems.join(' | ') + dateInfo;
        } else {
            computedScheduleInfo = course.schedule_info || '';
        }

        return {
            ...course,
            slots: slotsWithPricing,
            capacity: totalCapacity,
            available_spots: totalAvailableSpots,
            schedule_info: computedScheduleInfo,
            // Backward compatibility fields
            full_course_price: slotsWithPricing[0]?.pricing?.full_package || 0,
            per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 0
        };
    }));
    
    res.json(coursesWithSlots);
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
        start_date, end_date, instructor, schedule_info, prerequisites,
        slots // Array of slot objects with difficulty_level, capacity, pricing, etc.
    } = req.body;
    
    if (!name || !course_type || !slots || slots.length === 0) {
        return res.status(400).json({ error: 'Required fields missing: name, course_type, and at least one slot are required' });
    }
    
    // Validate course type constraints
    if (course_type === 'crew_practice' && slots.length > 1) {
        return res.status(400).json({ error: 'Crew Practice can only have one slot' });
    }
    
    // Create the course
    const courseResult = await dbConfig.run(`
        INSERT INTO courses (
            name, description, course_type, duration_weeks,
            start_date, end_date, instructor, schedule_info, prerequisites
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [
        name, description, course_type, duration_weeks || 1,
        start_date, end_date, instructor, schedule_info, prerequisites
    ]);
    
    // Get course ID
    let courseId;
    if (dbConfig.isProduction) {
        courseId = courseResult[0]?.id;
    } else {
        courseId = courseResult.lastID;
    }
    
    if (!courseId) {
        return res.status(500).json({ error: 'Failed to create course' });
    }
    
    // Create slots and pricing
    for (const slot of slots) {
        const {
            slot_name, difficulty_level, capacity, day_of_week,
            practice_date, start_time, end_time, location, pricing
        } = slot;
        
        if (!difficulty_level || !capacity || !pricing) {
            return res.status(400).json({ error: 'Each slot must have difficulty_level, capacity, and pricing' });
        }
        
        // Create slot
        const slotResult = await dbConfig.run(`
            INSERT INTO course_slots (
                course_id, slot_name, difficulty_level, capacity,
                day_of_week, practice_date, start_time, end_time, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            courseId, slot_name || 'Main Session', difficulty_level, capacity,
            day_of_week, practice_date || null, start_time, end_time, location
        ]);
        
        // Get slot ID
        let slotId;
        if (dbConfig.isProduction) {
            slotId = slotResult[0]?.id;
        } else {
            slotId = slotResult.lastID;
        }
        
        if (!slotId) {
            return res.status(500).json({ error: 'Failed to create slot' });
        }
        
        // Create pricing records
        if (pricing.full_package) {
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, pricing.full_package]);
        }
        
        if (pricing.drop_in) {
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [slotId, pricing.drop_in]);
        }
    }
    
    res.json({ success: true, courseId: courseId });
}));

app.put('/api/courses/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        name, description, course_type, duration_weeks,
        start_date, end_date, instructor, schedule_info, prerequisites, is_active,
        slots // Array of slot objects for updating
    } = req.body;

    // Partially update only fields provided to avoid overwriting required columns with NULL
    const fields = {
        name,
        description,
        course_type,
        duration_weeks,
        start_date,
        end_date,
        instructor,
        schedule_info,
        prerequisites,
        is_active
    };

    const sets = [];
    const params = [];
    let i = 1;
    for (const [col, val] of Object.entries(fields)) {
        if (val !== undefined) {
            let v = val;
            if (col === 'is_active') {
                if (dbConfig.isProduction) {
                    v = (val === true || val === 'true' || val === 1 || val === '1');
                } else {
                    v = (val === true || val === 'true' || val === 1 || val === '1') ? 1 : 0;
                }
            }
            sets.push(`${col} = $${i++}`);
            params.push(v);
        }
    }
    if (sets.length > 0) {
        // updated_at is set directly, no param
        const sql = `UPDATE courses SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${i}`;
        params.push(id);
        await dbConfig.run(sql, params);
    }

    // If slots are provided, replace them
    if (slots && Array.isArray(slots)) {
        // Validate course type constraints if provided
        if (course_type === 'crew_practice' && slots.length > 1) {
            return res.status(400).json({ error: 'Crew Practice can only have one slot' });
        }

        // Delete existing slots and pricing (cascade will handle pricing)
        await dbConfig.run('DELETE FROM course_slots WHERE course_id = $1', [id]);

        // Create new slots
        for (const slot of slots) {
        const {
            slot_name, difficulty_level, capacity, day_of_week,
            practice_date, start_time, end_time, location, pricing
        } = slot;

            if (!difficulty_level || !capacity || !pricing) {
                return res.status(400).json({ error: 'Each slot must have difficulty_level, capacity, and pricing' });
            }

            // Create slot
            const slotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    day_of_week, practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                id, slot_name || 'Main Session', difficulty_level, capacity,
                day_of_week, practice_date || null, start_time, end_time, location
            ]);

            // Get slot ID
            let slotId;
            if (dbConfig.isProduction) {
                slotId = slotResult[0]?.id;
            } else {
                slotId = slotResult.lastID;
            }

            if (!slotId) {
                return res.status(500).json({ error: 'Failed to create slot' });
            }

            // Create pricing records
            if (pricing.full_package) {
                await dbConfig.run(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'full_package', $2)
                `, [slotId, pricing.full_package]);
            }

            if (pricing.drop_in) {
                await dbConfig.run(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'drop_in', $2)
                `, [slotId, pricing.drop_in]);
            }
        }
    }

    res.json({ success: true });
}));

// Slot Management Endpoints
app.post('/api/courses/:id/slots', requireAuth, asyncHandler(async (req, res) => {
    const { id: courseId } = req.params;
        const {
            slot_name, difficulty_level, capacity, day_of_week,
            practice_date, start_time, end_time, location, pricing
        } = req.body;
    
    if (!difficulty_level || !capacity || !pricing) {
        return res.status(400).json({ error: 'difficulty_level, capacity, and pricing are required' });
    }
    
    // Check if course exists and get course type
    const course = await dbConfig.get('SELECT course_type FROM courses WHERE id = $1', [courseId]);
    if (!course) {
        return res.status(404).json({ error: 'Course not found' });
    }
    
    // Check crew practice constraint
    if (course.course_type === 'crew_practice') {
        const existingSlots = await dbConfig.get('SELECT COUNT(*) as count FROM course_slots WHERE course_id = $1', [courseId]);
        if (existingSlots.count >= 1) {
            return res.status(400).json({ error: 'Crew Practice can only have one slot' });
        }
    }
    
    // Create slot
    const slotResult = await dbConfig.run(`
        INSERT INTO course_slots (
            course_id, slot_name, difficulty_level, capacity,
            day_of_week, practice_date, start_time, end_time, location
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [
        courseId, slot_name || 'Main Session', difficulty_level, capacity,
        day_of_week, practice_date || null, start_time, end_time, location
    ]);
    
    // Get slot ID
    let slotId;
    if (dbConfig.isProduction) {
        slotId = slotResult[0]?.id;
    } else {
        slotId = slotResult.lastID;
    }
    
    if (!slotId) {
        return res.status(500).json({ error: 'Failed to create slot' });
    }
    
    // Create pricing records
    if (pricing.full_package) {
        await dbConfig.run(`
            INSERT INTO course_pricing (course_slot_id, pricing_type, price)
            VALUES ($1, 'full_package', $2)
        `, [slotId, pricing.full_package]);
    }
    
    if (pricing.drop_in) {
        await dbConfig.run(`
            INSERT INTO course_pricing (course_slot_id, pricing_type, price)
            VALUES ($1, 'drop_in', $2)
        `, [slotId, pricing.drop_in]);
    }
    
    res.json({ success: true, slotId: slotId });
}));

app.put('/api/courses/:courseId/slots/:slotId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId, slotId } = req.params;
    const {
        slot_name, difficulty_level, capacity, day_of_week,
        practice_date, start_time, end_time, location, pricing
    } = req.body;
    
    // Update slot
    await dbConfig.run(`
        UPDATE course_slots SET
            slot_name = $1, difficulty_level = $2, capacity = $3,
            day_of_week = $4, practice_date = $5, start_time = $6, end_time = $7, location = $8
        WHERE id = $9 AND course_id = $10
    `, [
        slot_name, difficulty_level, capacity, day_of_week,
        practice_date || null, start_time, end_time, location, slotId, courseId
    ]);
    
    // Update pricing if provided
    if (pricing) {
        // Delete existing pricing
        await dbConfig.run('DELETE FROM course_pricing WHERE course_slot_id = $1', [slotId]);
        
        // Create new pricing records
        if (pricing.full_package) {
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, pricing.full_package]);
        }
        
        if (pricing.drop_in) {
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [slotId, pricing.drop_in]);
        }
    }
    
    res.json({ success: true });
}));

app.delete('/api/courses/:courseId/slots/:slotId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId, slotId } = req.params;
    
    // Check if this is the last slot for a course
    const slotCount = await dbConfig.get('SELECT COUNT(*) as count FROM course_slots WHERE course_id = $1', [courseId]);
    if (slotCount.count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last slot. A course must have at least one slot.' });
    }
    
    // Delete slot (pricing will be deleted by cascade)
    await dbConfig.run('DELETE FROM course_slots WHERE id = $1 AND course_id = $2', [slotId, courseId]);
    
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

    // Derive names from student_name if provided (e.g., Crew Practice)
    let effectiveFirstName = first_name;
    let effectiveLastName = last_name;
    if ((!effectiveFirstName && !effectiveLastName) && req.body.student_name) {
        const parts = String(req.body.student_name).trim().split(/\s+/);
        effectiveFirstName = parts.shift() || 'Student';
        effectiveLastName = parts.join(' ') || '';
    }
    
    if (!email || !course_id || !payment_amount) {
        return res.status(400).json({ error: 'Required fields missing: email, course_id, and payment_amount are required' });
    }
    
    // Check if registration is open
    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    if (settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }
    
    // Check capacity using slot-based calculation
    // Capacity check rewritten to avoid join ambiguities: use subqueries for totals
    const courseCheck = await dbConfig.get(`
        SELECT
          c.id,
          c.name,
          c.course_type,
          (
            SELECT COALESCE(SUM(cs.capacity), 0)
            FROM course_slots cs
            WHERE cs.course_id = c.id
          ) AS total_capacity,
          (
            SELECT COUNT(*)
            FROM registrations r
            WHERE r.course_id = c.id
              AND r.payment_status = 'completed'
          ) AS current_registrations
        FROM courses c
        WHERE c.id = $1
          AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `, [course_id]);

    if (!courseCheck) {
        return res.status(400).json({ error: 'Course not found or inactive' });
    }

    const totalCapacityNum = Number(courseCheck.total_capacity) || 0;
    const currentRegistrationsNum = Number(courseCheck.current_registrations) || 0;

    console.log('🔎 Capacity check', {
        courseId: course_id,
        total_capacity: totalCapacityNum,
        current_registrations: currentRegistrationsNum
    });
    
    if (totalCapacityNum === 0) {
        return res.status(400).json({ error: 'Course has no available slots configured' });
    }
    
    if (currentRegistrationsNum >= totalCapacityNum) {
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
            effectiveFirstName || 'Student', effectiveLastName || '', phone, date_of_birth,
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
            effectiveFirstName || 'Student', effectiveLastName || '', email, phone, date_of_birth,
            emergency_contact_name, emergency_contact_phone, medical_conditions,
            dance_experience, instagram, how_heard_about_us
        ]);
        student = { id: result.lastID || result.id, email, first_name: effectiveFirstName || 'Student', last_name: effectiveLastName || '' };
    }
    
    // Create registration
    const registrationResult = await dbConfig.run(`
        INSERT INTO registrations (
            student_id, course_id, payment_amount, payment_status, special_requests
        ) VALUES ($1, $2, $3, 'pending', $4)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [student.id, course_id, payment_amount, special_requests]);
    
    // Handle different return formats for SQLite vs PostgreSQL
    let registrationId;
    if (dbConfig.isProduction) {
        // PostgreSQL with RETURNING returns an array of rows
        registrationId = registrationResult[0]?.id;
    } else {
        // SQLite returns { lastID: ... }
        registrationId = registrationResult.lastID;
    }
    
    console.log('📝 Registration created', { id: registrationId, course_id, email });
    res.json({ 
        success: true, 
        registrationId: registrationId,
        studentId: student.id
    });
}));

// Get registrations
app.get('/api/registrations', requireAuth, asyncHandler(async (req, res) => {
    const { course_id, payment_status } = req.query;
    
    let query = `
        SELECT r.*, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
               c.name as course_name, c.course_type, c.price
        FROM registrations r
        LEFT JOIN students s ON r.student_id = s.id
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

/**
 * Admin: registration counts
 * - GET /api/admin/registrations/count?course_id=5 (optional)
 */
app.get('/api/admin/registrations/count', requireAuth, asyncHandler(async (req, res) => {
    const { course_id } = req.query;
    try {
        let total, pending, completed;
        if (course_id) {
            total = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE course_id = $1', [course_id]);
            pending = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE course_id = $1 AND payment_status = \'pending\'', [course_id]);
            completed = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE course_id = $1 AND payment_status = \'completed\'', [course_id]);
        } else {
            total = await dbConfig.get('SELECT COUNT(*) as count FROM registrations');
            pending = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE payment_status = \'pending\'');
            completed = await dbConfig.get('SELECT COUNT(*) as count FROM registrations WHERE payment_status = \'completed\'');
        }
        res.json({
            total: Number(total?.count || 0),
            pending: Number(pending?.count || 0),
            completed: Number(completed?.count || 0)
        });
    } catch (err) {
        console.error('❌ Count query error:', err);
        res.status(500).json({ error: 'Failed to load registration counts' });
    }
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

/**
 * Admin confirm payment endpoint
 * - Marks payment as completed
 * - If email notifications are enabled, sends a confirmation email to the student
 * - Never fails the payment update due to email errors; returns flags in response
 */
app.put('/api/admin/registrations/:id/confirm-payment', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { venmo_transaction_note } = req.body;

    // 1) Update registration to completed status
    await dbConfig.run(`
        UPDATE registrations SET
            payment_status = 'completed',
            payment_method = 'Venmo',
            paypal_transaction_id = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
    `, [venmo_transaction_note || `Venmo payment confirmed by admin`, id]);

    console.log('✅ Admin confirmed Venmo payment for registration:', id);

    // 2) Prepare to send confirmation email (if enabled)
    let email_sent = false;
    let email_error = null;
    let email_skipped = false;

    try {
        // Check if email notifications are enabled
        const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
        const emailEnabled = setting && setting.setting_value === 'true';

        if (!emailEnabled) {
            email_skipped = true;
            return res.json({ success: true, message: 'Payment confirmed successfully', email_sent, email_skipped });
        }

        // Load registration with student and course info
        const reg = await dbConfig.get(`
            SELECT r.id, r.payment_amount, r.course_id,
                   s.email, s.first_name, s.last_name,
                   c.name AS course_name, c.start_date, c.end_date
            FROM registrations r
            JOIN students s ON s.id = r.student_id
            JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1
        `, [id]);

        if (!reg) {
            console.warn('⚠️ Registration not found for email send:', id);
            return res.json({ success: true, message: 'Payment confirmed successfully (registration not found for email)', email_sent: false });
        }

        // Compute schedule_info consistently with courses endpoint
        const { schedule_info } = await fetchCourseWithSlots(dbConfig, reg.course_id);

        // Send email in background with fallback (don't await)
        sendEmailWithFallback(reg.email, {
            courseName: reg.course_name,
            scheduleInfo: schedule_info,
            amount: reg.payment_amount,
            registrationId: reg.id,
            studentName: [reg.first_name, reg.last_name].filter(Boolean).join(' ')
        }).then(() => {
            console.log('✉️  Sent confirmation email to:', reg.email);
        }).catch(err => {
            console.error('❌ Error sending confirmation email:', err);
        });

        return res.json({ success: true, message: 'Payment confirmed successfully', email_queued: true });
    } catch (err) {
        console.error('❌ Error sending confirmation email:', err);
        email_error = err.message || String(err);
        // Do not fail the payment update due to email issues
        return res.json({ success: true, message: 'Payment confirmed successfully', email_sent, email_error });
    }
}));

/**
 * Admin resend confirmation email endpoint
 * - Allows resending the confirmation email without changing payment status
 */
app.post('/api/admin/registrations/:id/resend-confirmation', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    let email_sent = false;
    let email_error = null;
    let email_skipped = false;

    try {
        // Check if email notifications are enabled
        const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
        const emailEnabled = setting && setting.setting_value === 'true';

        if (!emailEnabled) {
            email_skipped = true;
            return res.json({ success: true, message: 'Email notifications are disabled', email_sent, email_skipped });
        }

        // Load registration with student and course info
        const reg = await dbConfig.get(`
            SELECT r.id, r.payment_amount, r.course_id,
                   s.email, s.first_name, s.last_name,
                   c.name AS course_name, c.start_date, c.end_date
            FROM registrations r
            JOIN students s ON s.id = r.student_id
            JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1
        `, [id]);

        if (!reg) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        const { schedule_info } = await fetchCourseWithSlots(dbConfig, reg.course_id);

        // Send email in background with fallback (don't await)
        sendEmailWithFallback(reg.email, {
            courseName: reg.course_name,
            scheduleInfo: schedule_info,
            amount: reg.payment_amount,
            registrationId: reg.id,
            studentName: [reg.first_name, reg.last_name].filter(Boolean).join(' ')
        }).then(() => {
            console.log('✉️  Resent confirmation email to:', reg.email);
        }).catch(err => {
            console.error('❌ Error resending confirmation email:', err);
        });

        res.json({ success: true, message: 'Confirmation email queued', email_queued: true });
    } catch (err) {
        console.error('❌ Error resending confirmation email:', err);
        email_error = err.message || String(err);
        res.json({ success: true, message: 'Resend attempted', email_sent, email_error });
    }
}));

/**
 * Admin debug endpoint to inspect email config detection (no secrets exposed)
 */
app.get('/api/admin/debug-email-config', requireAuth, asyncHandler(async (req, res) => {
    const rawService = process.env.EMAIL_SERVICE;
    const rawHost = process.env.EMAIL_HOST;
    const rawUser = process.env.EMAIL_USER;
    const rawPort = process.env.EMAIL_PORT;
    const rawPass = process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS;

    const service = rawService ? String(rawService).trim().toLowerCase() : '';
    const host = rawHost ? String(rawHost).trim() : '';
    const user = rawUser ? String(rawUser).trim() : '';
    const pass = rawPass ? String(rawPass).trim() : '';
    const port = rawPort ? Number(rawPort) : undefined;

    let chosenTransport = 'none';
    if (service) {
        chosenTransport = 'service';
    } else if (host) {
        chosenTransport = 'host';
    } else if (user && pass) {
        chosenTransport = 'gmail_fallback';
    }

    res.json({
        hasService: !!service,
        service,
        hasHost: !!host,
        hasUser: !!user,
        hasPass: !!pass,
        port: port || 587,
        chosenTransport
    });
}));

/**
 * Admin test email transport endpoint - verifies SMTP connectivity
 */
app.post('/api/admin/test-email-transport', requireAuth, asyncHandler(async (req, res) => {
    try {
        const result = await verifyEmailTransport();
        res.json({ 
            success: true, 
            message: 'Email transport verified successfully',
            details: result
        });
    } catch (error) {
        console.error('❌ Email transport test failed:', error);
        res.json({ 
            success: false, 
            error: error.message || String(error),
            details: error
        });
    }
}));

/**
 * Admin debug: fetch raw course slots (practice_date, etc.)
 */
app.get('/api/admin/debug/course-slots/:courseId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    try {
        const course = await dbConfig.get('SELECT * FROM courses WHERE id = $1', [courseId]);
        const slots = await dbConfig.all('SELECT * FROM course_slots WHERE course_id = $1 ORDER BY created_at ASC', [courseId]);
        res.json({ course, slots });
    } catch (err) {
        console.error('❌ Debug course slots error:', err);
        res.status(500).json({ error: 'Failed to load course slots' });
    }
}));

// Generate Venmo payment link
app.post('/api/generate-venmo-link', asyncHandler(async (req, res) => {
    const { registrationId, amount, courseName } = req.body;
    
    if (!registrationId || !amount) {
        return res.status(400).json({ error: 'Registration ID and amount are required' });
    }
    
    // Get Venmo username from settings
    const venmoSetting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['venmo_username']);
    const venmoUsername = venmoSetting ? venmoSetting.setting_value : 'monicaradd';
    
    // Create payment note with date or date range if available
    let courseDisplayName = courseName;
    let dateRangeText = '';
    try {
        const regCourse = await dbConfig.get(`
            SELECT r.id as registration_id, c.name as course_name, c.course_type, c.start_date, c.end_date
            FROM registrations r
            JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1
        `, [registrationId]);

            if (regCourse) {
                courseDisplayName = regCourse.course_name || courseDisplayName;
                const fmt = (d) => formatLocalDateShort(d);

                if (regCourse.course_type === 'crew_practice') {
                // Prefer single practice_date from slot if available
                const slot = await dbConfig.get(`
                    SELECT practice_date FROM course_slots
                    WHERE course_id = (SELECT course_id FROM registrations WHERE id = $1)
                    ORDER BY created_at ASC
                    LIMIT 1
                `, [registrationId]);
                if (slot && slot.practice_date) {
                    dateRangeText = ` (${fmt(slot.practice_date)})`;
                } else if (regCourse.start_date) {
                    dateRangeText = ` (${fmt(regCourse.start_date)})`;
                }
            } else {
                if (regCourse.start_date && regCourse.end_date) {
                    dateRangeText = ` (${fmt(regCourse.start_date)} - ${fmt(regCourse.end_date)})`;
                } else if (regCourse.start_date) {
                    dateRangeText = ` (${fmt(regCourse.start_date)})`;
                }
            }
        }
    } catch (e) {
        console.warn('⚠️ Could not load course dates for Venmo note:', e.message || e);
    }
    const paymentNote = `Dance Registration #${registrationId}${courseDisplayName ? ` - ${courseDisplayName}` : ''}${dateRangeText}`;
    
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

/**
 * Admin reset: keep only one course active and clear all registrations (revenue)
 * Body: { keep_course_id: number, delete_other_courses?: boolean }
 * - Deletes ALL registrations (resets revenue to 0)
 * - Activates keep_course_id and deactivates all others (or deletes others if delete_other_courses is true)
 */
app.post('/api/admin/reset-keep-course', requireAuth, asyncHandler(async (req, res) => {
    const { keep_course_id, delete_other_courses } = req.body || {};
    if (!keep_course_id) {
        return res.status(400).json({ error: 'keep_course_id is required' });
    }

    // Verify course exists
    const keepCourse = await dbConfig.get('SELECT id, name FROM courses WHERE id = $1', [keep_course_id]);
    if (!keepCourse) {
        return res.status(404).json({ error: 'Course to keep not found' });
    }

    // 1) Delete all registrations (cleans up revenue and admin registrations list)
    await dbConfig.run('DELETE FROM registrations');

    // 2) Keep only the specified course active
    if (delete_other_courses === true) {
        // Delete all other courses entirely
        await dbConfig.run('DELETE FROM courses WHERE id != $1', [keep_course_id]);

        // Optionally reset sequences in production (PostgreSQL)
        if (dbConfig.isProduction) {
            try {
                await dbConfig.run('ALTER SEQUENCE courses_id_seq RESTART WITH 1');
                await dbConfig.run('ALTER SEQUENCE registrations_id_seq RESTART WITH 1');
            } catch (e) {
                console.warn('Sequence reset skipped:', e.message || e);
            }
        }
    } else {
        // Deactivate all other courses
        await dbConfig.run(
            `UPDATE courses SET is_active = ${dbConfig.isProduction ? 'false' : '0'} WHERE id != $1`,
            [keep_course_id]
        );
        // Ensure the kept course is active
        await dbConfig.run(
            `UPDATE courses SET is_active = ${dbConfig.isProduction ? 'true' : '1'} WHERE id = $1`,
            [keep_course_id]
        );
    }

    console.log('🔄 Admin reset complete', {
        keep_course_id,
        delete_other_courses: !!delete_other_courses
    });

    res.json({
        success: true,
        message: `Reset complete. Kept course #${keep_course_id} active and cleared all registrations.`,
        kept_course: keepCourse,
        deleted_all_registrations: true,
        deleted_other_courses: !!delete_other_courses
    });
}));

// Clear all courses (admin only)
app.delete('/api/admin/clear-all-courses', requireAuth, asyncHandler(async (req, res) => {
    console.log('🗑️  Admin requested to clear all courses');
    
    try {
        // Get count of existing courses
        const countResult = await dbConfig.get('SELECT COUNT(*) as count FROM courses');
        const courseCount = countResult.count;
        console.log(`📊 Found ${courseCount} courses to delete`);
        
        if (courseCount === 0) {
            return res.json({ success: true, message: 'No courses found to delete', deleted: 0 });
        }
        
        // Delete all registrations first (to maintain referential integrity)
        await dbConfig.run('DELETE FROM registrations');
        console.log('🗑️  Deleted all registrations');
        
        // Delete all courses
        await dbConfig.run('DELETE FROM courses');
        console.log('🗑️  Deleted all courses');
        
        // Reset sequences if in production (PostgreSQL)
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER SEQUENCE courses_id_seq RESTART WITH 1');
            await dbConfig.run('ALTER SEQUENCE registrations_id_seq RESTART WITH 1');
            console.log('🔄 Reset ID sequences');
        }
        
        console.log('🎉 Successfully cleared all dance courses and registrations!');
        
        res.json({ 
            success: true, 
            message: `Successfully deleted ${courseCount} courses and all associated registrations`,
            deleted: courseCount
        });
        
    } catch (error) {
        console.error('❌ Error clearing courses:', error);
        res.status(500).json({ error: 'Failed to clear courses', details: error.message });
    }
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
