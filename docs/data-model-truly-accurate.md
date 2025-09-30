# Dance Registration Portal - Actually Used Data Model

## A. Executive Summary

### Purpose and Scope
The Dance Registration Portal uses a PostgreSQL database (production) with SQLite for development. This document shows **only the database fields that are actually used** in the application UI and business logic.

### Key Business Entities
The system is built around **Students** who register for **Courses** through **Registrations**. Courses are flexibly scheduled using **Course Slots** with configurable **Pricing**. The system tracks **Attendance** through **Class Sessions** and manages **Waitlists** when courses are full.

## B. Entity-Relationship Diagram (Actually Used Fields Only)

### 📊 **[View Interactive Visual Diagram](data-model-diagram-truly-accurate.html)**

### Core Database Structure (Only Functional Fields)

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│      STUDENTS       │    │       COURSES       │    │    REGISTRATIONS    │
│ =================== │    │ =================== │    │ =================== │
│ • id (PK)          │    │ • id (PK)          │    │ • id (PK)          │
│ • first_name       │    │ • name             │    │ • student_id (FK)  │
│ • last_name        │    │ • description      │    │ • course_id (FK)   │
│ • email (unique)   │    │ • course_type      │    │ • payment_amount   │
│ • instagram_handle │    │ • duration_weeks   │    │ • payment_status   │
│ • dance_experience │    │ • start_date       │    │ • paypal_transaction_id │
│ • student_type     │    │ • end_date         │    │ • payment_method   │
│ • profile_complete │    │ • instructor       │    │ • special_requests │
│ • admin_classified │    │ • schedule_info    │    │ • registration_date│
│ • created_at       │    │ • required_student │    │ • created_from_waitlist │
│ • updated_at       │    │   _type            │    │ • canceled_at      │
└─────────┬───────────┘    │ • is_active        │    │ • canceled_by (FK) │
          │                │ • created_at       │    │ • cancellation_reason │
          │ 1:many         │ • updated_at       │    │ • updated_at       │
          │                └─────────┬───────────┘    └─────────┬───────────┘
          │                          │                          │
          │ ┌────────────────────────┼──────────────────────────┘
          │ │                        │
          │ │                        │ 1:many
          │ │            ┌───────────▼───────────┐
          │ │            │     COURSE_SLOTS      │
          │ │            │ ==================== │
          │ │            │ • id (PK)            │
          │ │            │ • course_id (FK)     │
          │ │            │ • slot_name          │
          │ │            │ • difficulty_level   │
          │ │            │ • capacity           │
          │ │            │ • day_of_week        │
          │ │            │ • practice_date      │
          │ │            │ • start_time         │
          │ │            │ • end_time           │
          │ │            │ • location           │
          │ │            │ • created_at         │
          │ │            └───────────┬───────────┘
          │ │                        │ 1:many
          │ │            ┌───────────▼───────────┐
          │ │            │   COURSE_PRICING      │
          │ │            │ ==================== │
          │ │            │ • id (PK)            │
          │ │            │ • course_slot_id(FK) │
          │ │            │ • pricing_type       │
          │ │            │ • price              │
          │ │            │ • created_at         │
          │ │            └──────────────────────┘
          │ │
          │ │ many:many via WAITLIST
          │ └─────────┬──────────────────────────┐
          │           │                          │
          │           │ 1:many                   │ 1:many
┌─────────▼───────────▼─┐            ┌───────────▼───────────┐
│       WAITLIST        │            │    CLASS_SESSIONS     │
│ ==================== │            │ ==================== │
│ • id (PK)            │            │ • id (PK)            │
│ • student_id (FK)    │            │ • course_id (FK)     │
│ • course_id (FK)     │            │ • session_date       │
│ • waitlist_position  │            │ • created_at         │
│ • notification_sent  │            └───────────┬───────────┘
│ • notification_sent_at│                      │ 1:many
│ • payment_link_token │        ┌─────────────▼─────────────┐
│ • status             │        │    ATTENDANCE_RECORDS     │
│ • created_at         │        │ ========================= │
│ • updated_at         │        │ • id (PK)                │
└──────────────────────┘        │ • session_id (FK)        │
                                │ • student_id (FK) ───────┼──┐
┌─────────────────────┐         │ • status                 │  │
│    ADMIN_USERS      │         │   (present/absent/late)  │  │
│ =================== │         │ • marked_at              │  │
│ • id (PK)          │         │ • marked_by (FK to ADMIN)│  │
│ • username (unique) │         └──────────────────────────┘  │
│ • password_hash    │                                      │
│ • email            │         ┌─────────────────────┐      │
│ • last_login       │         │  SYSTEM_SETTINGS    │      │
│ • created_at       │         │ =================== │      │
└─────────┬───────────┘         │ • setting_key (PK)  │      │
          │                     │ • setting_value     │      │
          │                     │ • updated_at        │      │
          │                     └─────────────────────┘      │
          │                                                  │
          └──────────────────────────────────────────────────┘
                              marks attendance

KEY: PK=Primary Key, FK=Foreign Key, 1:many=One-to-Many Relationship
```

## C. Actually Used Tables and Fields

### **STUDENTS** (User Management) - 11 Fields Actually Used
- **Core Identity**: `id` (PK), `first_name`, `last_name`, `email` (unique)
- **Profile Data**: `instagram_handle`, `dance_experience` *(collected from UI)*
- **Classification**: `student_type` (general/crew_member), `profile_complete`, `admin_classified`
- **Timestamps**: `created_at`, `updated_at`

**❌ NOT USED**: phone, date_of_birth, emergency_contact_name, emergency_contact_phone, medical_conditions, how_heard_about_us

### **COURSES** (Course Management) - 12 Fields Used
- **Core Info**: `id` (PK), `name`, `description`, `course_type`, `instructor`
- **Scheduling**: `duration_weeks`, `start_date`, `end_date`, `schedule_info`
- **Access Control**: `required_student_type`, `is_active`
- **Timestamps**: `created_at`, `updated_at`

**❌ NOT USED**: prerequisites (not in admin UI)

### **REGISTRATIONS** (Enrollment & Payment) - 13 Fields Used
- **Core Links**: `id` (PK), `student_id` (FK), `course_id` (FK)
- **Payment**: `payment_amount`, `payment_status`, `paypal_transaction_id`, `payment_method`
- **Registration**: `special_requests`, `registration_date`
- **Waitlist Integration**: `created_from_waitlist`
- **Cancellation Audit**: `canceled_at`, `canceled_by` (FK), `cancellation_reason`
- **Timestamps**: `updated_at`

**❌ NOT USED**: waitlist_notification_sent_at (waitlist uses separate table)

### **COURSE_SLOTS** (Flexible Scheduling) - 10 Fields Used
- **Core Info**: `id` (PK), `course_id` (FK), `slot_name`, `difficulty_level`
- **Capacity**: `capacity`
- **Schedule**: `day_of_week`, `practice_date`, `start_time`, `end_time`, `location`
- **Timestamps**: `created_at`

### **COURSE_PRICING** (Pricing Configuration) - 5 Fields Used
- **Core Info**: `id` (PK), `course_slot_id` (FK)
- **Pricing**: `pricing_type` (full_package/drop_in), `price`
- **Timestamps**: `created_at`

### **CLASS_SESSIONS** (Attendance Management) - 4 Fields Actually Used
- **Core Info**: `id` (PK), `course_id` (FK), `session_date`
- **Timestamps**: `created_at`

**❌ NOT USED**: start_time, end_time, location, notes (not in admin UI)

### **ATTENDANCE_RECORDS** (Attendance Tracking) - 6 Fields Used
- **Core Info**: `id` (PK), `session_id` (FK), `student_id` (FK)
- **Attendance**: `status` (present/absent/late)
- **Audit**: `marked_at`, `marked_by` (FK to admin_users)

### **WAITLIST** (Capacity Management) - 9 Fields Used
- **Core Info**: `id` (PK), `student_id` (FK), `course_id` (FK)
- **Position**: `waitlist_position`, `status`
- **Notifications**: `notification_sent`, `notification_sent_at`, `payment_link_token`
- **Timestamps**: `created_at`, `updated_at`

**❌ NOT USED**: notification_expires_at (not implemented in UI)

### **ADMIN_USERS** (Authentication) - 6 Fields Used
- **Core Info**: `id` (PK), `username` (unique), `password_hash`
- **Profile**: `email`, `last_login`
- **Timestamps**: `created_at`

### **SYSTEM_SETTINGS** (Configuration) - 3 Fields Used
- **Core Info**: `setting_key` (PK), `setting_value`
- **Timestamps**: `updated_at`

**❌ NOT USED**: description (not displayed in admin UI)

## D. User Interface Analysis

### **Student Registration Form** (public/index.html)
**Only 3 fields collected:**
1. `email` - Required email address
2. `instagram_id` - Required Instagram handle  
3. `dance_experience` - Required dropdown selection

**Fields NOT in UI but in database:**
- first_name, last_name (derived from other systems)
- All contact fields (phone, emergency contacts, medical conditions)
- how_heard_about_us (hardcoded to "Existing student")

### **Admin Interface Analysis**
Based on admin.html and admin.js:
- Course management: All course fields used
- Registration management: Core registration fields used
- Attendance tracking: Basic session and attendance tracking
- Student classification: student_type and admin_classified used

## E. Data Flow Patterns (Simplified)

### **Student Registration Workflow**
1. **Email/Profile Check**: Student enters email, system checks for existing profile
2. **Minimal Data Collection**: Only instagram_handle and dance_experience collected
3. **Registration Creation**: Creates minimal student record with NULL for unused fields
4. **Payment Processing**: Updates payment_status, payment_method, payment_amount

### **Admin Classification Workflow**
1. **Student Review**: Admin reviews students via `admin_classified = false`
2. **Type Assignment**: Admin sets `student_type` (general/crew_member)
3. **Access Control**: `student_type` vs `required_student_type` determines course access

### **Attendance Tracking Workflow**
1. **Session Creation**: Admin creates basic `CLASS_SESSIONS` with date only
2. **Roster Loading**: Paid registrations loaded as student list
3. **Attendance Marking**: Simple present/absent/late status per student

---

*This truly accurate data model shows only the fields and functionality actually implemented and used in your Dance Registration Portal application. Unused schema fields have been identified and excluded.*
