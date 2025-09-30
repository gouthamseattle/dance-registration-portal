const { Client } = require('pg');

async function createTestWaitlistCourse() {
    console.log('🔧 Creating test course for waitlist testing...');
    
    // Use production database connection
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:LqkMMiNJBCjFMDwlCCmDZkAsMCOcqksW@postgres.railway.internal:5432/railway',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // First, make course ID 5 available to all users (it's full with 0 spots - perfect for waitlist testing)
        await client.query(
            "UPDATE courses SET required_student_type = 'any' WHERE id = 5"
        );
        console.log('✅ Updated course ID 5 to be available to all users');

        // Also create a new test course with 1 slot
        const insertResult = await client.query(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks, level, capacity,
                start_date, is_active, schedule_info, required_student_type
            ) VALUES (
                'Waitlist Test Course - 1 Slot',
                'Test course with 1 slot to test the waitlist system',
                'drop_in',
                1,
                'All Levels',
                1,
                '2025-09-25',
                true,
                'Sept 25, 2025 - Waitlist Test',
                'any'
            ) RETURNING id
        `);
        
        const courseId = insertResult.rows[0].id;
        console.log('✅ Created new test course with ID:', courseId);

        // Create a slot for the new course  
        await client.query(`
            INSERT INTO course_slots (
                course_id, slot_name, difficulty_level, capacity,
                day_of_week, start_time, end_time, location
            ) VALUES ($1, 'Test Slot', 'All Levels', 1, 'Monday', '7:00 PM', '8:00 PM', 'Test Studio')
        `, [courseId]);
        
        console.log('✅ Created slot for test course');

        // Show current courses available to all users
        const result = await client.query(`
            SELECT id, name, required_student_type, capacity,
                   (SELECT COUNT(*) FROM registrations WHERE course_id = courses.id) as registered_count
            FROM courses 
            WHERE is_active = true AND required_student_type = 'any'
            ORDER BY id
        `);
        
        console.log('\n📋 Courses available to all users:');
        result.rows.forEach(course => {
            const available = course.capacity - course.registered_count;
            console.log(`  ${course.id}: ${course.name} (${available}/${course.capacity} available)`);
        });
        
        console.log('\n🎉 Test courses ready for waitlist testing!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
        console.log('✅ Database connection closed');
    }
}

createTestWaitlistCourse();
