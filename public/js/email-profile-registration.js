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

    showAvailableCourses() {
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

        // Categorize and render courses
        this.renderCategorizedCourses();

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
                const courseCard = this.createDropInCard(course);
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

    createCourseCard(course) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 col-xl-4 mb-4';

        const availableSpots = parseInt(course.available_spots) || 0;
        const hasFullCoursePrice = course.full_course_price && course.full_course_price > 0;
        const hasPerClassPrice = course.per_class_price && course.per_class_price > 0;

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

        // Add course type badge and DDC background for crew practice
        let typeBadge = '';
        let ddcBackground = '';
        if (course.course_type === 'crew_practice') {
            typeBadge = '<span class="badge bg-warning mb-2">Crew Members Only</span>';
            ddcBackground = '<div class="ddc-card-header-background"></div>';
        }

        col.innerHTML = `
            <div class="card course-card fade-in">
                <div class="card-header">
                    ${ddcBackground}
                    ${typeBadge}
                    <h5 class="card-title">${course.name}</h5>
                    <p class="card-subtitle">${course.level || 'All Levels'} • ${course.duration_weeks || 0} weeks</p>
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

                    ${(hasFullCoursePrice || hasPerClassPrice) ? `
                        <div class="pricing-section">
                            ${hasFullCoursePrice ? `
                                <div class="price-option">
                                    <span>Full Course</span>
                                    <span class="price">$${course.full_course_price}</span>
                                </div>
                            ` : ''}
                            ${hasPerClassPrice ? `
                                <div class="price-option">
                                    <span>Per Class</span>
                                    <span class="price">$${course.per_class_price}</span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    <button class="btn register-btn" 
                            onclick="app.selectCourse(${course.id})"
                            ${availableSpots <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-user-plus"></i>
                        ${availableSpots > 0 ? 'Register Now' : 'Course Full'}
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
                <div class="card-body">
                    <div class="dropin-header">
                        <div>
                            <h6 class="dropin-title">${course.name}</h6>
                            <small class="text-muted">Drop-in Class<span class="goumo-text-logo">GouMo Dance Chronicles</span></small>
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
                        <div class="dropin-detail">
                            <i class="fas fa-users"></i>
                            <span>${availableSpots > 0 ? `${availableSpots} spots left` : 'FULL'}</span>
                        </div>
                    </div>

                    ${course.description ? `<p class="text-muted small mb-3">${course.description}</p>` : ''}

                    <button class="btn register-btn" 
                            onclick="app.selectCourse(${course.id})"
                            ${availableSpots <= 0 ? 'disabled' : ''}>
                        <i class="fas fa-user-plus"></i>
                        ${availableSpots > 0 ? 'Register Now' : 'Class Full'}
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
        console.log('Course selected:', course.name);

        // Store selected course and student data for main registration system
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
        // Add a small delay to show the loading state
        setTimeout(() => {
            window.location.href = `/index-registration.html?${params.toString()}`;
        }, 500);
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
