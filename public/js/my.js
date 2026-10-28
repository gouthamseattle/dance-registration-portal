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

  // One line per class: name and status. Finished classes are shown as "Done".
  function row(name, label, cls, done) {
    return `<div class="class-row${done ? ' done' : ''}"><span class="name">${esc(name)}</span><span class="status ${cls}">${esc(label)}</span></div>`;
  }

  function render(data) {
    const st = data.student;
    $('hello').textContent = `Hi ${st.first_name || 'there'}`;
    $('who').textContent = [st.email, st.student_type === 'crew_member' ? 'Crew member' : 'GouMo student'].join(' · ');

    const now = today();
    const isFinished = (r) => { const ds = regDates(r); return ds.length > 0 && ds[ds.length - 1] < now; };
    const upcoming = data.registrations.filter((r) => r.payment_status !== 'canceled' && !isFinished(r));

    // Crew members: crew practice is counted apart from regular classes,
    // and finished practices collapse into one "Crew practice" line.
    const isCrewPractice = (r) => r.course_type === 'crew_practice';
    const showCrew = st.student_type === 'crew_member' || data.registrations.some(isCrewPractice);
    $('statClasses').textContent = showCrew ? data.totals.regular_classes : data.totals.classes_paid;
    $('statThirdLabel').textContent = showCrew ? 'Crew practice' : 'Waitlists';
    $('statWaitlists').textContent = showCrew ? data.totals.crew_practices : data.waitlists.length;
    $('statUpcoming').textContent = upcoming.length;

    const sorted = [...data.registrations].sort((a, b) => (regDates(b)[0] || '').localeCompare(regDates(a)[0] || ''));
    const donePractices = showCrew ? sorted.filter((r) => isCrewPractice(r) && isFinished(r) && r.payment_status === 'completed') : [];
    const listed = sorted.filter((r) => !donePractices.includes(r));
    const rows = [
      ...data.waitlists.map((w) => row(w.course_name, `Waitlist #${w.position}`, 'wait', false)),
      ...(donePractices.length ? [row('Crew practice', `${donePractices.length} attended`, 'ok', false)] : []),
      ...listed.map((r) => {
        const finished = isFinished(r) && r.payment_status === 'completed';
        const [label, cls] = finished ? ['Done', 'off'] : (STATUS[r.payment_status] || [r.payment_status || '', 'off']);
        return row(r.course_name || 'Class', label, cls, finished || r.payment_status === 'canceled');
      })
    ];
    $('classList').innerHTML = rows.length ? rows.join('')
      : '<p class="empty">No classes yet. <a class="accent" href="/#classes">See what\'s on</a>.</p>';

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
