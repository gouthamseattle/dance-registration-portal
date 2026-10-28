/**
 * "My classes" page for students: sign in with email, then see upcoming and
 * past classes, payment status, waitlists, and edit basic details.
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
    pending: ['Payment being checked', 'wait'],
    canceled: ['Canceled', 'off'],
    failed: ['Payment problem', 'off']
  };

  function classCard(r) {
    const [label, cls] = STATUS[r.payment_status] || [r.payment_status || '', 'off'];
    const ds = regDates(r);
    const meta = [C.formatDates(ds), C.timeRange(r), C.location(r)].filter(Boolean).join(' · ');
    const extra = [r.instructor ? `with ${r.instructor}` : '', r.combo_name ? `Part of ${r.combo_name}` : ''].filter(Boolean).join(' · ');
    return `
      <article class="card class-item">
        <div class="top">
          <h3>${esc(r.course_name || 'Class')}</h3>
          <span class="status ${cls}">${esc(label)}</span>
        </div>
        ${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
        ${extra ? `<div class="meta">${esc(extra)}</div>` : ''}
      </article>`;
  }

  function render(data) {
    const st = data.student;
    $('hello').textContent = `Hi ${st.first_name || 'there'}`;
    $('who').textContent = [st.email, st.student_type === 'crew_member' ? 'Crew member' : 'GouMo student'].join(' · ');

    const now = today();
    const live = data.registrations.filter((r) => r.payment_status !== 'canceled');
    const isUpcoming = (r) => { const ds = regDates(r); return !ds.length || ds[ds.length - 1] >= now; };
    const upcoming = live.filter(isUpcoming).sort((a, b) => (regDates(a)[0] || '').localeCompare(regDates(b)[0] || ''));
    const past = data.registrations.filter((r) => !upcoming.includes(r));

    $('statClasses').textContent = data.totals.classes_paid;
    $('statUpcoming').textContent = upcoming.length;
    $('statWaitlists').textContent = data.waitlists.length;

    $('upcoming').innerHTML = upcoming.length ? upcoming.map(classCard).join('')
      : '<p class="empty">No upcoming classes. <a class="accent" href="/#classes">See what\'s on</a>.</p>';
    $('past').innerHTML = past.length ? past.map(classCard).join('') : '<p class="empty">Nothing here yet.</p>';
    $('waitlistBlock').hidden = !data.waitlists.length;
    $('waitlists').innerHTML = data.waitlists.map((w) => `
      <article class="card class-item"><div class="top"><h3>${esc(w.course_name)}</h3><span class="status wait">#${esc(w.position)} on the waitlist</span></div>
      <div class="meta">We'll email you if a spot opens.</div></article>`).join('');

    $('firstName').value = st.first_name || '';
    $('lastName').value = st.last_name || '';
    $('instagram').value = st.instagram_handle || '';
    $('experience').value = st.dance_experience || '';

    $('signIn').hidden = true;
    $('profile').hidden = false;
  }

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

  $('signInForm').addEventListener('submit', (e) => { e.preventDefault(); load($('email').value.trim()); });
  $('signOut').addEventListener('click', () => {
    remember(''); email = '';
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
