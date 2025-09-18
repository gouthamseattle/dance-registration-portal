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
            const [settingsResponse, coursesResponse, registrationsResponse] = await Promise.all([
                this.apiFetch('/api/settings'),
                this.apiFetch('/api/courses'),
                this.apiFetch('/api/registrations')
            ]);

            this.settings = await settingsResponse.json();
            this.courses = await coursesResponse.json();
            this.registrations = await registrationsResponse.json();

            this.updateDashboardStats();
            this.updateRegistrationToggle();
            this.loadRecentRegistrations();
            this.populateFilters();
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
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        // Show selected section
        document.getElementById(`${sectionName}Section`).style.display = 'block';
        this.currentSection = sectionName;

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
            case 'reports':
                this.loadReports();
                break;
            case 'students':
                this.loadStudentManagement();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    updateDashboardStats() {
        // Ensure data is always an array to prevent filter errors
        const registrations = Array.isArray(this.registrations) ? this.registrations : [];
        const courses = Array.isArray(this.courses) ? this.courses : [];
        
        const totalRegs = registrations.length;
        const completedRegs = registrations.filter(r => r.payment_status === 'completed');
        const pendingRegs = registrations.filter(r => r.payment_status === 'pending');
        const activeCourses = courses.filter(c => c.is_active).length;
        
        const totalRevenue = completedRegs.reduce((sum, reg) => sum + parseFloat(reg.payment_amount || 0), 0);

        document.getElementById('totalRegistrations').textContent = totalRegs;
        document.getElementById('totalRevenue').textContent = `$${totalRevenue.toFixed(2)}`;
        document.getElementById('activeCourses').textContent = activeCourses;
        document.getElementById('pendingPayments').textContent = pendingRegs.length;

        // Add click handlers to stat cards for navigation
        this.addStatCardClickHandlers();
    }

    addStatCardClickHandlers() {
        // Add click handler to Active Courses card
        const activeCoursesCard = document.getElementById('activeCourses').closest('.card');
        if (activeCoursesCard) {
            activeCoursesCard.style.cursor = 'pointer';
            activeCoursesCard.onclick = () => this.showSection('courses');
        }

        // Add click handler to Total Registrations card
        const totalRegsCard = document.getElementById('totalRegistrations').closest('.card');
        if (totalRegsCard) {
            totalRegsCard.style.cursor = 'pointer';
            totalRegsCard.onclick = () => this.showSection('registrations');
        }

        // Add click handler to Pending Payments card
        const pendingPaymentsCard = document.getElementById('pendingPayments').closest('.card');
        if (pendingPaymentsCard) {
            pendingPaymentsCard.style.cursor = 'pointer';
            pendingPaymentsCard.onclick = () => {
                this.showSection('registrations');
                // Set filter to pending after a short delay to ensure section loads
                setTimeout(() => {
                    const statusFilter = document.getElementById('regStatusFilter');
                    if (statusFilter) {
                        statusFilter.value = 'pending';
                        this.filterRegistrations();
                    }
                }, 100);
            };
        }
    }

    updateRegistrationToggle() {
        const toggle = document.getElementById('registrationToggle');
        const status = document.getElementById('registrationStatus');
        
        const isOpen = this.settings.registration_open === 'true';
        toggle.checked = isOpen;
        status.textContent = isOpen ? 'Open' : 'Closed';
        status.className = `form-check-label ${isOpen ? 'text-success' : 'text-danger'}`;
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

    loadRecentRegistrations() {
        const container = document.getElementById('recentRegistrations');
        
        // Ensure registrations is always an array to prevent sort errors
        const registrations = Array.isArray(this.registrations) ? this.registrations : [];
        const recentRegs = registrations
            .sort((a, b) => new Date(b.registration_date) - new Date(a.registration_date))
            .slice(0, 10);

        if (recentRegs.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">No registrations yet</p>';
            return;
        }

        const table = document.createElement('div');
        table.className = 'table-responsive';
        table.innerHTML = `
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Student</th>
                        <th>Course</th>
                        <th>Amount</th>
                        <th>Payment Method</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentRegs.map(reg => `
                        <tr>
                            <td><code>#${reg.id}</code></td>
                            <td>
                                <div>
                                    <strong>${([reg.first_name, reg.last_name].filter(Boolean).join(' ').trim()) || '(No name)'}</strong><br>
                                    <small class="text-muted">${reg.email}</small><br>
                                    ${reg.instagram_id ? `<small class="text-muted">@${reg.instagram_id}</small>` : ''}
                                </div>
                            </td>
                            <td>${reg.course_name || 'Drop-in Class'}</td>
                            <td>$${parseFloat(reg.payment_amount).toFixed(2)}</td>
                            <td>${this.getPaymentMethodBadge(reg.payment_method)}</td>
                            <td>
                                <span class="status-badge status-${reg.payment_status}">
                                    ${reg.payment_status}
                                </span>
                            </td>
                            <td>${new Date(reg.registration_date).toLocaleDateString()}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = '';
        container.appendChild(table);
    }

    // Reports: load analytics and render
    async loadReports() {
        try {
            const seriesEl = document.getElementById('reportsBySeries');
            const statusEl = document.getElementById('reportsByStatus');
            if (seriesEl) seriesEl.innerHTML = '<div class="text-muted">Loading...</div>';
            if (statusEl) statusEl.innerHTML = '<div class="text-muted">Loading...</div>';

            const [seriesRes, statusRes] = await Promise.all([
                this.apiFetch('/api/admin/analytics/registrations-by-series'),
                this.apiFetch('/api/admin/analytics/registrations-by-status')
            ]);

            const seriesData = await seriesRes.json();
            const statusData = await statusRes.json();

            this.renderReportsBySeries(seriesData);
            this.renderReportsByStatus(statusData);

            const btn = document.getElementById('refreshReportsBtn');
            if (btn && !btn._wired) {
                btn._wired = true;
                btn.addEventListener('click', () => this.loadReports());
            }
        } catch (e) {
            console.error('Reports load error:', e);
            const seriesEl = document.getElementById('reportsBySeries');
            const statusEl = document.getElementById('reportsByStatus');
            if (seriesEl) seriesEl.innerHTML = '<div class="text-danger">Failed to load reports</div>';
            if (statusEl) statusEl.innerHTML = '<div class="text-danger">Failed to load reports</div>';
            this.showError('Failed to load reports');
        }
    }

    renderReportsBySeries(series) {
        const el = document.getElementById('reportsBySeries');
        if (!el) return;
        if (!Array.isArray(series) || series.length === 0) {
            el.innerHTML = '<div class="text-muted">No data</div>';
            return;
        }
        const table = document.createElement('div');
        table.className = 'table-responsive';
        table.innerHTML = `
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Series</th>
                        <th class="text-end">Total</th>
                        <th class="text-end text-success">Completed</th>
                        <th class="text-end text-warning">Pending</th>
                        <th class="text-end text-danger">Failed</th>
                    </tr>
                </thead>
                <tbody>
                    ${series.map(r => `
                        <tr>
                            <td>${r.course_name}</td>
                            <td class="text-end">${r.total}</td>
                            <td class="text-end text-success">${r.completed}</td>
                            <td class="text-end text-warning">${r.pending}</td>
                            <td class="text-end text-danger">${r.failed}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        el.innerHTML = '';
        el.appendChild(table);
    }

    renderReportsByStatus(data) {
        const el = document.getElementById('reportsByStatus');
        if (!el) return;
        const totals = data?.totals || { completed: 0, pending: 0, failed: 0, other: 0 };
        const breakdown = data?.breakdown || [];
        const totalCount = breakdown.reduce((sum, r) => sum + (r.count || 0), 0);
        const pct = (n) => totalCount ? Math.round((n / totalCount) * 100) : 0;

        el.innerHTML = `
            <ul class="list-group">
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><span class="badge bg-success me-2">&nbsp;</span>Paid</span>
                    <span>${totals.completed} (${pct(totals.completed)}%)</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><span class="badge bg-warning me-2">&nbsp;</span>Pending</span>
                    <span>${totals.pending} (${pct(totals.pending)}%)</span>
                </li>
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><span class="badge bg-danger me-2">&nbsp;</span>Failed</span>
                    <span>${totals.failed} (${pct(totals.failed)}%)</span>
                </li>
                ${totals.other ? `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span><span class="badge bg-secondary me-2">&nbsp;</span>Other</span>
                    <span>${totals.other} (${pct(totals.other)}%)</span>
                </li>` : ''}
            </ul>
        `;
    }

    loadDashboard() {
        this.updateDashboardStats();
        this.loadRecentRegistrations();
    }


    loadCourses() {
        this.filterCourses();
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
        const container = document.getElementById('coursesGrid');
        
        if (courses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-graduation-cap"></i>
                    <h4>No Dance Series Found</h4>
                    <p>Create your first dance series to start accepting registrations.</p>
                    <button class="btn btn-primary" onclick="admin.showCreateCourse()">
                        <i class="fas fa-plus"></i>
                        Create Dance Series
                    </button>
                </div>
            `;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'row';
        
        courses.forEach(course => {
            const col = document.createElement('div');
            col.className = 'col-lg-6 col-xl-4 course-grid-item';
            
            const availableSpots = course.available_spots || 0;
            const capacity = course.capacity || 0;
            const fillPercentage = capacity > 0 ? ((capacity - availableSpots) / capacity) * 100 : 0;
            
            col.innerHTML = `
                <div class="card course-card">
                    <div class="card-header">
                        <h6 class="card-title">${course.name}</h6>
                        <p class="card-subtitle">${course.level || 'All Levels'}</p>
                    </div>
                    <div class="card-body">
                        ${course.description ? `<p class="text-muted small mb-3">${course.description}</p>` : ''}
                        
                        <div class="course-info mb-3">
                            <div class="course-info-item">
                                <i class="fas fa-users"></i>
                                <span>${course.registration_count || 0}/${capacity} registered</span>
                            </div>
                            ${course.duration_weeks ? `
                                <div class="course-info-item">
                                    <i class="fas fa-calendar"></i>
                                    <span>${course.duration_weeks} weeks</span>
                                </div>
                            ` : ''}
                            ${course.schedule_info ? `
                                <div class="course-info-item">
                                    <i class="fas fa-clock"></i>
                                    <span>${course.schedule_info}</span>
                                </div>
                            ` : ''}
                        </div>

                        <div class="progress mb-3" style="height: 8px;">
                            <div class="progress-bar ${fillPercentage > 80 ? 'bg-warning' : 'bg-success'}" 
                                 style="width: ${fillPercentage}%"></div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <div>
                                ${course.full_course_price ? `<strong>$${course.full_course_price}</strong> full` : ''}
                                ${course.per_class_price ? `<br><strong>$${course.per_class_price}</strong> per class` : ''}
                            </div>
                            <span class="status-badge ${course.is_active ? 'status-completed' : 'status-pending'}">
                                ${course.is_active ? 'Active' : 'Inactive'}
                            </span>
                        </div>

                        <div class="course-actions">
                            <button class="btn btn-outline-primary btn-sm" onclick="admin.editCourse(${course.id})">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            <button class="btn btn-outline-success btn-sm" onclick="admin.toggleCourseStatus(${course.id}, ${!course.is_active})">
                                <i class="fas fa-${course.is_active ? 'pause' : 'play'}"></i>
                                ${course.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            grid.appendChild(col);
        });
        
        container.innerHTML = '';
        container.appendChild(grid);
    }

    loadRegistrations() {
        this.filterRegistrations();
    }

    filterRegistrations() {
        const courseFilter = document.getElementById('regCourseFilter').value;
        const statusFilter = document.getElementById('regStatusFilter').value;
        const paymentMethodFilter = document.getElementById('regPaymentMethodFilter').value;
        
        let filteredRegs = [...this.registrations];
        
        if (courseFilter) {
            filteredRegs = filteredRegs.filter(r => Number(r.course_id) === Number(courseFilter));
        }
        
        if (statusFilter) {
            filteredRegs = filteredRegs.filter(r => r.payment_status === statusFilter);
        }

        if (paymentMethodFilter) {
            filteredRegs = filteredRegs.filter(r => {
                const method = String(r.payment_method || '').toLowerCase();
                return method === paymentMethodFilter.toLowerCase();
            });
        }

        this.renderRegistrationsTable(filteredRegs);
    }

    renderRegistrationsTable(registrations) {
        const container = document.getElementById('registrationsTable');
        
        if (registrations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h4>No Registrations Found</h4>
                    <p>No registrations match your current filters.</p>
                </div>
            `;
            return;
        }

        const table = document.createElement('div');
        table.className = 'table-responsive';
        table.innerHTML = `
            <table class="table table-hover">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Student</th>
                        <th>Course</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Payment Method</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${registrations.map(reg => `
                        <tr>
                            <td><code>#${reg.id}</code></td>
                            <td>
                                <div>
                                    <strong>${([reg.first_name, reg.last_name].filter(Boolean).join(' ').trim()) || '(No name)'}</strong><br>
                                    ${reg.email ? `<small class="text-muted">${reg.email}</small><br>` : `<small class="text-muted">(no email)</small><br>`}
                                    ${reg.instagram_id ? `<small class="text-muted">@${reg.instagram_id}</small><br>` : ''}
                                    ${reg.dance_experience ? `<small class="text-muted">${reg.dance_experience}</small>` : ''}
                                </div>
                            </td>
                            <td>
                                <strong>${reg.course_name || 'Drop-in Class'}</strong>
                                ${reg.class_date ? `<br><small class="text-muted">${new Date(reg.class_date).toLocaleDateString()}</small>` : ''}
                            </td>
                            <td>
                                <span class="badge bg-secondary">${reg.registration_type || '—'}</span>
                            </td>
                            <td>$${parseFloat(reg.payment_amount).toFixed(2)}</td>
                            <td>${this.getPaymentMethodBadge(reg.payment_method)}</td>
                            <td>
                                <span class="status-badge status-${reg.payment_status}">
                                    ${reg.payment_status}
                                </span>
                            </td>
                            <td>${new Date(reg.registration_date).toLocaleDateString()}</td>
                            <td>
                                <div class="btn-group btn-group-sm">
                                    ${!reg.email ? `
                                    <button class="btn btn-outline-warning" onclick="admin.assignStudent(${reg.id})" title="Assign Student">
                                        <i class="fas fa-user-plus"></i>
                                    </button>
                                    ` : ''}
                                    <button class="btn btn-outline-info" onclick="admin.viewRegistration(${reg.id})" title="View Details">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                    ${reg.payment_status === 'pending' ? `
                                    <button class="btn btn-outline-success" onclick="window.markPaidModal(${reg.id}, this)" title="Mark as Paid (with note)">
                                        <i class="fas fa-pen"></i>
                                    </button>
                                    <button class="btn btn-success" onclick="window.quickConfirmPayment(${reg.id}, this)" title="Quick Confirm Payment">
                                        <i class="fas fa-check"></i>
                                    </button>
                                    ` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.innerHTML = '';
        container.appendChild(table);
    }

    loadSettings() {
        // Populate settings form
        document.getElementById('appName').value = this.settings.app_name || '';
        document.getElementById('currency').value = this.settings.currency || 'USD';
        document.getElementById('venmoUsername').value = this.settings.venmo_username || 'sangou';
        document.getElementById('maxRegistrations').value = this.settings.max_registrations_per_student || '5';
        document.getElementById('allowSameDayDropins').checked = this.settings.allow_same_day_dropins === 'true';
        document.getElementById('emailNotifications').checked = this.settings.email_notifications_enabled === 'true';
    }

    populateFilters() {
        // Populate course filter for registrations
        const courseSelect = document.getElementById('regCourseFilter');
        courseSelect.innerHTML = '<option value="">All Dance Series</option>';
        this.courses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.name;
            courseSelect.appendChild(option);
        });
    }

    // Modal Functions
    showCreateCourse() {
        document.getElementById('courseModalTitle').textContent = 'Create Dance Series';
        document.getElementById('courseForm').reset();
        document.getElementById('courseId').value = '';
        
        // Clear slots container
        document.getElementById('slotsContainer').innerHTML = '';
        
        // Add initial slot
        this.addSlot();
        
        // Set up course type change listener
        this.setupCourseTypeListener();
        
        const modal = new bootstrap.Modal(document.getElementById('courseModal'));
        modal.show();
    }


    async saveCourse() {
        const courseId = document.getElementById('courseId').value;
        const name = document.getElementById('courseName').value.trim();
        const courseType = document.getElementById('courseType').value;
        const description = document.getElementById('courseDescription').value || null;
        const duration = parseInt(document.getElementById('courseDuration').value) || 1;
        const startDate = document.getElementById('startDate').value || null;
        
        // Validate required fields
        if (!name || !courseType) {
            this.showError('Required fields missing: name and course_type are required');
            return;
        }
        
        // Collect slots data
        const slots = this.collectSlotsData();
        if (slots.length === 0) {
            this.showError('At least one slot is required');
            return;
        }
        
        // Validate course type constraints
        if (courseType === 'crew_practice' && slots.length > 1) {
            this.showError('Crew Practice can only have one slot');
            return;
        }
        
        const courseData = {
            name: name,
            description: description,
            course_type: courseType,
            duration_weeks: duration,
            start_date: startDate,
            slots: slots
        };

        try {
            const url = courseId ? `/api/courses/${courseId}` : '/api/courses';
            const method = courseId ? 'PUT' : 'POST';
            
            const response = await this.apiFetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(courseData)
            });

            if (response.ok) {
                const modal = bootstrap.Modal.getInstance(document.getElementById('courseModal'));
                modal.hide();
                
                await this.loadInitialData();
                this.showSuccess(`Course ${courseId ? 'updated' : 'created'} successfully`);
                
                if (this.currentSection === 'courses') {
                    this.loadCourses();
                }
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to save course');
            }
        } catch (error) {
            console.error('Error saving course:', error);
            this.showError('Failed to save course');
        }
    }

    // Slot Management Functions
    setupCourseTypeListener() {
        const courseTypeField = document.getElementById('courseType');
        const addSlotBtn = document.getElementById('addSlotBtn');
        const slotInfoText = document.getElementById('slotInfoText');
        
        const updateSlotConstraints = () => {
            const courseType = courseTypeField.value;
            const slotsContainer = document.getElementById('slotsContainer');
            const currentSlots = slotsContainer.children.length;
            
            if (courseType === 'crew_practice') {
                addSlotBtn.style.display = currentSlots >= 1 ? 'none' : 'inline-block';
                slotInfoText.textContent = 'Crew Practice is limited to one slot only.';
                
                // Remove extra slots if switching to crew practice
                while (slotsContainer.children.length > 1) {
                    slotsContainer.removeChild(slotsContainer.lastChild);
                }
            } else {
                addSlotBtn.style.display = 'inline-block';
                slotInfoText.textContent = 'Dance Series and Drop In Classes can have multiple slots. Crew Practice is limited to one slot.';
            }
        };
        
        courseTypeField.addEventListener('change', () => {
            updateSlotConstraints();
            this.updatePricingUIForCourseType();
        });
        updateSlotConstraints(); // Initial call
        this.updatePricingUIForCourseType();
    }

    updatePricingUIForCourseType() {
        const courseType = document.getElementById('courseType').value;
        const slotsContainer = document.getElementById('slotsContainer');
        Array.from(slotsContainer.children).forEach(slotCard => {
            const fullGroup = slotCard.querySelector('.full-price-group');
            const fullInput = slotCard.querySelector('.slot-full-price');
            const dropInInput = slotCard.querySelector('.slot-drop-in-price');
            const dayGroup = slotCard.querySelector('.day-of-week-group');
            const practiceDateGroup = slotCard.querySelector('.practice-date-group');
            const practiceDateInput = slotCard.querySelector('.slot-practice-date');

            // Pricing visibility/requirements
            if (!dropInInput) return;
            if (courseType === 'dance_series') {
                if (fullGroup) fullGroup.style.display = '';
                if (fullInput) fullInput.required = true;
                dropInInput.required = true;
            } else {
                if (fullGroup) fullGroup.style.display = 'none';
                if (fullInput) {
                    fullInput.required = false;
                    fullInput.value = '';
                }
                dropInInput.required = true;
            }

            // Crew Practice: show practice date, hide day-of-week
            if (courseType === 'crew_practice') {
                if (dayGroup) dayGroup.style.display = 'none';
                if (practiceDateGroup) practiceDateGroup.style.display = '';
                if (practiceDateInput) practiceDateInput.required = true;
            } else {
                if (dayGroup) dayGroup.style.display = '';
                if (practiceDateGroup) practiceDateGroup.style.display = 'none';
                if (practiceDateInput) {
                    practiceDateInput.required = false;
                }
            }
        });
    }

    addSlot() {
        const slotsContainer = document.getElementById('slotsContainer');
        const courseType = document.getElementById('courseType').value;
        const slotIndex = slotsContainer.children.length;
        
        // Check crew practice constraint
        if (courseType === 'crew_practice' && slotIndex >= 1) {
            this.showError('Crew Practice can only have one slot');
            return;
        }
        
        const slotHtml = `
            <div class="slot-card card mb-3" data-slot-index="${slotIndex}">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">Slot ${slotIndex + 1}</h6>
                    <button type="button" class="btn btn-outline-danger btn-sm" onclick="admin.removeSlot(${slotIndex})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Slot Name</label>
                            <input type="text" class="form-control slot-name" placeholder="e.g., Beginner Session" value="Main Session">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Difficulty Level *</label>
                            <select class="form-select slot-difficulty" required>
                                <option value="All Levels">All Levels</option>
                                <option value="Beginner">Beginner</option>
                                <option value="Intermediate">Intermediate</option>
                                <option value="Advanced">Advanced</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Capacity *</label>
                            <input type="number" class="form-control slot-capacity" min="1" max="100" required value="20">
                        </div>
                        <div class="col-md-4 mb-3 day-of-week-group">
                            <label class="form-label">Day of Week</label>
                            <select class="form-select slot-day">
                                <option value="">Select Day</option>
                                <option value="Monday">Monday</option>
                                <option value="Tuesday">Tuesday</option>
                                <option value="Wednesday">Wednesday</option>
                                <option value="Thursday">Thursday</option>
                                <option value="Friday">Friday</option>
                                <option value="Saturday">Saturday</option>
                                <option value="Sunday">Sunday</option>
                            </select>
                        </div>
                        <div class="col-md-4 mb-3 practice-date-group" style="display: none;">
                            <label class="form-label">Practice Date *</label>
                            <input type="date" class="form-control slot-practice-date">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Location</label>
                            <input type="text" class="form-control slot-location" placeholder="e.g., Studio A">
                        </div>
                    </div>
                    
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Start Time</label>
                            <input type="time" class="form-control slot-start-time">
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label">End Time</label>
                            <input type="time" class="form-control slot-end-time">
                        </div>
                    </div>
                    
                    <div class="pricing-section">
                        <h6 class="mb-3">Pricing for this Slot</h6>
                        <div class="row">
                            <div class="col-md-6 mb-3 full-price-group">
                                <label class="form-label">Full Package Price *</label>
                                <div class="input-group">
                                    <span class="input-group-text">$</span>
                                    <input type="number" class="form-control slot-full-price" min="0" step="0.01" required>
                                </div>
                                <div class="form-text">Total price for entire series/class</div>
                            </div>
                            <div class="col-md-6 mb-3 drop-in-price-group">
                                <label class="form-label">Drop In Fee (per class) *</label>
                                <div class="input-group">
                                    <span class="input-group-text">$</span>
                                    <input type="number" class="form-control slot-drop-in-price" min="0" step="0.01" required>
                                </div>
                                <div class="form-text">Price per individual class session</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        slotsContainer.insertAdjacentHTML('beforeend', slotHtml);
        
        // Adjust pricing UI for current course type
        this.updatePricingUIForCourseType();

        // Update add button visibility
        this.updateAddSlotButton();
    }

    removeSlot(slotIndex) {
        const slotsContainer = document.getElementById('slotsContainer');
        const slotCard = slotsContainer.querySelector(`[data-slot-index="${slotIndex}"]`);
        
        if (slotCard) {
            // Don't allow removing the last slot
            if (slotsContainer.children.length <= 1) {
                this.showError('A course must have at least one slot');
                return;
            }
            
            slotCard.remove();
            
            // Re-index remaining slots
            Array.from(slotsContainer.children).forEach((slot, index) => {
                slot.setAttribute('data-slot-index', index);
                const header = slot.querySelector('.card-header h6');
                if (header) {
                    header.textContent = `Slot ${index + 1}`;
                }
                const removeBtn = slot.querySelector('.btn-outline-danger');
                if (removeBtn) {
                    removeBtn.setAttribute('onclick', `admin.removeSlot(${index})`);
                }
            });
        }
        
        // Update add button visibility
        this.updateAddSlotButton();
    }

    updateAddSlotButton() {
        const courseType = document.getElementById('courseType').value;
        const slotsContainer = document.getElementById('slotsContainer');
        const addSlotBtn = document.getElementById('addSlotBtn');
        const currentSlots = slotsContainer.children.length;
        
        if (courseType === 'crew_practice') {
            addSlotBtn.style.display = currentSlots >= 1 ? 'none' : 'inline-block';
        } else {
            addSlotBtn.style.display = 'inline-block';
        }
    }

    collectSlotsData() {
        const slotsContainer = document.getElementById('slotsContainer');
        const slots = [];
        
        Array.from(slotsContainer.children).forEach(slotCard => {
            const slotName = slotCard.querySelector('.slot-name').value || 'Main Session';
            const difficulty = slotCard.querySelector('.slot-difficulty').value;
            const capacity = parseInt(slotCard.querySelector('.slot-capacity').value);
            const dayOfWeek = slotCard.querySelector('.slot-day').value || null;
            const practiceDateEl = slotCard.querySelector('.slot-practice-date');
            const practiceDate = practiceDateEl ? (practiceDateEl.value || null) : null;
            const startTime = slotCard.querySelector('.slot-start-time').value || null;
            const endTime = slotCard.querySelector('.slot-end-time').value || null;
            const location = slotCard.querySelector('.slot-location').value || null;
            const courseType = document.getElementById('courseType').value;
            const fullPriceInput = slotCard.querySelector('.slot-full-price');
            const dropInPriceInput = slotCard.querySelector('.slot-drop-in-price');
            const fullPrice = fullPriceInput ? parseFloat(fullPriceInput.value) : NaN;
            const dropInPrice = dropInPriceInput ? parseFloat(dropInPriceInput.value) : NaN;
            
            // Validate required fields (pricing depends on course type)
            if (!difficulty || !capacity) {
                return; // Skip invalid slots
            }
            // Crew practice requires a specific practice date
            if (courseType === 'crew_practice' && !practiceDate) {
                return; // practice_date required
            }
            
            const pricing = {};
            if (courseType === 'dance_series') {
                if (isNaN(fullPrice) || isNaN(dropInPrice)) {
                    return; // Both required for dance series
                }
                pricing.full_package = fullPrice;
                pricing.drop_in = dropInPrice;
            } else {
                if (isNaN(dropInPrice)) {
                    return; // Drop-in price required for drop_in and crew_practice
                }
                pricing.drop_in = dropInPrice;
            }
            
            slots.push({
                slot_name: slotName,
                difficulty_level: difficulty,
                capacity: capacity,
                day_of_week: courseType === 'crew_practice' ? null : dayOfWeek,
                practice_date: practiceDate,
                start_time: startTime,
                end_time: endTime,
                location: location,
                pricing: pricing
            });
        });
        
        return slots;
    }

    async saveSettings() {
        const form = document.getElementById('settingsForm');
        const formData = new FormData(form);
        
        const settings = {
            app_name: formData.get('app_name'),
            currency: formData.get('currency'),
            max_registrations_per_student: formData.get('max_registrations_per_student'),
            allow_same_day_dropins: formData.has('allow_same_day_dropins').toString(),
            email_notifications_enabled: formData.has('email_notifications_enabled').toString()
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

    getPublicUrl() {
        const currentUrl = window.location.origin;
        
        // Check if we're on localhost and provide the IP-based URL
        if (currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')) {
            return {
                url: 'http://10.0.0.24:3000',
                isLocal: true,
                warning: 'Using your computer\'s IP address for mobile access. Make sure mobile devices are on the same WiFi network.'
            };
        }
        
        return {
            url: currentUrl,
            isLocal: false,
            warning: null
        };
    }
    generateShareLink() {
        const urlInfo = this.getPublicUrl();
        const shareContent = document.getElementById('shareContent');
        
        shareContent.innerHTML = `
            <div class="share-content">
                <h6>Registration Link</h6>
                ${urlInfo.isLocal ? `
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-wifi"></i>
                        <strong>Mobile-Ready:</strong> This IP address will work on mobile devices connected to the same WiFi network.
                    </div>
                ` : ''}
                <div class="share-link mb-3">${urlInfo.url}</div>
                <button class="btn btn-outline-primary btn-sm mb-2" onclick="admin.copyToClipboard('${urlInfo.url}')">
                    <i class="fas fa-copy"></i> Copy Link
                </button>
                ${urlInfo.isLocal ? `
                    <div class="deployment-options mt-3">
                        <h6>For Public Access:</h6>
                        <div class="small text-muted">
                            <strong>Current:</strong> Works on your local WiFi network<br>
                            <strong>For internet access:</strong> Deploy to Heroku, Vercel, or similar platform
                        </div>
                        <button class="btn btn-outline-info btn-sm mt-2" onclick="admin.showDeploymentGuide()">
                            <i class="fas fa-info-circle"></i> Deployment Guide
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
        shareContent.style.display = 'block';
    }


    generateQRCode() {
        const urlInfo = this.getPublicUrl();
        const shareContent = document.getElementById('shareContent');
        
        // Generate QR code for the URL (now using IP address)
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlInfo.url)}`;
        
        shareContent.innerHTML = `
            <div class="share-content">
                <h6>QR Code</h6>
                ${urlInfo.isLocal ? `
                    <div class="alert alert-success mb-3">
                        <i class="fas fa-mobile-alt"></i>
                        <strong>Mobile-Ready QR Code:</strong> This QR code will work on mobile devices connected to the same WiFi network.
                    </div>
                ` : ''}
                <div class="qr-code-container text-center">
                    <div id="qrcode" class="mb-3">
                        <img src="${qrCodeUrl}" alt="QR Code for Registration" class="qr-code-image" style="border: 1px solid #ddd; border-radius: 8px;">
                    </div>
                    <div class="share-link mb-3">${urlInfo.url}</div>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-primary btn-sm" onclick="admin.copyToClipboard('${urlInfo.url}')">
                            <i class="fas fa-copy"></i> Copy Link
                        </button>
                        <button class="btn btn-outline-success btn-sm" onclick="admin.downloadQRCode('${qrCodeUrl}')">
                            <i class="fas fa-download"></i> Download QR Code
                        </button>
                    </div>
                    ${urlInfo.isLocal ? `
                        <div class="alert alert-info mt-3">
                            <small><strong>Note:</strong> Mobile devices must be on the same WiFi network as your computer. For internet access, consider deploying your app.</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        shareContent.style.display = 'block';
    }

    showIPInstructions() {
        const modalHtml = `
            <div class="modal fade" id="ipInstructionsModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-network-wired"></i>
                                Find Your Computer's IP Address
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info">
                                <strong>Quick Solution:</strong> Use your computer's local IP address instead of localhost
                            </div>
                            
                            <h6>Windows:</h6>
                            <ol>
                                <li>Press <kbd>Win + R</kbd>, type <code>cmd</code>, press Enter</li>
                                <li>Type <code>ipconfig</code> and press Enter</li>
                                <li>Look for "IPv4 Address" (usually starts with 192.168.x.x)</li>
                                <li>Use <code>http://[YOUR-IP]:3000</code> (e.g., http://192.168.1.100:3000)</li>
                            </ol>
                            
                            <h6>Mac:</h6>
                            <ol>
                                <li>Open Terminal</li>
                                <li>Type <code>ifconfig | grep inet</code></li>
                                <li>Look for address starting with 192.168.x.x</li>
                                <li>Use <code>http://[YOUR-IP]:3000</code></li>
                            </ol>
                            
                            <div class="alert alert-warning mt-3">
                                <strong>Important:</strong> Make sure your mobile device is on the same WiFi network as your computer!
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('ipInstructionsModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('ipInstructionsModal'));
        modal.show();
    }

    showDeploymentGuide() {
        const modalHtml = `
            <div class="modal fade" id="deploymentGuideModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-cloud"></i>
                                Deployment Guide
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-success">
                                <strong>Deploy your app to make it accessible from any mobile device!</strong>
                            </div>
                            
                            <h6>Recommended Platforms:</h6>
                            
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title">🚀 Heroku (Free Tier Available)</h6>
                                    <ol class="small">
                                        <li>Create account at <a href="https://heroku.com" target="_blank">heroku.com</a></li>
                                        <li>Install Heroku CLI</li>
                                        <li>Run: <code>heroku create your-dance-app</code></li>
                                        <li>Run: <code>git push heroku main</code></li>
                                    </ol>
                                </div>
                            </div>
                            
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title">⚡ Vercel (Easy Deployment)</h6>
                                    <ol class="small">
                                        <li>Create account at <a href="https://vercel.com" target="_blank">vercel.com</a></li>
                                        <li>Connect your GitHub repository</li>
                                        <li>Automatic deployment on every push</li>
                                    </ol>
                                </div>
                            </div>
                            
                            <div class="card mb-3">
                                <div class="card-body">
                                    <h6 class="card-title">🌐 Railway (Node.js Friendly)</h6>
                                    <ol class="small">
                                        <li>Create account at <a href="https://railway.app" target="_blank">railway.app</a></li>
                                        <li>Connect GitHub and deploy</li>
                                        <li>Automatic HTTPS and custom domains</li>
                                    </ol>
                                </div>
                            </div>
                            
                            <div class="alert alert-info">
                                <strong>Quick Test:</strong> Use <a href="https://ngrok.com" target="_blank">ngrok</a> for temporary public URL:<br>
                                <code>npx ngrok http 3000</code>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('deploymentGuideModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('deploymentGuideModal'));
        modal.show();
    }

    async downloadQRCode(qrCodeUrl) {
        try {
            // Create a temporary link to download the QR code
            const response = await fetch(qrCodeUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = 'dance-registration-qr-code.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            this.showSuccess('QR Code downloaded successfully!');
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Failed to download QR Code. Please try right-clicking the QR code and selecting "Save image as..."');
        }
    }

    generateWhatsAppMessage() {
        const urlInfo = this.getPublicUrl();
        const shareContent = document.getElementById('shareContent');
        
        const message = `🎉 DANCE CLASS REGISTRATION OPEN!

Register now for amazing dance classes:
${urlInfo.url}

Limited spots available - first come, first served! 💃

Questions? Reply to this message`;

        shareContent.innerHTML = `
            <div class="share-content">
                <h6>WhatsApp Message</h6>
                ${urlInfo.isLocal ? `
                    <div class="alert alert-info mb-3">
                        <i class="fas fa-wifi"></i>
                        <strong>WiFi Network Required:</strong> Recipients must be on the same WiFi network to access this link.
                    </div>
                ` : ''}
                <textarea class="form-control mb-3" rows="8" readonly>${message}</textarea>
                <div class="d-grid gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="admin.copyToClipboard(\`${message.replace(/`/g, '\\`')}\`)">
                        <i class="fas fa-copy"></i> Copy Message
                    </button>
                    <a href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" class="btn btn-success btn-sm">
                        <i class="fab fa-whatsapp"></i> Open WhatsApp
                    </a>
                </div>
            </div>
        `;
        shareContent.style.display = 'block';
    }

    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showSuccess('Copied to clipboard!');
        } catch (error) {
            console.error('Copy failed:', error);
            this.showError('Failed to copy to clipboard');
        }
    }

    // Reset data: keep only one course active and clear all registrations/revenue
    async resetKeepCourse(deleteOthers = false) {
        try {
            // Determine which course to keep: prefer first active, else first available
            const activeCourses = Array.isArray(this.courses) ? this.courses.filter(c => c.is_active) : [];
            const keepCourse = activeCourses[0] || this.courses[0];

            if (!keepCourse) {
                this.showError('No courses available to keep.');
                return;
            }

            const keepId = keepCourse.id;
            const keepName = keepCourse.name || `Course #${keepId}`;

            // Confirm destructive action
            const msg = deleteOthers
                ? `This will DELETE all other courses and CLEAR all registrations/revenue.\n\nKeep: "${keepName}" (ID: ${keepId})\n\nProceed?`
                : `This will DEACTIVATE all other courses and CLEAR all registrations/revenue.\n\nKeep: "${keepName}" (ID: ${keepId})\n\nProceed?`;
            if (!window.confirm(msg)) return;

            const response = await this.apiFetch('/api/admin/reset-keep-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keep_course_id: keepId,
                    delete_other_courses: !!deleteOthers
                })
            });

            const result = await response.json();

            if (!response.ok || result.error) {
                throw new Error(result.error || 'Reset failed');
            }

            // Reload all data and show success
            await this.loadInitialData();
            this.showSuccess(`Reset complete. Kept "${keepName}". ${deleteOthers ? 'Deleted other courses.' : 'Deactivated other courses.'}`);

            // Ensure dashboard reflects cleared stats
            this.showSection('dashboard');
        } catch (err) {
            console.error('Reset error:', err);
            this.showError(err.message || 'Failed to reset data');
        }
    }

    // Additional admin functions
    async editCourse(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;

        // Set modal title and base fields
        document.getElementById('courseModalTitle').textContent = 'Edit Dance Series';
        document.getElementById('courseId').value = course.id;
        document.getElementById('courseName').value = course.name || '';
        document.getElementById('courseDescription').value = course.description || '';
        document.getElementById('courseType').value = course.course_type || 'dance_series';
        document.getElementById('courseDuration').value = course.duration_weeks || '1';
        const startDateEl = document.getElementById('startDate');
        if (startDateEl) {
            startDateEl.value = course.start_date ? new Date(course.start_date).toISOString().split('T')[0] : '';
        }

        // Clear and populate slots based on existing course data
        const slotsContainer = document.getElementById('slotsContainer');
        slotsContainer.innerHTML = '';

        const courseSlots = Array.isArray(course.slots) && course.slots.length > 0 ? course.slots : [];
        if (courseSlots.length === 0) {
            // Fallback: ensure at least one slot exists so form can be saved
            this.addSlot();
        } else {
            // Ensure course type listener is set before adding slots (affects UI constraints)
            this.setupCourseTypeListener();

            courseSlots.forEach((slot, index) => {
                // Add a new slot card
                this.addSlot();
                const slotCard = slotsContainer.children[index];

                if (!slotCard) return;

                // Populate slot fields
                const nameEl = slotCard.querySelector('.slot-name');
                const diffEl = slotCard.querySelector('.slot-difficulty');
                const capEl = slotCard.querySelector('.slot-capacity');
                const dayEl = slotCard.querySelector('.slot-day');
                const stEl = slotCard.querySelector('.slot-start-time');
                const etEl = slotCard.querySelector('.slot-end-time');
                const locEl = slotCard.querySelector('.slot-location');
                const pdEl = slotCard.querySelector('.slot-practice-date');
                const fullPriceEl = slotCard.querySelector('.slot-full-price');
                const dropInPriceEl = slotCard.querySelector('.slot-drop-in-price');

                if (nameEl) nameEl.value = slot.slot_name || 'Main Session';
                if (diffEl) diffEl.value = slot.difficulty_level || 'All Levels';
                if (capEl) capEl.value = slot.capacity || 20;
                if (dayEl) dayEl.value = slot.day_of_week || '';
                if (stEl) stEl.value = slot.start_time || '';
                if (etEl) etEl.value = slot.end_time || '';
                if (locEl) locEl.value = slot.location || '';
                if (pdEl) pdEl.value = slot.practice_date ? new Date(slot.practice_date).toISOString().split('T')[0] : '';

                // Pricing
                const pricing = slot.pricing || {};
                if (fullPriceEl) fullPriceEl.value = pricing.full_package != null ? pricing.full_package : '';
                if (dropInPriceEl) dropInPriceEl.value = pricing.drop_in != null ? pricing.drop_in : '';
            });
        }

        // Update pricing UI visibility/requirements based on course type
        this.updatePricingUIForCourseType();

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('courseModal'));
        modal.show();
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

    // Auto-populate schedule information based on date/time selections
    setupScheduleAutoPopulation() {
        const startDateField = document.getElementById('startDate');
        const startTimeField = document.getElementById('startTime');
        const durationField = document.getElementById('courseDuration');
        const courseTypeField = document.getElementById('courseType');
        const scheduleInfoField = document.getElementById('scheduleInfo');
        const multipleDatesSection = document.getElementById('multipleDatesSection');
        const perClassPriceField = document.getElementById('perClassPrice');
        const fullCoursePriceField = document.getElementById('fullCoursePrice');

        const updateFullCoursePrice = () => {
            const perClassPrice = parseFloat(perClassPriceField.value) || 0;
            const duration = parseInt(durationField.value) || 1;
            const calculatedPrice = perClassPrice * duration;
            fullCoursePriceField.value = calculatedPrice.toFixed(2);
        };

        const updateScheduleInfo = () => {
            const startDate = startDateField.value;
            const startTime = startTimeField.value;
            const duration = durationField.value;
            const courseType = courseTypeField.value;

            // Show/hide multiple dates section based on course type and duration
            if (courseType === 'multi-week' && duration && parseInt(duration) > 1) {
                multipleDatesSection.style.display = 'block';
            } else {
                multipleDatesSection.style.display = 'none';
            }

            // Generate schedule information
            let scheduleText = '';
            
            if (startDate && startTime) {
                const date = new Date(startDate);
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                
                // Convert 24-hour time to 12-hour format
                const [hours, minutes] = startTime.split(':');
                const hour12 = ((parseInt(hours) + 11) % 12) + 1;
                const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
                const timeFormatted = `${hour12}:${minutes} ${ampm}`;
                
                // Check if there are additional dates
                const additionalDates = this.getAdditionalDates();
                
                if (additionalDates.length > 0) {
                    // Format with specific dates
                    const allDates = [startDate, ...additionalDates].sort();
                    const formattedDates = allDates.map(dateStr => {
                        const d = new Date(dateStr);
                        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }).join(', ');
                    scheduleText = `${formattedDates} at ${timeFormatted}`;
                } else if (courseType === 'multi-week' && duration && parseInt(duration) > 1) {
                    // Weekly recurring format
                    scheduleText = `${dayName}s ${timeFormatted} (${duration} weeks)`;
                } else {
                    // Single class format
                    const formattedDate = date.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric' 
                    });
                    scheduleText = `${formattedDate} at ${timeFormatted}`;
                }
                
                scheduleInfoField.value = scheduleText;
            } else {
                scheduleInfoField.value = '';
            }
        };

        // Remove existing listeners to avoid duplicates
        startDateField.removeEventListener('change', updateScheduleInfo);
        startTimeField.removeEventListener('change', updateScheduleInfo);
        durationField.removeEventListener('change', updateScheduleInfo);
        courseTypeField.removeEventListener('change', updateScheduleInfo);
        perClassPriceField.removeEventListener('input', updateFullCoursePrice);
        durationField.removeEventListener('input', updateFullCoursePrice);

        // Add event listeners
        startDateField.addEventListener('change', updateScheduleInfo);
        startTimeField.addEventListener('change', updateScheduleInfo);
        durationField.addEventListener('change', updateScheduleInfo);
        courseTypeField.addEventListener('change', updateScheduleInfo);
        
        // Add price calculation listeners
        perClassPriceField.addEventListener('input', updateFullCoursePrice);
        durationField.addEventListener('input', updateFullCoursePrice);
        
        // Initial calculation
        updateFullCoursePrice();
    }

    // Get additional dates from the form
    getAdditionalDates() {
        const additionalDates = [];
        const dateInputs = document.querySelectorAll('#additionalDates input[type="date"]');
        dateInputs.forEach(input => {
            if (input.value) {
                additionalDates.push(input.value);
            }
        });
        return additionalDates;
    }

    // Add a new date field for multi-week series
    addDateField() {
        const additionalDatesContainer = document.getElementById('additionalDates');
        const dateFieldCount = additionalDatesContainer.children.length;
        
        const dateFieldHtml = `
            <div class="input-group mb-2" id="dateField${dateFieldCount}">
                <input type="date" class="form-control" name="additional_date_${dateFieldCount}" onchange="admin.updateScheduleFromAdditionalDates()">
                <button type="button" class="btn btn-outline-danger" onclick="admin.removeDateField(${dateFieldCount})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        additionalDatesContainer.insertAdjacentHTML('beforeend', dateFieldHtml);
    }

    // Remove a date field
    removeDateField(fieldIndex) {
        const dateField = document.getElementById(`dateField${fieldIndex}`);
        if (dateField) {
            dateField.remove();
            this.updateScheduleFromAdditionalDates();
        }
    }

    // Update schedule info when additional dates change
    updateScheduleFromAdditionalDates() {
        // Trigger the main schedule update function
        const startDateField = document.getElementById('startDate');
        if (startDateField) {
            startDateField.dispatchEvent(new Event('change'));
        }
    }

    // =========================
    // Attendance UI (Phase 3)
    // =========================

    // Helper: find course by id from preloaded courses
    getCourseById(courseId) {
        if (!courseId) return null;
        return (this.courses || []).find(c => Number(c.id) === Number(courseId)) || null;
    }

    // Helper: parse 'YYYY-MM-DD' (no timezone shift) to Date
    parseYMD(str) {
        const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }

    // Helper: format Date to 'YYYY-MM-DD'
    toISODate(d) {
        if (!d) return '';
        const pad2 = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    // Helper: map weekday name to JS getDay index
    getDayIndex(name) {
        const map = {
            sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
            thursday: 4, friday: 5, saturday: 6
        };
        const key = String(name || '').trim().toLowerCase();
        return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    }

    /**
     * Build suggested session list from course metadata (no DB writes)
     * Returns array of { session_date, start_time, end_time, location, source }
     */
    generateSuggestedSessionsForCourse(course) {
        if (!course) return [];
        const suggestions = [];
        const pushUnique = (obj) => {
            const key = obj.session_date;
            if (!key) return;
            if (!suggestions.some(s => s.session_date === key)) {
                suggestions.push(obj);
            }
        };

        const slots = Array.isArray(course.slots) ? course.slots : [];

        // Crew practice: prefer explicit practice_date on slot
        if (course.course_type === 'crew_practice') {
            slots.forEach(s => {
                if (s.practice_date) {
                    pushUnique({
                        session_date: String(s.practice_date).slice(0, 10),
                        start_time: s.start_time || null,
                        end_time: s.end_time || null,
                        location: s.location || null,
                        source: 'slot'
                    });
                }
            });
            // Fallback to start_date if no explicit practice_date
            if (suggestions.length === 0 && course.start_date) {
                pushUnique({
                    session_date: String(course.start_date).slice(0, 10),
                    start_time: slots[0]?.start_time || null,
                    end_time: slots[0]?.end_time || null,
                    location: slots[0]?.location || null,
                    source: 'course'
                });
            }
        } else if (course.course_type === 'dance_series') {
            // Weekly recurring between start_date and end_date OR duration_weeks
            const start = this.parseYMD(course.start_date);
            if (!start) return suggestions;

            // Derive end date:
            let end = null;
            if (course.end_date) {
                end = this.parseYMD(course.end_date);
            } else {
                const weeks = parseInt(course.duration_weeks, 10) || 1;
                end = new Date(start);
                end.setDate(end.getDate() + (weeks - 1) * 7);
            }
            if (!end) end = new Date(start);

            // Build set of weekdays from slots
            const slotWeekdays = [];
            slots.forEach(s => {
                const di = this.getDayIndex(s.day_of_week);
                if (di !== null && !slotWeekdays.includes(di)) {
                    slotWeekdays.push(di);
                }
            });
            // If no day_of_week on slots, use start day
            if (slotWeekdays.length === 0) {
                slotWeekdays.push(start.getDay());
            }

            // For each weekday, generate occurrences
            slotWeekdays.forEach(di => {
                const refSlot = slots.find(s => this.getDayIndex(s.day_of_week) === di) || slots[0] || {};
                // Find first occurrence on/after start
                let d = new Date(start);
                const delta = (di - d.getDay() + 7) % 7;
                d.setDate(d.getDate() + delta);
                while (d <= end) {
                    pushUnique({
                        session_date: this.toISODate(d),
                        start_time: refSlot.start_time || null,
                        end_time: refSlot.end_time || null,
                        location: refSlot.location || null,
                        source: 'computed'
                    });
                    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
                }
            });
        } else {
            // drop_in or other: try slot practice_date or course.start_date
            slots.forEach(s => {
                if (s.practice_date) {
                    pushUnique({
                        session_date: String(s.practice_date).slice(0, 10),
                        start_time: s.start_time || null,
                        end_time: s.end_time || null,
                        location: s.location || null,
                        source: 'slot'
                    });
                }
            });
            if (suggestions.length === 0 && course.start_date) {
                pushUnique({
                    session_date: String(course.start_date).slice(0, 10),
                    start_time: slots[0]?.start_time || null,
                    end_time: slots[0]?.end_time || null,
                    location: slots[0]?.location || null,
                    source: 'course'
                });
            }
        }

        // Sort ascending by date
        suggestions.sort((a, b) => {
            const da = this.parseYMD(a.session_date);
            const db = this.parseYMD(b.session_date);
            return (da?.getTime() || 0) - (db?.getTime() || 0);
        });

        return suggestions;
    }

    // Create a real DB session from a suggested course date, then select it
    async createSessionForSuggestedDate(dateStr, meta = {}) {
        try {
            if (!this.attendance?.courseId) {
                this.showError('No course selected');
                return;
            }
            const payload = {
                session_date: dateStr,
                start_time: meta.start_time || null,
                end_time: meta.end_time || null,
                location: meta.location || null,
                notes: meta.notes || null
            };
            const res = await this.apiFetch(`/api/admin/courses/${this.attendance.courseId}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || !result.session_id) {
                throw new Error(result.error || 'Failed to create session');
            }
            // Refresh sessions and select the new one
            await this.loadAttendanceSessions(this.attendance.courseId);
            await this.selectAttendanceSession(Number(result.session_id));
            this.showSuccess('Session created from course date');
        } catch (e) {
            console.error('Create session (suggested) error:', e);
            this.showError(e.message || 'Failed to create session');
        }
    }

    // Render suggested dates panel below persisted sessions
    renderSuggestedSessions() {
        const sessionsEl = document.getElementById('attendanceSessions');
        if (!sessionsEl) return;
        const courseId = this.attendance?.courseId;
        if (!courseId) return;

        // Remove any previous suggestions panel (to avoid duplicates)
        const prev = document.getElementById('attendanceSuggestedSessions');
        if (prev) prev.remove();

        const course = this.getCourseById(courseId);
        const suggestions = this.generateSuggestedSessionsForCourse(course);
        if (!Array.isArray(suggestions) || suggestions.length === 0) return;

        const existing = new Set((this.attendance?.sessions || []).map(s => String(s.session_date).slice(0, 10)));
        const pending = suggestions.filter(s => !existing.has(String(s.session_date).slice(0, 10)));
        if (pending.length === 0) return;

        const wrap = document.createElement('div');
        wrap.id = 'attendanceSuggestedSessions';
        wrap.className = 'mt-3';
        wrap.innerHTML = `
            <div class="card border-secondary">
                <div class="card-header py-2">
                    <small class="text-muted">Suggested dates from course</small>
                </div>
                <div class="list-group list-group-flush">
                    ${pending.map(p => {
                        const dateStr = new Date(p.session_date).toLocaleDateString();
                        const sub = [p.start_time, p.end_time].filter(Boolean).join(' - ');
                        const meta = [sub, p.location].filter(Boolean).join(' • ');
                        return `
                            <a href="#" class="list-group-item list-group-item-action" data-suggest-date="${p.session_date}">
                                <i class="fas fa-calendar-plus me-2 text-secondary"></i>
                                ${dateStr}${meta ? ` <small class="text-muted">${meta}</small>` : ''}
                            </a>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        sessionsEl.appendChild(wrap);

        // Wire click handlers to create sessions on demand
        wrap.querySelectorAll('[data-suggest-date]').forEach(a => {
            a.addEventListener('click', (ev) => {
                ev.preventDefault();
                const date = String(ev.currentTarget.getAttribute('data-suggest-date'));
                const meta = suggestions.find(s => s.session_date === date) || {};
                this.createSessionForSuggestedDate(date, meta);
            });
        });
    }

    async openAttendance() {
        const modalEl = document.getElementById('attendanceModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        const courseIdStr = document.getElementById('regCourseFilter')?.value || '';
        const courseId = courseIdStr ? Number(courseIdStr) : null;

        // Initialize attendance state
        this.attendance = {
            courseId,
            sessionId: null,
            sessions: [],
            roster: [],
            marks: new Map()
        };

        const sessionsEl = document.getElementById('attendanceSessions');
        const studentsEl = document.getElementById('attendanceStudents');
        const saveBtn = document.getElementById('saveAttendanceBtn');
        const createSessionBtn = document.getElementById('createSessionBtn');
        const createSessionForm = document.getElementById('createSessionForm');
        const cancelCreateSessionBtn = document.getElementById('cancelCreateSessionBtn');
        const submitCreateSessionBtn = document.getElementById('submitCreateSessionBtn');

        // Wire static handlers once per page lifetime
        if (!modalEl._attendanceWired) {
            modalEl._attendanceWired = true;

            if (createSessionBtn) {
                createSessionBtn.addEventListener('click', () => {
                    if (!this.attendance?.courseId) {
                        this.showError('Select a Dance Series in the Registrations filter before creating a session.');
                        return;
                    }
                    createSessionForm.style.display = '';
                });
            }
            if (cancelCreateSessionBtn) {
                cancelCreateSessionBtn.addEventListener('click', () => {
                    createSessionForm.style.display = 'none';
                    this.resetCreateSessionForm();
                });
            }
            if (submitCreateSessionBtn) {
                submitCreateSessionBtn.addEventListener('click', () => this.createSession());
            }
            if (saveBtn) {
                saveBtn.addEventListener('click', () => this.saveAttendance());
            }
        }

        // Reset UI defaults
        if (saveBtn) saveBtn.disabled = true;
        if (studentsEl) studentsEl.innerHTML = '<div class="text-muted">Select a session to mark attendance.</div>';
        if (createSessionForm) createSessionForm.style.display = 'none';

        // Load data based on course selection
        if (!courseId) {
            if (sessionsEl) {
                const options = (this.courses || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                sessionsEl.innerHTML = `
                    <div class="mb-2">
                        <label class="form-label small">Select Dance Series</label>
                        <select id="attendanceCoursePicker" class="form-select form-select-sm">
                            <option value="">-- Choose a series --</option>
                            ${options}
                        </select>
                    </div>
                    <div class="text-muted">Choose a series to manage attendance.</div>
                `;
                // Wire change handler
                const picker = document.getElementById('attendanceCoursePicker');
                if (picker && !picker._wired) {
                    picker._wired = true;
                    picker.addEventListener('change', async () => {
                        const val = picker.value ? Number(picker.value) : null;
                        this.attendance.courseId = val;
                        if (val) {
                            try {
                                await Promise.all([
                                    this.loadAttendanceSessions(val),
                                    this.loadAttendanceRoster(val)
                                ]);
                            } catch (e) {
                                console.error('Attendance load (picker) error:', e);
                                this.showError('Failed to load attendance data');
                            }
                        }
                    });
                }
            }
            return;
        }

        try {
            await Promise.all([
                this.loadAttendanceSessions(courseId),
                this.loadAttendanceRoster(courseId)
            ]);
        } catch (err) {
            console.error('Attendance load error:', err);
            this.showError('Failed to load attendance data');
        }
    }

    resetCreateSessionForm() {
        const fields = ['att_session_date', 'att_start_time', 'att_end_time', 'att_location', 'att_notes'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    async createSession() {
        try {
            if (!this.attendance?.courseId) {
                this.showError('No course selected');
                return;
            }
            const body = {
                session_date: document.getElementById('att_session_date').value,
                start_time: document.getElementById('att_start_time').value || null,
                end_time: document.getElementById('att_end_time').value || null,
                location: document.getElementById('att_location').value || null,
                notes: document.getElementById('att_notes').value || null
            };
            if (!body.session_date) {
                this.showError('Session date is required');
                return;
            }
            const res = await this.apiFetch(`/api/admin/courses/${this.attendance.courseId}/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to create session');
            }
            // Refresh list
            await this.loadAttendanceSessions(this.attendance.courseId);
            // Hide and reset form
            document.getElementById('createSessionForm').style.display = 'none';
            this.resetCreateSessionForm();
            this.showSuccess('Session created');
        } catch (e) {
            console.error('Create session error:', e);
            this.showError(e.message || 'Failed to create session');
        }
    }

    async loadAttendanceSessions(courseId) {
        const sessionsEl = document.getElementById('attendanceSessions');
        if (!courseId) {
            if (sessionsEl) sessionsEl.innerHTML = '<div class="text-muted">No series selected.</div>';
            return;
        }
        try {
            const res = await this.apiFetch(`/api/admin/courses/${courseId}/sessions`);
            const sessions = await res.json();
            this.attendance.sessions = Array.isArray(sessions) ? sessions : [];
            this.renderAttendanceSessions();
            this.renderSuggestedSessions();
            // Auto-select the first session if none is selected, so individual marking controls are visible
            if (!this.attendance.sessionId && this.attendance.sessions.length > 0) {
                const first = this.attendance.sessions[0];
                await this.selectAttendanceSession(Number(first.id));
            }
        } catch (e) {
            console.error('Load sessions error:', e);
            if (sessionsEl) sessionsEl.innerHTML = '<div class="text-danger">Failed to load sessions</div>';
        }
    }

    renderAttendanceSessions() {
        const sessionsEl = document.getElementById('attendanceSessions');
        if (!sessionsEl) return;

        const sessions = this.attendance?.sessions || [];
        if (sessions.length === 0) {
            sessionsEl.innerHTML = '<div class="text-muted">No sessions yet. Click "New Session" to create one.</div>';
            return;
        }

        const list = document.createElement('div');
        list.className = 'list-group';
        list.innerHTML = sessions.map(s => {
            const dateStr = s.session_date ? new Date(s.session_date).toLocaleDateString() : '(no date)';
            const timeStr = [s.start_time, s.end_time].filter(Boolean).join(' - ');
            const sub = [timeStr, s.location].filter(Boolean).join(' • ');
            const active = Number(this.attendance.sessionId) === Number(s.id) ? ' active' : '';
            return `
                <a href="#" class="list-group-item list-group-item-action${active}" data-session-id="${s.id}">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1">${dateStr}</h6>
                        <small class="text-muted">#${s.id}</small>
                    </div>
                    ${sub ? `<small class="text-muted">${sub}</small>` : ''}
                </a>
            `;
        }).join('');

        sessionsEl.innerHTML = '';
        sessionsEl.appendChild(list);

        // Attach click handlers
        list.querySelectorAll('[data-session-id]').forEach(a => {
            a.addEventListener('click', (ev) => {
                ev.preventDefault();
                const id = Number(ev.currentTarget.getAttribute('data-session-id'));
                this.selectAttendanceSession(id);
            });
        });
    }

    async loadAttendanceRoster(courseId) {
        const studentsEl = document.getElementById('attendanceStudents');
        try {
            console.log('🔍 Loading attendance roster for course:', courseId);
            const res = await this.apiFetch(`/api/admin/registrations?course_id=${courseId}&payment_status=completed`);
            const regs = await res.json();
            console.log('📋 Raw registrations data:', regs);
            
            // Sort roster by last_name, then first_name
            const roster = (Array.isArray(regs) ? regs : []).map(r => {
                const student = {
                    student_id: Number(r.student_id),
                    first_name: r.first_name || '',
                    last_name: r.last_name || '',
                    email: r.email || '',
                    payment_status: r.payment_status || 'pending'
                };
                console.log('👤 Mapped student:', student);
                return student;
            }).sort((a, b) => {
                const ln = (a.last_name || '').localeCompare(b.last_name || '');
                if (ln !== 0) return ln;
                return (a.first_name || '').localeCompare(b.first_name || '');
            });
            
            console.log('📚 Final roster:', roster);
            this.attendance.roster = roster;

            // If a session is already selected, refresh student list with marks
            if (this.attendance.sessionId) {
                await this.selectAttendanceSession(this.attendance.sessionId);
            } else if (studentsEl) {
                studentsEl.innerHTML = '<div class="text-muted">Select a session to mark attendance.</div>';
            }
        } catch (e) {
            console.error('Load roster error:', e);
            if (studentsEl) studentsEl.innerHTML = '<div class="text-danger">Failed to load students</div>';
        }
    }

    async selectAttendanceSession(sessionId) {
        this.attendance.sessionId = Number(sessionId);
        const saveBtn = document.getElementById('saveAttendanceBtn');
        if (saveBtn) saveBtn.disabled = false;

        try {
            const res = await this.apiFetch(`/api/admin/sessions/${sessionId}/attendance`);
            const rows = await res.json();
            const marks = new Map();
            (Array.isArray(rows) ? rows : []).forEach(r => {
                const sid = Number(r.student_id);
                const st = String(r.status || '').toLowerCase();
                if (sid && st) marks.set(sid, st);
            });
            this.attendance.marks = marks;
            this.renderAttendanceStudents();
            // Re-render sessions to reflect active highlight
            this.renderAttendanceSessions();
        } catch (e) {
            console.error('Load attendance marks error:', e);
            this.showError('Failed to load attendance for session');
        }
    }

    renderAttendanceStudents() {
        const studentsEl = document.getElementById('attendanceStudents');
        if (!studentsEl) return;
        const roster = this.attendance?.roster || [];

        console.log('🎨 Rendering attendance students - roster length:', roster.length);
        console.log('🎨 Current sessionId:', this.attendance?.sessionId);

        if (!this.attendance?.sessionId) {
            studentsEl.innerHTML = '<div class="text-muted">Select a session to mark attendance.</div>';
            return;
        }
        if (roster.length === 0) {
            studentsEl.innerHTML = '<div class="text-muted">No registrations found for this series.</div>';
            return;
        }

        // Build bulk controls + table of students
        const bulkControls = `
            <div class="d-flex flex-wrap gap-2 mb-3">
                <button class="btn btn-sm btn-outline-success" onclick="admin.bulkMark('present')">
                    <i class="fas fa-user-check"></i> All Present
                </button>
                <button class="btn btn-sm btn-outline-warning" onclick="admin.bulkMark('late')">
                    <i class="fas fa-user-clock"></i> All Late
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="admin.bulkMark('absent')">
                    <i class="fas fa-user-times"></i> All Absent
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="admin.clearMarks()">
                    <i class="fas fa-eraser"></i> Clear
                </button>
            </div>
        `;

        const rows = roster.map(s => {
            const fullName = [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '(No name)';
            const checked = (st) => (this.attendance.marks.get(s.student_id) === st ? 'checked' : '');
            console.log(`🧑‍🎤 Building row for student ${s.student_id}: "${fullName}" (${s.first_name}|${s.last_name})`);
            return `
                <tr data-student-id="${s.student_id}">
                    <td>
                        <div><strong>${fullName}</strong></div>
                        <div><small class="badge ${s.payment_status === 'completed' ? 'bg-success' : 'bg-warning'}">${s.payment_status}</small></div>
                    </td>
                    <td class="text-center">
                        <input type="radio" class="form-check-input" name="att_status_${s.student_id}" value="present" ${checked('present')}>
                    </td>
                    <td class="text-center">
                        <input type="radio" class="form-check-input" name="att_status_${s.student_id}" value="late" ${checked('late')}>
                    </td>
                    <td class="text-center">
                        <input type="radio" class="form-check-input" name="att_status_${s.student_id}" value="absent" ${checked('absent')}>
                    </td>
                </tr>
            `;
        }).join('');

        const finalHTML = `
            <div class="small text-muted mb-2">Select a status for each student or use the bulk buttons below.</div>
            ${bulkControls}
            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th class="text-center">Present</th>
                            <th class="text-center">Late</th>
                            <th class="text-center">Absent</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;

        console.log('🏗️ Final HTML being inserted:', finalHTML.substring(0, 500) + '...');
        studentsEl.innerHTML = finalHTML;
        console.log('✅ DOM updated, checking actual content...');
        
        // Check what actually got rendered
        setTimeout(() => {
            const actualRows = studentsEl.querySelectorAll('tbody tr');
            console.log('🔍 Actual rendered rows count:', actualRows.length);
            actualRows.forEach((row, i) => {
                const studentCell = row.querySelector('td:first-child strong');
                const studentName = studentCell ? studentCell.textContent : 'NO NAME ELEMENT';
                console.log(`📝 Row ${i}: ${studentName}`);
            });
        }, 100);
    }

    bulkMark(status) {
        if (!this.attendance?.sessionId) return;
        const valid = new Set(['present', 'late', 'absent']);
        if (!valid.has(status)) return;

        const body = document.getElementById('attendanceStudents');
        if (!body) return;
        const inputs = body.querySelectorAll('tbody tr');
        inputs.forEach(tr => {
            const sid = Number(tr.getAttribute('data-student-id'));
            const radio = tr.querySelector(`input[type="radio"][name="att_status_${sid}"][value="${status}"]`);
            if (radio) {
                radio.checked = true;
                this.attendance.marks.set(sid, status);
            }
        });
    }

    clearMarks() {
        const body = document.getElementById('attendanceStudents');
        if (!body) return;
        body.querySelectorAll('input[type="radio"]').forEach(r => r.checked = false);
        // Do not delete existing records on server; just clear local pending changes
        this.attendance.marks = new Map();
    }

    collectAttendanceRecords() {
        const records = [];
        const body = document.getElementById('attendanceStudents');
        if (!body) return records;

        const rows = body.querySelectorAll('tbody tr[data-student-id]');
        rows.forEach(tr => {
            const sid = Number(tr.getAttribute('data-student-id'));
            const checked = tr.querySelector(`input[name="att_status_${sid}"]:checked`);
            if (sid && checked && checked.value) {
                records.push({ student_id: sid, status: checked.value });
            }
        });
        return records;
    }

    async saveAttendance() {
        try {
            if (!this.attendance?.sessionId) {
                this.showError('No session selected');
                return;
            }
            const records = this.collectAttendanceRecords();
            if (records.length === 0) {
                this.showError('No attendance marks selected');
                return;
            }
            const res = await this.apiFetch(`/api/admin/sessions/${this.attendance.sessionId}/attendance`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records })
            });
            const result = await res.json().catch(() => ({}));
            if (!res.ok || result.error) {
                throw new Error(result.error || 'Failed to save attendance');
            }
            this.showSuccess('Attendance saved');
            // Refresh current session marks from server to reflect saved state
            await this.selectAttendanceSession(this.attendance.sessionId);
        } catch (e) {
            console.error('Save attendance error:', e);
            this.showError(e.message || 'Failed to save attendance');
        }
    }

    // =========================
    // Student Management (Phase 1)
    // =========================

    async loadStudentManagement() {
        await this.refreshStudentData();
        await this.loadCrewMembersList();
    }

    async refreshStudentData() {
        try {
            const [pendingResponse, candidatesResponse] = await Promise.all([
                this.apiFetch('/api/admin/students/pending'),
                this.apiFetch('/api/admin/crew-member-candidates')
            ]);

            const pendingStudents = await pendingResponse.json();
            const crewCandidates = await candidatesResponse.json();

            this.renderPendingStudents(pendingStudents);
            this.renderCrewCandidates(crewCandidates);
            this.loadAllStudents();

        } catch (error) {
            console.error('Error loading student data:', error);
            this.showError('Failed to load student data');
        }
    }

    renderPendingStudents(students) {
        const pendingRow = document.getElementById('pendingStudentsRow');
        const pendingList = document.getElementById('pendingStudentsList');
        const pendingCount = document.getElementById('pendingCount');

        if (students.length === 0) {
            pendingRow.style.display = 'none';
            return;
        }

        pendingRow.style.display = 'block';
        pendingCount.textContent = students.length;

        const studentsHtml = students.map(student => `
            <div class="card mb-3 border-warning">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-6">
                            <h6 class="mb-1">${student.first_name} ${student.last_name}</h6>
                            <small class="text-muted">${student.email}</small>
                            ${student.instagram_handle ? `<br><small class="text-muted">@${student.instagram_handle}</small>` : ''}
                        </div>
                        <div class="col-md-4">
                            <small><strong>Experience:</strong> ${this.formatExperience(student.dance_experience)}</small><br>
                            <small><strong>Registrations:</strong> ${student.registration_count}</small><br>
                            <small><strong>Joined:</strong> ${new Date(student.created_at).toLocaleDateString()}</small>
                        </div>
                        <div class="col-md-2">
                            <div class="btn-group-vertical w-100">
                                <button class="btn btn-warning btn-sm" onclick="admin.classifyStudent(${student.id}, 'crew_member')">
                                    <i class="fas fa-users"></i> Crew Member
                                </button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="admin.classifyStudent(${student.id}, 'general')">
                                    <i class="fas fa-user"></i> General Student
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        pendingList.innerHTML = studentsHtml;
    }

    renderCrewCandidates(candidates) {
        const candidatesRow = document.getElementById('crewCandidatesRow');
        const candidatesList = document.getElementById('crewCandidatesList');
        const candidatesCount = document.getElementById('candidatesCount');

        if (candidates.length === 0) {
            candidatesRow.style.display = 'none';
            return;
        }

        candidatesRow.style.display = 'block';
        candidatesCount.textContent = candidates.length;

        const candidatesHtml = candidates.map(candidate => `
            <div class="card mb-3 border-success">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-5">
                            <h6 class="mb-1">${candidate.first_name} ${candidate.last_name}</h6>
                            <small class="text-muted">${candidate.email}</small>
                            ${candidate.instagram_handle ? `<br><small class="text-muted">@${candidate.instagram_handle}</small>` : ''}
                        </div>
                        <div class="col-md-4">
                            <small><strong>Crew Registrations:</strong> ${candidate.crew_registrations}</small><br>
                            <small><strong>Classes:</strong> ${candidate.crew_courses}</small><br>
                            <small><strong>Current Type:</strong> 
                                <span class="badge ${candidate.current_student_type === 'crew_member' ? 'bg-warning' : 'bg-info'}">
                                    ${candidate.current_student_type === 'crew_member' ? 'Crew Member' : 'General Student'}
                                </span>
                            </small>
                        </div>
                        <div class="col-md-3">
                            ${candidate.current_student_type !== 'crew_member' ? `
                                <button class="btn btn-success btn-sm w-100" onclick="admin.classifyStudent(${candidate.id}, 'crew_member')">
                                    <i class="fas fa-user-check"></i> Promote to Crew Member
                                </button>
                            ` : `
                                <span class="text-success">
                                    <i class="fas fa-check-circle"></i> Already Crew Member
                                </span>
                            `}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        candidatesList.innerHTML = candidatesHtml;
    }

    async loadCrewMemberCandidates() {
        try {
            const response = await this.apiFetch('/api/admin/crew-member-candidates');
            const candidates = await response.json();
            this.renderCrewCandidates(candidates);
        } catch (error) {
            console.error('Error loading crew candidates:', error);
            this.showError('Failed to load crew member candidates');
        }
    }

    hideCrewCandidates() {
        document.getElementById('crewCandidatesRow').style.display = 'none';
    }

    async classifyStudent(studentId, studentType) {
        try {
            const response = await this.apiFetch(`/api/admin/students/${studentId}/classify`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ student_type: studentType })
            });

            const result = await response.json();

            if (response.ok) {
                this.showSuccess(`Student classified as ${studentType === 'crew_member' ? 'Crew Member' : 'General Student'}`);
                await this.refreshStudentData();
            } else {
                this.showError(result.error || 'Failed to classify student');
            }
        } catch (error) {
            console.error('Error classifying student:', error);
            this.showError('Failed to classify student');
        }
    }

    formatExperience(experience) {
        const experiences = {
            'beginner': 'Beginner - New to dance',
            'some_experience': 'Some Experience - 1-2 years',
            'intermediate': 'Intermediate - 2-5 years',
            'advanced': 'Advanced - 5+ years',
            'professional': 'Professional/Instructor'
        };
        return experiences[experience] || experience || 'Not specified';
    }

    async loadAllStudents() {
        const allStudentsList = document.getElementById('allStudentsList');
        
        // Show loading
        allStudentsList.innerHTML = `
            <div class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading students...</span>
                </div>
            </div>
        `;

        try {
            // Add historical classification interface
            allStudentsList.innerHTML = `
                <div class="card mb-4 border-primary">
                    <div class="card-header bg-primary text-white">
                        <h6 class="mb-0">
                            <i class="fas fa-history me-2"></i>
                            Historical Student Classification
                        </h6>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>One-Time Setup:</strong> Analyze all existing students and classify them based on their registration history. 
                            Students who registered for crew practice will be suggested as crew members.
                        </div>
                        <div class="d-grid gap-2 d-md-flex justify-content-md-start">
                            <button class="btn btn-primary" onclick="admin.runHistoricalAnalysis()" id="historicalAnalysisBtn">
                                <i class="fas fa-search me-2"></i>Run Historical Analysis
                            </button>
                            <button class="btn btn-outline-secondary" onclick="admin.showHistoricalHelp()">
                                <i class="fas fa-question-circle me-2"></i>How it Works
                            </button>
                        </div>
                        <div id="historicalAnalysisResults" class="mt-3" style="display: none;"></div>
                    </div>
                </div>
                
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    Complete student management interface is coming soon. Focus on pending classifications and crew member analysis above for now.
                </div>
            `;
        } catch (error) {
            console.error('Error loading all students:', error);
            allStudentsList.innerHTML = `
                <div class="alert alert-danger">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    Failed to load students list.
                </div>
            `;
        }
    }

    async loadCrewMembersList() {
        try {
            const response = await this.apiFetch('/api/admin/crew-members');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const crewMembers = await response.json();
            this.renderCrewMembersList(crewMembers);
        } catch (error) {
            console.error('Error loading crew members list:', error);
            this.showError(`Failed to load crew members: ${error.message}`);
            // Render empty state on error
            this.renderCrewMembersList([]);
        }
    }

    renderCrewMembersList(crewMembers) {
        // Add crew members section at the top of student management if we have crew members
        // Ensure crewMembers is an array to prevent .map() errors
        if (!crewMembers || !Array.isArray(crewMembers) || crewMembers.length === 0) return;

        const studentsSection = document.getElementById('studentsSection');
        if (!studentsSection) return;

        // Check if crew members section already exists
        let crewSection = document.getElementById('crewMembersOverview');
        if (!crewSection) {
            // Insert after the main header but before pending students
            const headerRow = studentsSection.querySelector('.row');
            crewSection = document.createElement('div');
            crewSection.id = 'crewMembersOverview';
            crewSection.className = 'row mb-4';
            headerRow.insertAdjacentElement('afterend', crewSection);
        }

        crewSection.innerHTML = `
            <div class="col-12">
                <div class="card border-warning">
                    <div class="card-header bg-warning text-dark">
                        <h5 class="mb-0">
                            <i class="fas fa-crown me-2"></i>
                            Current Crew Members
                            <span class="badge bg-dark ms-2">${crewMembers.length}</span>
                        </h5>
                    </div>
                    <div class="card-body">
                        <div class="row">
                            ${crewMembers.map(member => {
                                const name = `${member.first_name} ${member.last_name}`.trim() || 'Unknown Name';
                                return `
                                    <div class="col-md-6 col-lg-4 mb-3">
                                        <div class="card border-warning">
                                            <div class="card-body py-2">
                                                <div class="d-flex align-items-center">
                                                    <i class="fas fa-crown text-warning me-2"></i>
                                                    <div>
                                                        <strong>${name}</strong><br>
                                                        <small class="text-muted">
                                                            <i class="fas fa-envelope me-1"></i>${member.email}
                                                        </small>
                                                        ${member.instagram_handle ? `<br><small class="text-muted"><i class="fab fa-instagram me-1"></i>@${member.instagram_handle}</small>` : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        ${crewMembers.length === 0 ? `
                            <div class="text-muted text-center py-3">
                                <i class="fas fa-users me-2"></i>
                                No crew members classified yet. Use the classification tools below to identify crew members.
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    async runHistoricalAnalysis() {
        const analysisBtn = document.getElementById('historicalAnalysisBtn');
        const resultsDiv = document.getElementById('historicalAnalysisResults');
        
        // Show loading state
        if (analysisBtn) {
            analysisBtn.disabled = true;
            analysisBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        }

        try {
            const response = await this.apiFetch('/api/admin/historical-classification/analyze', {
                method: 'POST'
            });

            const result = await response.json();

            if (response.ok) {
                this.renderHistoricalAnalysisResults(result);
                this.showSuccess('Historical analysis completed successfully');
            } else {
                this.showError(result.error || 'Failed to run historical analysis');
            }
        } catch (error) {
            console.error('Error running historical analysis:', error);
            this.showError('Failed to run historical analysis');
        } finally {
            // Reset button state
            if (analysisBtn) {
                analysisBtn.disabled = false;
                analysisBtn.innerHTML = '<i class="fas fa-search me-2"></i>Run Historical Analysis';
            }
        }
    }

    renderHistoricalAnalysisResults(analysisResult) {
        const resultsDiv = document.getElementById('historicalAnalysisResults');
        if (!resultsDiv) return;

        const summary = analysisResult.summary || {};
        const suggestions = analysisResult.suggestions || [];
        const crewSuggestions = suggestions.filter(s => s.action === 'suggest_crew_member');

        resultsDiv.innerHTML = `
            <div class="card border-success">
                <div class="card-header bg-success text-white">
                    <h6 class="mb-0">
                        <i class="fas fa-chart-bar me-2"></i>
                        Analysis Results
                    </h6>
                </div>
                <div class="card-body">
                    <div class="row text-center mb-3">
                        <div class="col-md-3">
                            <div class="display-6 text-primary">${summary.totalStudents || 0}</div>
                            <small class="text-muted">Total Students</small>
                        </div>
                        <div class="col-md-3">
                            <div class="display-6 text-warning">${summary.crewMemberSuggestions || 0}</div>
                            <small class="text-muted">Crew Suggestions</small>
                        </div>
                        <div class="col-md-3">
                            <div class="display-6 text-info">${summary.generalStudents || 0}</div>
                            <small class="text-muted">General Students</small>
                        </div>
                        <div class="col-md-3">
                            <div class="display-6 text-success">${summary.alreadyClassified || 0}</div>
                            <small class="text-muted">Already Classified</small>
                        </div>
                    </div>

                    ${crewSuggestions.length > 0 ? `
                        <div class="alert alert-warning">
                            <strong><i class="fas fa-crown me-2"></i>Crew Member Suggestions</strong><br>
                            The following students registered for crew practice and should be classified as crew members:
                        </div>

                        <div class="table-responsive mb-3">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Student</th>
                                        <th>Email</th>
                                        <th>Reason</th>
                                        <th>Current Type</th>
                                        <th>Select</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${crewSuggestions.map((student, index) => `
                                        <tr>
                                            <td>
                                                <strong>${student.firstName} ${student.lastName}</strong>
                                                ${student.instagramHandle ? `<br><small class="text-muted">@${student.instagramHandle}</small>` : ''}
                                            </td>
                                            <td>${student.email}</td>
                                            <td><small>${student.reason}</small></td>
                                            <td>
                                                <span class="badge bg-secondary">${student.currentType}</span>
                                                →
                                                <span class="badge bg-warning">${student.suggestedType}</span>
                                            </td>
                                            <td>
                                                <input type="checkbox" class="form-check-input" 
                                                       id="student_${student.id}" 
                                                       data-student-id="${student.id}" 
                                                       checked>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>

                        <div class="d-flex justify-content-between align-items-center">
                            <div class="form-check">
                                <input type="checkbox" class="form-check-input" id="selectAllSuggestions" checked>
                                <label class="form-check-label" for="selectAllSuggestions">
                                    Select all suggestions
                                </label>
                            </div>
                            <div>
                                <button class="btn btn-outline-secondary me-2" onclick="admin.cancelHistoricalClassification()">
                                    Cancel
                                </button>
                                <button class="btn btn-success" onclick="admin.applyHistoricalClassifications()">
                                    <i class="fas fa-check me-2"></i>
                                    Apply Selected Classifications
                                </button>
                            </div>
                        </div>
                    ` : `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle me-2"></i>
                            <strong>No crew member suggestions found.</strong><br>
                            All students have either been classified already or have no crew practice registration history.
                        </div>
                    `}
                </div>
            </div>
        `;

        // Wire up select all checkbox
        const selectAllCheckbox = document.getElementById('selectAllSuggestions');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const studentCheckboxes = resultsDiv.querySelectorAll('input[data-student-id]');
                studentCheckboxes.forEach(checkbox => {
                    checkbox.checked = e.target.checked;
                });
            });
        }

        resultsDiv.style.display = 'block';
    }

    async applyHistoricalClassifications() {
        const resultsDiv = document.getElementById('historicalAnalysisResults');
        if (!resultsDiv) return;

        // Get selected student IDs
        const selectedCheckboxes = resultsDiv.querySelectorAll('input[data-student-id]:checked');
        const studentIds = Array.from(selectedCheckboxes).map(cb => parseInt(cb.dataset.studentId));

        if (studentIds.length === 0) {
            this.showError('Please select at least one student to classify');
            return;
        }

        // Confirm the action
        if (!confirm(`Apply crew member classification to ${studentIds.length} selected students?`)) {
            return;
        }

        try {
            const response = await this.apiFetch('/api/admin/historical-classification/apply', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    student_ids: studentIds,
                    action: 'approve'
                })
            });

            const result = await response.json();

            if (response.ok) {
                this.showSuccess(`Successfully classified ${result.updated_count} students as crew members`);
                
                // Refresh the student management data
                await this.refreshStudentData();
                await this.loadCrewMembersList();
                
                // Hide the results and show completion message
                resultsDiv.innerHTML = `
                    <div class="alert alert-success">
                        <i class="fas fa-check-circle me-2"></i>
                        <strong>Classification Complete!</strong><br>
                        ${result.updated_count} students have been classified as crew members. 
                        The crew members list has been updated above.
                    </div>
                `;
            } else {
                this.showError(result.error || 'Failed to apply classifications');
            }
        } catch (error) {
            console.error('Error applying historical classifications:', error);
            this.showError('Failed to apply classifications');
        }
    }

    cancelHistoricalClassification() {
        const resultsDiv = document.getElementById('historicalAnalysisResults');
        if (resultsDiv) {
            resultsDiv.style.display = 'none';
        }
    }

    showHistoricalHelp() {
        const modalHtml = `
            <div class="modal fade" id="historicalHelpModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="fas fa-question-circle text-info me-2"></i>
                                Historical Student Classification
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <h6>How it Works:</h6>
                            <ol>
                                <li><strong>Analysis:</strong> The system examines all existing students and their registration history</li>
                                <li><strong>Pattern Recognition:</strong> Students who registered for crew practice courses are identified</li>
                                <li><strong>Suggestions:</strong> These students are suggested to be classified as "crew members"</li>
                                <li><strong>Review & Apply:</strong> You can review and selectively apply the suggestions</li>
                            </ol>

                            <h6>Classification Logic:</h6>
                            <div class="alert alert-info">
                                <strong>Crew Member:</strong> Students who have registered for any course with type "crew_practice"<br>
                                <strong>General Student:</strong> Students who only registered for drop-in or multi-week classes
                            </div>

                            <h6>What Happens After Classification:</h6>
                            <ul>
                                <li>Crew members will see both general classes AND crew practice classes</li>
                                <li>General students will only see classes open to everyone</li>
                                <li>The crew members list will be prominently displayed for easy contact</li>
                                <li>All classifications are marked as admin-reviewed</li>
                            </ul>

                            <h6>Safety Features:</h6>
                            <ul>
                                <li>Preview mode - see suggestions before applying</li>
                                <li>Selective application - choose which suggestions to apply</li>
                                <li>No data loss - existing student data is preserved</li>
                                <li>One-time setup - designed to be run once for historical data</li>
                            </ul>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('historicalHelpModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('historicalHelpModal'));
        modal.show();
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
