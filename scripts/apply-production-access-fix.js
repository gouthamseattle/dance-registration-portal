#!/usr/bin/env node

// Script to apply access control fixes to production database
const DatabaseConfig = require('../database-config');

async function applyProductionAccessFix() {
    const dbConfig = new DatabaseConfig();
    
    try {
        await dbConfig.connect();
        console.log('✅ Connected to production database');
        
        // Update ALL crew_practice courses to be crew-member only
        await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'crew_member' 
            WHERE course_type = 'crew_practice'
        `);
        
        // Fix any crew practice courses that are misclassified as drop_in
        await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'crew_member' 
            WHERE name LIKE '%crew practice%' OR name LIKE '%Crew Practice%'
        `);
        
        // Ensure drop-in and multi-week courses are available to all (except crew-specific ones)
        await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'any' 
            WHERE course_type IN ('drop_in', 'multi-week')
            AND name NOT LIKE '%crew%'
            AND name NOT LIKE '%Crew%'
        `);
        
        console.log('✅ Applied access control fixes to production database');
        
        // Verify the changes
        const crewCourses = await dbConfig.all(`
            SELECT id, name, course_type, required_student_type 
            FROM courses 
            WHERE name LIKE '%crew%' OR course_type = 'crew_practice'
            ORDER BY id
        `);
        
        console.log('\n📋 Crew-related courses after fix:');
        crewCourses.forEach(course => {
            const access = course.required_student_type === 'any' ? '⚠️  ALL USERS' : '✅ CREW ONLY';
            console.log(`  ${course.id}: ${course.name} (${course.course_type}) → ${access}`);
        });
        
        console.log('\n🎉 Production access control updated successfully!');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await dbConfig.close();
    }
}

applyProductionAccessFix().catch(console.error);
