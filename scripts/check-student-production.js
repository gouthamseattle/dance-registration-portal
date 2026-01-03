#!/usr/bin/env node

// Script to check specific student in production database
const DatabaseConfig = require('../database-config');

async function checkStudentInProduction() {
    // Force production mode to use PostgreSQL
    process.env.NODE_ENV = 'production';
    
    const dbConfig = new DatabaseConfig();
    
    try {
        await dbConfig.connect();
        console.log('✅ Connected to production PostgreSQL database');
        
        const email = 'pjayakrishna19@gmail.com';
        
        // Check if student exists
        const student = await dbConfig.get('SELECT id, first_name, last_name, email, student_type, admin_classified, profile_complete FROM students WHERE email = $1', [email]);
        
        if (student) {
            console.log('👤 Student found:', {
                id: student.id,
                name: `${student.first_name} ${student.last_name}`,
                email: student.email,
                student_type: student.student_type,
                admin_classified: student.admin_classified,
                profile_complete: student.profile_complete
            });
            
            // Test what courses this student should see
            const studentType = student.student_type || 'general';
            let accessFilter;
            
            if (studentType === 'crew_member') {
                accessFilter = "(required_student_type = 'any' OR required_student_type = 'crew_member')";
            } else {
                accessFilter = "required_student_type = 'any'";
            }
            
            const courses = await dbConfig.all(`
                SELECT id, name, course_type, required_student_type 
                FROM courses 
                WHERE is_active = true AND ${accessFilter}
                ORDER BY id
            `);
            
            console.log(`\n🎯 Courses this ${studentType} should see:`);
            courses.forEach(c => {
                const access = c.required_student_type === 'any' ? 'PUBLIC' : 'CREW-ONLY';
                console.log(`  ${c.id}: ${c.name} (${c.course_type}) [${access}]`);
            });
            
        } else {
            console.log('❌ Student not found with email:', email);
            console.log('💡 This means API calls will default to general access (crew sessions hidden)');
        }
        
        // Also fix the crew+house combo course access
        await dbConfig.run(`
            UPDATE courses 
            SET required_student_type = 'crew_member' 
            WHERE id = 25 AND name LIKE '%Crew + House%'
        `);
        console.log('🔧 Fixed Crew + House combo course access to crew-only');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await dbConfig.close();
    }
}

checkStudentInProduction().catch(console.error);
