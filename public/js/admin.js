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


    // Additional admin functions
    async editCourse(courseId) {
        const course = this.courses.find(c => c.id === courseId);
        if (!course) return;

        // Set modal title and base fields
        document.getElementById('courseModalTitle').textContent = 'Edit Dance Series';
        document.getElementById('courseId').value = course.id;
        document.getElementById('courseName').value = course.name || '';
        document.getElementById('courseDescription').value = course.description || '';
        document.getElementById('courseType').value = course.course_type || 'multi-week';
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
