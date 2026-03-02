/**
 * Course Availability and Capacity Management Utilities
 */

/**
 * Calculate course availability with corrected capacity logic
 * - For choreography courses: counts both pending + completed (reserve on pending)
 * - For other courses: counts only completed (existing behavior)
 * 
 * @param {Object} dbConfig - Database configuration object
 * @param {number} courseId - Course ID to check
 * @param {string} courseType - Optional course type (will fetch if not provided)
 * @returns {Promise<Object>} - Object with capacity, registeredCount, available, courseType
 */
async function getCourseAvailability(dbConfig, courseId, courseType = null) {
    try {
        // Get course type if not provided
        if (!courseType) {
            const courseInfo = await dbConfig.get('SELECT course_type FROM courses WHERE id = $1', [courseId]);
            courseType = courseInfo?.course_type;
        }
        
        // Get minimum slot capacity (treats multi-week series as single seat per student)
        const capacityResult = await dbConfig.get(`
            SELECT MIN(cs.capacity) as course_capacity
            FROM course_slots cs
            WHERE cs.course_id = $1
        `, [courseId]);
        
        const capacity = Number(capacityResult?.course_capacity) || 0;
        
        // For choreography courses: count both pending and completed (reserve on pending)
        // For other courses: count only completed (existing behavior)
        let registrationResult;
        if (courseType === 'choreography') {
            registrationResult = await dbConfig.get(`
                SELECT COUNT(*) as registered_count
                FROM registrations r
                WHERE r.course_id = $1 
                AND r.payment_status IN ('pending', 'completed')
                AND r.payment_status != 'canceled'
            `, [courseId]);
        } else {
            registrationResult = await dbConfig.get(`
                SELECT COUNT(*) as registered_count
                FROM registrations r
                WHERE r.course_id = $1 AND r.payment_status = 'completed'
            `, [courseId]);
        }
        
        const registeredCount = Number(registrationResult?.registered_count) || 0;
        const available = Math.max(0, capacity - registeredCount);
        
        return {
            capacity,
            registeredCount,
            available,
            courseType
        };
    } catch (error) {
        console.error('❌ getCourseAvailability error for course', courseId, error);
        return { capacity: 0, registeredCount: 0, available: 0, courseType: null };
    }
}

/**
 * Format date to local date string without timezone shifts
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} - Formatted local date string
 */
function formatLocalDate(dateStr) {
    // Accept both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
        : (dateStr ? new Date(dateStr).toLocaleDateString() : '');
}

/**
 * Format date to short local date string (e.g., "Jan 15")
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} - Formatted short date string
 */
function formatLocalDateShort(dateStr) {
    // Accept both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : (dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
}

module.exports = {
    getCourseAvailability,
    formatLocalDate,
    formatLocalDateShort
};
