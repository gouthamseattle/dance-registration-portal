// Temporary setup endpoint to add to server.js for creating courses in production
// This can be merged into server.js and then called via the web interface

// Add this route to your server.js file:
app.post('/admin/setup-january-2026', async (req, res) => {
    try {
        console.log('🎭 Setting up January 2026 Dance Session in production...');
        
        // Session dates
        const tuesdays = ['2026-01-06', '2026-01-13', '2026-01-20', '2026-01-27'];
        const fridays = ['2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30'];
        
        const location = 'Studio G, Seattle Armory';
        const capacity = 25;
        
        console.log('📅 Session dates:', { tuesdays, fridays });
        
        // 1. Create Level 1 House series
        console.log('🏠 Creating Level 1 House series...');
        const level1Result = await dbConfig.query(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            'Level 1 House - January 2026',
            'Level 1 House classes with beginner-friendly choreography and technique. Includes special combined class in week 4.',
            'multi-week',
            4,
            tuesdays[0],
            tuesdays[3],
            null,
            'Tuesdays 6:15-7:30 PM at Studio G, Seattle Armory',
            true,
            'any'
        ]);
        
        const level1Id = level1Result.rows[0].id;
        console.log(`✅ Created Level 1 course (ID: ${level1Id})`);
        
        // Create Level 1 slots (weeks 1-3 regular, week 4 extended)
        for (let i = 0; i < 4; i++) {
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '6:15 PM';
            const endTime = isWeek4 ? '9:00 PM' : '7:30 PM';
            const slotName = isWeek4 ? 'Level 1 & 2 Combined Session' : `Week ${i + 1}`;
            
            const slotResult = await dbConfig.query(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    day_of_week, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                level1Id, slotName, 'Level 1', capacity,
                'Tuesday', startTime, endTime, location
            ]);
            
            const slotId = slotResult.rows[0].id;
            
            // Add pricing
            await dbConfig.query(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, 80]);
            
            if (!isWeek4) {
                await dbConfig.query(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'drop_in', $2)
                `, [slotId, 25]);
            }
        }
        
        // 2. Create Level 2 House series  
        console.log('🏠 Creating Level 2 House series...');
        const level2Result = await dbConfig.query(`
            INSERT INTO courses (
                name, description, course_type, duration_weeks,
                start_date, end_date, instructor, schedule_info,
                is_active, required_student_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `, [
            'Level 2 House - January 2026',
            'Level 2 House classes with intermediate choreography and technique. Includes special combined class in week 4.',
            'multi-week',
            4,
            tuesdays[0],
            tuesdays[3],
            null,
            'Tuesdays 7:30-9:00 PM at Studio G, Seattle Armory',
            true,
            'any'
        ]);
        
        const level2Id = level2Result.rows[0].id;
        console.log(`✅ Created Level 2 course (ID: ${level2Id})`);
        
        // Create Level 2 slots (weeks 1-3 regular, week 4 extended)
        for (let i = 0; i < 4; i++) {
            const isWeek4 = i === 3;
            const startTime = isWeek4 ? '6:30 PM' : '7:30 PM';
            const endTime = isWeek4 ? '9:00 PM' : '9:00 PM';
            const slotName = isWeek4 ? 'Level 1 & 2 Combined Session' : `Week ${i + 1}`;
            
            const slotResult = await dbConfig.query(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    day_of_week, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                level2Id, slotName, 'Level 2', capacity,
                'Tuesday', startTime, endTime, location
            ]);
            
            const slotId = slotResult.rows[0].id;
            
            // Add pricing
            await dbConfig.query(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'full_package', $2)
            `, [slotId, 100]);
            
            if (!isWeek4) {
                await dbConfig.query(`
                    INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                    VALUES ($1, 'drop_in', $2)
                `, [slotId, 30]);
            }
        }
        
        // 3. Create Crew Practice sessions (Fridays)
        console.log('👥 Creating Crew Practice sessions...');
        for (let i = 0; i < fridays.length; i++) {
            const practiceDate = fridays[i];
            
            const crewResult = await dbConfig.query(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `, [
                `Crew Practice - ${practiceDate}`,
                'Crew practice session for advanced dancers and crew members.',
                'crew_practice',
                1,
                practiceDate,
                practiceDate,
                null,
                `Friday 6:30-10:30 PM at ${location}`,
                true,
                'crew_member'
            ]);
            
            const crewId = crewResult.rows[0].id;
            
            // Create crew practice slot
            const crewSlotResult = await dbConfig.query(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                crewId, 'Crew Practice', 'Advanced', capacity,
                practiceDate, '6:30 PM', '10:30 PM', location
            ]);
            
            const crewSlotId = crewSlotResult.rows[0].id;
            
            // Add crew practice pricing
            await dbConfig.query(`
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
            const l1DropResult = await dbConfig.query(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `, [
                `Level 1 Drop-in - Week ${weekNum} (${date})`,
                `Single drop-in class for Level 1 House, Week ${weekNum}.`,
                'multi-week',
                1,
                date,
                date,
                null,
                `Tuesday 6:15-7:30 PM at ${location}`,
                true,
                'any'
            ]);
            
            const l1DropId = l1DropResult.rows[0].id;
            
            const l1DropSlotResult = await dbConfig.query(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                l1DropId, `Week ${weekNum}`, 'Level 1', capacity,
                date, '6:15 PM', '7:30 PM', location
            ]);
            
            const l1DropSlotId = l1DropSlotResult.rows[0].id;
            
            await dbConfig.query(`
                INSERT INTO course_pricing (course_slot_id, pricing_type, price)
                VALUES ($1, 'drop_in', $2)
            `, [l1DropSlotId, 30]);
            
            // Level 2 Drop-in
            const l2DropResult = await dbConfig.query(`
                INSERT INTO courses (
                    name, description, course_type, duration_weeks,
                    start_date, end_date, instructor, schedule_info,
                    is_active, required_student_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id
            `, [
                `Level 2 Drop-in - Week ${weekNum} (${date})`,
                `Single drop-in class for Level 2 House, Week ${weekNum}.`,
                'multi-week',
                1,
                date,
                date,
                null,
                `Tuesday 7:30-9:00 PM at ${location}`,
                true,
                'any'
            ]);
            
            const l2DropId = l2DropResult.rows[0].id;
            
            const l2DropSlotResult = await dbConfig.query(`
                INSERT INTO course_slots (
                    course_id, slot_name, difficulty_level, capacity,
                    practice_date, start_time, end_time, location
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id
            `, [
                l2DropId, `Week ${weekNum}`, 'Level 2', capacity,
                date, '7:30 PM', '9:00 PM', location
            ]);
            
            const l2DropSlotId = l2DropSlotResult.rows[0].id;
            
            await dbConfig.query(`
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
            
            await dbConfig.query(`
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
            
            await dbConfig.query(`
                INSERT INTO class_sessions (
                    course_id, session_date, start_time, end_time, location, notes
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                level2Id, date, startTime, endTime, location,
                isWeek4 ? 'Combined Level 1 & 2 class' : `Level 2 House - Week ${i + 1}`
            ]);
        }
        
        res.json({
            success: true,
            message: 'January 2026 session created successfully',
            summary: {
                level1Id,
                level2Id,
                crewSessions: fridays.length,
                dropInClasses: 6,
                totalCourses: 2 + fridays.length + 6
            }
        });
        
    } catch (error) {
        console.error('❌ Setup failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Also create the test profiles endpoint:
app.post('/admin/create-test-profiles', async (req, res) => {
    try {
        // Test profile 1: Crew Member
        const crewMemberEmail = 'crew.test@example.com';
        
        const existingCrew = await dbConfig.query('SELECT * FROM students WHERE email = $1', [crewMemberEmail]);
        
        if (existingCrew.rows.length > 0) {
            await dbConfig.query(`
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
                'Crew', 'TestUser', 'crew_member', true, true,
                '@crewtest', 'Experienced dancer and crew member',
                crewMemberEmail
            ]);
        } else {
            await dbConfig.query(`
                INSERT INTO students (
                    first_name, last_name, email, student_type,
                    profile_complete, admin_classified, instagram_handle,
                    dance_experience
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                'Crew', 'TestUser', crewMemberEmail, 'crew_member',
                true, true, '@crewtest', 'Experienced dancer and crew member'
            ]);
        }
        
        // Test profile 2: General Student  
        const generalStudentEmail = 'general.test@example.com';
        
        const existingGeneral = await dbConfig.query('SELECT * FROM students WHERE email = $1', [generalStudentEmail]);
        
        if (existingGeneral.rows.length > 0) {
            await dbConfig.query(`
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
                'General', 'TestUser', 'general', true, true,
                '@generaltest', 'New to house dancing',
                generalStudentEmail
            ]);
        } else {
            await dbConfig.query(`
                INSERT INTO students (
                    first_name, last_name, email, student_type,
                    profile_complete, admin_classified, instagram_handle,
                    dance_experience
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
                'General', 'TestUser', generalStudentEmail, 'general',
                true, true, '@generaltest', 'New to house dancing'
            ]);
        }
        
        res.json({
            success: true,
            message: 'Test profiles created successfully',
            profiles: {
                crewMember: crewMemberEmail,
                generalStudent: generalStudentEmail
            }
        });
        
    } catch (error) {
        console.error('❌ Test profiles creation failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
