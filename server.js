const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import database configuration and initialization
const DatabaseConfig = require('./database-config');
const { initializeDatabase } = require('./database/initialize');

// Import utilities
const { sendRegistrationConfirmationEmail, sendWaitlistNotificationEmail, sendEmailWithFallback, verifyEmailTransport, emailMethod } = require('./utils/mailer');
const { fetchCourseWithSlots } = require('./utils/schedule');
const { getCourseAvailability, formatLocalDate, formatLocalDateShort } = require('./utils/courseAvailability');

// Import middleware
const { asyncHandler, requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
const dbConfig = new DatabaseConfig();
let db = null;

// Test accounts (students.is_tester): their registrations are flagged is_test
// and left out of spot counts, revenue and dashboard numbers.
const isTrue = (v) => v === true || v === 1 || v === '1' || v === 't' || v === 'true';
const NOT_TEST = dbConfig.isProduction ? '(r.is_test IS NOT TRUE)' : '(r.is_test IS NULL OR r.is_test = 0)';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// Pages (HTML) must always be fresh, or phones and browsers keep showing an old
// version with old links after a deploy. Scripts and styles are versioned (?v=)
// in the HTML, so they can still be cached.
const PAGE_ROUTES = new Set(['/', '/admin', '/my', '/privacy', '/team']);
app.use((req, res, next) => {
    if (req.method === 'GET' && (PAGE_ROUTES.has(req.path) || req.path.endsWith('.html'))) {
        res.set('Cache-Control', 'no-cache, must-revalidate');
    }
    next();
});
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache, must-revalidate');
    }
}));

 // Session configuration
app.set('trust proxy', 1);
// Admin sign-ins are kept in the database (table app_sessions), so a deploy or
// restart doesn't sign you out, and they last 30 days from the last visit. This
// matters for the admin "app" on the phone's home screen.
class DbSessionStore extends session.Store {
    get(sid, cb) {
        dbConfig.get('SELECT sess, expire FROM app_sessions WHERE sid = $1', [sid])
            .then(row => {
                if (!row || new Date(row.expire) < new Date()) return cb(null, null);
                cb(null, JSON.parse(row.sess));
            })
            .catch(err => cb(err));
    }
    set(sid, sess, cb) {
        const expire = new Date(Date.now() + (sess.cookie?.maxAge || 30 * 24 * 60 * 60 * 1000));
        dbConfig.run(
            'INSERT INTO app_sessions (sid, sess, expire) VALUES ($1, $2, $3) ON CONFLICT (sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire',
            [sid, JSON.stringify(sess), expire.toISOString()]
        ).then(() => cb && cb(null)).catch(err => cb && cb(err));
    }
    destroy(sid, cb) {
        dbConfig.run('DELETE FROM app_sessions WHERE sid = $1', [sid]).then(() => cb && cb(null)).catch(err => cb && cb(err));
    }
    touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

app.use(session({
    store: new DbSessionStore(),
    secret: process.env.SESSION_SECRET || 'dance-registration-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        secure: false, // Set to false for Railway deployment
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, renewed on each visit
        sameSite: 'lax'
    }
}));

// Routes

// Serve main registration page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve admin dashboard
// Privacy policy (also linked from the Google sign-in setup for sending email)
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ---------- Team access (lite admin at /team) ----------
// Helpers approved by the admin (Settings → Team access) can list a class's
// registrations, accept/cancel them and download a CSV. Nothing else.
app.get('/team', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

const normEmail = (e) => String(e || '').trim().toLowerCase();

// Allows the admin, or a signed-in helper who is still approved (removing
// someone in Settings stops their access on their next click).
const requireAdminOrTeam = asyncHandler(async (req, res, next) => {
    if (req.session.adminId) return next();
    if (req.session.teamMemberId) {
        const member = await dbConfig.get('SELECT id, email FROM team_members WHERE id = $1', [req.session.teamMemberId]);
        if (member) { req.teamEmail = member.email; return next(); }
        delete req.session.teamMemberId;
    }
    res.status(401).json({ error: 'Authentication required' });
});
const handledBy = (req) => req.teamEmail || 'admin';

function startTeamSession(req, member) {
    return new Promise((resolve, reject) => req.session.regenerate(err => {
        if (err) return reject(err);
        req.session.teamMemberId = member.id;
        req.session.save(e => e ? reject(e) : resolve());
    }));
}

// Step 1 of sign-in: is this email approved, and has it set a password yet?
app.post('/api/team/check-email', asyncHandler(async (req, res) => {
    const member = await dbConfig.get('SELECT id, password_hash FROM team_members WHERE email = $1', [normEmail(req.body?.email)]);
    if (!member) return res.status(403).json({ error: 'This email has not been approved. Ask Goutham to add you.' });
    res.json({ approved: true, needs_password: !member.password_hash });
}));

// First sign-in only: choose a password (refused once one is set)
app.post('/api/team/set-password', asyncHandler(async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const member = await dbConfig.get('SELECT id, email, password_hash FROM team_members WHERE email = $1', [email]);
    if (!member) return res.status(403).json({ error: 'This email has not been approved' });
    if (member.password_hash) return res.status(409).json({ error: 'A password is already set. Sign in with it, or ask Goutham to reset your access.' });
    const hash = await bcrypt.hash(password, 10);
    await dbConfig.run('UPDATE team_members SET password_hash = $1, last_login = CURRENT_TIMESTAMP WHERE id = $2', [hash, member.id]);
    await startTeamSession(req, member);
    res.json({ success: true, email: member.email });
}));

app.post('/api/team/login', asyncHandler(async (req, res) => {
    const member = await dbConfig.get('SELECT id, email, password_hash FROM team_members WHERE email = $1', [normEmail(req.body?.email)]);
    const ok = member && member.password_hash && await bcrypt.compare(String(req.body?.password || ''), member.password_hash);
    if (!ok) return res.status(401).json({ error: 'Wrong email or password' });
    await dbConfig.run('UPDATE team_members SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [member.id]);
    await startTeamSession(req, member);
    res.json({ success: true, email: member.email });
}));

app.get('/api/team/status', requireAdminOrTeam, (req, res) => {
    res.json({ authenticated: true, email: req.teamEmail || 'Admin' });
});

app.post('/api/team/logout', (req, res) => {
    delete req.session.teamMemberId;
    req.session.save(() => res.json({ success: true }));
});

// Classes for the dropdown (hidden classes left out; test registrations not counted)
app.get('/api/team/classes', requireAdminOrTeam, asyncHandler(async (req, res) => {
    const hiddenOff = dbConfig.isProduction ? '(c.is_hidden IS NULL OR c.is_hidden = false)' : '(c.is_hidden IS NULL OR c.is_hidden = 0)';
    const rows = await dbConfig.all(`
        SELECT c.id, c.name, c.course_type, c.session_dates, c.is_active,
               COUNT(CASE WHEN r.payment_status = 'pending' THEN 1 END) AS pending_count,
               COUNT(CASE WHEN r.payment_status = 'completed' THEN 1 END) AS paid_count
        FROM courses c
        LEFT JOIN registrations r ON r.course_id = c.id AND ${NOT_TEST}
        WHERE ${hiddenOff}
        GROUP BY c.id, c.name, c.course_type, c.session_dates, c.is_active
        ORDER BY c.id DESC`);
    res.json(rows.map(r => ({ ...r, pending_count: Number(r.pending_count || 0), paid_count: Number(r.paid_count || 0) })));
}));

// Admin: manage who has team access
app.get('/api/admin/team-members', requireAuth, asyncHandler(async (req, res) => {
    const rows = await dbConfig.all('SELECT id, email, password_hash IS NOT NULL AS has_password, created_at, last_login FROM team_members ORDER BY email');
    res.json(rows.map(r => ({ ...r, has_password: !!r.has_password })));
}));

app.post('/api/admin/team-members', requireAuth, asyncHandler(async (req, res) => {
    const email = normEmail(req.body?.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    const existing = await dbConfig.get('SELECT id FROM team_members WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'That email is already approved' });
    await dbConfig.run('INSERT INTO team_members (email) VALUES ($1)', [email]);
    res.json({ success: true });
}));

// Removing someone ends their access; re-approving lets them choose a new password
app.delete('/api/admin/team-members/:id', requireAuth, asyncHandler(async (req, res) => {
    await dbConfig.run('DELETE FROM team_members WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));


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


// ---------- Class field helpers (dates list, crew-only) ----------
// Accepts an array or JSON string of dates; returns a sorted, de-duplicated array of 'YYYY-MM-DD'.
function normalizeSessionDates(value) {
    let list = value;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = list.split(','); }
    }
    if (!Array.isArray(list)) return [];
    const clean = list
        .map(d => String(d || '').trim().slice(0, 10))
        .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
    return [...new Set(clean)].sort();
}

function normalizeStudentType(value) {
    return value === 'crew_member' ? 'crew_member' : 'any';
}

// Courses
app.get('/api/courses', asyncHandler(async (req, res) => {
    // include_crew=true: the public home page lists crew-only classes too (shown with a "Crew only" label).
    // Eligibility is still enforced when a student actually registers.
    const { active_only, student_email, include_crew } = req.query;
    
    let query = `
        SELECT c.*,
               COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
    `;
    
    const params = [];
    const conditions = [];
    
    // Exclude soft-deleted (hidden) courses
    conditions.push(dbConfig.isProduction ? '(c.is_hidden IS NULL OR c.is_hidden = false)' : '(c.is_hidden IS NULL OR c.is_hidden = 0)');

    if (active_only === 'true') {
        if (dbConfig.isProduction) {
            conditions.push('c.is_active = true');
        } else {
            conditions.push('c.is_active = 1');
        }
    }
    
    // Add access control filtering based on student type
    let studentType = 'general'; // Default to general access
    if (student_email) {
        try {
            const student = await dbConfig.get('SELECT student_type, is_tester FROM students WHERE email = $1', [student_email]);
            if (student) {
                studentType = isTrue(student.is_tester) ? 'crew_member' : (student.student_type || 'general');
            }
        } catch (error) {
            console.warn('Error fetching student type for course access:', error);
        }
    }
    
    // Filter courses based on student access level
    if (studentType === 'crew_member' || (include_crew === 'true' && !student_email)) {
        // Crew members can access all courses (and the public listing shows them all)
        conditions.push('(c.required_student_type = \'any\' OR c.required_student_type = \'crew_member\')');
    } else {
        // General students can only access courses open to all
        conditions.push('c.required_student_type = \'any\'');
    }
    
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' GROUP BY c.id ORDER BY c.created_at DESC';
    
    const courses = await dbConfig.all(query, params);
    
    // If student_email is provided, get registration status for each course
    let studentRegistrations = {};
    if (student_email) {
        try {
            const student = await dbConfig.get('SELECT id FROM students WHERE email = $1', [student_email]);
            if (student) {
                const registrations = await dbConfig.all(`
                    SELECT course_id, id as registration_id, payment_status, registration_date
                    FROM registrations 
                    WHERE student_id = $1
                `, [student.id]);
                
                registrations.forEach(reg => {
                    studentRegistrations[reg.course_id] = {
                        registration_id: reg.registration_id,
                        payment_status: reg.payment_status,
                        registration_date: reg.registration_date,
                        registration_status: reg.payment_status === 'completed' ? 'registered_completed' :
                                           reg.payment_status === 'pending' ? 'registered_pending' : 'not_registered'
                    };
                });
            }
        } catch (error) {
            console.warn('Error fetching student registrations:', error);
        }
    }
    
    // Get slots and pricing for each course with corrected availability
    const coursesWithSlots = await Promise.all(courses.map(async (course) => {
        // Use the corrected availability helper
        const availability = await getCourseAvailability(dbConfig, course.id);
        
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
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
        
        // Use corrected availability calculation
        const totalCapacity = availability.capacity;
        const totalAvailableSpots = availability.available;
        
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

// Drop-in classes endpoint (returns courses marked as drop_in with week filtering)
app.get('/api/drop-in-classes', asyncHandler(async (req, res) => {
    const { student_email } = req.query;
    
    // Get drop-in courses that are active
    let query = `
        SELECT c.*,
               COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
        AND c.course_type = 'drop_in'
    `;
    
    // If student_email is provided, check access permissions
    let studentType = 'general';
    if (student_email) {
        try {
            const student = await dbConfig.get('SELECT student_type, is_tester FROM students WHERE email = $1', [student_email]);
            if (student) {
                studentType = isTrue(student.is_tester) ? 'crew_member' : (student.student_type || 'general');
            }
        } catch (error) {
            console.warn('Error fetching student type for drop-in access:', error);
        }
    }
    
    // Filter by student access level
    if (studentType === 'crew_member') {
        query += ' AND (c.required_student_type = \'any\' OR c.required_student_type = \'crew_member\')';
    } else {
        query += ' AND c.required_student_type = \'any\'';
    }
    
    query += ' GROUP BY c.id ORDER BY c.created_at ASC';
    
    const courses = await dbConfig.all(query);
    
    // Get slots and pricing for each course, filtering out week 4
    const coursesWithSlots = await Promise.all(courses.map(async (course) => {
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
            WHERE cs.course_id = $1
            GROUP BY cs.id
            ORDER BY cs.created_at ASC
        `, [course.id]);
        
        // Filter out week 4 by checking practice_date (should be weeks 1-3 only)
        // Assuming week 4 starts on 2026-01-27, filter out that date and later
        const week4Date = '2026-01-27';
        const filteredSlots = slots.filter(slot => {
            if (!slot.practice_date) return true; // Include if no practice_date
            return slot.practice_date < week4Date; // Only weeks 1-3
        });
        
        // Get pricing for filtered slots
        const slotsWithPricing = await Promise.all(filteredSlots.map(async (slot) => {
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
        
        // Only return courses that have valid weeks 1-3 slots
        if (slotsWithPricing.length === 0) return null;
        
        // Calculate totals
        const totalCapacity = slotsWithPricing.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slotsWithPricing.reduce((sum, slot) => sum + (Number(slot.available_spots) || 0), 0);
        
        // Build computed schedule_info
        let computedScheduleInfo = '';
        const scheduleItems = slotsWithPricing.map(s => {
            const parts = [];
            if (s.practice_date) {
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
            computedScheduleInfo = scheduleItems.join(' | ');
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
            per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 30 // Default $30 for drop-ins
        };
    }));
    
    // Filter out null courses (no valid slots)
    const validCourses = coursesWithSlots.filter(course => course !== null);
    
    res.json(validCourses);
}));

// Register drop-in bundle endpoint
app.post('/api/register-dropin-bundle', asyncHandler(async (req, res) => {
    const {
        first_name, last_name, email, phone, date_of_birth,
        emergency_contact_name, emergency_contact_phone, medical_conditions,
        dance_experience, instagram_handle, instagram_id, how_heard_about_us,
        course_ids, // Array of course IDs for the bundle
        total_amount, special_requests
    } = req.body;
    
    // Handle both instagram_handle and instagram_id field names
    const instagram = instagram_handle || instagram_id;

    // Derive names from student_name if provided
    let effectiveFirstName = first_name;
    let effectiveLastName = last_name;
    if ((!effectiveFirstName && !effectiveLastName) && req.body.student_name) {
        const parts = String(req.body.student_name).trim().split(/\s+/);
        effectiveFirstName = parts.shift() || 'Student';
        effectiveLastName = parts.join(' ') || '';
    }
    
    if (!email || !course_ids || !Array.isArray(course_ids) || course_ids.length === 0 || !total_amount) {
        return res.status(400).json({ error: 'Required fields missing: email, course_ids array, and total_amount are required' });
    }
    
    // Validate course_ids array (1-3 classes)
    if (course_ids.length > 3) {
        return res.status(400).json({ error: 'Maximum 3 classes allowed in drop-in bundle' });
    }
    
    // Check if registration is open
    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    if (settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }
    
    // Verify all courses exist, are active drop-in courses, and enforce week 4 gating
    const week4Date = '2026-01-27';
    for (const courseId of course_ids) {
        const courseCheck = await dbConfig.get(`
            SELECT c.id, c.name, c.course_type
            FROM courses c
            WHERE c.id = $1 AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
            AND c.course_type = 'drop_in'
        `, [courseId]);

        if (!courseCheck) {
            return res.status(400).json({ error: `Course ${courseId} not found, inactive, or not a drop-in course` });
        }
        
        // Check for week 4 violation (hard block)
        const slot = await dbConfig.get(`
            SELECT practice_date FROM course_slots 
            WHERE course_id = $1 AND practice_date >= $2 
            LIMIT 1
        `, [courseId, week4Date]);
        
        if (slot) {
            return res.status(400).json({ 
                error: 'Week 4 drop-ins are not available. Please select from weeks 1-3 only.',
                week_4_blocked: true
            });
        }
    }
    
    // Validate single track constraint (all courses should have same time block)
    // Get the first course's time block to use as reference
    const firstCourse = await dbConfig.get(`
        SELECT cs.start_time, cs.end_time
        FROM course_slots cs
        WHERE cs.course_id = $1
        ORDER BY cs.created_at ASC
        LIMIT 1
    `, [course_ids[0]]);
    
    if (firstCourse && course_ids.length > 1) {
        // Check that all other courses have the same time block
        for (let i = 1; i < course_ids.length; i++) {
            const otherCourse = await dbConfig.get(`
                SELECT cs.start_time, cs.end_time
                FROM course_slots cs
                WHERE cs.course_id = $1
                ORDER BY cs.created_at ASC
                LIMIT 1
            `, [course_ids[i]]);
            
            if (!otherCourse || 
                otherCourse.start_time !== firstCourse.start_time || 
                otherCourse.end_time !== firstCourse.end_time) {
                return res.status(400).json({ 
                    error: 'All selected classes must be from the same level (same time block). Choose either Level 1 OR Level 2 classes.',
                    mixed_levels_not_allowed: true
                });
            }
        }
    }
    
    // Check capacity for all courses using corrected availability logic
    for (const courseId of course_ids) {
        const courseCheck = await dbConfig.get('SELECT id, name FROM courses WHERE id = $1', [courseId]);
        if (!courseCheck) {
            return res.status(400).json({ error: `Course ${courseId} not found` });
        }

        const availability = await getCourseAvailability(dbConfig, courseId);
        
        if (availability.available <= 0) {
            return res.status(400).json({ 
                error: `Class "${courseCheck.name}" is full`,
                course_full: true,
                course_name: courseCheck.name,
                course_id: courseId
            });
        }
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
    
    // Create registrations for each course in the bundle
    const registrationIds = [];
    const perClassAmount = Math.round((total_amount / course_ids.length) * 100) / 100; // Round to 2 decimals
    
    for (const courseId of course_ids) {
        // Check for existing registrations to avoid duplicates
        const existingCompleted = await dbConfig.get(
            'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'completed\' LIMIT 1',
            [student.id, courseId]
        );
        if (existingCompleted) {
            return res.status(400).json({ 
                error: `You are already registered for one of the selected classes`,
                duplicate_registration: true
            });
        }
        
        const existingPending = await dbConfig.get(
            'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'pending\' ORDER BY registration_date DESC LIMIT 1',
            [student.id, courseId]
        );
        
        if (existingPending) {
            registrationIds.push(existingPending.id);
            continue; // Skip creating duplicate pending registration
        }

        // Create registration for this course
        const registrationResult = await dbConfig.run(`
            INSERT INTO registrations (
                student_id, course_id, payment_amount, payment_status, special_requests, registration_type
            ) VALUES ($1, $2, $3, 'pending', $4, 'drop_in_bundle')
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [student.id, courseId, perClassAmount, special_requests]);
        
        let registrationId;
        if (dbConfig.isProduction) {
            registrationId = registrationResult[0]?.id;
        } else {
            registrationId = registrationResult.lastID;
        }
        
        registrationIds.push(registrationId);
    }
    
    console.log('📝 Drop-in bundle registrations created', { 
        student_id: student.id, 
        email, 
        course_ids, 
        registration_ids: registrationIds,
        total_amount 
    });
    
    res.json({ 
        success: true, 
        registrationIds: registrationIds,
        studentId: student.id,
        bundle_size: course_ids.length,
        total_amount: total_amount,
        per_class_amount: perClassAmount
    });
}));

// Crew + House combo registration endpoint (crew members only)
app.post('/api/register-crew-house-combo', asyncHandler(async (req, res) => {
    const {
        first_name, last_name, email, phone, date_of_birth,
        emergency_contact_name, emergency_contact_phone, medical_conditions,
        dance_experience, instagram_handle, instagram_id, how_heard_about_us,
        house_course_ids, // Array of house course IDs (Level 1, Level 2, or both)
        special_requests
    } = req.body;
    
    // Handle both instagram_handle and instagram_id field names
    const instagram = instagram_handle || instagram_id;

    // Derive names from student_name if provided
    let effectiveFirstName = first_name;
    let effectiveLastName = last_name;
    if ((!effectiveFirstName && !effectiveLastName) && req.body.student_name) {
        const parts = String(req.body.student_name).trim().split(/\s+/);
        effectiveFirstName = parts.shift() || 'Student';
        effectiveLastName = parts.join(' ') || '';
    }
    
    if (!email || !house_course_ids || !Array.isArray(house_course_ids) || house_course_ids.length === 0) {
        return res.status(400).json({ error: 'Required fields missing: email and house_course_ids array are required' });
    }
    
    // Check if registration is open
    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    if (settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }
    
    // Verify student exists and is a crew member
    let student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);
    if (!student) {
        return res.status(400).json({ 
            error: 'Student profile not found. Crew + House combo is only available to existing crew members.',
            requires_profile: true
        });
    }
    
    if (student.student_type !== 'crew_member') {
        return res.status(400).json({ 
            error: 'Crew + House combo is only available to crew members.',
            access_denied: true,
            current_student_type: student.student_type
        });
    }
    
    // Verify all house courses exist, are active, and are multi-week courses
    for (const courseId of house_course_ids) {
        const courseCheck = await dbConfig.get(`
            SELECT c.id, c.name, c.course_type
            FROM courses c
            WHERE c.id = $1 AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
            AND c.course_type = 'multi-week'
        `, [courseId]);

        if (!courseCheck) {
            return res.status(400).json({ error: `Course ${courseId} not found, inactive, or not a multi-week house course` });
        }
    }
    
    // Check capacity for all house courses
    for (const courseId of house_course_ids) {
        const capacityCheck = await dbConfig.get(`
            SELECT
              c.id,
              c.name,
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
        `, [courseId]);

        const totalCapacityNum = Number(capacityCheck?.total_capacity) || 0;
        const currentRegistrationsNum = Number(capacityCheck?.current_registrations) || 0;
        
        if (currentRegistrationsNum >= totalCapacityNum) {
            return res.status(400).json({ 
                error: `House class "${capacityCheck?.name}" is full`,
                course_full: true,
                course_name: capacityCheck?.name,
                course_id: courseId
            });
        }
    }
    
    // Update student information
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
    
    // Create house course registrations
    const registrationIds = [];
    const totalAmount = 200; // Fixed price for crew+house combo
    const perCourseAmount = Math.round((totalAmount / house_course_ids.length) * 100) / 100;
    
    for (const courseId of house_course_ids) {
        // Check for existing registrations to avoid duplicates
        const existingCompleted = await dbConfig.get(
            'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'completed\' LIMIT 1',
            [student.id, courseId]
        );
        if (existingCompleted) {
            return res.status(400).json({ 
                error: `You are already registered for one of the selected house classes`,
                duplicate_registration: true
            });
        }
        
        const existingPending = await dbConfig.get(
            'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = \'pending\' ORDER BY registration_date DESC LIMIT 1',
            [student.id, courseId]
        );
        
        if (existingPending) {
            registrationIds.push(existingPending.id);
            continue; // Skip creating duplicate pending registration
        }

        // Create house course registration
        const registrationResult = await dbConfig.run(`
            INSERT INTO registrations (
                student_id, course_id, payment_amount, payment_status, special_requests, registration_type
            ) VALUES ($1, $2, $3, 'pending', $4, 'crew_house_combo')
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [student.id, courseId, perCourseAmount, special_requests]);
        
        let registrationId;
        if (dbConfig.isProduction) {
            registrationId = registrationResult[0]?.id;
        } else {
            registrationId = registrationResult.lastID;
        }
        
        registrationIds.push(registrationId);
    }
    
    // Create unlimited crew practice registrations for the 4-week window
    // Get all active crew practice courses within the window (2026-01-06 to 2026-01-30)
    const windowStart = '2026-01-06';
    const windowEnd = '2026-01-30';
    
    const crewPracticeCourses = await dbConfig.all(`
        SELECT c.id, c.name, cs.practice_date
        FROM courses c
        JOIN course_slots cs ON c.id = cs.course_id
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
        AND c.course_type = 'crew_practice'
        AND cs.practice_date >= $1 AND cs.practice_date <= $2
        ORDER BY cs.practice_date ASC
    `, [windowStart, windowEnd]);
    
    const crewRegistrationIds = [];
    for (const crewCourse of crewPracticeCourses) {
        // Check if already registered for this crew practice
        const existingCrewReg = await dbConfig.get(
            'SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 LIMIT 1',
            [student.id, crewCourse.id]
        );
        
        if (!existingCrewReg) {
            // Create zero-dollar crew practice registration
            const crewRegResult = await dbConfig.run(`
                INSERT INTO registrations (
                    student_id, course_id, payment_amount, payment_status, special_requests, registration_type
                ) VALUES ($1, $2, 0, 'completed', $3, 'crew_unlimited')
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [student.id, crewCourse.id, 'Unlimited crew practice via Crew+House combo']);
            
            let crewRegId;
            if (dbConfig.isProduction) {
                crewRegId = crewRegResult[0]?.id;
            } else {
                crewRegId = crewRegResult.lastID;
            }
            
            crewRegistrationIds.push(crewRegId);
        }
    }
    
    console.log('📝 Crew + House combo registrations created', { 
        student_id: student.id, 
        email, 
        house_course_ids, 
        house_registration_ids: registrationIds,
        crew_registration_ids: crewRegistrationIds,
        total_amount: totalAmount,
        crew_practices_included: crewPracticeCourses.length
    });
    
    res.json({ 
        success: true, 
        registrationIds: registrationIds,
        crewRegistrationIds: crewRegistrationIds,
        studentId: student.id,
        house_courses_count: house_course_ids.length,
        crew_practices_count: crewPracticeCourses.length,
        total_amount: totalAmount,
        per_house_course_amount: perCourseAmount
    });
}));

app.post('/api/courses', requireAuth, asyncHandler(async (req, res) => {
    const {
        name, description, course_type, duration_weeks,
        start_date, end_date, instructor, schedule_info, prerequisites,
        song_name, movie_name, language, series_slot,
        session_dates, required_student_type,
        slots // Array of slot objects with difficulty_level, capacity, pricing, etc.
    } = req.body;
    const dates = normalizeSessionDates(session_dates);
    
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
            start_date, end_date, instructor, schedule_info, prerequisites,
            song_name, movie_name, language, series_slot,
            session_dates, required_student_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [
        name, description, course_type, duration_weeks || dates.length || 1,
        start_date || dates[0] || null, end_date || dates[dates.length - 1] || null,
        instructor || null, schedule_info, prerequisites,
        song_name || null, movie_name || null, language || null, series_slot || null,
        dates.length ? JSON.stringify(dates) : null, normalizeStudentType(required_student_type)
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
        song_name, movie_name, language, series_slot,
        session_dates, required_student_type,
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
        is_active,
        song_name,
        movie_name,
        language,
        series_slot,
        session_dates: session_dates === undefined ? undefined : JSON.stringify(normalizeSessionDates(session_dates)),
        required_student_type: required_student_type === undefined ? undefined : normalizeStudentType(required_student_type)
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

// Soft-delete a course (hide from UI, keep in DB)
app.delete('/api/courses/:courseId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    await dbConfig.run(
        `UPDATE courses SET is_hidden = ${dbConfig.isProduction ? 'true' : '1'}, is_active = ${dbConfig.isProduction ? 'false' : '0'}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [courseId]
    );
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

// ==============================
// Public: Dance Series / Choreography Packages (no auth)
// ==============================


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
        // Get courses available to new/general students
        const newStudentCourseQuery = `
            SELECT c.*, COUNT(DISTINCT r.id) as registration_count
            FROM courses c
            LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
            WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
            AND c.required_student_type = 'any'
            GROUP BY c.id ORDER BY c.created_at DESC
        `;
        
        const rawCourses = await dbConfig.all(newStudentCourseQuery);
        
        // Process courses with slots and pricing
        const eligibleCourses = await Promise.all(rawCourses.map(async (course) => {
            const slots = await dbConfig.all(`
                SELECT cs.*, 
                       COUNT(DISTINCT r.id) as slot_registration_count,
                       (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
                FROM course_slots cs
                LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
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
            
            // Calculate totals and build schedule info
            const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
            const totalAvailableSpots = slots.reduce((sum, slot) => sum + (Number(slot.available_spots) || 0), 0);
            
            // Build computed schedule_info
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
                full_course_price: slotsWithPricing[0]?.pricing?.full_package || 0,
                per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 0
            };
        }));
        
        return res.json({ 
            exists: false,
            new_student: true,
            eligible_courses: eligibleCourses
        });
    }
    
    // Get eligible courses based on student type
    let courseQuery = `
        SELECT c.*, COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `;
    
    const params = [];
    
    // Filter courses based on student access level
    if (student.student_type === 'crew_member' || isTrue(student.is_tester)) {
        // Crew members can access all courses
        courseQuery += ' AND (c.required_student_type = \'any\' OR c.required_student_type = \'crew_member\')';
    } else {
        // General students can only access courses open to all
        courseQuery += ' AND c.required_student_type = \'any\'';
    }
    
    courseQuery += ' GROUP BY c.id ORDER BY c.created_at DESC';
    
    const eligibleCourses = await dbConfig.all(courseQuery, params);
    
    // Get student's registration status for each course
    let studentRegistrations = {};
    try {
        const registrations = await dbConfig.all(`
            SELECT course_id, id as registration_id, payment_status, registration_date
            FROM registrations 
            WHERE student_id = $1
        `, [student.id]);
        
        registrations.forEach(reg => {
            studentRegistrations[reg.course_id] = {
                registration_id: reg.registration_id,
                payment_status: reg.payment_status,
                registration_date: reg.registration_date,
                registration_status: reg.payment_status === 'completed' ? 'registered_completed' :
                                   reg.payment_status === 'pending' ? 'registered_pending' : 'not_registered'
            };
        });
    } catch (error) {
        console.warn('Error fetching student registrations:', error);
    }

    // Get courses with slots for each eligible course
    const coursesWithSlots = await Promise.all(eligibleCourses.map(async (course) => {
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
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
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (Number(slot.available_spots) || 0), 0);
        
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

        // Add registration status to course
        const registrationData = studentRegistrations[course.id] || null;

        return {
            ...course,
            slots: slotsWithPricing,
            capacity: totalCapacity,
            available_spots: totalAvailableSpots,
            schedule_info: computedScheduleInfo,
            full_course_price: slotsWithPricing[0]?.pricing?.full_package || 0,
            per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 0,
            // Add registration status data
            registration_status: registrationData ? registrationData.registration_status : 'not_registered',
            registration_id: registrationData ? registrationData.registration_id : null,
            payment_status: registrationData ? registrationData.payment_status : null
        };
    }));
    
    // Check profile completion for ALL users (not just crew members)
    // Profile is incomplete if missing instagram_handle OR dance_experience
    const profileComplete = dbConfig.isProduction ? student.profile_complete : Boolean(student.profile_complete);
    const hasInstagram = student.instagram_handle && student.instagram_handle.trim() !== '';
    const hasExperience = student.dance_experience && student.dance_experience.trim() !== '';
    const requiresCompletion = !hasInstagram || !hasExperience;

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
            profile_complete: profileComplete
        },
        requires_profile_completion: requiresCompletion,
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
    
    // Get eligible courses with full slot and pricing data (same as check-student-profile)
    let courseQuery = `
        SELECT c.*, COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'} 
        AND c.required_student_type = 'any'
        GROUP BY c.id ORDER BY c.created_at DESC
    `;
    
    const rawCourses = await dbConfig.all(courseQuery);
    
    // Process courses with slots and pricing (same logic as check-student-profile)
    const eligibleCourses = await Promise.all(rawCourses.map(async (course) => {
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
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
        
        // Calculate totals
        const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (Number(slot.available_spots) || 0), 0);
        
        return {
            ...course,
            slots: slotsWithPricing,
            capacity: totalCapacity,
            available_spots: totalAvailableSpots,
            full_course_price: slotsWithPricing[0]?.pricing?.full_package || 0,
            per_class_price: slotsWithPricing[0]?.pricing?.drop_in || 0
        };
    }));
    
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
 * Update existing student profile (e.g., require completion for crew members)
 * POST /api/update-student-profile
 * Body: { email, first_name, last_name, instagram_handle, dance_experience }
 */
app.post('/api/update-student-profile', asyncHandler(async (req, res) => {
    const { email, first_name, last_name, instagram_handle, dance_experience } = req.body || {};
    if (!email || !first_name) {
        return res.status(400).json({ error: 'Email and first name are required' });
    }

    // Find existing student
    const student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);
    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

    // Update profile and mark complete
    await dbConfig.run(`
        UPDATE students SET
            first_name = $1,
            last_name = $2,
            instagram_handle = $3,
            dance_experience = $4,
            profile_complete = ${dbConfig.isProduction ? 'true' : '1'},
            updated_at = CURRENT_TIMESTAMP
        WHERE email = $5
    `, [first_name, last_name || '', instagram_handle || '', dance_experience || '', email]);

    // Reload and compute eligible courses based on student_type
    const updated = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);

    let courseQuery = `
        SELECT c.*, COUNT(DISTINCT r.id) as registration_count
        FROM courses c
        LEFT JOIN registrations r ON c.id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
        WHERE c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `;
    if (updated.student_type === 'crew_member') {
        courseQuery += ' AND (c.required_student_type = \'any\' OR c.required_student_type = \'crew_member\')';
    } else {
        courseQuery += ' AND c.required_student_type = \'any\'';
    }
    courseQuery += ' GROUP BY c.id ORDER BY c.created_at DESC';

    const rawCourses = await dbConfig.all(courseQuery, []);
    
    // Process courses with slots and pricing (same logic as other endpoints)
    const eligibleCourses = await Promise.all(rawCourses.map(async (course) => {
        const slots = await dbConfig.all(`
            SELECT cs.*, 
                   COUNT(DISTINCT r.id) as slot_registration_count,
                   (cs.capacity - COUNT(DISTINCT r.id)) as available_spots
            FROM course_slots cs
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
            WHERE cs.course_id = $1
            GROUP BY cs.id
            ORDER BY cs.created_at ASC
        `, [course.id]);
        
        // Calculate totals
        const totalCapacity = slots.reduce((sum, slot) => sum + (slot.capacity || 0), 0);
        const totalAvailableSpots = slots.reduce((sum, slot) => sum + (Number(slot.available_spots) || 0), 0);
        
        return {
            ...course,
            capacity: totalCapacity,
            available_spots: totalAvailableSpots,
            full_course_price: 0,
            per_class_price: 0
        };
    }));
    
    res.json({
        success: true,
        student: {
            id: updated.id,
            first_name: updated.first_name || '',
            last_name: updated.last_name || '',
            email: updated.email,
            instagram_handle: updated.instagram_handle || '',
            dance_experience: updated.dance_experience || '',
            student_type: updated.student_type || 'general',
            profile_complete: dbConfig.isProduction ? updated.profile_complete : Boolean(updated.profile_complete)
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
 * Body: { student_type: 'general' | 'crew_member' | 'test' }
 */
app.put('/api/admin/students/:id/classify', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { student_type } = req.body;

    console.log('🔍 Student classification request:', { id, student_type, admin: req.session.adminUsername });

    if (!student_type || !['general', 'crew_member', 'test'].includes(student_type)) {
        return res.status(400).json({ error: 'student_type must be one of "general", "crew_member", or "test"' });
    }

    try {
        // Get current student data first to check profile completeness
        const student = await dbConfig.get('SELECT * FROM students WHERE id = $1', [id]);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        console.log('📋 Current student data:', { 
            id: student.id, 
            email: student.email, 
            instagram_handle: student.instagram_handle, 
            dance_experience: student.dance_experience 
        });

        // Update student classification
        // If promoting to crew_member and profile is incomplete (missing instagram_handle or dance_experience),
        // force profile_complete = false so they complete it on next login.
        const shouldForceProfileCompletion = student_type === 'crew_member' && 
            (!student.instagram_handle || !student.dance_experience || 
             student.instagram_handle.trim() === '' || student.dance_experience.trim() === '');

        // Use simpler SQL to avoid compatibility issues
        if (shouldForceProfileCompletion) {
            await dbConfig.run(`
                UPDATE students SET 
                    student_type = $1, 
                    admin_classified = ${dbConfig.isProduction ? 'true' : '1'},
                    profile_complete = ${dbConfig.isProduction ? 'false' : '0'},
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
            `, [student_type, id]);
            
            console.log('👤 Student classified with profile completion required:', { id, student_type });
        } else {
            await dbConfig.run(`
                UPDATE students SET 
                    student_type = $1, 
                    admin_classified = ${dbConfig.isProduction ? 'true' : '1'},
                    updated_at = CURRENT_TIMESTAMP 
                WHERE id = $2
            `, [student_type, id]);
            
            console.log('👤 Student classified:', { id, student_type });
        }

        res.json({ success: true, student_type });
    } catch (error) {
        console.error('❌ Student classification failed:', error);
        console.error('❌ Stack trace:', error.stack);
        res.status(500).json({ error: 'Failed to classify student', details: error.message });
    }
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


// Waitlist APIs

/**
 * Add student to waitlist when course is full
 * POST /api/waitlist
 * Body: same as registration data
 */
app.post('/api/waitlist', asyncHandler(async (req, res) => {
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
    
    // Verify course exists and is active
    const courseCheck = await dbConfig.get(`
        SELECT c.id, c.name, c.course_type
        FROM courses c
        WHERE c.id = $1 AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `, [course_id]);

    if (!courseCheck) {
        return res.status(400).json({ error: 'Course not found or inactive' });
    }
    
    // Create or update student (same logic as registration)
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
    
    // Check if student is already on waitlist for this course (any status)
    const existingWaitlist = await dbConfig.get(
        'SELECT id, waitlist_position, status FROM waitlist WHERE student_id = $1 AND course_id = $2',
        [student.id, course_id]
    );
    
    if (existingWaitlist) {
        console.log('ℹ️ Student already on waitlist', { student_id: student.id, course_id, position: existingWaitlist.waitlist_position, status: existingWaitlist.status });
        
        // If active, return current position
        if (existingWaitlist.status === 'active') {
            return res.json({ 
                success: true, 
                waitlistId: existingWaitlist.id,
                studentId: student.id,
                position: existingWaitlist.waitlist_position,
                message: `You are already on the waitlist at position #${existingWaitlist.waitlist_position}`
            });
        }
        
        // If notified or other status, reactivate the existing entry
        if (existingWaitlist.status === 'notified' || existingWaitlist.status !== 'active') {
            await dbConfig.run(`
                UPDATE waitlist SET 
                    status = 'active',
                    notification_sent = ${dbConfig.isProduction ? 'false' : '0'},
                    notification_sent_at = NULL,
                    notification_expires_at = NULL,
                    payment_link_token = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [existingWaitlist.id]);
            
            console.log('🔄 Reactivated existing waitlist entry', { id: existingWaitlist.id, student_id: student.id, course_id });
            
            return res.json({ 
                success: true, 
                waitlistId: existingWaitlist.id,
                studentId: student.id,
                position: existingWaitlist.waitlist_position,
                message: `You have been added back to the waitlist at position #${existingWaitlist.waitlist_position}`
            });
        }
    }
    
    // Get next waitlist position for this course
    const positionResult = await dbConfig.get(
        'SELECT COALESCE(MAX(waitlist_position), 0) + 1 as next_position FROM waitlist WHERE course_id = $1 AND status = \'active\'',
        [course_id]
    );
    const nextPosition = positionResult.next_position || 1;
    
    // Create waitlist entry
    const waitlistResult = await dbConfig.run(`
        INSERT INTO waitlist (
            student_id, course_id, waitlist_position, status
        ) VALUES ($1, $2, $3, 'active')
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [student.id, course_id, nextPosition]);
    
    let waitlistId;
    if (dbConfig.isProduction) {
        waitlistId = waitlistResult[0]?.id;
    } else {
        waitlistId = waitlistResult.lastID;
    }
    
    console.log('📝 Waitlist entry created', { id: waitlistId, course_id, email, position: nextPosition });
    
    res.json({ 
        success: true, 
        waitlistId: waitlistId,
        studentId: student.id,
        position: nextPosition,
        courseName: courseCheck.name
    });
}));

/**
 * Get waitlist for a course (admin only)
 * GET /api/admin/waitlist/:courseId
 */
app.get('/api/admin/waitlist/:courseId', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    
    const waitlistEntries = await dbConfig.all(`
        SELECT w.*, s.first_name, s.last_name, s.email, s.phone, s.instagram_handle, s.dance_experience,
               c.name as course_name
        FROM waitlist w
        JOIN students s ON w.student_id = s.id
        JOIN courses c ON w.course_id = c.id
        WHERE w.course_id = $1 AND w.status = 'active'
        ORDER BY w.waitlist_position ASC
    `, [courseId]);
    
    const formatted = waitlistEntries.map(entry => ({
        id: entry.id,
        student_id: entry.student_id,
        waitlist_position: entry.waitlist_position,
        status: entry.status,
        notification_sent: dbConfig.isProduction ? entry.notification_sent : Boolean(entry.notification_sent),
        notification_sent_at: entry.notification_sent_at,
        created_at: entry.created_at,
        student: {
            first_name: entry.first_name || '',
            last_name: entry.last_name || '',
            email: entry.email || '',
            phone: entry.phone || '',
            instagram_handle: entry.instagram_handle || '',
            dance_experience: entry.dance_experience || ''
        },
        course_name: entry.course_name
    }));
    
    res.json(formatted);
}));

/**
 * Remove student from waitlist (admin only)
 * DELETE /api/admin/waitlist/:id
 */
app.delete('/api/admin/waitlist/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get waitlist entry info before deletion for position adjustment
    const waitlistEntry = await dbConfig.get('SELECT course_id, waitlist_position FROM waitlist WHERE id = $1', [id]);
    
    if (!waitlistEntry) {
        return res.status(404).json({ error: 'Waitlist entry not found' });
    }
    
    // Delete waitlist entry
    await dbConfig.run('DELETE FROM waitlist WHERE id = $1', [id]);
    
    // Adjust positions for remaining students (move everyone up)
    await dbConfig.run(`
        UPDATE waitlist 
        SET waitlist_position = waitlist_position - 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE course_id = $1 AND waitlist_position > $2 AND status = 'active'
    `, [waitlistEntry.course_id, waitlistEntry.waitlist_position]);
    
    console.log('🗑️ Removed from waitlist', { id, course_id: waitlistEntry.course_id, position: waitlistEntry.waitlist_position });
    
    res.json({ success: true });
}));

/**
 * Update waitlist position (admin only)
 * PUT /api/admin/waitlist/:id/position
 * Body: { new_position: number }
 */
app.put('/api/admin/waitlist/:id/position', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { new_position } = req.body;
    
    if (!new_position || new_position < 1) {
        return res.status(400).json({ error: 'new_position must be a positive number' });
    }
    
    // Get current waitlist entry
    const entry = await dbConfig.get('SELECT course_id, waitlist_position FROM waitlist WHERE id = $1', [id]);
    if (!entry) {
        return res.status(404).json({ error: 'Waitlist entry not found' });
    }
    
    const oldPosition = entry.waitlist_position;
    const courseId = entry.course_id;
    
    if (oldPosition === new_position) {
        return res.json({ success: true, message: 'Position unchanged' });
    }
    
    // Get max position for validation
    const maxResult = await dbConfig.get('SELECT MAX(waitlist_position) as max_pos FROM waitlist WHERE course_id = $1 AND status = \'active\'', [courseId]);
    const maxPosition = maxResult.max_pos || 0;
    
    if (new_position > maxPosition) {
        return res.status(400).json({ error: `Position ${new_position} exceeds maximum position ${maxPosition}` });
    }
    
    // Adjust other positions first
    if (new_position < oldPosition) {
        // Moving up - shift others down
        await dbConfig.run(`
            UPDATE waitlist 
            SET waitlist_position = waitlist_position + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE course_id = $1 AND waitlist_position >= $2 AND waitlist_position < $3 AND status = 'active'
        `, [courseId, new_position, oldPosition]);
    } else {
        // Moving down - shift others up
        await dbConfig.run(`
            UPDATE waitlist 
            SET waitlist_position = waitlist_position - 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE course_id = $1 AND waitlist_position > $2 AND waitlist_position <= $3 AND status = 'active'
        `, [courseId, oldPosition, new_position]);
    }
    
    // Update the target entry
    await dbConfig.run(`
        UPDATE waitlist 
        SET waitlist_position = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
    `, [new_position, id]);
    
    console.log('🔄 Waitlist position updated', { id, course_id: courseId, old_position: oldPosition, new_position });
    
    res.json({ success: true });
}));

/**
 * Send notification to waitlist student (admin only)
 * POST /api/admin/waitlist/:id/notify
 * Body: { expires_hours?: number } (default 48 hours)
 */
app.post('/api/admin/waitlist/:id/notify', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { expires_hours = 48 } = req.body;
    
    // Get waitlist entry with student and course info
    const waitlistEntry = await dbConfig.get(`
        SELECT w.*, s.first_name, s.last_name, s.email, c.name as course_name, c.id as course_id
        FROM waitlist w
        JOIN students s ON w.student_id = s.id
        JOIN courses c ON w.course_id = c.id
        WHERE w.id = $1
    `, [id]);
    
    if (!waitlistEntry) {
        return res.status(404).json({ error: 'Waitlist entry not found' });
    }
    
    // Generate secure token for waitlist registration
    const crypto = require('crypto');
    const paymentToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expires_hours);
    
    // Update waitlist entry with notification details
    await dbConfig.run(`
        UPDATE waitlist SET
            notification_sent = ${dbConfig.isProduction ? 'true' : '1'},
            notification_sent_at = CURRENT_TIMESTAMP,
            notification_expires_at = $1,
            payment_link_token = $2,
            status = 'notified',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
    `, [expiresAt.toISOString(), paymentToken, id]);
    
    // Create the secure registration URL
    const registrationUrl = `${req.protocol}://${req.get('host')}/waitlist-register/${paymentToken}`;
    
    // Send actual email notification
    try {
        // Check if email notifications are enabled
        const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
        const emailEnabled = setting && setting.setting_value === 'true';

        if (emailEnabled && (process.env.GMAIL_USER || process.env.EMAIL_USER)) {
            // Get course pricing and schedule info for email
            const { schedule_info } = await fetchCourseWithSlots(dbConfig, waitlistEntry.course_id);
            
            // Get course pricing from slots
            const courseSlots = await dbConfig.all(`
                SELECT cs.id FROM course_slots cs WHERE cs.course_id = $1 LIMIT 1
            `, [waitlistEntry.course_id]);
            
            let amount = '0';
            if (courseSlots.length > 0) {
                const pricing = await dbConfig.get(`
                    SELECT price FROM course_pricing 
                    WHERE course_slot_id = $1 AND pricing_type = 'full_package'
                    ORDER BY price DESC LIMIT 1
                `, [courseSlots[0].id]);
                amount = pricing ? String(pricing.price) : '0';
            }
            
            await sendWaitlistNotificationEmail(waitlistEntry.email, {
                courseName: waitlistEntry.course_name,
                scheduleInfo: schedule_info,
                amount: amount,
                studentName: `${waitlistEntry.first_name} ${waitlistEntry.last_name}`.trim(),
                position: waitlistEntry.waitlist_position,
                registrationUrl: registrationUrl,
                expiresAt: expiresAt.toISOString(),
                expiresHours: expires_hours
            });
            
            console.log('📧 Waitlist notification email sent', { 
                id, 
                email: waitlistEntry.email, 
                course: waitlistEntry.course_name,
                expires_at: expiresAt.toISOString(),
                registration_url: registrationUrl
            });
        } else {
            console.log('📧 Waitlist notification logged (email disabled)', { 
                id, 
                email: waitlistEntry.email, 
                course: waitlistEntry.course_name,
                registration_url: registrationUrl
            });
        }
    } catch (emailError) {
        console.error('❌ Failed to send waitlist notification email:', emailError);
        // Don't fail the entire request just because email failed
    }
    
    res.json({ 
        success: true,
        registration_url: registrationUrl,
        expires_at: expiresAt.toISOString(),
        expires_hours: expires_hours
    });
}));

/**
 * Get all waitlists (admin only)
 * GET /api/admin/waitlists?course_id=optional
 */
app.get('/api/admin/waitlists', requireAuth, asyncHandler(async (req, res) => {
    const { course_id } = req.query;
    
    let query = `
        SELECT w.*, s.first_name, s.last_name, s.email, s.phone, s.instagram_handle, s.dance_experience,
               c.name as course_name, c.id as course_id
        FROM waitlist w
        JOIN students s ON w.student_id = s.id
        JOIN courses c ON w.course_id = c.id
        WHERE w.status IN ('active', 'notified', 'registered', 'expired')
    `;
    
    const params = [];
    
    if (course_id) {
        query += ' AND w.course_id = $1';
        params.push(course_id);
    }
    
    query += ' ORDER BY c.name ASC, w.waitlist_position ASC';
    
    const waitlistEntries = await dbConfig.all(query, params);
    
    const formatted = waitlistEntries.map(entry => ({
        id: entry.id,
        student_id: entry.student_id,
        course_id: entry.course_id,
        course_name: entry.course_name,
        position: entry.waitlist_position,
        status: entry.status,
        notification_sent: dbConfig.isProduction ? entry.notification_sent : Boolean(entry.notification_sent),
        notification_sent_at: entry.notification_sent_at,
        notification_expires_at: entry.notification_expires_at,
        created_at: entry.created_at,
        first_name: entry.first_name || '',
        last_name: entry.last_name || '',
        email: entry.email || '',
        phone: entry.phone || '',
        instagram_handle: entry.instagram_handle || '',
        dance_experience: entry.dance_experience || ''
    }));
    
    res.json(formatted);
}));

/**
 * Notify selected waitlist students (admin only)
 * POST /api/admin/waitlists/notify
 * Body: { waitlist_ids: [1, 2, 3] }
 */
app.post('/api/admin/waitlists/notify', requireAuth, asyncHandler(async (req, res) => {
    const { waitlist_ids } = req.body;
    
    if (!Array.isArray(waitlist_ids) || waitlist_ids.length === 0) {
        return res.status(400).json({ error: 'waitlist_ids array is required' });
    }
    
    let notifiedCount = 0;
    const crypto = require('crypto');
    
    for (const id of waitlist_ids) {
        try {
            // Get waitlist entry
            const waitlistEntry = await dbConfig.get(`
                SELECT w.*, s.first_name, s.last_name, s.email, c.name as course_name
                FROM waitlist w
                JOIN students s ON w.student_id = s.id
                JOIN courses c ON w.course_id = c.id
                WHERE w.id = $1 AND w.status = 'active'
            `, [id]);
            
            if (!waitlistEntry) {
                console.warn('⚠️ Waitlist entry not found or inactive:', id);
                continue;
            }
            
            // Generate secure token
            const paymentToken = crypto.randomBytes(32).toString('hex');
            
            // Set expiration to 48 hours
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48);
            
            // Update waitlist entry
            await dbConfig.run(`
                UPDATE waitlist SET
                    notification_sent = ${dbConfig.isProduction ? 'true' : '1'},
                    notification_sent_at = CURRENT_TIMESTAMP,
                    notification_expires_at = $1,
                    payment_link_token = $2,
                    status = 'notified',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [expiresAt.toISOString(), paymentToken, id]);
            
            // Send actual email notification
            try {
                const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
                const emailEnabled = setting && setting.setting_value === 'true';

                if (emailEnabled && (process.env.GMAIL_USER || process.env.EMAIL_USER)) {
                    const { schedule_info } = await fetchCourseWithSlots(dbConfig, waitlistEntry.course_id);
                    
                    const courseSlots = await dbConfig.all(`
                        SELECT cs.id FROM course_slots cs WHERE cs.course_id = $1 LIMIT 1
                    `, [waitlistEntry.course_id]);
                    
                    let amount = '0';
                    if (courseSlots.length > 0) {
                        const pricing = await dbConfig.get(`
                            SELECT price FROM course_pricing 
                            WHERE course_slot_id = $1 AND pricing_type = 'full_package'
                            ORDER BY price DESC LIMIT 1
                        `, [courseSlots[0].id]);
                        amount = pricing ? String(pricing.price) : '0';
                    }
                    
                    // Generate registration URL
                    const registrationUrl = `${req.protocol}://${req.get('host')}/waitlist-register/${paymentToken}`;
                    
                    await sendWaitlistNotificationEmail(waitlistEntry.email, {
                        courseName: waitlistEntry.course_name,
                        scheduleInfo: schedule_info,
                        amount: amount,
                        studentName: `${waitlistEntry.first_name} ${waitlistEntry.last_name}`.trim(),
                        position: waitlistEntry.waitlist_position,
                        registrationUrl: registrationUrl,
                        expiresAt: expiresAt.toISOString(),
                        expiresHours: 48
                    });
                    
                    console.log('📧 Waitlist notification email sent', { 
                        id, 
                        email: waitlistEntry.email, 
                        course: waitlistEntry.course_name 
                    });
                } else {
                    console.log('📧 Waitlist notification logged (email disabled)', { 
                        id, 
                        email: waitlistEntry.email, 
                        course: waitlistEntry.course_name 
                    });
                }
            } catch (emailError) {
                console.error('❌ Failed to send waitlist notification email:', emailError);
                // Don't fail the entire request just because email failed
            }
            
            notifiedCount++;
        } catch (error) {
            console.error('❌ Error notifying waitlist student:', id, error);
        }
    }
    
    res.json({ 
        success: true,
        notified_count: notifiedCount,
        message: `Notified ${notifiedCount} students successfully`
    });
}));

/**
 * Remove selected students from waitlists (admin only)
 * POST /api/admin/waitlists/remove
 * Body: { waitlist_ids: [1, 2, 3] }
 */
app.post('/api/admin/waitlists/remove', requireAuth, asyncHandler(async (req, res) => {
    const { waitlist_ids } = req.body;
    
    if (!Array.isArray(waitlist_ids) || waitlist_ids.length === 0) {
        return res.status(400).json({ error: 'waitlist_ids array is required' });
    }
    
    let removedCount = 0;
    
    for (const id of waitlist_ids) {
        try {
            // Get waitlist entry info before deletion for position adjustment
            const waitlistEntry = await dbConfig.get('SELECT course_id, waitlist_position FROM waitlist WHERE id = $1', [id]);
            
            if (!waitlistEntry) {
                console.warn('⚠️ Waitlist entry not found:', id);
                continue;
            }
            
            // Delete waitlist entry
            await dbConfig.run('DELETE FROM waitlist WHERE id = $1', [id]);
            
            // Adjust positions for remaining students (move everyone up)
            await dbConfig.run(`
                UPDATE waitlist 
                SET waitlist_position = waitlist_position - 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE course_id = $1 AND waitlist_position > $2 AND status = 'active'
            `, [waitlistEntry.course_id, waitlistEntry.waitlist_position]);
            
            console.log('🗑️ Removed from waitlist', { id, course_id: waitlistEntry.course_id });
            removedCount++;
        } catch (error) {
            console.error('❌ Error removing waitlist student:', id, error);
        }
    }
    
    res.json({ 
        success: true,
        removed_count: removedCount,
        message: `Removed ${removedCount} students from waitlists`
    });
}));

/**
 * Export waitlists to CSV (admin only)
 * GET /api/admin/waitlists/export?course_id=optional
 */
app.get('/api/admin/waitlists/export', requireAuth, asyncHandler(async (req, res) => {
    const { course_id } = req.query;
    
    let query = `
        SELECT w.*, s.first_name, s.last_name, s.email, s.phone, s.instagram_handle, s.dance_experience,
               c.name as course_name
        FROM waitlist w
        JOIN students s ON w.student_id = s.id
        JOIN courses c ON w.course_id = c.id
    `;
    
    const params = [];
    
    if (course_id) {
        query += ' WHERE w.course_id = $1';
        params.push(course_id);
    }
    
    query += ' ORDER BY c.name ASC, w.waitlist_position ASC';
    
    const waitlistEntries = await dbConfig.all(query, params);
    
    // CSV helpers
    const esc = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        const needsQuotes = s.includes(',') || s.includes('\n') || s.includes('"');
        return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s;
    };
    
    const headers = ['Waitlist ID', 'Position', 'Course', 'Student Name', 'Email', 'Phone', 'Instagram', 'Experience', 'Status', 'Notified', 'Created Date'];
    const lines = [headers.join(',')];
    
    for (const entry of waitlistEntries) {
        const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim();
        const notified = dbConfig.isProduction ? entry.notification_sent : Boolean(entry.notification_sent);
        const line = [
            esc(entry.id),
            esc(entry.waitlist_position),
            esc(entry.course_name),
            esc(name),
            esc(entry.email || ''),
            esc(entry.phone || ''),
            esc(entry.instagram_handle || ''),
            esc(entry.dance_experience || ''),
            esc(entry.status),
            esc(notified ? 'Yes' : 'No'),
            esc(new Date(entry.created_at).toLocaleDateString())
        ].join(',');
        lines.push(line);
    }
    
    const csv = lines.join('\n');
    const filename = `waitlists-${new Date().toISOString().slice(0,10)}.csv`;
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
}));

/**
 * Notify next student on course waitlist (admin only)
 * POST /api/admin/courses/:courseId/waitlist/notify-next
 */
app.post('/api/admin/courses/:courseId/waitlist/notify-next', requireAuth, asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    
    // Get next active student on waitlist (lowest position number)
    const nextStudent = await dbConfig.get(`
        SELECT w.*, s.first_name, s.last_name, s.email, c.name as course_name
        FROM waitlist w
        JOIN students s ON w.student_id = s.id
        JOIN courses c ON w.course_id = c.id
        WHERE w.course_id = $1 AND w.status = 'active'
        ORDER BY w.waitlist_position ASC
        LIMIT 1
    `, [courseId]);
    
    if (!nextStudent) {
        return res.json({ 
            success: true,
            message: 'No active students on waitlist to notify'
        });
    }
    
    try {
        const crypto = require('crypto');
        const paymentToken = crypto.randomBytes(32).toString('hex');
        
        // Set expiration to 48 hours
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);
        
        // Update waitlist entry
        await dbConfig.run(`
            UPDATE waitlist SET
                notification_sent = ${dbConfig.isProduction ? 'true' : '1'},
                notification_sent_at = CURRENT_TIMESTAMP,
                notification_expires_at = $1,
                payment_link_token = $2,
                status = 'notified',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [expiresAt.toISOString(), paymentToken, nextStudent.id]);
        
        // Send actual email notification
        try {
            const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
            const emailEnabled = setting && setting.setting_value === 'true';

            if (emailEnabled && (process.env.GMAIL_USER || process.env.EMAIL_USER)) {
                const { schedule_info } = await fetchCourseWithSlots(dbConfig, courseId);
                
                const courseSlots = await dbConfig.all(`
                    SELECT cs.id FROM course_slots cs WHERE cs.course_id = $1 LIMIT 1
                `, [courseId]);
                
                let amount = '0';
                if (courseSlots.length > 0) {
                    const pricing = await dbConfig.get(`
                        SELECT price FROM course_pricing 
                        WHERE course_slot_id = $1 AND pricing_type = 'full_package'
                        ORDER BY price DESC LIMIT 1
                    `, [courseSlots[0].id]);
                    amount = pricing ? String(pricing.price) : '0';
                }
                
                // Generate registration URL
                const registrationUrl = `${req.protocol}://${req.get('host')}/waitlist-register/${paymentToken}`;
                
                await sendWaitlistNotificationEmail(nextStudent.email, {
                    courseName: nextStudent.course_name,
                    scheduleInfo: schedule_info,
                    amount: amount,
                    studentName: `${nextStudent.first_name} ${nextStudent.last_name}`.trim(),
                    position: nextStudent.waitlist_position,
                    registrationUrl: registrationUrl,
                    expiresAt: expiresAt.toISOString(),
                    expiresHours: 48
                });
                
                console.log('📧 Waitlist notification email sent to next student', { 
                    student_id: nextStudent.student_id,
                    email: nextStudent.email, 
                    course: nextStudent.course_name,
                    position: nextStudent.waitlist_position
                });
            } else {
                console.log('📧 Waitlist notification logged (email disabled)', { 
                    student_id: nextStudent.student_id,
                    email: nextStudent.email, 
                    course: nextStudent.course_name,
                    position: nextStudent.waitlist_position
                });
            }
        } catch (emailError) {
            console.error('❌ Failed to send waitlist notification email to next student:', emailError);
            // Don't fail the entire request just because email failed
        }
        
        res.json({ 
            success: true,
            notified_student: {
                first_name: nextStudent.first_name,
                last_name: nextStudent.last_name,
                email: nextStudent.email,
                position: nextStudent.waitlist_position
            },
            message: `Notified ${nextStudent.first_name} ${nextStudent.last_name} about available spot`
        });
    } catch (error) {
        console.error('❌ Error notifying next student:', error);
        res.status(500).json({ error: 'Failed to notify next student' });
    }
}));

// Students and Registrations
// Per-class registration switch. NULL (older rows) counts as open.
function isRegistrationOpen(value) {
    return !(value === false || value === 0 || value === '0' || value === 'false');
}

// Admin: open or close registration for one class
app.put('/api/courses/:id/registration-open', requireAuth, asyncHandler(async (req, res) => {
    const open = !!(req.body || {}).open;
    await dbConfig.run('UPDATE courses SET registration_open = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [dbConfig.isProduction ? open : (open ? 1 : 0), req.params.id]);
    res.json({ success: true, registration_open: open });
}));

// 'venmo' / 'zelle' from the checkout page -> 'Venmo' / 'Zelle' (anything else: not recorded)
function paymentMethodLabel(value) {
    const v = String(value || '').toLowerCase();
    return v === 'venmo' ? 'Venmo' : v === 'zelle' ? 'Zelle' : null;
}

// ===================== Waitlist offers =====================
// When a spot opens (the admin cancels a paid registration), the next person on
// that class's waitlist is emailed a personal link and the spot is held for them
// for the "waitlist hold" time (Settings, default 24 hours). If they don't
// register in time, the offer expires and the next person is emailed, in order.
async function waitlistHoldHours() {
    const row = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['waitlist_hold_hours']);
    const h = Number(row?.setting_value);
    return h > 0 && h <= 168 ? h : 24;
}

// Spots held for students who were offered one (still within their time, or
// registered through the offer and waiting for their payment to be confirmed)
async function heldSpots(courseId) {
    const row = await dbConfig.get(`
        SELECT COUNT(*) AS n FROM waitlist w
        WHERE w.course_id = $1 AND (
            (w.status = 'notified' AND w.notification_expires_at > $2)
            OR (w.status = 'registered' AND EXISTS (
                SELECT 1 FROM registrations r WHERE r.id = w.registration_id AND r.payment_status = 'pending'))
        )
    `, [courseId, new Date().toISOString()]);
    return Number(row?.n) || 0;
}

function siteUrl(req) {
    if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
    if (req) return `${req.protocol}://${req.get('host')}`;
    return 'https://dance-registration-portal-production.up.railway.app';
}

// Email one waitlist entry a personal link and hold a spot for them
async function offerSpot(entryId, req, hours) {
    const entry = await dbConfig.get(`
        SELECT w.*, s.first_name, s.last_name, s.email, c.name AS course_name
        FROM waitlist w JOIN students s ON s.id = w.student_id JOIN courses c ON c.id = w.course_id
        WHERE w.id = $1
    `, [entryId]);
    if (!entry) return null;
    const holdHours = hours || await waitlistHoldHours();
    const token = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + holdHours * 60 * 60 * 1000);
    await dbConfig.run(`
        UPDATE waitlist SET notification_sent = ${dbConfig.isProduction ? 'true' : '1'}, notification_sent_at = CURRENT_TIMESTAMP,
               notification_expires_at = $1, payment_link_token = $2, status = 'notified', updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
    `, [expiresAt.toISOString(), token, entryId]);
    const registrationUrl = `${siteUrl(req)}/waitlist-register/${token}`;
    try {
        const { schedule_info } = await fetchCourseWithSlots(dbConfig, entry.course_id);
        const price = await dbConfig.get(`
            SELECT cp.price FROM course_pricing cp JOIN course_slots cs ON cs.id = cp.course_slot_id
            WHERE cs.course_id = $1 AND cp.pricing_type = 'full_package' ORDER BY cs.id LIMIT 1
        `, [entry.course_id]);
        await sendWaitlistNotificationEmail(entry.email, {
            courseName: entry.course_name,
            scheduleInfo: schedule_info,
            amount: price ? String(price.price) : '',
            studentName: [entry.first_name, entry.last_name].filter(Boolean).join(' '),
            position: entry.waitlist_position,
            registrationUrl,
            expiresAt: expiresAt.toISOString(),
            expiresHours: holdHours
        });
    } catch (err) {
        console.error('❌ Waitlist offer email failed:', err.message || err);
    }
    return { id: entryId, email: entry.email, registration_url: registrationUrl, expires_at: expiresAt.toISOString() };
}

// Offer every open spot in a class to the next people waiting, in order
async function offerOpenSpots(courseId, req) {
    const offered = [];
    const { available } = await getCourseAvailability(dbConfig, courseId);
    let free = available - await heldSpots(courseId);
    while (free > 0) {
        const next = await dbConfig.get(
            "SELECT id FROM waitlist WHERE course_id = $1 AND status = 'active' ORDER BY waitlist_position ASC, created_at ASC LIMIT 1",
            [courseId]
        );
        if (!next) break;
        const offer = await offerSpot(next.id, req);
        if (offer) offered.push(offer);
        free--;
    }
    return offered;
}

// Offers whose time ran out: mark expired and move on to the next person
async function expireWaitlistOffers() {
    const expired = await dbConfig.all(
        "SELECT id, course_id FROM waitlist WHERE status = 'notified' AND notification_expires_at <= $1",
        [new Date().toISOString()]
    );
    const courses = new Set();
    for (const e of expired) {
        await dbConfig.run("UPDATE waitlist SET status = 'expired', payment_link_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [e.id]);
        courses.add(e.course_id);
    }
    for (const courseId of courses) await offerOpenSpots(courseId, null);
    return expired.length;
}
// Check every 10 minutes while the server is running
setInterval(() => { expireWaitlistOffers().catch(err => console.error('waitlist expiry check failed:', err.message || err)); }, 10 * 60 * 1000).unref();

// A valid, unexpired offer for this class (and this student, when an email is given)
async function validWaitlistOffer(token, courseId, email) {
    if (!token) return null;
    const offer = await dbConfig.get(`
        SELECT w.id, w.course_id, w.notification_expires_at, s.email
        FROM waitlist w JOIN students s ON s.id = w.student_id
        WHERE w.payment_link_token = $1 AND w.status = 'notified'
    `, [String(token)]);
    if (!offer || new Date(offer.notification_expires_at) <= new Date()) return null;
    if (courseId && Number(offer.course_id) !== Number(courseId)) return null;
    if (email && String(offer.email).toLowerCase() !== String(email).trim().toLowerCase()) return null;
    return offer;
}

// The link in the "spot available" email
app.get('/waitlist-register/:token', asyncHandler(async (req, res) => {
    const offer = await validWaitlistOffer(req.params.token);
    if (!offer) {
        res.set('Cache-Control', 'no-cache');
        return res.status(410).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offer expired · GouMo</title><link href="/css/site.css?v=2" rel="stylesheet"></head>
<body><main style="max-width:560px;margin:0 auto;padding:48px 16px;text-align:center">
<img src="/images/goumo-logo.png" alt="GouMo" style="height:56px">
<h1 style="font-family:var(--font-display);text-transform:uppercase;font-weight:400">This link has expired</h1>
<p style="color:var(--muted)">The spot was held for a limited time and has been offered to the next person on the waitlist. If you think this is a mistake, message us on Instagram <a class="accent" href="https://instagram.com/goumo_dancechronicles">@goumo_dancechronicles</a>.</p>
<p><a class="btn btn-primary" href="/#classes">See classes</a></p></main></body></html>`);
    }
    res.redirect(`/email-profile.html?course=${encodeURIComponent(offer.course_id)}&waitlist=${encodeURIComponent(req.params.token)}`);
}));

// ===================== Student cleanup & test accounts =====================
const tableCache = {};
async function tableExists(name) {
    if (name in tableCache) return tableCache[name];
    let exists = false;
    try {
        const row = dbConfig.isProduction
            ? await dbConfig.get('SELECT to_regclass($1) AS t', [name])
            : await dbConfig.get("SELECT name AS t FROM sqlite_master WHERE type = 'table' AND name = $1", [name]);
        exists = !!(row && row.t);
    } catch (e) { exists = false; }
    tableCache[name] = exists;
    return exists;
}

const dbBool = (v) => (dbConfig.isProduction ? !!v : (v ? 1 : 0));

async function setTester(studentId, on) {
    await dbConfig.run('UPDATE students SET is_tester = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [dbBool(on), studentId]);
    await dbConfig.run('UPDATE registrations SET is_test = $1 WHERE student_id = $2', [dbBool(on), studentId]);
}

// Bulk actions on students: hide (archive), restore, or change type
app.post('/api/admin/students/bulk', requireAuth, asyncHandler(async (req, res) => {
    const { action } = req.body || {};
    const ids = [...new Set(((req.body || {}).ids || []).map(Number).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one student' });
    const classified = dbConfig.isProduction ? 'true' : '1';
    const actions = {
        archive: 'UPDATE students SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        restore: 'UPDATE students SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        make_crew: `UPDATE students SET student_type = 'crew_member', admin_classified = ${classified}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        make_general: `UPDATE students SET student_type = 'general', admin_classified = ${classified}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`
    };
    if (!actions[action]) return res.status(400).json({ error: 'Unknown action' });
    for (const id of ids) await dbConfig.run(actions[action], [id]);
    res.json({ success: true, updated: ids.length });
}));

// Mark / unmark a test account (its registrations stop counting in numbers)
app.put('/api/admin/students/:id/tester', requireAuth, asyncHandler(async (req, res) => {
    const student = await dbConfig.get('SELECT id FROM students WHERE id = $1', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    await setTester(student.id, !!(req.body || {}).is_tester);
    res.json({ success: true });
}));

// Reset a test account: remove all its registrations and waitlist spots
app.delete('/api/admin/students/:id/test-data', requireAuth, asyncHandler(async (req, res) => {
    const student = await dbConfig.get('SELECT id, is_tester FROM students WHERE id = $1', [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!isTrue(student.is_tester)) return res.status(400).json({ error: 'Only test accounts can be reset' });
    const regs = await dbConfig.get('SELECT COUNT(*) AS n FROM registrations WHERE student_id = $1', [student.id]);
    await dbConfig.run('DELETE FROM registrations WHERE student_id = $1', [student.id]);
    await dbConfig.run('DELETE FROM waitlist WHERE student_id = $1', [student.id]);
    res.json({ success: true, removed: Number(regs?.n) || 0 });
}));

// Data check: things in the data that don't add up, with safe fixes
app.get('/api/admin/data-check', requireAuth, asyncHandler(async (req, res) => {
    const unlinked = await dbConfig.all(`
        SELECT r.id, r.course_id, r.payment_status, r.payment_amount, r.registration_date, c.name AS course_name
        FROM registrations r
        LEFT JOIN students s ON s.id = r.student_id
        LEFT JOIN courses c ON c.id = r.course_id
        WHERE s.id IS NULL
        ORDER BY r.registration_date DESC
    `);
    const dupRows = await dbConfig.all(`
        SELECT s.id, s.email, s.first_name, s.last_name, s.created_at,
               (SELECT COUNT(*) FROM registrations r WHERE r.student_id = s.id) AS registrations
        FROM students s
        WHERE s.archived_at IS NULL AND LOWER(TRIM(s.email)) IN (
            SELECT LOWER(TRIM(email)) FROM students WHERE archived_at IS NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1
        )
        ORDER BY s.id
    `);
    const groups = {};
    dupRows.forEach(r => {
        const k = String(r.email || '').trim().toLowerCase();
        (groups[k] = groups[k] || []).push({ ...r, registrations: Number(r.registrations) || 0 });
    });
    const noRegs = await dbConfig.get(`
        SELECT COUNT(*) AS n FROM students s
        WHERE s.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.student_id = s.id)
    `);
    const legacy = {};
    for (const t of ['attendance_records', 'class_sessions', 'competition_registrations', 'dance_series']) {
        if (await tableExists(t)) {
            const row = await dbConfig.get(`SELECT COUNT(*) AS n FROM ${t}`);
            legacy[t] = Number(row?.n) || 0;
        }
    }
    res.json({
        unlinked_registrations: unlinked,
        duplicate_students: Object.entries(groups).map(([email, students]) => ({ email, students })),
        students_without_registrations: Number(noRegs?.n) || 0,
        legacy_tables: legacy
    });
}));

// Merge students saved twice under one email: keep the oldest profile, move the
// others' registrations and waitlist spots to it, and hide the extra profiles.
app.post('/api/admin/data-check/merge-duplicates', requireAuth, asyncHandler(async (req, res) => {
    const rows = await dbConfig.all(`
        SELECT id, LOWER(TRIM(email)) AS k FROM students
        WHERE archived_at IS NULL AND LOWER(TRIM(email)) IN (
            SELECT LOWER(TRIM(email)) FROM students WHERE archived_at IS NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1
        )
        ORDER BY id
    `);
    const keep = {};
    let merged = 0;
    for (const r of rows) {
        if (!keep[r.k]) { keep[r.k] = r.id; continue; }
        await dbConfig.run('UPDATE registrations SET student_id = $1 WHERE student_id = $2', [keep[r.k], r.id]);
        await dbConfig.run('UPDATE waitlist SET student_id = $1 WHERE student_id = $2', [keep[r.k], r.id]);
        await dbConfig.run('UPDATE students SET archived_at = CURRENT_TIMESTAMP, admin_notes = $1 WHERE id = $2', [`Merged into student #${keep[r.k]}`, r.id]);
        merged++;
    }
    res.json({ success: true, merged });
}));

// Test accounts only: switch between crew member and GouMo student from My classes
app.put('/api/my/tester-type', asyncHandler(async (req, res) => {
    const { email, student_type } = req.body || {};
    const student = await dbConfig.get('SELECT id, is_tester FROM students WHERE LOWER(email) = LOWER($1)', [String(email || '').trim()]);
    if (!student || !isTrue(student.is_tester)) return res.status(403).json({ error: 'Only test accounts can do this' });
    if (!['crew_member', 'general'].includes(student_type)) return res.status(400).json({ error: 'Unknown type' });
    await dbConfig.run('UPDATE students SET student_type = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [student_type, student.id]);
    res.json({ success: true, student_type });
}));

// ===================== Student profiles =====================
// One student's classes (with time and location for the student page)
// and active waitlists. Used by the admin profile and the "My GouMo" page.
async function studentHistory(studentId) {
    const registrations = await dbConfig.all(`
        SELECT r.id, r.course_id, r.payment_status, r.payment_amount, r.payment_method, r.registration_date,
               r.selected_dates, r.combo_id, r.combo_group,
               c.name AS course_name, c.course_type, c.session_dates, c.song_name, c.instructor,
               c.start_date, c.duration_weeks, cb.name AS combo_name
        FROM registrations r
        LEFT JOIN courses c ON c.id = r.course_id
        LEFT JOIN combos cb ON cb.id = r.combo_id
        WHERE r.student_id = $1
        ORDER BY r.registration_date DESC
    `, [studentId]);
    const slotCache = {};
    for (const r of registrations) {
        if (!r.course_id) continue;
        if (!(r.course_id in slotCache)) {
            slotCache[r.course_id] = await dbConfig.get(
                'SELECT start_time, end_time, location, practice_date FROM course_slots WHERE course_id = $1 ORDER BY id LIMIT 1', [r.course_id]);
        }
        r.slots = slotCache[r.course_id] ? [slotCache[r.course_id]] : [];
    }
    const waitlists = await dbConfig.all(`
        SELECT w.id, w.course_id, w.waitlist_position AS position, w.created_at, w.status, w.notification_expires_at, c.name AS course_name
        FROM waitlist w JOIN courses c ON c.id = w.course_id
        WHERE w.student_id = $1 AND w.status IN ('active', 'notified')
        ORDER BY w.created_at DESC
    `, [studentId]);
    const paid = registrations.filter(r => r.payment_status === 'completed');
    const crewPaid = paid.filter(r => r.course_type === 'crew_practice').length;
    // Attendance marked in the old (pre-Oct 2026) roll-call screens, if that table is still there
    let attendedOld = 0;
    if (await tableExists('attendance_records')) {
        const row = await dbConfig.get("SELECT COUNT(*) AS n FROM attendance_records WHERE student_id = $1 AND status IN ('present', 'late')", [studentId]);
        attendedOld = Number(row?.n) || 0;
    }
    return {
        registrations,
        waitlists,
        totals: {
            classes_paid: paid.length,
            // Crew members: crew practices are counted apart from regular classes
            crew_practices: crewPaid,
            regular_classes: paid.length - crewPaid,
            attended_old_records: attendedOld,
            amount_paid: Math.round(paid.reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0) * 100) / 100,
            pending: registrations.filter(r => r.payment_status === 'pending').length
        }
    };
}

const STUDENT_PUBLIC_FIELDS = 'id, first_name, last_name, email, instagram_handle, dance_experience, student_type, created_at, is_tester, archived_at';

// Admin: one student's profile, history and private notes
app.get('/api/admin/students/:id', requireAuth, asyncHandler(async (req, res) => {
    const student = await dbConfig.get(`SELECT ${STUDENT_PUBLIC_FIELDS}, admin_notes FROM students WHERE id = $1`, [req.params.id]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json({ student, ...(await studentHistory(student.id)) });
}));

app.put('/api/admin/students/:id/notes', requireAuth, asyncHandler(async (req, res) => {
    const notes = String((req.body || {}).notes || '').slice(0, 5000);
    await dbConfig.run('UPDATE students SET admin_notes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [notes || null, req.params.id]);
    res.json({ success: true });
}));

// Student "My GouMo" page. Sign-in is email only (decided Oct 2026), so this
// returns only the student's own basics and classes, never admin notes.
app.post('/api/my/profile', asyncHandler(async (req, res) => {
    const email = String((req.body || {}).email || '').trim();
    if (!email) return res.status(400).json({ error: 'Enter your email' });
    const student = await dbConfig.get(`SELECT ${STUDENT_PUBLIC_FIELDS} FROM students WHERE LOWER(email) = LOWER($1)`, [email]);
    if (!student) return res.status(404).json({ error: "We couldn't find that email. Register for a class first, or try the email you used before." });
    const history = await studentHistory(student.id);
    history.registrations.forEach(r => { delete r.combo_group; });
    res.json({ student, ...history });
}));

app.put('/api/my/profile', asyncHandler(async (req, res) => {
    const { email, first_name, last_name, instagram_handle, dance_experience } = req.body || {};
    if (!email || !String(first_name || '').trim()) return res.status(400).json({ error: 'Your first name is required' });
    const student = await dbConfig.get('SELECT id FROM students WHERE LOWER(email) = LOWER($1)', [String(email).trim()]);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const allowed = ['beginner', 'some_experience', 'intermediate', 'advanced', 'professional'];
    await dbConfig.run(`
        UPDATE students SET first_name = $1, last_name = $2, instagram_handle = $3, dance_experience = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
    `, [String(first_name).trim().slice(0, 100), String(last_name || '').trim().slice(0, 100),
        String(instagram_handle || '').trim().replace(/^@/, '').slice(0, 100) || null,
        allowed.includes(dance_experience) ? dance_experience : null, student.id]);
    res.json({ success: true });
}));

// Crew link shared in the crew WhatsApp group: register page listing only crew-only classes
// Served directly (not a redirect) so WhatsApp shows a crew preview card; the page then
// switches its address to ?crew=1, which the register page reads.
const CREW_PREVIEW = `
    <script>history.replaceState(null, '', '/email-profile.html?crew=1');</script>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="GouMo Dance Chronicles">
    <meta property="og:title" content="Dreamers Dance Crew · Crew practice sign-up">
    <meta property="og:image" content="https://dance-registration-portal-production.up.railway.app/images/og-preview.jpg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">`;
app.get('/crew', (req, res) => {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'email-profile.html'), 'utf8')
        .replace('<title>Register · GouMo Dance Chronicles</title>', '<title>Crew sign-up · GouMo Dance Chronicles</title>' + CREW_PREVIEW);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
});

app.get('/my', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'my.html'));
});

// Admin: every student with how many classes they've paid for
app.get('/api/admin/students', requireAuth, asyncHandler(async (req, res) => {
    const students = await dbConfig.all(`
        SELECT s.id, s.first_name, s.last_name, s.email, s.instagram_handle, s.dance_experience,
               s.student_type, s.created_at, s.archived_at, s.is_tester,
               SUM(CASE WHEN r.payment_status = 'completed' THEN 1 ELSE 0 END) AS paid_classes,
               SUM(CASE WHEN r.payment_status = 'pending' THEN 1 ELSE 0 END) AS pending_classes,
               MAX(r.registration_date) AS last_registered
        FROM students s
        LEFT JOIN registrations r ON r.student_id = s.id
        GROUP BY s.id
        ORDER BY s.created_at DESC
    `);
    res.json(students.map(st => ({
        ...st,
        is_tester: isTrue(st.is_tester),
        paid_classes: Number(st.paid_classes) || 0,
        pending_classes: Number(st.pending_classes) || 0
    })));
}));

// ===================== Combos =====================
// A combo bundles 2+ classes at one price. Registering creates one pending
// registration per class, sharing a combo_group; the combo price is split
// across them so reports still add up.

const dbTrue = () => (dbConfig.isProduction ? 'true' : '1');

// One combo's classes, shaped like /api/courses rows so the student pages
// can format them with class-info.js.
async function loadComboClasses(comboId) {
    const courses = await dbConfig.all(`
        SELECT c.* FROM combo_classes cc
        JOIN courses c ON c.id = cc.course_id
        WHERE cc.combo_id = $1
        ORDER BY c.start_date, c.id
    `, [comboId]);
    for (const course of courses) {
        const slots = await dbConfig.all('SELECT * FROM course_slots WHERE course_id = $1 ORDER BY id', [course.id]);
        for (const slot of slots) {
            const prices = await dbConfig.all('SELECT pricing_type, price FROM course_pricing WHERE course_slot_id = $1', [slot.id]);
            slot.pricing = {};
            prices.forEach(p => { slot.pricing[p.pricing_type] = Number(p.price); });
        }
        course.slots = slots;
        const pricing = (slots[0] && slots[0].pricing) || {};
        course.full_course_price = Number(pricing.full_package) || 0;
        course.per_class_price = Number(pricing.drop_in) || 0;
        const availability = await getCourseAvailability(dbConfig, course.id, course.course_type);
        course.available_spots = availability.available;
    }
    return courses;
}

async function loadCombo(comboId) {
    const combo = await dbConfig.get('SELECT * FROM combos WHERE id = $1', [comboId]);
    if (!combo) return null;
    combo.price = Number(combo.price);
    combo.is_active = combo.is_active === true || combo.is_active === 1;
    combo.classes = await loadComboClasses(combo.id);
    combo.course_ids = combo.classes.map(c => c.id);
    combo.regular_total = combo.classes.reduce((sum, c) => sum + c.full_course_price, 0);
    combo.savings = Math.max(0, combo.regular_total - combo.price);
    combo.available_spots = combo.classes.length ? Math.min(...combo.classes.map(c => c.available_spots)) : 0;
    return combo;
}

function comboProblems(body) {
    const problems = [];
    const ids = [...new Set((body.course_ids || []).map(Number).filter(Boolean))];
    if (!String(body.name || '').trim()) problems.push('Give the combo a name');
    if (ids.length < 2) problems.push('Pick at least 2 classes');
    if (!(Number(body.price) > 0)) problems.push('Set a combo price');
    return { problems, ids };
}

async function saveComboClasses(comboId, ids) {
    await dbConfig.run('DELETE FROM combo_classes WHERE combo_id = $1', [comboId]);
    for (const courseId of ids) {
        await dbConfig.run('INSERT INTO combo_classes (combo_id, course_id) VALUES ($1, $2)', [comboId, courseId]);
    }
}

// Public: active combos whose classes are all active
app.get('/api/combos', asyncHandler(async (req, res) => {
    const rows = await dbConfig.all(`SELECT id FROM combos WHERE is_active = ${dbTrue()} ORDER BY id`);
    const combos = [];
    for (const row of rows) {
        const combo = await loadCombo(row.id);
        const allActive = combo.classes.length >= 2 && combo.classes.every(c => (c.is_active === true || c.is_active === 1) && isRegistrationOpen(c.registration_open));
        if (allActive) combos.push(combo);
    }
    res.json(combos);
}));

app.get('/api/combos/:id', asyncHandler(async (req, res) => {
    const combo = await loadCombo(req.params.id);
    if (!combo || !combo.is_active) return res.status(404).json({ error: 'Combo not found' });
    res.json(combo);
}));

// Admin: every combo, including turned-off ones
app.get('/api/admin/combos', requireAuth, asyncHandler(async (req, res) => {
    const rows = await dbConfig.all('SELECT id FROM combos ORDER BY id DESC');
    const combos = [];
    for (const row of rows) combos.push(await loadCombo(row.id));
    res.json(combos);
}));

app.post('/api/combos', requireAuth, asyncHandler(async (req, res) => {
    const { problems, ids } = comboProblems(req.body || {});
    if (problems.length) return res.status(400).json({ error: problems.join('. ') });
    const { name, description, price } = req.body;
    const result = await dbConfig.run(`
        INSERT INTO combos (name, description, price, is_active) VALUES ($1, $2, $3, ${dbTrue()})
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [String(name).trim(), description || null, Number(price)]);
    const comboId = dbConfig.isProduction ? result[0]?.id : result.lastID;
    await saveComboClasses(comboId, ids);
    res.json(await loadCombo(comboId));
}));

app.put('/api/combos/:id', requireAuth, asyncHandler(async (req, res) => {
    const existing = await loadCombo(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Combo not found' });
    const body = req.body || {};
    // Turning a combo on/off can be sent on its own
    if (Object.keys(body).length === 1 && body.is_active !== undefined) {
        await dbConfig.run('UPDATE combos SET is_active = $1 WHERE id = $2', [dbConfig.isProduction ? !!body.is_active : (body.is_active ? 1 : 0), existing.id]);
        return res.json(await loadCombo(existing.id));
    }
    const { problems, ids } = comboProblems(body);
    if (problems.length) return res.status(400).json({ error: problems.join('. ') });
    const active = body.is_active === undefined ? existing.is_active : !!body.is_active;
    await dbConfig.run('UPDATE combos SET name = $1, description = $2, price = $3, is_active = $4 WHERE id = $5', [
        String(body.name).trim(), body.description || null, Number(body.price),
        dbConfig.isProduction ? active : (active ? 1 : 0), existing.id
    ]);
    await saveComboClasses(existing.id, ids);
    res.json(await loadCombo(existing.id));
}));

app.delete('/api/combos/:id', requireAuth, asyncHandler(async (req, res) => {
    const used = await dbConfig.get('SELECT COUNT(*) AS n FROM registrations WHERE combo_id = $1', [req.params.id]);
    if (Number(used?.n) > 0) {
        return res.status(400).json({ error: 'Students have registered for this combo. Turn it off instead of deleting it.' });
    }
    await dbConfig.run('DELETE FROM combo_classes WHERE combo_id = $1', [req.params.id]);
    await dbConfig.run('DELETE FROM combos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
}));

// Student: register for every class in a combo with one payment
app.post('/api/register-combo', asyncHandler(async (req, res) => {
    const { email, first_name, last_name, instagram_handle, instagram_id, dance_experience, combo_id, special_requests } = req.body || {};
    if (!email || !combo_id) return res.status(400).json({ error: 'Required fields missing: email and combo_id' });

    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    const testerRow = await dbConfig.get('SELECT is_tester FROM students WHERE LOWER(email) = LOWER($1)', [email]);
    const tester = isTrue(testerRow?.is_tester);
    if (!tester && settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }

    const combo = await loadCombo(combo_id);
    if (!combo || !combo.is_active || combo.classes.length < 2) {
        return res.status(400).json({ error: 'This combo is not available' });
    }

    // Find or create the student
    const instagram = instagram_handle || instagram_id || null;
    let student = await dbConfig.get('SELECT * FROM students WHERE email = $1', [email]);
    if (!student && req.body.dry_run) {
        student = { id: null, student_type: 'general' };
    } else if (!student) {
        const result = await dbConfig.run(`
            INSERT INTO students (first_name, last_name, email, instagram_handle, dance_experience)
            VALUES ($1, $2, $3, $4, $5) ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [first_name || 'Student', last_name || '', email, instagram, dance_experience || null]);
        student = { id: dbConfig.isProduction ? result[0]?.id : result.lastID, student_type: 'general' };
    }

    // Every class must be open to this student, not already paid, and have room
    for (const course of combo.classes) {
        if (!(course.is_active === true || course.is_active === 1)) {
            return res.status(400).json({ error: `${course.name} is no longer open` });
        }
        if (!tester && !isRegistrationOpen(course.registration_open)) {
            return res.status(400).json({ error: `Registration for ${course.name} is closed`, registration_closed: true });
        }
        if (!tester && course.required_student_type === 'crew_member' && student.student_type !== 'crew_member') {
            return res.status(403).json({ error: `${course.name} is for crew members only` });
        }
        const paid = await dbConfig.get(
            "SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = 'completed' LIMIT 1",
            [student.id, course.id]
        );
        if (paid) return res.status(400).json({ error: `You are already registered for ${course.name}` });
        if (!tester && course.available_spots - await heldSpots(course.id) <= 0) {
            return res.status(400).json({ error: `${course.name} is full`, course_full: true, course_name: course.name });
        }
    }

    if (req.body.dry_run) {
        return res.json({ success: true, dry_run: true, payment_amount: combo.price, combo_name: combo.name });
    }

    // Replace any earlier unpaid registrations for these classes, so trying again doesn't duplicate
    const placeholders = combo.course_ids.map((_, i) => `$${i + 2}`).join(', ');
    await dbConfig.run(
        `DELETE FROM registrations WHERE student_id = $1 AND payment_status = 'pending' AND course_id IN (${placeholders})`,
        [student.id, ...combo.course_ids]
    );

    // Split the combo price across the classes (last one takes the rounding remainder)
    const n = combo.classes.length;
    const share = Math.floor((combo.price / n) * 100) / 100;
    const group = `combo-${combo.id}-${student.id}-${Date.now()}`;
    const registrationIds = [];
    for (let i = 0; i < n; i++) {
        const amount = i === n - 1 ? Math.round((combo.price - share * (n - 1)) * 100) / 100 : share;
        const result = await dbConfig.run(`
            INSERT INTO registrations (student_id, course_id, payment_amount, payment_status, special_requests, registration_type, combo_id, combo_group, payment_method, is_test)
            VALUES ($1, $2, $3, 'pending', $4, 'combo', $5, $6, $7, $8) ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [student.id, combo.classes[i].id, amount, special_requests || null, combo.id, group, paymentMethodLabel(req.body.payment_method),
            dbConfig.isProduction ? tester : (tester ? 1 : 0)]);
        registrationIds.push(dbConfig.isProduction ? result[0]?.id : result.lastID);
    }

    res.json({
        success: true,
        registrationId: registrationIds[0],
        registrationIds,
        studentId: student.id,
        payment_amount: combo.price,
        combo_name: combo.name
    });
}));

// Registrations that belong together (a combo), or just this one
async function registrationGroupIds(id) {
    const row = await dbConfig.get('SELECT combo_group FROM registrations WHERE id = $1', [id]);
    if (!row || !row.combo_group) return [Number(id)];
    const rows = await dbConfig.all('SELECT id FROM registrations WHERE combo_group = $1 ORDER BY id', [row.combo_group]);
    return rows.map(r => Number(r.id));
}

// Email details for a registration; for a combo, all its classes in one email
async function registrationEmailDetails(id) {
    const ids = await registrationGroupIds(id);
    const regs = [];
    for (const regId of ids) {
        const reg = await dbConfig.get(`
            SELECT r.id, r.payment_amount, r.course_id, r.combo_id,
                   s.email, s.first_name, s.last_name, c.name AS course_name
            FROM registrations r
            JOIN students s ON s.id = r.student_id
            JOIN courses c ON c.id = r.course_id
            WHERE r.id = $1
        `, [regId]);
        if (reg) {
            reg.schedule_info = (await fetchCourseWithSlots(dbConfig, reg.course_id)).schedule_info;
            regs.push(reg);
        }
    }
    if (!regs.length) return null;
    const first = regs[0];
    const details = {
        email: first.email,
        studentName: [first.first_name, first.last_name].filter(Boolean).join(' '),
        registrationId: first.id,
        courseName: first.course_name,
        scheduleInfo: first.schedule_info,
        amount: Number(first.payment_amount)
    };
    if (regs.length > 1) {
        const combo = first.combo_id ? await dbConfig.get('SELECT name FROM combos WHERE id = $1', [first.combo_id]) : null;
        details.courseName = combo ? `${combo.name} (${regs.map(r => r.course_name).join(' + ')})` : regs.map(r => r.course_name).join(' + ');
        details.scheduleInfo = regs.map(r => `${r.course_name}: ${r.schedule_info}`).join(' | ');
        details.amount = Math.round(regs.reduce((sum, r) => sum + Number(r.payment_amount || 0), 0) * 100) / 100;
    }
    return details;
}

app.post('/api/register', asyncHandler(async (req, res) => {
    const {
        first_name, last_name, email, phone, date_of_birth,
        emergency_contact_name, emergency_contact_phone, medical_conditions,
        dance_experience, instagram_handle, instagram_id, how_heard_about_us,
        course_id, special_requests, selected_dates, registration_type
    } = req.body;
    let { payment_amount } = req.body;
    
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
    
    // Test accounts can register even when registration is closed or a class is full
    const testerRow = await dbConfig.get('SELECT is_tester FROM students WHERE LOWER(email) = LOWER($1)', [email]);
    const tester = isTrue(testerRow?.is_tester);
    // Came from a waitlist "spot available" email: the held spot is theirs
    const offer = await validWaitlistOffer(req.body.waitlist_token, course_id, email);

    // Check if registration is open
    const settings = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['registration_open']);
    if (!tester && !offer && settings && settings.setting_value !== 'true') {
        return res.status(400).json({ error: 'Registration is currently closed' });
    }
    
    // Verify course exists and check availability using corrected capacity logic
    const courseCheck = await dbConfig.get(`
        SELECT c.id, c.name, c.course_type, c.registration_open
        FROM courses c
        WHERE c.id = $1 AND c.is_active = ${dbConfig.isProduction ? 'true' : '1'}
    `, [course_id]);

    if (!courseCheck) {
        return res.status(400).json({ error: 'Course not found or inactive' });
    }
    if (!tester && !offer && !isRegistrationOpen(courseCheck.registration_open)) {
        return res.status(400).json({ error: `Registration for ${courseCheck.name} is closed`, registration_closed: true });
    }

    // Use the corrected availability helper
    const availability = await getCourseAvailability(dbConfig, course_id);

    console.log('🔎 Capacity check (corrected logic)', {
        courseId: course_id,
        capacity: availability.capacity,
        registered: availability.registeredCount,
        available: availability.available
    });
    
    if (availability.capacity === 0) {
        return res.status(400).json({ error: 'Course has no available slots configured' });
    }
    
    // Spots held for waitlisted students who were offered one don't count as free
    if (!tester && !offer && availability.available - await heldSpots(course_id) <= 0) {
        return res.status(400).json({ 
            error: 'Course is full',
            course_full: true,
            course_name: courseCheck.name
        });
    }
    
    // Picking individual dates: they must be dates of this class, and the
    // amount is worked out here (dates x per-date fee), not trusted from the browser.
    let pickedDates = null;
    if (selected_dates !== undefined && selected_dates !== null) {
        pickedDates = normalizeSessionDates(selected_dates);
        const courseRow = await dbConfig.get('SELECT session_dates FROM courses WHERE id = $1', [course_id]);
        const classDates = normalizeSessionDates(courseRow?.session_dates);
        if (pickedDates.length === 0) {
            return res.status(400).json({ error: 'Please pick at least one date' });
        }
        if (classDates.length && pickedDates.some(d => !classDates.includes(d))) {
            return res.status(400).json({ error: 'One or more picked dates are not part of this class' });
        }
        const priceRow = await dbConfig.get(`
            SELECT cp.price FROM course_pricing cp
            JOIN course_slots cs ON cp.course_slot_id = cs.id
            WHERE cs.course_id = $1 AND cp.pricing_type = 'drop_in'
            ORDER BY cs.id LIMIT 1
        `, [course_id]);
        const perDate = Number(priceRow?.price);
        if (!perDate) {
            return res.status(400).json({ error: 'This class does not offer individual dates' });
        }
        payment_amount = perDate * pickedDates.length;
    }
    const pickedDatesJson = pickedDates ? JSON.stringify(pickedDates) : null;

    // Check only (dry run): the checkout page asks before showing payment details,
    // and saves the registration when the student taps "I've sent the payment".
    if (req.body.dry_run) {
        const known = await dbConfig.get('SELECT id FROM students WHERE email = $1', [email]);
        if (known) {
            const paid = await dbConfig.get(
                "SELECT id FROM registrations WHERE student_id = $1 AND course_id = $2 AND payment_status = 'completed' LIMIT 1",
                [known.id, course_id]
            );
            if (paid) return res.status(400).json({ error: 'You are already registered and paid for this course' });
        }
        return res.json({ success: true, dry_run: true, payment_amount: Number(payment_amount) });
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
        // Same student, same class, not paid yet: update their choice instead of duplicating
        await dbConfig.run(
            'UPDATE registrations SET payment_amount = $1, selected_dates = $2, registration_type = $3, payment_method = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5',
            [payment_amount, pickedDatesJson, registration_type || null, paymentMethodLabel(req.body.payment_method), existingPending.id]
        );
        console.log('ℹ️ Updated existing pending registration', { id: existingPending.id, student_id: student.id, course_id });
        if (offer) await dbConfig.run("UPDATE waitlist SET status = 'registered', registration_id = $1, payment_link_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [existingPending.id, offer.id]);
        return res.json({ 
            success: true, 
            registrationId: existingPending.id, 
            studentId: student.id,
            payment_amount: Number(payment_amount),
            deduped: true
        });
    }

    // Create registration
    const registrationResult = await dbConfig.run(`
        INSERT INTO registrations (
            student_id, course_id, payment_amount, payment_status, special_requests,
            registration_type, selected_dates, payment_method, is_test
        ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
        ${dbConfig.isProduction ? 'RETURNING id' : ''}
    `, [student.id, course_id, payment_amount, special_requests, registration_type || null, pickedDatesJson, paymentMethodLabel(req.body.payment_method),
        dbConfig.isProduction ? tester : (tester ? 1 : 0)]);
    
    // Handle different return formats for SQLite vs PostgreSQL
    let registrationId;
    if (dbConfig.isProduction) {
        // PostgreSQL with RETURNING returns an array of rows
        registrationId = registrationResult[0]?.id;
    } else {
        // SQLite returns { lastID: ... }
        registrationId = registrationResult.lastID;
    }
    if (offer) await dbConfig.run("UPDATE waitlist SET status = 'registered', registration_id = $1, payment_link_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [registrationId, offer.id]);
    
    console.log('📝 Registration created', { id: registrationId, course_id, email });
    res.json({ 
        success: true, 
        registrationId: registrationId,
        studentId: student.id,
        payment_amount: Number(payment_amount)
    });
}));

// Get registrations
app.get('/api/registrations', requireAuth, asyncHandler(async (req, res) => {
    const { course_id, payment_status } = req.query;
    
    let query = `
        SELECT r.*, s.id AS student_id, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
               c.name as course_name, c.course_type, c.price, cb.name AS combo_name
        FROM registrations r
        LEFT JOIN students s ON r.student_id = s.id
        LEFT JOIN courses c ON r.course_id = c.id
        LEFT JOIN combos cb ON r.combo_id = cb.id
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
    
    if (req.teamEmail) conditions.push(NOT_TEST);
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
app.get('/api/admin/registrations/export', requireAdminOrTeam, asyncHandler(async (req, res) => {
    try {
        const { course_id, payment_status } = req.query;

        let query = `
            SELECT r.*, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS student_instagram_handle,
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
        if (req.teamEmail) conditions.push(NOT_TEST);
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
            
            // Robust Instagram handle extraction with fallback chain
            const instagram = (r.student_instagram_handle || r.instagram_id || r.instagram_handle || '').replace(/^@/, '');
            
            const line = [
                esc(`#${r.id}`),
                esc(name),
                esc(r.email || ''),
                esc(r.phone || ''),
                esc(instagram),
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
        const classSlug = course_id && rows[0]?.course_name ? String(rows[0].course_name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' : '';
        const filename = `registrations-${classSlug}${new Date().toISOString().slice(0,10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        console.error('❌ CSV export failed:', err);
        res.status(500).json({ error: 'Failed to export registrations' });
    }
}));

// Alias endpoint for admin to fetch registrations (same behavior as /api/registrations)
app.get('/api/admin/registrations', requireAdminOrTeam, asyncHandler(async (req, res) => {
    const { course_id, payment_status } = req.query;
    
    let query = `
        SELECT r.*, s.id AS student_id, s.first_name, s.last_name, s.email, s.phone, s.dance_experience, s.instagram_handle AS instagram_id,
               c.name as course_name, c.course_type, c.price, cb.name AS combo_name
        FROM registrations r
        LEFT JOIN students s ON r.student_id = s.id
        LEFT JOIN courses c ON r.course_id = c.id
        LEFT JOIN combos cb ON r.combo_id = cb.id
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
 * Attendance APIs
 */


/**
 * Attendance APIs
 */


// Update registration payment status (restored)
app.put('/api/registrations/:id/payment', requireAuth, asyncHandler(async (req, res) => {
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
app.put('/api/admin/registrations/:id/confirm-payment', requireAdminOrTeam, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { venmo_transaction_note } = req.body;

    // 1) Mark paid (for a combo: every class in it)
    const groupIds = await registrationGroupIds(id);
    for (const regId of groupIds) {
        await dbConfig.run(`
            UPDATE registrations SET
                payment_status = 'completed',
                payment_method = COALESCE(payment_method, 'Venmo'),
                paypal_transaction_id = $1,
                handled_by = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [venmo_transaction_note || `Payment confirmed by ${handledBy(req)}`, regId, handledBy(req)]);
    }

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

        // Student, class and amount for the email (a combo lists all its classes)
        const details = await registrationEmailDetails(id);
        if (!details) {
            return res.json({ success: true, message: 'Payment confirmed successfully (registration not found for email)', email_sent: false });
        }

        // Send confirmation email via Gmail SMTP
        sendRegistrationConfirmationEmail(details.email, details).then(() => {
            console.log('✉️  Sent confirmation email to:', details.email);
        }).catch(err => {
            console.error('❌ Error sending confirmation email:', err.message, err.stack);
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

        // Student, class and amount for the email (a combo lists all its classes)
        const details = await registrationEmailDetails(id);
        if (!details) {
            return res.status(404).json({ error: 'Registration not found' });
        }

        sendRegistrationConfirmationEmail(details.email, details).then(() => {
            console.log('✉️  Resent confirmation email to:', details.email);
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
 * Admin: Cancel a registration (frees capacity; sends cancellation email if enabled)
 * PUT /api/admin/registrations/:id/cancel
 * Body: { reason?: string }
 */
app.put('/api/admin/registrations/:id/cancel', requireAdminOrTeam, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    try {
        // Update registration as canceled with audit fields
        // For a combo, cancel every class in it
        const groupIds = await registrationGroupIds(id);
        // Classes where a paid spot is being freed (those get offered to the waitlist)
        const freedCourses = [];
        for (const regId of groupIds) {
            const before = await dbConfig.get('SELECT course_id, payment_status FROM registrations WHERE id = $1', [regId]);
            if (before && before.payment_status === 'completed' && before.course_id) freedCourses.push(before.course_id);
        }
        for (const regId of groupIds) {
            await dbConfig.run(`
                UPDATE registrations SET
                    payment_status = 'canceled',
                    canceled_at = CURRENT_TIMESTAMP,
                    canceled_by = $1,
                    cancellation_reason = $2,
                    handled_by = $4,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [req.session.adminId || null, reason || null, regId, handledBy(req)]);
        }

        // Email notifications (optional)
        let email_sent = false, email_skipped = false, email_error = null;

        try {
            const setting = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', ['email_notifications_enabled']);
            const emailEnabled = setting && setting.setting_value === 'true';

            if (!emailEnabled) {
                email_skipped = true;
            } else {
                const details = await registrationEmailDetails(id);
                if (details && details.email) {
                    const { sendRegistrationCancellationEmail } = require('./utils/mailer');
                    await sendRegistrationCancellationEmail(details.email, { ...details, cancellationReason: reason || '' });
                    email_sent = true;
                }
            }
        } catch (err) {
            email_error = err.message || String(err);
            console.error('❌ Error sending cancellation email:', err);
        }

        // A spot opened: email the next person on each class's waitlist, in order
        const waitlist_offers = [];
        for (const courseId of [...new Set(freedCourses)]) {
            try { waitlist_offers.push(...await offerOpenSpots(courseId, req)); } catch (e) { console.error('waitlist offer failed:', e.message || e); }
        }
        res.json({ success: true, email_sent, email_skipped, email_error, waitlist_offers: waitlist_offers.map(o => ({ email: o.email, expires_at: o.expires_at, registration_url: o.registration_url })) });
    } catch (err) {
        console.error('❌ Cancel registration failed:', err);
        res.status(500).json({ error: 'Failed to cancel registration' });
    }
}));

/**
 * Admin: Uncancel a registration (restores to pending; returns capacity info)
 * PUT /api/admin/registrations/:id/uncancel
 */
app.put('/api/admin/registrations/:id/uncancel', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        // Restore registration to pending and clear cancellation audit fields
        const groupIds = await registrationGroupIds(id);
        for (const regId of groupIds) {
            await dbConfig.run(`
                UPDATE registrations SET
                    payment_status = 'pending',
                    canceled_at = NULL,
                    canceled_by = NULL,
                    cancellation_reason = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [regId]);
        }

        // Capacity information (for UI hints)
        const row = await dbConfig.get('SELECT course_id FROM registrations WHERE id = $1', [id]);
        let capacity_available = true;
        if (row && row.course_id) {
            const stats = await dbConfig.get(`
                SELECT
                  (SELECT COALESCE(SUM(cs.capacity), 0) FROM course_slots cs WHERE cs.course_id = c.id) AS total_capacity,
                  (SELECT COUNT(*) FROM registrations r WHERE r.course_id = c.id AND r.payment_status = 'completed') AS completed_count
                FROM courses c
                WHERE c.id = $1
            `, [row.course_id]);
            const totalCap = Number(stats?.total_capacity || 0);
            const completedCount = Number(stats?.completed_count || 0);
            capacity_available = completedCount < totalCap;
        }

        res.json({ success: true, capacity_available });
    } catch (err) {
        console.error('❌ Uncancel registration failed:', err);
        res.status(500).json({ error: 'Failed to uncancel registration' });
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
// Admin: which email method is set up (shown in Settings)
app.get('/api/admin/email-status', requireAuth, (req, res) => {
    res.json({ method: emailMethod(), from: process.env.GMAIL_USER || process.env.EMAIL_USER || null });
});

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
 * Admin: Send a test email to verify SendGrid is working
 * POST /api/admin/send-test-email
 * Body: { to: "email@example.com" }
 */
app.post('/api/admin/send-test-email', requireAuth, asyncHandler(async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

    try {
        // A test always sends, even if confirmation emails are switched off in Settings
        if (!(process.env.GMAIL_USER || process.env.EMAIL_USER)) {
            return res.json({ success: false, method: emailMethod(), error: 'GMAIL_USER is not set in Railway' });
        }

        // Try to send a real test email
        await sendRegistrationConfirmationEmail(to, {
            courseName: 'TEST - Email Verification',
            scheduleInfo: 'This is a test email from your admin dashboard',
            amount: '0.00',
            registrationId: 'TEST',
            studentName: 'Admin Test'
        });

        console.log('✅ Test email sent successfully to:', to);
        res.json({ success: true, method: emailMethod(), message: `Test email sent to ${to} using ${emailMethod()}. Check the inbox and spam folder.` });
    } catch (error) {
        console.error('❌ Test email failed:', error);
        // Return the full error details for diagnosis
        res.json({
            success: false,
            method: emailMethod(),
            error: error.message || String(error),
            code: error.code,
            statusCode: error.statusCode,
            response: error.response?.body ? JSON.stringify(error.response.body) : undefined
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
 * Admin: Fix course access control
 * POST /api/admin/fix-course-access
 */
app.post('/api/admin/fix-course-access', requireAuth, asyncHandler(async (req, res) => {
    try {
        // Update ALL crew_practice courses to be crew-member only
        const crewPracticeResult = await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'crew_member' 
            WHERE course_type = 'crew_practice'
        `);
        
        // Ensure drop-in and multi-week courses are available to all
        const generalCoursesResult = await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'any' 
            WHERE course_type IN ('drop_in', 'multi-week')
        `);
        
        // Verify the changes
        const courses = await dbConfig.all('SELECT id, name, course_type, required_student_type FROM courses WHERE is_active = true ORDER BY id');
        
        console.log('🔧 Course access control updated by admin:', req.session.adminUsername);
        
        res.json({
            success: true,
            message: 'Course access control updated successfully',
            courses: courses.map(c => ({
                id: c.id,
                name: c.name,
                course_type: c.course_type,
                access: c.required_student_type === 'any' ? 'ALL USERS' : 'CREW MEMBERS ONLY'
            }))
        });
    } catch (err) {
        console.error('❌ Fix course access error:', err);
        res.status(500).json({ error: 'Failed to fix course access control' });
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
            LEFT JOIN registrations r ON cs.course_id = r.course_id AND r.payment_status = 'completed' AND ${NOT_TEST}
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

// Payment details shown at checkout. The registration is saved later, when
// the student taps "I've sent the payment", so the note names the class and
// student instead of a registration number.
async function paymentNote({ registrationId, courseId, courseName, studentName }) {
    let id = courseId;
    if (!id && registrationId) {
        const reg = await dbConfig.get('SELECT course_id FROM registrations WHERE id = $1', [registrationId]);
        id = reg?.course_id;
    }
    let name = courseName || '';
    let when = '';
    if (id) {
        const course = await dbConfig.get('SELECT name, session_dates, start_date, end_date FROM courses WHERE id = $1', [id]);
        if (course) {
            name = course.name || name;
            const dates = normalizeSessionDates(course.session_dates);
            const first = dates[0] || course.start_date;
            const last = dates[dates.length - 1] || course.end_date;
            if (first) when = last && String(last).slice(0, 10) !== String(first).slice(0, 10)
                ? ` (${formatLocalDateShort(first)} - ${formatLocalDateShort(last)})`
                : ` (${formatLocalDateShort(first)})`;
        }
    }
    return [`${name}${when}`.trim(), studentName].filter(Boolean).join(' - ') || 'GouMo dance class';
}

async function settingValue(key, fallback) {
    const row = await dbConfig.get('SELECT setting_value FROM system_settings WHERE setting_key = $1', [key]);
    return row && row.setting_value ? row.setting_value : fallback;
}

app.post('/api/generate-venmo-link', asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Amount is required' });
    const venmoUsername = await settingValue('venmo_username', 'monicaradd');
    const note = await paymentNote(req.body);
    res.json({
        success: true,
        venmoLink: `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(venmoUsername)}&amount=${amount}&note=${encodeURIComponent(note)}`,
        webLink: `https://venmo.com/${encodeURIComponent(venmoUsername)}?txn=pay&amount=${amount}&note=${encodeURIComponent(note)}`,
        paymentNote: note,
        venmoUsername
    });
}));

app.post('/api/generate-zelle-payment', asyncHandler(async (req, res) => {
    const { amount } = req.body || {};
    if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Amount is required' });
    res.json({
        success: true,
        zelleRecipientName: await settingValue('zelle_recipient_name', 'Monica Radhakrishnan'),
        zellePhone: await settingValue('zelle_phone', '4252159818'),
        paymentNote: await paymentNote(req.body),
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
    db = await initializeDatabase(dbConfig);
    
    // Warmup: run a simple query to ensure Pool connections are hot
    if (dbConfig.isProduction) {
        try {
            await dbConfig.query('SELECT 1 AS warmup');
            console.log('✅ Database pool warmed up');
        } catch (e) {
            console.warn('⚠️ Database warmup query failed:', e.message);
        }
    }
    
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
