/**
 * Shared class formatting for the student pages (home, sign-up, checkout).
 * One place decides how dates, times, fees and labels are shown, so every
 * page describes a class the same way.  Exposed as window.ClassInfo.
 */
(function () {
  const TYPE_LABELS = { 'multi-week': 'Series', 'choreography': 'Series', 'drop_in': 'Drop-in', 'crew_practice': 'Crew practice' };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 'YYYY-MM-DD' -> local Date (avoids the off-by-one-day timezone problem)
  function toDate(d) {
    if (!d) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const parsed = new Date(d);
    return isNaN(parsed) ? null : parsed;
  }
  function iso(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  // "19:00" or "19:00:00" -> "7:00 PM"
  function formatTime(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return t || '';
    let h = Number(m[1]);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${suffix}`;
  }

  // The class's dates as 'YYYY-MM-DD' strings.  New classes store them in
  // session_dates; older classes fall back to the slot date or weekly dates
  // from start_date for duration_weeks.
  function dates(course) {
    let list = course.session_dates;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
    if (Array.isArray(list) && list.length) return list.map((d) => String(d).slice(0, 10)).sort();
    const slot = (course.slots || [])[0] || {};
    if (slot.practice_date) return [String(slot.practice_date).slice(0, 10)];
    const start = toDate(course.start_date);
    if (!start) return [];
    const weeks = Math.max(1, Math.min(Number(course.duration_weeks) || 1, 26));
    return Array.from({ length: weeks }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i)));
  }

  // ["2026-11-04","2026-11-11"] -> "Tue Nov 4, 11" (same month collapses)
  function formatDates(list) {
    const ds = list.map(toDate).filter(Boolean);
    if (!ds.length) return '';
    const day = ds[0].toLocaleDateString('en-US', { weekday: 'short' });
    const sameDay = ds.every((d) => d.getDay() === ds[0].getDay());
    const parts = [];
    let lastMonth = null;
    ds.forEach((d) => {
      const month = d.toLocaleDateString('en-US', { month: 'short' });
      parts.push(month === lastMonth ? String(d.getDate()) : `${month} ${d.getDate()}`);
      lastMonth = month;
    });
    const joined = parts.length === 2 ? parts.join(' & ') : parts.join(', ');
    return sameDay ? `${day} ${joined}` : joined;
  }
  function formatOneDate(d) {
    const date = toDate(d);
    return date ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  }

  function slot(course) { return (course.slots || [])[0] || {}; }
  function typeLabel(course) { return TYPE_LABELS[course.course_type] || 'Series'; }
  function timeRange(course) {
    const s = slot(course);
    const start = formatTime(s.start_time || course.start_time);
    const end = formatTime(s.end_time || course.end_time);
    return start && end ? `${start} – ${end}` : start;
  }
  function location(course) { return slot(course).location || course.location || ''; }
  function style(course) { return course.song_name || ''; }
  // Per-class registration switch (admin dashboard). Missing = open.
  function isOpen(course) { const v = course.registration_open; return !(v === false || v === 0 || v === '0' || v === 'false'); }
  function isPerDate(course) { return course.course_type === 'drop_in' || course.course_type === 'crew_practice'; }

  // Fees: full = all dates; perDate = optional per-date fee
  function fees(course) {
    const pricing = slot(course).pricing || {};
    const full = Number(course.full_course_price || pricing.full_package) || 0;
    const perDate = Number(course.per_class_price || pricing.drop_in) || 0;
    const n = dates(course).length;
    if (course.course_type === 'drop_in') {
      const each = perDate || (n ? full / n : full);
      return { full: full || each * Math.max(n, 1), perDate: each, headline: each, unit: n > 1 ? 'per date' : '' };
    }
    if (course.course_type === 'crew_practice') {
      const each = perDate || (n ? full / n : full);
      return { full: each * Math.max(n, 1), perDate: n > 1 ? each : 0, headline: each, unit: n > 1 ? 'per practice' : '' };
    }
    return { full, perDate, headline: full || perDate, unit: '' };
  }
  function feeText(course) {
    const f = fees(course);
    const n = dates(course).length;
    if (course.course_type === 'multi-week' || course.course_type === 'choreography') {
      return f.perDate ? `$${f.full} for all ${n} dates · $${f.perDate} per date` : `$${f.full} for all ${n} dates`;
    }
    if (course.course_type === 'drop_in' && n > 1) return `$${f.perDate} per date`;
    if (course.course_type === 'crew_practice' && n > 1) return `$${f.perDate} per practice`;
    return f.headline ? `$${f.headline}` : '';
  }

  // Detail rows used on cards and at checkout: [label, value]
  function rows(course) {
    const ds = dates(course);
    const out = [];
    if (ds.length) out.push([ds.length === 1 ? 'Date' : 'Dates', formatDates(ds)]);
    const t = timeRange(course); if (t) out.push(['Time', t]);
    const loc = location(course); if (loc) out.push(['Location', loc]);
    const fee = feeText(course); if (fee) out.push(['Fees', fee]);
    return out;
  }

  // "Series · 4 dates · House"
  function kicker(course) {
    const n = dates(course).length;
    const parts = [typeLabel(course)];
    if (n > 1) parts.push(`${n} dates`);
    if (style(course)) parts.push(style(course));
    return parts.join(' · ');
  }

  // Combos: one row per class ("House Level 1", "Tue Nov 4, 11 · 6:15 – 7:30 PM")
  function comboRows(classes) {
    return (classes || []).map((c) => [c.name, [formatDates(dates(c)), timeRange(c)].filter(Boolean).join(' · ')]);
  }
  function comboInstructors(classes) {
    return [...new Set((classes || []).map((c) => c.instructor).filter(Boolean))].join(' & ');
  }
  // "Combo · 2 classes · House"
  function comboKicker(classes) {
    const styles = [...new Set((classes || []).map(style).filter(Boolean))];
    return [`Combo · ${(classes || []).length} classes`, ...styles].join(' · ');
  }

  // Test account signed in on this device (set by the My classes page). Only
  // changes what the pages show; the server checks the real account.
  function isTesterDevice() { try { return localStorage.getItem('goumo_tester') === '1'; } catch (e) { return false; } }

  window.ClassInfo = { isTesterDevice, isOpen, comboRows, comboInstructors, comboKicker, esc, toDate, formatTime, formatDates, formatOneDate, dates, slot, typeLabel, timeRange, location, style, fees, feeText, rows, kicker, isPerDate };
})();
