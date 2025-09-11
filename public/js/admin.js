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
            case 'settings':
                this.loadSettings();
                break;
        }
    }

    updateDashboardStats() {
        const totalRegs = this.registrations.length;
        const completedRegs = this.registrations.filter(r => r.payment_status === 'completed');
        const pendingRegs = this.registrations.filter(r => r.payment_status === 'pending');
        const activeCourses = this.courses.filter(c => c.is_active).length;
        
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
        const recentRegs = this.registrations
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
                        <th>Student</th>
                        <th>Course</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${recentRegs.map(reg => `
                        <tr>
                            <td>
                                <div>
                                    <strong>${([reg.first_name, reg.last_name].filter(Boolean).join(' ').trim()) || '(No name)'}</strong><br>
                                    <small class="text-muted">${reg.email}</small><br>
                                    ${reg.instagram_id ? `<small class="text-muted">@${reg.instagram_id}</small>` : ''}
                                </div>
                            </td>
                            <td>${reg.course_name || 'Drop-in Class'}</td>
                            <td>$${parseFloat(reg.payment_amount).toFixed(2)}</td>
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
        container.appendChild(table);
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
        
        let filteredRegs = [...this.registrations];
        
        if (courseFilter) {
            filteredRegs = filteredRegs.filter(r => r.course_id == courseFilter);
        }
        
        if (statusFilter) {
            filteredRegs = filteredRegs.filter(r => r.payment_status === statusFilter);
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
                        <th>Student</th>
                        <th>Course</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${registrations.map(reg => `
                        <tr>
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

    // Utility Functions
    async exportRegistrations() {
        try {
            const response = await this.apiFetch('/api/registrations');
            const registrations = await response.json();
            
            // Convert to CSV
            const headers = ['Name', 'Email', 'Phone', 'Instagram ID', 'Dance Experience', 'Course', 'Registration Type', 'Amount', 'Payment Status', 'Date'];
            const csvContent = [
                headers.join(','),
                ...registrations.map(reg => [
                    [reg.first_name, reg.last_name].filter(Boolean).join(' ').trim(),
                    reg.email,
                    reg.phone || '',
                    reg.instagram_id || '',
                    reg.dance_experience || '',
                    reg.course_name || 'Drop-in Class',
                    reg.registration_type,
                    reg.payment_amount,
                    reg.payment_status,
                    new Date(reg.registration_date).toLocaleDateString()
                ].join(','))
            ].join('\n');
            
            // Download file
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `registrations-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
            
            this.showSuccess('Registrations exported successfully');
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
