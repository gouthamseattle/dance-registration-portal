const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DatabaseConfig = require('../database-config');

async function syncLocalSchema() {
    console.log('🔄 Syncing local SQLite schema with production PostgreSQL schema...');
    
    const dbConfig = new DatabaseConfig();
    
    try {
        const db = await dbConfig.connect();
        console.log('✅ Connected to local SQLite database');
        
        // Add missing columns to courses table
        await addMissingCourseColumns(dbConfig);
        
        // Create missing tables (course_slots, course_pricing, attendance tables)
        await createMissingTables(dbConfig);
        
        // Add student profile columns
        await addStudentProfileColumns(dbConfig);
        
        // Add system settings if missing
        await ensureSystemSettings(dbConfig);
        
        console.log('🎉 Local schema sync completed successfully!');
        
    } catch (error) {
        console.error('❌ Schema sync failed:', error);
        throw error;
    } finally {
        if (dbConfig) {
            await dbConfig.close();
        }
    }
}

async function addMissingCourseColumns(dbConfig) {
    console.log('📋 Adding missing columns to courses table...');
    
    const missingColumns = [
        'ALTER TABLE courses ADD COLUMN price DECIMAL(10,2)',
        'ALTER TABLE courses ADD COLUMN start_date TEXT',
        'ALTER TABLE courses ADD COLUMN end_date TEXT', 
        'ALTER TABLE courses ADD COLUMN instructor TEXT',
        'ALTER TABLE courses ADD COLUMN day_of_week TEXT',
        'ALTER TABLE courses ADD COLUMN start_time TEXT',
        'ALTER TABLE courses ADD COLUMN end_time TEXT',
        'ALTER TABLE courses ADD COLUMN location TEXT'
    ];
    
    for (const column of missingColumns) {
        try {
            await dbConfig.run(column);
            console.log(`  ✅ Added: ${column.split('ADD COLUMN')[1]}`);
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log(`  ℹ️  Column already exists: ${column.split('ADD COLUMN')[1]}`);
            } else {
                console.error(`  ❌ Failed to add column: ${e.message}`);
            }
        }
    }
}

async function createMissingTables(dbConfig) {
    console.log('🏗️  Creating missing tables...');
    
    // Course slots table
    try {
        await dbConfig.run(`
            CREATE TABLE IF NOT EXISTS course_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                slot_name TEXT,
                difficulty_level TEXT NOT NULL,
                capacity INTEGER NOT NULL,
                day_of_week TEXT,
                practice_date TEXT,
                start_time TEXT,
                end_time TEXT,
                location TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
            )
        `);
        console.log('  ✅ Created course_slots table');
    } catch (e) {
        console.log('  ℹ️  course_slots table already exists');
    }
    
    // Course pricing table
    try {
        await dbConfig.run(`
            CREATE TABLE IF NOT EXISTS course_pricing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_slot_id INTEGER NOT NULL,
                pricing_type TEXT NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_slot_id) REFERENCES course_slots(id) ON DELETE CASCADE
            )
        `);
        console.log('  ✅ Created course_pricing table');
    } catch (e) {
        console.log('  ℹ️  course_pricing table already exists');
    }
    
    // Class sessions table
    try {
        await dbConfig.run(`
            CREATE TABLE IF NOT EXISTS class_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                session_date TEXT NOT NULL,
                start_time TEXT,
                end_time TEXT,
                location TEXT,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id)
            )
        `);
        console.log('  ✅ Created class_sessions table');
    } catch (e) {
        console.log('  ℹ️  class_sessions table already exists');
    }
    
    // Attendance records table
    try {
        await dbConfig.run(`
            CREATE TABLE IF NOT EXISTS attendance_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                status TEXT NOT NULL,
                marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                marked_by INTEGER,
                FOREIGN KEY (session_id) REFERENCES class_sessions(id),
                FOREIGN KEY (student_id) REFERENCES students(id),
                UNIQUE(session_id, student_id)
            )
        `);
        console.log('  ✅ Created attendance_records table');
    } catch (e) {
        console.log('  ℹ️  attendance_records table already exists');
    }
    
    // System settings table
    try {
        await dbConfig.run(`
            CREATE TABLE IF NOT EXISTS system_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('  ✅ Created system_settings table');
    } catch (e) {
        console.log('  ℹ️  system_settings table already exists');
    }
}

async function addStudentProfileColumns(dbConfig) {
    console.log('👤 Adding student profile columns...');
    
    const studentColumns = [
        'ALTER TABLE students ADD COLUMN student_type TEXT DEFAULT \'general\'',
        'ALTER TABLE students ADD COLUMN profile_complete INTEGER DEFAULT 0',
        'ALTER TABLE students ADD COLUMN admin_classified INTEGER DEFAULT 0',
        'ALTER TABLE students ADD COLUMN instagram_handle TEXT'
    ];
    
    for (const column of studentColumns) {
        try {
            await dbConfig.run(column);
            console.log(`  ✅ Added: ${column.split('ADD COLUMN')[1]}`);
        } catch (e) {
            if (e.message.includes('duplicate column name')) {
                console.log(`  ℹ️  Column already exists: ${column.split('ADD COLUMN')[1]}`);
            } else {
                console.error(`  ❌ Failed to add column: ${e.message}`);
            }
        }
    }
    
    // Add course access control column
    try {
        await dbConfig.run('ALTER TABLE courses ADD COLUMN required_student_type TEXT DEFAULT \'any\'');
        console.log('  ✅ Added: required_student_type to courses');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('  ℹ️  Column already exists: required_student_type');
        } else {
            console.error(`  ❌ Failed to add column: ${e.message}`);
        }
    }
    
    // Add payment method column to registrations
    try {
        await dbConfig.run('ALTER TABLE registrations ADD COLUMN payment_method TEXT');
        console.log('  ✅ Added: payment_method to registrations');
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log('  ℹ️  Column already exists: payment_method');
        } else {
            console.error(`  ❌ Failed to add column: ${e.message}`);
        }
    }
}

async function ensureSystemSettings(dbConfig) {
    console.log('⚙️  Ensuring default system settings...');
    
    const defaultSettings = [
        ['registration_open', 'true', 'Whether registration is currently open'],
        ['app_name', 'Dance Registration Portal', 'Application name'],
        ['currency', 'USD', 'Currency for payments'],
        ['max_registrations_per_student', '5', 'Maximum registrations per student'],
        ['allow_same_day_dropins', 'true', 'Allow same-day drop-in registrations'],
        ['email_notifications_enabled', 'false', 'Enable email notifications'],
        ['venmo_username', 'monicaradd', 'Default Venmo username'],
        ['zelle_recipient_name', 'Monica Radhakrishnan', 'Default Zelle recipient name'],
        ['zelle_phone', '4252159818', 'Default Zelle phone number']
    ];
    
    for (const [key, value, description] of defaultSettings) {
        try {
            const existing = await dbConfig.get('SELECT id FROM system_settings WHERE setting_key = ?', [key]);
            if (!existing) {
                await dbConfig.run(
                    'INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)',
                    [key, value, description]
                );
                console.log(`  ✅ Added setting: ${key} = ${value}`);
            } else {
                console.log(`  ℹ️  Setting already exists: ${key}`);
            }
        } catch (e) {
            console.error(`  ❌ Failed to add setting ${key}: ${e.message}`);
        }
    }
}

// Run sync if called directly
if (require.main === module) {
    syncLocalSchema().catch(console.error);
}

module.exports = { syncLocalSchema };
