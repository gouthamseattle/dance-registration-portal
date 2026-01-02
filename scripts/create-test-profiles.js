#!/usr/bin/env node

/**
 * Create test profiles for crew member and general student testing
 * These will be added to the production PostgreSQL database
 */

const DatabaseConfig = require('../database-config');

async function createTestProfiles() {
    console.log('👤 Creating test profiles for January 2026 session testing...');
    
    const dbConfig = new DatabaseConfig();
    await dbConfig.connect();
    
    try {
        // Test profile 1: Crew Member
        const crewMemberEmail = 'crew.test@example.com';
        
        // Check if crew member test profile already exists
        let existingCrew = await dbConfig.get('SELECT * FROM students WHERE email = $1', [crewMemberEmail]);
        
        if (existingCrew) {
            console.log('🔄 Updating existing crew member test profile...');
            await dbConfig.run(`
                UPDATE students SET
                    first_name = $1,
                    last_name = $2,
                    student_type = $3,
                    profile_complete = $4,
                    admin_classified = $5,
                    instagram_handle = $6,
                    dance_experience = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE email = $8
            `, [
                'Crew', 'TestUser', 'crew_member', 
                dbConfig.isProduction ? true : 1,
                dbConfig.isProduction ? true : 1,
                '@crewtest', 'Experienced dancer and crew member',
                crewMemberEmail
            ]);
        } else {
            console.log('➕ Creating new crew member test profile...');
            await dbConfig.run(`
                INSERT INTO students (
                    first_name, last_name, email, student_type,
                    profile_complete, admin_classified, instagram_handle,
                    dance_experience
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                'Crew', 'TestUser', crewMemberEmail, 'crew_member',
                dbConfig.isProduction ? true : 1,
                dbConfig.isProduction ? true : 1,
                '@crewtest', 'Experienced dancer and crew member'
            ]);
        }
        
        // Test profile 2: General Student  
        const generalStudentEmail = 'general.test@example.com';
        
        // Check if general student test profile already exists
        let existingGeneral = await dbConfig.get('SELECT * FROM students WHERE email = $1', [generalStudentEmail]);
        
        if (existingGeneral) {
            console.log('🔄 Updating existing general student test profile...');
            await dbConfig.run(`
                UPDATE students SET
                    first_name = $1,
                    last_name = $2,
                    student_type = $3,
                    profile_complete = $4,
                    admin_classified = $5,
                    instagram_handle = $6,
                    dance_experience = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE email = $8
            `, [
                'General', 'TestUser', 'general',
                dbConfig.isProduction ? true : 1,
                dbConfig.isProduction ? true : 1,
                '@generaltest', 'New to house dancing',
                generalStudentEmail
            ]);
        } else {
            console.log('➕ Creating new general student test profile...');
            await dbConfig.run(`
                INSERT INTO students (
                    first_name, last_name, email, student_type,
                    profile_complete, admin_classified, instagram_handle,
                    dance_experience
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                'General', 'TestUser', generalStudentEmail, 'general',
                dbConfig.isProduction ? true : 1,
                dbConfig.isProduction ? true : 1,
                '@generaltest', 'New to house dancing'
            ]);
        }
        
        console.log('\n✅ Test profiles created successfully!');
        console.log('\n📧 Test Email Addresses:');
        console.log(`   🎭 Crew Member: ${crewMemberEmail}`);
        console.log(`      • Can access: Level 1 House, Level 2 House, Crew Practice, Drop-ins`);
        console.log(`      • Special access: Crew + House combo ($200)`);
        console.log(`      • Crew practice: Unlimited with combo purchase`);
        console.log('');
        console.log(`   👥 General Student: ${generalStudentEmail}`);
        console.log(`      • Can access: Level 1 House, Level 2 House, Drop-ins`);
        console.log(`      • Cannot access: Crew Practice, Crew + House combo`);
        console.log(`      • Drop-ins: 1-3 classes, single track (L1 OR L2)`);
        console.log('');
        console.log('🧪 Testing Features:');
        console.log('   • Use these emails on the registration portal');
        console.log('   • Test crew member sees crew practice & crew+house combo');
        console.log('   • Test general student does NOT see crew-only options');
        console.log('   • Test drop-in bundle: weeks 1-3 only, single track enforcement');
        console.log('   • Test week 4 gating: no drop-in option for final combined class');
        
    } catch (error) {
        console.error('❌ Test profile creation failed:', error);
        throw error;
    } finally {
        await dbConfig.close();
    }
}

// Run the setup
if (require.main === module) {
    createTestProfiles()
        .then(() => {
            console.log('✅ Test profiles setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Test profiles setup failed:', error);
            process.exit(1);
        });
}

module.exports = { createTestProfiles };
