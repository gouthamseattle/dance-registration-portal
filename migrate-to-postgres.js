const { Client } = require('pg');
const path = require('path');

async function migrateToPostgres() {
    console.log('🚀 Starting database migration to PostgreSQL...');
    
    // Connect to PostgreSQL
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });
    
    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // Create tables in PostgreSQL
        await createTables(client);
        
        // Migrate data if SQLite database exists
        await migrateData(client);
        
        console.log('🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await client.end();
    }
}

async function createTables(client) {
    console.log('📋 Creating PostgreSQL tables...');
    
    const tables = [
        // Admin users table
        `CREATE TABLE IF NOT EXISTS admin_users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE
        )`,
        
        // Courses table (without session_id - sessions removed)
        `CREATE TABLE IF NOT EXISTS courses (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            course_type VARCHAR(50) DEFAULT 'multi-week',
            duration_weeks INTEGER DEFAULT 1,
            level VARCHAR(100) DEFAULT 'All Levels',
            capacity INTEGER NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            start_date DATE,
            end_date DATE,
            day_of_week VARCHAR(20),
            start_time TIME,
            end_time TIME,
            location VARCHAR(255),
            instructor VARCHAR(255),
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Students table
        `CREATE TABLE IF NOT EXISTS students (
            id SERIAL PRIMARY KEY,
            first_name VARCHAR(255) NOT NULL,
            last_name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            phone VARCHAR(20),
            date_of_birth DATE,
            emergency_contact_name VARCHAR(255),
            emergency_contact_phone VARCHAR(20),
            medical_conditions TEXT,
            dance_experience VARCHAR(50),
            instagram_handle VARCHAR(100),
            how_heard_about_us VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Registrations table
        `CREATE TABLE IF NOT EXISTS registrations (
            id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES students(id),
            course_id INTEGER REFERENCES courses(id),
            registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            payment_status VARCHAR(20) DEFAULT 'pending',
            payment_amount DECIMAL(10,2),
            payment_method VARCHAR(50),
            paypal_transaction_id VARCHAR(255),
            special_requests TEXT,
            waiver_signed BOOLEAN DEFAULT FALSE,
            waiver_signed_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // System settings table
        `CREATE TABLE IF NOT EXISTS system_settings (
            id SERIAL PRIMARY KEY,
            setting_key VARCHAR(255) UNIQUE NOT NULL,
            setting_value TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Email templates table
        `CREATE TABLE IF NOT EXISTS email_templates (
            id SERIAL PRIMARY KEY,
            template_name VARCHAR(255) UNIQUE NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body TEXT NOT NULL,
            variables TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];
    
    for (const table of tables) {
        await client.query(table);
    }

    // Align schema for slot-based architecture
    // 1) Relax NOT NULL constraints on legacy generic fields so inserts without them succeed
    await client.query(`ALTER TABLE courses ALTER COLUMN capacity DROP NOT NULL`).catch(() => {});
    await client.query(`ALTER TABLE courses ALTER COLUMN price DROP NOT NULL`).catch(() => {});
    // 2) Add new optional metadata fields used by slot-based UI
    await client.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS schedule_info TEXT`);
    await client.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS prerequisites TEXT`);
    // 3) Create slot/pricing tables (idempotent)
    await client.query(`
        CREATE TABLE IF NOT EXISTS course_slots (
            id SERIAL PRIMARY KEY,
            course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
            slot_name VARCHAR(255),
            difficulty_level VARCHAR(100) NOT NULL,
            capacity INTEGER NOT NULL,
            day_of_week VARCHAR(20),
            start_time TIME,
            end_time TIME,
            location VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS course_pricing (
            id SERIAL PRIMARY KEY,
            course_slot_id INTEGER REFERENCES course_slots(id) ON DELETE CASCADE,
            pricing_type VARCHAR(50) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('✅ PostgreSQL tables created (including slot-based schema)');
}

async function migrateData(client) {
    console.log('📦 Migrating data from SQLite...');
    
    const sqlitePath = path.join(__dirname, 'database', 'registrations.db');
    
    // Check if SQLite database exists
    const fs = require('fs');
    if (!fs.existsSync(sqlitePath)) {
        console.log('ℹ️  No SQLite database found, skipping data migration');
        await insertDefaultData(client);
        return;
    }
    
    const sqlite3 = require('sqlite3').verbose();
    const db = new sqlite3.Database(sqlitePath);
    
    try {
        // Migrate admin users
        await migrateTable(db, client, 'admin_users', [
            'username', 'password_hash', 'email', 'created_at', 'last_login', 'is_active'
        ]);
        
        // Migrate students
        await migrateTable(db, client, 'students', [
            'first_name', 'last_name', 'email', 'phone', 'date_of_birth',
            'emergency_contact_name', 'emergency_contact_phone', 'medical_conditions',
            'dance_experience', 'instagram_handle', 'how_heard_about_us', 'created_at', 'updated_at'
        ]);
        
        // Migrate courses (excluding session_id)
        await migrateTable(db, client, 'courses', [
            'name', 'description', 'course_type', 'duration_weeks', 'level',
            'capacity', 'price', 'start_date', 'end_date', 'day_of_week',
            'start_time', 'end_time', 'location', 'instructor', 'is_active',
            'created_at', 'updated_at'
        ]);
        
        // Migrate registrations
        await migrateTable(db, client, 'registrations', [
            'student_id', 'course_id', 'registration_date', 'payment_status',
            'payment_amount', 'payment_method', 'paypal_transaction_id',
            'special_requests', 'waiver_signed', 'waiver_signed_date',
            'created_at', 'updated_at'
        ]);
        
        // Migrate system settings
        await migrateTable(db, client, 'system_settings', [
            'setting_key', 'setting_value', 'description', 'created_at', 'updated_at'
        ]);
        
        // Migrate email templates
        await migrateTable(db, client, 'email_templates', [
            'template_name', 'subject', 'body', 'variables', 'is_active',
            'created_at', 'updated_at'
        ]);
        
        console.log('✅ Data migration completed');
        
    } finally {
        db.close();
    }
}

async function migrateTable(sqliteDb, pgClient, tableName, columns) {
    return new Promise((resolve, reject) => {
        const columnList = columns.join(', ');
        sqliteDb.all(`SELECT ${columnList} FROM ${tableName}`, async (err, rows) => {
            if (err) {
                console.log(`ℹ️  Table ${tableName} not found in SQLite, skipping`);
                resolve();
                return;
            }
            
            if (rows.length === 0) {
                console.log(`ℹ️  No data in ${tableName} table`);
                resolve();
                return;
            }
            
            try {
                for (const row of rows) {
                    const values = columns.map(col => row[col]);
                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                    await pgClient.query(sql, values);
                }
                console.log(`✅ Migrated ${rows.length} rows from ${tableName}`);
                resolve();
            } catch (error) {
                console.error(`❌ Error migrating ${tableName}:`, error);
                reject(error);
            }
        });
    });
}

async function insertDefaultData(client) {
    console.log('📝 Inserting default data...');
    
    // Insert default admin user (force update to fix login issue)
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await client.query(`
        INSERT INTO admin_users (username, password_hash, email, is_active) 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT (username) DO UPDATE SET 
            password_hash = $2,
            email = $3,
            is_active = $4
    `, ['admin', hashedPassword, 'admin@dancestudio.com', true]);
    
    console.log('✅ Admin user created/updated with fresh password hash');
    
    // Insert default system settings
    const defaultSettings = [
        ['registration_open', 'true', 'Whether registration is currently open'],
        ['app_name', 'Dance Registration Portal', 'Application name'],
        ['currency', 'USD', 'Currency for payments'],
        ['max_registrations_per_student', '5', 'Maximum registrations per student'],
        ['allow_same_day_dropins', 'true', 'Allow same-day drop-in registrations'],
        ['email_notifications_enabled', 'false', 'Enable email notifications'],
        ['paypal_client_id', 'sb', 'PayPal Client ID for payment processing']
    ];
    
    for (const [key, value, description] of defaultSettings) {
        await client.query(`
            INSERT INTO system_settings (setting_key, setting_value, description) 
            VALUES ($1, $2, $3) 
            ON CONFLICT (setting_key) DO NOTHING
        `, [key, value, description]);
    }
    
    // Insert default email templates
    const emailTemplates = [
        ['registration_confirmation', 'Registration Confirmation', 'Thank you for registering for {{course_name}}!', '{"course_name", "student_name", "start_date"}'],
        ['payment_confirmation', 'Payment Confirmation', 'Your payment for {{course_name}} has been confirmed.', '{"course_name", "amount", "transaction_id"}'],
        ['course_reminder', 'Class Reminder', 'Reminder: Your class {{course_name}} starts tomorrow!', '{"course_name", "start_time", "location"}']
    ];
    
    for (const [name, subject, body, variables] of emailTemplates) {
        await client.query(`
            INSERT INTO email_templates (template_name, subject, body, variables, is_active) 
            VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (template_name) DO NOTHING
        `, [name, subject, body, variables, true]);
    }
    
    // Insert sample courses
    const sampleCourses = [
        ['Crew Practice', 'Weekly crew practice sessions for all skill levels', 'multi-week', 8, 'All Levels', 20, 150.00, '2024-09-15', '2024-11-10', 'Sunday', '14:00', '16:00', 'Main Studio', 'Dance Instructor', true],
        ['SDS Workshop', 'Special dance style workshop focusing on technique and performance', 'workshop', 1, 'Intermediate', 15, 75.00, '2024-09-22', '2024-09-22', 'Saturday', '10:00', '13:00', 'Studio B', 'Guest Instructor', true]
    ];
    
    for (const [name, description, course_type, duration_weeks, level, capacity, price, start_date, end_date, day_of_week, start_time, end_time, location, instructor, is_active] of sampleCourses) {
        try {
            await client.query(`
                INSERT INTO courses (name, description, course_type, duration_weeks, level, capacity, price, start_date, end_date, day_of_week, start_time, end_time, location, instructor, is_active) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) 
                ON CONFLICT (name) DO NOTHING
            `, [name, description, course_type, duration_weeks, level, capacity, price, start_date, end_date, day_of_week, start_time, end_time, location, instructor, is_active]);
        } catch (error) {
            console.log(`ℹ️  Course ${name} already exists or conflict occurred, skipping`);
        }
    }
    
    console.log('✅ Default data inserted');
}

// Run migration if called directly
if (require.main === module) {
    migrateToPostgres().catch(console.error);
}

module.exports = { migrateToPostgres };
