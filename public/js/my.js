/**
 * "My classes" page for students: sign in with email, then see the next class,
 * upcoming dates, history and (crew members) crew progress, and edit basic details.
 * The email is remembered on this phone (localStorage) for next time.
 */
(function () {
  const C = window.ClassInfo;
  const esc = C.esc;
  const KEY = 'goumo_email';
  let email = '';

  const $ = (id) => document.getElementById(id);
  function remember(value) { try { value ? localStorage.setItem(KEY, value) : localStorage.removeItem(KEY); } catch (e) { /* private mode */ } }
  function remembered() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

  // The dates a registration covers: picked dates, else all the class's dates
  function regDates(r) {
    try { const picked = JSON.parse(r.selected_dates || 'null'); if (Array.isArray(picked) && picked.length) return picked.map(String).sort(); } catch (e) { /* ignore */ }
    return C.dates(r);
  }

  const STATUS = {
    completed: ['Confirmed', 'ok'],
    pending: ['Checking payment', 'wait'],
    failed: ['Payment problem', 'off']
  };
  const chip = (r) => { const [t, c] = STATUS[r.payment_status] || ['Registered', 'ok']; return `<span class="status ${c}">${esc(t)}</span>`; };

  // Consistency badge levels (attendance % since joining the crew)
  const LEVELS = [
    { name: 'Legend', min: 90, range: '90% and above', bg: 'radial-gradient(circle at 35% 30%, #FFF3A6, #E0B400)', ring: '#FFD60A' },
    { name: 'Pro', min: 80, range: '80–90%', bg: 'radial-gradient(circle at 35% 30%, #F4F6F8, #9DA3AB)', ring: '#C9CDD3' },
    { name: 'Committed', min: 70, range: '70–80%', bg: 'radial-gradient(circle at 35% 30%, #F0B784, #B5682F)', ring: '#D08A4E' },
    { name: 'Rising', min: 60, range: '60–70%', bg: 'radial-gradient(circle at 35% 30%, #BFD4F2, #5F86BF)', ring: '#7FA6D9' },
    { name: 'Warming up', min: 0, range: 'Below 60%', bg: 'radial-gradient(circle at 35% 30%, #8A8A94, #4A4A52)', ring: '#5C5C66', fg: '#F5F5F4' }
  ];
  const levelFor = (pct) => LEVELS.find((l) => pct >= l.min);
  const STAR = (w) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"/></svg>`;
  const medal = (l, cls) => `<span class="medal ${cls || ''}" style="--medal-bg:${l.bg};--medal-ring:${l.ring};--medal-fg:${l.fg || '#3A3D42'}">${STAR(cls ? 18 : 42)}</span>`;
  const monthYear = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const shortDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  function renderCrew(p) {
    const box = $('crewBox');
    if (!p) { box.hidden = true; return; }
    let badge = '';
    if (p.pct === null) {
      badge = `<div class="badge-text"><small>Consistency badge</small><span>Your badge appears after your first crew practice.</span></div>`;
    } else {
      const l = levelFor(p.pct);
      const idx = LEVELS.indexOf(l);
      const next = idx > 0 ? LEVELS[idx - 1] : null;
      badge = `<button type="button" class="badge-btn" id="badgeBtn" aria-haspopup="dialog">${medal(l)}
        <span class="badge-text"><small>Consistency badge</small><strong>${esc(l.name)}</strong>
        <span>${esc(l.range)}${next ? ` · Next: <b>${esc(next.name)}</b> at ${next.min}%+` : ' · Top level!'} ›</span></span></button>`;
    }
    const pct = p.pct === null ? 0 : p.pct;
    const rank = p.rank
      ? `<b class="hi">#${p.rank}</b><span>of ${p.ranked_count} in the crew</span>`
      : `<b class="na">Ranked after ${p.min_for_rank} practices</b><span>Your crew rank</span>`;
    box.innerHTML = `
      <p class="label">Your crew progress</p>
      ${badge}
      <div class="att">
        <div class="ring" style="background:conic-gradient(var(--accent) 0 ${pct}%, #2B2B32 ${pct}% 100%)"><span>${p.pct === null ? '–' : p.pct + '%'}</span></div>
        <div><strong>Attendance</strong><small>${p.held ? `${p.attended} of ${p.held} crew practices since you joined` : 'Starts with your first crew practice'}</small></div>
      </div>
      <div class="tiles">
        <div class="tile">${rank}</div>
        <div class="tile"><b>${p.attended}</b><span>crew practices</span></div>
        <div class="tile"><b>${p.classes}</b><span>classes</span></div>
      </div>`;
    box.hidden = false;
    const btn = $('badgeBtn');
    if (btn) btn.addEventListener('click', () => {
      const mine = levelFor(p.pct);
      $('levelsList').innerHTML = LEVELS.map((l) => `<div class="lvl${l === mine ? ' me' : ''}">${medal(l, 'sm')}<div><strong>${esc(l.name)}</strong><small>${esc(l.range)}</small></div>${l === mine ? '<em>You are here</em>' : ''}</div>`).join('');
      $('levelsSheet').hidden = false;
    });
  }

  // Calendar file for one class date (opens in the phone's calendar app)
  function icsFor(item) {
    const r = item.reg, s = (r.slots || [])[0] || {};
    const t = (v, def) => String(v || def).replace(/:/g, '').slice(0, 4).padEnd(4, '0') + '00';
    const day = item.date.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GouMo//Classes//EN', 'BEGIN:VEVENT',
      `UID:goumo-${r.id}-${day}@goumo`, `DTSTART;TZID=America/Los_Angeles:${day}T${t(s.start_time, '18:00')}`,
      `DTEND;TZID=America/Los_Angeles:${day}T${t(s.end_time || s.start_time, '19:00')}`,
      `SUMMARY:${(r.course_name || 'GouMo class').replace(/[,;\n]/g, ' ')}`,
      s.location ? `LOCATION:${String(s.location).replace(/[,;\n]/g, ' ')}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
    return URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  }

  function render(data) {
    const st = data.student;
    const p = data.crew_progress;
    $('hello').textContent = `Hi ${st.first_name || 'there'}`;
    $('who').textContent = st.student_type === 'crew_member'
      ? (p && p.since ? `Crew member since ${monthYear(p.since)}` : 'Crew member')
      : st.email;
    renderCrew(p);

    // Every class date the student is registered for (cancelled left out)
    const now = today();
    const items = [];
    data.registrations.filter((r) => r.payment_status !== 'canceled').forEach((r) => {
      const ds = regDates(r);
      if (!ds.length) { items.push({ date: String(r.registration_date || '').slice(0, 10), reg: r, n: 1, of: 1, undated: true }); return; }
      ds.forEach((d, k) => items.push({ date: d, reg: r, n: k + 1, of: ds.length }));
    });
    const upcoming = items.filter((x) => !x.undated && x.date >= now).sort((a, b) => a.date.localeCompare(b.date));
    const past = items.filter((x) => x.undated || x.date < now).sort((a, b) => b.date.localeCompare(a.date));
    const title = (x) => `${x.reg.course_name || 'Class'}${x.of > 1 && x.reg.course_type !== 'crew_practice' ? ` · ${x.n} of ${x.of}` : ''}`;
    const who = (x) => [C.timeRange(x.reg), x.reg.instructor ? `with ${x.reg.instructor}` : ''].filter(Boolean).join(' · ');

    // Next class
    const nx = upcoming[0];
    if (nx) {
      const days = Math.round((new Date(nx.date + 'T12:00:00') - new Date(now + 'T12:00:00')) / 86400000);
      const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      const loc = C.location(nx.reg);
      $('nextBox').innerHTML = `
        <div class="top"><span class="label" style="margin:0">Next class · ${esc(when)}</span>${chip(nx.reg)}</div>
        <h3>${esc(title(nx))}</h3>
        <p>${esc(C.formatOneDate(nx.date))}${C.timeRange(nx.reg) ? ' · ' + esc(C.timeRange(nx.reg)) : ''}<br>${esc([nx.reg.instructor ? 'with ' + nx.reg.instructor : '', loc].filter(Boolean).join(' · '))}</p>
        <div class="actions">
          <a class="btn btn-primary" href="${icsFor(nx)}" download="goumo-class.ics">Add to calendar</a>
          ${loc ? `<a class="btn btn-outline" href="https://maps.google.com/?q=${encodeURIComponent(loc)}" target="_blank" rel="noopener">Directions</a>` : ''}
        </div>`;
    }
    $('nextBox').hidden = !nx;

    // Coming up, grouped by week
    if (upcoming.length) {
      const groupOf = (d) => { const n = Math.round((new Date(d + 'T12:00:00') - new Date(now + 'T12:00:00')) / 86400000); return n < 7 ? 'This week' : n < 14 ? 'Next week' : 'Later'; };
      let last = '', html = '';
      upcoming.slice(0, 12).forEach((x) => {
        const g = groupOf(x.date);
        if (g !== last) { html += `<div class="week">${g}</div>`; last = g; }
        const dt = new Date(x.date + 'T12:00:00');
        html += `<div class="card date-row"><div class="day"><small>${dt.toLocaleDateString('en-US', { weekday: 'short' })}</small><b>${dt.getDate()}</b></div>
          <div class="what"><strong>${esc(title(x))}</strong><span>${esc(who(x))}</span></div>${chip(x.reg)}</div>`;
      });
      $('upcomingList').innerHTML = html;
    }
    $('upcomingBox').hidden = !upcoming.length;

    // History: newest first, five at a time
    let shown = 5;
    const drawHistory = () => {
      $('historyList').innerHTML = past.slice(0, shown).map((x) => `<div class="hist-row"><span>${esc(title(x))}</span><span>${x.undated ? '' : esc(shortDate(x.date))}</span></div>`).join('')
        + (past.length > shown ? `<button type="button" class="more-btn" id="moreHistory">Show all ${past.length}</button>` : '');
      const m = $('moreHistory'); if (m) m.addEventListener('click', () => { shown = past.length; drawHistory(); });
    };
    drawHistory();
    $('historyBox').hidden = !past.length;
    $('noClasses').hidden = items.length > 0;

    // Test accounts: remember it on this device so other pages let it through,
    // and offer a switch between crew member and GouMo student views
    const tester = st.is_tester === true || st.is_tester === 1 || st.is_tester === 't';
    try { tester ? localStorage.setItem('goumo_tester', '1') : localStorage.removeItem('goumo_tester'); } catch (e) { /* private mode */ }
    $('testerBox').hidden = !tester;
    document.querySelectorAll('#testerBox [data-as]').forEach((b) => {
      b.className = `btn ${b.dataset.as === (st.student_type === 'crew_member' ? 'crew_member' : 'general') ? 'btn-primary' : 'btn-outline'}`;
    });

    $('firstName').value = st.first_name || '';
    $('lastName').value = st.last_name || '';
    $('instagram').value = st.instagram_handle || '';
    $('experience').value = st.dance_experience || '';

    $('signIn').hidden = true;
    $('profile').hidden = false;
  }

  $('levelsClose').addEventListener('click', () => { $('levelsSheet').hidden = true; });
  $('levelsSheet').addEventListener('click', (e) => { if (e.target.id === 'levelsSheet') $('levelsSheet').hidden = true; });

  async function load(value) {
    const msg = $('signInMsg');
    msg.className = 'msg'; msg.textContent = 'Loading…';
    try {
      const res = await fetch('/api/my/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { msg.className = 'msg err'; msg.textContent = data.error || 'Something went wrong.'; remember(''); return; }
      email = value; remember(value); msg.textContent = '';
      render(data);
    } catch (e) {
      msg.className = 'msg err'; msg.textContent = 'Could not reach GouMo. Check your connection and try again.';
    }
  }

  $('testerBox').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-as]');
    if (!b) return;
    const res = await fetch('/api/my/tester-type', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, student_type: b.dataset.as })
    }).catch(() => null);
    $('testerMsg').className = res && res.ok ? 'msg ok' : 'msg err';
    $('testerMsg').textContent = res && res.ok ? 'Switched.' : 'Could not switch.';
    if (res && res.ok) load(email);
  });

  $('signInForm').addEventListener('submit', (e) => { e.preventDefault(); load($('email').value.trim()); });
  $('signOut').addEventListener('click', () => {
    remember(''); email = '';
    try { localStorage.removeItem('goumo_tester'); } catch (e2) { /* private mode */ }
    $('profile').hidden = true; $('signIn').hidden = false; $('email').value = '';
  });
  $('detailsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('detailsMsg');
    const res = await fetch('/api/my/profile', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, first_name: $('firstName').value, last_name: $('lastName').value, instagram_handle: $('instagram').value, dance_experience: $('experience').value })
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    msg.className = res && res.ok ? 'msg ok' : 'msg err';
    msg.textContent = res && res.ok ? 'Saved.' : (data.error || 'Could not save. Try again.');
    if (res && res.ok) $('hello').textContent = `Hi ${$('firstName').value || 'there'}`;
  });

  // Email saved on this phone (by this page or after checkout)
  const start = remembered();
  if (start) { $('email').value = start; load(start); }
})();
