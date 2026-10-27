/**
 * Database Initialization and Schema Management
 */

const DatabaseConfig = require('../database-config');

/**
 * Initialize database connection and ensure schema is up to date
 * @param {DatabaseConfig} dbConfig - Database configuration instance
 * @returns {Promise<object>} - Connected database instance
 */
async function initializeDatabase(dbConfig) {
    const maxRetries = 5;
    const retryDelay = 3000; // 3 seconds between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const db = await dbConfig.connect();
            console.log(`✅ Database initialized successfully (attempt ${attempt}/${maxRetries})`);

            // Postgres: create base tables first (idempotent), so the column/table
            // updates in ensureSchema work on a brand-new database (staging, CI).
            if (dbConfig.isProduction) {
                try {
                    const { migrateToPostgres } = require('../scripts/migrate-to-postgres');
                    await migrateToPostgres();
                } catch (err) {
                    console.error('❌ Base table setup failed (continuing):', err.message);
                }
            }

            // Ensure all schema updates are applied
            await ensureSchema(dbConfig);
            
            return db;
        } catch (error) {
            console.error(`❌ Database initialization attempt ${attempt}/${maxRetries} failed:`, error.message);
            if (attempt < maxRetries) {
                console.log(`🔄 Retrying in ${retryDelay / 1000}s...`);
                await new Promise(r => setTimeout(r, retryDelay));
            } else {
                console.error('❌ All database connection attempts failed. Exiting.');
                process.exit(1);
            }
        }
    }
}

/**
 * Ensure all database schema updates are applied
 * @param {DatabaseConfig} dbConfig - Database configuration instance
 */
async function ensureSchema(dbConfig) {
    try {
        // Ensure practice_date column exists on course_slots
        await ensurePracticeDateColumn(dbConfig);
        
        // Ensure waitlist table exists
        await ensureWaitlistTable(dbConfig);
        
        // Ensure payment_method column exists on registrations
        await ensurePaymentMethodColumn(dbConfig);
        
        // Ensure cancellation audit columns exist on registrations
        await ensureCancellationColumns(dbConfig);
        
        // Ensure waitlist-related columns exist on registrations
        await ensureWaitlistRegistrationColumns(dbConfig);
        
        // Ensure choreography columns exist on courses
        await ensureChoreographyColumns(dbConfig);
        
        // Ensure student profile and access control columns exist
        await ensureStudentProfileColumns(dbConfig);
        
        console.log('✅ Schema updates completed');
    } catch (error) {
        console.error('❌ Schema update failed:', error);
        throw error;
    }
}

async function ensurePracticeDateColumn(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE course_slots ADD COLUMN IF NOT EXISTS practice_date DATE');
        } else {
            await dbConfig.run('ALTER TABLE course_slots ADD COLUMN practice_date TEXT').catch(() => {});
        }
        console.log('✅ Ensured course_slots.practice_date column exists');
    } catch (e) {
        console.log('ℹ️ practice_date column check skipped:', e.message || e);
    }
}


async function ensureWaitlistTable(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run(`
                CREATE TABLE IF NOT EXISTS waitlist (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL,
                    course_id INTEGER NOT NULL,
                    waitlist_position INTEGER NOT NULL,
                    notification_sent BOOLEAN DEFAULT FALSE,
                    notification_sent_at TIMESTAMP NULL,
                    notification_expires_at TIMESTAMP NULL,
                    payment_link_token VARCHAR(255) NULL,
                    status VARCHAR(20) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (student_id) REFERENCES students(id),
                    FOREIGN KEY (course_id) REFERENCES courses(id)
                )
            `);
            await dbConfig.run(`
                CREATE UNIQUE INDEX IF NOT EXISTS waitlist_unique_student_course
                ON waitlist(student_id, course_id)
            `);
        } else {
            await dbConfig.run(`
                CREATE TABLE IF NOT EXISTS waitlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    course_id INTEGER NOT NULL,
                    waitlist_position INTEGER NOT NULL,
                    notification_sent INTEGER DEFAULT 0,
                    notification_sent_at TEXT NULL,
                    notification_expires_at TEXT NULL,
                    payment_link_token TEXT NULL,
                    status TEXT DEFAULT 'active',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await dbConfig.run(`
                CREATE UNIQUE INDEX IF NOT EXISTS waitlist_unique_student_course
                ON waitlist(student_id, course_id)
            `);
        }
        console.log('✅ Ensured waitlist table exists');
    } catch (e) {
        console.log('ℹ️ Waitlist table check skipped:', e.message || e);
    }
}

async function ensurePaymentMethodColumn(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_method VARCHAR(10)');
        } else {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN payment_method TEXT').catch(() => {});
        }
        console.log('✅ Ensured registrations.payment_method column exists');
    } catch (e) {
        console.log('ℹ️ payment_method column check skipped:', e.message || e);
    }
}

async function ensureCancellationColumns(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMP');
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS canceled_by INTEGER');
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS cancellation_reason TEXT');
        } else {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN canceled_at TEXT').catch(() => {});
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN canceled_by INTEGER').catch(() => {});
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN cancellation_reason TEXT').catch(() => {});
        }
        console.log('✅ Ensured registrations cancellation audit columns exist');
    } catch (e) {
        console.log('ℹ️ registrations cancellation columns check skipped:', e.message || e);
    }
}

async function ensureWaitlistRegistrationColumns(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS created_from_waitlist BOOLEAN DEFAULT FALSE');
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN IF NOT EXISTS waitlist_notification_sent_at TIMESTAMP NULL');
        } else {
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN created_from_waitlist INTEGER DEFAULT 0').catch(() => {});
            await dbConfig.run('ALTER TABLE registrations ADD COLUMN waitlist_notification_sent_at TEXT').catch(() => {});
        }
        console.log('✅ Ensured registrations waitlist columns exist');
    } catch (e) {
        console.log('ℹ️ registrations waitlist columns check skipped:', e.message || e);
    }
}

async function ensureChoreographyColumns(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS song_name VARCHAR(255)');
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS movie_name VARCHAR(255)');
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS language VARCHAR(50)');
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS series_slot INTEGER');
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE');
        } else {
            await dbConfig.run('ALTER TABLE courses ADD COLUMN song_name TEXT').catch(() => {});
            await dbConfig.run('ALTER TABLE courses ADD COLUMN movie_name TEXT').catch(() => {});
            await dbConfig.run('ALTER TABLE courses ADD COLUMN language TEXT').catch(() => {});
            await dbConfig.run('ALTER TABLE courses ADD COLUMN series_slot INTEGER').catch(() => {});
            await dbConfig.run('ALTER TABLE courses ADD COLUMN is_hidden INTEGER DEFAULT 0').catch(() => {});
        }
        console.log('✅ Ensured courses choreography columns exist');
    } catch (e) {
        console.log('ℹ️ courses choreography columns check skipped:', e.message || e);
    }
}


async function ensureStudentProfileColumns(dbConfig) {
    try {
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS student_type VARCHAR(20) DEFAULT \'general\'');
            await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT FALSE');
            await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS admin_classified BOOLEAN DEFAULT FALSE');
            await dbConfig.run('ALTER TABLE students ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(255)');
            await dbConfig.run('ALTER TABLE courses ADD COLUMN IF NOT EXISTS required_student_type VARCHAR(20) DEFAULT \'any\'');
        } else {
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
}


module.exports = {
    initializeDatabase,
    ensureSchema
};
