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

        // Competition state
        this.compCategory = null;
        this.compMemberCount = 0;
        this.compRegistrationId = null;
        this.compAmount = 0;
        
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

        // Show competition section if open
        this.checkCompetitionSection();

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
        this.seriesPackages.forEach(pkg => {
            (pkg.courses || []).forEach(c => {
                if (!allChoreos.find(x => Number(x.id) === Number(c.id))) allChoreos.push(c);
            });
        });
        choreographyCourses.forEach(c => {
            if (!allChoreos.find(x => Number(x.id) === Number(c.id))) allChoreos.push(c);
        });

        if (allChoreos.length === 0) {
            container.innerHTML = '<p class="text-muted">No choreographies available</p>';
            return;
        }

        // Group by series_slot
        const slot1Courses = allChoreos.filter(c => (c.series_slot || c.package_slot_number) === 1);
        const slot2Courses = allChoreos.filter(c => (c.series_slot || c.package_slot_number) === 2);

        // Get schedule info from first course in each slot
        const getSlotSchedule = (courses) => {
            for (const c of courses) {
                if (c.slots && c.slots.length > 0) {
                    const s = c.slots[0];
                    const day = s.day_of_week || '';
                    const time = (s.start_time && s.end_time) ? `${s.start_time}–${s.end_time}` : '';
                    return day && time ? `${day} ${time}` : (day || time || '');
                }
            }
            return '';
        };
        const slot1Schedule = getSlotSchedule(slot1Courses);
        const slot2Schedule = getSlotSchedule(slot2Courses);
        const slot1Weeks = slot1Courses[0]?.duration_weeks || 6;
        const slot2Weeks = slot2Courses[0]?.duration_weeks || 6;

        // Get package pricing — aggregate across ALL packages
        let slot1PkgPrice = 0;
        let slot2PkgPrice = 0;
        let combinedPkgPrice = 0;
        let slot1Pkg = null;
        let slot2Pkg = null;
        let comboPkg = null;
        this.seriesPackages.forEach(p => {
            if (p.slot1_package_price && p.slot1_package_price > slot1PkgPrice) {
                slot1PkgPrice = parseFloat(p.slot1_package_price);
                if (p.primary_slot === 1 || p.primary_slot === '1') slot1Pkg = p;
            }
            if (p.slot2_package_price && p.slot2_package_price > slot2PkgPrice) {
                slot2PkgPrice = parseFloat(p.slot2_package_price);
                if (p.primary_slot === 2 || p.primary_slot === '2') slot2Pkg = p;
            }
            if (p.combined_package_price && p.combined_package_price > combinedPkgPrice) {
                combinedPkgPrice = parseFloat(p.combined_package_price);
                if (p.primary_slot === 'both') comboPkg = p;
            }
        });
        // Fallback: if no slot-specific packages found, check package_price + primary_slot
        if (!slot1PkgPrice) {
            const s1 = this.seriesPackages.find(p => (p.primary_slot === 1 || p.primary_slot === '1') && p.package_price);
            if (s1) { slot1PkgPrice = parseFloat(s1.package_price); slot1Pkg = s1; }
        }
        if (!slot2PkgPrice) {
            const s2 = this.seriesPackages.find(p => (p.primary_slot === 2 || p.primary_slot === '2') && p.package_price);
            if (s2) { slot2PkgPrice = parseFloat(s2.package_price); slot2Pkg = s2; }
        }
        if (!combinedPkgPrice) {
            const cb = this.seriesPackages.find(p => p.primary_slot === 'both' && p.package_price);
            if (cb) { combinedPkgPrice = parseFloat(cb.package_price); comboPkg = cb; }
        }

        // Store state
        this._choreoState = {
            slot1Courses, slot2Courses, allChoreos,
            slot1PkgPrice, slot2PkgPrice, combinedPkgPrice,
            slot1Pkg, slot2Pkg, comboPkg,
            selectedTrack: null, pkg: slot1Pkg || slot2Pkg || comboPkg || (this.seriesPackages[0] || {})
        };

        // === BUILD HTML ===
        let html = '';

        // STEP 1: Choose Your Track
        html += `
        <div id="choreoStep1" class="mb-4">
            <h5 class="mb-3"><span class="badge bg-primary rounded-pill me-2">1</span>Choose Your Track</h5>
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="card h-100 border-primary track-card" id="trackCard1" onclick="app.selectTrack(1)" style="cursor:pointer;">
                        <div class="card-body text-center">
                            <div class="mb-2"><i class="fas fa-music fa-2x text-primary"></i></div>
                            <h6 class="card-title">Slot 1</h6>
                            <p class="text-muted small mb-1">${slot1Schedule || 'Schedule TBD'}</p>
                            <p class="text-muted small mb-2">${slot1Courses.length} choreographies • ${slot1Weeks} weeks</p>
                            ${slot1PkgPrice > 0 ? `<span class="badge bg-primary">Package: $${slot1PkgPrice}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100 border-info track-card" id="trackCard2" onclick="app.selectTrack(2)" style="cursor:pointer;">
                        <div class="card-body text-center">
                            <div class="mb-2"><i class="fas fa-music fa-2x text-info"></i></div>
                            <h6 class="card-title">Slot 2</h6>
                            <p class="text-muted small mb-1">${slot2Schedule || 'Schedule TBD'}</p>
                            <p class="text-muted small mb-2">${slot2Courses.length} choreographies • ${slot2Weeks} weeks</p>
                            ${slot2PkgPrice > 0 ? `<span class="badge bg-info">Package: $${slot2PkgPrice}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100 border-warning track-card" id="trackCardBoth" onclick="app.selectTrack('both')" style="cursor:pointer;">
                        <div class="card-body text-center">
                            <div class="mb-2"><i class="fas fa-fire fa-2x text-warning"></i></div>
                            <h6 class="card-title">Both Slots</h6>
                            <p class="text-muted small mb-1">Full Experience</p>
                            <p class="text-muted small mb-2">All ${allChoreos.length} choreographies</p>
                            ${combinedPkgPrice > 0 ? `<span class="badge bg-warning text-dark">Package: $${combinedPkgPrice}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        // STEP 2: Choose Choreographies (hidden initially)
        html += `
        <div id="choreoStep2" class="mb-4" style="display:none;">
            <h5 class="mb-3"><span class="badge bg-primary rounded-pill me-2">2</span>Choose Your Choreographies</h5>
            <div id="choreoPackageBanner" class="alert alert-success d-flex justify-content-between align-items-center mb-3" style="display:none!important;">
                <span><i class="fas fa-tag me-2"></i><strong id="pkgBannerText">Select all for package deal!</strong></span>
                <button class="btn btn-success btn-sm" onclick="app.selectAllChoreos()">
                    <i class="fas fa-check-double me-1"></i>Select All (Best Value)
                </button>
            </div>
            <div id="choreoCheckboxList">
                <!-- Dynamically populated -->
            </div>
        </div>`;

        // STEP 3: Live Summary (hidden initially)
        html += `
        <div id="choreoStep3" class="mb-4" style="display:none;">
            <h5 class="mb-3"><span class="badge bg-primary rounded-pill me-2">3</span>Your Selection</h5>
            <div class="card border-dark">
                <div class="card-body">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">Track:</span>
                        <strong id="summaryTrack">—</strong>
                    </div>
                    <div id="summaryItems">
                        <!-- Dynamically populated -->
                    </div>
                    <hr>
                    <div id="summaryPackageDeal" class="text-success mb-2" style="display:none;">
                        <i class="fas fa-tag me-1"></i><span id="summaryDealText"></span>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="h5 mb-0">Total:</span>
                        <span class="h4 mb-0 text-primary" id="summaryTotal">$0</span>
                    </div>
                    <button id="choreoCheckoutBtn" class="btn btn-primary btn-lg w-100" onclick="app.submitChoreographySelection()" disabled>
                        <i class="fas fa-arrow-right me-2"></i>Continue to Payment
                    </button>
                </div>
            </div>
        </div>`;

        container.innerHTML = html;
    }

    selectTrack(track) {
        this._choreoState.selectedTrack = track;

        // Highlight selected track card
        document.querySelectorAll('.track-card').forEach(c => {
            c.classList.remove('bg-primary', 'bg-info', 'bg-warning', 'text-white');
            c.style.opacity = '0.6';
        });
        const selectedCard = track === 'both' ? document.getElementById('trackCardBoth') :
                             track === 1 ? document.getElementById('trackCard1') :
                             document.getElementById('trackCard2');
        if (selectedCard) {
            const colorClass = track === 'both' ? 'bg-warning' : track === 1 ? 'bg-primary' : 'bg-info';
            selectedCard.classList.add(colorClass);
            if (track !== 'both') selectedCard.classList.add('text-white');
            selectedCard.style.opacity = '1';
        }

        // Get relevant courses
        const st = this._choreoState;
        let courses = [];
        if (track === 1) courses = st.slot1Courses;
        else if (track === 2) courses = st.slot2Courses;
        else courses = [...st.slot1Courses, ...st.slot2Courses];

        // Determine package price and package ref for this track
        let trackPkgPrice = 0;
        let trackPkg = null;
        if (track === 1) { trackPkgPrice = st.slot1PkgPrice; trackPkg = st.slot1Pkg; }
        else if (track === 2) { trackPkgPrice = st.slot2PkgPrice; trackPkg = st.slot2Pkg; }
        else { trackPkgPrice = st.combinedPkgPrice; trackPkg = st.comboPkg; }

        this._choreoState.visibleCourses = courses;
        this._choreoState.trackPkgPrice = trackPkgPrice;
        // Update pkg to the track-specific package for registration
        if (trackPkg) this._choreoState.pkg = trackPkg;

        // Show Step 2
        document.getElementById('choreoStep2').style.display = 'block';

        // Show package banner
        const banner = document.getElementById('choreoPackageBanner');
        if (trackPkgPrice > 0 && courses.length > 1) {
            banner.style.display = 'flex';
            banner.style.cssText = ''; // remove display:none!important
            const indivTotal = courses.reduce((s, c) => s + (c.full_course_price || c.per_class_price || 25), 0);
            const savings = indivTotal - trackPkgPrice;
            document.getElementById('pkgBannerText').textContent =
                `Select all ${courses.length} for $${trackPkgPrice}` + (savings > 0 ? ` (Save $${savings}!)` : '');
        } else {
            banner.style.display = 'none';
        }

        // Build checkboxes
        const listEl = document.getElementById('choreoCheckboxList');
        let checkHtml = '';

        // If "both" selected, group by slot
        if (track === 'both') {
            if (st.slot1Courses.length > 0) {
                checkHtml += `<h6 class="text-muted mt-2 mb-2"><i class="fas fa-layer-group me-1"></i>Slot 1</h6>`;
                checkHtml += this._buildChoreoCheckboxes(st.slot1Courses);
            }
            if (st.slot2Courses.length > 0) {
                checkHtml += `<h6 class="text-muted mt-3 mb-2"><i class="fas fa-layer-group me-1"></i>Slot 2</h6>`;
                checkHtml += this._buildChoreoCheckboxes(st.slot2Courses);
            }
        } else {
            checkHtml += this._buildChoreoCheckboxes(courses);
        }

        listEl.innerHTML = checkHtml;

        // Show summary
        document.getElementById('choreoStep3').style.display = 'block';
        document.getElementById('summaryTrack').textContent =
            track === 'both' ? 'Both Slots' : `Slot ${track}`;

        this.updateChoreoPricing();

        // Smooth scroll to step 2
        document.getElementById('choreoStep2').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    _buildChoreoCheckboxes(courses) {
        let html = '';
        courses.forEach(course => {
            const meta = [course.song_name, course.movie_name, course.language].filter(Boolean).join(' • ');
            const price = course.full_course_price || course.per_class_price || 25;
            const regStatus = course.registration_status || 'not_registered';
            const isReg = regStatus === 'registered_completed';
            const isPend = regStatus === 'registered_pending';

            html += `
            <div class="form-check p-3 mb-2 border rounded ${isReg ? 'bg-light' : ''}" style="cursor:pointer;"
                 onclick="if(!this.querySelector('input').disabled){this.querySelector('input').checked=!this.querySelector('input').checked;app.updateChoreoPricing();}">
                <input class="form-check-input choreo-check" type="checkbox"
                       id="choreo_${course.id}" value="${course.id}"
                       data-price="${price}" data-name="${course.name}"
                       ${isReg || isPend ? 'disabled checked' : ''}
                       onclick="event.stopPropagation();app.updateChoreoPricing();">
                <label class="form-check-label w-100" for="choreo_${course.id}" onclick="event.stopPropagation();">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong>${course.name}</strong>
                            ${isReg ? '<span class="badge bg-success ms-2">✓ Registered</span>' : ''}
                            ${isPend ? '<span class="badge bg-warning ms-2">Pending</span>' : ''}
                            ${meta ? `<br><small class="text-muted">${meta}</small>` : ''}
                        </div>
                        <span class="text-muted fw-bold">$${price}</span>
                    </div>
                </label>
            </div>`;
        });
        return html;
    }

    selectAllChoreos() {
        document.querySelectorAll('.choreo-check:not(:disabled)').forEach(cb => { cb.checked = true; });
        this.updateChoreoPricing();
    }

    updateChoreoPricing() {
        const checked = document.querySelectorAll('.choreo-check:checked:not(:disabled)');
        const count = checked.length;
        const st = this._choreoState || {};
        const visibleCount = (st.visibleCourses || []).length;
        const trackPkgPrice = st.trackPkgPrice || 0;

        // Summary items
        const summaryEl = document.getElementById('summaryItems');
        const dealEl = document.getElementById('summaryPackageDeal');
        const dealTextEl = document.getElementById('summaryDealText');
        const totalEl = document.getElementById('summaryTotal');
        const checkoutBtn = document.getElementById('choreoCheckoutBtn');

        if (count === 0) {
            summaryEl.innerHTML = '<p class="text-muted small">No choreographies selected yet</p>';
            dealEl.style.display = 'none';
            totalEl.textContent = '$0';
            checkoutBtn.disabled = true;
            return;
        }

        checkoutBtn.disabled = false;

        // Build summary list
        let indivTotal = 0;
        let itemsHtml = '';
        checked.forEach(cb => {
            const p = parseFloat(cb.dataset.price) || 0;
            indivTotal += p;
            itemsHtml += `<div class="d-flex justify-content-between small mb-1">
                <span>✓ ${cb.dataset.name}</span><span>$${p}</span>
            </div>`;
        });
        summaryEl.innerHTML = itemsHtml;

        // Check package deal
        const allSelected = count >= visibleCount && visibleCount > 0;
        let finalPrice;
        if (allSelected && trackPkgPrice > 0 && trackPkgPrice < indivTotal) {
            finalPrice = trackPkgPrice;
            const savings = indivTotal - trackPkgPrice;
            dealEl.style.display = 'block';
            dealTextEl.textContent = `Package deal applied! Save $${savings}!`;
        } else {
            finalPrice = indivTotal;
            dealEl.style.display = 'none';
        }

        totalEl.textContent = `$${finalPrice}`;
    }

    async submitChoreographySelection() {
        const checkboxes = document.querySelectorAll('.choreo-check:checked:not(:disabled)');
        if (checkboxes.length === 0) {
            this.showError('Please select at least one choreography');
            return;
        }

        const selectedIds = Array.from(checkboxes).map(cb => parseInt(cb.value));
        const selectedNames = Array.from(checkboxes).map(cb => cb.dataset.name);

        // Calculate price using new state
        let individualTotal = 0;
        checkboxes.forEach(cb => {
            individualTotal += parseFloat(cb.dataset.price) || 0;
        });

        const st = this._choreoState || {};
        const visibleCount = (st.visibleCourses || []).length;
        const trackPkgPrice = st.trackPkgPrice || 0;
        const allSelected = checkboxes.length >= visibleCount && visibleCount > 0;
        const isPackageDeal = allSelected && trackPkgPrice > 0 && trackPkgPrice < individualTotal;
        const finalPrice = isPackageDeal ? trackPkgPrice : individualTotal;

        this.showLoading();

        try {
            // Register for selected courses
            const response = await fetch('/api/register-series-package', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: this.currentEmail,
                    student_id: this.currentStudent.id,
                    series_id: st.pkg ? st.pkg.id : null,
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
                    package_name: isPackageDeal ? (st.pkg?.name || 'Choreography Package') : 'Selected Choreographies',
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

    // ===== COMPETITION METHODS =====

    checkCompetitionSection() {
        const section = document.getElementById('competitionSection');
        if (!section) return;
        if (this.settings.competition_registration_open === 'true') {
            section.style.display = 'block';
            // Pre-fill emails from current student
            const soloEmail = document.getElementById('compSoloEmail');
            const duoEmail = document.getElementById('compDuoEmail');
            if (soloEmail) soloEmail.value = this.currentEmail || '';
            if (duoEmail) duoEmail.value = this.currentEmail || '';
            // Setup form listeners (only once)
            if (!this._compListenersSet) {
                this._compListenersSet = true;
                document.getElementById('compSoloRegForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.submitCompRegistration('solo');
                });
                document.getElementById('compDuoTrioRegForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.submitCompRegistration('duo_trio');
                });
            }
        } else {
            section.style.display = 'none';
        }
    }

    selectCompCategory(cat) {
        this.compCategory = cat;
        document.querySelectorAll('.comp-cat-card-v2').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('.comp-cat-card').forEach(c => c.classList.remove('border-danger', 'bg-light'));
        const selected = document.querySelector(`[data-comp-cat="${cat}"]`);
        if (selected) { selected.classList.add('selected', 'border-danger', 'bg-light'); }

        document.getElementById('compSoloForm').style.display = 'none';
        document.getElementById('compDuoTrioForm').style.display = 'none';
        document.getElementById('compPaymentSection').style.display = 'none';

        if (cat === 'solo') {
            document.getElementById('compSoloForm').style.display = 'block';
            document.getElementById('compSoloEmail').value = this.currentEmail || '';
        } else {
            document.getElementById('compDuoTrioForm').style.display = 'block';
            document.getElementById('compDuoEmail').value = this.currentEmail || '';
            // Reset member count
            this.compMemberCount = 0;
            document.querySelectorAll('.comp-member-btn').forEach(b => b.classList.remove('btn-primary'));
            document.querySelectorAll('.comp-member-btn').forEach(b => b.classList.add('btn-outline-primary'));
            document.getElementById('compDuoTrioRegForm').style.display = 'none';
        }
        setTimeout(() => {
            const el = cat === 'solo' ? document.getElementById('compSoloForm') : document.getElementById('compDuoTrioForm');
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    compBackToCategory() {
        document.getElementById('compSoloForm').style.display = 'none';
        document.getElementById('compDuoTrioForm').style.display = 'none';
        document.getElementById('compPaymentSection').style.display = 'none';
        document.getElementById('compCategoryStep').style.display = '';
        this.compCategory = null;
        document.querySelectorAll('.comp-cat-card').forEach(c => c.classList.remove('border-danger', 'bg-light'));
    }

    setCompMemberCount(count) {
        this.compMemberCount = count;
        document.querySelectorAll('.comp-member-btn').forEach(b => {
            b.classList.remove('btn-primary');
            b.classList.add('btn-outline-primary');
        });
        const sel = document.querySelector(`.comp-member-btn[data-count="${count}"]`);
        if (sel) { sel.classList.remove('btn-outline-primary'); sel.classList.add('btn-primary'); }

        // Generate member name fields
        const container = document.getElementById('compMemberNameFields');
        container.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            container.innerHTML += `
                <div class="mb-3">
                    <label class="form-label">Member ${i} Name *</label>
                    <input type="text" class="form-control" name="member_${i}" required placeholder="Member ${i} full name">
                </div>
            `;
        }
        document.getElementById('compDuoTrioRegForm').style.display = 'block';
    }

    async submitCompRegistration(category) {
        const form = category === 'solo' ? document.getElementById('compSoloRegForm') : document.getElementById('compDuoTrioRegForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            let body = { category };
            if (category === 'solo') {
                body.dancer_name = form.dancer_name.value.trim();
                body.email = form.email.value.trim();
                body.instagram_id = form.instagram_id.value.trim();
                body.contact_number = form.contact_number.value.trim();
                body.total_amount = 30;
                body.member_count = 1;
            } else {
                const names = [];
                for (let i = 1; i <= this.compMemberCount; i++) {
                    names.push(form[`member_${i}`].value.trim());
                }
                body.team_name = form.team_name.value.trim();
                body.member_names = names.join(', ');
                body.member_count = this.compMemberCount;
                body.poc_email = form.poc_email.value.trim();
                body.poc_contact = form.poc_contact.value.trim();
                body.total_amount = this.compMemberCount * 30;
            }

            const res = await fetch('/api/competition/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');

            this.compRegistrationId = data.registrationId;
            this.compAmount = data.total_amount;

            // Hide forms, show payment
            document.getElementById('compSoloForm').style.display = 'none';
            document.getElementById('compDuoTrioForm').style.display = 'none';
            document.getElementById('compCategoryStep').style.display = 'none';
            document.getElementById('compPayAmount').textContent = `$${this.compAmount}`;
            document.getElementById('compPayRegId').textContent = `#${this.compRegistrationId}`;
            document.getElementById('compPaymentSection').style.display = 'block';
            document.getElementById('compPaymentSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            this.showError(err.message || 'Competition registration failed. Please try again.');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Register & Continue to Payment →';
        }
    }

    async selectCompPayment(method) {
        document.querySelectorAll('.comp-pay-option').forEach(o => o.classList.remove('border-primary', 'border-success'));
        document.getElementById('compVenmoDetails').style.display = 'none';
        document.getElementById('compZelleDetails').style.display = 'none';

        if (method === 'venmo') {
            document.querySelector('.comp-pay-option[data-method="venmo"]').classList.add('border-primary');
            try {
                const res = await fetch('/api/competition/generate-venmo-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registrationId: this.compRegistrationId, amount: this.compAmount })
                });
                const data = await res.json();
                document.getElementById('compVenmoUser').textContent = `@${data.venmoUsername}`;
                document.getElementById('compVenmoNote').textContent = data.paymentNote;
                document.getElementById('compVenmoLink').href = data.venmoLink;
                document.getElementById('compVenmoWebLink').href = data.webLink;
                document.getElementById('compVenmoDetails').style.display = 'block';
            } catch (e) { this.showError('Failed to generate Venmo link'); }
        } else {
            document.querySelector('.comp-pay-option[data-method="zelle"]').classList.add('border-success');
            try {
                const res = await fetch('/api/competition/generate-zelle-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registrationId: this.compRegistrationId, amount: this.compAmount })
                });
                const data = await res.json();
                document.getElementById('compZelleRecipient').textContent = data.zelleRecipientName;
                document.getElementById('compZellePhone').textContent = data.zellePhone;
                document.getElementById('compZelleAmount').textContent = `$${data.amount}`;
                document.getElementById('compZelleNote').textContent = data.paymentNote;
                document.getElementById('compZelleDetails').style.display = 'block';
            } catch (e) { this.showError('Failed to generate Zelle details'); }
        }

        // Show the confirm payment button
        const confirmBtn = document.getElementById('compConfirmPaymentBtn');
        if (confirmBtn) confirmBtn.style.display = 'block';
    }

    async confirmCompPaymentCompleted() {
        const btnContainer = document.getElementById('compConfirmPaymentBtn');
        const btn = btnContainer ? btnContainer.querySelector('button') : null;
        if (btn) { btn.disabled = true; btn.textContent = 'Confirming...'; }
        try {
            const res = await fetch('/api/competition/confirm-payment-submitted', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registrationId: this.compRegistrationId })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to confirm');

            // Hide payment options, show success
            if (btnContainer) btnContainer.style.display = 'none';
            document.getElementById('compVenmoDetails').style.display = 'none';
            document.getElementById('compZelleDetails').style.display = 'none';
            document.querySelectorAll('.comp-pay-option').forEach(o => o.style.display = 'none');

            const successMsg = document.getElementById('compSuccessMessage');
            const successRegId = document.getElementById('compSuccessRegId');
            if (successRegId) successRegId.textContent = `#${this.compRegistrationId}`;
            if (successMsg) successMsg.style.display = 'block';
        } catch (err) {
            this.showError(err.message || 'Failed to confirm payment');
            if (btn) { btn.disabled = false; btn.textContent = '✅ I\'ve Completed Payment'; }
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new EmailProfileRegistrationApp();
});
