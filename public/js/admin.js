// Admin Dashboard JavaScript
class AdminDashboard {
    constructor() {
        this.currentSection = 'dashboard';
        this.isAuthenticated = false;
        this.adminData = null;
        this.courses = [];
        this.registrations = [];
        this.settings = {};
        
        this.init();
    }

    async init() {
        try {
            this.setupEventListeners(); // Set up event listeners first
            await this.checkAuthStatus();
            if (!this.isAuthenticated) {
                this.showLoginModal();
            } else {
                await this.loadInitialData();
                this.hideLoading();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize admin dashboard');
            this.hideLoading();
        }
    }

    async checkAuthStatus() {
        try {
            const response = await this.apiFetch('/api/admin/status');
            const result = await response.json();
            
            if (result.authenticated) {
                this.isAuthenticated = true;
                this.adminData = result;
                document.getElementById('adminUsername').textContent = result.username;
            }
        } catch (error) {
            console.error('Auth check error:', error);
        }
    }

    showLoginModal() {
        const modal = new bootstrap.Modal(document.getElementById('loginModal'));
        modal.show();
        this.hideLoading();
    }

    async loadInitialData() {
        try {
            const [settingsResponse, coursesResponse, registrationsResponse, waitlistResponse] = await Promise.all([
                this.apiFetch('/api/settings'),
                this.apiFetch('/api/courses'),
                this.apiFetch('/api/registrations'),
                this.apiFetch('/api/admin/waitlists')
            ]);

            this.settings = await settingsResponse.json();
            this.courses = await coursesResponse.json();
            this.registrations = await registrationsResponse.json();
            this.waitlists = waitlistResponse.ok ? await waitlistResponse.json().catch(() => []) : [];
            if (!Array.isArray(this.waitlists)) this.waitlists = this.waitlists.waitlists || [];

            this.updateDashboardStats();
            this.updateRegistrationToggle();
            this.populateFilters();
            if (this.currentSection === 'courses') this.filterCourses();
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load dashboard data');
        } finally {
            // Always hide overlay to avoid blocking clicks even if data load fails
            this.hideLoading();
        }
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Navigation
        document.querySelectorAll('[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.target.closest('[data-section]').dataset.section;
                this.showSection(section);
            });
        });

        // Registration toggle
        document.getElementById('registrationToggle').addEventListener('change', (e) => {
            this.toggleRegistration(e.target.checked);
        });

        // Settings form
        document.getElementById('settingsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // Filters
        document.getElementById('courseStatusFilter').addEventListener('change', () => {
            this.filterCourses();
        });
        document.getElementById('regCourseFilter').addEventListener('change', () => {
            this.filterRegistrations();
        });
        document.getElementById('regStatusFilter').addEventListener('change', () => {
            this.filterRegistrations();
        });
        document.getElementById('regPaymentMethodFilter').addEventListener('change', () => {
            this.filterRegistrations();
        });
        document.getElementById('regSearch').addEventListener('input', () => {
            this.filterRegistrations();
        });
    }

    // Wrapper for API calls with credentials and 401 handling
    async apiFetch(url, options = {}) {
        const config = {
            credentials: 'same-origin',
            ...options
        };

        // If body is a plain object and no explicit string provided, set JSON headers and stringify
        if (config.body && typeof config.body !== 'string') {
            config.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
            config.body = JSON.stringify(config.body);
        } else {
            config.headers = { ...(options.headers || {}) };
        }

        const response = await fetch(url, config);

        if (response.status === 401) {
            this.isAuthenticated = false;
            this.showLoginModal();
            throw new Error('Authentication required');
        }

        return response;
    }

    async handleLogin() {
        const form = document.getElementById('loginForm');
        const formData = new FormData(form);
        const errorDiv = document.getElementById('loginError');

        try {
            const response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.isAuthenticated = true;
                this.adminData = result.admin;
                document.getElementById('adminUsername').textContent = result.admin.username;
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
                modal.hide();
                
                await this.loadInitialData();
                this.showSuccess('Login successful');
            } else {
                errorDiv.textContent = result.error || 'Login failed';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'Login failed. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    async handleLogout() {
        try {
            await this.apiFetch('/api/admin/logout', { method: 'POST' });
            this.isAuthenticated = false;
            this.adminData = null;
            window.location.reload();
        } catch (error) {
            console.error('Logout error:', error);
            this.showError('Logout failed');
        }
    }

    showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.admin-nav .nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.section === sectionName);
        });
        window.scrollTo(0, 0);

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section with safety guard
        const targetSection = document.getElementById(`${sectionName}Section`);
        if (targetSection) {
            targetSection.style.display = 'block';
            this.currentSection = sectionName;
        } else {
            // Fallback to dashboard if section doesn't exist
            const dashboardSection = document.getElementById('dashboardSection');
            if (dashboardSection) {
                dashboardSection.style.display = 'block';
            }
            this.currentSection = 'dashboard';
        }

        // Load section-specific data
        switch (sectionName) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'courses':
                this.loadCourses();
                break;
            case 'registrations':
                this.loadRegistrations();
                break;
            case 'students':
                this.loadStudentManagement();
                break;
            case 'waitlist':
                this.loadWaitlistManagement();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    // ---------- Dashboard ----------
    // Everything here is worked out from the classes and registrations
    // already loaded, so the dashboard needs no extra report queries.
    regsList() { return Array.isArray(this.registrations) ? this.registrations : []; }

    // Registrations that count in numbers (test accounts' registrations don't)
    isTestReg(r) { return r.is_test === true || r.is_test === 1 || r.is_test === '1' || r.is_test === 't'; }
    countable() { return this.regsList().filter(r => !this.isTestReg(r)); }

    money(n) { return `$${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`; }

    // Paid / pending counts and revenue for one class
    classStats(courseId) {
        const regs = this.countable().filter(r => Number(r.course_id) === Number(courseId));
        const paid = regs.filter(r => r.payment_status === 'completed');
        return {
            paid: paid.length,
            pending: regs.filter(r => r.payment_status === 'pending').length,
            revenue: paid.reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0)
        };
    }

    capacityOf(course) {
        const slots = course.slots || [];
        const fromSlots = slots.length ? Math.min(...slots.map(s => Number(s.capacity) || 0)) : 0;
        return fromSlots || Number(course.capacity) || 0;
    }

    updateDashboardStats() {
        const C = window.ClassInfo;
        const regs = this.countable();
        const courses = Array.isArray(this.courses) ? this.courses : [];
        const active = courses.filter(c => c.is_active);
        const pending = regs.filter(r => r.payment_status === 'pending');
        const live = regs.filter(r => r.payment_status === 'completed' || r.payment_status === 'pending');
        const revenue = regs.filter(r => r.payment_status === 'completed').reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0);
        const pendingTotal = pending.reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0);

        document.getElementById('pendingPayments').textContent = pending.length;
        document.getElementById('pendingAmount').textContent = pending.length ? `${this.money(pendingTotal)} to confirm →` : 'Nothing to confirm';
        document.getElementById('totalRegistrations').textContent = live.length;
        document.getElementById('classCount').textContent = `across ${active.length} active class${active.length === 1 ? '' : 'es'}`;
        document.getElementById('totalRevenue').textContent = this.money(revenue);
        document.getElementById('waitlistCount').textContent = Array.isArray(this.waitlists)
            ? this.waitlists.filter(w => !w.status || w.status === 'active' || w.status === 'notified').length : 0;

        const navCount = document.getElementById('navPendingCount');
        navCount.textContent = pending.length;
        navCount.hidden = pending.length === 0;

        // "Nov 4 – Dec 16 · 6 active classes"
        const allDates = active.flatMap(c => C.dates(c)).sort();
        const range = allDates.length ? `${C.formatOneDate(allDates[0])} – ${C.formatOneDate(allDates[allDates.length - 1])}` : 'No dates yet';
        document.getElementById('sessionSummary').textContent = `${range} · ${active.length} active class${active.length === 1 ? '' : 'es'}`;

        this.renderClassReport(active);
        // The payment-check list still shows test registrations (marked "Test") so they can be confirmed
        this.renderPendingList(this.regsList().filter(r => r.payment_status === 'pending'));
        this.addStatCardClickHandlers();
    }

    // "Classes this session": filled, paid, pending and revenue per class
    renderClassReport(active) {
        const C = window.ClassInfo;
        const el = document.getElementById('classReport');
        if (!active.length) {
            el.innerHTML = '<p class="empty-line">No active classes. <a href="#" onclick="admin.showCreateCourse();return false">Create one</a>.</p>';
            return;
        }
        const sorted = [...active].sort((a, b) => (C.dates(a)[0] || '9999').localeCompare(C.dates(b)[0] || '9999'));
        el.innerHTML = `
            <div class="table-responsive">
                <table class="table admin-table class-report mb-0">
                    <thead><tr><th>Class</th><th>Registration</th><th>Filled</th><th class="text-end">Paid</th><th class="text-end">Pending</th><th class="text-end">Revenue</th></tr></thead>
                    <tbody>
                        ${sorted.map(c => {
                            const s = this.classStats(c.id);
                            const cap = this.capacityOf(c);
                            const pct = cap ? Math.min(100, Math.round((s.paid / cap) * 100)) : 0;
                            const crew = c.required_student_type === 'crew_member' ? ' <span class="pill pill-muted">Crew only</span>' : '';
                            return `<tr>
                                <td><a href="#" class="row-link" onclick="admin.showRegistrationsFor(${c.id});return false">${C.esc(c.name)}</a>${crew}<div class="cell-sub">${C.esc(C.kicker(c))}</div></td>
                                <td><label class="reg-switch ${C.isOpen(c) ? 'on' : ''}"><input type="checkbox" class="form-check-input" ${C.isOpen(c) ? 'checked' : ''} onchange="admin.setClassRegistration(${c.id}, this.checked)"> <span>${C.isOpen(c) ? 'Open' : 'Closed'}</span></label></td>
                                <td><div class="fill"><div class="fill-bar"><span style="width:${pct}%"></span></div><span class="fill-num">${s.paid}/${cap || '—'}</span></div></td>
                                <td class="text-end">${s.paid}</td>
                                <td class="text-end">${s.pending ? `<span class="accent fw-semibold">${s.pending}</span>` : '0'}</td>
                                <td class="text-end">${this.money(s.revenue)}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // One line per payment to check; a combo shows once with its total
    pendingGroups(pending) {
        const groups = [];
        const seen = new Map();
        [...pending].sort((a, b) => new Date(b.registration_date) - new Date(a.registration_date)).forEach(r => {
            const key = r.combo_group || `reg-${r.id}`;
            if (seen.has(key)) {
                const g = seen.get(key);
                g.amount += Number(r.payment_amount) || 0;
                return;
            }
            const g = { id: r.id, reg: r, amount: Number(r.payment_amount) || 0, title: r.combo_name ? `${r.combo_name} (combo)` : (r.course_name || 'Class') };
            seen.set(key, g);
            groups.push(g);
        });
        return groups;
    }

    studentName(r) {
        return [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.email || '(No name)';
    }

    renderPendingList(pending) {
        const C = window.ClassInfo;
        const el = document.getElementById('pendingList');
        const groups = this.pendingGroups(pending);
        if (!groups.length) {
            el.innerHTML = '<p class="empty-line">All payments are confirmed.</p>';
            return;
        }
        el.innerHTML = groups.slice(0, 8).map(g => `
            <div class="pending-row">
                <div class="min-w-0">
                    <div class="text-truncate">${g.reg.student_id ? `<a href="#" class="row-link" onclick="admin.openStudent(${g.reg.student_id});return false">${C.esc(this.studentName(g.reg))}</a>` : `<span class="fw-semibold">${C.esc(this.studentName(g.reg))}</span>`}</div>
                    <div class="cell-sub text-truncate">${this.isTestReg(g.reg) ? 'Test · ' : ''}${C.esc(g.title)} · ${this.money(g.amount)}${g.reg.payment_method ? ` · ${C.esc(g.reg.payment_method)}` : ''}</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="window.quickConfirmPayment(${g.id}, this)">Confirm</button>
            </div>`).join('') + (groups.length > 8 ? `<p class="empty-line">+ ${groups.length - 8} more</p>` : '');
    }

    // Open or close registration for one class (the main switch still closes everything)
    async setClassRegistration(courseId, open) {
        const response = await this.apiFetch(`/api/courses/${courseId}/registration-open`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ open })
        });
        if (!response.ok) { this.showError('Could not update registration for this class'); }
        else {
            const course = this.courses.find(c => Number(c.id) === Number(courseId));
            if (course) course.registration_open = open;
            this.showSuccess(`Registration ${open ? 'opened' : 'closed'} for ${course ? course.name : 'this class'}`);
        }
        this.updateDashboardStats();
        if (this.currentSection === 'courses') this.filterCourses();
    }

    showRegistrationsFor(courseId, status = '') {
        this.showSection('registrations');
        document.getElementById('regCourseFilter').value = courseId || '';
        document.getElementById('regStatusFilter').value = status;
        this.filterRegistrations();
    }

    addStatCardClickHandlers() {
        if (this._statsWired) return;
        this._statsWired = true;
        document.getElementById('statPending').onclick = () => this.showRegistrationsFor('', 'pending');
        document.getElementById('seeAllPending').onclick = (e) => { e.preventDefault(); this.showRegistrationsFor('', 'pending'); };
        document.getElementById('statRegistered').onclick = () => this.showRegistrationsFor('', '');
        document.getElementById('statWaitlist').onclick = () => this.showSection('waitlist');
    }

    updateRegistrationToggle() {
        const isOpen = this.settings.registration_open === 'true';
        document.getElementById('registrationToggle').checked = isOpen;
        document.getElementById('registrationStatus').textContent = isOpen ? 'open' : 'closed';
        document.querySelector('.registration-toggle').classList.toggle('on', isOpen);
    }

    async toggleRegistration(isOpen) {
        try {
            await this.apiFetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    registration_open: isOpen.toString()
                })
            });

            this.settings.registration_open = isOpen.toString();
            this.updateRegistrationToggle();
            this.showSuccess(`Registration ${isOpen ? 'opened' : 'closed'} successfully`);
        } catch (error) {
            console.error('Error toggling registration:', error);
            this.showError('Failed to update registration status');
            // Revert toggle
            document.getElementById('registrationToggle').checked = !isOpen;
        }
    }

    // Reports: load analytics and render
    loadDashboard() {
        this.updateDashboardStats();
    }


    loadCourses() {
        this.filterCourses();
        this.loadCombos();
    }

    filterCourses() {
        const statusFilter = document.getElementById('courseStatusFilter').value;
        
        let filteredCourses = [...this.courses];
        
        if (statusFilter === 'active') {
            filteredCourses = filteredCourses.filter(c => c.is_active);
        } else if (statusFilter === 'inactive') {
            filteredCourses = filteredCourses.filter(c => !c.is_active);
        }

        this.renderCoursesGrid(filteredCourses);
    }

    renderCoursesGrid(courses) {
        const C = window.ClassInfo;
        const container = document.getElementById('coursesGrid');
        if (!courses.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <h4>No classes yet</h4>
                    <p>Create your first class to start taking registrations.</p>
                    <button class="btn btn-primary" onclick="admin.showCreateCourse()"><i class="fas fa-plus"></i> New class</button>
                </div>`;
            return;
        }
        const sorted = [...courses].sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0) || (C.dates(a)[0] || '9999').localeCompare(C.dates(b)[0] || '9999'));
        container.innerHTML = `<div class="class-grid">${sorted.map(c => {
            const s = this.classStats(c.id);
            const cap = this.capacityOf(c);
            const pct = cap ? Math.min(100, Math.round((s.paid / cap) * 100)) : 0;
            const crew = c.required_student_type === 'crew_member' ? '<span class="pill pill-muted">Crew only</span>' : '';
            return `
            <article class="panel class-tile ${c.is_active ? '' : 'is-off'}">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <span class="kicker">${C.esc(C.kicker(c))}</span>
                    <span class="d-flex gap-1">${c.is_active && !C.isOpen(c) ? '<span class="pill pill-warn">Registration closed</span>' : ''}<span class="pill ${c.is_active ? 'pill-ok' : 'pill-muted'}">${c.is_active ? 'Active' : 'Inactive'}</span></span>
                </div>
                <h3>${C.esc(c.name)} ${crew}</h3>
                ${c.instructor ? `<div class="cell-sub">with ${C.esc(c.instructor)}</div>` : ''}
                <dl class="class-rows small my-3">
                    ${C.rows(c).map(([k, v]) => `<div><dt>${C.esc(k)}</dt><dd>${C.esc(v)}</dd></div>`).join('')}
                </dl>
                <div class="fill mb-3"><div class="fill-bar"><span style="width:${pct}%"></span></div><span class="fill-num">${s.paid}/${cap || '—'} paid${s.pending ? ` · ${s.pending} pending` : ''}</span></div>
                <div class="tile-actions">
                    <button class="btn btn-outline-secondary btn-sm" onclick="admin.editCourse(${c.id})">Edit</button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="admin.showRegistrationsFor(${c.id})">Registrations</button>
                    <button class="btn btn-outline-secondary btn-sm" onclick="admin.toggleCourseStatus(${c.id}, ${!c.is_active})">${c.is_active ? 'Turn off' : 'Turn on'}</button>
                    <button class="btn btn-outline-danger btn-sm" onclick="admin.deleteCourse(${c.id})">Delete</button>
                </div>
            </article>`;
        }).join('')}</div>`;
    }

    loadRegistrations() {
        this.filterRegistrations();
    }

    filterRegistrations() {
        const courseFilter = document.getElementById('regCourseFilter').value;
        const statusFilter = document.getElementById('regStatusFilter').value;
        const methodFilter = document.getElementById('regPaymentMethodFilter').value;
        const q = (document.getElementById('regSearch').value || '').trim().toLowerCase();

        let regs = [...this.regsList()];
        if (courseFilter) regs = regs.filter(r => Number(r.course_id) === Number(courseFilter));
        if (statusFilter) regs = regs.filter(r => r.payment_status === statusFilter);
        if (methodFilter) regs = regs.filter(r => String(r.payment_method || '').toLowerCase() === methodFilter);
        if (q) regs = regs.filter(r => [r.first_name, r.last_name, r.email, r.instagram_id].join(' ').toLowerCase().includes(q));
        regs.sort((a, b) => (a.payment_status === 'pending' ? 0 : 1) - (b.payment_status === 'pending' ? 0 : 1) || new Date(b.registration_date) - new Date(a.registration_date));

        const pending = regs.filter(r => r.payment_status === 'pending').length;
        document.getElementById('regSummary').textContent = `${regs.length} registration${regs.length === 1 ? '' : 's'}${pending ? ` · ${pending} waiting for payment check` : ''}`;
        this.renderRegistrationsTable(regs);
    }

    // One row per registration. On a phone each row stacks into a card.
    renderRegistrationsTable(registrations) {
        const C = window.ClassInfo;
        const container = document.getElementById('registrationsTable');
        if (!registrations.length) {
            container.innerHTML = '<div class="empty-state"><h4>No registrations found</h4><p>Nothing matches these filters.</p></div>';
            return;
        }
        const STATUS = { completed: ['Paid', 'pill-ok'], pending: ['Pending', 'pill-warn'], canceled: ['Canceled', 'pill-muted'], failed: ['Failed', 'pill-bad'] };
        container.innerHTML = `<div class="reg-list">${registrations.map(r => {
            let picked = '';
            try { const d = JSON.parse(r.selected_dates || 'null'); if (Array.isArray(d) && d.length) picked = `Dates: ${C.formatDates(d)}`; } catch (e) { /* ignore */ }
            const [label, cls] = STATUS[r.payment_status] || [r.payment_status || '—', 'pill-muted'];
            const contact = [r.email, r.instagram_id ? `@${r.instagram_id}` : ''].filter(Boolean).join(' · ');
            return `
            <div class="reg-row status-${C.esc(r.payment_status)}">
                <div class="reg-who">
                    ${r.student_id ? `<a href="#" class="row-link" onclick="admin.openStudent(${r.student_id});return false">${C.esc(this.studentName(r))}</a>` : `<div class="fw-semibold">${C.esc(this.studentName(r))}</div>`}
                    <div class="cell-sub">${C.esc(contact || '(no email)')}</div>
                </div>
                <div class="reg-what">
                    <div>${C.esc(r.course_name || 'Class')}${this.isTestReg(r) ? ' <span class="pill pill-muted">Test</span>' : ''}</div>
                    ${r.combo_name ? `<div class="cell-sub">Combo: ${C.esc(r.combo_name)} · actions apply to the whole combo</div>` : ''}
                    ${picked ? `<div class="cell-sub">${C.esc(picked)}</div>` : ''}
                </div>
                <div class="reg-pay">
                    <div class="fw-semibold">${this.money(r.payment_amount)}</div>
                    <div class="cell-sub">${C.esc(r.payment_method || '—')} · ${r.registration_date ? new Date(r.registration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
                </div>
                <div class="reg-status"><span class="pill ${cls}">${C.esc(label)}</span></div>
                <div class="reg-actions">
                    ${r.payment_status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="window.quickConfirmPayment(${r.id}, this)">Confirm</button>` : ''}
                    ${!r.email ? `<button class="btn btn-outline-secondary btn-sm" onclick="admin.assignStudent(${r.id})">Link student</button>` : ''}
                    <button class="btn btn-outline-secondary btn-sm" onclick="admin.viewRegistration(${r.id})">Details</button>
                    ${r.payment_status === 'canceled'
                        ? `<button class="btn btn-outline-secondary btn-sm" onclick="admin.uncancelRegistration(${r.id})">Restore</button>`
                        : `<button class="btn btn-outline-danger btn-sm" onclick="admin.cancelRegistration(${r.id})">Cancel</button>`}
                </div>
            </div>`;
        }).join('')}</div>`;
    }

    // Settings → Test email: shows which method is active and the exact error if sending fails
    async loadEmailStatus() {
        const el = document.getElementById('emailStatus');
        try {
            const r = await this.apiFetch('/api/admin/email-status');
            const st = await r.json();
            el.textContent = st.method === 'not configured'
                ? 'Email is not set up yet (no Gmail values in Railway).'
                : `Sending with ${st.method}${st.from ? ` from ${st.from}` : ''}.`;
        } catch (e) { el.textContent = ''; }
    }

    async sendTestEmail() {
        const to = document.getElementById('testEmailTo').value.trim();
        const out = document.getElementById('testEmailResult');
        if (!to) { out.innerHTML = '<span class="text-warning">Enter an email address first.</span>'; return; }
        const btn = document.getElementById('sendTestEmailBtn');
        btn.disabled = true; out.textContent = 'Sending…';
        try {
            const r = await this.apiFetch('/api/admin/send-test-email', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to })
            });
            const res = await r.json();
            const esc = window.ClassInfo.esc;
            out.innerHTML = res.success
                ? `<span class="text-success">${esc(res.message)}</span>`
                : `<span class="text-danger">Not sent (${esc(res.method || '')}): ${esc(res.error || 'unknown error')}</span>`;
        } catch (e) {
            out.innerHTML = '<span class="text-danger">Could not reach the server.</span>';
        } finally { btn.disabled = false; }
    }

    loadSettings() {
        this.loadEmailStatus();
        // Populate settings form
        document.getElementById('venmoUsername').value = this.settings.venmo_username || '';
        document.getElementById('zelleRecipientName').value = this.settings.zelle_recipient_name || '';
        document.getElementById('zellePhone').value = this.settings.zelle_phone || '';
        document.getElementById('emailNotifications').checked = this.settings.email_notifications_enabled === 'true';
        document.getElementById('waitlistHoldHours').value = this.settings.waitlist_hold_hours || '24';
    }

    populateFilters() {
        // Populate course filter for registrations
        const courseSelect = document.getElementById('regCourseFilter');
        const keep = courseSelect.value;
        courseSelect.innerHTML = '<option value="">All classes</option>';
        this.courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            courseSelect.appendChild(option);
        });
        courseSelect.value = keep;
    }











    async saveSettings() {
        const form = document.getElementById('settingsForm');
        const formData = new FormData(form);
        
        const settings = {
            venmo_username: (formData.get('venmo_username') || '').trim().replace(/^@/, ''),
            zelle_recipient_name: (formData.get('zelle_recipient_name') || '').trim(),
            zelle_phone: (formData.get('zelle_phone') || '').replace(/\D/g, ''),
            email_notifications_enabled: formData.has('email_notifications_enabled').toString(),
            waitlist_hold_hours: formData.get('waitlist_hold_hours') || '24'
        };

        try {
            const response = await this.apiFetch('/api/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                this.settings = { ...this.settings, ...settings };
                this.showSuccess('Settings saved successfully');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showError('Failed to save settings');
        }
    }

    // Helper function for payment method badge display
    getPaymentMethodBadge(method) {
        if (!method) {
            return '<span class="badge bg-secondary">—</span>';
        }
        
        const methodLower = String(method).toLowerCase();
        if (methodLower === 'venmo') {
            return '<span class="badge bg-primary payment-method-venmo"><i class="fas fa-mobile-alt me-1"></i>Venmo</span>';
        } else if (methodLower === 'zelle') {
            return '<span class="badge bg-success payment-method-zelle"><i class="fas fa-university me-1"></i>Zelle</span>';
        } else {
            return `<span class="badge bg-secondary">${method}</span>`;
        }
    }

    // Utility Functions
    exportRegistrations() {
        try {
            const courseId = document.getElementById('regCourseFilter')?.value || '';
            const status = document.getElementById('regStatusFilter')?.value || '';
            const params = new URLSearchParams();
            if (courseId) params.set('course_id', courseId);
            if (status) params.set('payment_status', status);
            const url = `/api/admin/registrations/export${params.toString() ? `?${params.toString()}` : ''}`;
            window.open(url, '_blank');
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to export registrations');
        }
    }



    // ---------- Class form (create / edit) ----------
    // A class is one group at one time: a list of dates, start/end time,
    // location, capacity, song/style, instructor and fees. It is stored as the
    // class plus a single slot, so capacity and registration code is unchanged.

    showCreateCourse() {
        document.getElementById('courseModalTitle').textContent = 'New class';
        document.getElementById('saveCourseBtn').textContent = 'Create class';
        document.getElementById('courseForm').reset();
        document.getElementById('courseId').value = '';
        this.classDates = [];
        this.setupClassForm();
        new bootstrap.Modal(document.getElementById('courseModal')).show();
    }

    async editCourse(courseId) {
        const course = this.courses.find(c => Number(c.id) === Number(courseId));
        if (!course) return;
        const C = window.ClassInfo;
        const slot = C.slot(course);
        const pricing = slot.pricing || {};
        const set = (id, v) => { document.getElementById(id).value = v ?? ''; };

        document.getElementById('courseForm').reset();
        document.getElementById('courseModalTitle').textContent = 'Edit class';
        document.getElementById('saveCourseBtn').textContent = 'Save changes';
        set('courseId', course.id);
        const type = course.course_type === 'choreography' ? 'multi-week' : (course.course_type || 'multi-week');
        const typeInput = document.querySelector(`input[name="classType"][value="${type}"]`);
        if (typeInput) typeInput.checked = true;
        set('courseName', course.name);
        set('songStyle', course.song_name);
        set('instructor', course.instructor);
        set('courseDescription', course.description);
        const who = document.querySelector(`input[name="whoCanRegister"][value="${course.required_student_type === 'crew_member' ? 'crew_member' : 'any'}"]`);
        if (who) who.checked = true;
        this.classDates = C.dates(course);
        set('startTime', String(slot.start_time || '').slice(0, 5));
        set('endTime', String(slot.end_time || '').slice(0, 5));
        set('capacity', slot.capacity || 20);
        set('location', slot.location);
        if (type === 'drop_in') {
            set('mainFee', pricing.drop_in ?? course.per_class_price);
        } else if (type === 'crew_practice') {
            set('mainFee', pricing.drop_in ?? pricing.full_package ?? course.full_course_price);
        } else {
            set('mainFee', pricing.full_package ?? course.full_course_price);
            set('perDateFee', pricing.drop_in ?? '');
        }
        if ((course.slots || []).length > 1) {
            this.showError(`This class has ${course.slots.length} time slots from the old setup. Saving keeps only the first one; create the others as separate classes.`);
        }
        this.setupClassForm();
        new bootstrap.Modal(document.getElementById('courseModal')).show();
    }

    setupClassForm() {
        const form = document.getElementById('courseForm');
        if (!form._wired) {
            form._wired = true;
            form.addEventListener('input', () => this.refreshClassForm());
            form.addEventListener('change', () => this.refreshClassForm());
            document.getElementById('dateChips').addEventListener('click', (e) => {
                const btn = e.target.closest('[data-remove-date]');
                if (!btn) return;
                this.classDates = this.classDates.filter(d => d !== btn.dataset.removeDate);
                this.refreshClassForm();
            });
        }
        this.refreshClassForm();
    }

    classFormType() {
        return document.querySelector('input[name="classType"]:checked')?.value || 'multi-week';
    }

    addClassDate() {
        const input = document.getElementById('newDate');
        if (!input.value) { this.showError('Pick a date first'); return; }
        if (!this.classDates.includes(input.value)) this.classDates.push(input.value);
        this.classDates.sort();
        input.value = '';
        this.refreshClassForm();
    }

    repeatWeekly() {
        const first = document.getElementById('newDate').value || this.classDates[0];
        if (!first) { this.showError('Pick the first date, then press "Fill weekly"'); return; }
        const weeks = Math.min(Math.max(parseInt(document.getElementById('repeatWeeks').value, 10) || 4, 2), 12);
        const d0 = window.ClassInfo.toDate(first);
        const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        this.classDates = Array.from({ length: weeks }, (_, i) => iso(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 7 * i)));
        document.getElementById('newDate').value = '';
        this.refreshClassForm();
    }

    // What the form will send to the server
    buildClassPayload() {
        const val = (id) => document.getElementById(id).value.trim();
        const type = this.classFormType();
        const dates = [...(this.classDates || [])].sort();
        const mainFee = Number(val('mainFee')) || 0;
        const perDate = type === 'multi-week' ? (Number(val('perDateFee')) || 0) : 0;
        let pricing;
        if (type === 'multi-week') pricing = perDate ? { full_package: mainFee, drop_in: perDate } : { full_package: mainFee };
        else pricing = { drop_in: mainFee, full_package: mainFee * Math.max(dates.length, 1) };
        const first = dates[0];
        const weekday = first ? window.ClassInfo.toDate(first).toLocaleDateString('en-US', { weekday: 'long' }) : null;
        return {
            name: val('courseName'),
            description: val('courseDescription') || null,
            course_type: type,
            song_name: val('songStyle') || null,
            instructor: val('instructor') || null,
            required_student_type: document.querySelector('input[name="whoCanRegister"]:checked')?.value || 'any',
            session_dates: dates,
            start_date: first || null,
            end_date: dates[dates.length - 1] || null,
            duration_weeks: dates.length || 1,
            slots: [{
                slot_name: 'Main Session',
                difficulty_level: 'All Levels',
                capacity: parseInt(val('capacity'), 10) || 0,
                day_of_week: weekday,
                practice_date: type === 'multi-week' ? null : (first || null),
                start_time: val('startTime') || null,
                end_time: val('endTime') || null,
                location: val('location') || null,
                pricing
            }]
        };
    }

    // Problems that stop the class from being saved ([] = OK)
    classFormProblems(payload) {
        const n = payload.session_dates.length;
        const slot = payload.slots[0];
        const problems = [];
        if (!payload.name) problems.push('Add a class name');
        if (payload.course_type === 'multi-week' && n < 3) problems.push('A series needs at least 3 dates');
        if (payload.course_type === 'drop_in' && (n < 1 || n > 2)) problems.push('A drop-in has 1 or 2 dates');
        if (payload.course_type === 'crew_practice' && n < 1) problems.push('Add at least 1 practice date');
        if (!slot.start_time || !slot.end_time) problems.push('Add a start and end time');
        if (slot.capacity < 1) problems.push('Capacity must be at least 1');
        const fee = Number(document.getElementById('mainFee').value);
        if (!(fee > 0) && payload.course_type !== 'crew_practice') problems.push('Add the fee');
        return problems;
    }

    refreshClassForm() {
        const C = window.ClassInfo;
        const type = this.classFormType();
        document.getElementById('repeatWeeklyBox').classList.toggle('d-none', type !== 'multi-week');
        document.getElementById('perDateFeeBox').classList.toggle('d-none', type !== 'multi-week');
        document.getElementById('mainFeeLabel').textContent =
            type === 'multi-week' ? 'Series fee (all dates) *' : type === 'drop_in' ? 'Fee per date *' : 'Fee per practice';
        document.getElementById('datesHint').textContent =
            type === 'multi-week' ? 'Pick the first date, then "Fill weekly" to add the rest. Remove any date that is skipped.'
            : type === 'drop_in' ? 'Add 1 or 2 dates. Students can pay for one or both.' : 'Add one or more practice dates. Students pick which ones they come to and pay per practice.';

        const dates = this.classDates || [];
        document.getElementById('dateChips').innerHTML = dates.length
            ? dates.map(d => `<span class="badge rounded-pill text-bg-dark d-inline-flex align-items-center gap-1 px-3 py-2">${C.esc(C.formatOneDate(d))}
                <button type="button" class="btn-close btn-close-white ms-1" style="font-size:.6rem" aria-label="Remove ${C.esc(d)}" data-remove-date="${C.esc(d)}"></button></span>`).join('')
            : '<span class="text-muted small">No dates yet</span>';

        // Live preview of the student card
        const payload = this.buildClassPayload();
        const slot = payload.slots[0];
        const course = { ...payload, full_course_price: slot.pricing.full_package, per_class_price: slot.pricing.drop_in };
        const f = C.fees(course);
        const rows = C.rows(course);
        const problems = this.classFormProblems(payload);
        document.getElementById('classPreview').innerHTML = `
            <div style="background:#151518;border:1px solid #2B2B32;border-radius:16px;padding:16px;color:#F5F5F4;font-family:Inter,system-ui,sans-serif">
                <div style="display:flex;justify-content:space-between;gap:12px">
                    <div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FFD60A">${C.esc(C.kicker(course))}${payload.required_student_type === 'crew_member' ? ' · Crew only' : ''}</div>
                        <div style="font-size:18px;font-weight:700;margin-top:3px">${C.esc(payload.name || 'Class name')}</div>
                        ${payload.instructor ? `<div style="font-size:13px;color:#A8A8B3">with ${C.esc(payload.instructor)}</div>` : ''}
                    </div>
                    <div style="font-size:18px;font-weight:700;white-space:nowrap">${f.headline ? '$' + f.headline : ''}</div>
                </div>
                <div style="border-top:1px solid #1F1F25;margin-top:10px;padding-top:10px;display:flex;flex-direction:column;gap:5px;font-size:13px">
                    ${rows.map(([k, v]) => `<div style="display:flex;gap:10px"><span style="width:66px;flex:none;color:#8E8E99">${C.esc(k)}</span><span style="color:#D4D4D8">${C.esc(v)}</span></div>`).join('') || '<span style="color:#8E8E99">Add dates, time and fees to see them here</span>'}
                </div>
            </div>
            ${problems.length ? `<ul class="small text-muted mt-3 mb-0 ps-3">${problems.map(p => `<li>${C.esc(p)}</li>`).join('')}</ul>` : '<p class="small text-success mt-3 mb-0">Ready to save</p>'}`;
    }

    // ===================== Combos =====================
    async loadCombos() {
        const list = document.getElementById('combosList');
        if (!list) return;
        try {
            const response = await this.apiFetch('/api/admin/combos');
            this.combos = response.ok ? await response.json() : [];
        } catch (e) {
            this.combos = [];
        }
        const C = window.ClassInfo;
        if (!this.combos.length) {
            list.innerHTML = '<p class="text-muted small">No combos yet.</p>';
            return;
        }
        list.innerHTML = this.combos.map(combo => `
            <div class="card mb-2">
                <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                    <div>
                        <div class="d-flex align-items-center gap-2">
                            <strong>${C.esc(combo.name)}</strong>
                            <span class="badge ${combo.is_active ? 'bg-success' : 'bg-secondary'}">${combo.is_active ? 'On' : 'Off'}</span>
                        </div>
                        <div class="small text-muted">${combo.classes.map(c => C.esc(c.name)).join(' + ')}</div>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="text-end">
                            <strong>$${Number(combo.price).toFixed(0)}</strong>
                            ${combo.savings > 0 ? `<div class="small text-success">saves $${Number(combo.savings).toFixed(0)}</div>` : ''}
                        </div>
                        <button class="btn btn-sm btn-outline-secondary" onclick="admin.toggleCombo(${combo.id}, ${!combo.is_active})">${combo.is_active ? 'Turn off' : 'Turn on'}</button>
                        <button class="btn btn-sm btn-outline-primary" onclick="admin.editCombo(${combo.id})">Edit</button>
                        <button class="btn btn-sm btn-outline-danger" onclick="admin.deleteCombo(${combo.id})">Delete</button>
                    </div>
                </div>
            </div>`).join('');
    }

    showCreateCombo() { this.openComboForm(null); }

    editCombo(id) {
        const combo = (this.combos || []).find(c => c.id === id);
        if (combo) this.openComboForm(combo);
    }

    openComboForm(combo) {
        const C = window.ClassInfo;
        document.getElementById('comboId').value = combo ? combo.id : '';
        document.getElementById('comboModalTitle').textContent = combo ? 'Edit combo' : 'New combo';
        document.getElementById('saveComboBtn').textContent = combo ? 'Save combo' : 'Create combo';
        document.getElementById('comboName').value = combo ? combo.name : '';
        document.getElementById('comboDescription').value = combo ? (combo.description || '') : '';
        document.getElementById('comboPrice').value = combo ? Number(combo.price) : '';
        const chosen = new Set(combo ? combo.course_ids : []);
        const options = this.courses.filter(c => c.is_active || chosen.has(c.id));
        document.getElementById('comboClassList').innerHTML = options.length ? options.map(c => {
            const when = [C.formatDates(C.dates(c)).split(',')[0], C.formatTime(C.slot(c).start_time), c.instructor, `${C.dates(c).length} date${C.dates(c).length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
            return `
            <label class="d-flex justify-content-between align-items-center gap-3 border rounded p-2" style="cursor:pointer">
                <span class="d-flex align-items-center gap-2">
                    <input type="checkbox" class="form-check-input mt-0" name="comboClass" value="${c.id}" ${chosen.has(c.id) ? 'checked' : ''}>
                    <span><span class="fw-semibold">${C.esc(c.name)}</span><br><small class="text-muted">${C.esc(when)}</small></span>
                </span>
                <strong>$${Number(C.fees(c).full || 0).toFixed(0)}</strong>
            </label>`;
        }).join('') : '<p class="text-muted small">Create some classes first.</p>';

        const modalEl = document.getElementById('comboModal');
        if (!modalEl.dataset.wired) {
            modalEl.addEventListener('input', () => this.refreshComboForm());
            modalEl.addEventListener('change', () => this.refreshComboForm());
            modalEl.dataset.wired = '1';
        }
        this.refreshComboForm();
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    comboFormValues() {
        const ids = [...document.querySelectorAll('input[name="comboClass"]:checked')].map(i => Number(i.value));
        return {
            name: document.getElementById('comboName').value.trim(),
            description: document.getElementById('comboDescription').value.trim(),
            price: Number(document.getElementById('comboPrice').value),
            course_ids: ids
        };
    }

    refreshComboForm() {
        const C = window.ClassInfo;
        const v = this.comboFormValues();
        const classes = this.courses.filter(c => v.course_ids.includes(c.id));
        const separately = classes.reduce((sum, c) => sum + (Number(C.fees(c).full) || 0), 0);
        const savings = separately - (v.price || 0);
        document.getElementById('comboSeparately').textContent = `$${separately.toFixed(0)}`;
        document.getElementById('comboSavings').innerHTML = !v.price ? ''
            : savings > 0 ? `<span class="text-success">Students save $${savings.toFixed(0)}</span>`
            : '<span class="text-warning">The combo costs the same or more than buying separately</span>';

        const problems = [];
        if (!v.name) problems.push('Give the combo a name');
        if (v.course_ids.length < 2) problems.push('Pick at least 2 classes');
        if (!(v.price > 0)) problems.push('Set a combo price');
        const who = C.comboInstructors(classes);
        document.getElementById('comboPreview').innerHTML = `
            <div style="background:#151518;border:1px solid #2B2B32;border-radius:14px;padding:16px;color:#F5F5F4">
                <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FFD60A">${C.esc(C.comboKicker(classes))}</div>
                <div style="font-size:18px;font-weight:700;margin-top:4px">${C.esc(v.name || 'Combo name')}</div>
                ${who ? `<div style="font-size:13px;color:#A8A8B3">with ${C.esc(who)}</div>` : ''}
                <div style="border-top:1px solid #1F1F25;margin-top:10px;padding-top:10px;display:flex;flex-direction:column;gap:6px;font-size:13px">
                    ${C.comboRows(classes).map(([k, val]) => `<div><div style="color:#D4D4D8;font-weight:600">${C.esc(k)}</div><div style="color:#8E8E99">${C.esc(val)}</div></div>`).join('') || '<span style="color:#8E8E99">Pick classes to see them here</span>'}
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
                    <span><strong style="font-size:20px">${v.price ? '$' + v.price.toFixed(0) : '$—'}</strong>${savings > 0 && v.price ? ` <span style="font-size:12px;color:#3DF2C3">save $${savings.toFixed(0)}</span>` : ''}</span>
                    <span style="background:#FFD60A;color:#0B0B0D;border-radius:10px;padding:8px 14px;font-weight:700;font-size:14px">Register</span>
                </div>
            </div>
            <p class="small text-muted mt-2 mb-0">One payment registers the student in every class in the combo. Spots are counted in each class.</p>
            ${problems.length ? `<ul class="small text-muted mt-2 mb-0 ps-3">${problems.map(p => `<li>${C.esc(p)}</li>`).join('')}</ul>` : '<p class="small text-success mt-2 mb-0">Ready to save</p>'}`;
        return problems;
    }

    async saveCombo() {
        const problems = this.refreshComboForm();
        if (problems.length) { this.showError(problems.join('. ')); return; }
        const id = document.getElementById('comboId').value;
        const response = await this.apiFetch(id ? `/api/combos/${id}` : '/api/combos', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.comboFormValues())
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            this.showError(error.error || 'Failed to save combo');
            return;
        }
        bootstrap.Modal.getInstance(document.getElementById('comboModal')).hide();
        this.showSuccess(id ? 'Combo updated' : 'Combo created');
        this.loadCombos();
    }

    async toggleCombo(id, active) {
        const response = await this.apiFetch(`/api/combos/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: active })
        });
        if (!response.ok) { this.showError('Failed to update combo'); return; }
        this.loadCombos();
    }

    async deleteCombo(id) {
        if (!confirm('Delete this combo? Classes in it are not affected.')) return;
        const response = await this.apiFetch(`/api/combos/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            this.showError(error.error || 'Failed to delete combo');
            return;
        }
        this.showSuccess('Combo deleted');
        this.loadCombos();
    }

    async saveCourse() {
        const courseId = document.getElementById('courseId').value;
        const payload = this.buildClassPayload();
        const problems = this.classFormProblems(payload);
        if (problems.length) { this.showError(problems.join('. ')); return; }
        try {
            const response = await this.apiFetch(courseId ? `/api/courses/${courseId}` : '/api/courses', {
                method: courseId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                this.showError(error.error || 'Failed to save class');
                return;
            }
            bootstrap.Modal.getInstance(document.getElementById('courseModal')).hide();
            await this.loadInitialData();
            this.showSuccess(courseId ? 'Class updated' : 'Class created');
            if (this.currentSection === 'courses') this.loadCourses();
        } catch (error) {
            console.error('Error saving class:', error);
            this.showError('Failed to save class');
        }
    }

    async deleteCourse(courseId) {
        if (!confirm('Delete this dance series? It will be hidden from the UI but kept in the database.')) {
            return;
        }
        try {
            const response = await this.apiFetch(`/api/courses/${courseId}`, { method: 'DELETE' });
            if (response.ok) {
                await this.loadInitialData();
                this.showSuccess('Course deleted successfully');
                if (this.currentSection === 'courses') this.loadCourses();
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to delete course');
            }
        } catch (error) {
            console.error('Error deleting course:', error);
            this.showError('Failed to delete course');
        }
    }

    async toggleCourseStatus(courseId, newStatus) {
        try {
            const response = await this.apiFetch(`/api/courses/${courseId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ is_active: newStatus })
            });

            if (response.ok) {
                await this.loadInitialData();
                this.showSuccess(`Course ${newStatus ? 'activated' : 'deactivated'} successfully`);
                if (this.currentSection === 'courses') {
                    this.loadCourses();
                }
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to update course status');
            }
        } catch (error) {
            console.error('Error updating course status:', error);
            this.showError('Failed to update course status');
        }
    }

    async viewRegistration(registrationId) {
        const registration = this.registrations.find(r => r.id === registrationId);
        if (!registration) return;

        // Create a simple modal to show registration details
        const modalHtml = `
            <div class="modal fade" id="registrationDetailModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Registration Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-sm-4"><strong>Registration ID:</strong></div>
                                <div class="col-sm-8"><code>#${registration.id}</code></div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Name:</strong></div>
                                <div class="col-sm-8">${[registration.first_name, registration.last_name].filter(Boolean).join(' ').trim() || '(No name)'}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Email:</strong></div>
                                <div class="col-sm-8">${registration.email}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Instagram:</strong></div>
                                <div class="col-sm-8">@${registration.instagram_id}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Experience:</strong></div>
                                <div class="col-sm-8">${registration.dance_experience}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Course:</strong></div>
                                <div class="col-sm-8">${registration.course_name || 'Drop-in Class'}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Type:</strong></div>
                                <div class="col-sm-8">${registration.registration_type}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Amount:</strong></div>
                                <div class="col-sm-8">$${parseFloat(registration.payment_amount).toFixed(2)}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Payment Method:</strong></div>
                                <div class="col-sm-8">${this.getPaymentMethodBadge(registration.payment_method)}</div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Status:</strong></div>
                                <div class="col-sm-8">
                                    <span class="status-badge status-${registration.payment_status}">
                                        ${registration.payment_status}
                                    </span>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-sm-4"><strong>Date:</strong></div>
                                <div class="col-sm-8">${new Date(registration.registration_date).toLocaleString()}</div>
                            </div>
                            ${registration.paypal_transaction_id ? `
                                <div class="row">
                                    <div class="col-sm-4"><strong>Transaction ID:</strong></div>
                                    <div class="col-sm-8"><code>${registration.paypal_transaction_id}</code></div>
                                </div>
                            ` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('registrationDetailModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('registrationDetailModal'));
        modal.show();
    }

    async markPaid(registrationId) {
        this.showVenmoConfirmationModal(registrationId);
    }

    showVenmoConfirmationModal(registrationId) {
        const registration = this.registrations.find(r => r.id === registrationId);
        if (!registration) return;

        const modalHtml = `
            <div class="modal fade" id="venmoConfirmModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-mobile-alt text-primary me-2"></i>
                                Confirm Venmo Payment
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info">
                                <strong>Check your Venmo notifications</strong> for a payment matching these details:
                            </div>
                            
                            <div class="payment-details">
                                <div class="row mb-2">
                                    <div class="col-4"><strong>Student:</strong></div>
                                    <div class="col-8">
                                        ${[registration.first_name, registration.last_name].filter(Boolean).join(' ').trim() || '(No name)'}<br>
                                        <small class="text-muted">${registration.email}</small>
                                    </div>
                                </div>
                                <div class="row mb-2">
                                    <div class="col-4"><strong>Amount:</strong></div>
                                    <div class="col-8">$${parseFloat(registration.payment_amount).toFixed(2)}</div>
                                </div>
                                <div class="row mb-2">
                                    <div class="col-4"><strong>Expected Note:</strong></div>
                                    <div class="col-8"><code>Dance Registration #${registration.id}</code></div>
                                </div>
                                <div class="row mb-2">
                                    <div class="col-4"><strong>Course:</strong></div>
                                    <div class="col-8">${registration.course_name || 'Drop-in Class'}</div>
                                </div>
                            </div>

                            <div class="form-group mt-3">
                                <label for="venmoNote" class="form-label">Venmo Payment Note (Optional)</label>
                                <input type="text" class="form-control" id="venmoNote" 
                                       placeholder="Copy the note from your Venmo notification">
                                <div class="form-text">This helps track the payment for your records</div>
                            </div>

                            <div class="alert alert-warning mt-3">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                <strong>Only confirm if you received the Venmo payment!</strong>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-success" onclick="admin.confirmVenmoPayment(${registrationId}, this)">
                                <i class="fas fa-check me-2"></i>
                                Confirm Payment Received
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('venmoConfirmModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('venmoConfirmModal'));
        modal.show();
    }

    async confirmVenmoPayment(registrationId, el) {
        console.info('UI: confirmVenmoPayment clicked', { registrationId, time: new Date().toISOString() });
        const venmoNote = document.getElementById('venmoNote').value;

        // Optimistic UI on modal button
        let originalHtml;
        if (el && el instanceof HTMLElement) {
            el.disabled = true;
            originalHtml = el.innerHTML;
            el.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Confirming...';
        }
        
        try {
            const response = await this.apiFetch(`/api/admin/registrations/${registrationId}/confirm-payment`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    venmo_transaction_note: venmoNote || `Venmo payment confirmed by admin`
                })
            });

            if (response.ok) {
                const result = await response.json();

                // Close modal
                const modal = bootstrap.Modal.getInstance(document.getElementById('venmoConfirmModal'));
                modal.hide();
                
                // Reload data
                await this.loadInitialData();

                if (result.email_queued) {
                    this.showSuccess('Payment confirmed. Confirmation email is being sent.');
                } else if (result.email_sent) {
                    this.showSuccess('Payment confirmed. Confirmation email sent.');
                } else if (result.email_skipped) {
                    this.showSuccess('Payment confirmed. Email notifications are disabled.');
                } else if (result.email_error) {
                    this.showError(`Payment confirmed but email could not be sent: ${result.email_error}`);
                } else {
                    this.showSuccess('Venmo payment confirmed successfully!');
                }
                
                if (this.currentSection === 'registrations') {
                    this.loadRegistrations();
                }
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to confirm payment');
            }
        } catch (error) {
            console.error('Error confirming payment:', error);
            this.showError('Failed to confirm payment');
        } finally {
            if (el && el instanceof HTMLElement) {
                el.disabled = false;
                if (originalHtml) {
                    el.innerHTML = originalHtml;
                }
            }
        }
    }

    // Quick path: approve immediately without opening the modal (no Venmo note)
    async quickConfirmPayment(registrationId) {
        try {
            const response = await this.apiFetch(`/api/admin/registrations/${registrationId}/confirm-payment`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    venmo_transaction_note: 'Venmo payment confirmed by admin'
                })
            });

            if (response.ok) {
                const result = await response.json();

                // Reload data
                await this.loadInitialData();

                if (result.email_queued) {
                    this.showSuccess('Payment confirmed. Confirmation email is being sent.');
                } else if (result.email_sent) {
                    this.showSuccess('Payment confirmed. Confirmation email sent.');
                } else if (result.email_skipped) {
                    this.showSuccess('Payment confirmed. Email notifications are disabled.');
                } else if (result.email_error) {
                    this.showError(`Payment confirmed but email could not be sent: ${result.email_error}`);
                } else {
                    this.showSuccess('Venmo payment confirmed successfully!');
                }

                if (this.currentSection === 'registrations') {
                    this.loadRegistrations();
                }
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to confirm payment');
            }
        } catch (error) {
            console.error('Error confirming payment:', error);
            this.showError('Failed to confirm payment');
        }
    }

    async assignStudent(registrationId) {
        try {
            const email = (prompt('Enter student email to link to this registration:') || '').trim();
            if (!email) return;
            const first = (prompt('Optional: first name') || '').trim();
            const last = (prompt('Optional: last name') || '').trim();
            const response = await this.apiFetch(`/api/admin/registrations/${registrationId}/assign-student`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, first_name: first, last_name: last })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.success) {
                await this.loadInitialData();
                this.showSuccess('Student linked to registration');
            } else {
                this.showError(result.error || 'Failed to assign student');
            }
        } catch (err) {
            console.error('Assign student error:', err);
            this.showError('Failed to assign student');
        }
    }

    // Cancel a registration
    async cancelRegistration(registrationId) {
        try {
            if (!confirm(`Cancel registration #${registrationId}? This will free capacity and notify the student (if emails are enabled).`)) {
                return;
            }
            const reason = prompt('Cancellation reason (optional):') || '';
            const response = await this.apiFetch(`/api/admin/registrations/${registrationId}/cancel`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.success) {
                await this.loadInitialData();
                const msg = result.email_sent
                    ? 'Registration canceled. Cancellation email sent.'
                    : (result.email_skipped ? 'Registration canceled. Emails are disabled.' : 'Registration canceled.');
                const offers = Array.isArray(result.waitlist_offers) ? result.waitlist_offers : [];
                this.showSuccess(offers.length ? `${msg} The spot was offered to ${offers.map(o => o.email).join(', ')} from the waitlist.` : msg);
                if (this.currentSection === 'registrations') {
                    this.loadRegistrations();
                }
            } else {
                this.showError(result.error || 'Failed to cancel registration');
            }
        } catch (err) {
            console.error('Cancel registration error:', err);
            this.showError('Failed to cancel registration');
        }
    }

    // Uncancel a registration (restore to pending)
    async uncancelRegistration(registrationId) {
        try {
            const response = await this.apiFetch(`/api/admin/registrations/${registrationId}/uncancel`, {
                method: 'PUT'
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.success) {
                await this.loadInitialData();
                this.showSuccess('Registration restored to pending');
                if (this.currentSection === 'registrations') {
                    this.loadRegistrations();
                }
            } else {
                this.showError(result.error || 'Failed to uncancel registration');
            }
        } catch (err) {
            console.error('Uncancel registration error:', err);
            this.showError('Failed to uncancel registration');
        }
    }


    // Utility functions
    showError(message) {
        const toast = document.getElementById('errorToast');
        const body = document.getElementById('errorToastBody');
        body.textContent = message;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    showSuccess(message) {
        const toast = document.getElementById('successToast');
        const body = document.getElementById('successToastBody');
        body.textContent = message;
        
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();
    }

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }






    // =========================
    // Waitlist Management
    // =========================

    async loadWaitlistManagement() {
        await this.refreshWaitlists();
        this.populateWaitlistCourseFilter();
    }

    async refreshWaitlists() {
        const container = document.getElementById('waitlistsContainer');
        const courseFilter = document.getElementById('waitlistCourseFilter');
        
        // Show loading state
        container.innerHTML = `
            <div class="col-12">
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading waitlists...</span>
                    </div>
                    <p class="mt-3 text-muted">Loading waitlist data...</p>
                </div>
            </div>
        `;

        try {
            const courseId = courseFilter?.value || '';
            const url = courseId ? `/api/admin/waitlists?course_id=${courseId}` : '/api/admin/waitlists';
            const response = await this.apiFetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const waitlistData = await response.json();
            this.renderWaitlistCards(waitlistData);
            
        } catch (error) {
            console.error('Error loading waitlists:', error);
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        Failed to load waitlist data: ${error.message}
                    </div>
                </div>
            `;
            this.showError('Failed to load waitlist data');
        }
    }

    populateWaitlistCourseFilter() {
        const select = document.getElementById('waitlistCourseFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="">All classes</option>';
        this.courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            select.appendChild(option);
        });

        // Add event listener for filter changes
        if (!select._waitlistWired) {
            select._waitlistWired = true;
            select.addEventListener('change', () => {
                this.refreshWaitlists();
            });
        }
    }

    renderWaitlistCards(waitlistData) {
        const container = document.getElementById('waitlistsContainer');
        
        if (!waitlistData || !Array.isArray(waitlistData) || waitlistData.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="text-center py-5">
                        <i class="fas fa-list-ol fa-4x text-muted mb-4"></i>
                        <h4>No Waitlists Found</h4>
                        <p class="text-muted">No students are currently on any waitlists, or no courses have waitlists yet.</p>
                    </div>
                </div>
            `;
            return;
        }

        // Group waitlist entries by course
        const groupedByCourse = {};
        waitlistData.forEach(entry => {
            const courseKey = entry.course_id || 'unknown';
            if (!groupedByCourse[courseKey]) {
                groupedByCourse[courseKey] = {
                    course_name: entry.course_name || 'Unknown Course',
                    course_id: entry.course_id,
                    entries: []
                };
            }
            groupedByCourse[courseKey].entries.push(entry);
        });

        const cards = Object.values(groupedByCourse).map(courseWaitlist => {
            const entries = courseWaitlist.entries.sort((a, b) => (a.position || 0) - (b.position || 0));
            
            return `
                <div class="col-lg-6 col-xl-4 mb-4">
                    <div class="card waitlist-card">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">
                                <i class="fas fa-graduation-cap text-primary me-2"></i>
                                ${courseWaitlist.course_name}
                            </h6>
                            <span class="badge bg-warning">${entries.length} waiting</span>
                        </div>
                        <div class="card-body">
                            <div class="waitlist-entries">
                                ${entries.slice(0, 5).map(entry => `
                                    <div class="waitlist-entry d-flex justify-content-between align-items-center py-2 border-bottom">
                                        <div class="d-flex align-items-center">
                                            <div class="form-check me-2">
                                                <input class="form-check-input waitlist-checkbox" type="checkbox" 
                                                       value="${entry.id}" data-course-id="${entry.course_id}">
                                            </div>
                                            <div class="position-badge me-2">
                                                <span class="badge bg-secondary">#${entry.position || '?'}</span>
                                            </div>
                                            <div class="student-info">
                                                <div class="student-name">
                                                    <strong>${[entry.first_name, entry.last_name].filter(Boolean).join(' ').trim() || '(No name)'}</strong>
                                                </div>
                                                <small class="text-muted">
                                                    ${entry.email || '(No email)'}
                                                    ${entry.phone ? ` • ${entry.phone}` : ''}
                                                </small>
                                            </div>
                                        </div>
                                        <div class="waitlist-actions">
                                            <span class="badge bg-${entry.status === 'active' ? 'success' : 
                                                entry.status === 'notified' ? 'warning' : 'secondary'}">
                                                ${({ active: 'Waiting', notified: 'Spot offered', registered: 'Registered', expired: 'Offer expired' })[entry.status] || 'Waiting'}
                                            </span>
                                            ${entry.status === 'notified' && entry.notification_expires_at ? `<div class="cell-sub">until ${new Date(entry.notification_expires_at).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</div>` : ''}
                                        </div>
                                    </div>
                                `).join('')}
                                ${entries.length > 5 ? `
                                    <div class="text-center py-2">
                                        <small class="text-muted">... and ${entries.length - 5} more</small>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="waitlist-stats mt-3">
                                <div class="row text-center">
                                    <div class="col-4">
                                        <div class="stat-number text-success">${entries.filter(e => e.status === 'active').length}</div>
                                        <div class="stat-label">Active</div>
                                    </div>
                                    <div class="col-4">
                                        <div class="stat-number text-warning">${entries.filter(e => e.status === 'notified').length}</div>
                                        <div class="stat-label">Notified</div>
                                    </div>
                                    <div class="col-4">
                                        <div class="stat-number text-muted">${entries.filter(e => e.status === 'expired').length}</div>
                                        <div class="stat-label">Expired</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card-footer">
                            <div class="btn-group w-100" role="group">
                                <button class="btn btn-outline-primary btn-sm" onclick="admin.notifyWaitlistForCourse(${courseWaitlist.course_id})">
                                    <i class="fas fa-envelope"></i> Notify Next
                                </button>
                                <button class="btn btn-outline-info btn-sm" onclick="admin.viewCourseWaitlist(${courseWaitlist.course_id})">
                                    <i class="fas fa-eye"></i> View All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = cards;
    }

    async exportWaitlists() {
        try {
            const courseFilter = document.getElementById('waitlistCourseFilter')?.value || '';
            const params = new URLSearchParams();
            if (courseFilter) params.set('course_id', courseFilter);
            
            const url = `/api/admin/waitlists/export${params.toString() ? `?${params.toString()}` : ''}`;
            window.open(url, '_blank');
            
        } catch (error) {
            console.error('Export waitlists error:', error);
            this.showError('Failed to export waitlists');
        }
    }

    async notifySelectedStudents() {
        const selectedCheckboxes = document.querySelectorAll('.waitlist-checkbox:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));

        if (selectedIds.length === 0) {
            this.showError('Please select at least one student to notify');
            return;
        }

        if (!confirm(`Notify ${selectedIds.length} selected students that spots are available? This will send them registration links.`)) {
            return;
        }

        try {
            const response = await this.apiFetch('/api/admin/waitlists/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    waitlist_ids: selectedIds
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.showSuccess(`Notified ${result.notified_count || selectedIds.length} students successfully`);
                await this.refreshWaitlists();
            } else {
                this.showError(result.error || 'Failed to notify students');
            }
        } catch (error) {
            console.error('Error notifying students:', error);
            this.showError('Failed to notify selected students');
        }
    }

    async removeSelectedFromWaitlist() {
        const selectedCheckboxes = document.querySelectorAll('.waitlist-checkbox:checked');
        const selectedIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.value));

        if (selectedIds.length === 0) {
            this.showError('Please select at least one student to remove');
            return;
        }

        if (!confirm(`Remove ${selectedIds.length} selected students from their waitlists? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await this.apiFetch('/api/admin/waitlists/remove', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    waitlist_ids: selectedIds
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.showSuccess(`Removed ${result.removed_count || selectedIds.length} students from waitlists`);
                await this.refreshWaitlists();
            } else {
                this.showError(result.error || 'Failed to remove students');
            }
        } catch (error) {
            console.error('Error removing students:', error);
            this.showError('Failed to remove selected students');
        }
    }

    async notifyWaitlistForCourse(courseId) {
        if (!confirm('Notify the next student on this waitlist that a spot is available?')) {
            return;
        }

        try {
            const response = await this.apiFetch(`/api/admin/courses/${courseId}/waitlist/notify-next`, {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
                if (result.notified_student) {
                    this.showSuccess(`Notified ${result.notified_student.first_name} ${result.notified_student.last_name} about available spot`);
                } else {
                    this.showSuccess('No active students on waitlist to notify');
                }
                await this.refreshWaitlists();
            } else {
                this.showError(result.error || 'Failed to notify next student');
            }
        } catch (error) {
            console.error('Error notifying next student:', error);
            this.showError('Failed to notify next student');
        }
    }

    async viewCourseWaitlist(courseId) {
        // This could open a modal with detailed waitlist view
        // For now, just filter to show only this course's waitlist
        const courseFilter = document.getElementById('waitlistCourseFilter');
        if (courseFilter) {
            courseFilter.value = courseId;
            await this.refreshWaitlists();
        }
    }

    // =========================
    // Student Management (Phase 1)
    // =========================

    // ---------- Student profile (modal) ----------
    // "Classes taken" counts paid registrations (decided Oct 2026; no roll call).
    async openStudent(id) {
        const C = window.ClassInfo;
        const body = document.getElementById('studentModalBody');
        body.innerHTML = '<p class="empty-line">Loading…</p>';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('studentModal')).show();
        let data;
        try {
            const r = await this.apiFetch(`/api/admin/students/${id}`);
            if (!r.ok) throw new Error();
            data = await r.json();
        } catch (e) {
            body.innerHTML = '<p class="empty-line">Could not load this student.</p>';
            return;
        }
        const st = data.student;
        const isCrew = st.student_type === 'crew_member';
        const tester = st.is_tester === true || st.is_tester === 1 || st.is_tester === 't';
        const name = [st.first_name, st.last_name].filter(Boolean).join(' ') || '(No name)';
        document.getElementById('studentModalTitle').textContent = name;
        const STATUS = { completed: ['Paid', 'pill-ok'], pending: ['Pending', 'pill-warn'], canceled: ['Canceled', 'pill-muted'], failed: ['Failed', 'pill-bad'] };
        const ig = st.instagram_handle ? String(st.instagram_handle).replace(/^@/, '') : '';
        body.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between gap-3 mb-3">
                <div>
                    <div>${C.esc(st.email || '')}</div>
                    <div class="cell-sub">${ig ? `<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">@${C.esc(ig)}</a> · ` : ''}${C.esc(this.formatExperience(st.dance_experience))}${st.created_at ? ` · since ${new Date(st.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}</div>
                </div>
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    ${st.archived_at ? '<span class="pill pill-muted">Hidden</span>' : ''}
                    ${tester ? '<span class="pill pill-bad">Test account</span>' : ''}
                    <span class="pill ${isCrew ? 'pill-accent' : 'pill-muted'}">${isCrew ? 'Crew member' : 'GouMo student'}</span>
                    <button class="btn btn-outline-secondary btn-sm" onclick="admin.classifyStudent(${st.id}, '${isCrew ? 'general' : 'crew_member'}').then(() => admin.openStudent(${st.id}))">${isCrew ? 'Make GouMo student' : 'Make crew member'}</button>
                </div>
            </div>
            <div class="stat-grid mb-3" style="grid-template-columns:repeat(${isCrew || data.totals.crew_practices ? 4 : 3},minmax(0,1fr))">
                <div class="stat"><span class="stat-label">Classes taken</span><span class="stat-number">${isCrew || data.totals.crew_practices ? data.totals.regular_classes : data.totals.classes_paid}</span></div>
                ${isCrew || data.totals.crew_practices ? `<div class="stat"><span class="stat-label">Crew practices</span><span class="stat-number">${data.totals.crew_practices}</span></div>` : ''}
                <div class="stat"><span class="stat-label">Paid</span><span class="stat-number">${this.money(data.totals.amount_paid)}</span></div>
                <div class="stat"><span class="stat-label">Pending</span><span class="stat-number">${data.totals.pending}</span></div>
            </div>
            <h6 class="mb-2">Classes</h6>
            ${data.registrations.length ? `<div class="reg-list mb-3">${data.registrations.map(r => {
                const [label, cls] = STATUS[r.payment_status] || [r.payment_status || '—', 'pill-muted'];
                let ds = [];
                try { const picked = JSON.parse(r.selected_dates || 'null'); ds = Array.isArray(picked) && picked.length ? picked : C.dates(r); } catch (e) { ds = C.dates(r); }
                return `<div class="pending-row px-3">
                    <div class="min-w-0">
                        <div class="fw-semibold">${C.esc(r.course_name || 'Class')}</div>
                        <div class="cell-sub">${C.esc([C.formatDates(ds), r.combo_name ? `Combo: ${r.combo_name}` : ''].filter(Boolean).join(' · '))}</div>
                    </div>
                    <div class="text-end text-nowrap">
                        <div>${this.money(r.payment_amount)} <span class="pill ${cls}">${C.esc(label)}</span></div>
                        <div class="cell-sub">${C.esc(r.payment_method || '')}${r.registration_date ? ` · ${new Date(r.registration_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</div>
                    </div>
                </div>`;
            }).join('')}</div>` : '<p class="empty-line mb-3">No classes yet.</p>'}
            ${data.waitlists.length ? `<h6 class="mb-2">Waitlists</h6><ul class="mb-3">${data.waitlists.map(w => `<li>${C.esc(w.course_name)} · #${w.position}</li>`).join('')}</ul>` : ''}
            ${data.totals.attended_old_records ? `<p class="cell-sub mb-3">Attended (old records): ${data.totals.attended_old_records} class${data.totals.attended_old_records === 1 ? '' : 'es'} marked present before Oct 2026.</p>` : ''}
            <h6 class="mb-2">Private notes <span class="cell-sub">(only you see these)</span></h6>
            <textarea class="form-control mb-2" id="studentNotes" rows="3" placeholder="e.g. missed week 2, strong in footwork">${C.esc(st.admin_notes || '')}</textarea>
            <button class="btn btn-primary btn-sm" onclick="admin.saveStudentNotes(${st.id})">Save notes</button>
            <div class="border-top mt-4 pt-3 d-flex flex-wrap gap-2 align-items-center">
                <button class="btn btn-outline-secondary btn-sm" onclick="admin.setStudentHidden(${st.id}, ${!st.archived_at})">${st.archived_at ? 'Restore profile' : 'Hide profile'}</button>
                <button class="btn btn-outline-secondary btn-sm" onclick="admin.setTester(${st.id}, ${!tester})">${tester ? 'Make a normal account' : 'Make a test account'}</button>
                ${tester ? `<button class="btn btn-outline-danger btn-sm" onclick="admin.resetTestData(${st.id})">Reset test data</button>` : ''}
                <span class="cell-sub">Test accounts can register when classes are full, closed or crew-only, and never count in numbers.</span>
            </div>`;
    }

    async setStudentHidden(id, hide) {
        const r = await this.apiFetch('/api/admin/students/bulk', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], action: hide ? 'archive' : 'restore' })
        });
        if (!r.ok) { this.showError('Could not update this student'); return; }
        this.showSuccess(hide ? 'Profile hidden. Restore it from the Hidden filter.' : 'Profile restored');
        if (this.currentSection === 'students') await this.loadStudentManagement();
        this.openStudent(id);
    }

    async setTester(id, on) {
        const r = await this.apiFetch(`/api/admin/students/${id}/tester`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_tester: on })
        });
        if (!r.ok) { this.showError('Could not update this student'); return; }
        this.showSuccess(on ? 'Now a test account: its registrations no longer count in numbers' : 'Back to a normal account');
        await this.loadInitialData();
        if (this.currentSection === 'students') await this.loadStudentManagement();
        this.openStudent(id);
    }

    async resetTestData(id) {
        if (!confirm('Remove all registrations and waitlist spots for this test account? This cannot be undone.')) return;
        const r = await this.apiFetch(`/api/admin/students/${id}/test-data`, { method: 'DELETE' });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) { this.showError(res.error || 'Could not reset'); return; }
        this.showSuccess(`Removed ${res.removed} test registration${res.removed === 1 ? '' : 's'}`);
        await this.loadInitialData();
        this.openStudent(id);
    }

    async saveStudentNotes(id) {
        const notes = document.getElementById('studentNotes').value;
        const r = await this.apiFetch(`/api/admin/students/${id}/notes`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes })
        });
        if (r.ok) this.showSuccess('Notes saved'); else this.showError('Could not save notes');
    }

    // ---------- Students ----------
    async loadStudentManagement() {
        const list = document.getElementById('studentsList');
        if (!this._studentsWired) {
            this._studentsWired = true;
            document.getElementById('studentSearch').addEventListener('input', () => this.renderStudents());
            document.getElementById('studentTypeChips').addEventListener('click', (e) => {
                const chip = e.target.closest('.chip');
                if (!chip) return;
                this.studentType = chip.dataset.type;
                document.querySelectorAll('#studentTypeChips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === chip)));
                this.renderStudents();
            });
        }
        try {
            const response = await this.apiFetch('/api/admin/students');
            this.students = response.ok ? await response.json() : [];
        } catch (e) {
            this.students = [];
            list.innerHTML = '<p class="empty-line">Could not load students.</p>';
            return;
        }
        this.renderStudents();
    }

    toggleStudentSelection(id, on) {
        this.studentSelection = this.studentSelection || new Set();
        if (on) this.studentSelection.add(id); else this.studentSelection.delete(id);
        this.updateBulkBar();
    }

    selectAllStudents(on) {
        document.querySelectorAll('#studentsList .student-check').forEach(cb => {
            cb.checked = on;
            this.toggleStudentSelection(Number(cb.value), on);
        });
    }

    clearStudentSelection() {
        this.studentSelection = new Set();
        this.renderStudents();
    }

    updateBulkBar() {
        const n = (this.studentSelection || new Set()).size;
        document.getElementById('studentBulkBar').hidden = n === 0;
        document.getElementById('studentBulkCount').textContent = `${n} selected`;
    }

    async bulkStudents(action) {
        const ids = [...(this.studentSelection || [])];
        if (!ids.length) return;
        const words = { archive: 'Hide', restore: 'Restore', make_crew: 'Make crew members:', make_general: 'Make GouMo students:' };
        if (action === 'archive' && !confirm(`Hide ${ids.length} student${ids.length === 1 ? '' : 's'}? Their registrations and payments stay; you can restore them from the Hidden filter.`)) return;
        const r = await this.apiFetch('/api/admin/students/bulk', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, action })
        });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) { this.showError(res.error || 'Could not update students'); return; }
        this.showSuccess(`${words[action].replace(':', '')} · ${res.updated} student${res.updated === 1 ? '' : 's'}`);
        this.studentSelection = new Set();
        await this.loadStudentManagement();
    }

    // ---------- Data check ----------
    async openDataCheck() {
        const body = document.getElementById('dataCheckBody');
        body.innerHTML = '<p class="empty-line">Checking…</p>';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('dataCheckModal')).show();
        let d;
        try {
            const r = await this.apiFetch('/api/admin/data-check');
            d = await r.json();
        } catch (e) { body.innerHTML = '<p class="empty-line">Could not run the check.</p>'; return; }
        const C = window.ClassInfo;
        const legacy = Object.entries(d.legacy_tables || {});
        const LEGACY_NAMES = { attendance_records: 'Old attendance records', class_sessions: 'Old class sessions', competition_registrations: 'Old competition sign-ups', dance_series: 'Old choreography packages' };
        body.innerHTML = `
            <div class="check-item">
                <h6>${d.duplicate_students.length ? '⚠️' : '✅'} Students saved more than once</h6>
                ${d.duplicate_students.length ? `
                    <p class="cell-sub">The same email belongs to more than one profile, so their classes are split across profiles and the counts look too low.</p>
                    <ul>${d.duplicate_students.map(g => `<li>${C.esc(g.email)}: ${g.students.map(s => `#${s.id} (${s.registrations} registration${s.registrations === 1 ? '' : 's'})`).join(', ')}</li>`).join('')}</ul>
                    <button class="btn btn-primary btn-sm" onclick="admin.mergeDuplicates()">Merge duplicates</button>
                    <span class="cell-sub ms-2">Keeps the oldest profile, moves all classes to it, hides the extra ones.</span>`
                : '<p class="cell-sub">None.</p>'}
            </div>
            <div class="check-item">
                <h6>${d.unlinked_registrations.length ? '⚠️' : '✅'} Registrations not linked to a student</h6>
                ${d.unlinked_registrations.length ? `
                    <p class="cell-sub">These count in revenue but don't show on any profile. Use <strong>Link student</strong> on each to attach it to the right person.</p>
                    <ul>${d.unlinked_registrations.slice(0, 15).map(r => `<li>#${r.id} · ${C.esc(r.course_name || 'Class')} · ${this.money(r.payment_amount)} · ${C.esc(r.payment_status || '')} <a href="#" onclick="admin.assignStudent(${r.id});return false">Link student</a></li>`).join('')}</ul>
                    ${d.unlinked_registrations.length > 15 ? `<p class="cell-sub">+ ${d.unlinked_registrations.length - 15} more</p>` : ''}`
                : '<p class="cell-sub">None.</p>'}
            </div>
            <div class="check-item">
                <h6>ℹ️ Students with no registrations</h6>
                <p class="cell-sub">${d.students_without_registrations} profile${d.students_without_registrations === 1 ? '' : 's'} never registered for a class. You can hide them from the Students list (select, then Hide).</p>
            </div>
            <div class="check-item">
                <h6>ℹ️ Data from the old system</h6>
                ${legacy.length ? `<ul>${legacy.map(([t, n]) => `<li>${C.esc(LEGACY_NAMES[t] || t)}: ${n}</li>`).join('')}</ul>
                    <p class="cell-sub">Old attendance (present / late) is shown on each student's profile as "Attended (old records)". The other old tables aren't counted anywhere.</p>`
                : '<p class="cell-sub">No old tables found.</p>'}
            </div>`;
    }

    async mergeDuplicates() {
        if (!confirm('Merge students saved more than once? Their classes move to the oldest profile and the extra profiles are hidden.')) return;
        const r = await this.apiFetch('/api/admin/data-check/merge-duplicates', { method: 'POST' });
        const res = await r.json().catch(() => ({}));
        if (!r.ok) { this.showError(res.error || 'Could not merge'); return; }
        this.showSuccess(`Merged ${res.merged} duplicate profile${res.merged === 1 ? '' : 's'}`);
        await this.loadInitialData();
        if (this.currentSection === 'students') await this.loadStudentManagement();
        this.openDataCheck();
    }

    renderStudents() {
        const C = window.ClassInfo;
        const all = Array.isArray(this.students) ? this.students : [];
        const type = this.studentType || '';
        const q = (document.getElementById('studentSearch').value || '').trim().toLowerCase();
        const isCrew = s => s.student_type === 'crew_member';
        const hidden = s => !!s.archived_at;
        let shown = type === 'archived' ? all.filter(hidden) : all.filter(s => !hidden(s));
        if (type === 'crew_member') shown = shown.filter(isCrew);
        if (type === 'general') shown = shown.filter(s => !isCrew(s));
        this.studentSelection = this.studentSelection || new Set();
        document.getElementById('bulkArchiveBtn').hidden = type === 'archived';
        document.getElementById('bulkRestoreBtn').hidden = type !== 'archived';
        if (q) shown = shown.filter(s => [s.first_name, s.last_name, s.email, s.instagram_handle].join(' ').toLowerCase().includes(q));

        const visible = all.filter(s => !hidden(s));
        const crew = visible.filter(isCrew).length;
        const hiddenCount = all.length - visible.length;
        document.getElementById('studentSummary').textContent = `${visible.length} students · ${visible.length - crew} GouMo students · ${crew} crew members${hiddenCount ? ` · ${hiddenCount} hidden` : ''}`;
        this.updateBulkBar();

        const el = document.getElementById('studentsList');
        if (!shown.length) {
            el.innerHTML = '<div class="empty-state"><h4>No students found</h4><p>Nothing matches this search.</p></div>';
            return;
        }
        el.innerHTML = `
            <div class="panel p-0">
                <div class="table-responsive">
                    <table class="table admin-table students-table mb-0">
                        <thead><tr><th class="sel"><input type="checkbox" class="form-check-input" aria-label="Select all" onchange="admin.selectAllStudents(this.checked)"></th><th>Student</th><th>Instagram</th><th>Experience</th><th class="text-end">Classes paid</th><th>Type</th><th></th></tr></thead>
                        <tbody>
                            ${shown.map(s => `
                            <tr>
                                <td class="sel"><input type="checkbox" class="form-check-input student-check" value="${s.id}" ${this.studentSelection.has(s.id) ? 'checked' : ''} onchange="admin.toggleStudentSelection(${s.id}, this.checked)" aria-label="Select student"></td>
                                <td><a href="#" class="row-link" onclick="admin.openStudent(${s.id});return false">${C.esc([s.first_name, s.last_name].filter(Boolean).join(' ') || '(No name)')}</a><div class="cell-sub">${C.esc(s.email || '')}</div></td>
                                <td>${s.instagram_handle ? `<a href="https://instagram.com/${encodeURIComponent(String(s.instagram_handle).replace(/^@/, ''))}" target="_blank" rel="noopener">@${C.esc(String(s.instagram_handle).replace(/^@/, ''))}</a>` : '<span class="cell-sub">—</span>'}</td>
                                <td>${C.esc(this.formatExperience(s.dance_experience))}</td>
                                <td class="text-end">${s.paid_classes}${s.pending_classes ? ` <span class="cell-sub">+${s.pending_classes} pending</span>` : ''}</td>
                                <td><span class="pill ${isCrew(s) ? 'pill-accent' : 'pill-muted'}">${isCrew(s) ? 'Crew member' : 'GouMo student'}</span>${s.is_tester ? ' <span class="pill pill-bad">Test account</span>' : ''}</td>
                                <td class="text-end">
                                    <button class="btn btn-outline-secondary btn-sm text-nowrap" onclick="admin.classifyStudent(${s.id}, '${isCrew(s) ? 'general' : 'crew_member'}')">${isCrew(s) ? 'Make GouMo student' : 'Make crew member'}</button>
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }

    async classifyStudent(studentId, studentType) {
        try {
            const response = await this.apiFetch(`/api/admin/students/${studentId}/classify`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_type: studentType })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                this.showError(result.error || 'Failed to update student');
                return;
            }
            this.showSuccess(studentType === 'crew_member' ? 'Now a crew member: crew-only classes are open to them' : 'Now a GouMo student');
            await this.loadStudentManagement();
        } catch (error) {
            console.error('Error classifying student:', error);
            this.showError('Failed to update student');
        }
    }

    formatExperience(experience) {
        const experiences = {
            beginner: 'Beginner',
            some_experience: '1–2 years',
            intermediate: '2–5 years',
            advanced: '5+ years',
            professional: 'Professional'
        };
        return experiences[experience] || experience || '—';
    }


}

/**
 * Global fallback functions so buttons work even if class initialization fails.
 * These do not expose secrets and will show alerts if toasts are unavailable.
 */
window.quickConfirmPayment = async function(registrationId, el) {
    console.info('UI: quickConfirmPayment clicked', { registrationId, time: new Date().toISOString() });
    // Optimistic UI: disable button and show spinner text
    let originalHtml;
    if (el && el instanceof HTMLElement) {
        el.disabled = true;
        originalHtml = el.innerHTML;
        el.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Confirming...';
    }
    try {
        const response = await fetch(`/api/admin/registrations/${registrationId}/confirm-payment`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                venmo_transaction_note: 'Venmo payment confirmed by admin'
            })
        });

        if (response.ok) {
            const result = await response.json();

            // Prefer toast UI if AdminDashboard is ready
            if (window.admin && typeof admin.loadInitialData === 'function') {
                await admin.loadInitialData();
                if (result.email_queued) {
                    admin.showSuccess('Payment confirmed. Confirmation email is being sent.');
                } else if (result.email_sent) {
                    admin.showSuccess('Payment confirmed. Confirmation email sent.');
                } else if (result.email_skipped) {
                    admin.showSuccess('Payment confirmed. Email notifications are disabled.');
                } else if (result.email_error) {
                    admin.showError(`Payment confirmed but email could not be sent: ${result.email_error}`);
                } else {
                    admin.showSuccess('Venmo payment confirmed successfully!');
                }
                if (admin.currentSection === 'registrations') {
                    admin.loadRegistrations();
                }
            } else {
                // Fallback UX
                if (result.email_error) {
                    alert(`Payment confirmed but email failed: ${result.email_error}`);
                } else {
                    alert('Payment confirmed. If emails are enabled, a confirmation has been sent.');
                }
                location.reload();
            }
        } else {
            const error = await response.json().catch(() => ({}));
            if (window.admin && typeof admin.showError === 'function') {
                admin.showError(error.error || 'Failed to confirm payment');
            } else {
                alert(error.error || 'Failed to confirm payment');
            }
        }
    } catch (err) {
        if (window.admin && typeof admin.showError === 'function') {
            admin.showError('Failed to confirm payment');
        } else {
            alert('Failed to confirm payment');
        }
        // Also log to console for debugging in dev tools
        console.error('quickConfirmPayment error:', err);
    } finally {
        if (el && el instanceof HTMLElement) {
            el.disabled = false;
            if (originalHtml) {
                el.innerHTML = originalHtml;
            }
        }
    }
};

window.markPaidModal = function(registrationId, el) {
    console.info('UI: markPaidModal clicked', { registrationId, time: new Date().toISOString() });
    if (window.admin && typeof admin.markPaid === 'function') {
        admin.markPaid(registrationId);
    } else {
        alert('Admin not initialized yet. Please refresh the page and try again.');
    }
};

// Initialize the admin dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.admin = new AdminDashboard();
});

// Safety: ensure overlay never blocks clicks even if initialization errors
window.addEventListener('load', () => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
});
