/**
 * Attendance screen, shared by the full admin (Attendance tab) and the lite admin.
 * Everyone registered for a class date counts as "Attended"; tap "No show" for anyone
 * who didn't come (tap Attended to undo). Each tap saves straight away. "Done" records
 * that the class date was checked. Helpers only see the last 7 days (the server decides).
 * Styles: .att-* in site.css.
 *
 *   GouMoAttendance.mount(element, { helper: false })
 */
(function () {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE = { crew_practice: 'Crew practice', drop_in: 'Drop-in' };
  const dayLabel = (d, opts) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
  function timeLabel(t) {
    const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return '';
    const h = Number(m[1]);
    return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
  }
  function kicker(c, n, total) {
    const type = TYPE[c.course_type] || 'Series';
    return total > 1 ? `${type} · session ${n} of ${total}` : type;
  }
  async function api(method, url, body) {
    const res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
    return data;
  }

  function mount(root, opts) {
    const helper = !!(opts && opts.helper);
    root.classList.add('att-root');
    let showAll = false;

    function message(text) {
      root.innerHTML = `<p class="att-muted">${esc(text)}</p>`;
    }

    async function showList() {
      root.innerHTML = '<p class="att-muted">Loading classes…</p>';
      let data;
      try { data = await api('GET', '/api/attendance/classes' + (showAll ? '?all=1' : '')); }
      catch (e) { return message(e.message); }
      const rows = data.classes || [];
      root.innerHTML = `
        <p class="att-muted">Everyone counts as attended. Open a class to mark any no shows.</p>
        ${rows.length ? '' : `<p class="att-muted">${helper ? 'No classes in the last 7 days.' : 'No classes in this period.'}</p>`}
        <div class="att-classes">
          ${rows.map((c) => `
            <button type="button" class="att-class" data-id="${Number(c.course_id)}" data-date="${esc(c.date)}">
              <span class="att-class-text">
                <span class="att-kicker">${esc(kicker(c, c.session_number, c.session_count))}</span>
                <span class="att-class-name">${esc(c.name)}</span>
                <span class="att-class-sub">${esc(dayLabel(c.date))}${c.start_time ? ' · ' + esc(timeLabel(c.start_time)) : ''} · ${Number(c.registered)} registered</span>
              </span>
              <span class="att-pill ${c.checked ? 'att-pill-done' : 'att-pill-todo'}">${c.checked ? 'Checked' : 'Not checked'}</span>
            </button>`).join('')}
        </div>
        ${helper ? '<p class="att-faint">Helpers can mark classes from the last 7 days.</p>'
          : `<button type="button" class="att-link" id="attMore">${showAll ? 'Show the last 30 days only' : 'Show older classes'}</button>`}`;
      root.querySelectorAll('.att-class').forEach((b) => b.addEventListener('click', () => showSession(b.dataset.id, b.dataset.date)));
      const more = root.querySelector('#attMore');
      if (more) more.addEventListener('click', () => { showAll = !showAll; showList(); });
    }

    async function showSession(courseId, date) {
      root.innerHTML = '<p class="att-muted">Loading…</p>';
      let d;
      try { d = await api('GET', `/api/attendance/course/${encodeURIComponent(courseId)}${date ? '?date=' + encodeURIComponent(date) : ''}`); }
      catch (e) { return message(e.message); }
      const people = d.people || [];
      const render = () => {
        const missed = people.filter((p) => p.no_show).length;
        root.innerHTML = `
          <button type="button" class="att-link att-back" id="attBack">← All classes</button>
          <div>
            <span class="att-kicker">${esc(kicker(d.course, d.session_number, d.course.session_count))}</span>
            <h2 class="att-title">${esc(d.course.name)}</h2>
          </div>
          <div class="att-dates" role="group" aria-label="Class date">
            ${d.dates.map((x) => `<button type="button" class="att-date${x.date === d.date ? ' is-on' : ''}" data-date="${esc(x.date)}">${esc(dayLabel(x.date, { month: 'short', day: 'numeric' }))}${x.checked ? ' ✓' : ''}</button>`).join('')}
            ${(d.future_dates || []).slice(0, 3).map((x) => `<span class="att-date is-future">${esc(dayLabel(x, { month: 'short', day: 'numeric' }))}</span>`).join('')}
          </div>
          <div class="att-help">Everyone starts as <strong class="att-yes">Attended</strong>. For anyone who didn't show up, tap <strong class="att-no">No show</strong> on their row. Tap Attended to undo. It saves by itself.</div>
          <div class="att-people">
            ${people.map((p, i) => `
              <div class="att-person">
                <span class="att-name${p.no_show ? ' is-missed' : ''}">${esc(p.name)}</span>
                <span class="att-toggle" role="group" aria-label="Attendance for ${esc(p.name)}">
                  <button type="button" class="att-opt${p.no_show ? '' : ' is-yes'}" data-i="${i}" data-v="0" aria-pressed="${!p.no_show}">Attended</button>
                  <button type="button" class="att-opt${p.no_show ? ' is-no' : ''}" data-i="${i}" data-v="1" aria-pressed="${!!p.no_show}">No show</button>
                </span>
              </div>`).join('')}
          </div>
          <p class="att-summary">${missed ? `${people.length - missed} attended · ${missed} no show` : 'Everyone attended'}</p>
          <button type="button" class="att-done" id="attDone">Done · mark as checked</button>
          <p class="att-faint att-center" id="attChecked">${d.checked ? `Checked by ${esc(d.checked.by === 'admin' ? 'Goutham' : d.checked.by)}${d.checked.at ? ' · ' + esc(new Date(String(d.checked.at).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d.checked.at)) ? '' : 'Z')).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ''}` : 'Not checked yet'}</p>`;
        root.querySelector('#attBack').addEventListener('click', showList);
        root.querySelectorAll('.att-date[data-date]').forEach((b) => b.addEventListener('click', () => showSession(courseId, b.dataset.date)));
        root.querySelectorAll('.att-opt').forEach((b) => b.addEventListener('click', async () => {
          const p = people[Number(b.dataset.i)];
          const want = b.dataset.v === '1';
          if (p.no_show === want) return;
          p.no_show = want; render();
          try { await api('PUT', `/api/attendance/course/${encodeURIComponent(courseId)}/mark`, { date: d.date, registration_id: p.registration_id, no_show: want }); }
          catch (e) { p.no_show = !want; render(); alertMsg(e.message); }
        }));
        root.querySelector('#attDone').addEventListener('click', async (ev) => {
          ev.target.disabled = true;
          try {
            await api('POST', `/api/attendance/course/${encodeURIComponent(courseId)}/check`, { date: d.date });
            showList();
          } catch (e) { ev.target.disabled = false; alertMsg(e.message); }
        });
      };
      const alertMsg = (text) => {
        const s = root.querySelector('.att-summary');
        if (s) { s.textContent = text; s.classList.add('att-no'); }
      };
      render();
      window.scrollTo(0, 0);
    }

    showList();
    return { refresh: showList };
  }

  window.GouMoAttendance = { mount };
})();
