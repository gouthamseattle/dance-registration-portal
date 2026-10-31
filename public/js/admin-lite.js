// Lite admin (/admin-lite): approved helpers see a class's registrations,
// accept or cancel them, and download a CSV. The server decides which classes
// they may see (open, or closed in the last 7 days) and checks every action.
(function () {
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = (v) => (v === null || v === undefined || v === '') ? '' : '$' + Number(v).toFixed(Number(v) % 1 ? 2 : 0);
    const LABEL = { pending: 'Pending', completed: 'Paid', canceled: 'Cancelled' };

    const state = { email: '', needsPassword: false, classes: [], classId: null, regs: [], filter: 'all', cancelId: null };

    async function api(method, url, body) {
        const res = await fetch(url, {
            method, credentials: 'same-origin',
            headers: body ? { 'Content-Type': 'application/json' } : {},
            body: body ? JSON.stringify(body) : undefined
        });
        let data = null;
        try { data = await res.json(); } catch (e) { /* not JSON */ }
        if (res.status === 401 && !url.startsWith('/api/lite/')) { showSignin(); throw new Error('Please sign in again'); }
        if (!res.ok) throw new Error((data && data.error) || 'Something went wrong');
        return data;
    }

    function toast(msg) {
        const t = $('toast');
        t.textContent = msg; t.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
    }

    // ---------- Sign in ----------
    function showSignin() {
        $('app').hidden = true; $('signin').hidden = false;
        resetSignin();
    }
    function resetSignin() {
        state.needsPassword = false;
        $('stepEmail').hidden = false; $('stepPassword').hidden = true; $('confirmWrap').hidden = true;
        $('signinError').hidden = true; $('signinBtn').textContent = 'Continue';
        $('signinHint').hidden = false;
        $('signinSub').textContent = 'Sign in to see and manage class registrations';
        $('password').value = ''; $('password2').value = '';
    }
    function signinError(msg) { const e = $('signinError'); e.textContent = msg; e.hidden = false; }

    $('notYou').addEventListener('click', (e) => { e.preventDefault(); resetSignin(); $('email').focus(); });

    $('signinForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        $('signinError').hidden = true;
        const btn = $('signinBtn'); btn.disabled = true;
        try {
            if (!$('stepEmail').hidden) {
                const email = $('email').value.trim();
                if (!email) return signinError('Enter your email');
                const r = await api('POST', '/api/lite/check-email', { email });
                state.email = email; state.needsPassword = r.needs_password;
                $('emailShown').textContent = email;
                $('stepEmail').hidden = true; $('stepPassword').hidden = false; $('signinHint').hidden = true;
                $('confirmWrap').hidden = !r.needs_password;
                $('passwordLabel').textContent = r.needs_password ? 'New password' : 'Password';
                $('password').autocomplete = r.needs_password ? 'new-password' : 'current-password';
                $('signinBtn').textContent = r.needs_password ? 'Save and sign in' : 'Sign in';
                $('signinSub').textContent = r.needs_password ? "You're approved. Choose a password for next time." : 'Welcome back';
                $('password').focus();
                return;
            }
            const password = $('password').value;
            if (state.needsPassword) {
                if (password.length < 8) return signinError('Password must be at least 8 characters');
                if (password !== $('password2').value) return signinError("The two passwords don't match");
                await api('POST', '/api/lite/set-password', { email: state.email, password });
            } else {
                await api('POST', '/api/lite/login', { email: state.email, password });
            }
            await start();
        } catch (err) {
            signinError(err.message);
        } finally { btn.disabled = false; }
    });

    $('signOut').addEventListener('click', async () => {
        try { await api('POST', '/api/lite/logout'); } catch (e) { /* ignore */ }
        showSignin();
    });

    // ---------- Classes ----------
    function classDates(c) {
        let d = c.session_dates;
        try { d = typeof d === 'string' ? JSON.parse(d) : d; } catch (e) { d = []; }
        if (!Array.isArray(d) || !d.length) return '';
        return d.map(x => new Date(x + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ');
    }
    const isCrew = (c) => c.course_type === 'crew_practice' || c.required_student_type === 'crew_member';
    function classSub(c) {
        const bits = [];
        if (c.is_closed) bits.push('Closed ' + (c.registration_closed_at ? new Date(c.registration_closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''));
        const dates = classDates(c); if (dates) bits.push(dates);
        if (c.pending_count) bits.push(c.pending_count + ' pending');
        if (c.is_closed || !c.pending_count) bits.push(c.paid_count + ' paid');
        return bits.join(' · ');
    }

    async function loadClasses() {
        state.classes = await api('GET', '/api/lite/classes');
        if (state.classId && !state.classes.some(c => c.id === state.classId)) state.classId = null;
        if (!state.classId) {
            try { const saved = Number(localStorage.getItem('lite_class')); if (state.classes.some(c => c.id === saved)) state.classId = saved; } catch (e) { /* storage off */ }
        }
        renderPickerButton();
    }

    function renderPickerButton() {
        const c = state.classes.find(x => x.id === state.classId);
        $('pickerText').textContent = c ? c.name : (state.classes.length ? 'Pick a class' : 'No classes right now');
        $('classView').hidden = !c;
        $('emptyState').hidden = !!c;
        $('emptyState').textContent = state.classes.length ? 'Pick a class to see its registrations.' : 'There are no classes with registration open or closed in the last 7 days.';
    }

    function openPicker() {
        const row = (c) => `<button type="button" class="lite-class" data-id="${c.id}" ${c.id === state.classId ? 'aria-current="true"' : ''}>
            <span class="lite-class-text"><span class="lite-class-name">${esc(c.name)}</span><span class="lite-class-sub">${esc(classSub(c))}</span></span>
            ${isCrew(c) ? '<span class="lite-badge crew">Crew practice</span>' : ''}</button>`;
        const open = state.classes.filter(c => !c.is_closed), closed = state.classes.filter(c => c.is_closed);
        $('pickerList').innerHTML =
            (open.length ? `<p class="lite-group">Registration open</p>${open.map(row).join('')}` : '') +
            (closed.length ? `<p class="lite-group">Closed in the last 7 days</p>${closed.map(row).join('')}` : '') +
            (state.classes.length ? '' : '<p class="lite-muted">No classes right now.</p>');
        $('pickerSheet').hidden = false;
    }
    $('pickerBtn').addEventListener('click', openPicker);
    $('pickerList').addEventListener('click', (e) => {
        const b = e.target.closest('.lite-class'); if (!b) return;
        state.classId = Number(b.dataset.id); state.filter = 'all';
        try { localStorage.setItem('lite_class', String(state.classId)); } catch (err) { /* storage off */ }
        $('pickerSheet').hidden = true;
        renderPickerButton(); loadRegs();
    });

    // ---------- Registrations ----------
    async function loadRegs() {
        if (!state.classId) return;
        $('csvBtn').href = '/api/admin/registrations/export?course_id=' + state.classId;
        try {
            state.regs = await api('GET', '/api/admin/registrations?course_id=' + state.classId);
        } catch (e) { toast(e.message); state.regs = []; }
        renderRegs();
    }

    function renderRegs() {
        const count = (s) => state.regs.filter(r => r.payment_status === s).length;
        const chips = [['all', 'All', state.regs.filter(r => r.payment_status !== 'canceled').length], ['pending', 'Pending', count('pending')], ['completed', 'Paid', count('completed')], ['canceled', 'Cancelled', count('canceled')]];
        $('chips').innerHTML = chips.map(([k, l, n]) => `<button type="button" class="lite-chip" data-f="${k}" aria-pressed="${state.filter === k}">${l} ${n}</button>`).join('');

        // "All" leaves cancelled out; pending first
        const order = { pending: 0, completed: 1, canceled: 2 };
        const shown = state.regs
            .filter(r => state.filter === 'all' ? r.payment_status !== 'canceled' : r.payment_status === state.filter)
            .sort((a, b) => (order[a.payment_status] ?? 3) - (order[b.payment_status] ?? 3));
        if (!shown.length) { $('list').innerHTML = '<p class="lite-muted">No registrations here.</p>'; return; }

        $('list').innerHTML = shown.map(r => {
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Student';
            let picked = '';
            try { const d = r.selected_dates ? JSON.parse(r.selected_dates) : null; if (Array.isArray(d) && d.length) picked = classDates({ session_dates: d }); } catch (e) { /* none */ }
            const sub = [money(r.payment_amount), r.payment_method, r.combo_name ? 'Combo: ' + r.combo_name : '', picked].filter(Boolean).map(esc).join(' · ');
            const contact = [r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '', r.phone ? `<a href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : ''].filter(Boolean).join(' · ');
            const by = r.handled_by ? (r.payment_status === 'canceled' ? 'Cancelled by ' : 'Accepted by ') + esc(r.handled_by) : '';
            let actions = '';
            if (r.payment_status === 'pending') {
                actions = `<div class="lite-actions"><button type="button" class="lite-btn lite-btn-primary" data-accept="${r.id}">Accept</button><button type="button" class="lite-btn lite-btn-ghost" data-cancel="${r.id}">Cancel</button></div>`;
            } else if (r.payment_status === 'completed') {
                actions = `<div class="lite-actions"><span class="lite-note">${by}</span><button type="button" class="lite-btn lite-btn-ghost lite-btn-sm" data-cancel="${r.id}">Cancel</button></div>`;
            } else if (by) {
                actions = `<div class="lite-actions"><span class="lite-note">${by}</span></div>`;
            }
            return `<div class="lite-reg"><div class="lite-reg-top"><div style="min-width:0"><div class="lite-reg-name">${esc(name)}</div><div class="lite-reg-sub">${sub}</div><div class="lite-reg-sub">${contact}</div></div><span class="lite-badge ${esc(r.payment_status)}">${LABEL[r.payment_status] || esc(r.payment_status)}</span></div>${actions}</div>`;
        }).join('');
    }

    $('chips').addEventListener('click', (e) => {
        const b = e.target.closest('.lite-chip'); if (!b) return;
        state.filter = b.dataset.f; renderRegs();
    });

    $('list').addEventListener('click', async (e) => {
        const acc = e.target.closest('[data-accept]');
        const can = e.target.closest('[data-cancel]');
        if (acc) {
            acc.disabled = true;
            try {
                const r = await api('PUT', `/api/admin/registrations/${acc.dataset.accept}/confirm-payment`, {});
                toast(r.email_skipped ? 'Accepted (confirmation emails are turned off)' : 'Accepted. Confirmation email sent.');
                await refresh();
            } catch (err) { toast(err.message); acc.disabled = false; }
        } else if (can) {
            const r = state.regs.find(x => String(x.id) === can.dataset.cancel); if (!r) return;
            state.cancelId = r.id;
            const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email;
            const cls = state.classes.find(c => c.id === state.classId);
            $('cancelWho').innerHTML = `<strong>${esc(name)}</strong><br><span class="lite-muted">${esc(cls ? cls.name : '')} · ${r.payment_status === 'completed' ? 'Paid' : 'Pending'} ${esc(money(r.payment_amount))}${r.payment_method ? ' by ' + esc(r.payment_method) : ''}</span>`;
            $('cancelText').textContent = 'The student gets a cancellation email.' +
                (r.combo_group ? ' This is part of a combo, so all its classes are cancelled together.' : '') +
                (r.payment_status === 'completed' ? ' Because this spot was paid, the next person on the waitlist is emailed an offer for it.' : '') +
                ' Only Goutham can undo this.';
            $('cancelSheet').hidden = false;
        }
    });

    $('cancelNo').addEventListener('click', () => { $('cancelSheet').hidden = true; });
    $('cancelYes').addEventListener('click', async () => {
        const btn = $('cancelYes'); btn.disabled = true;
        try {
            await api('PUT', `/api/admin/registrations/${state.cancelId}/cancel`, {});
            $('cancelSheet').hidden = true;
            toast('Registration cancelled');
            await refresh();
        } catch (err) { toast(err.message); } finally { btn.disabled = false; }
    });

    // Tap outside a sheet to close it
    document.querySelectorAll('.lite-sheet-backdrop').forEach(el => el.addEventListener('click', (e) => { if (e.target === el) el.hidden = true; }));

    async function refresh() { await loadClasses(); await loadRegs(); }

    async function start() {
        const s = await api('GET', '/api/lite/status');
        $('whoami').textContent = s.email;
        $('signin').hidden = true; $('app').hidden = false;
        await loadClasses();
        if (state.classId) await loadRegs();
    }

    start().catch(() => showSignin());
})();
