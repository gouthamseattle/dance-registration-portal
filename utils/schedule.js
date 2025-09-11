/* Helper: format YYYY-MM-DD as local date without timezone shift */
function formatLocalDate(dateStr) {
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
    : new Date(dateStr).toLocaleDateString();
}

/**
 * Compute schedule_info for a course given its slots, mirroring the server's GET /api/courses logic.
 * @param {Object} course - Course row with start_date, end_date, schedule_info (legacy)
 * @param {Array} slots - Array of slot rows with day_of_week, start_time, end_time, location
 * @returns {string}
 */
function computeScheduleInfo(course = {}, slots = []) {
  if (!Array.isArray(slots)) slots = [];

  const scheduleItems = slots.map((s) => {
    if (!s) return '';
    const parts = [];
    if (course.course_type === 'crew_practice' && s.practice_date) {
      const dateStr = formatLocalDate(s.practice_date);
      parts.push(dateStr);
    } else if (s.day_of_week) {
      parts.push(`${s.day_of_week}s`);
    }
    const st = s.start_time;
    const et = s.end_time;
    if (st && et) {
      parts.push(`${st} - ${et}`);
    } else if (st) {
      parts.push(st);
    }
    if (s.location) parts.push(`at ${s.location}`);
    return parts.join(' ');
  }).filter(Boolean);

  if (scheduleItems.length > 0) {
    let dateInfo = '';
    const hasPracticeDates = Array.isArray(slots) && slots.some(s => !!s?.practice_date);
    if (!hasPracticeDates) {
      if (course.start_date && course.end_date) {
        const startDate = formatLocalDate(course.start_date);
        const endDate = formatLocalDate(course.end_date);
        dateInfo = ` (${startDate} - ${endDate})`;
      } else if (course.start_date) {
        const startDate = formatLocalDate(course.start_date);
        dateInfo = ` (Starts ${startDate})`;
      }
    }
    return scheduleItems.join(' | ') + dateInfo;
  }

  // Fallback to any legacy course.schedule_info if slots are missing
  return course.schedule_info || '';
}

/**
 * Fetch course and its slots from DB, and compute schedule_info consistently.
 * @param {import('../database-config')} dbConfig - DatabaseConfig instance
 * @param {number|string} courseId
 * @returns {Promise<{course: Object, slots: Array, schedule_info: string}>}
 */
async function fetchCourseWithSlots(dbConfig, courseId) {
  const course = await dbConfig.get('SELECT * FROM courses WHERE id = $1', [courseId]);
  const slots = await dbConfig.all(`
    SELECT cs.*
    FROM course_slots cs
    WHERE cs.course_id = $1
    ORDER BY cs.created_at ASC
  `, [courseId]);

  const schedule_info = computeScheduleInfo(course || {}, slots || []);
  return { course, slots, schedule_info };
}

module.exports = {
  computeScheduleInfo,
  fetchCourseWithSlots
};
