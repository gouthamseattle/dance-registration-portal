/* Helper: format YYYY-MM-DD as local date without timezone shift */
function formatLocalDate(dateStr) {
    // Accept both 'YYYY-MM-DD' and ISO strings like 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
        : new Date(dateStr).toLocaleDateString();
}

// Email-Based Dance Registration Portal - Frontend JavaScript
class EmailProfileRegistrationApp {
    constructor() {
        this.currentStep = 'email-entry';
        this.currentEmail = '';
        this.currentStudent = null;
        this.eligibleCourses = [];
        this.seriesPackages = [];
        this.selectedCourse = null;
        this.selectedPackage = null;
        this.registrationData = {};
        this.settings = {};
        
        this.init();
    }

    async init() {
        try {
            await this.loadSettings();
            this.setupEventListeners();
            this.hideLoading();
            this.showEmailEntry();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to load registration portal. Please refresh the page.');
            this.hideLoading();
        }
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            this.settings = await response.json();
            
            // Check if registration is open
            if (this.settings.registration_open !== 'true') {
                this.showRegistrationClosed();
                return;
            }
            
            console.log('✅ Registration system ready');
        } catch (error) {
            console.error('Error loading settings:', error);
            throw error;
        }
    }

    setupEventListeners() {
        // Email entry form
        document.getElementById('emailEntryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEmailEntry();
        });

        // Profile creation form
        document.getElementById('profileCreationForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleProfileCreation();
        });
    }

    showEmailEntry() {
        this.currentStep = 'email-entry';
        this.hideAllSections();
        document.getElementById('emailEntrySection').style.display = 'block';
        
        // Clear previous data
        this.currentEmail = '';
        this.currentStudent = null;
        this.eligibleCourses = [];
        document.getElementById('email').value = '';
        document.getElementById('email').focus();
        
        this.scrollToTop();
    }

    async handleEmailEntry() {
        const emailField = document.getElementById('email');
        if (!emailField) {
            console.error('Email field not found');
            this.showError('Registration form not properly loaded. Please refresh the page.');
            return;
        }

        const email = emailField.value.trim();
        
        if (!email) {
            this.showError('Please enter your email address');
            return;
        }

        this.currentEmail = email;
        this.showLoading();

        try {
            const response = await fetch('/api/check-student-profile', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to check student profile');
            }

            this.hideLoading();

            if (result.exists) {
                // Existing student - show welcome back or require profile completion
                this.currentStudent = result.student;
                this.eligibleCourses = Array.isArray(result.eligible_courses) ? result.eligible_courses : [];

                // If server indicates profile completion is required (e.g., newly classified crew without full profile),
                // force the profile creation flow on next login.
                if (result.requires_profile_completion) {
                    this.showProfileCreation();
                    return;
                }

                this.showWelcomeBack();
            } else {
                // New student - show profile creation
                this.showProfileCreation();
            }

        } catch (error) {
            this.hideLoading();
            console.error('Error checking student profile:', error);
            this.showError(error.message || 'Failed to check student profile. Please try again.');
        }
    }

    showProfileCreation() {
        this.currentStep = 'profile-creation';
        this.hideAllSections();
        document.getElementById('profileCreationSection').style.display = 'block';
        
        // Clear form and pre-fill if existing student
        document.getElementById('profileCreationForm').reset();
        
        // Pre-fill form with existing data if available
        if (this.currentStudent) {
            const form = document.getElementById('profileCreationForm');
            if (this.currentStudent.first_name) {
                form.querySelector('[name="first_name"]').value = this.currentStudent.first_name;
            }
            if (this.currentStudent.last_name) {
                form.querySelector('[name="last_name"]').value = this.currentStudent.last_name;
            }
            if (this.currentStudent.instagram_handle) {
                form.querySelector('[name="instagram_handle"]').value = this.currentStudent.instagram_handle;
            }
            if (this.currentStudent.dance_experience) {
                form.querySelector('[name="dance_experience"]').value = this.currentStudent.dance_experience;
            }
            
            // Focus on the first empty required field
            if (!this.currentStudent.first_name) {
                document.getElementById('first_name').focus();
            } else if (!this.currentStudent.dance_experience) {
                document.getElementById('dance_experience').focus();
            } else if (!this.currentStudent.instagram_handle) {
                document.getElementById('instagram_handle').focus();
            } else {
                document.getElementById('first_name').focus();
            }
        } else {
            // New student - focus on first name
            document.getElementById('first_name').focus();
        }
        
        this.scrollToTop();
    }

    async handleProfileCreation() {
        console.log('🔧 Profile creation/update form submitted');
        
        const formData = new FormData(document.getElementById('profileCreationForm'));
        
        const profileData = {
            email: this.currentEmail,
            first_name: formData.get('first_name').trim(),
            last_name: formData.get('last_name').trim(),
            instagram_handle: formData.get('instagram_handle').trim(),
            dance_experience: formData.get('dance_experience')
        };

        console.log('🔧 Profile data:', profileData);

        if (!profileData.first_name || !profileData.dance_experience) {
            console.log('🔧 Validation failed - missing required fields');
            this.showError('Please fill in all required fields: First Name and Dance Experience');
            return;
        }

        console.log('🔧 Validation passed, sending to server...');

        this.showLoading();

        try {
            // Determine if this is creating a new profile or updating existing
            const isExistingStudent = this.currentStudent !== null;
            const endpoint = isExistingStudent ? '/api/update-student-profile' : '/api/create-student-profile';
            
            console.log(`🔧 Using endpoint: ${endpoint} (existing student: ${isExistingStudent})`);

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profileData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Failed to ${isExistingStudent ? 'update' : 'create'} profile`);
            }

            this.hideLoading();
            this.currentStudent = result.student;
            this.eligibleCourses = result.eligible_courses || [];

            const actionText = isExistingStudent ? 'updated' : 'created';
            console.log(`✅ Profile ${actionText} successfully:`, result.student);
            this.showSuccess(`Profile ${actionText} successfully! You can now view available classes.`);
            
            // Show available courses directly
            setTimeout(() => {
                this.showAvailableCourses();
            }, 1500);

        } catch (error) {
            this.hideLoading();
            console.error('Error with profile:', error);
            this.showError(error.message || 'Failed to save profile. Please try again.');
        }
    }

    showWelcomeBack() {
        this.currentStep = 'welcome-back';
        this.hideAllSections();
        document.getElementById('welcomeBackSection').style.display = 'block';

        // Populate welcome message
        const fullName = [this.currentStudent.first_name, this.currentStudent.last_name]
            .filter(Boolean).join(' ');
        const welcomeMsg = `Welcome back, ${fullName}!`;
        document.getElementById('welcomeMessage').textContent = welcomeMsg;

        // Show student info
        const studentInfoHtml = `
            <div class="row text-start">
                <div class="col-sm-6">
                    <strong>Email:</strong><br>
                    <span class="text-muted">${this.currentStudent.email}</span>
                </div>
                ${this.currentStudent.instagram_handle ? `
                    <div class="col-sm-6">
                        <strong>Instagram:</strong><br>
                        <span class="text-muted">@${this.currentStudent.instagram_handle}</span>
                    </div>
                ` : ''}
                ${this.currentStudent.dance_experience ? `
                    <div class="col-12 mt-2">
                        <strong>Experience:</strong><br>
                        <span class="text-muted">${this.formatExperience(this.currentStudent.dance_experience)}</span>
                    </div>
                ` : ''}
            </div>
        `;
        document.getElementById('studentInfo').innerHTML = studentInfoHtml;

        this.scrollToTop();
    }

    async showAvailableCourses() {
        this.currentStep = 'course-selection';
        this.hideAllSections();
        document.getElementById('courseSelection').style.display = 'block';

        // Update filter info
        const studentType = this.currentStudent?.student_type || 'general';
        const courseCount = this.eligibleCourses.length;
        let filterText = '';
        
        if (studentType === 'crew_member') {
            filterText = `Showing ${courseCount} classes available to crew members`;
        } else {
            filterText = `Showing ${courseCount} classes open to all students`;
        }
        
        document.getElementById('courseFilterInfo').textContent = filterText;

        // Load series packages
        await this.loadSeriesPackages();

        // Categorize and render courses
        this.renderCategorizedCourses();

        this.scrollToTop();
    }

    async loadSeriesPackages() {
        try {
            const response = await fetch('/api/dance-series');
            if (!response.ok) {
                console.warn('Failed to load series packages');
                this.seriesPackages = [];
                return;
            }

            const data = await response.json();
            // data.packages contains active packages with courses, pricing, savings
            this.seriesPackages = (data.packages || []).filter(p => p.is_active);
            console.log('✅ Loaded series packages:', this.seriesPackages.length);
        } catch (error) {
            console.error('Error loading series packages:', error);
            this.seriesPackages = [];
        }
    }

    renderCategorizedCourses() {
        const multiWeekContainer = document.getElementById('multiWeekCourses');
        const crewPracticeContainer = document.getElementById('crewPracticeCourses');
        const dropInContainer = document.getElementById('dropInClasses');
        const crewPracticeSection = document.getElementById('crewPracticeSection');
        const dropInSection = document.getElementById('dropInSection');
        const noCoursesMessage = document.getElementById('noCoursesMessage');

        // Clear containers
        multiWeekContainer.innerHTML = '';
        crewPracticeContainer.innerHTML = '';
        dropInContainer.innerHTML = '';

        // Categorize courses
        const multiWeekCourses = [];
        const crewPracticeCourses = [];
        const dropInCourses = [];
        const choreographyCourses = [];

        this.eligibleCourses.forEach(course => {
            if (course.course_type === 'crew_practice') {
                crewPracticeCourses.push(course);
            } else if (course.course_type === 'drop_in') {
                dropInCourses.push(course);
            } else if (course.course_type === 'choreography') {
                choreographyCourses.push(course);
            } else {
                multiWeekCourses.push(course);
            }
        });

        // Render choreography selection (checkbox-based)
        const choreoSection = document.getElementById('choreographySelectionSection');
        if ((this.seriesPackages.length > 0 && this.seriesPackages.some(p => p.courses && p.courses.length > 0)) || choreographyCourses.length > 0) {
            choreoSection.style.display = 'block';
            this.renderChoreographySelection(choreographyCourses);
        } else {
            choreoSection.style.display = 'none';
        }

        // Render each category
        multiWeekCourses.forEach(course => {
            const courseCard = this.createCourseCard(course);
            multiWeekContainer.appendChild(courseCard);
        });

        if (crewPracticeCourses.length > 0) {
            crewPracticeSection.style.display = 'block';
            crewPracticeCourses.forEach(course => {
                const courseCard = this.createCourseCard(course);
                crewPracticeContainer.appendChild(courseCard);
            });
        } else {
            crewPracticeSection.style.display = 'none';
        }

        if (dropInCourses.length > 0) {
            dropInSection.style.display = 'block';
            dropInCourses.forEach(course => {
                const courseCard = this.createDropInCard(course);
                dropInContainer.appendChild(courseCard);
            });
        } else {
            dropInSection.style.display = 'none';
        }

        // Show no courses message if no courses available
        if (this.eligibleCourses.length === 0 && this.seriesPackages.length === 0) {
            noCoursesMessage.style.display = 'block';
        } else {
            noCoursesMessage.style.display = 'none';
        }
    }

    renderChoreographySelection(choreographyCourses) {
        const container = document.getElementById('choreographySelectionContainer');
        container.innerHTML = '';

        // Collect all choreography courses from packages + standalone
        const allChoreos = [];
        const packageMap = {}; // courseId → package info

        // From series packages
        this.seriesPackages.forEach(pkg => {
            const courses = pkg.courses || [];
            courses.forEach(c => {
                if (!allChoreos.find(x => Number(x.id) === Number(c.id))) {
                    allChoreos.push(c);
                    packageMap[c.id] = pkg;
                }
            });
        });

        // From standalone choreography courses (not in any package)
        choreographyCourses.forEach(c => {
            if (!allChoreos.find(x => Number(x.id) === Number(c.id))) {
                allChoreos.push(c);
            }
        });

        if (allChoreos.length === 0) {
            container.innerHTML = '<p class="text-muted">No choreographies available</p>';
            return;
        }

        // Determine pricing
        const bestPackage = this.seriesPackages.length > 0 ? this.seriesPackages[0] : null;
        const packagePrice = bestPackage ? (bestPackage.package_price || 0) : 0;
        const totalCourses = allChoreos.length;

        // Build checkbox UI
        let html = `<div class="card border-info">
            <div class="card-header bg-info text-white">
                <h5 class="mb-0"><i class="fas fa-check-square me-2"></i>Select Your Choreographies</h5>
                <small>Choose the choreographies you'd like to learn</small>
            </div>
            <div class="card-body">`;

        // Choreography checkboxes
        allChoreos.forEach((course, idx) => {
            const metaItems = [course.song_name, course.movie_name, course.language].filter(Boolean).join(' • ');
            const individualPrice = course.full_course_price || course.per_class_price || 25;
            const registrationStatus = course.registration_status || 'not_registered';
            const isRegistered = registrationStatus === 'registered_completed';
            const isPending = registrationStatus === 'registered_pending';

            html += `
                <div class="form-check choreo-checkbox-item p-3 mb-2 border rounded ${isRegistered ? 'bg-light' : ''}" style="cursor: pointer;"
                     onclick="if(!this.querySelector('input').disabled) { this.querySelector('input').checked = !this.querySelector('input').checked; app.updateChoreoPricing(); }">
                    <input class="form-check-input choreo-check" type="checkbox" 
                           id="choreo_${course.id}" value="${course.id}"
                           data-price="${individualPrice}" data-name="${course.name}"
                           ${isRegistered || isPending ? 'disabled checked' : ''}
                           onclick="event.stopPropagation(); app.updateChoreoPricing();">
                    <label class="form-check-label w-100" for="choreo_${course.id}" onclick="event.stopPropagation();">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>${course.name}</strong>
                                ${isRegistered ? '<span class="badge bg-success ms-2">✓ Registered</span>' : ''}
                                ${isPending ? '<span class="badge bg-warning ms-2">Payment Pending</span>' : ''}
                                ${metaItems ? `<br><small class="text-muted">${metaItems}</small>` : ''}
                            </div>
                            <span class="text-muted">$${individualPrice}</span>
                        </div>
                    </label>
                </div>`;
        });

        // Pricing summary
        html += `
                <div id="choreoPricingSummary" class="mt-3 p-3 bg-light rounded" style="display: none;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span id="choreoSelectedCount" class="text-muted">0 selected</span>
                        <span id="choreoTotalPrice" class="h5 mb-0 text-info">$0</span>
                    </div>
                    <div id="choreoPackageDeal" class="text-success small mb-2" style="display: none;">
                        <i class="fas fa-tag me-1"></i><span id="choreoSavingsText"></span>
                    </div>
                    <button id="choreoSubmitBtn" class="btn btn-info w-100 text-white" onclick="app.submitChoreographySelection()" disabled>
                        <i class="fas fa-arrow-right me-2"></i>Continue to Payment
                    </button>
                </div>`;

        // Package deal hint
        if (bestPackage && packagePrice > 0 && totalCourses > 1) {
            html += `
                <div class="mt-2 text-center">
                    <small class="text-muted">
                        <i class="fas fa-info-circle me-1"></i>
                        Select all ${totalCourses} choreographies for the package deal: <strong>$${packagePrice}</strong>
                    </small>
                </div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;

        // Store pricing data for dynamic updates
        this._choreoPricing = {
            courses: allChoreos,
            packagePrice: packagePrice,
            totalCourses: totalCourses,
            bestPackage: bestPackage
        };
    }

    updateChoreoPricing() {
        const checkboxes = document.querySelectorAll('.choreo-check:checked:not(:disabled)');
        const count = checkboxes.length;
        const summary = document.getElementById('choreoPricingSummary');
        const countEl = document.getElementById('choreoSelectedCount');
        const priceEl = document.getElementById('choreoTotalPrice');
        const dealEl = document.getElementById('choreoPackageDeal');
        const savingsEl = document.getElementById('choreoSavingsText');
        const submitBtn = document.getElementById('choreoSubmitBtn');

        if (count === 0) {
            summary.style.display = 'none';
            submitBtn.disabled = true;
            return;
        }

        summary.style.display = 'block';
        submitBtn.disabled = false;

        // Calculate price
        let individualTotal = 0;
        checkboxes.forEach(cb => {
            individualTotal += parseFloat(cb.dataset.price) || 0;
        });

        const pricing = this._choreoPricing || {};
        const allSelected = count >= (pricing.totalCourses || 999);
        const packagePrice = pricing.packagePrice || 0;

        let finalPrice;
        if (allSelected && packagePrice > 0 && packagePrice < individualTotal) {
            finalPrice = packagePrice;
            const savings = individualTotal - packagePrice;
            dealEl.style.display = 'block';
            savingsEl.textContent = `Package deal applied! Save $${savings.toFixed(0)}!`;
        } else {
            finalPrice = individualTotal;
            dealEl.style.display = 'none';
        }

        countEl.textContent = `${count} of ${pricing.totalCourses || '?'} selected`;
        priceEl.textContent = `$${finalPrice.toFixed(0)}`;
    }

    async submitChoreographySelection() {
        const checkboxes = document.querySelectorAll('.choreo-check:checked:not(:disabled)');
        if (checkboxes.length === 0) {
            this.showError('Please select at least one choreography');
            return;
        }

        const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
        const selectedNames = Array.from(checkboxes).map(cb => cb.dataset.name);

        // Calculate price
        let individualTotal = 0;
        checkboxes.forEach(cb => {
            individualTotal += parseFloat(cb.dataset.price) || 0;
        });

        const pricing = this._choreoPricing || {};
        const allSelected = selectedIds.length >= (pricing.totalCourses || 999);
        const packagePrice = pricing.packagePrice || 0;
        const isPackageDeal = allSelected && packagePrice > 0 && packagePrice < individualTotal;
        const finalPrice = isPackageDeal ? packagePrice : individualTotal;

        this.showLoading();

        try {
            // Register for selected courses
            const response = await fetch('/api/register-series-package', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.currentEmail,
                    student_id: this.currentStudent.id,
                    series_id: pricing.bestPackage ? pricing.bestPackage.id : null,
                    course_ids: selectedIds,
                    payment_amount: finalPrice,
                    special_requests: isPackageDeal
                        ? `Choreography package: ${selectedNames.join(', ')}`
                        : `Individual choreographies: ${selectedNames.join(', ')}`
                })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to register');

            this.hideLoading();

            // Redirect to payment page
            if (result.registrationIds && result.registrationIds.length > 0) {
                const params = new URLSearchParams({
                    email: this.currentEmail,
                    student_id: this.currentStudent.id,
                    course_id: selectedIds[0],
                    student_type: this.currentStudent.student_type,
                    first_name: this.currentStudent.first_name,
                    last_name: this.currentStudent.last_name,
                    instagram_handle: this.currentStudent.instagram_handle || '',
                    dance_experience: this.currentStudent.dance_experience || '',
                    profile_complete: true,
                    package_registration: true,
                    package_name: isPackageDeal ? (pricing.bestPackage?.name || 'Choreography Package') : 'Selected Choreographies',
                    package_price: finalPrice,
                    package_courses: selectedNames.join('|'),
                    registration_ids: result.registrationIds.join(',')
                });
                window.location.href = `/index-registration.html?${params.toString()}`;
            } else {
                this.showError('Registration created but no IDs returned');
            }
        } catch (error) {
            this.hideLoading();
            console.error('Choreography registration error:', error);
            this.showError(error.message || 'Failed to register. Please try again.');
        }
    }

    renderSeriesPackages() {
        const slot1Container = document.getElementById('slot1Packages');
        const slot2Container = document.getElementById('slot2Packages');
        
        slot1Container.innerHTML = '';
        slot2Container.innerHTML = '';

        // Separate packages by slot (new API uses primary_slot)
        const slot1Packages = this.seriesPackages.filter(p => p.primary_slot === 1 || p.slot_number === 1);
        const slot2Packages = this.seriesPackages.filter(p => p.primary_slot === 2 || p.slot_number === 2);
        const bothPackages = this.seriesPackages.filter(p => p.primary_slot === 'both');
        // Add "both" packages to both slots for visibility
        slot1Packages.push(...bothPackages);

        // Render Slot 1 packages
        if (slot1Packages.length > 0) {
            const slot1Header = document.createElement('h5');
            slot1Header.className = 'text-muted mb-3';
            slot1Header.innerHTML = '<i class="fas fa-layer-group me-2"></i>Slot 1 Packages';
            slot1Container.appendChild(slot1Header);

            const slot1Row = document.createElement('div');
            slot1Row.className = 'row';
            slot1Packages.forEach(pkg => {
                const card = this.createPackageCard(pkg);
                slot1Row.appendChild(card);
            });
            slot1Container.appendChild(slot1Row);
        }

        // Render Slot 2 packages
        if (slot2Packages.length > 0) {
            const slot2Header = document.createElement('h5');
            slot2Header.className = 'text-muted mb-3 mt-4';
            slot2Header.innerHTML = '<i class="fas fa-layer-group me-2"></i>Slot 2 Packages';
            slot2Container.appendChild(slot2Header);

            const slot2Row = document.createElement('div');
            slot2Row.className = 'row';
            slot2Packages.forEach(pkg => {
                const card = this.createPackageCard(pkg);
                slot2Row.appendChild(card);
            });
            slot2Container.appendChild(slot2Row);
        }
    }

    createPackageCard(pkg) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 col-xl-4 mb-4';

        // Get choreographies included in package (new API uses 'courses', old used 'choreographies')
        const choreographies = pkg.courses || pkg.choreographies || [];
        const choreographyList = choreographies.map(c => {
            const metaInfo = [c.song_name, c.movie_name, c.language].filter(Boolean).join(' • ');
            return `
                <div class="mb-2">
                    <strong>${c.name}</strong>
                    ${metaInfo ? `<br><small class="text-muted">${metaInfo}</small>` : ''}
                </div>
            `;
        }).join('');

        const packagePrice = pkg.package_price || 0;
        const individualTotal = pkg.individual_total || choreographies.reduce((sum, c) => sum + (c.full_course_price || 0), 0);
        const savings = pkg.savings || (individualTotal - packagePrice);
        const seriesName = pkg.name || pkg.series_name || 'Choreography Package';

        col.innerHTML = `
            <div class="card course-card border-info fade-in">
                <div class="card-header bg-info text-white">
                    <span class="badge bg-light text-info mb-2">PACKAGE DEAL</span>
                    <h5 class="card-title mb-0">${seriesName}</h5>
                    <p class="card-subtitle mb-0 mt-1"><small>${choreographies.length} Choreography Batches</small></p>
                </div>
                <div class="card-body">
                    ${pkg.description ? `<p class="text-muted mb-3">${pkg.description}</p>` : ''}
                    
                    <div class="mb-3">
                        <h6 class="text-muted mb-2">Includes:</h6>
                        ${choreographyList}
                    </div>

                    <div class="package-pricing mb-3">
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="text-muted">Package Price:</span>
                            <span class="h4 text-info mb-0">$${packagePrice}</span>
                        </div>
                        ${savings > 0 ? `
                            <div class="text-end">
                                <small class="text-success">
                                    <i class="fas fa-tag me-1"></i>Save $${savings}!
                                </small>
                            </div>
                        ` : ''}
                    </div>

                    <button class="btn btn-info w-100 text-white" onclick="app.selectPackage(${pkg.id})">
                        <i class="fas fa-box me-2"></i>Select Package
                    </button>
                </div>
            </div>
        `;

        return col;
    }

    createChoreographyCard(course) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 col-xl-4 mb-4';

        const availableSpots = parseInt(course.available_spots) || 0;
        const registrationStatus = course.registration_status || 'not_registered';
        const isRegistered = registrationStatus === 'registered_completed';
        const isPending = registrationStatus === 'registered_pending';

        // Build choreography metadata
        const metaItems = [];
        if (course.song_name) {
            metaItems.push(`<div class="course-info-item"><i class="fas fa-music"></i><span><strong>Song:</strong> ${course.song_name}</span></div>`);
        }
        if (course.movie_name) {
            metaItems.push(`<div class="course-info-item"><i class="fas fa-film"></i><span><strong>Movie:</strong> ${course.movie_name}</span></div>`);
        }
        if (course.language) {
            metaItems.push(`<div class="course-info-item"><i class="fas fa-language"></i><span><strong>Language:</strong> ${course.language}</span></div>`);
        }

        // Build schedule info
        let scheduleHtml = '';
        if (course.slots && course.slots.length > 0) {
            const scheduleItems = course.slots.map(slot => {
                const parts = [];
                if (slot.day_of_week) parts.push(`${slot.day_of_week}s`);
                const start = slot.start_time || course.start_time;
                const end = slot.end_time || course.end_time;
                if (start && end) parts.push(`${start} - ${end}`);
                if (slot.location) parts.push(`at ${slot.location}`);
                return parts.join(' ');
            }).filter(t => t);

            let dateInfo = '';
            if (course.start_date && course.end_date) {
                const startDate = formatLocalDate(course.start_date);
                const endDate = formatLocalDate(course.end_date);
                dateInfo = `<br><small>${startDate} - ${endDate}</small>`;
            }

            if (scheduleItems.length > 0) {
                scheduleHtml = `
                    <div class="course-info-item">
                        <i class="fas fa-calendar"></i>
                        <span>${scheduleItems.join('<br>')}${dateInfo}</span>
                    </div>
                `;
            }
        }

        col.innerHTML = `
            <div class="card course-card border-success fade-in ${isRegistered ? 'registered-course' : ''} ${isPending ? 'pending-course' : ''}">
                <div class="card-header bg-success text-white">
                    <span class="badge bg-light text-success mb-2">CHOREOGRAPHY</span>
                    <h5 class="card-title mb-0">${course.name}</h5>
                    <p class="card-subtitle mb-0 mt-1"><small>2-Class Batch</small></p>
                    ${isRegistered ? `
                        <div class="registration-status-badge registered">
                            <i class="fas fa-check-circle"></i> Registered
                        </div>
                    ` : isPending ? `
                        <div class="registration-status-badge pending">
                            <i class="fas fa-clock"></i> Payment Pending
                        </div>
                    ` : ''}
                </div>
                <div class="card-body">
                    ${course.description ? `<p class="text-muted mb-3">${course.description}</p>` : ''}
                    
                    <div class="course-info mb-3">
                        ${metaItems.join('')}
                        ${scheduleHtml}
                    </div>

                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="text-muted">Price:</span>
                        <span class="h5 mb-0 text-success">$${course.full_course_price || course.per_class_price || 0}</span>
                    </div>

                    <button class="btn register-btn ${availableSpots <= 0 && !isRegistered && !isPending ? 'waitlist-btn' : ''}" 
                            onclick="app.selectCourse(${course.id})"
                            ${availableSpots <= 0 && !isRegistered && !isPending ? '' : isRegistered || isPending ? 'disabled' : ''}>
                        <i class="fas ${isRegistered ? 'fa-check' : isPending ? 'fa-clock' : availableSpots > 0 ? 'fa-user-plus' : 'fa-list-alt'}"></i>
                        ${isRegistered ? 'Already Registered' : isPending ? 'Payment Pending' : availableSpots > 0 ? 'Register Now' : 'Join Waitlist'}
                    </button>
                </div>
            </div>
        `;

        return col;
    }

    async selectPackage(packageId) {
        const pkg = this.seriesPackages.find(p => p.id === packageId);
        
        if (!pkg) {
            this.showError('Package not found');
            return;
        }

        this.selectedPackage = pkg;
        const seriesName = pkg.name || pkg.series_name || 'Choreography Package';
        const courses = pkg.courses || pkg.choreographies || [];
        console.log('Package selected:', seriesName);

        this.showLoading();

        try {
            // Register for the series package
            const response = await fetch('/api/register-series-package', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: this.currentEmail,
                    student_id: this.currentStudent.id,
                    series_id: packageId,
                    payment_amount: pkg.package_price || 0,
                    special_requests: `Series package: ${seriesName}`
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to register for package');
            }

            this.hideLoading();

            console.log('✅ Package registration successful:', result);

            // Redirect to payment page with the first registration ID
            if (result.registrationIds && result.registrationIds.length > 0) {
                const firstCourseId = courses.length > 0 ? courses[0].id : null;
                const registrationData = {
                    email: this.currentEmail,
                    student_id: this.currentStudent.id,
                    course_id: firstCourseId, // Use first course for payment page
                    student_type: this.currentStudent.student_type,
                    first_name: this.currentStudent.first_name,
                    last_name: this.currentStudent.last_name,
                    instagram_handle: this.currentStudent.instagram_handle,
                    dance_experience: this.currentStudent.dance_experience,
                    profile_complete: true,
                    package_name: seriesName,
                    package_registration: true,
                    registration_ids: result.registrationIds.join(',')
                };

                const params = new URLSearchParams(registrationData);
                window.location.href = `/index-registration.html?${params.toString()}`;
            } else {
                this.showError('Registration created but no IDs returned');
            }

        } catch (error) {
            this.hideLoading();
            console.error('Package registration error:', error);
            this.showError(error.message || 'Failed to register for package. Please try again.');
        }
    }

    createCourseCard(course) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 col-xl-4 mb-4';

        const availableSpots = parseInt(course.available_spots) || 0;
        const hasFullCoursePrice = course.full_course_price && course.full_course_price > 0;
        const hasPerClassPrice = course.per_class_price && course.per_class_price > 0;
        
        // Check registration status
        const registrationStatus = course.registration_status || 'not_registered';
        const isRegistered = registrationStatus === 'registered_completed';
        const isPending = registrationStatus === 'registered_pending';

        // Build schedule from slots or fallback to schedule_info
        let scheduleHtml = '';
        if (course.slots && course.slots.length > 0) {
            const scheduleItems = course.slots.map(slot => {
                const parts = [];
                if (course.course_type === 'crew_practice') {
                    if (slot.practice_date) {
                        const dateStr = formatLocalDate(slot.practice_date);
                        parts.push(dateStr);
                    }
                } else if (slot.day_of_week) {
                    parts.push(`${slot.day_of_week}s`);
                }
                const start = slot.start_time || course.start_time;
                const end = slot.end_time || course.end_time;
                if (start && end) {
                    parts.push(`${start} - ${end}`);
                } else if (start) {
                    parts.push(start);
                }
                if (slot.location) parts.push(`at ${slot.location}`);
                let scheduleText = parts.join(' ');
                if (course.slots.length > 1 && slot.difficulty_level) {
                    scheduleText += ` (${slot.difficulty_level})`;
                }
                return scheduleText;
            }).filter(t => t);

            let dateInfo = '';
            if (course.course_type !== 'crew_practice') {
                if (course.start_date && course.end_date) {
                    const startDate = formatLocalDate(course.start_date);
                    const endDate = formatLocalDate(course.end_date);
                    dateInfo = `<br><small>${startDate} - ${endDate}</small>`;
                } else if (course.start_date) {
                    const startDate = formatLocalDate(course.start_date);
                    dateInfo = `<br><small>Starts ${startDate}</small>`;
                }
            }

            if (scheduleItems.length > 0) {
                scheduleHtml = `
                    <div class="course-info-item">
                        <i class="fas fa-calendar"></i>
                        <span>${scheduleItems.join('<br>')}${dateInfo}</span>
                    </div>
                `;
            }
        }

        if (!scheduleHtml && course.schedule_info) {
            scheduleHtml = `
                <div class="course-info-item">
                    <i class="fas fa-calendar"></i>
                    <span>${course.schedule_info}</span>
                </div>
            `;
        }

        // Add course type badge
        let typeBadge = '';
        if (course.course_type === 'crew_practice') {
            typeBadge = '<span class="badge bg-warning mb-2">Crew Members Only</span>';
        }

        col.innerHTML = `
            <div class="card course-card fade-in ${isRegistered ? 'registered-course' : ''} ${isPending ? 'pending-course' : ''}">
                <div class="card-header">
                    ${typeBadge}
                    <h5 class="card-title">${course.name}</h5>
                    <p class="card-subtitle">${course.level || 'All Levels'} • ${course.duration_weeks || 0} weeks</p>
                    ${isRegistered ? `
                        <div class="registration-status-badge registered">
                            <i class="fas fa-check-circle"></i> Registered
                        </div>
                    ` : isPending ? `
                        <div class="registration-status-badge pending">
                            <i class="fas fa-clock"></i> Payment Pending
                        </div>
                    ` : ''}
                </div>
                <div class="card-body">
                    ${course.description ? `<p class="text-muted mb-3">${course.description}</p>` : ''}
                    
                    <div class="course-info">
                        ${scheduleHtml}
                        ${course.prerequisites ? `
                            <div class="course-info-item">
                                <i class="fas fa-info-circle"></i>
                                <span>${course.prerequisites}</span>
                            </div>
                        ` : ''}
                    </div>


                    <button class="btn register-btn ${availableSpots <= 0 && !isRegistered && !isPending ? 'waitlist-btn' : ''}" 
                            onclick="app.selectCourse(${course.id})"
                            ${availableSpots <= 0 && !isRegistered && !isPending ? '' : isRegistered || isPending ? 'disabled' : ''}>
                        <i class="fas ${isRegistered ? 'fa-check' : isPending ? 'fa-clock' : availableSpots > 0 ? 'fa-user-plus' : 'fa-list-alt'}"></i>
                        ${isRegistered ? 'Already Registered' : isPending ? 'Payment Pending' : availableSpots > 0 ? 'Register Now' : 'Join Waitlist'}
                    </button>
                </div>
            </div>
        `;

        return col;
    }

    createDropInCard(course) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 mb-3';

        const availableSpots = parseInt(course.available_spots) || 0;
        const hasPerClassPrice = course.per_class_price && course.per_class_price > 0;

        // For drop-in classes, get the class date from the slot
        let classDate = '';
        let classTime = '';
        if (course.slots && course.slots.length > 0) {
            const slot = course.slots[0];
            if (slot.practice_date) {
                classDate = formatLocalDate(slot.practice_date);
            }
            if (slot.start_time && slot.end_time) {
                classTime = `${slot.start_time} - ${slot.end_time}`;
            } else if (slot.start_time) {
                classTime = slot.start_time;
            }
        }

        col.innerHTML = `
            <div class="card dropin-card fade-in">
                <div class="dropin-card-header">
                    <div class="goumo-text-logo">GouMo Dance Chronicles</div>
                </div>
                <div class="card-body">
                    <div class="dropin-header">
                        <div>
                            <h6 class="dropin-title">${course.name}</h6>
                            <small class="text-muted">Drop-in Class</small>
                        </div>
                        <div class="dropin-price">$${course.per_class_price || '0'}</div>
                    </div>
                    
                    <div class="dropin-details">
                        ${classDate ? `
                            <div class="dropin-detail">
                                <i class="fas fa-calendar"></i>
                                <span>${classDate}</span>
                            </div>
                        ` : ''}
                        ${classTime ? `
                            <div class="dropin-detail">
                                <i class="fas fa-clock"></i>
                                <span>${classTime}</span>
                            </div>
                        ` : ''}
                        ${course.instructor ? `
                            <div class="dropin-detail">
                                <i class="fas fa-user"></i>
                                <span>${course.instructor}</span>
                            </div>
                        ` : ''}
                        ${availableSpots <= 0 ? `
                        <div class="dropin-detail">
                            <i class="fas fa-users"></i>
                            <span>FULL</span>
                        </div>` : 
                        availableSpots < 10 ? `
                        <div class="dropin-detail">
                            <i class="fas fa-users"></i>
                            <span>Last few spots!</span>
                        </div>` : ''}
                    </div>

                    ${course.description ? `<p class="text-muted small mb-3">${course.description}</p>` : ''}

                    <button class="btn register-btn ${availableSpots <= 0 ? 'waitlist-btn' : ''}" 
                            onclick="app.selectCourse(${course.id})"
                            ${availableSpots <= 0 ? '' : ''}>
                        <i class="fas ${availableSpots > 0 ? 'fa-user-plus' : 'fa-list-alt'}"></i>
                        ${availableSpots > 0 ? 'Register Now' : 'Join Waitlist'}
                    </button>
                </div>
            </div>
        `;

        return col;
    }

    async selectCourse(courseId) {
        const course = this.eligibleCourses.find(c => Number(c.id) === Number(courseId));
        
        if (!course) {
            this.showError('Course not found');
            return;
        }

        this.selectedCourse = course;
        const availableSpots = parseInt(course.available_spots) || 0;
        
        console.log('Course selected:', course.name, 'Available spots:', availableSpots);

        // Check if course is full and needs waitlist registration
        if (availableSpots <= 0) {
            console.log('Course is full, proceeding with waitlist registration');
            await this.handleWaitlistRegistration(course);
            return;
        }

        // Course has spots available, proceed with regular registration
        const registrationData = {
            email: this.currentEmail,
            student_id: this.currentStudent.id,
            course_id: courseId,
            student_type: this.currentStudent.student_type,
            first_name: this.currentStudent.first_name,
            last_name: this.currentStudent.last_name,
            instagram_handle: this.currentStudent.instagram_handle,
            dance_experience: this.currentStudent.dance_experience,
            profile_complete: true
        };

        // Create URL with student and course data
        const params = new URLSearchParams(registrationData);
        
        // Show loading message
        this.showLoading();
        
        console.log('✅ Redirecting to main registration with student data:', registrationData);
        
        // Redirect to main registration portal with pre-filled data
        setTimeout(() => {
            window.location.href = `/index-registration.html?${params.toString()}`;
        }, 500);
    }

    async handleWaitlistRegistration(course) {
        this.showLoading();

        try {
            // Prepare waitlist registration data
            const waitlistData = {
                first_name: this.currentStudent.first_name,
                last_name: this.currentStudent.last_name,
                email: this.currentEmail,
                phone: this.currentStudent.phone || '',
                instagram_handle: this.currentStudent.instagram_handle || '',
                dance_experience: this.currentStudent.dance_experience || '',
                course_id: course.id,
                payment_amount: course.full_course_price || course.per_class_price || 0,
                how_heard_about_us: 'Existing student'
            };

            console.log('Submitting waitlist registration:', waitlistData);

            const response = await fetch('/api/waitlist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(waitlistData)
            });

            const result = await response.json();

            this.hideLoading();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to join waitlist');
            }

            console.log('✅ Waitlist registration successful:', result);
            
            // Show waitlist success message
            this.showWaitlistSuccess(course, result.position);

        } catch (error) {
            this.hideLoading();
            console.error('Waitlist registration failed:', error);
            this.showError(`Failed to join waitlist: ${error.message}`);
        }
    }

    showWaitlistSuccess(course, position) {
        this.currentStep = 'waitlist-success';
        this.hideAllSections();
        
        // Create waitlist success section if it doesn't exist
        let waitlistSection = document.getElementById('waitlistSuccessSection');
        if (!waitlistSection) {
            waitlistSection = document.createElement('section');
            waitlistSection.id = 'waitlistSuccessSection';
            waitlistSection.className = 'py-5';
            waitlistSection.innerHTML = `
                <div class="container">
                    <div class="row justify-content-center">
                        <div class="col-md-8">
                            <div class="card text-center success-animation">
                                <div class="card-header">
                                    <h3><i class="fas fa-list-alt text-warning"></i> You're on the Waitlist!</h3>
                                </div>
                                <div class="card-body">
                                    <div class="mb-4">
                                        <i class="fas fa-clock fa-4x text-warning mb-3"></i>
                                        <h4 id="waitlistCourseName">${course.name}</h4>
                                        <p class="lead">You are <strong>#${position}</strong> on the waitlist</p>
                                    </div>
                                    <div class="alert alert-info mb-4">
                                        <h6><i class="fas fa-info-circle"></i> What happens next?</h6>
                                        <ol class="text-left mb-0">
                                            <li>We'll notify you by email when a spot becomes available</li>
                                            <li>You'll have 48 hours to complete your registration</li>
                                            <li>Payment is only required when you get notified</li>
                                        </ol>
                                    </div>
                                    <div class="confirmation-details">
                                        <div class="confirmation-item">
                                            <span class="confirmation-label">Course:</span>
                                            <span class="confirmation-value">${course.name}</span>
                                        </div>
                                        <div class="confirmation-item">
                                            <span class="confirmation-label">Your Email:</span>
                                            <span class="confirmation-value">${this.currentEmail}</span>
                                        </div>
                                        <div class="confirmation-item">
                                            <span class="confirmation-label">Waitlist Position:</span>
                                            <span class="confirmation-value">#${position}</span>
                                        </div>
                                        <div class="confirmation-item">
                                            <span class="confirmation-label">Expected Price:</span>
                                            <span class="confirmation-value">$${course.full_course_price || course.per_class_price || 0}</span>
                                        </div>
                                    </div>
                                    <button class="btn btn-primary btn-lg" onclick="app.showAvailableCourses()">
                                        <i class="fas fa-plus"></i> Register for Another Class
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('mainContent').appendChild(waitlistSection);
        }
        
        // Update dynamic content
        document.getElementById('waitlistCourseName').textContent = course.name;
        waitlistSection.style.display = 'block';
        this.scrollToTop();
    }

    // Utility methods
    hideAllSections() {
        const sections = [
            'emailEntrySection',
            'profileCreationSection', 
            'welcomeBackSection',
            'courseSelection'
        ];
        
        sections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    formatExperience(experience) {
        const experiences = {
            'beginner': 'Beginner - New to dance',
            'some_experience': 'Some Experience - 1-2 years',
            'intermediate': 'Intermediate - 2-5 years', 
            'advanced': 'Advanced - 5+ years',
            'professional': 'Professional/Instructor'
        };
        return experiences[experience] || experience;
    }

    showRegistrationClosed() {
        document.getElementById('registrationStatus').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

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

    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new EmailProfileRegistrationApp();
});
