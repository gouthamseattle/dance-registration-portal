const { Client } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function migrateToSlotsSchema() {
    console.log('🚀 Starting migration to slots-based schema...');
    
    const DatabaseConfig = require('./database-config');
    const dbConfig = new DatabaseConfig();
    
    try {
        const db = await dbConfig.connect();
        console.log('✅ Connected to database');
        
        // Create new tables
        await createSlotTables(dbConfig);
        
        // Migrate existing course data to slot-based structure
        await migrateExistingCourses(dbConfig);
        
        console.log('🎉 Slots schema migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await dbConfig.close();
    }
}

async function createSlotTables(dbConfig) {
    console.log('📋 Creating slots and pricing tables...');
    
    // Create course_slots table
    const createSlotsTable = `
        CREATE TABLE IF NOT EXISTS course_slots (
            id ${dbConfig.isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${dbConfig.isProduction ? '' : 'AUTOINCREMENT'},
            course_id INTEGER NOT NULL,
            slot_name VARCHAR(255),
            difficulty_level VARCHAR(100) NOT NULL DEFAULT 'All Levels',
            capacity INTEGER NOT NULL,
            day_of_week VARCHAR(20),
            start_time ${dbConfig.isProduction ? 'TIME' : 'TEXT'},
            end_time ${dbConfig.isProduction ? 'TIME' : 'TEXT'},
            location VARCHAR(255),
            created_at ${dbConfig.isProduction ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_id) REFERENCES courses(id) ${dbConfig.isProduction ? 'ON DELETE CASCADE' : ''}
        )
    `;
    
    // Create course_pricing table
    const createPricingTable = `
        CREATE TABLE IF NOT EXISTS course_pricing (
            id ${dbConfig.isProduction ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${dbConfig.isProduction ? '' : 'AUTOINCREMENT'},
            course_slot_id INTEGER NOT NULL,
            pricing_type VARCHAR(50) NOT NULL,
            price ${dbConfig.isProduction ? 'DECIMAL(10,2)' : 'REAL'} NOT NULL,
            created_at ${dbConfig.isProduction ? 'TIMESTAMP' : 'DATETIME'} DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (course_slot_id) REFERENCES course_slots(id) ${dbConfig.isProduction ? 'ON DELETE CASCADE' : ''}
        )
    `;
    
    await dbConfig.run(createSlotsTable);
    await dbConfig.run(createPricingTable);
    
    console.log('✅ Slots and pricing tables created');
}

async function migrateExistingCourses(dbConfig) {
    console.log('📦 Migrating existing courses to slot-based structure...');
    
    // Get all existing courses
    const courses = await dbConfig.all('SELECT * FROM courses');
    
    if (courses.length === 0) {
        console.log('ℹ️  No existing courses to migrate');
        return;
    }
    
    console.log(`📊 Found ${courses.length} courses to migrate`);
    
    for (const course of courses) {
        try {
            // Create a default slot for each existing course
            const slotData = {
                course_id: course.id,
                slot_name: 'Main Session',
                difficulty_level: course.level || 'All Levels',
                capacity: course.capacity || 20,
                day_of_week: course.day_of_week,
                start_time: course.start_time,
                end_time: course.end_time,
                location: course.location
            };
            
            // Insert slot
            const slotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity, 
                    day_of_week, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                slotData.course_id, slotData.slot_name, slotData.difficulty_level,
                slotData.capacity, slotData.day_of_week, slotData.start_time,
                slotData.end_time, slotData.location
            ]);
            
            // Get slot ID
            let slotId;
            if (dbConfig.isProduction) {
                slotId = slotResult[0]?.id;
            } else {
                slotId = slotResult.lastID;
            }
            
            if (!slotId) {
                console.error(`❌ Failed to create slot for course ${course.id}`);
                continue;
            }
            
            // Create pricing records
            const coursePrice = parseFloat(course.price) || 0;
            const durationWeeks = parseInt(course.duration_weeks) || 1;
            const perClassPrice = durationWeeks > 1 ? coursePrice / durationWeeks : coursePrice;
            
            // Full package pricing
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, coursePrice]);
            
            // Drop-in pricing (per class)
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [slotId, perClassPrice]);
            
            console.log(`✅ Migrated course: ${course.name} (ID: ${course.id})`);
            
        } catch (error) {
            console.error(`❌ Error migrating course ${course.id}:`, error);
        }
    }
    
    console.log('✅ Course migration to slots completed');
}

// Add new columns to courses table and make existing ones optional
async function updateCoursesTable(dbConfig) {
    console.log('🔄 Updating courses table schema...');
    
    try {
        // Make schedule_info and prerequisites nullable
        if (dbConfig.isProduction) {
            await dbConfig.run('ALTER TABLE courses ALTER COLUMN schedule_info DROP NOT NULL');
            await dbConfig.run('ALTER TABLE courses ALTER COLUMN prerequisites DROP NOT NULL');
        }
        // Note: SQLite doesn't support ALTER COLUMN, but the fields are likely already nullable
        
        console.log('✅ Courses table updated');
    } catch (error) {
        console.log('ℹ️  Courses table update skipped (likely already compatible):', error.message);
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateToSlotsSchema().catch(console.error);
}

module.exports = { migrateToSlotsSchema };
