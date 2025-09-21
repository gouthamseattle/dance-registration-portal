/* Helper: format YYYY-MM-DD as local date without timezone shift */
function formatLocalDate(dateStr) {
    // Accept both 'YYYY-MM-DD' and ISO strings like 'YYYY-MM-DDTHH:mm:ssZ' without timezone shift
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
        : new Date(dateStr).toLocaleDateString();
}

// Dance Registration Portal - Frontend JavaScript
class DanceRegistrationApp {
    constructor() {
        this.currentStep = 'courses';
        this.selectedCourse = null;
        this.selectedDropIn = null;
        this.registrationData = {};
        this.selectedPaymentMethod = null;
        this.paypalClientId = null;
        this.settings = {};
        this.isSelecting = false;
        this.isSelectingDropIn = false;
        
        this.init();
    }

    async init() {
        try {
            await this.loadSettings();
            await this.loadCourses();
            this.setupEventListeners();
            this.hideLoading();
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
            
            console.log('✅ Venmo payment system ready with username:', this.settings.venmo_username);
        } catch (error) {
            console.error('Error loading settings:', error);
            throw error;
        }
    }

    async loadCourses() {
        try {
            const [coursesResponse, dropInsResponse] = await Promise.all([
                fetch('/api/courses?active_only=true'),
                fetch('/api/drop-in-classes?active_only=true&date_from=' + new Date().toISOString().split('T')[0])
            ]);

            const courses = await coursesResponse.json();
            const dropIns = await dropInsResponse.json();

            // Check if crew practice mode should be enabled
            this.checkAndApplyCrewPracticeMode(courses);

            this.renderCourses(courses);
            this.renderDropInClasses(dropIns);

            if (courses.length === 0 && dropIns.length === 0) {
                this.showNoCoursesMessage();
            }
        } catch (error) {
            console.error('Error loading courses:', error);
            this.showError('Failed to load available courses.');
        }
    }

    checkAndApplyCrewPracticeMode(courses) {
        // Check if any course is crew practice type
        const hasCrewPractice = courses.some(course => course.course_type === 'crew_practice');
        
        if (hasCrewPractice) {
            // Apply crew practice mode globally
            document.body.classList.add('crew-practice-mode', 'crew-bg-strong');
            
            // Update header with DDC branding
            const headerSection = document.querySelector('.header-section');
            const headerTitle = headerSection?.querySelector('h1');
            const headerSubtitle = headerSection?.querySelector('.lead');
            const footer = document.querySelector('.footer');
            
            if (headerTitle && headerSubtitle) {
                headerTitle.innerHTML = `
                    <span class="ddc-hero">
                        <img src="images/ddc-logo.png" alt="DDC" class="ddc-header-logo">
                        <span class="ddc-hero-text" data-text="Dreamers Dance Crew">Dreamers Dance Crew</span>
                    </span>
                `;
                headerSubtitle.textContent = 'Dancing the American Dream';
            }
            
            // Add DDC logo to footer
            if (footer && !footer.querySelector('.ddc-footer-logo')) {
                const footerLogo = document.createElement('div');
                footerLogo.className = 'ddc-footer-logo';
                footerLogo.innerHTML = '<img src="images/ddc-logo.png" alt="Dreamers Dance Crew" class="ddc-footer-img">';
                footer.appendChild(footerLogo);
            }
        } else {
            // Remove crew practice mode if no crew practice courses
            document.body.classList.remove('crew-practice-mode', 'crew-bg-strong');
        }
    }

    renderCourses(courses) {
        const container = document.getElementById('multiWeekCourses');
        if (!container) {
            console.warn('multiWeekCourses container not found, skipping course rendering');
            return;
        }
        container.innerHTML = '';

        courses.forEach(course => {
            const courseCard = this.createCourseCard(course);
            container.appendChild(courseCard);
        });
    }

    createCourseCard(course) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 col-xl-4 mb-4';

        const availableSpots = course.available_spots || 0;
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

        col.innerHTML = `
            <div class="card course-card fade-in">
                <div class="card-header">
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

    renderDropInClasses(dropIns) {
        const container = document.getElementById('dropInClasses');
        const section = document.getElementById('dropInSection');
        
        if (!container || !section) {
            console.warn('Drop-in classes containers not found, skipping rendering');
            return;
        }
        
        if (dropIns.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        container.innerHTML = '';

        dropIns.forEach(dropIn => {
            const dropInCard = this.createDropInCard(dropIn);
            container.appendChild(dropInCard);
        });
    }

    createDropInCard(dropIn) {
        const col = document.createElement('div');
        col.className = 'col-lg-6 mb-3';

        const availableSpots = dropIn.available_spots || 0;
        const classDate = new Date(dropIn.class_date).toLocaleDateString();
        const classTime = dropIn.class_time;

        // Check if crew practice mode is active for DDC logo integration
        const isCrewPracticeMode = document.body.classList.contains('crew-practice-mode');
        const ddcLogoHtml = isCrewPracticeMode ? 
            '<img src="images/ddc-logo.png" alt="DDC" class="ddc-dropin-logo">' : '';

        col.innerHTML = `
            <div class="card dropin-card fade-in">
                ${ddcLogoHtml}
                <div class="card-body">
                    <div class="dropin-header">
                        <div>
                            <h6 class="dropin-title">${dropIn.course_name}</h6>
                            <small class="text-muted">Drop-in Class</small>
                        </div>
                        <div class="dropin-price">$${dropIn.price}</div>
                    </div>
                    
                    <div class="dropin-details">
                        <div class="dropin-detail">
                            <i class="fas fa-calendar"></i>
                            <span>${classDate}</span>
                        </div>
                        <div class="dropin-detail">
                            <i class="fas fa-clock"></i>
                            <span>${classTime}</span>
                        </div>
                        ${dropIn.instructor ? `
                            <div class="dropin-detail">
                                <i class="fas fa-user"></i>
                                <span>${dropIn.instructor}</span>
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

                    ${dropIn.description ? `<p class="text-muted small mb-3">${dropIn.description}</p>` : ''}

                    <button class="btn register-btn" 
                            onclick="app.selectDropIn(${dropIn.id})"
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
        if (this.isSelecting) {
            console.info('Selection already in progress, ignoring click', { courseId });
            return;
        }
        this.isSelecting = true;
        console.info('Selecting course...', { courseId, currentStep: this.currentStep });
        try {
            const response = await fetch(`/api/courses?active_only=true`);
            const status = response.status;
            let courses = [];
            try {
                courses = await response.json();
            } catch (jsonErr) {
                console.error('Error parsing courses JSON:', jsonErr);
                courses = [];
            }

            if (!response.ok) {
                throw new Error(`Courses API error: ${status}`);
            }

            const idNum = Number(courseId);
            this.selectedCourse = (courses || []).find(c => Number(c.id) === idNum);
            this.selectedDropIn = null;

            if (!this.selectedCourse) {
                console.warn('Course not found after fetch. Available courses:', (courses || []).map(c => c.id));
                this.showError('Course not found.');
                return;
            }

            console.info('Course selected', { id: this.selectedCourse.id, name: this.selectedCourse.name });
            this.showRegistrationForm();
        } catch (error) {
            console.error('Error selecting course:', error, { currentStep: this.currentStep });
            if (this.currentStep !== 'form') {
                this.showError('Failed to select course.');
            }
        } finally {
            this.isSelecting = false;
        }
    }

    async selectDropIn(dropInId) {
        if (this.isSelectingDropIn) {
            console.info('Drop-in selection already in progress, ignoring click', { dropInId });
            return;
        }
        this.isSelectingDropIn = true;
        console.info('Selecting drop-in...', { dropInId, currentStep: this.currentStep });
        try {
            const response = await fetch(`/api/drop-in-classes?active_only=true`);
            const status = response.status;
            let dropIns = [];
            try {
                dropIns = await response.json();
            } catch (jsonErr) {
                console.error('Error parsing drop-in JSON:', jsonErr);
                dropIns = [];
            }

            if (!response.ok) {
                throw new Error(`Drop-in API error: ${status}`);
            }

            const idNum = Number(dropInId);
            this.selectedDropIn = (dropIns || []).find(d => Number(d.id) === idNum);
            this.selectedCourse = null;

            if (!this.selectedDropIn) {
                console.warn('Drop-in class not found after fetch. Available:', (dropIns || []).map(d => d.id));
                this.showError('Drop-in class not found.');
                return;
            }

            console.info('Drop-in selected', { id: this.selectedDropIn.id, name: this.selectedDropIn.course_name });
            this.showRegistrationForm();
        } catch (error) {
            console.error('Error selecting drop-in class:', error, { currentStep: this.currentStep });
            if (this.currentStep !== 'form') {
                this.showError('Failed to select drop-in class.');
            }
        } finally {
            this.isSelectingDropIn = false;
        }
    }

    showPaymentMethodSelection() {
        this.currentStep = 'payment-method-selection';
        
        // Hide course list and show payment method selection
        document.getElementById('multiWeekCourses').style.display = 'none';
        document.getElementById('dropInSection').style.display = 'none';
        document.getElementById('coursePaymentMethodSection').style.display = 'block';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';

        // Set up payment method selection handlers
        this.setupPaymentMethodSelectionHandlers();
        this.scrollToTop();
    }

    setupPaymentMethodSelectionHandlers() {
        // Remove any existing event listeners
        const paymentCards = document.querySelectorAll('.payment-selection-card');
        const backButton = document.getElementById('backToCourseSelectionBtn');

        // Add click handlers for payment method cards
        paymentCards.forEach(card => {
            const method = card.dataset.method;
            card.addEventListener('click', () => {
                this.selectPaymentMethodAndProceed(method);
            });
        });

        // Add back button handler
        if (backButton) {
            backButton.addEventListener('click', () => {
                this.showCourseSelectionFromPayment();
            });
        }
    }

    selectPaymentMethodAndProceed(method) {
        this.selectedPaymentMethod = method;
        console.info('Payment method selected:', method);
        
        // Add visual feedback
        const cards = document.querySelectorAll('.payment-selection-card');
        cards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.method === method) {
                card.classList.add('selected');
            }
        });

        // Proceed to registration form after a brief delay for visual feedback
        setTimeout(() => {
            this.showRegistrationForm();
        }, 300);
    }

    showCourseSelectionFromPayment() {
        // Reset selections and go back to course selection
        this.selectedCourse = null;
        this.selectedDropIn = null;
        this.selectedPaymentMethod = null;
        
        document.getElementById('multiWeekCourses').style.display = 'block';
        document.getElementById('dropInSection').style.display = 'block';
        document.getElementById('coursePaymentMethodSection').style.display = 'none';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';
        
        this.currentStep = 'courses';
        this.scrollToTop();
    }

    showRegistrationForm() {
        this.currentStep = 'form';
        // Switch views first; any errors in setup should not block navigation
        const courseSelection = document.getElementById('courseSelection');
        const registrationForm = document.getElementById('registrationForm');
        const paymentSection = document.getElementById('paymentSection');
        const confirmationSection = document.getElementById('confirmationSection');

        // Defensive programming: check if elements exist before manipulating them
        if (courseSelection) courseSelection.style.display = 'none';
        if (registrationForm) registrationForm.style.display = 'block';
        if (paymentSection) paymentSection.style.display = 'none';
        if (confirmationSection) confirmationSection.style.display = 'none';

        try {
            this.populateSelectedCourseInfo();
            this.setupPaymentOptions();
            this.setupDanceExperienceField();
            this.setupInstagramIdField();
            this.setupPaymentMethodSelection();
            this.setupCrewPracticeBranding();
        } catch (e) {
            // Never let setup errors surface as "Failed to select course"
            console.error('Error preparing registration form UI:', e);
            // Soft-fail: continue with whatever rendered; no disruptive toast
        }

        this.scrollToTop();
    }

    populateSelectedCourseInfo() {
        const infoContainer = document.getElementById('selectedCourseInfo');
        
        if (this.selectedCourse) {
            // Build schedule information from slots
            let scheduleHtml = '';
            if (this.selectedCourse.slots && this.selectedCourse.slots.length > 0) {
                const scheduleItems = this.selectedCourse.slots.map(slot => {
                    const parts = [];
                    
                    // Add day of week if available
                    if (this.selectedCourse.course_type === 'crew_practice') {
                        if (slot.practice_date) {
                            const dateStr = formatLocalDate(slot.practice_date);
                            parts.push(dateStr);
                        }
                    } else if (slot.day_of_week) {
                        parts.push(`${slot.day_of_week}s`);
                    }
                    
                    // Add time range if available (fallback to course-level times)
                    const start = slot.start_time || this.selectedCourse.start_time;
                    const end = slot.end_time || this.selectedCourse.end_time;
                    if (start && end) {
                        parts.push(`${start} - ${end}`);
                    } else if (start) {
                        parts.push(start);
                    }
                    
                    // Add location if available
                    if (slot.location) {
                        parts.push(`at ${slot.location}`);
                    }
                    
                    // Join all parts
                    let scheduleText = parts.join(' ');
                    
                    // Add difficulty level if multiple slots
                    if (this.selectedCourse.slots.length > 1 && slot.difficulty_level) {
                        scheduleText += ` (${slot.difficulty_level})`;
                    }
                    
                    return scheduleText;
                }).filter(text => text); // Remove empty strings
                
                // Add course dates if available
                let dateInfo = '';
                    if (this.selectedCourse.course_type !== 'crew_practice') {
                        if (this.selectedCourse.start_date && this.selectedCourse.end_date) {
                            const startDate = formatLocalDate(this.selectedCourse.start_date);
                            const endDate = formatLocalDate(this.selectedCourse.end_date);
                            dateInfo = `<div class="mt-1"><strong>Dates:</strong> ${startDate} - ${endDate}</div>`;
                        } else if (this.selectedCourse.start_date) {
                            const startDate = formatLocalDate(this.selectedCourse.start_date);
                            dateInfo = `<div class="mt-1"><strong>Start Date:</strong> ${startDate}</div>`;
                        }
                    }
                
                if (scheduleItems.length > 0) {
                    scheduleHtml = `<div class="mt-2"><strong>Schedule:</strong> ${scheduleItems.join('<br>')}</div>${dateInfo}`;
                }
            }
            
            // If no slot-based schedule was built, check if we should use schedule_info
            // But prioritize slot data over schedule_info
            if (!scheduleHtml) {
                // Force display of available data for debugging
                if (this.selectedCourse.slots && this.selectedCourse.slots.length > 0) {
                    // We have slots but no schedule was built - show what we can
                    const slot = this.selectedCourse.slots[0];
                    const debugParts = [];
                    
                    if (slot.day_of_week) debugParts.push(`${slot.day_of_week}s`);
                    const dbgStart = slot.start_time || this.selectedCourse.start_time;
                    const dbgEnd = slot.end_time || this.selectedCourse.end_time;
                    if (dbgStart && dbgEnd) {
                        debugParts.push(`${dbgStart} - ${dbgEnd}`);
                    } else if (dbgStart) {
                        debugParts.push(dbgStart);
                    }
                    if (slot.location) debugParts.push(`at ${slot.location}`);
                    
                    if (debugParts.length > 0) {
                        scheduleHtml = `<div class="mt-2"><strong>Schedule:</strong> ${debugParts.join(' ')}</div>`;
                    }
                }
                
                // Only use schedule_info as absolute fallback
                if (!scheduleHtml && this.selectedCourse.schedule_info) {
                    scheduleHtml = `<div class="mt-2"><strong>Schedule:</strong> ${this.selectedCourse.schedule_info}</div>`;
                }
            }
            
            infoContainer.innerHTML = `
                <h5><i class="fas fa-graduation-cap text-primary"></i> ${this.selectedCourse.name}</h5>
                <div class="row">
                    <div class="col-sm-12">
                        <strong>Level:</strong> ${this.selectedCourse.level || 'All Levels'}
                    </div>
                </div>
                ${scheduleHtml}
            `;
        } else if (this.selectedDropIn) {
            const classDate = new Date(this.selectedDropIn.class_date).toLocaleDateString();
            infoContainer.innerHTML = `
                <h5><i class="fas fa-clock text-primary"></i> ${this.selectedDropIn.course_name} - Drop-in Class</h5>
                <div class="row">
                    <div class="col-sm-6">
                        <strong>Date:</strong> ${classDate}<br>
                        <strong>Time:</strong> ${this.selectedDropIn.class_time}
                    </div>
                    <div class="col-sm-6">
                        <strong>Price:</strong> $${this.selectedDropIn.price}
                    </div>
                </div>
                ${this.selectedDropIn.instructor ? `<div class="mt-2"><strong>Instructor:</strong> ${this.selectedDropIn.instructor}</div>` : ''}
            `;
        }
    }

    setupPaymentOptions() {
        const paymentOptionsDiv = document.getElementById('paymentOptions');
        const totalAmountSpan = document.getElementById('totalAmount');

        if (this.selectedCourse) {
            const hasFullCourse = this.selectedCourse.full_course_price && this.selectedCourse.full_course_price > 0;
            const hasPerClass = this.selectedCourse.per_class_price && this.selectedCourse.per_class_price > 0;

            if (hasFullCourse && hasPerClass) {
                paymentOptionsDiv.style.display = 'block';
                document.getElementById('fullCoursePrice').textContent = `$${this.selectedCourse.full_course_price}`;
                document.getElementById('perClassPrice').textContent = `$${this.selectedCourse.per_class_price}`;
                
                // Set default selection
                document.getElementById('fullCourse').checked = true;
                totalAmountSpan.textContent = `$${this.selectedCourse.full_course_price}`;
            } else if (hasFullCourse) {
                paymentOptionsDiv.style.display = 'none';
                totalAmountSpan.textContent = `$${this.selectedCourse.full_course_price}`;
            } else if (hasPerClass) {
                paymentOptionsDiv.style.display = 'none';
                totalAmountSpan.textContent = `$${this.selectedCourse.per_class_price}`;
            }
        } else if (this.selectedDropIn) {
            paymentOptionsDiv.style.display = 'none';
            totalAmountSpan.textContent = `$${this.selectedDropIn.price}`;
        }

        // Add event listeners for payment option changes
        const paymentRadios = document.querySelectorAll('input[name="payment_option"]');
        paymentRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateTotalAmount();
            });
        });
    }

    updateTotalAmount() {
        const totalAmountSpan = document.getElementById('totalAmount');
        const selectedOption = document.querySelector('input[name="payment_option"]:checked');

        if (this.selectedCourse && selectedOption) {
            if (selectedOption.value === 'full-course') {
                totalAmountSpan.textContent = `$${this.selectedCourse.full_course_price}`;
            } else if (selectedOption.value === 'per-class') {
                totalAmountSpan.textContent = `$${this.selectedCourse.per_class_price}`;
            }
        }
    }

    setupDanceExperienceField() {
        const danceExperienceElement = document.getElementById('dance_experience');
        
        if (!danceExperienceElement) {
            console.warn('Dance experience field not found, skipping setup');
            return;
        }
        
        const danceExperienceField = danceExperienceElement.closest('.col-12');
        
        if (!danceExperienceField) {
            console.warn('Dance experience field container not found, skipping setup');
            return;
        }
        
        // Check if selected course is Crew Practice
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            // Hide dance experience field for Crew Practice
            danceExperienceField.style.display = 'none';
            // Remove required attribute
            danceExperienceElement.removeAttribute('required');
        } else {
            // Show dance experience field for other course types
            danceExperienceField.style.display = 'block';
            // Add required attribute
            danceExperienceElement.setAttribute('required', 'required');
        }
    }

    setupInstagramIdField() {
        // Be resilient to prior toggles by selecting either label/field id
        const instagramLabel = document.querySelector('label[for="instagram_id"], label[for="student_name"]');
        let instagramInput = document.getElementById('instagram_id') || document.getElementById('student_name');
        if (!instagramLabel || !instagramInput) {
            console.warn('Instagram/Name field elements not found; skipping field toggle.');
            return;
        }
        const inputGroup = instagramInput.closest('.input-group');
        const inputGroupText = inputGroup ? inputGroup.querySelector('.input-group-text') : null;
        
        // Check if selected course is Crew Practice
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            // Change to Name field for Crew Practice
            instagramLabel.innerHTML = `
                <i class="fas fa-user text-primary"></i>
                Full Name *
            `;
            instagramLabel.setAttribute('for', 'student_name');
            instagramInput.name = 'student_name';
            instagramInput.id = 'student_name';
            instagramInput.placeholder = 'Enter your full name';
            
            // Hide the @ symbol for name field
            if (inputGroupText) inputGroupText.style.display = 'none';
            instagramInput.classList.add('form-control', 'form-control-lg');
            instagramInput.style.borderRadius = 'var(--radius-md)';
        } else {
            // Show Instagram ID field for other course types
            instagramLabel.innerHTML = `
                <i class="fab fa-instagram text-primary"></i>
                Instagram ID *
            `;
            instagramLabel.setAttribute('for', 'instagram_id');
            instagramInput.name = 'instagram_id';
            instagramInput.id = 'instagram_id';
            instagramInput.placeholder = '';
            
            // Show the @ symbol for Instagram field
            if (inputGroupText) inputGroupText.style.display = 'block';
            instagramInput.classList.add('form-control', 'form-control-lg');
            instagramInput.style.borderRadius = '';
        }
    }

    setupPaymentMethodSelection() {
        // Set up payment method selection handlers for registration form
        const paymentCards = document.querySelectorAll('.payment-method-selection');
        
        paymentCards.forEach(card => {
            card.addEventListener('click', () => {
                const method = card.dataset.method;
                this.selectPaymentMethodInForm(method);
            });
        });
    }

    selectPaymentMethodInForm(method) {
        this.selectedPaymentMethod = method;
        console.info('Payment method selected in form:', method);
        
        // Add visual feedback to show selection
        const cards = document.querySelectorAll('.payment-method-selection');
        cards.forEach(card => {
            card.classList.remove('selected');
            if (card.dataset.method === method) {
                card.classList.add('selected');
            }
        });
    }

    setupCrewPracticeBranding() {
        const headerSection = document.querySelector('.header-section');
        const headerTitle = headerSection.querySelector('h1');
        const headerSubtitle = headerSection.querySelector('.lead');
        const footer = document.querySelector('.footer');
        const registrationCard = document.querySelector('#registrationForm .card');
        
        // Check if selected course is Crew Practice
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            // Apply crew practice branding with Option B (badge + title layout)
            headerTitle.innerHTML = `
                <span class="ddc-hero">
                    <img src="images/ddc-logo.png" alt="DDC" class="ddc-header-logo">
                    <span class="ddc-hero-text" data-text="Dreamers Dance Crew">Dreamers Dance Crew</span>
                </span>
            `;
            headerSubtitle.textContent = 'Dancing the American Dream';
            
            // Add crew practice styling to body with stronger background
            document.body.classList.add('crew-practice-mode', 'crew-bg-strong');
            
            // Option 2: Add DDC logo to registration card header
            const regHeader = document.querySelector('#registrationForm .card .card-header h3');
            if (regHeader && !regHeader.querySelector('.ddc-card-header-logo')) {
                const img = document.createElement('img');
                img.src = 'images/ddc-logo.png';
                img.alt = 'DDC';
                img.className = 'ddc-card-header-logo';
                regHeader.prepend(img);
            }
            
            // Add DDC logo to footer
            if (footer && !footer.querySelector('.ddc-footer-logo')) {
                const footerLogo = document.createElement('div');
                footerLogo.className = 'ddc-footer-logo';
                footerLogo.innerHTML = '<img src="images/ddc-logo.png" alt="Dreamers Dance Crew" class="ddc-footer-img">';
                footer.appendChild(footerLogo);
            }
        } else {
            // Restore regular branding
            headerTitle.innerHTML = `
                <i class="fas fa-music text-primary"></i>
                GouMo Dance Chronicles
            `;
            headerSubtitle.textContent = 'Register for amazing dance experiences';
            
            // Remove crew practice styling
            document.body.classList.remove('crew-practice-mode', 'crew-bg-strong');
            
            // Remove DDC logos
            const cardHeaderLogo = document.querySelector('#registrationForm .card .card-header .ddc-card-header-logo');
            const footerLogo = footer?.querySelector('.ddc-footer-logo');
            if (cardHeaderLogo) cardHeaderLogo.remove();
            if (footerLogo) footerLogo.remove();
        }
    }

    setupEventListeners() {
        // Back to courses button
        const backToCourses = document.getElementById('backToCourses');
        if (backToCourses) {
            backToCourses.addEventListener('click', () => {
                this.showCourseSelection();
            });
        }

        // Registration form submission
        const studentRegistrationForm = document.getElementById('studentRegistrationForm');
        if (studentRegistrationForm) {
            studentRegistrationForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmission();
            });
        }

        // Back to form button
        const backToForm = document.getElementById('backToForm');
        if (backToForm) {
            backToForm.addEventListener('click', () => {
                this.showRegistrationForm();
            });
        }

        // Register another class button
        const registerAnother = document.getElementById('registerAnother');
        if (registerAnother) {
            registerAnother.addEventListener('click', () => {
                this.resetRegistration();
            });
        }

        // Share registration button
        const shareRegistration = document.getElementById('shareRegistration');
        if (shareRegistration) {
            shareRegistration.addEventListener('click', () => {
                this.shareRegistration();
            });
        }
    }

    async handleFormSubmission() {
        const form = document.getElementById('studentRegistrationForm');
        const formData = new FormData(form);

        // Validate payment method selection
        if (!this.selectedPaymentMethod) {
            this.showError('Please select a payment method (Venmo or Zelle) to continue.');
            // Scroll to payment method section
            const paymentMethodSection = document.querySelector('.payment-method-selection').closest('.col-12');
            if (paymentMethodSection) {
                paymentMethodSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // Use pre-filled student data from hidden fields or collect from form
        const studentId = document.getElementById('studentId')?.value;
        const preFilledEmail = document.getElementById('studentEmail')?.value;
        const preFilledFirstName = document.getElementById('studentFirstName')?.value;
        const preFilledLastName = document.getElementById('studentLastName')?.value;
        const preFilledInstagram = document.getElementById('studentInstagram')?.value;
        const preFilledExperience = document.getElementById('studentExperience')?.value;

        // Prepare registration data using pre-filled data when available
        this.registrationData = {
            email: preFilledEmail || formData.get('email'),
            first_name: preFilledFirstName || formData.get('first_name'),
            last_name: preFilledLastName || formData.get('last_name'),
            instagram_handle: preFilledInstagram || formData.get('instagram_handle') || null,
            dance_experience: preFilledExperience || formData.get('dance_experience') || null,
            student_id: studentId || null
        };

        console.log('📝 Using registration data:', {
            hasPreFilledData: !!studentId,
            email: this.registrationData.email,
            student_id: this.registrationData.student_id,
            instagram_handle: this.registrationData.instagram_handle,
            dance_experience: this.registrationData.dance_experience
        });

        // Note: Profile completion validation has been moved to email entry time
        // in the email-profile-registration.js flow to prevent payment-time blocks.
        // Users with incomplete profiles are redirected to profile completion immediately after email entry.

        // Include student_name when Crew Practice toggles the Instagram field into a name field
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            this.registrationData.student_name = formData.get('student_name') || 
                [preFilledFirstName, preFilledLastName].filter(Boolean).join(' ');
        }

        if (this.selectedCourse) {
            this.registrationData.course_id = this.selectedCourse.id;
            this.registrationData.drop_in_class_id = null;
            
            const paymentOption = formData.get('payment_option');
            if (paymentOption === 'full-course') {
                this.registrationData.registration_type = 'full-course';
                this.registrationData.payment_amount = this.selectedCourse.full_course_price;
            } else if (paymentOption === 'per-class') {
                this.registrationData.registration_type = 'per-class';
                this.registrationData.payment_amount = this.selectedCourse.per_class_price;
            } else {
                // Default to full course if only one option available
                if (this.selectedCourse.full_course_price > 0) {
                    this.registrationData.registration_type = 'full-course';
                    this.registrationData.payment_amount = this.selectedCourse.full_course_price;
                } else {
                    this.registrationData.registration_type = 'per-class';
                    this.registrationData.payment_amount = this.selectedCourse.per_class_price;
                }
            }
        } else if (this.selectedDropIn) {
            this.registrationData.course_id = null;
            this.registrationData.drop_in_class_id = this.selectedDropIn.id;
            this.registrationData.registration_type = 'drop-in';
            this.registrationData.payment_amount = this.selectedDropIn.price;
        }

        try {
            // Add payment method to registration data if available
            if (this.selectedPaymentMethod) {
                this.registrationData.payment_method = this.selectedPaymentMethod;
            }

            // Try regular registration first
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.registrationData)
            });

            const result = await response.json();

            if (!response.ok) {
                // Check if course is full and try waitlist
                if (result.course_full) {
                    console.log('🎯 Course is full, attempting waitlist registration');
                    await this.handleWaitlistRegistration();
                    return;
                } else {
                    throw new Error(result.error || 'Registration failed');
                }
            }

            // Regular registration successful
            this.registrationData.registrationId = result.registrationId;
            this.registrationData.studentId = result.studentId;

            // Debug logging to verify data
            console.log('✅ Registration successful:', {
                registrationId: this.registrationData.registrationId,
                studentId: this.registrationData.studentId,
                amount: this.registrationData.payment_amount
            });

            // Verify we have all required data before proceeding
            if (!this.registrationData.registrationId || !this.registrationData.payment_amount) {
                throw new Error('Registration data incomplete - missing ID or amount');
            }

            // Proceed to payment
            this.showPaymentSection();

        } catch (error) {
            console.error('Registration error:', error);
            this.showError(error.message || 'Registration failed. Please try again.');
        }
    }

    async handleWaitlistRegistration() {
        try {
            console.log('📝 Adding to waitlist with data:', this.registrationData);
            
            // Add to waitlist
            const waitlistResponse = await fetch('/api/waitlist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.registrationData)
            });

            const waitlistResult = await waitlistResponse.json();

            if (!waitlistResponse.ok) {
                throw new Error(waitlistResult.error || 'Failed to join waitlist');
            }

            // Store waitlist data
            this.registrationData.waitlistId = waitlistResult.waitlistId;
            this.registrationData.waitlistPosition = waitlistResult.position;
            this.registrationData.courseName = waitlistResult.courseName;

            console.log('✅ Waitlist registration successful:', {
                waitlistId: this.registrationData.waitlistId,
                position: this.registrationData.waitlistPosition,
                course: this.registrationData.courseName
            });

            // Show waitlist success page
            this.showWaitlistSuccess();

        } catch (error) {
            console.error('Waitlist registration error:', error);
            this.showError(error.message || 'Failed to join waitlist. Please try again.');
        }
    }

    showWaitlistSuccess() {
        this.currentStep = 'waitlist-success';
        
        // Hide all sections
        document.getElementById('courseSelection').style.display = 'none';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';
        
        // Create and show waitlist success section
        this.createWaitlistSuccessSection();
        this.scrollToTop();
    }

    createWaitlistSuccessSection() {
        // Create waitlist success section if it doesn't exist
        let waitlistSection = document.getElementById('waitlistSuccessSection');
        
        if (!waitlistSection) {
            waitlistSection = document.createElement('section');
            waitlistSection.id = 'waitlistSuccessSection';
            waitlistSection.className = 'container py-5';
            
            // Insert after confirmation section
            const confirmationSection = document.getElementById('confirmationSection');
            confirmationSection.parentNode.insertBefore(waitlistSection, confirmationSection.nextSibling);
        }

        const courseName = this.selectedCourse ? this.selectedCourse.name : 
                          this.selectedDropIn ? this.selectedDropIn.course_name : 'Course';

        waitlistSection.innerHTML = `
            <div class="row justify-content-center">
                <div class="col-lg-8">
                    <div class="card waitlist-success-card">
                        <div class="card-body text-center">
                            <div class="waitlist-success-icon mb-4">
                                <i class="fas fa-list-ol text-primary" style="font-size: 4rem;"></i>
                            </div>
                            
                            <h2 class="text-primary mb-3">You're on the Waitlist!</h2>
                            
                            <div class="alert alert-info mb-4">
                                <div class="row align-items-center">
                                    <div class="col-md-8">
                                        <h5 class="mb-1">${courseName}</h5>
                                        <p class="mb-0">Your waitlist position: <strong>#${this.registrationData.waitlistPosition}</strong></p>
                                    </div>
                                    <div class="col-md-4">
                                        <div class="waitlist-position-badge">
                                            <span class="badge bg-primary" style="font-size: 1.2rem; padding: 0.5rem 1rem;">
                                                #${this.registrationData.waitlistPosition}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="waitlist-next-steps mb-4">
                                <h5><i class="fas fa-info-circle text-primary me-2"></i>What happens next?</h5>
                                <div class="row text-start">
                                    <div class="col-md-6">
                                        <div class="next-step-item mb-3">
                                            <i class="fas fa-envelope text-success me-2"></i>
                                            <strong>Email Confirmation</strong><br>
                                            <small class="text-muted">You'll receive a confirmation email shortly</small>
                                        </div>
                                        <div class="next-step-item mb-3">
                                            <i class="fas fa-clock text-warning me-2"></i>
                                            <strong>Wait for Notification</strong><br>
                                            <small class="text-muted">We'll email you when a spot opens up</small>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="next-step-item mb-3">
                                            <i class="fas fa-hourglass-half text-info me-2"></i>
                                            <strong>48-Hour Window</strong><br>
                                            <small class="text-muted">You'll have 48 hours to complete registration</small>
                                        </div>
                                        <div class="next-step-item mb-3">
                                            <i class="fas fa-credit-card text-primary me-2"></i>
                                            <strong>Pay When Notified</strong><br>
                                            <small class="text-muted">No payment required until a spot opens</small>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="alert alert-warning">
                                <h6><i class="fas fa-exclamation-triangle me-2"></i>Important</h6>
                                <p class="mb-0 small">Please check your email (including spam folder) for waitlist confirmation and future notifications about available spots.</p>
                            </div>

                            <div class="waitlist-actions">
                                <div class="d-grid gap-2 d-md-block">
                                    <button type="button" class="btn btn-primary btn-lg" onclick="app.resetRegistration()">
                                        <i class="fas fa-plus me-2"></i>Register for Another Course
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary btn-lg" onclick="app.shareRegistration()">
                                        <i class="fas fa-share me-2"></i>Share with Friends
                                    </button>
                                </div>
                            </div>

                            ${this.registrationData.waitlistId ? `
                                <div class="waitlist-details mt-4">
                                    <small class="text-muted">Waitlist ID: #${this.registrationData.waitlistId}</small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;

        waitlistSection.style.display = 'block';
        
        // Add some custom CSS for waitlist success
        if (!document.getElementById('waitlist-success-styles')) {
            const style = document.createElement('style');
            style.id = 'waitlist-success-styles';
            style.textContent = `
                .waitlist-success-card {
                    box-shadow: 0 8px 25px rgba(0,0,0,0.1);
                    border: none;
                    border-radius: 15px;
                }
                .waitlist-success-icon {
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
                .next-step-item {
                    padding: 0.5rem 0;
                }
                .waitlist-position-badge {
                    margin-top: 0.5rem;
                }
                @media (max-width: 768px) {
                    .waitlist-position-badge {
                        margin-top: 1rem;
                        margin-bottom: 1rem;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }

    showPaymentSection() {
        this.currentStep = 'payment';
        
        // Defensive programming: check if elements exist before manipulating them
        const courseSelection = document.getElementById('courseSelection');
        const registrationForm = document.getElementById('registrationForm');
        const paymentSection = document.getElementById('paymentSection');
        const confirmationSection = document.getElementById('confirmationSection');

        if (courseSelection) courseSelection.style.display = 'none';
        if (registrationForm) registrationForm.style.display = 'none';
        if (paymentSection) paymentSection.style.display = 'block';
        if (confirmationSection) confirmationSection.style.display = 'none';

        this.populatePaymentSummary();
        this.initializePaymentOptions();
        this.scrollToTop();
    }

    populatePaymentSummary() {
        const summaryContainer = document.getElementById('paymentSummary');
        
        const courseName = this.selectedCourse ? this.selectedCourse.name : 
                          this.selectedDropIn ? `${this.selectedDropIn.course_name} - Drop-in` : '';
        
        summaryContainer.innerHTML = `
            <h6><i class="fas fa-receipt text-primary"></i> Payment Summary</h6>
            <div class="row">
                <div class="col-8">
                    <strong>${courseName}</strong><br>
                    <small class="text-muted">${this.registrationData.email}</small>
                </div>
                <div class="col-4 text-end">
                    <strong class="h5 text-primary">$${this.registrationData.payment_amount}</strong>
                </div>
            </div>
        `;
    }

    async initializePaymentOptions() {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '';

        // Since payment method was already selected, go directly to the payment flow
        if (this.selectedPaymentMethod) {
            console.info('Skipping payment method selection, going directly to:', this.selectedPaymentMethod);
            if (this.selectedPaymentMethod === 'venmo') {
                await this.initializeVenmoPayment();
            } else if (this.selectedPaymentMethod === 'zelle') {
                await this.initializeZellePayment();
            }
        } else {
            // Fallback: show payment method selection (shouldn't happen in 2-page flow)
            console.warn('No payment method selected, showing selection screen');
            container.innerHTML = `
                <div class="payment-methods-container">
                    <h6 class="mb-4"><i class="fas fa-credit-card me-2"></i>Choose Your Payment Method</h6>
                    
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <div class="card payment-method-card" onclick="app.selectPaymentMethod('venmo')">
                                <div class="card-body text-center">
                                    <i class="fas fa-mobile-alt fa-3x text-primary mb-3"></i>
                                    <h6><i class="fas fa-mobile-alt me-2"></i>Venmo</h6>
                                    <small class="text-muted">Quick mobile payment</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card payment-method-card" onclick="app.selectPaymentMethod('zelle')">
                                <div class="card-body text-center">
                                    <i class="fas fa-university fa-3x text-success mb-3"></i>
                                    <h6><i class="fas fa-university me-2"></i>Zelle</h6>
                                    <small class="text-muted">Bank-to-bank transfer</small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="text-center">
                        <small class="text-muted">
                            <i class="fas fa-shield-alt me-1"></i>
                            Both methods are secure and widely accepted
                        </small>
                    </div>
                </div>
            `;

            // Add CSS for payment method cards
            if (!document.getElementById('payment-method-styles')) {
                const style = document.createElement('style');
                style.id = 'payment-method-styles';
                style.textContent = `
                    .payment-method-card {
                        cursor: pointer;
                        transition: transform 0.2s, box-shadow 0.2s;
                        border: 2px solid transparent;
                        background: var(--bg-card);
                        color: var(--text-primary);
                    }
                    .payment-method-card:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        border-color: var(--accent-primary);
                    }
                    .payment-method-card .card-body {
                        padding: 1.5rem;
                        color: var(--text-primary);
                    }
                    .payment-method-card h6 {
                        color: var(--text-primary) !important;
                        font-weight: 700;
                        margin-bottom: 0.5rem;
                    }
                    .payment-method-card .text-muted {
                        color: var(--text-secondary) !important;
                    }
                    .payment-method-card i.fa-3x {
                        margin-bottom: 1rem;
                    }
                `;
                document.head.appendChild(style);
            }
        }
    }

    async selectPaymentMethod(method) {
        // Store the selected payment method
        this.selectedPaymentMethod = method;
        
        if (method === 'venmo') {
            await this.initializeVenmoPayment();
        } else if (method === 'zelle') {
            await this.initializeZellePayment();
        }
    }

    async initializeVenmoPayment() {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            // Generate Venmo payment link
            const courseName = this.selectedCourse ? this.selectedCourse.name : 
                              this.selectedDropIn ? this.selectedDropIn.course_name : '';

            const response = await fetch('/api/generate-venmo-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    registrationId: this.registrationData.registrationId,
                    amount: this.registrationData.payment_amount,
                    courseName: courseName
                })
            });

            const venmoData = await response.json();

            if (!response.ok) {
                throw new Error(venmoData.error || 'Failed to generate Venmo payment link');
            }

            // Detect if user is on mobile
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            container.innerHTML = `
                <div class="venmo-payment-container">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6><i class="fas fa-mobile-alt text-primary me-2"></i>Pay with Venmo</h6>
                        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="app.initializePaymentOptions()">
                            <i class="fas fa-arrow-left me-1"></i>Back
                        </button>
                    </div>
                    
                    <div class="alert alert-info mb-4">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-mobile-alt fa-2x text-primary me-3"></i>
                            <div>
                                <h6 class="mb-1">Send payment to</h6>
                                <strong>@${venmoData.venmoUsername}</strong>
                            </div>
                        </div>
                    </div>

                    <div class="payment-details mb-4">
                        <div class="row">
                            <div class="col-6">
                                <strong>Amount:</strong><br>
                                <span class="h4 text-success">$${this.registrationData.payment_amount}</span>
                            </div>
                            <div class="col-6">
                                <strong>Payment Note:</strong><br>
                                <small class="text-muted">${venmoData.paymentNote}</small>
                            </div>
                        </div>
                    </div>

                    ${isMobile ? `
                        <!-- Mobile: Direct Venmo app link -->
                        <div class="d-grid gap-2 mb-3">
                            <a href="${venmoData.venmoLink}" class="btn btn-primary btn-lg venmo-btn">
                                <i class="fas fa-mobile-alt me-2"></i>
                                Open Venmo App & Pay
                            </a>
                        </div>
                        <div class="text-center">
                            <small class="text-muted">
                                <i class="fas fa-info-circle me-1"></i>
                                This will open your Venmo app with payment details pre-filled
                            </small>
                        </div>
                    ` : `
                        <!-- Desktop: QR Code and manual instructions -->
                        <div class="text-center mb-4">
                            <div class="qr-code-container mb-3">
                                <div id="venmoQRCode" class="d-inline-block p-3 bg-white border rounded">
                                    <div class="spinner-border text-primary" role="status">
                                        <span class="visually-hidden">Generating QR code...</span>
                                    </div>
                                </div>
                            </div>
                            <p class="mb-2"><strong>Scan with your phone to pay via Venmo</strong></p>
                            <small class="text-muted">Or manually send $${this.registrationData.payment_amount} to @${venmoData.venmoUsername}</small>
                        </div>
                        
                        <div class="manual-payment-info">
                            <div class="alert alert-light">
                                <h6><i class="fas fa-hand-point-right me-2"></i>Manual Payment Instructions:</h6>
                                <ol class="mb-0 small">
                                    <li>Open Venmo app on your phone</li>
                                    <li>Search for <strong>@${venmoData.venmoUsername}</strong></li>
                                    <li>Send <strong>$${this.registrationData.payment_amount}</strong></li>
                                    <li>Include note: <strong>${venmoData.paymentNote}</strong></li>
                                </ol>
                            </div>
                        </div>
                    `}

                    <div class="payment-confirmation mt-4">
                        <div class="alert alert-warning">
                            <h6><i class="fas fa-clock me-2"></i>After Payment</h6>
                            <p class="mb-0 small">We'll verify your payment shortly and send you a confirmation email.</p>
                        </div>
                        
                        <div class="d-grid">
                            <button class="btn btn-success" onclick="app.showPaymentSentConfirmation()">
                                <i class="fas fa-check me-2"></i>
                                I've Sent the Payment
                            </button>
                        </div>
                    </div>
                </div>
            `;

            // Generate QR code for desktop users
            if (!isMobile) {
                this.generateVenmoQRCode(venmoData.venmoLink);
            }

        } catch (error) {
            console.error('Error initializing Venmo payment:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Venmo Payment Error</h6>
                    <p class="mb-2">${error.message}</p>
                    <p class="mb-0 small">Your registration has been saved with ID: #${this.registrationData.registrationId}</p>
                    <div class="mt-3">
                        <button class="btn btn-outline-primary" onclick="app.initializePaymentOptions()">Try Another Payment Method</button>
                    </div>
                </div>
            `;
        }
    }

    async initializeZellePayment() {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"></div></div>';

        try {
            // Generate Zelle payment details
            const courseName = this.selectedCourse ? this.selectedCourse.name : 
                              this.selectedDropIn ? this.selectedDropIn.course_name : '';

            const response = await fetch('/api/generate-zelle-payment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    registrationId: this.registrationData.registrationId,
                    amount: this.registrationData.payment_amount,
                    courseName: courseName
                })
            });

            const zelleData = await response.json();

            if (!response.ok) {
                throw new Error(zelleData.error || 'Failed to generate Zelle payment details');
            }

            container.innerHTML = `
                <div class="zelle-payment-container">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h6><i class="fas fa-university text-success me-2"></i>Pay with Zelle</h6>
                        <button type="button" class="btn btn-outline-secondary btn-sm" onclick="app.initializePaymentOptions()">
                            <i class="fas fa-arrow-left me-1"></i>Back
                        </button>
                    </div>
                    
                    <div class="alert alert-success mb-4">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-university fa-2x text-success me-3"></i>
                            <div>
                                <h6 class="mb-1">Send Zelle payment to:</h6>
                                <strong>${zelleData.zelleRecipientName}</strong><br>
                                <small>${zelleData.zellePhone}</small>
                            </div>
                        </div>
                    </div>

                    <div class="payment-details mb-4">
                        <div class="row">
                            <div class="col-6">
                                <strong>Amount:</strong><br>
                                <span class="h4 text-success">$${zelleData.amount}</span>
                            </div>
                            <div class="col-6">
                                <strong>Payment Note:</strong><br>
                                <small class="text-muted">${zelleData.paymentNote}</small>
                            </div>
                        </div>
                    </div>

                    <div class="zelle-instructions">
                        <div class="alert alert-light">
                            <h6><i class="fas fa-list-ol me-2"></i>Payment Instructions:</h6>
                            <ol class="mb-2 small">
                                <li>Open your banking app or online banking</li>
                                <li>Find "Zelle" or "Send Money" option</li>
                                <li>Enter recipient: <strong>${zelleData.zellePhone}</strong></li>
                                <li>Enter amount: <strong>$${zelleData.amount}</strong></li>
                                <li>Add memo/note: <strong>${zelleData.paymentNote}</strong></li>
                                <li>Review and send payment</li>
                            </ol>
                            <div class="text-center">
                                <small class="text-muted">
                                    <i class="fas fa-info-circle me-1"></i>
                                    Zelle transfers are typically instant between enrolled accounts
                                </small>
                            </div>
                        </div>
                    </div>

                    <div class="recipient-details mb-4">
                        <div class="text-center">
                            <div class="card">
                                <div class="card-body">
                                    <i class="fas fa-phone fa-3x text-success mb-3"></i>
                                    <h5>${zelleData.zelleRecipientName}</h5>
                                    <h6 class="text-success">${zelleData.zellePhone}</h6>
                                    <button type="button" class="btn btn-success mt-3" onclick="navigator.clipboard.writeText('${zelleData.zellePhone}'); app.showSuccess('Phone number copied to clipboard!')">
                                        <i class="fas fa-copy me-2"></i>Copy Phone Number
                                    </button>
                                    <div class="mt-2">
                                        <small class="text-muted">Copy this number to send your Zelle payment</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="payment-confirmation">
                        <div class="alert alert-warning">
                            <h6><i class="fas fa-clock me-2"></i>After Payment</h6>
                            <p class="mb-0 small">We'll verify your payment shortly and send you a confirmation email.</p>
                        </div>
                        
                        <div class="d-grid">
                            <button class="btn btn-success" onclick="app.showPaymentSentConfirmation()">
                                <i class="fas fa-check me-2"></i>
                                I've Sent the Payment
                            </button>
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Error initializing Zelle payment:', error);
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Zelle Payment Error</h6>
                    <p class="mb-2">${error.message}</p>
                    <p class="mb-0 small">Your registration has been saved with ID: #${this.registrationData.registrationId}</p>
                    <div class="mt-3">
                        <button class="btn btn-outline-primary" onclick="app.initializePaymentOptions()">Try Another Payment Method</button>
                    </div>
                </div>
            `;
        }
    }

    async generateVenmoQRCode(venmoLink) {
        try {
            // Use a QR code generation service
            const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(venmoLink)}`;
            
            const qrContainer = document.getElementById('venmoQRCode');
            qrContainer.innerHTML = `<img src="${qrCodeUrl}" alt="Venmo Payment QR Code" class="img-fluid" style="max-width: 200px;">`;
        } catch (error) {
            console.error('Error generating QR code:', error);
            const qrContainer = document.getElementById('venmoQRCode');
            qrContainer.innerHTML = `<div class="text-muted small">QR code unavailable</div>`;
        }
    }

    showPaymentSentConfirmation() {
        // Update the payment section to show confirmation
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = `
            <div class="text-center">
                <div class="alert alert-success">
                    <i class="fas fa-check-circle fa-3x text-success mb-3"></i>
                    <h5>Payment Sent!</h5>
                    <p class="mb-2">Thank you for sending your Venmo payment.</p>
                    <p class="mb-2 small">Registration received, We will confirm your payment and send an email confirmation</p>
                    <p class="mb-0 small text-muted">
                        <i class="fas fa-envelope me-1"></i>
                        Please check your spam/junk folder if you don't receive the email within a few minutes
                    </p>
                </div>
                
                <div class="registration-summary">
                    <h6>Registration Summary</h6>
                    <div class="row text-start">
                        <div class="col-6"><strong>Registration ID:</strong></div>
                        <div class="col-6">#${this.registrationData.registrationId}</div>
                        <div class="col-6"><strong>Amount:</strong></div>
                        <div class="col-6">$${this.registrationData.payment_amount}</div>
                        <div class="col-6"><strong>Status:</strong></div>
                        <div class="col-6"><span class="badge bg-warning">Pending Confirmation</span></div>
                    </div>
                </div>

                <div class="d-grid gap-2 mt-4">
                    <button class="btn btn-primary" onclick="app.resetRegistration()">
                        <i class="fas fa-plus me-2"></i>
                        Register for Another Class
                    </button>
                    <button class="btn btn-outline-secondary" onclick="app.shareRegistration()">
                        <i class="fas fa-share me-2"></i>
                        Share with Friends
                    </button>
                </div>
            </div>
        `;
    }

    async handlePaymentSuccess(order) {
        try {
            // Update registration with payment details
            const updateResponse = await fetch(`/api/registrations/${this.registrationData.registrationId}/payment`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    payment_status: 'completed',
                    paypal_transaction_id: order.purchase_units[0].payments.captures[0].id,
                    paypal_order_id: order.id,
                    payment_method: 'PayPal'
                })
            });

            if (!updateResponse.ok) {
                throw new Error('Failed to update payment status');
            }

            this.registrationData.paypalOrderId = order.id;
            this.registrationData.paypalTransactionId = order.purchase_units[0].payments.captures[0].id;

            this.showConfirmation();
            this.showSuccess('Payment successful! Registration confirmed.');

        } catch (error) {
            console.error('Payment update error:', error);
            this.showError('Payment was processed but registration update failed. Please contact support.');
        }
    }

    showConfirmation() {
        this.currentStep = 'confirmation';
        document.getElementById('courseSelection').style.display = 'none';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'block';

        this.populateConfirmationDetails();
        this.scrollToTop();
    }

    populateConfirmationDetails() {
        const detailsContainer = document.getElementById('confirmationDetails');
        
        const courseName = this.selectedCourse ? this.selectedCourse.name : 
                          this.selectedDropIn ? `${this.selectedDropIn.course_name} - Drop-in` : '';
        
        const scheduleInfo = this.selectedCourse ? this.selectedCourse.schedule_info :
                           this.selectedDropIn ? `${new Date(this.selectedDropIn.class_date).toLocaleDateString()} at ${this.selectedDropIn.class_time}` : '';

        detailsContainer.innerHTML = `
            <div class="confirmation-item">
                <span class="confirmation-label">Course:</span>
                <span class="confirmation-value">${courseName}</span>
            </div>
            <div class="confirmation-item">
                <span class="confirmation-label">Student:</span>
                <span class="confirmation-value">${this.registrationData.email}</span>
            </div>
            <div class="confirmation-item">
                <span class="confirmation-label">Instagram:</span>
                <span class="confirmation-value">@${this.registrationData.instagram_id}</span>
            </div>
            <div class="confirmation-item">
                <span class="confirmation-label">Experience:</span>
                <span class="confirmation-value">${this.registrationData.dance_experience}</span>
            </div>
            ${scheduleInfo ? `
                <div class="confirmation-item">
                    <span class="confirmation-label">Schedule:</span>
                    <span class="confirmation-value">${scheduleInfo}</span>
                </div>
            ` : ''}
            <div class="confirmation-item">
                <span class="confirmation-label">Amount Paid:</span>
                <span class="confirmation-value">$${this.registrationData.payment_amount}</span>
            </div>
            <div class="confirmation-item">
                <span class="confirmation-label">Registration ID:</span>
                <span class="confirmation-value">#${this.registrationData.registrationId}</span>
            </div>
        `;
    }

    showCourseSelection() {
        this.currentStep = 'courses';
        // Clear any previous selection to avoid stale state confusing the UX
        this.selectedCourse = null;
        this.selectedDropIn = null;

        document.getElementById('courseSelection').style.display = 'block';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';
        
        // Reset to regular branding when going back to course selection
        this.resetBranding();

        // Refresh courses to ensure latest data and avoid stale state
        // Do not await; allow UI to show immediately while data refreshes
        this.loadCourses();

        this.scrollToTop();
    }

    resetRegistration() {
        this.selectedCourse = null;
        this.selectedDropIn = null;
        this.registrationData = {};
        document.getElementById('studentRegistrationForm').reset();
        this.resetBranding();
        this.showCourseSelection();
        this.loadCourses(); // Refresh course availability
    }

    resetBranding() {
        const headerSection = document.querySelector('.header-section');
        const headerTitle = headerSection.querySelector('h1');
        const headerSubtitle = headerSection.querySelector('.lead');
        const footer = document.querySelector('.footer');
        const registrationCard = document.querySelector('#registrationForm .card');
        
        // Restore regular branding
        headerTitle.innerHTML = `
            <i class="fas fa-music text-primary"></i>
            GouMo Dance Chronicles
        `;
        headerSubtitle.textContent = 'Register for amazing dance experiences';
        
        // Remove crew practice styling
        document.body.classList.remove('crew-practice-mode', 'crew-bg-strong');
        
        // Remove DDC logos
        const cardHeaderLogo = document.querySelector('#registrationForm .card .card-header .ddc-card-header-logo');
        const footerLogo = footer?.querySelector('.ddc-footer-logo');
        if (cardHeaderLogo) cardHeaderLogo.remove();
        if (footerLogo) footerLogo.remove();
    }

    shareRegistration() {
        const url = window.location.href;
        const text = `I just registered for dance classes! Check out these amazing courses: ${url}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'Dance Class Registration',
                text: text,
                url: url
            });
        } else {
            // Fallback to copying to clipboard
            navigator.clipboard.writeText(text).then(() => {
                this.showSuccess('Registration link copied to clipboard!');
            }).catch(() => {
                this.showError('Could not copy link. Please share manually: ' + url);
            });
        }
    }

    showRegistrationClosed() {
        document.getElementById('registrationStatus').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

    showNoCoursesMessage() {
        document.getElementById('noCoursesMessage').style.display = 'block';
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

    hideLoading() {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.display = 'none';
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new DanceRegistrationApp();
});

// Add payment status update endpoint to server.js (this would be added to the server)
// This is a note for the missing API endpoint that needs to be added to server.js
