/**
 * GouMo home page: shows this session's classes from the server,
 * or the "next session" message when registration is closed.
 * Register buttons hand off to the registration flow with the class preselected.
 * Formatting of dates, times and fees lives in class-info.js (window.ClassInfo).
 */
(function () {
  const C = window.ClassInfo;
  const FILTERS = ['All', 'Combos', 'Series', 'Drop-in', 'Crew practice'];

  let courses = [];
  let combos = [];
  let activeFilter = 'All';

  function cardHtml(course) {
    const esc = C.esc;
    const crewOnly = course.required_student_type === 'crew_member' ? ' <span class="badge">Crew only</span>' : '';
    const spots = Number(course.available_spots);
    const isFull = Number.isFinite(spots) && spots <= 0;
    const tester = C.isTesterDevice();
    const isClosed = !tester && !C.isOpen(course);
    const f = C.fees(course);
    const registerUrl = `/email-profile.html?course=${encodeURIComponent(course.id)}`;
    const rows = C.rows(course).filter(([k]) => !(isFull && k === 'Fees'));
    if (isClosed) rows.push(['Status', 'Registration closed']);
    else if (isFull) rows.push(['Status', 'Full · waitlist open']);
    const fewLeft = !isClosed && !isFull && Number.isFinite(spots) && spots <= 5;

    return `
      <article class="card class-card" data-type="${esc(C.typeLabel(course))}">
        <div class="top">
          <div>
            <span class="type">${esc(C.kicker(course))}${crewOnly}</span>
            <h3>${esc(course.name)}</h3>
            ${course.instructor ? `<span class="when">with ${esc(course.instructor)}</span>` : ''}
          </div>
          <span class="price">${f.headline ? `$${Number(f.headline).toFixed(0)}` : ''}${f.unit ? `<small>${esc(f.unit)}</small>` : ''}</span>
        </div>
        <dl class="rows">
          ${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
        </dl>
        ${course.description ? `<p class="desc">${esc(course.description)}</p>` : ''}
        <div class="actions">
          <span class="spots">${fewLeft ? `Only ${spots} spot${spots === 1 ? '' : 's'} left` : ''}</span>
          ${isClosed
            ? '<span class="btn btn-outline" aria-disabled="true">Registration closed</span>'
            : isFull && tester
            ? `<a class="btn btn-primary" href="${registerUrl}">Register (test)</a>`
            : isFull
            ? `<a class="btn btn-outline" href="${registerUrl}">Join waitlist</a>`
            : `<a class="btn btn-primary" href="${registerUrl}">Register</a>`}
        </div>
      </article>`;
  }

  // A combo: several classes at one price, registered with one payment
  function comboCardHtml(combo) {
    const esc = C.esc;
    const spots = Number(combo.available_spots);
    const isFull = Number.isFinite(spots) && spots <= 0;
    const who = C.comboInstructors(combo.classes);
    const crewOnly = combo.classes.some((c) => c.required_student_type === 'crew_member') ? ' <span class="badge">Crew only</span>' : '';
    const fewLeft = !isFull && Number.isFinite(spots) && spots <= 5;
    return `
      <article class="card class-card combo-card" data-type="Combos">
        <div class="top">
          <div>
            <span class="type">${esc(C.comboKicker(combo.classes))}${crewOnly}</span>
            <h3>${esc(combo.name)}</h3>
            ${who ? `<span class="when">with ${esc(who)}</span>` : ''}
          </div>
          <span class="price">$${Number(combo.price).toFixed(0)}${combo.savings > 0 ? `<small class="save">save $${Number(combo.savings).toFixed(0)}</small>` : ''}</span>
        </div>
        <dl class="rows">
          ${C.comboRows(combo.classes).map(([k, v]) => `<div class="stack"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          ${C.location(combo.classes[0] || {}) ? `<div><dt>Location</dt><dd>${esc(C.location(combo.classes[0]))}</dd></div>` : ''}
        </dl>
        ${combo.description ? `<p class="desc">${esc(combo.description)}</p>` : ''}
        <div class="actions">
          <span class="spots">${isFull ? 'Full' : fewLeft ? `Only ${spots} spot${spots === 1 ? '' : 's'} left` : 'One payment, all classes'}</span>
          ${isFull ? '' : `<a class="btn btn-primary" href="/email-profile.html?combo=${encodeURIComponent(combo.id)}">Register</a>`}
        </div>
      </article>`;
  }

  function renderFilters() {
    const present = new Set(courses.map(C.typeLabel));
    if (combos.length) present.add('Combos');
    const options = FILTERS.filter((f) => f === 'All' || present.has(f));
    const el = document.getElementById('filters');
    el.hidden = options.length <= 2; // no point filtering a single type
    el.innerHTML = options.map((f) => `<button type="button" class="filter" aria-pressed="${f === activeFilter}">${C.esc(f)}</button>`).join('');
  }

  function renderClasses() {
    const grid = document.getElementById('classGrid');
    const shownCombos = activeFilter === 'All' || activeFilter === 'Combos' ? combos : [];
    const shown = activeFilter === 'All' ? courses : courses.filter((c) => C.typeLabel(c) === activeFilter);
    grid.innerHTML = shown.length || shownCombos.length
      ? shownCombos.map(comboCardHtml).join('') + shown.map(cardHtml).join('')
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
      if (settings.registration_open !== 'true' && !C.isTesterDevice()) {
        showClosed();
        return;
      }
      [courses, combos] = await Promise.all([
        // Crew-only classes are not shown here; the crew uses the /crew link
        fetch('/api/courses?active_only=true').then((r) => r.json()),
        fetch('/api/combos').then((r) => (r.ok ? r.json() : [])).catch(() => [])
      ]);
      if (!Array.isArray(combos)) combos = [];
      combos = combos.filter((c) => !(c.classes || []).some((k) => k.required_student_type === 'crew_member'));
      if (!Array.isArray(courses) || courses.length === 0) {
        showClosed();
        return;
      }
      // Soonest classes first
      courses.sort((a, b) => (C.dates(a)[0] || '9999').localeCompare(C.dates(b)[0] || '9999'));
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

  document.getElementById('classes').addEventListener('click', (e) => {
    const filter = e.target.closest('.filter');
    if (filter) {
      activeFilter = filter.textContent;
      renderFilters();
      renderClasses();
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
