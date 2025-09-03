const { Client } = require('pg');
require('dotenv').config();

async function clearAllCourses() {
    console.log('🗑️  Starting to clear all dance courses...');
    
    // Connect to PostgreSQL
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });
    
    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // First, get count of existing courses
        const countResult = await client.query('SELECT COUNT(*) as count FROM courses');
        const courseCount = countResult.rows[0].count;
        console.log(`📊 Found ${courseCount} courses to delete`);
        
        if (courseCount === 0) {
            console.log('ℹ️  No courses found to delete');
            return;
        }
        
        // Delete all registrations first (to maintain referential integrity)
        const registrationsResult = await client.query('DELETE FROM registrations');
        console.log(`🗑️  Deleted ${registrationsResult.rowCount} registrations`);
        
        // Delete all courses
        const coursesResult = await client.query('DELETE FROM courses');
        console.log(`🗑️  Deleted ${coursesResult.rowCount} courses`);
        
        // Reset the sequence for auto-increment IDs
        await client.query('ALTER SEQUENCE courses_id_seq RESTART WITH 1');
        await client.query('ALTER SEQUENCE registrations_id_seq RESTART WITH 1');
        console.log('🔄 Reset ID sequences');
        
        console.log('🎉 Successfully cleared all dance courses and registrations!');
        
    } catch (error) {
        console.error('❌ Error clearing courses:', error);
        throw error;
    } finally {
        await client.end();
        console.log('✅ Database connection closed');
    }
}

// Run the script
clearAllCourses().catch(console.error);
