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
            
            // Load PayPal SDK dynamically with the correct client ID
            if (this.settings.paypal_client_id) {
                await this.loadPayPalSDK();
            } else {
                console.warn('PayPal client ID not configured');
            }
            
            // Check if registration is open
            if (this.settings.registration_open !== 'true') {
                this.showRegistrationClosed();
                return;
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            throw error;
        }
    }

    async loadPayPalSDK() {
        return new Promise((resolve, reject) => {
            // Check if PayPal SDK is already loaded
            if (typeof paypal !== 'undefined') {
                resolve();
                return;
            }

            // Check if PayPal client ID is configured
            if (!this.settings.paypal_client_id || this.settings.paypal_client_id.trim() === '') {
                console.warn('PayPal client ID not configured');
                resolve(); // Don't reject, just continue without PayPal
                return;
            }

            // Create and load PayPal SDK script
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?client-id=${this.settings.paypal_client_id}&currency=${this.settings.currency || 'USD'}&components=buttons`;
            script.async = true;
            
            script.onload = () => {
                console.log('PayPal SDK loaded successfully');
                resolve();
            };
            
            script.onerror = () => {
                console.error('Failed to load PayPal SDK - possibly invalid client ID');
                resolve(); // Don't reject, just continue without PayPal
            };
            
            document.head.appendChild(script);
        });
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
        const capacity = course.capacity || 0;
        const fillPercentage = capacity > 0 ? ((capacity - availableSpots) / capacity) * 100 : 0;
        
        let capacityClass = '';
        let spotsClass = '';
        if (availableSpots <= 0) {
            capacityClass = 'danger';
            spotsClass = 'danger';
        } else if (availableSpots <= capacity * 0.2) {
            capacityClass = 'warning';
            spotsClass = 'warning';
        }

        const hasFullCoursePrice = course.full_course_price && course.full_course_price > 0;
        const hasPerClassPrice = course.per_class_price && course.per_class_price > 0;

        col.innerHTML = `
            <div class="card course-card fade-in">
                <div class="card-header">
                    <h5 class="card-title">${course.name}</h5>
                    <p class="card-subtitle">${course.level || 'All Levels'} • ${course.duration_weeks || 0} weeks</p>
                </div>
                <div class="card-body">
                    ${course.description ? `<p class="text-muted mb-3">${course.description}</p>` : ''}
                    
                    <div class="course-info">
                        ${course.schedule_info ? `
                            <div class="course-info-item">
                                <i class="fas fa-calendar"></i>
                                <span>${course.schedule_info}</span>
                            </div>
                        ` : ''}
                        <div class="course-info-item">
                            <i class="fas fa-users"></i>
                            <span>Max ${capacity} students</span>
                        </div>
                        ${course.prerequisites ? `
                            <div class="course-info-item">
                                <i class="fas fa-info-circle"></i>
                                <span>${course.prerequisites}</span>
                            </div>
                        ` : ''}
                    </div>

                    <div class="capacity-info">
                        <span class="small">Capacity</span>
                        <div class="capacity-bar">
                            <div class="capacity-fill ${capacityClass}" style="width: ${fillPercentage}%"></div>
                        </div>
                        <span class="small spots-remaining ${spotsClass}">
                            ${availableSpots > 0 ? `${availableSpots} left` : 'FULL'}
                        </span>
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
        this.scrollToTop();
    }

    populateSelectedCourseInfo() {
        const infoContainer = document.getElementById('selectedCourseInfo');
        
        if (this.selectedCourse) {
            infoContainer.innerHTML = `
                <h5><i class="fas fa-graduation-cap text-primary"></i> ${this.selectedCourse.name}</h5>
                <div class="row">
                    <div class="col-sm-6">
                        <strong>Duration:</strong> ${this.selectedCourse.duration_weeks} weeks<br>
                        <strong>Level:</strong> ${this.selectedCourse.level || 'All Levels'}
                    </div>
                    <div class="col-sm-6">
                        <strong>Capacity:</strong> ${this.selectedCourse.capacity} students<br>
                        <strong>Available:</strong> ${this.selectedCourse.available_spots} spots
                    </div>
                </div>
                ${this.selectedCourse.schedule_info ? `<div class="mt-2"><strong>Schedule:</strong> ${this.selectedCourse.schedule_info}</div>` : ''}
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
                        <strong>Price:</strong> $${this.selectedDropIn.price}<br>
                        <strong>Available:</strong> ${this.selectedDropIn.available_spots} spots
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
            dance_experience: formData.get('dance_experience')
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

            this.registrationData.registrationId = result.registrationId;
            this.registrationData.studentId = result.studentId;

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
        this.initializePayPal();
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

    initializePayPal() {
        // Clear any existing PayPal buttons
        const container = document.getElementById('paypal-button-container');
        container.innerHTML = '';

        if (typeof paypal === 'undefined') {
            // Show a message that PayPal is not configured instead of an error
            container.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Payment System Not Configured</strong>
                    <p class="mb-0 mt-2">PayPal payment processing is not currently available. Please contact the administrator to complete your registration.</p>
                </div>
                <div class="text-center mt-3">
                    <p class="text-muted">Your registration has been recorded with ID: #${this.registrationData.registrationId}</p>
                </div>
            `;
            return;
        }

        paypal.Buttons({
            createOrder: (data, actions) => {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: this.registrationData.payment_amount.toString(),
                            currency_code: this.settings.currency || 'USD'
                        },
                        description: this.selectedCourse ? 
                            `${this.selectedCourse.name} - Dance Class Registration` :
                            `${this.selectedDropIn.course_name} - Drop-in Class`
                    }]
                });
            },
            onApprove: async (data, actions) => {
                try {
                    document.getElementById('paymentStatus').style.display = 'block';
                    
                    const order = await actions.order.capture();
                    await this.handlePaymentSuccess(order);
                    
                } catch (error) {
                    console.error('Payment capture error:', error);
                    this.showError('Payment processing failed. Please try again.');
                    document.getElementById('paymentStatus').style.display = 'none';
                }
            },
            onError: (err) => {
                console.error('PayPal error:', err);
                this.showError('Payment failed. Please try again.');
                document.getElementById('paymentStatus').style.display = 'none';
            },
            onCancel: (data) => {
                console.log('Payment cancelled:', data);
                this.showError('Payment was cancelled.');
            },
            style: {
                layout: 'vertical',
                color: 'blue',
                shape: 'rect',
                label: 'paypal',
                height: 50
            }
        }).render('#paypal-button-container');
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
        this.scrollToTop();
    }

    resetRegistration() {
        this.selectedCourse = null;
        this.selectedDropIn = null;
        this.registrationData = {};
        document.getElementById('studentRegistrationForm').reset();
        this.showCourseSelection();
        this.loadCourses(); // Refresh course availability
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
