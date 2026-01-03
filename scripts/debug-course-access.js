#!/usr/bin/env node

// Script to debug and fix course access control in production
const DatabaseConfig = require('../database-config');

async function debugCourseAccess() {
    // Force production mode to use PostgreSQL
    process.env.NODE_ENV = 'production';
    
    const dbConfig = new DatabaseConfig();
    
    try {
        await dbConfig.connect();
        console.log('✅ Connected to production PostgreSQL database');
        
        // Check current course access settings
        const allCourses = await dbConfig.all(`
            SELECT id, name, course_type, required_student_type, is_active
            FROM courses 
            WHERE is_active = true
            ORDER BY id ASC
        `);
        
        console.log('\n📋 Current course access settings:');
        console.log('ID | Name | Type | Access | Should General Students See?');
        console.log('---|------|------|--------|---------------------------');
        
        let issuesFound = 0;
        
        for (const course of allCourses) {
            const access = course.required_student_type === 'any' ? 'PUBLIC' : 'CREW-ONLY';
            const shouldGeneralSee = course.required_student_type === 'any' ? 'YES' : 'NO';
            const hasIssue = course.course_type === 'crew_practice' && course.required_student_type !== 'crew_member';
            
            if (hasIssue) issuesFound++;
            
            const flag = hasIssue ? ' ⚠️  ISSUE!' : '';
            console.log(`${course.id} | ${course.name.substring(0, 25)}... | ${course.course_type} | ${access} | ${shouldGeneralSee}${flag}`);
        }
        
        if (issuesFound > 0) {
            console.log(`\n❌ Found ${issuesFound} access control issues!`);
            console.log('\n🔧 Fixing access control...');
            
            // Fix crew practice courses to be crew-only
            await dbConfig.run(`
                UPDATE courses 
                SET required_student_type = 'crew_member' 
                WHERE course_type = 'crew_practice'
            `);
            
            // Fix crew+house combo courses to be crew-only
            await dbConfig.run(`
                UPDATE courses 
                SET required_student_type = 'crew_member' 
                WHERE name LIKE '%Crew + House%' OR name LIKE '%Crew+House%'
            `);
            
            console.log('✅ Fixed crew practice and crew+house courses to be crew-only');
            
            // Check results
            const fixedCourses = await dbConfig.all(`
                SELECT id, name, course_type, required_student_type
                FROM courses 
                WHERE is_active = true
                ORDER BY id ASC
            `);
            
            console.log('\n📋 After fix:');
            console.log('ID | Name | Type | Access');
            console.log('---|------|------|-------');
            
            for (const course of fixedCourses) {
                const access = course.required_student_type === 'any' ? 'PUBLIC' : 'CREW-ONLY';
                console.log(`${course.id} | ${course.name.substring(0, 30)}... | ${course.course_type} | ${access}`);
            }
        } else {
            console.log('\n✅ All course access settings look correct!');
        }
        
        // Test with the actual student email
        console.log('\n🧪 Testing access for pjayakrishna19@gmail.com...');
        
        const student = await dbConfig.get('SELECT * FROM students WHERE email = $1', ['pjayakrishna19@gmail.com']);
        if (!student) {
            console.log('❌ Student not found in production database');
            return;
        }
        
        console.log(`👤 Student found: ${student.first_name} ${student.last_name}`);
        console.log(`📋 Student type: ${student.student_type || 'general'}`);
        console.log(`✅ Admin classified: ${student.admin_classified ? 'YES' : 'NO'}`);
        
        // Get courses this student should see
        const studentType = student.student_type || 'general';
        let accessQuery = `
            SELECT id, name, course_type, required_student_type
            FROM courses 
            WHERE is_active = true
        `;
        
        if (studentType === 'crew_member') {
            accessQuery += ' AND (required_student_type = \'any\' OR required_student_type = \'crew_member\')';
        } else {
            accessQuery += ' AND required_student_type = \'any\'';
        }
        
        accessQuery += ' ORDER BY id ASC';
        
        const visibleCourses = await dbConfig.all(accessQuery);
        
        console.log(`\n🎯 Courses this ${studentType} should see (${visibleCourses.length} total):`);
        for (const course of visibleCourses) {
            console.log(`  - ${course.id}: ${course.name} (${course.course_type})`);
        }
        
        // Check for crew practice courses that would be visible to general students
        const crewCoursesVisibleToGeneral = await dbConfig.all(`
            SELECT id, name, course_type, required_student_type
            FROM courses 
            WHERE is_active = true 
            AND course_type = 'crew_practice'
            AND required_student_type = 'any'
        `);
        
        if (crewCoursesVisibleToGeneral.length > 0) {
            console.log('\n❌ CRITICAL ISSUE: These crew practice courses are visible to ALL users:');
            for (const course of crewCoursesVisibleToGeneral) {
                console.log(`  - ${course.id}: ${course.name}`);
            }
        } else {
            console.log('\n✅ Good: No crew practice courses are visible to general students');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await dbConfig.close();
    }
}

debugCourseAccess().catch(console.error);
