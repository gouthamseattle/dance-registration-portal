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
            case 'reports':
                this.loadReports();
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
            if (seriesEl) seriesEl.innerHTML = '<div class="text-muted">Loading...</div>';

            const seriesRes = await this.apiFetch('/api/admin/analytics/registrations-by-series');
            const seriesData = await seriesRes.json();
            this.renderReportsBySeries(seriesData);

            const btn = document.getElementById('refreshReportsBtn');
            if (btn && !btn._wired) {
                btn._wired = true;
                btn.addEventListener('click', () => this.loadReports());
            }
        } catch (e) {
            console.error('Reports load error:', e);
            const seriesEl = document.getElementById('reportsBySeries');
            if (seriesEl) seriesEl.innerHTML = '<div class="text-danger">Failed to load reports</div>';
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


    loadDashboard() {
        this.updateDashboardStats();
        this.loadRecentRegistrations();
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
                            <button class="btn btn-outline-danger btn-sm" onclick="admin.deleteCourse(${course.id})">
                                <i class="fas fa-trash"></i> Delete
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
                                <strong>${reg.course_name || 'Drop-in Class'}</strong>${reg.combo_name ? `<br><small class="text-muted">Combo: ${window.ClassInfo.esc(reg.combo_name)} · confirm or cancel applies to the whole combo</small>` : ''}${(() => { try { const d = JSON.parse(reg.selected_dates || 'null'); return Array.isArray(d) && d.length ? `<br><small class="text-muted">Dates: ${window.ClassInfo.formatDates(d)}</small>` : ''; } catch (e) { return ''; } })()}
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
                                    ${reg.payment_status === 'canceled' ? `
                                    <button class="btn btn-outline-secondary" onclick="admin.uncancelRegistration(${reg.id})" title="Uncancel Registration">
                                        <i class="fas fa-undo"></i>
                                    </button>
                                    ` : `
                                    <button class="btn btn-outline-danger" onclick="admin.cancelRegistration(${reg.id})" title="Cancel Registration">
                                        <i class="fas fa-ban"></i>
                                    </button>
                                    `}
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
        document.getElementById('venmoUsername').value = this.settings.venmo_username || '';
        document.getElementById('zelleRecipientName').value = this.settings.zelle_recipient_name || '';
        document.getElementById('zellePhone').value = this.settings.zelle_phone || '';
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











    async saveSettings() {
        const form = document.getElementById('settingsForm');
        const formData = new FormData(form);
        
        const settings = {
            venmo_username: (formData.get('venmo_username') || '').trim().replace(/^@/, ''),
            zelle_recipient_name: (formData.get('zelle_recipient_name') || '').trim(),
            zelle_phone: (formData.get('zelle_phone') || '').replace(/\D/g, ''),
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
            set('mainFee', pricing.full_package ?? pricing.drop_in ?? course.full_course_price);
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
        else if (type === 'drop_in') pricing = { drop_in: mainFee, full_package: mainFee * Math.max(dates.length, 1) };
        else pricing = { full_package: mainFee, drop_in: mainFee };
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
        if (payload.course_type === 'crew_practice' && n !== 1) problems.push('Crew practice has exactly 1 date');
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
            type === 'multi-week' ? 'Series fee (all dates) *' : type === 'drop_in' ? 'Fee per date *' : 'Fee';
        document.getElementById('datesHint').textContent =
            type === 'multi-week' ? 'Pick the first date, then "Fill weekly" to add the rest. Remove any date that is skipped.'
            : type === 'drop_in' ? 'Add 1 or 2 dates. Students can pay for one or both.' : 'Add the practice date.';

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
                        <button class="btn btn-sm btn-outline-danger" onclick="admin.deleteCombo(${combo.id})" aria-label="Delete combo"><i class="fas fa-trash"></i></button>
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
                this.showSuccess(msg);
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
        
        select.innerHTML = '<option value="">All Courses</option>';
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
                                                ${entry.status || 'active'}
                                            </span>
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
                                <button class="btn btn-outline-info btn-sm" onclick="admin.classifyStudent(${student.id}, 'test')">
                                    <i class="fas fa-vial"></i> Test
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
                const label = studentType === 'crew_member' ? 'Crew Member' : (studentType === 'test' ? 'Test' : 'General Student');
                this.showSuccess(`Student classified as ${label}`);
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
