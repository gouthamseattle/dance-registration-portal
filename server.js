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

        // Ensure attendance tables exist
        try {
            if (dbConfig.isProduction) {
                await dbConfig.run(`
                    CREATE TABLE IF NOT EXISTS class_sessions (
                        id SERIAL PRIMARY KEY,
                        course_id INTEGER NOT NULL,
                        session_date DATE NOT NULL,
                        start_time TEXT,
                        end_time TEXT,
                        location TEXT,
                        notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await dbConfig.run(`
                    CREATE TABLE IF NOT EXISTS attendance_records (
                        id SERIAL PRIMARY KEY,
                        session_id INTEGER NOT NULL,
                        student_id INTEGER NOT NULL,
                        status TEXT CHECK (status IN ('present','absent','late')) NOT NULL,
                        marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        marked_by INTEGER
                    )
                `);
                await dbConfig.run(`
                    CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_session_student
                    ON attendance_records(session_id, student_id)
                `);
            } else {
                await dbConfig.run(`
                    CREATE TABLE IF NOT EXISTS class_sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        course_id INTEGER NOT NULL,
                        session_date TEXT NOT NULL,
                        start_time TEXT,
                        end_time TEXT,
                        location TEXT,
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                await dbConfig.run(`
                    CREATE TABLE IF NOT EXISTS attendance_records (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        student_id INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        marked_by INTEGER
                    )
                `);
                await dbConfig.run(`
                    CREATE UNIQUE INDEX IF NOT EXISTS attendance_unique_session_student
                    ON attendance_records(session_id, student_id)
                `);
            }
            console.log('✅ Ensured attendance tables exist');
        } catch (e) {
            console.log('ℹ️ Attendance tables check skipped:', e.message || e);
        }

        // Ensure payment_method column exists on registrations table
        try {
            if (dbConfig.isProduction) {
                await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10)');
            } else {
                // SQLite: ignore if column exists
                await dbConfig.run('ALTER TABLE registrations ADD COLUMN payment_method TEXT').catch(() => {});
            }
            console.log('✅ Ensured registrations.payment_method column exists');
        } catch (e) {
            console.log('ℹ️ payment_method column check skipped:', e.message || e);
        }

        // Ensure student profile and access control columns exist
        try {
            if (dbConfig.isProduction) {
                await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS student_type VARCHAR(20) DEFAULT \'general\'');
                await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT FALSE');
                await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_classified BOOLEAN DEFAULT FALSE');
                await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(255)');
                await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS required_student_type VARCHAR(20) DEFAULT \'any\'');
            } else {
                // SQLite: ignore if column exists
                await dbConfig.run('ALTER TABLE students ADD COLUMN student_type TEXT DEFAULT \'general\'').catch(() => {});
                await dbConfig.run('ALTER TABLE students ADD COLUMN profile_complete INTEGER DEFAULT 0').catch(() => {});
                await dbConfig.run('ALTER TABLE students ADD COLUMN admin_classified INTEGER DEFAULT 0').catch(() => {});
                await dbConfig.run('ALTER TABLE students ADD COLUMN instagram_handle TEXT').catch(() => {});
                await dbConfig.run('ALTER TABLE courses ADD COLUMN required_student_type TEXT DEFAULT \'any\'').catch(() => {});
            }
            console.log('✅ Ensured student profile and access control columns exist');
        } catch (e) {
            console.log('ℹ️ Student profile columns check skipped:', e.message || e);
        }
        
        // Run migration if in production (non-blocking so server can start listening)
        if (process.env.NODE_ENV === 'production') {
            const { migrateToPostgres } = require('./scripts/migrate-to-postgres');
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
    
    // Set default Zelle info if not configured (phone only, no email)
    if (!settingsObj.zelle_recipient_name) {
        settingsObj.zelle_recipient_name = 'Monica Radhakrishnan';
    }
    if (!settingsObj.zelle_phone) {
        settingsObj.zelle_phone = '4252159818';
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

// Student Profile and Access Control APIs

/**
 * Check student profile by email
 * POST /api/check-student-profile
 * Body: { email: string }
 * Returns: { exists: boolean, student?: object, eligible_courses?: array }
 */
app.post('/api/check-student-profile', asyncHandler(async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if student exists
    const student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);
    
    if (!student) {
        return res.json({ 
            exists: false,
            new_student: true 
        });
    }
    
    // Get eligible courses based on student type
    let courseQuery = `
        SELECT c.*, COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed'
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `;
    
    const params = [];
    
    // Filter courses based on student access level
    if (student.student_type === 'crew_member') {
        // Crew members can access all courses
        courseQuery += ' AND (c.required_student_type = \'any\' OR c.required_student_type = \'crew_member\')';
    } else {
        // General students can only access courses open to all
        courseQuery += ' AND c.required_student_type = \'any\'';
    }
    
    courseQuery += ' GROUP BY c.id ORDER BY c.created_at DESC';
    
    const eligibleCourses = await dbConfig.all(courseQuery, params);
    
    // Get courses with slots for each eligible course
    const coursesWithSlots = await Promise.all(eligibleCourses.map(async (course) => {
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
        
        // Calculate totals and build schedule info (same logic as /api/courses)
        const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (slot.available_spots || 0), 0);
        
        // Build computed schedule_info
        let computedScheduleInfo = '';
        const scheduleItems = slotsWithPricing.map(s => {
            const parts = [];
            if (course.course_type === 'crew_practice' && s.practice_date) {
                const dateStr = formatLocalDate(s.practice_date);
                parts.push(dateStr);
            } else if (course.course_type === 'drop_in' && s.practice_date) {
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
            full_course_price: slotsWithPricing[0]?.pricing?.full_package || 0,
            per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 0
        };
    }));
    
    res.json({
        exists: true,
        student: {
            id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            email: student.email,
            instagram_handle: student.instagram_handle,
            dance_experience: student.dance_experience,
            student_type: student.student_type,
            profile_complete: dbConfig.isProduction ? student.profile_complete : Boolean(student.profile_complete)
        },
        eligible_courses: coursesWithSlots
    });
}));

/**
 * Create student profile
 * POST /api/create-student-profile
 * Body: { email, first_name, last_name, instagram_handle, dance_experience }
 */
app.post('/api/create-student-profile', asyncHandler(async (req, res) => {
    const { email, first_name, last_name, instagram_handle, dance_experience } = req.body;
    
    if (!email || !first_name) {
        return res.status(400).json({ error: 'Email and first name are required' });
    }
    
    // Check if student already exists
    const existingStudent = await dbConfig.get('SELECT id FROM students WHERE email = $1', [email]);
    if (existingStudent) {
        return res.status(400).json({ error: 'Student with this email already exists' });
    }
    
    // Create new student with profile_complete = true, admin_classified = false
    const result = await dbConfig.run(`
        INSERT INTO students (
            first_name, last_name, email, instagram_handle, dance_experience,
            student_type, profile_complete, admin_classified
        ) VALUES ($1, $2, $3, $4, $5, 'general', ${dbConfig.isProduction ? 'true' : '1'}, ${dbConfig.isProduction ? 'false' : '0'})
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [first_name, last_name || '', email, instagram_handle || '', dance_experience || '']);
    
    let studentId;
    if (dbConfig.isProduction) {
        studentId = result[0]?.id;
    } else {
        studentId = result.lastID;
    }
    
    if (!studentId) {
        return res.status(500).json({ error: 'Failed to create student profile' });
    }
    
    // Get eligible courses (only open to all since new students default to 'general')
    let courseQuery = `
        SELECT c.*, COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed'
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'} 
        AND c.required_student_type = 'any'
        GROUP BY c.id ORDER BY c.created_at DESC
    `;
    
    const eligibleCourses = await dbConfig.all(courseQuery);
    
    console.log('👤 New student profile created:', { id: studentId, email, first_name });
    
    res.json({ 
        success: true,
        student: {
            id: studentId,
            first_name,
            last_name: last_name || '',
            email,
            instagram_handle: instagram_handle || '',
            dance_experience: dance_experience || '',
            student_type: 'general',
            profile_complete: true
        },
        eligible_courses: eligibleCourses
    });
}));

/**
 * Admin: Get pending student classifications
 * GET /api/admin/students/pending
 */
app.get('/api/admin/students/pending', requireAuth, asyncHandler(async (req, res) => {
    const students = await dbConfig.all(`
        SELECT s.*, 
               COUNT(r.id) as registration_count,
               MAX(r.registration_date) as last_registration
        FROM students s
        LEFT JOIN registrations r ON r.student_id = s.id
        WHERE s.admin_classified = ${dbConfig.isProduction ? 'false' : '0'}
        AND s.profile_complete = ${dbConfig.isProduction ? 'true' : '1'}
        GROUP BY s.id
        ORDER BY s.created_at DESC
    `);

    const pendingStudents = students.map(s => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        instagram_handle: s.instagram_handle,
        dance_experience: s.dance_experience,
        student_type: s.student_type,
        registration_count: Number(s.registration_count || 0),
        last_registration: s.last_registration,
        created_at: s.created_at
    }));

    res.json(pendingStudents);
}));

/**
 * Admin: Classify student type
 * PUT /api/admin/students/:id/classify
 * Body: { student_type: 'general' | 'crew_member' }
 */
app.put('/api/admin/students/:id/classify', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { student_type } = req.body;

    if (!student_type || !['general', 'crew_member'].includes(student_type)) {
        return res.status(400).json({ error: 'student_type must be either "general" or "crew_member"' });
    }

    // Update student classification
    await dbConfig.run(`
        UPDATE students SET 
            student_type = $1, 
            admin_classified = ${dbConfig.isProduction ? 'true' : '1'},
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
    `, [student_type, id]);

    console.log('👤 Student classified:', { id, student_type, admin: req.session.adminUsername });

    res.json({ success: true, student_type });
}));

/**
 * Admin: Get crew member candidates from existing registrations
 * GET /api/admin/crew-member-candidates
 */
app.get('/api/admin/crew-member-candidates', requireAuth, asyncHandler(async (req, res) => {
    // Use database-appropriate string aggregation function
    const stringAggFunction = dbConfig.isProduction ? 'STRING_AGG(c.name, \', \')' : 'GROUP_CONCAT(c.name)';
    
    const candidates = await dbConfig.all(`
        SELECT DISTINCT s.*, 
               COUNT(r.id) as crew_registrations,
               ${stringAggFunction} as crew_courses
        FROM students s
        JOIN registrations r ON r.student_id = s.id
        JOIN courses c ON c.id = r.course_id
        WHERE c.course_type = 'crew_practice'
        AND r.payment_status = 'completed'
        GROUP BY s.id, s.first_name, s.last_name, s.email, s.instagram_handle, s.dance_experience, s.student_type, s.admin_classified, s.created_at
        ORDER BY s.created_at DESC
    `);

    const crewCandidates = candidates.map(s => ({
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        instagram_handle: s.instagram_handle,
        dance_experience: s.dance_experience,
        current_student_type: s.student_type,
        crew_registrations: Number(s.crew_registrations || 0),
        crew_courses: s.crew_courses || '',
        admin_classified: dbConfig.isProduction ? s.admin_classified : Boolean(s.admin_classified),
        created_at: s.created_at
    }));

    res.json(crewCandidates);
}));

/**
 * Admin: Get all crew members for enhanced visibility
 * GET /api/admin/crew-members
 */
app.get('/api/admin/crew-members', requireAuth, asyncHandler(async (req, res) => {
    const crewMembers = await dbConfig.all(`
        SELECT s.id, s.first_name, s.last_name, s.email, s.instagram_handle, s.created_at,
               COUNT(r.id) as total_registrations
        FROM students s
        LEFT JOIN registrations r ON s.id = r.student_id
        WHERE s.student_type = 'crew_member'
        GROUP BY s.id, s.first_name, s.last_name, s.email, s.instagram_handle, s.created_at
        ORDER BY s.first_name ASC, s.last_name ASC
    `);

    const formatted = crewMembers.map(s => ({
        id: s.id,
        first_name: s.first_name || '',
        last_name: s.last_name || '',
        email: s.email,
        instagram_handle: s.instagram_handle || '',
        total_registrations: Number(s.total_registrations || 0),
        created_at: s.created_at
    }));

    res.json(formatted);
}));

/**
 * Admin: Run historical student classification analysis
 * POST /api/admin/historical-classification/analyze
 */
app.post('/api/admin/historical-classification/analyze', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { classifyHistoricalStudents } = require('./scripts/classify-historical-students');
        const analysisResult = await classifyHistoricalStudents();
        
        console.log('✅ Historical classification analysis completed for admin request');
        res.json(analysisResult);
    } catch (error) {
        console.error('❌ Historical classification analysis failed:', error);
        res.status(500).json({ 
            error: 'Failed to analyze historical students',
            details: error.message 
        });
    }
}));

/**
 * Admin: Apply historical classification suggestions
 * POST /api/admin/historical-classification/apply
 * Body: { student_ids: [1, 2, 3], action: 'approve' | 'reject' }
 */
app.post('/api/admin/historical-classification/apply', requireAuth, asyncHandler(async (req, res) => {
    const { student_ids, action } = req.body;
    
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
        return res.status(400).json({ error: 'student_ids array is required' });
    }
    
    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }

    try {
        let updatedCount = 0;
        
        if (action === 'approve') {
            // Read the analysis file to get the suggestions
            const fs = require('fs');
            const analysisPath = 'scripts/classification-analysis.json';
            
            if (!fs.existsSync(analysisPath)) {
                return res.status(400).json({ 
                    error: 'Classification analysis not found. Please run analysis first.' 
                });
            }
            
            const analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf8'));
            const suggestions = analysisData.suggestions.filter(s => 
                student_ids.includes(s.id) && s.action === 'suggest_crew_member'
            );
            
            // Apply classifications for approved students
            for (const suggestion of suggestions) {
                await dbConfig.run(`
                    UPDATE students SET 
                        student_type = $1, 
                        admin_classified = ${dbConfig.isProduction ? 'true' : '1'},
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $2
                `, [suggestion.suggestedType, suggestion.id]);
                
                updatedCount++;
                console.log(`👤 Applied classification: Student ${suggestion.id} → ${suggestion.suggestedType}`);
            }
        } else if (action === 'reject') {
            // Mark as classified but keep current type
            for (const studentId of student_ids) {
                await dbConfig.run(`
                    UPDATE students SET 
                        admin_classified = ${dbConfig.isProduction ? 'true' : '1'},
                        updated_at = CURRENT_TIMESTAMP 
                    WHERE id = $1
                `, [studentId]);
                
                updatedCount++;
                console.log(`👤 Marked as classified (rejected): Student ${studentId}`);
            }
        }

        console.log(`✅ Historical classification ${action}: ${updatedCount} students updated`);
        
        res.json({ 
            success: true,
            action,
            updated_count: updatedCount,
            message: `Successfully ${action === 'approve' ? 'applied classifications to' : 'marked as reviewed'} ${updatedCount} students`
        });
        
    } catch (error) {
        console.error('❌ Historical classification application failed:', error);
        res.status(500).json({ 
            error: 'Failed to apply classifications',
            details: error.message 
        });
    }
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
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            effectiveFirstName || 'Student', effectiveLastName || '', email, phone, date_of_birth,
            emergency_contact_name, emergency_contact_phone, medical_conditions,
            dance_experience, instagram, how_heard_about_us
        ]);
        let newStudentId;
        if (dbConfig.isProduction) {
            newStudentId = result[0]?.id;
        } else {
            newStudentId = result.lastID;
        }
        student = { id: newStudentId, email, first_name: effectiveFirstName || 'Student', last_name: effectiveLastName || '' };
    }
    
    // De-duplication guard: prevent multiple registrations for the same student and course
    // 1) If a completed registration exists, block a new registration
    const existingCompleted = await dbConfig.get(
        'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'completed\' LIMIT 1',
        [student.id, course_id]
    );
    if (existingCompleted) {
        console.log('⚠️ Duplicate registration attempt (already completed):', { student_id: student.id, course_id });
        return res.status(400).json({ error: 'You are already registered and paid for this course' });
    }
    // 2) If a pending registration exists, return it instead of creating a duplicate
    const existingPending = await dbConfig.get(
        'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'pending\' ORDER BY registration_date DESC LIMIT 1',
        [student.id, course_id]
    );
    if (existingPending) {
        console.log('ℹ️ Returning existing pending registration', { id: existingPending.id, student_id: student.id, course_id });
        return res.json({ 
            success: true, 
            registrationId: existingPending.id, 
            studentId: student.id,
            deduped: true
        });
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
        SELECT r.*, s.id AS student_id, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
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
 * Admin CSV export for registrations
 * GET /api/admin/registrations/export?course_id=&payment_status=
 */
app.get('/api/admin/registrations/export', requireAuth, asyncHandler(async (req, res) => {
    try {
        const { course_id, payment_status } = req.query;

        let query = `
            SELECT r.*, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
                   c.name as course_name
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

        const rows = await dbConfig.all(query, params);

        // CSV helpers
        const esc = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            const needsQuotes = s.includes(',') || s.includes('\n') || s.includes('"');
            return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const headers = ['Registration ID','Name','Email','Phone','Instagram ID','Dance Experience','Course','Registration Type','Amount','Payment Status','Date'];
        const lines = [headers.join(',')];

        for (const r of rows) {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
            const amountStr = (typeof r.payment_amount === 'number')
                ? r.payment_amount.toFixed(2)
                : (r.payment_amount || '');
            const line = [
                esc(`#${r.id}`),
                esc(name),
                esc(r.email || ''),
                esc(r.phone || ''),
                esc(r.instagram_id || ''),
                esc(r.dance_experience || ''),
                esc(r.course_name || 'Drop-in Class'),
                esc(r.registration_type || ''),
                esc(amountStr),
                esc(r.payment_status || ''),
                esc(new Date(r.registration_date).toLocaleDateString())
            ].join(',');
            lines.push(line);
        }

        const csv = lines.join('\n');
        const filename = `registrations-${new Date().toISOString().slice(0,10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        console.error('❌ CSV export failed:', err);
        res.status(500).json({ error: 'Failed to export registrations' });
    }
}));

// Alias endpoint for admin to fetch registrations (same behavior as /api/registrations)
app.get('/api/admin/registrations', requireAuth, asyncHandler(async (req, res) => {
    const { course_id, payment_status } = req.query;
    
    let query = `
        SELECT r.*, s.id AS student_id, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
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

/**
 * Admin Analytics: registrations by series
 * GET /api/admin/analytics/registrations-by-series
 * Returns: [{ course_id, course_name, total, completed, pending, failed }]
 */
app.get('/api/admin/analytics/registrations-by-series', requireAuth, asyncHandler(async (req, res) => {
    try {
        const rows = await dbConfig.all(`
            SELECT 
                c.id AS course_id,
                c.name AS course_name,
                COUNT(r.id) AS total,
                SUM(CASE WHEN r.payment_status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN r.payment_status = 'failed' THEN 1 ELSE 0 END) AS failed
            FROM courses c
            LEFT JOIN registrations r ON r.course_id = c.id
            GROUP BY c.id, c.name
            ORDER BY c.created_at DESC
        `, []);
        // Coerce counts to numbers for consistency across DBs
        const data = rows.map(r => ({
            course_id: Number(r.course_id),
            course_name: r.course_name,
            total: Number(r.total || 0),
            completed: Number(r.completed || 0),
            pending: Number(r.pending || 0),
            failed: Number(r.failed || 0)
        }));
        res.json(data);
    } catch (err) {
        console.error('❌ Analytics by series failed:', err);
        res.status(500).json({ error: 'Failed to load analytics by series' });
    }
}));

/**
 * Admin Analytics: registrations by status
 * GET /api/admin/analytics/registrations-by-status
 * Returns: { totals: { completed, pending, failed, other }, breakdown: [{ status, count }] }
 */
app.get('/api/admin/analytics/registrations-by-status', requireAuth, asyncHandler(async (req, res) => {
    try {
        const rows = await dbConfig.all(`
            SELECT r.payment_status AS status, COUNT(*) AS count
            FROM registrations r
            GROUP BY r.payment_status
        `, []);
        const breakdown = rows.map(r => ({
            status: r.status || 'unknown',
            count: Number(r.count || 0)
        }));
        const totals = breakdown.reduce((acc, row) => {
            if (row.status === 'completed') acc.completed += row.count;
            else if (row.status === 'pending') acc.pending += row.count;
            else if (row.status === 'failed') acc.failed += row.count;
            else acc.other += row.count;
            return acc;
        }, { completed: 0, pending: 0, failed: 0, other: 0 });
        res.json({ totals, breakdown });
    } catch (err) {
        console.error('❌ Analytics by status failed:', err);
        res.status(500).json({ error: 'Failed to load analytics by status' });
    }
}));

/**
 * Attendance APIs
 */

// Create a session for a course
app.post('/api/admin/courses/:courseId/sessions', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { session_date, start_time, end_time, location, notes } = req.body || {};
    if (!session_date) {
        return res.status(400).json({ error: 'session_date is required (YYYY-MM-DD)' });
    }
    // Verify course exists
    const course = await dbConfig.get('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!course) {
        return res.status(404).json({ error: 'Course not found' });
    }

    const sql = `
        INSERT INTO class_sessions (course_id, session_date, start_time, end_time, location, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `;
    const result = await dbConfig.run(sql, [courseId, session_date, start_time || null, end_time || null, location || null, notes || null]);
    const newId = dbConfig.isProduction ? result[0]?.id : result.lastID;
    res.json({ success: true, session_id: newId });
}));

/**
 * Attendance APIs
 */

// List sessions for a course
app.get('/api/admin/courses/:courseId/sessions', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const rows = await dbConfig.all(
        'SELECT * FROM class_sessions WHERE course_id = $1 ORDER BY session_date ASC, created_at ASC',
        [courseId]
    );
    res.json(rows);
}));

// Create a session for a course
app.post('/api/admin/courses/:courseId/sessions', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { session_date, start_time, end_time, location, notes } = req.body || {};
    if (!session_date) {
        return res.status(400).json({ error: 'session_date is required (YYYY-MM-DD)' });
    }
    // Verify course exists
    const course = await dbConfig.get('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!course) {
        return res.status(404).json({ error: 'Course not found' });
    }

    const sql = `
        INSERT INTO class_sessions (course_id, session_date, start_time, end_time, location, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `;
    const result = await dbConfig.run(sql, [courseId, session_date, start_time || null, end_time || null, location || null, notes || null]);
    const newId = dbConfig.isProduction ? result[0]?.id : result.lastID;
    res.json({ success: true, session_id: newId });
}));

// Bulk mark attendance for a session
app.post('/api/admin/sessions/:sessionId/attendance', requireAuth, asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { records } = req.body || {};
    const adminId = req.session.adminId || null;

    if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'records array is required' });
    }

    // Verify session exists
    const sessionRow = await dbConfig.get('SELECT id FROM class_sessions WHERE id = $1', [sessionId]);
    if (!sessionRow) {
        return res.status(404).json({ error: 'Session not found' });
    }

    const validStatuses = new Set(['present', 'absent', 'late']);
    for (const rec of records) {
        const sid = Number(rec?.student_id);
        const status = String(rec?.status || '').toLowerCase();

        if (!sid || !validStatuses.has(status)) {
            return res.status(400).json({ error: 'Each record must include valid student_id and status in [present, absent, late]' });
        }

        if (dbConfig.isProduction) {
            await dbConfig.run(`
                INSERT INTO attendance_records (session_id, student_id, status, marked_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (session_id, student_id)
                DO UPDATE SET status = EXCLUDED.status, marked_at = CURRENT_TIMESTAMP, marked_by = EXCLUDED.marked_by
            `, [sessionId, sid, status, adminId]);
        } else {
            // SQLite upsert
            await dbConfig.run(`
                INSERT INTO attendance_records (session_id, student_id, status, marked_by)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT(session_id, student_id)
                DO UPDATE SET status = excluded.status, marked_at = CURRENT_TIMESTAMP, marked_by = excluded.marked_by
            `, [sessionId, sid, status, adminId]);
        }
    }

    res.json({ success: true, updated: records.length });
}));

// Fetch attendance for a session
app.get('/api/admin/sessions/:sessionId/attendance', requireAuth, asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const rows = await dbConfig.all('SELECT student_id, status FROM attendance_records WHERE session_id = $1', [sessionId]);
    const data = rows.map(r => ({
        student_id: Number(r.student_id),
        status: String(r.status || '').toLowerCase()
    }));
    res.json(data);
}));

// Attendance summary for a course (series-level)
app.get('/api/admin/courses/:courseId/attendance/summary', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    // Total sessions for the course
    const totalRow = await dbConfig.get('SELECT COUNT(*) as count FROM class_sessions WHERE course_id = $1', [courseId]);
    const totalSessions = Number(totalRow?.count || 0);

    // If no sessions, return empty summary
    if (totalSessions === 0) {
        return res.json({ total_sessions: 0, students: [] });
    }

    // Per-student present counts across the course sessions
    const rows = await dbConfig.all(`
        SELECT 
            s.id AS student_id,
            s.first_name,
            s.last_name,
            s.email,
            SUM(CASE WHEN ar.status = 'present' THEN 1 ELSE 0 END) AS present_count
        FROM registrations r
        JOIN students s ON s.id = r.student_id
        LEFT JOIN attendance_records ar 
            ON ar.student_id = s.id 
           AND ar.session_id IN (SELECT id FROM class_sessions WHERE course_id = $1)
        WHERE r.course_id = $1
        GROUP BY s.id, s.first_name, s.last_name, s.email
        ORDER BY s.last_name ASC, s.first_name ASC
    `, [courseId]);

    const students = rows.map(r => {
        const present = Number(r.present_count || 0);
        const completion_pct = totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0;
        return {
            student_id: Number(r.student_id),
            first_name: r.first_name || '',
            last_name: r.last_name || '',
            email: r.email || '',
            present_count: present,
            total_sessions: totalSessions,
            completion_pct
        };
    });

    res.json({ total_sessions: totalSessions, students });
}));

// Update registration payment status (restored)
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

        // Send email using SendGrid
        sendRegistrationConfirmationEmail(reg.email, {
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

        // Send email using SendGrid
        sendRegistrationConfirmationEmail(reg.email, {
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
 * Admin: assign/link a student to a registration missing student_id
 * Body: { email: string, first_name?: string, last_name?: string }
 */
app.put('/api/admin/registrations/:id/assign-student', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { email, first_name, last_name } = req.body || {};
    if (!email) {
        return res.status(400).json({ error: 'email is required' });
    }

    try {
        // Find or create the student by email
        let student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);

        if (student) {
            // Optionally update names if provided
            if (first_name || last_name) {
                await dbConfig.run(
                    'UPDATE students SET first_name = $1, last_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                    [first_name || student.first_name || 'Student', last_name || student.last_name || '', student.id]
                );
            }
        } else {
            const insertResult = await dbConfig.run(`
                INSERT INTO students (first_name, last_name, email)
                VALUES ($1, $2, $3)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [first_name || 'Student', last_name || '', email]);

            let newId;
            if (dbConfig.isProduction) {
                newId = insertResult[0]?.id;
            } else {
                newId = insertResult.lastID;
            }
            student = { id: newId, email, first_name: first_name || 'Student', last_name: last_name || '' };
        }

        // Update the registration to link the student
        await dbConfig.run('UPDATE registrations SET student_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [student.id, id]);

        res.json({ success: true, student_id: student.id });
    } catch (err) {
        console.error('❌ Assign student failed:', err);
        res.status(500).json({ error: 'Failed to assign student to registration' });
    }
}));

/**
 * Admin query: registrations missing contact info (no student link or empty email/name)
 */
app.get('/api/admin/registrations/missing-contact', requireAuth, asyncHandler(async (req, res) => {
    try {
        const rows = await dbConfig.all(`
            SELECT
                r.id AS registration_id,
                r.course_id,
                r.payment_amount,
                r.payment_status,
                r.registration_date,
                c.name AS course_name,
                s.id AS student_id,
                s.email,
                s.first_name,
                s.last_name
            FROM registrations r
            LEFT JOIN students s ON s.id = r.student_id
            LEFT JOIN courses c ON c.id = r.course_id
            WHERE
                s.id IS NULL
                OR COALESCE(TRIM(s.email), '') = ''
                OR (COALESCE(TRIM(s.first_name), '') = '' AND COALESCE(TRIM(s.last_name), '') = '')
            ORDER BY r.registration_date DESC
        `, []);
        res.json(rows);
    } catch (err) {
        console.error('❌ Missing-contact query error:', err);
        res.status(500).json({ error: 'Failed to fetch registrations with missing contact info' });
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

/**
 * Admin debug: check course access configuration
 */
app.get('/api/admin/debug/course-access/:courseId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    try {
        // Get course with access settings
        const course = await dbConfig.get('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Test access for different student types
        const testAccess = {
            crew_member: false,
            general: false
        };

        // Test crew member access
        if (course.required_student_type === 'any' || course.required_student_type === 'crew_member') {
            testAccess.crew_member = true;
        }

        // Test general student access  
        if (course.required_student_type === 'any') {
            testAccess.general = true;
        }

        res.json({
            course: {
                id: course.id,
                name: course.name,
                course_type: course.course_type,
                required_student_type: course.required_student_type,
                is_active: course.is_active
            },
            access_test: testAccess,
            issue_analysis: {
                is_crew_only: course.required_student_type === 'crew_member',
                should_be_open_to_all: course.course_type === 'crew_practice' && course.required_student_type !== 'any',
                recommended_fix: course.required_student_type === 'crew_member' ? 'Change required_student_type to "any" to allow all students' : 'Configuration looks correct'
            }
        });
    } catch (err) {
        console.error('❌ Debug course access error:', err);
        res.status(500).json({ error: 'Failed to analyze course access' });
    }
}));

/**
 * Admin debug: detailed capacity analysis for a course
 */
app.get('/api/admin/debug/course-capacity/:courseId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    try {
        // Get basic course info
        const course = await dbConfig.get('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (!course) {
            return res.status(404).json({ error: 'Course not found' });
        }

        // Get slots with capacity calculation (same as main API)
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed'
            WHERE cs.course_id = $1
            GROUP BY cs.id
            ORDER BY cs.created_at ASC
        `, [courseId]);

        // Get all registrations for this course
        const allRegistrations = await dbConfig.all(`
            SELECT r.*, s.first_name, s.last_name, s.email
            FROM registrations r
            LEFT JOIN students s ON r.student_id = s.id
            WHERE r.course_id = $1
            ORDER BY r.registration_date DESC
        `, [courseId]);

        // Get completed registrations only
        const completedRegistrations = allRegistrations.filter(r => r.payment_status === 'completed');

        // Calculate totals
        const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (slot.available_spots || 0), 0);

        res.json({
            course: {
                id: course.id,
                name: course.name,
                course_type: course.course_type,
                is_active: course.is_active
            },
            capacity_analysis: {
                total_capacity: totalCapacity,
                total_available_spots: totalAvailableSpots,
                completed_registrations_count: completedRegistrations.length,
                all_registrations_count: allRegistrations.length
            },
            slots: slots.map(s => ({
                id: s.id,
                capacity: s.capacity,
                slot_registration_count: Number(s.slot_registration_count),
                available_spots: Number(s.available_spots)
            })),
            registrations_summary: {
                completed: completedRegistrations.length,
                pending: allRegistrations.filter(r => r.payment_status === 'pending').length,
                failed: allRegistrations.filter(r => r.payment_status === 'failed').length,
                total: allRegistrations.length
            },
            sample_registrations: allRegistrations.slice(0, 5).map(r => ({
                id: r.id,
                student_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
                email: r.email,
                payment_status: r.payment_status,
                registration_date: r.registration_date
            }))
        });
    } catch (err) {
        console.error('❌ Debug course capacity error:', err);
        res.status(500).json({ error: 'Failed to analyze course capacity' });
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

// Generate Zelle payment details
app.post('/api/generate-zelle-payment', asyncHandler(async (req, res) => {
    const { registrationId, amount, courseName } = req.body;
    
    if (!registrationId || !amount) {
        return res.status(400).json({ error: 'Registration ID and amount are required' });
    }
    
    // Get Zelle contact info from settings (phone only, no email)
    const zelleRecipientNameSetting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['zelle_recipient_name']);
    const zellePhoneSetting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['zelle_phone']);
    
    const zelleRecipientName = zelleRecipientNameSetting ? zelleRecipientNameSetting.setting_value : 'Monica Radhakrishnan';
    const zellePhone = zellePhoneSetting ? zellePhoneSetting.setting_value : '4252159818';
    
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
        console.warn('⚠️ Could not load course dates for Zelle note:', e.message || e);
    }
    const paymentNote = `Dance Registration #${registrationId}${courseDisplayName ? ` - ${courseDisplayName}` : ''}${dateRangeText}`;
    
    res.json({
        success: true,
        zelleRecipientName,
        zellePhone,
        paymentNote,
        amount: parseFloat(amount).toFixed(2)
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
