# Dance Class Registration Portal - Functional Requirements Document

**Project:** Dance Class Registration Portal  
**Version:** 1.0  
**Date:** January 9, 2025  
**Author:** System Requirements Analysis  

---

## 1. PROJECT OVERVIEW

### 1.1 Purpose
Develop a self-hosted web portal for dance class registration that enables students to register and pay for classes while providing comprehensive administrative tools for the instructor.

### 1.2 Scope
- Student registration system with mobile-first design
- PayPal payment integration
- Administrative dashboard for course management
- Email notification system
- WhatsApp sharing integration
- Data export capabilities

### 1.3 Key Objectives
- Zero ongoing hosting costs (runs locally)
- Mobile-optimized for WhatsApp sharing
- Flexible course configuration system
- Professional payment processing
- Real-time registration monitoring

---

## 2. USER ROLES & PERSONAS

### 2.1 Primary Users

#### Admin (Dance Instructor)
- **Role:** Course creator and registration manager
- **Goals:** 
  - Create and manage dance courses
  - Monitor registrations in real-time
  - Process payments securely
  - Communicate with students
  - Export student data
- **Technical Level:** Basic to intermediate
- **Primary Device:** Desktop/laptop computer

#### Student (Dance Class Participant)
- **Role:** Course registrant and payment processor
- **Goals:**
  - Browse available courses
  - Register for preferred classes
  - Complete payment quickly
  - Receive confirmation details
- **Technical Level:** Basic
- **Primary Device:** Mobile phone (via WhatsApp links)

---

## 3. CORE FUNCTIONAL REQUIREMENTS

### 3.1 Student Registration System

#### 3.1.1 Course Browsing
**FR-001: Course Display**
- System SHALL display all available courses with:
  - Course name and description
  - Duration (number of weeks)
  - Schedule (days/times)
  - Pricing options (full course vs per-class)
  - Capacity and available spots
  - Level requirements (Beginner/Intermediate/Advanced)

**FR-002: Real-time Availability**
- System SHALL show real-time capacity status
- System SHALL display "X spots remaining" for each course
- System SHALL show "FULL" status when capacity is reached
- System SHALL prevent registration when course is full

#### 3.1.2 Registration Form
**FR-003: Student Information Collection**
- System SHALL collect the following required information:
  - Email address (validated format)
  - Instagram ID
  - Dance experience level (dropdown selection)
- System SHALL validate all required fields before submission
- System SHALL provide clear error messages for invalid inputs

**FR-004: Course Selection**
- System SHALL allow students to select from available courses
- System SHALL allow students to choose payment option (full course vs per-class)
- System SHALL display total cost based on selection

#### 3.1.3 Mobile Optimization
**FR-005: Mobile-First Design**
- System SHALL be fully responsive for mobile devices
- System SHALL provide touch-friendly interface elements
- System SHALL load quickly on mobile data connections
- System SHALL support auto-fill for contact information

### 3.2 Payment Processing System

#### 3.2.1 PayPal Integration
**FR-006: Payment Options**
- System SHALL integrate with PayPal for payment processing
- System SHALL support multiple payment methods:
  - Credit/debit cards (without PayPal account)
  - PayPal accounts
  - Apple Pay/Google Pay
  - Digital wallets

**FR-007: Payment Processing**
- System SHALL process payments securely through PayPal
- System SHALL provide instant payment confirmation
- System SHALL handle payment failures gracefully
- System SHALL store payment status in database

**FR-008: Transaction Management**
- System SHALL generate unique transaction IDs
- System SHALL provide payment receipts
- System SHALL track payment status (Pending/Completed/Failed)

### 3.3 Course Management System

#### 3.3.1 Course Creation
**FR-009: Multi-Week Course Builder**
- System SHALL allow admin to create courses with:
  - Custom course names
  - Flexible duration (4-8+ weeks)
  - Capacity limits (customizable per course)
  - Multiple pricing structures:
    - Full course payment
    - Per-class payment
    - Both options available
  - Course descriptions and requirements
  - Level specifications

**FR-010: Drop-in Class Creation**
- System SHALL allow admin to create single drop-in classes with:
  - Class name and description
  - Specific date and time
  - Instructor information
  - Capacity limit
  - Single-class pricing
  - Same-day booking capability

#### 3.3.2 Course Configuration
**FR-011: Flexible Course Setup**
- System SHALL support various course configurations:
  - Different durations per session
  - Multiple skill levels (Level 1, Level 2, etc.)
  - Mixed course types in single registration session
  - Course templates for reuse

**FR-012: Registration Control**
- System SHALL allow admin to:
  - Open/close registration for entire system
  - Open/close individual courses
  - Set registration start/end dates
  - Enable/disable specific courses

### 3.4 Administrative Dashboard

#### 3.4.1 Registration Monitoring
**FR-013: Real-time Dashboard**
- System SHALL provide real-time registration overview showing:
  - Total registrations count
  - Revenue tracking
  - Course capacity status
  - Recent registration activity
  - Payment status summary

**FR-014: Student Management**
- System SHALL display student lists with:
  - Sortable and filterable views
  - Payment status indicators
  - Registration timestamps
  - Contact information
  - Course assignments

#### 3.4.2 Data Export
**FR-015: Export Functionality**
- System SHALL export data in CSV/Excel format
- System SHALL provide course-specific exports
- System SHALL include payment status in exports
- System SHALL generate student contact lists

### 3.5 Communication System

#### 3.5.1 Email Notifications
**FR-016: Automated Emails**
- System SHALL send automatic emails for:
  - Registration confirmation
  - Payment confirmation
  - Class schedule details
- System SHALL use customizable email templates
- System SHALL support both Gmail SMTP and custom email services

**FR-017: Bulk Communication**
- System SHALL allow admin to send bulk emails to:
  - All registered students
  - Students in specific courses
  - Students with specific payment status
- System SHALL provide email templates for common messages

#### 3.5.2 WhatsApp Integration
**FR-018: WhatsApp Sharing Tools**
- System SHALL generate WhatsApp-optimized sharing links
- System SHALL provide pre-written WhatsApp message templates
- System SHALL create rich link previews for WhatsApp
- System SHALL support link shortening for cleaner messages

### 3.6 Access and Sharing System

#### 3.6.1 Public Access
**FR-019: Local Network Access**
- System SHALL run on local network for in-person registration
- System SHALL provide local IP address for WiFi sharing

**FR-020: Public URL Generation**
- System SHALL integrate with ngrok for public access
- System SHALL generate temporary public URLs
- System SHALL provide one-click public link creation
- System SHALL automatically expire public access when closed

#### 3.6.2 QR Code Generation
**FR-021: QR Code Tools**
- System SHALL generate QR codes for registration links
- System SHALL provide downloadable QR code images
- System SHALL support QR codes for individual courses

---

## 4. USER STORIES

### 4.1 Student User Stories

**US-001: Course Discovery**
*As a student, I want to browse available dance courses so that I can choose the right class for my skill level and schedule.*

**Acceptance Criteria:**
- I can see all available courses with clear descriptions
- I can view pricing options and schedules
- I can see how many spots are available
- I can filter by skill level or course type

**US-002: Mobile Registration**
*As a student using my phone, I want to register for a class quickly so that I can secure my spot while on the go.*

**Acceptance Criteria:**
- The registration form is easy to use on my phone
- I can complete the entire process without switching devices
- The payment process works smoothly on mobile
- I receive immediate confirmation

**US-003: Payment Flexibility**
*As a student, I want multiple payment options so that I can pay using my preferred method.*

**Acceptance Criteria:**
- I can pay with my credit card without creating accounts
- I can use PayPal if I prefer
- I can use Apple Pay or Google Pay
- I can choose between full course payment or per-class payment

**US-004: Drop-in Registration**
*As a student, I want to register for single drop-in classes so that I can try classes without committing to a full course.*

**Acceptance Criteria:**
- I can see available drop-in classes
- I can register and pay for just one class
- I can book same-day if spots are available
- I receive confirmation with class details

### 4.2 Admin User Stories

**US-005: Course Creation**
*As an admin, I want to create flexible course configurations so that I can offer different types of classes each session.*

**Acceptance Criteria:**
- I can create multi-week courses with custom durations
- I can set different pricing structures
- I can create drop-in classes
- I can set capacity limits for each course
- I can reuse successful course templates

**US-006: Registration Monitoring**
*As an admin, I want to monitor registrations in real-time so that I can track capacity and manage my classes effectively.*

**Acceptance Criteria:**
- I can see live registration counts
- I can track payment status for each student
- I can view registration timeline
- I can see which courses are filling up quickly

**US-007: Student Communication**
*As an admin, I want to communicate with registered students so that I can provide updates and important information.*

**Acceptance Criteria:**
- I can send emails to all students or specific courses
- I can use templates for common messages
- I can send registration confirmations automatically
- I can create WhatsApp messages easily

**US-008: Data Management**
*As an admin, I want to export student data so that I can manage my classes and maintain records.*

**Acceptance Criteria:**
- I can export student lists by course
- I can include payment status in exports
- I can get contact information for communication
- I can generate reports for my records

---

## 5. BUSINESS RULES & CONSTRAINTS

### 5.1 Registration Rules
- **BR-001:** Students cannot register for courses that have reached capacity
- **BR-002:** Payment must be completed to confirm registration
- **BR-003:** Registration is only available when admin has opened the system
- **BR-004:** Each student can register for multiple courses in a single session
- **BR-005:** Drop-in classes can be booked up to the start time if spots available

### 5.2 Payment Rules
- **BR-006:** All payments must be processed through PayPal
- **BR-007:** Failed payments do not reserve spots in courses
- **BR-008:** Payment confirmation must be received before registration is complete
- **BR-009:** Refunds must be handled manually through PayPal

### 5.3 Course Management Rules
- **BR-010:** Admin can modify course details before registration opens
- **BR-011:** Course capacity cannot be reduced below current registration count
- **BR-012:** Courses can be closed individually without affecting other courses
- **BR-013:** Course templates can be saved and reused for future sessions

### 5.4 System Constraints
- **BR-014:** System runs locally on admin's computer only
- **BR-015:** Public access requires internet connection and ngrok
- **BR-016:** Database is stored locally (SQLite)
- **BR-017:** System is only active when admin starts the application

---

## 6. ACCEPTANCE CRITERIA

### 6.1 Student Portal Acceptance Criteria
- [ ] Mobile-responsive design works on all common phone sizes
- [ ] Registration form validates all required fields
- [ ] PayPal payment integration processes successfully
- [ ] Course selection shows real-time availability
- [ ] Confirmation emails are sent automatically
- [ ] Drop-in classes can be booked same-day

### 6.2 Admin Dashboard Acceptance Criteria
- [ ] Course builder creates multi-week and drop-in courses
- [ ] Real-time registration monitoring displays accurate data
- [ ] Student lists can be filtered and sorted
- [ ] Data export generates proper CSV/Excel files
- [ ] Email system sends bulk messages successfully
- [ ] Registration can be opened/closed on demand

### 6.3 Integration Acceptance Criteria
- [ ] WhatsApp sharing links work properly on mobile
- [ ] QR codes generate and link to correct registration page
- [ ] ngrok public access creates working URLs
- [ ] PayPal integration handles all supported payment methods
- [ ] Email notifications use correct templates and send reliably

### 6.4 Performance Acceptance Criteria
- [ ] Mobile pages load within 3 seconds on 4G connection
- [ ] Payment processing completes within 30 seconds
- [ ] Real-time updates appear within 5 seconds
- [ ] System supports up to 100 concurrent registrations
- [ ] Database operations complete within 2 seconds

---

## 7. FUNCTIONAL REQUIREMENTS SUMMARY

### 7.1 Core Functions
1. **Student Registration** - Mobile-optimized course browsing and registration
2. **Payment Processing** - Secure PayPal integration with multiple payment options
3. **Course Management** - Flexible course creation for multi-week and drop-in classes
4. **Admin Dashboard** - Real-time monitoring and student management
5. **Communication** - Email notifications and WhatsApp sharing tools
6. **Data Export** - CSV/Excel export for student lists and reports

### 7.2 Key Features
- Zero ongoing hosting costs (local deployment)
- Mobile-first design optimized for WhatsApp sharing
- Flexible course configuration system
- Real-time capacity monitoring
- Professional payment processing
- Comprehensive admin tools

### 7.3 Success Metrics
- 100% mobile compatibility for student registration
- <3 second page load times on mobile
- 99% payment processing success rate
- Zero data loss with local SQLite storage
- One-click course creation and management

---

**Document Status:** Draft for Review  
**Next Steps:** Review and approve functional requirements before proceeding to technical requirements and development.
