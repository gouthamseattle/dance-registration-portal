#!/usr/bin/env node

/**
 * Setup script for combo packages
 * Creates Level 1+2 Combo and Crew+House packages
 */

const DatabaseConfig = require('../database-config');

async function setupComboPackages() {
    console.log('🎭 Setting up Combo Packages...');
    
    const dbConfig = new DatabaseConfig();
    await dbConfig.connect();
    
    try {
        const location = 'Studio G, Seattle Armory';
        const capacity = 25;
        
        // 1. Level 1 + 2 Combo Package ($150)
        console.log('🎯 Creating Level 1 + 2 Combo Package...');
        const comboResult = await dbConfig.run(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            'Level 1 + 2 House Combo - January 2026',
            'Complete access to both Level 1 and Level 2 House classes. Includes Week 4 combined class. Perfect for dancers wanting to experience both levels.',
            'multi-week',
            4,
            '2026-01-06',
            '2026-01-27',
            null,
            'Tuesdays: Level 1 (6:15-7:30 PM) + Level 2 (7:30-9:00 PM) + Week 4 Combined (6:30-9:00 PM)',
            dbConfig.isProduction ? true : 1,
            'any'
        ]);
        
        const comboId = dbConfig.isProduction ? comboResult[0]?.id : comboResult.lastID;
        console.log(`✅ Created Level 1+2 Combo (ID: ${comboId})`);
        
        // Create combo slots
        const comboSlotResult = await dbConfig.run(`
            INSERT INTO course_slots (
                course_id, slot_name, difficulty_level, capacity,
                day_of_week, start_time, end_time, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            comboId, 'Level 1 + 2 Full Access', 'Beginner to Intermediate', capacity,
            'Tuesday', '6:15 PM', '9:00 PM', location
        ]);
        
        const comboSlotId = dbConfig.isProduction ? comboSlotResult[0]?.id : comboSlotResult.lastID;
        
        // Add combo pricing
        await dbConfig.run(`
            INSERT INTO course_pricing (course_slot_id, pricing_type, price)
            VALUES ($1, 'full_package', $2)
        `, [comboSlotId, 150]);
        
        // 2. Crew + House Package ($200)
        console.log('🎯 Creating Crew + House Unlimited Package...');
        const crewHouseResult = await dbConfig.run(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            'Crew + House Unlimited - January 2026',
            'Complete access to ALL House classes (Level 1 & 2) PLUS unlimited Crew Practice sessions. The ultimate package for serious dancers.',
            'multi-week',
            4,
            '2026-01-06',
            '2026-01-30',
            null,
            'Tuesdays: House Classes (6:15-9:00 PM) + Fridays: Crew Practice (6:30-10:30 PM) - Unlimited Access',
            dbConfig.isProduction ? true : 1,
            'crew_member'
        ]);
        
        const crewHouseId = dbConfig.isProduction ? crewHouseResult[0]?.id : crewHouseResult.lastID;
        console.log(`✅ Created Crew+House Unlimited (ID: ${crewHouseId})`);
        
        // Create unlimited package slot
        const unlimitedSlotResult = await dbConfig.run(`
            INSERT INTO course_slots (
                course_id, slot_name, difficulty_level, capacity,
                day_of_week, start_time, end_time, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            crewHouseId, 'Unlimited Access Pass', 'All Levels + Crew', capacity,
            'Tuesday,Friday', '6:15 PM', '10:30 PM', location
        ]);
        
        const unlimitedSlotId = dbConfig.isProduction ? unlimitedSlotResult[0]?.id : unlimitedSlotResult.lastID;
        
        // Add unlimited package pricing
        await dbConfig.run(`
            INSERT INTO course_pricing (course_slot_id, pricing_type, price)
            VALUES ($1, 'full_package', $2)
        `, [unlimitedSlotId, 200]);
        
        // 3. Triple Threat Package (All Individual Classes) - $260 value for $220
        console.log('🎯 Creating Triple Threat Package...');
        const tripleResult = await dbConfig.run(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            'Triple Threat Package - January 2026',
            'Complete access to Level 1 House ($80) + Level 2 House ($100) + All Crew Practice ($80) = $260 value for only $220! Save $40 with this comprehensive package.',
            'multi-week',
            4,
            '2026-01-06',
            '2026-01-30',
            null,
            'EVERYTHING: Tuesdays House Classes + Fridays Crew Practice + Week 4 Combined Class',
            dbConfig.isProduction ? true : 1,
            'any'
        ]);
        
        const tripleId = dbConfig.isProduction ? tripleResult[0]?.id : tripleResult.lastID;
        console.log(`✅ Created Triple Threat Package (ID: ${tripleId})`);
        
        // Create triple package slot
        const tripleSlotResult = await dbConfig.run(`
            INSERT INTO course_slots (
                course_id, slot_name, difficulty_level, capacity,
                day_of_week, start_time, end_time, location
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            tripleId, 'Complete Access - Everything Included', 'All Levels', capacity,
            'Tuesday,Friday', '6:15 PM', '10:30 PM', location
        ]);
        
        const tripleSlotId = dbConfig.isProduction ? tripleSlotResult[0]?.id : tripleSlotResult.lastID;
        
        // Add triple package pricing
        await dbConfig.run(`
            INSERT INTO course_pricing (course_slot_id, pricing_type, price)
            VALUES ($1, 'full_package', $2)
        `, [tripleSlotId, 220]);
        
        console.log('\n🎉 Combo Packages Setup Complete!');
        console.log('\n📦 Package Options Now Available:');
        console.log(`   • Level 1 Only: $80`);
        console.log(`   • Level 2 Only: $100`);
        console.log(`   • Level 1 + 2 Combo: $150 (ID: ${comboId})`);
        console.log(`   • Crew + House Unlimited: $200 (ID: ${crewHouseId}) - Crew members only`);
        console.log(`   • Triple Threat (Everything): $220 (ID: ${tripleId}) - $40 savings!`);
        console.log('   • Drop-in classes: $30 each');
        console.log('   • Crew Practice only: $30 each');
        
    } catch (error) {
        console.error('❌ Combo package setup failed:', error);
        throw error;
    } finally {
        await dbConfig.close();
    }
}

// Run the setup
if (require.main === module) {
    setupComboPackages()
        .then(() => {
            console.log('✅ Combo packages setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Combo packages setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupComboPackages };
