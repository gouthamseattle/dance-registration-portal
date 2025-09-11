// Dance Registration Portal - Frontend JavaScript
class DanceRegistrationApp {
    constructor() {
        this.currentStep = 'courses';
        this.selectedCourse = null;
        this.selectedDropIn = null;
        this.registrationData = {};
        this.paypalClientId = null;
        this.settings = {};
        
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

    renderCourses(courses) {
        const container = document.getElementById('multiWeekCourses');
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
                if (slot.day_of_week) parts.push(`${slot.day_of_week}s`);
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
            if (course.start_date && course.end_date) {
                const startDate = new Date(course.start_date).toLocaleDateString();
                const endDate = new Date(course.end_date).toLocaleDateString();
                dateInfo = `<br><small>${startDate} - ${endDate}</small>`;
            } else if (course.start_date) {
                const startDate = new Date(course.start_date).toLocaleDateString();
                dateInfo = `<br><small>Starts ${startDate}</small>`;
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

        // Add Practice Date for Crew Practice courses
        let practiceDateHtml = '';
        if (course.course_type === 'crew_practice' && course.start_date) {
            const startDate = new Date(course.start_date).toLocaleDateString();
            practiceDateHtml = `
                            <div class="course-info-item">
                                <i class="fas fa-star text-warning"></i>
                                <span><strong>Practice Date:</strong> ${startDate}</span>
                            </div>
            `;
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
                        ${practiceDateHtml}
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

        col.innerHTML = `
            <div class="card dropin-card fade-in">
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
                        <div class="dropin-detail">
                            <i class="fas fa-users"></i>
                            <span>${availableSpots > 0 ? `${availableSpots} spots left` : 'FULL'}</span>
                        </div>
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
        try {
            const response = await fetch(`/api/courses?active_only=true`);
            const courses = await response.json();
            this.selectedCourse = courses.find(c => c.id === courseId);
            this.selectedDropIn = null;

            if (!this.selectedCourse) {
                this.showError('Course not found.');
                return;
            }

            this.showRegistrationForm();
        } catch (error) {
            console.error('Error selecting course:', error);
            this.showError('Failed to select course.');
        }
    }

    async selectDropIn(dropInId) {
        try {
            const response = await fetch(`/api/drop-in-classes?active_only=true`);
            const dropIns = await response.json();
            this.selectedDropIn = dropIns.find(d => d.id === dropInId);
            this.selectedCourse = null;

            if (!this.selectedDropIn) {
                this.showError('Drop-in class not found.');
                return;
            }

            this.showRegistrationForm();
        } catch (error) {
            console.error('Error selecting drop-in class:', error);
            this.showError('Failed to select drop-in class.');
        }
    }

    showRegistrationForm() {
        this.currentStep = 'form';
        document.getElementById('courseSelection').style.display = 'none';
        document.getElementById('registrationForm').style.display = 'block';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';

        this.populateSelectedCourseInfo();
        this.setupPaymentOptions();
        this.setupDanceExperienceField();
        this.setupInstagramIdField();
        this.setupCrewPracticeBranding();
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
                    if (slot.day_of_week) {
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
                if (this.selectedCourse.start_date && this.selectedCourse.end_date) {
                    const startDate = new Date(this.selectedCourse.start_date).toLocaleDateString();
                    const endDate = new Date(this.selectedCourse.end_date).toLocaleDateString();
                    dateInfo = `<div class="mt-1"><strong>Dates:</strong> ${startDate} - ${endDate}</div>`;
                } else if (this.selectedCourse.start_date) {
                    const startDate = new Date(this.selectedCourse.start_date).toLocaleDateString();
                    dateInfo = `<div class="mt-1"><strong>Start Date:</strong> ${startDate}</div>`;
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
                    <div class="col-sm-6">
                        <strong>Level:</strong> ${this.selectedCourse.level || 'All Levels'}
                    </div>
                    <div class="col-sm-6">
                        <strong>Capacity:</strong> ${this.selectedCourse.capacity} students
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
        const danceExperienceField = document.getElementById('dance_experience').closest('.col-12');
        
        // Check if selected course is Crew Practice
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            // Hide dance experience field for Crew Practice
            danceExperienceField.style.display = 'none';
            // Remove required attribute
            document.getElementById('dance_experience').removeAttribute('required');
        } else {
            // Show dance experience field for other course types
            danceExperienceField.style.display = 'block';
            // Add required attribute
            document.getElementById('dance_experience').setAttribute('required', 'required');
        }
    }

    setupInstagramIdField() {
        const instagramLabel = document.querySelector('label[for="instagram_id"]');
        const instagramInput = document.getElementById('instagram_id');
        const inputGroup = instagramInput.closest('.input-group');
        const inputGroupText = inputGroup.querySelector('.input-group-text');
        
        // Check if selected course is Crew Practice
        if (this.selectedCourse && this.selectedCourse.course_type === 'crew_practice') {
            // Change to Name field for Crew Practice
            instagramLabel.innerHTML = `
                <i class="fas fa-user text-primary"></i>
                Full Name *
            `;
            instagramInput.placeholder = 'Enter your full name';
            instagramInput.name = 'student_name';
            instagramInput.id = 'student_name';
            instagramLabel.setAttribute('for', 'student_name');
            
            // Hide the @ symbol for name field
            inputGroupText.style.display = 'none';
            instagramInput.classList.remove('form-control');
            instagramInput.classList.add('form-control', 'form-control-lg');
            instagramInput.style.borderRadius = 'var(--radius-md)';
        } else {
            // Show Instagram ID field for other course types
            instagramLabel.innerHTML = `
                <i class="fab fa-instagram text-primary"></i>
                Instagram ID *
            `;
            instagramInput.placeholder = '';
            instagramInput.name = 'instagram_id';
            instagramInput.id = 'instagram_id';
            instagramLabel.setAttribute('for', 'instagram_id');
            
            // Show the @ symbol for Instagram field
            inputGroupText.style.display = 'block';
            instagramInput.style.borderRadius = '';
        }
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
        document.getElementById('backToCourses').addEventListener('click', () => {
            this.showCourseSelection();
        });

        // Registration form submission
        document.getElementById('studentRegistrationForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmission();
        });

        // Back to form button
        document.getElementById('backToForm').addEventListener('click', () => {
            this.showRegistrationForm();
        });

        // Register another class button
        document.getElementById('registerAnother').addEventListener('click', () => {
            this.resetRegistration();
        });

        // Share registration button
        document.getElementById('shareRegistration').addEventListener('click', () => {
            this.shareRegistration();
        });
    }

    async handleFormSubmission() {
        const form = document.getElementById('studentRegistrationForm');
        const formData = new FormData(form);

        // Validate form
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        // Prepare registration data
        this.registrationData = {
            email: formData.get('email'),
            instagram_id: formData.get('instagram_id'),
            dance_experience: formData.get('dance_experience') || null // Allow null for crew practice
        };

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
            // Create registration record
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.registrationData)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Registration failed');
            }

            // Ensure registrationId is properly set
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

    showPaymentSection() {
        this.currentStep = 'payment';
        document.getElementById('courseSelection').style.display = 'none';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'block';
        document.getElementById('confirmationSection').style.display = 'none';

        this.populatePaymentSummary();
        this.initializeVenmoPayment();
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

    async initializeVenmoPayment() {
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '';

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
                    <div class="alert alert-info mb-4">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-mobile-alt fa-2x text-primary me-3"></i>
                            <div>
                                <h6 class="mb-1">Pay with Venmo</h6>
                                <small>Send payment to <strong>@${venmoData.venmoUsername}</strong></small>
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
                            <p class="mb-0 small">We're rolling out email confirmations soon. We'll verify your payment shortly and update your registration.</p>
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
                    <h6><i class="fas fa-exclamation-triangle me-2"></i>Payment System Error</h6>
                    <p class="mb-2">${error.message}</p>
                    <p class="mb-0 small">Your registration has been saved with ID: #${this.registrationData.registrationId}</p>
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
                    <p class="mb-0 small">We're rolling out email confirmations soon. We'll confirm your payment shortly.</p>
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
        document.getElementById('courseSelection').style.display = 'block';
        document.getElementById('registrationForm').style.display = 'none';
        document.getElementById('paymentSection').style.display = 'none';
        document.getElementById('confirmationSection').style.display = 'none';
        
        // Reset to regular branding when going back to course selection
        this.resetBranding();
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
