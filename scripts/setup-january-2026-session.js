#!/usr/bin/env node

/**
 * Setup script for January 2026 dance session
 * Creates Level 1 & 2 House courses, Crew Practice, and Drop-in classes
 * Based on confirmed requirements and dates
 */

const DatabaseConfig = require('../database-config');

async function setupJanuarySession() {
    console.log('🎭 Setting up January 2026 Dance Session...');
    
    const dbConfig = new DatabaseConfig();
    await dbConfig.connect();
    
    try {
        // Session dates
        const tuesdays = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27'];
        const fridays = ['2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30'];
        
        const location = 'Studio G, Seattle Armory';
        const capacity = 25;
        
        console.log('📅 Session dates:', { tuesdays, fridays });
        
        // 1. Create Level 1 House series
        console.log('🏠 Creating Level 1 House series...');
        const level1Result = await dbConfig.run(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            'Level 1 House - January 2026',
            'Level 1 House classes with beginner-friendly choreography and technique. Includes special combined class in week 4.',
            'multi-week',
            4,
            tuesdays[0],
            tuesdays[3],
            null,
            'Tuesdays 6:15-7:30 PM at Studio G, Seattle Armory',
            dbConfig.isProduction ? true : 1,
            'any'
        ]);
        
        const level1Id = dbConfig.isProduction ? level1Result[0]?.id : level1Result.lastID;
        console.log(`✅ Created Level 1 course (ID: ${level1Id})`);
        
        // Create Level 1 slots (weeks 1-3 regular, week 4 extended)
        for (let i = 0; i < 4; i++) {
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '6:15 PM';
            const endTime = isWeek4 ? '9:00 PM' : '7:30 PM';
            const slotName = isWeek4 ? 'Level 1 & 2 Combined Session' : `Week ${i + 1}`;
            
            const slotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    day_of_week, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                level1Id, slotName, 'Level 1', capacity,
                'Tuesday', startTime, endTime, location
            ]);
            
            const slotId = dbConfig.isProduction ? slotResult[0]?.id : slotResult.lastID;
            
            // Add pricing
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, 80]);
            
            if (!isWeek4) {
                await dbConfig.run(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'drop_in', $2)
                `, [slotId, 25]);
            }
        }
        
        // 2. Create Level 2 House series  
        console.log('🏠 Creating Level 2 House series...');
        const level2Result = await dbConfig.run(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ${dbConfig.isProduction ? 'RETURNING id' : ''}
        `, [
            'Level 2 House - January 2026',
            'Level 2 House classes with intermediate choreography and technique. Includes special combined class in week 4.',
            'multi-week',
            4,
            tuesdays[0],
            tuesdays[3],
            null,
            'Tuesdays 7:30-9:00 PM at Studio G, Seattle Armory',
            dbConfig.isProduction ? true : 1,
            'any'
        ]);
        
        const level2Id = dbConfig.isProduction ? level2Result[0]?.id : level2Result.lastID;
        console.log(`✅ Created Level 2 course (ID: ${level2Id})`);
        
        // Create Level 2 slots (weeks 1-3 regular, week 4 extended)
        for (let i = 0; i < 4; i++) {
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '7:30 PM';
            const endTime = isWeek4 ? '9:00 PM' : '9:00 PM';
            const slotName = isWeek4 ? 'Level 1 & 2 Combined Session' : `Week ${i + 1}`;
            
            const slotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    day_of_week, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                level2Id, slotName, 'Level 2', capacity,
                'Tuesday', startTime, endTime, location
            ]);
            
            const slotId = dbConfig.isProduction ? slotResult[0]?.id : slotResult.lastID;
            
            // Add pricing
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, 100]);
            
            if (!isWeek4) {
                await dbConfig.run(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'drop_in', $2)
                `, [slotId, 30]);
            }
        }
        
        // 3. Create Crew Practice sessions (Fridays)
        console.log('👥 Creating Crew Practice sessions...');
        for (let i = 0; i < fridays.length; i++) {
            const practiceDate = fridays[i];
            
            const crewResult = await dbConfig.run(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                `Crew Practice - ${practiceDate}`,
                'Crew practice session for advanced dancers and crew members.',
                'crew_practice',
                1,
                practiceDate,
                practiceDate,
                null,
                `Friday 6:30-10:30 PM at ${location}`,
                dbConfig.isProduction ? true : 1,
                'crew_member'
            ]);
            
            const crewId = dbConfig.isProduction ? crewResult[0]?.id : crewResult.lastID;
            
            // Create crew practice slot
            const crewSlotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                crewId, 'Crew Practice', 'Advanced', capacity,
                practiceDate, '6:30 PM', '10:30 PM', location
            ]);
            
            const crewSlotId = dbConfig.isProduction ? crewSlotResult[0]?.id : crewSlotResult.lastID;
            
            // Add crew practice pricing
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [crewSlotId, 30]);
            
            console.log(`✅ Created Crew Practice for ${practiceDate} (ID: ${crewId})`);
        }
        
        // 4. Create Drop-in classes (weeks 1-3 only)
        console.log('🎫 Creating Drop-in classes...');
        const dropInWeeks = tuesdays.slice(0, 3); // Only weeks 1-3
        
        for (let i = 0; i < dropInWeeks.length; i++) {
            const date = dropInWeeks[i];
            const weekNum = i + 1;
            
            // Level 1 Drop-in
            const l1DropResult = await dbConfig.run(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                `Level 1 Drop-in - Week ${weekNum} (${date})`,
                `Single drop-in class for Level 1 House, Week ${weekNum}.`,
                'multi-week',
                1,
                date,
                date,
                null,
                `Tuesday 6:15-7:30 PM at ${location}`,
                dbConfig.isProduction ? true : 1,
                'any'
            ]);
            
            const l1DropId = dbConfig.isProduction ? l1DropResult[0]?.id : l1DropResult.lastID;
            
            const l1DropSlotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                l1DropId, `Week ${weekNum}`, 'Level 1', capacity,
                date, '6:15 PM', '7:30 PM', location
            ]);
            
            const l1DropSlotId = dbConfig.isProduction ? l1DropSlotResult[0]?.id : l1DropSlotResult.lastID;
            
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [l1DropSlotId, 30]);
            
            // Level 2 Drop-in
            const l2DropResult = await dbConfig.run(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                `Level 2 Drop-in - Week ${weekNum} (${date})`,
                `Single drop-in class for Level 2 House, Week ${weekNum}.`,
                'multi-week',
                1,
                date,
                date,
                null,
                `Tuesday 7:30-9:00 PM at ${location}`,
                dbConfig.isProduction ? true : 1,
                'any'
            ]);
            
            const l2DropId = dbConfig.isProduction ? l2DropResult[0]?.id : l2DropResult.lastID;
            
            const l2DropSlotResult = await dbConfig.run(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ${dbConfig.isProduction ? 'RETURNING id' : ''}
            `, [
                l2DropId, `Week ${weekNum}`, 'Level 2', capacity,
                date, '7:30 PM', '9:00 PM', location
            ]);
            
            const l2DropSlotId = dbConfig.isProduction ? l2DropSlotResult[0]?.id : l2DropSlotResult.lastID;
            
            await dbConfig.run(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [l2DropSlotId, 30]);
            
            console.log(`✅ Created drop-in classes for Week ${weekNum} (${date})`);
        }
        
        // 5. Create class sessions for attendance tracking
        console.log('📋 Creating class sessions for attendance...');
        
        // Level 1 sessions
        for (let i = 0; i < 4; i++) {
            const date = tuesdays[i];
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '6:15 PM';
            const endTime = isWeek4 ? '9:00 PM' : '7:30 PM';
            
            await dbConfig.run(`
                INSERT INTO class_sessions (
                    course_id, session_date, start_time, end_time, location, notes
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                level1Id, date, startTime, endTime, location,
                isWeek4 ? 'Combined Level 1 & 2 class' : `Level 1 House - Week ${i + 1}`
            ]);
        }
        
        // Level 2 sessions
        for (let i = 0; i < 4; i++) {
            const date = tuesdays[i];
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '7:30 PM';
            const endTime = '9:00 PM';
            
            await dbConfig.run(`
                INSERT INTO class_sessions (
                    course_id, session_date, start_time, end_time, location, notes
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                level2Id, date, startTime, endTime, location,
                isWeek4 ? 'Combined Level 1 & 2 class' : `Level 2 House - Week ${i + 1}`
            ]);
        }
        
        console.log('✅ Created attendance sessions for both levels');
        
        // Summary
        console.log('\n🎉 January 2026 Session Setup Complete!');
        console.log('\n📊 Created:');
        console.log(`   • Level 1 House series (ID: ${level1Id}) - $80 full / $25 drop-in`);
        console.log(`   • Level 2 House series (ID: ${level2Id}) - $100 full / $30 drop-in`);
        console.log(`   • ${fridays.length} Crew Practice sessions - $30 each (crew members only)`);
        console.log(`   • 6 Drop-in classes (3 weeks × 2 levels) - $30 each`);
        console.log('   • Week 4 combined class (6:30-9:00 PM) for both levels');
        console.log('   • Attendance sessions for tracking');
        console.log('\n💡 Packages available:');
        console.log('   • Level 1 only: $80');
        console.log('   • Level 2 only: $100');
        console.log('   • Level 1 + 2 Combo: $150 (manual calculation)');
        console.log('   • Crew + House: $200 (unlimited crew practice + house classes)');
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
        throw error;
    } finally {
        await dbConfig.close();
    }
}

// Run the setup
if (require.main === module) {
    setupJanuarySession()
        .then(() => {
            console.log('✅ Setup completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        });
}

module.exports = { setupJanuarySession };
