#!/usr/bin/env node

// Script to fix course access control
const DatabaseConfig = require('../database-config');

async function fixCourseAccess() {
    const dbConfig = new DatabaseConfig();
    
    try {
        await dbConfig.connect();
        console.log('✅ Connected to database');
        
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
        
        console.log('✅ Updated Dreamers Crew Practice to crew-member only');
        
        // Verify the changes
        const courses = await dbConfig.all('SELECT id, name, course_type, required_student_type FROM courses ORDER BY id');
        
        console.log('\n📋 Current course access control:');
        courses.forEach(course => {
            const access = course.required_student_type === 'any' ? 'ALL USERS' : 'CREW MEMBERS ONLY';
            console.log(`  ${course.id}: ${course.name} (${course.course_type}) → ${access}`);
        });
        
        console.log('\n🎉 Course access control updated successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await dbConfig.close();
    }
}

fixCourseAccess().catch(console.error);
