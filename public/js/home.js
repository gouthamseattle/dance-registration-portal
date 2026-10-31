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

  // ---------- Instructor bios (tap a card on the home page) ----------
  // Text from the instructors' own bios (Oct 2026). Tags = styles they teach.
  const INSTRUCTORS = {
    goutham: {
      name: 'Goutham', role: 'Founder · Head choreographer', years: '18+ years of dance experience',
      tags: ['Locking', 'Hip-hop', 'House', 'Choreography'],
      bio: 'Founder of GouMo Dance Chronicles and choreographer for Dreamers Dance Crew and Tapping Toez. Goutham has been dancing for over 18 years and choreographing since 2014, and judges inter-college and corporate dance competitions.',
      highlights: [
        'Best Choreographer, Chennai Super Dancers',
        'Winner, Chennai Super Dancers and Chennai Dance Championship',
        'Winner, Boom, Ripples, IDA Destiny, LimeLite and Street Thandav (Bangalore)',
        'Judge, multiple inter-college and corporate dance competitions'
      ]
    },
    monica: {
      name: 'Monica', role: 'Founder · Locking specialist', years: '10+ years of dance experience',
      tags: ['Locking', 'Choreography'],
      bio: 'Monica specializes in Locking and has trained with some of the best lockers from around the world. She is the founder and an instructor at GouMo Dance Chronicles and the founder of Dreamers Dance Crew, with over 10 years of dance experience as a lead dancer in championship-winning teams.',
      highlights: [
        'Trained in Locking with leading lockers from around the world',
        'Lead dancer in championship-winning teams across college, corporate and professional competitions',
        'Winner, NIIT Festember, Chennai Super Dancers, Chennai Dance Championship, Boom, IDA Destiny, LimeLite and Street Thandav',
        'Represented Insiders Dance Crew, Tapping Toez and Dreamers Dance Crew'
      ]
    },
    rudie: {
      name: 'Rudie', role: 'Instructor', years: '7+ years of dance experience',
      tags: ['Choreography'],
      bio: 'Rudie started his dance journey in India and continued pursuing his passion after moving to Seattle. With over 7 years of experience, he has performed in various competitions and showcases and started his teaching journey this year.',
      highlights: []
    },
    supriya: {
      name: 'Supriya', role: 'Instructor', years: '3+ years of dance experience',
      tags: ['Choreography'],
      bio: 'Supriya started her professional dance journey 3 years ago and has performed in various showcases across Seattle. She is trained in Locking, House and Hip-hop, and is the first student turned instructor at GouMo Dance Chronicles.',
      highlights: []
    }
  };

  // Open classes whose instructor field names this person
  function classesWith(name) {
    const re = new RegExp('\\b' + name + '\\b', 'i');
    return courses.filter((c) => c.instructor && re.test(c.instructor) && (C.isTesterDevice() || C.isOpen(c)));
  }

  function openBio(key) {
    const p = INSTRUCTORS[key];
    if (!p) return;
    const esc = C.esc;
    const list = classesWith(p.name);
    document.getElementById('bioBody').innerHTML = `
      <div class="bio-head">
        <img src="/images/${key}.jpg" alt="">
        <div><h2 id="bioName">${esc(p.name)}</h2><span class="role">${esc(p.role)}</span><span class="years">${esc(p.years)}</span></div>
        <button type="button" class="bio-close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      <p class="bio-text">${esc(p.bio)}</p>
      ${p.highlights.length ? `<div><p class="bio-label">Highlights</p><ul class="bio-highlights">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>` : ''}
      <div>
        <p class="bio-label">Classes with ${esc(p.name)}</p>
        ${list.length ? list.map((c) => {
          const f = C.fees(c);
          const when = C.formatDates(C.dates(c));
          const sub = [when, f.headline ? `$${Number(f.headline).toFixed(0)}${f.unit || ''}` : ''].filter(Boolean).join(' · ');
          return `<div class="bio-class"><div><strong>${esc(c.name)}</strong><span>${esc(sub)}</span></div><a class="btn btn-primary" href="/email-profile.html?course=${encodeURIComponent(c.id)}">Register</a></div>`;
        }).join('') : '<p class="bio-none">No classes open right now. Follow <a href="https://instagram.com/goumo_dancechronicles">@goumo_dancechronicles</a> for the next one.</p>'}
      </div>`;
    const sheet = document.getElementById('bioSheet');
    sheet.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.querySelector('.bio-close').focus();
  }

  function closeBio() {
    document.getElementById('bioSheet').hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-person]').forEach((b) => b.addEventListener('click', () => openBio(b.dataset.person)));
  document.getElementById('bioSheet').addEventListener('click', (e) => {
    if (e.target.id === 'bioSheet' || e.target.closest('.bio-close')) closeBio();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeBio(); });

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
