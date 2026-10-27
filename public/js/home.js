/**
 * GouMo home page: shows this session's classes from the server,
 * or the "next session" message when registration is closed.
 * Register buttons hand off to the registration flow with the class preselected.
 */
(function () {
  const TYPE_LABELS = {
    'multi-week': 'Series',
    'choreography': 'Series',
    'drop_in': 'Drop-in',
    'crew_practice': 'Crew practice'
  };
  const FILTERS = ['All', 'Series', 'Drop-in', 'Crew practice'];

  let courses = [];
  let activeFilter = 'All';

  // Never insert server text as HTML without escaping it first.
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // "19:00" -> "7:00 PM"; leaves already-formatted times alone.
  function formatTime(t) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ''));
    if (!m) return t || '';
    let h = Number(m[1]);
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m[2]} ${suffix}`;
  }

  // Parse "YYYY-MM-DD" as a local date (avoids the off-by-one-day timezone bug).
  function formatDate(d) {
    if (!d) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function typeLabel(course) {
    return TYPE_LABELS[course.course_type] || 'Series';
  }

  function summaryLine(course) {
    const slot = (course.slots || [])[0] || {};
    const parts = [];
    if (slot.day_of_week) parts.push(slot.day_of_week);
    if (slot.start_time) parts.push(formatTime(slot.start_time));
    const start = formatDate(course.start_date || slot.practice_date);
    if (start) parts.push(course.course_type === 'drop_in' || course.course_type === 'crew_practice' ? start : `from ${start}`);
    return parts.join(' · ');
  }

  function priceHtml(course) {
    const isPerClass = course.course_type === 'drop_in' || course.course_type === 'crew_practice';
    const amount = isPerClass ? (course.per_class_price || course.full_course_price) : (course.full_course_price || course.per_class_price);
    if (!amount) return '';
    return `$${Number(amount).toFixed(0)}${isPerClass && (course.slots || []).length > 1 ? '<small>per class</small>' : ''}`;
  }

  function cardHtml(course) {
    const label = typeLabel(course);
    const slots = course.slots || [];
    const count = course.course_type === 'drop_in' && slots.length > 1 ? ` · ${slots.length} classes`
      : (label === 'Series' && course.duration_weeks > 1 ? ` · ${course.duration_weeks} classes` : '');
    const level = slots[0]?.difficulty_level ? ` · ${esc(slots[0].difficulty_level)}` : '';
    const crewOnly = course.required_student_type === 'crew_member' ? '<span class="badge">Crew only</span>' : '';
    const spots = Number(course.available_spots);
    const isFull = Number.isFinite(spots) && spots <= 0;
    const registerUrl = `/email-profile.html?course=${encodeURIComponent(course.id)}`;
    const detailsId = `details-${course.id}`;
    const location = slots[0]?.location ? `<p class="muted">${esc(slots[0].location)}</p>` : '';

    return `
      <article class="card class-card" data-type="${esc(label)}">
        <div class="top">
          <div>
            <span class="type">${esc(label)}${count}${level} ${crewOnly}</span>
            <h3>${esc(course.name)}</h3>
            <span class="when">${esc(summaryLine(course))}</span>
          </div>
          <span class="price">${isFull ? '<small>Full</small>' : priceHtml(course)}</span>
        </div>
        <div class="details" id="${detailsId}">
          ${course.description ? `<p>${esc(course.description)}</p>` : ''}
          ${course.schedule_info ? `<p class="sched">${esc(course.schedule_info)}</p>` : ''}
          ${location}
          ${!isFull && Number.isFinite(spots) && spots <= 5 ? `<p class="accent">Only ${spots} spot${spots === 1 ? '' : 's'} left</p>` : ''}
        </div>
        <div class="actions">
          <button type="button" class="details-btn" aria-expanded="false" aria-controls="${detailsId}">
            Details <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
          </button>
          ${isFull
            ? `<a class="btn btn-outline" href="${registerUrl}">Join waitlist</a>`
            : `<a class="btn btn-primary" href="${registerUrl}">Register</a>`}
        </div>
      </article>`;
  }

  function renderFilters() {
    const present = new Set(courses.map(typeLabel));
    const options = FILTERS.filter((f) => f === 'All' || present.has(f));
    const el = document.getElementById('filters');
    el.hidden = options.length <= 2; // no point filtering a single type
    el.innerHTML = options.map((f) => `<button type="button" class="filter" aria-pressed="${f === activeFilter}">${esc(f)}</button>`).join('');
  }

  function renderClasses() {
    const grid = document.getElementById('classGrid');
    const shown = activeFilter === 'All' ? courses : courses.filter((c) => typeLabel(c) === activeFilter);
    grid.innerHTML = shown.length
      ? shown.map(cardHtml).join('')
      : '<p class="empty">No classes in this category right now.</p>';
  }

  function showClosed() {
    document.getElementById('closedView').hidden = false;
    document.getElementById('loadingMsg').hidden = true;
  }

  async function load() {
    const loading = document.getElementById('loadingMsg');
    try {
      const settings = await fetch('/api/settings').then((r) => r.json());
      if (settings.registration_open !== 'true') {
        showClosed();
        return;
      }
      courses = await fetch('/api/courses?active_only=true&include_crew=true').then((r) => r.json());
      if (!Array.isArray(courses) || courses.length === 0) {
        showClosed();
        return;
      }
      document.getElementById('openView').hidden = false;
      renderFilters();
      renderClasses();
    } catch (err) {
      console.error('Failed to load classes', err);
      loading.textContent = 'Could not load classes. Please refresh the page.';
      return;
    }
    loading.hidden = true;
  }

  // Clicks: filters and Details toggles (one listener for the whole section).
  document.getElementById('classes').addEventListener('click', (e) => {
    const filter = e.target.closest('.filter');
    if (filter) {
      activeFilter = filter.textContent;
      renderFilters();
      renderClasses();
      return;
    }
    const toggle = e.target.closest('.details-btn');
    if (toggle) {
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('open', open);
    }
  });

  // Show the small header logo once the big logo scrolls out of view.
  const hero = document.getElementById('heroLogo');
  const header = document.getElementById('siteHeader');
  if ('IntersectionObserver' in window && hero) {
    new IntersectionObserver(([entry]) => header.classList.toggle('scrolled', !entry.isIntersecting)).observe(hero);
  }

  load();
})();
