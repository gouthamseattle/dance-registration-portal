// One-time Historical Student Classification Script
// Analyzes existing students and suggests classifications based on registration history

const DatabaseConfig = require('../database-config');

async function classifyHistoricalStudents() {
    console.log('🔍 Historical Student Classification Analysis');
    console.log('==========================================');
    
    const dbConfig = new DatabaseConfig();
    
    try {
        await dbConfig.connect();
        console.log('✅ Connected to database');
        
        // Use database-appropriate string aggregation function
        const stringAggFunction = dbConfig.isProduction ? 
            'STRING_AGG(DISTINCT c.name, \', \')' : 
            'GROUP_CONCAT(DISTINCT c.name)';
        const courseTypesAggFunction = dbConfig.isProduction ? 
            'STRING_AGG(DISTINCT c.course_type, \', \')' : 
            'GROUP_CONCAT(DISTINCT c.course_type)';
        
        // Get all students with their registration history
        const studentsWithHistory = await dbConfig.all(`
            SELECT 
                s.id,
                s.first_name,
                s.last_name,
                s.email,
                s.instagram_handle,
                s.student_type,
                s.admin_classified,
                s.created_at,
                COUNT(r.id) as total_registrations,
                COUNT(CASE WHEN c.course_type = 'crew_practice' THEN 1 END) as crew_practice_registrations,
                COUNT(CASE WHEN c.course_type != 'crew_practice' THEN 1 END) as other_registrations,
                ${stringAggFunction} as course_names,
                ${courseTypesAggFunction} as course_types
            FROM students s
            LEFT JOIN registrations r ON s.id = r.student_id
            LEFT JOIN courses c ON r.course_id = c.id
            GROUP BY s.id, s.first_name, s.last_name, s.email, s.instagram_handle, 
                     s.student_type, s.admin_classified, s.created_at
            ORDER BY s.created_at ASC
        `);
        
        console.log(`\n📊 Found ${studentsWithHistory.length} students to analyze`);
        
        const suggestions = [];
        let crewMemberSuggestions = 0;
        let generalStudents = 0;
        let alreadyClassified = 0;
        let noRegistrationHistory = 0;
        
        for (const student of studentsWithHistory) {
            const isAlreadyClassified = dbConfig.isProduction ? 
                student.admin_classified : 
                Boolean(student.admin_classified);
            
            const crewPracticeCount = Number(student.crew_practice_registrations || 0);
            const otherCount = Number(student.other_registrations || 0);
            const totalCount = Number(student.total_registrations || 0);
            
            let suggestion = {
                id: student.id,
                firstName: student.first_name || '',
                lastName: student.last_name || '',
                email: student.email,
                instagramHandle: student.instagram_handle || '',
                currentType: student.student_type,
                alreadyClassified: isAlreadyClassified,
                totalRegistrations: totalCount,
                crewPracticeRegistrations: crewPracticeCount,
                otherRegistrations: otherCount,
                courseNames: student.course_names || '',
                courseTypes: student.course_types || '',
                suggestedType: student.student_type, // default to current
                reason: '',
                action: 'no_change'
            };
            
            // Classification logic
            if (isAlreadyClassified) {
                suggestion.reason = 'Already admin classified';
                suggestion.action = 'already_classified';
                alreadyClassified++;
            } else if (totalCount === 0) {
                suggestion.reason = 'No registration history';
                suggestion.action = 'no_change';
                noRegistrationHistory++;
            } else if (crewPracticeCount > 0) {
                suggestion.suggestedType = 'crew_member';
                suggestion.reason = `Registered for ${crewPracticeCount} crew practice course(s): ${student.course_names}`;
                suggestion.action = 'suggest_crew_member';
                crewMemberSuggestions++;
            } else {
                suggestion.suggestedType = 'general';
                suggestion.reason = `Only registered for general classes: ${student.course_names}`;
                suggestion.action = 'keep_general';
                generalStudents++;
            }
            
            suggestions.push(suggestion);
        }
        
        // Print summary
        console.log('\n📋 CLASSIFICATION ANALYSIS SUMMARY');
        console.log('==================================');
        console.log(`Total students analyzed: ${studentsWithHistory.length}`);
        console.log(`🏆 Suggested for crew_member: ${crewMemberSuggestions}`);
        console.log(`👤 Keeping as general: ${generalStudents}`);
        console.log(`✅ Already classified: ${alreadyClassified}`);
        console.log(`❓ No registration history: ${noRegistrationHistory}`);
        
        // Show detailed suggestions for crew members
        console.log('\n🏆 CREW MEMBER SUGGESTIONS');
        console.log('=========================');
        
        const crewSuggestions = suggestions.filter(s => s.action === 'suggest_crew_member');
        if (crewSuggestions.length === 0) {
            console.log('No crew member suggestions found.');
        } else {
            crewSuggestions.forEach((student, index) => {
                const name = `${student.firstName} ${student.lastName}`.trim() || 'Unknown Name';
                const instagram = student.instagramHandle ? ` (@${student.instagramHandle})` : '';
                console.log(`${index + 1}. ${name}${instagram}`);
                console.log(`   Email: ${student.email}`);
                console.log(`   Current: ${student.currentType} → Suggested: ${student.suggestedType}`);
                console.log(`   Reason: ${student.reason}`);
                console.log(`   Registrations: ${student.crewPracticeRegistrations} crew practice, ${student.otherRegistrations} other`);
                console.log('');
            });
        }
        
        // Option to save suggestions to file for admin review
        console.log('\n💾 SAVING ANALYSIS RESULTS');
        console.log('==========================');
        
        const analysisResult = {
            timestamp: new Date().toISOString(),
            summary: {
                totalStudents: studentsWithHistory.length,
                crewMemberSuggestions,
                generalStudents,
                alreadyClassified,
                noRegistrationHistory
            },
            suggestions: suggestions
        };
        
        // Save to a JSON file for admin interface to read
        const fs = require('fs');
        const outputPath = 'scripts/classification-analysis.json';
        fs.writeFileSync(outputPath, JSON.stringify(analysisResult, null, 2));
        console.log(`✅ Analysis saved to: ${outputPath}`);
        
        console.log('\n🎯 NEXT STEPS');
        console.log('=============');
        console.log('1. Review the crew member suggestions above');
        console.log('2. Use the admin interface to approve/reject suggestions');
        console.log('3. Classifications will be applied to the database');
        console.log('4. Enhanced crew member visibility will be available in admin portal');
        
        return analysisResult;
        
    } catch (error) {
        console.error('❌ Classification analysis failed:', error);
        throw error;
    } finally {
        if (dbConfig) {
            await dbConfig.close();
        }
    }
}

// Run the analysis if script is executed directly
if (require.main === module) {
    classifyHistoricalStudents()
        .then((result) => {
            console.log('\n🎉 Historical student classification analysis completed!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Analysis failed:', error);
            process.exit(1);
        });
}

module.exports = { classifyHistoricalStudents };
