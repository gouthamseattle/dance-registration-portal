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
        this.selectedCourse = null;
        this.registrationData = {};
        this.settings = {};
        // Class chosen on the home page (?course=ID): skip the class list and go straight to it.
        this.preselectCourseId = new URLSearchParams(window.location.search).get('course');
        // Combo chosen on the home page (?combo=ID): after sign-in, go straight to its checkout.
        this.preselectComboId = new URLSearchParams(window.location.search).get('combo');
        // From a waitlist "spot available" email: a spot is held for this student
        this.waitlistToken = new URLSearchParams(window.location.search).get('waitlist');
        // Crew link (/crew, shared in the crew WhatsApp group): list only crew-only classes
        this.crewMode = new URLSearchParams(window.location.search).get('crew') === '1';
        if (this.crewMode) {
            const t = document.getElementById('emailStepTitle');
            if (t) t.textContent = 'Crew sign in';
        }
        
        this.init();
    }

    // Phones keep a frozen copy of this page when the student goes to checkout. Coming Back shows
    // that copy, "Loading…" overlay included, without running anything: take the overlay off.
    watchBackNavigation() {
        window.addEventListener('pageshow', (e) => { if (e.persisted) this.hideLoading(); });
    }

    async init() {
        this.watchBackNavigation();
        try {
            await this.loadSettings();
            await this.showSelectedClassSummary();
            this.setupEventListeners();
            this.hideLoading();
            this.showEmailEntry();
            // Already signed in on this device (My classes, or an earlier checkout):
            // carry on without asking for the email again. "Use a different email" switches.
            const saved = this.savedEmail();
            if (saved) {
                document.getElementById('email').value = saved;
                // Remembered on this phone: carry on to the classes (also after pressing Back)
                this.handleEmailEntry();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to load registration portal. Please refresh the page.');
            this.hideLoading();
        }
    }

    // Arrived from a Register button on the home page (?course=ID):
    // show the chosen class above the email box ("Almost there").
    async showSelectedClassSummary() {
        if (this.preselectComboId) return this.showSelectedComboSummary();
        if (!this.preselectCourseId) return;
        try {
            const list = await fetch('/api/courses?active_only=true&include_crew=true').then(r => r.json());
            const course = (Array.isArray(list) ? list : []).find(c => String(c.id) === String(this.preselectCourseId));
            if (!course) return;
            const C = window.ClassInfo;
            const esc = C.esc;
            const kind = C.kicker(course);
            const when = [C.formatDates(C.dates(course)), C.timeRange(course)].filter(Boolean).join(' · ');
            const price = C.fees(course).headline;
            const box = document.getElementById('selectedClassSummary');
            box.innerHTML = `
                <div>
                    <span class="kind">${esc(kind)}</span>
                    <span class="name">${esc(course.name)}</span>
                    <span class="when">${esc(when)}</span>
                </div>
                ${price ? `<span class="amount">$${Number(price).toFixed(0)}</span>` : ''}`;
            box.hidden = false;
            document.getElementById('emailStepTitle').textContent = this.waitlistToken ? 'A spot is waiting for you' : 'Almost there';
            document.getElementById('emailStepSub').textContent = this.waitlistToken
                ? 'We\'re holding a spot for you from the waitlist. Enter the email you joined the waitlist with to claim it.'
                : "Enter your email. If you've danced with us before, we'll take you straight to payment.";
        } catch (e) {
            console.warn('Could not load the selected class', e);
        }
    }

    async showSelectedComboSummary() {
        try {
            const combo = await fetch(`/api/combos/${encodeURIComponent(this.preselectComboId)}`).then(r => (r.ok ? r.json() : null));
            if (!combo) { this.preselectComboId = null; return; }
            this.selectedCombo = combo;
            const C = window.ClassInfo;
            const box = document.getElementById('selectedClassSummary');
            box.innerHTML = `
                <div>
                    <span class="kind">${C.esc(C.comboKicker(combo.classes))}</span>
                    <span class="name">${C.esc(combo.name)}</span>
                    <span class="when">${C.esc(combo.classes.map(c => c.name).join(' + '))}</span>
                </div>
                <span class="amount">$${Number(combo.price).toFixed(0)}</span>`;
            box.hidden = false;
            document.getElementById('emailStepTitle').textContent = 'Almost there';
            document.getElementById('emailStepSub').textContent = "Enter your email. If you've danced with us before, we'll take you straight to payment.";
        } catch (e) {
            console.warn('Could not load the selected combo', e);
        }
    }

    // Hand off to checkout with the combo; checkout registers every class in it.
    goToComboCheckout() {
        const params = new URLSearchParams({
            email: this.currentEmail,
            student_id: this.currentStudent.id,
            combo_id: this.preselectComboId,
            student_type: this.currentStudent.student_type || '',
            first_name: this.currentStudent.first_name || '',
            last_name: this.currentStudent.last_name || '',
            instagram_handle: this.currentStudent.instagram_handle || '',
            dance_experience: this.currentStudent.dance_experience || '',
            profile_complete: true
        });
        this.showLoading();
        window.location.href = `/index-registration.html?${params.toString()}`;
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            this.settings = await response.json();
            
            // Check if registration is open
            if (this.settings.registration_open !== 'true' && !window.ClassInfo.isTesterDevice() && !this.waitlistToken) {
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

    savedEmail() {
        try { return localStorage.getItem('goumo_email') || ''; } catch (e) { return ''; }
    }

    showEmailEntry() {
        this.currentStep = 'email-entry';
        this.hideAllSections();
        document.getElementById('emailEntrySection').style.display = 'block';
        
        // Clear previous data (a manual "use a different email" also forgets the saved one)
        if (this.currentEmail) { try { localStorage.removeItem('goumo_email'); } catch (e) { /* private mode */ } }
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
                try { localStorage.setItem('goumo_email', this.currentEmail || ''); } catch (e) { /* private mode */ }
                this.eligibleCourses = Array.isArray(result.eligible_courses) ? result.eligible_courses : [];

                // If server indicates profile completion is required (e.g., newly classified crew without full profile),
                // force the profile creation flow on next login.
                if (result.requires_profile_completion) {
                    this.showProfileCreation();
                    return;
                }

                if (this.preselectCourseId || this.preselectComboId) {
                    this.showAvailableCourses();
                } else {
                    this.showWelcomeBack();
                }
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
        if (this.preselectComboId && this.currentStudent) {
            this.goToComboCheckout();
            return;
        }
        this.currentStep = 'course-selection';
        this.hideAllSections();
        document.getElementById('courseSelection').style.display = 'block';

        // Update filter info
        const studentType = this.currentStudent?.student_type || 'general';
        // Crew link: crew members see every class they can take (crew practices listed first)
        if (this.crewMode) {
            const sel = document.getElementById('courseSelection');
            const crewSec = document.getElementById('crewPracticeSection');
            const firstHeader = sel && sel.querySelector('.section-header');
            if (sel && crewSec && firstHeader && crewSec.compareDocumentPosition(firstHeader) & Node.DOCUMENT_POSITION_FOLLOWING) {
                firstHeader.parentNode.insertBefore(crewSec, firstHeader);
            }
        }
        const courseCount = this.eligibleCourses.length;
        let filterText = '';
        
        if (this.crewMode) {
            filterText = studentType === 'crew_member'
                ? `Showing ${courseCount} classes: crew practices and all GouMo classes`
                : 'Crew practices are for crew members. Ask GouMo if you think you should have access.';
        } else if (studentType === 'crew_member') {
            filterText = `Showing ${courseCount} classes available to crew members`;
        } else {
            filterText = `Showing ${courseCount} classes open to all students`;
        }
        
        document.getElementById('courseFilterInfo').textContent = filterText;

        // Categorize and render courses
        this.renderCategorizedCourses();

        if (this.preselectCourseId) {
            const id = this.preselectCourseId;
            this.preselectCourseId = null;
            const chosen = this.eligibleCourses.find(c => String(c.id) === String(id));
            // Already registered for this class: don't reopen checkout, show where to see it
            if (chosen && (chosen.registration_status === 'registered_pending' || chosen.registration_status === 'registered_completed')) {
                this.showAlreadyRegistered(chosen);
                return;
            }
            if (chosen) {
                this.selectCourse(id);
                return;
            }
            this.showError('That class is for crew members only. Here are the classes open to you.');
        }

        this.scrollToTop();
    }


    showAlreadyRegistered(course) {
        const paid = course.registration_status === 'registered_completed';
        const esc = window.ClassInfo.esc;
        const box = document.getElementById('courseFilterInfo');
        box.innerHTML = `<span class="d-block mt-2 p-3 rounded" style="border:1px solid var(--accent);color:var(--text)">
            You're already registered for <strong>${esc(course.name)}</strong>${paid ? ' and your payment is confirmed.' : '. We\'re checking your payment.'}
            <a class="d-inline-block ms-1" href="/my">See my classes</a></span>`;
        this.scrollToTop();
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

        this.eligibleCourses.forEach(course => {
            if (course.course_type === 'crew_practice') {
                crewPracticeCourses.push(course);
            } else if (course.course_type === 'drop_in') {
                dropInCourses.push(course);
            } else {
                multiWeekCourses.push(course);
            }
        });

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
                const courseCard = this.createCourseCard(course);
                dropInContainer.appendChild(courseCard);
            });
        } else {
            dropInSection.style.display = 'none';
        }

        // Show no courses message if no courses available
        if (this.eligibleCourses.length === 0) {
            noCoursesMessage.style.display = 'block';
        } else {
            noCoursesMessage.style.display = 'none';
        }
    }


    // Instructor photos: names in the class's Instructor field → /images/<name>.jpg
    instructorPics(instructor) {
        return window.ClassInfo.instructorPics(instructor);
    }

    // One card for every class type (series, crew practice, drop-in)
    createCourseCard(course) {
        const C = window.ClassInfo;
        const esc = C.esc;
        const col = document.createElement('div');
        col.className = 'col-12 col-lg-6 mb-3';

        const status = course.registration_status || 'not_registered';
        const isRegistered = status === 'registered_completed';
        const isPending = status === 'registered_pending';
        const spots = parseInt(course.available_spots);
        const isFull = Number.isFinite(spots) && spots <= 0;
        const tester = !!(this.currentStudent && (this.currentStudent.is_tester === true || this.currentStudent.is_tester === 1 || this.currentStudent.is_tester === 't'));
        const isClosed = !tester && !C.isOpen(course);
        const f = C.fees(course);

        const ds = C.dates(course);
        let datesText = ds.length ? C.formatDates(ds) : '';
        if (!datesText && course.start_date) datesText = formatLocalDate(course.start_date);
        const spotsText = isFull ? 'Full · waitlist' : (Number.isFinite(spots) && spots <= 10 ? `${spots} left` : 'Open');
        const cells = [['Dates', datesText], ['Time', C.timeRange(course)], ['Location', C.location(course)], ['Spots', (isRegistered || isPending) ? '' : spotsText]]
            .filter(([, v]) => v);

        const crewOnly = course.required_student_type === 'crew_member' || course.course_type === 'crew_practice'
            ? ' <span class="cc-crew">Crew only</span>' : '';
        const pics = this.instructorPics(course.instructor);

        let action;
        if (isRegistered) action = '<div class="cc-state cc-done"><i class="fas fa-check-circle"></i> You\'re registered · Confirmed</div>';
        else if (isPending) action = '<div class="cc-state cc-pending"><i class="fas fa-clock"></i> Registered · checking payment</div>';
        else if (isClosed) action = '<div class="cc-state cc-closed">Registration closed</div>';
        else if (isFull && !tester) action = `<button type="button" class="cc-btn cc-btn-outline" onclick="app.selectCourse(${Number(course.id)})">Join waitlist</button>`;
        else action = `<button type="button" class="cc-btn" onclick="app.selectCourse(${Number(course.id)})">Register</button>`;

        col.innerHTML = `
            <article class="class-card-v2 fade-in${isRegistered ? ' is-done' : ''}">
                <div class="cc-top">
                    <div class="cc-head">
                        <span class="cc-kicker">${esc(C.kicker(course))}${crewOnly}</span>
                        <h3 class="cc-name">${esc(course.name)}</h3>
                        ${course.instructor ? `<span class="cc-who">${pics ? `<span class="cc-pics">${pics}</span>` : ''}<span>with ${esc(course.instructor)}</span></span>` : ''}
                    </div>
                    ${f.headline ? `<div class="cc-price"><span>$${Number(f.headline).toFixed(0)}</span>${f.unit ? `<small>${esc(f.unit)}</small>` : ''}</div>` : ''}
                </div>
                ${cells.length ? `<dl class="cc-grid">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
                ${action}
            </article>`;
        return col;
    }

    async selectCourse(courseId) {
        const course = this.eligibleCourses.find(c => Number(c.id) === Number(courseId));
        
        if (!course) {
            this.showError('Course not found');
            return;
        }

        const tester = !!(this.currentStudent && (this.currentStudent.is_tester === true || this.currentStudent.is_tester === 1 || this.currentStudent.is_tester === 't'));
        const held = !!this.waitlistToken; // a spot is held for them, so full/closed don't apply
        if (!tester && !held && !window.ClassInfo.isOpen(course)) {
            this.showError(`Registration for ${course.name} is closed right now.`);
            return;
        }

        this.selectedCourse = course;
        const availableSpots = parseInt(course.available_spots) || 0;
        
        console.log('Course selected:', course.name, 'Available spots:', availableSpots);

        // Check if course is full and needs waitlist registration
        if (!tester && !held && availableSpots <= 0) {
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
        if (this.waitlistToken) registrationData.waitlist_token = this.waitlistToken;

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
