# Dance Registration Portal - Accurate Data Model Documentation

## A. Executive Summary

### Purpose and Scope
The Dance Registration Portal uses a PostgreSQL database (production) with SQLite for development. The data model supports a comprehensive dance class management system that handles student registration, payment processing, course scheduling, attendance tracking, and waitlist management.

### Key Business Entities
The system is built around **Students** who register for **Courses** through **Registrations**. Courses are flexibly scheduled using **Course Slots** with configurable **Pricing**. The system tracks **Attendance** through **Class Sessions** and manages **Waitlists** when courses are full. **Admin Users** manage the system through various administrative functions controlled by **System Settings**.

## B. Entity-Relationship Diagram (Accurate Fields Only)

### 📊 **[View Interactive Visual Diagram](data-model-diagram-accurate.html)**
*Click the link above to open the fully rendered ER diagram with only actually used fields.*

### Core Database Structure (Actually Used Fields)

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│      STUDENTS       │    │       COURSES       │    │    REGISTRATIONS    │
│ =================== │    │ =================== │    │ =================== │
│ • id (PK)          │    │ • id (PK)          │    │ • id (PK)          │
│ • first_name       │    │ • name             │    │ • student_id (FK)  │
│ • last_name        │    │ • description      │    │ • course_id (FK)   │
│ • email (unique)   │    │ • course_type      │    │ • payment_amount   │
│ • phone            │    │ • duration_weeks   │    │ • payment_status   │
│ • date_of_birth    │    │ • start_date       │    │ • paypal_transaction_id │
│ • emergency_contact│    │ • end_date         │    │ • payment_method   │
│   _name            │    │ • instructor       │    │ • special_requests │
│ • emergency_contact│    │ • schedule_info    │    │ • registration_date│
│   _phone           │    │ • prerequisites    │    │ • created_from_waitlist │
│ • medical_conditions│   │ • required_student │    │ • waitlist_notification │
│ • dance_experience │    │   _type            │    │   _sent_at         │
│ • instagram_handle │    │ • is_active        │    │ • canceled_at      │
│ • how_heard_about_us│   │ • created_at       │    │ • canceled_by (FK) │
│ • student_type     │    │ • updated_at       │    │ • cancellation_reason │
│ • profile_complete │    └─────────┬───────────┘    │ • updated_at       │
│ • admin_classified │              │                └─────────┬───────────┘
│ • created_at       │              │                          │
│ • updated_at       │              │ 1:many                  │
└─────────┬───────────┘              │ ┌────────────────────────┼──────────────────────────┘
          │                          │ │                        │
          │ 1:many                   │ │                        │ 1:many
          │ ┌────────────────────────┼─┼────────────────────────┘
          │ │                        │ │
          │ │                        │ │ 1:many
          │ │            ┌───────────▼─▼───────────┐
          │ │            │     COURSE_SLOTS        │
          │ │            │ ======================= │
          │ │            │ • id (PK)              │
          │ │            │ • course_id (FK)       │
          │ │            │ • slot_name            │
          │ │            │ • difficulty_level     │
          │ │            │ • capacity             │
          │ │            │ • day_of_week          │
          │ │            │ • practice_date        │
          │ │            │ • start_time           │
          │ │            │ • end_time             │
          │ │            │ • location             │
          │ │            │ • created_at           │
          │ │            └───────────┬─────────────┘
          │ │                        │ 1:many
          │ │            ┌───────────▼─────────────┐
          │ │            │   COURSE_PRICING        │
          │ │            │ ======================= │
          │ │            │ • id (PK)              │
          │ │            │ • course_slot_id (FK)  │
          │ │            │ • pricing_type         │
          │ │            │ • price                │
          │ │            │ • created_at           │
          │ │            └────────────────────────┘
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
│ • waitlist_position  │            │ • start_time         │
│ • notification_sent  │            │ • end_time           │
│ • notification_sent_at│            │ • location           │
│ • notification_expires│            │ • notes              │
│   _at                │            │ • created_at         │
│ • payment_link_token │            └───────────┬───────────┘
│ • status             │                        │ 1:many
│ • created_at         │          ┌─────────────▼─────────────┐
│ • updated_at         │          │    ATTENDANCE_RECORDS     │
└──────────────────────┘          │ ========================= │
                                  │ • id (PK)                │
┌─────────────────────┐           │ • session_id (FK)        │
│    ADMIN_USERS      │           │ • student_id (FK) ───────┼──┐
│ =================== │           │ • status                 │  │
│ • id (PK)          │           │   (present/absent/late)  │  │
│ • username (unique) │           │ • marked_at              │  │
│ • password_hash    │           │ • marked_by (FK to ADMIN)│  │
│ • email            │           └──────────────────────────┘  │
│ • last_login       │                                        │
│ • created_at       │           ┌─────────────────────┐      │
└─────────┬───────────┘           │  SYSTEM_SETTINGS    │      │
          │                       │ =================== │      │
          │                       │ • setting_key (PK)  │      │
          │                       │ • setting_value     │      │
          │                       │ • description       │      │
          │                       │ • updated_at        │      │
          │                       └─────────────────────┘      │
          │                                                    │
          └────────────────────────────────────────────────────┘
                              marks attendance

KEY: PK=Primary Key, FK=Foreign Key, 1:many=One-to-Many Relationship
```

## C. Actually Used Tables and Fields

### **STUDENTS** (User Management) - 17 Fields Used
- **Core Identity**: `id` (PK), `first_name`, `last_name`, `email` (unique)
- **Contact Info**: `phone`, `emergency_contact_name`, `emergency_contact_phone`
- **Profile Data**: `date_of_birth`, `medical_conditions`, `dance_experience`, `instagram_handle`, `how_heard_about_us`
- **Classification**: `student_type` (general/crew_member), `profile_complete`, `admin_classified`
- **Timestamps**: `created_at`, `updated_at`

### **COURSES** (Course Management) - 12 Fields Used
- **Core Info**: `id` (PK), `name`, `description`, `course_type`, `instructor`
- **Scheduling**: `duration_weeks`, `start_date`, `end_date`, `schedule_info`
- **Access Control**: `required_student_type`, `prerequisites`, `is_active`
- **Timestamps**: `created_at`, `updated_at`

### **REGISTRATIONS** (Enrollment & Payment) - 14 Fields Used
- **Core Links**: `id` (PK), `student_id` (FK), `course_id` (FK)
- **Payment**: `payment_amount`, `payment_status`, `paypal_transaction_id`, `payment_method`
- **Registration**: `special_requests`, `registration_date`
- **Waitlist Integration**: `created_from_waitlist`, `waitlist_notification_sent_at`
- **Cancellation Audit**: `canceled_at`, `canceled_by` (FK), `cancellation_reason`
- **Timestamps**: `updated_at`

### **COURSE_SLOTS** (Flexible Scheduling) - 10 Fields Used
- **Core Info**: `id` (PK), `course_id` (FK), `slot_name`, `difficulty_level`
- **Capacity**: `capacity`
- **Schedule**: `day_of_week`, `practice_date`, `start_time`, `end_time`, `location`
- **Timestamps**: `created_at`

### **COURSE_PRICING** (Pricing Configuration) - 5 Fields Used
- **Core Info**: `id` (PK), `course_slot_id` (FK)
- **Pricing**: `pricing_type` (full_package/drop_in), `price`
- **Timestamps**: `created_at`

### **CLASS_SESSIONS** (Attendance Management) - 7 Fields Used
- **Core Info**: `id` (PK), `course_id` (FK), `session_date`
- **Session Details**: `start_time`, `end_time`, `location`, `notes`
- **Timestamps**: `created_at`

### **ATTENDANCE_RECORDS** (Attendance Tracking) - 6 Fields Used
- **Core Info**: `id` (PK), `session_id` (FK), `student_id` (FK)
- **Attendance**: `status` (present/absent/late)
- **Audit**: `marked_at`, `marked_by` (FK to admin_users)

### **WAITLIST** (Capacity Management) - 10 Fields Used
- **Core Info**: `id` (PK), `student_id` (FK), `course_id` (FK)
- **Position**: `waitlist_position`, `status`
- **Notifications**: `notification_sent`, `notification_sent_at`, `notification_expires_at`, `payment_link_token`
- **Timestamps**: `created_at`, `updated_at`

### **ADMIN_USERS** (Authentication) - 6 Fields Used
- **Core Info**: `id` (PK), `username` (unique), `password_hash`
- **Profile**: `email`, `last_login`
- **Timestamps**: `created_at`

### **SYSTEM_SETTINGS** (Configuration) - 4 Fields Used
- **Core Info**: `setting_key` (PK), `setting_value`, `description`
- **Timestamps**: `updated_at`

## D. Data Flow Patterns

### **Student Registration Workflow**
1. **Profile Check**: Student email lookup in `STUDENTS` table using `email`, `student_type`, `profile_complete`
2. **Course Selection**: Available courses filtered by `required_student_type` vs `student_type` and `is_active`
3. **Capacity Check**: Sum of `COURSE_SLOTS.capacity` vs completed `REGISTRATIONS` where `payment_status = 'completed'`
4. **Registration Creation**: New record in `REGISTRATIONS` with `payment_status = 'pending'`
5. **Payment Processing**: Venmo/Zelle payment updates `payment_status`, `payment_method`, `paypal_transaction_id`
6. **Confirmation**: Email notification sent if `email_notifications_enabled` system setting is true

### **Payment Processing Flow**
1. **Payment Generation**: Venmo/Zelle links created using `payment_amount`, registration `id`, course `name`
2. **Admin Confirmation**: Updates `payment_status`, `payment_method`, `paypal_transaction_id` in `REGISTRATIONS`
3. **Email Notification**: Uses student `email`, `first_name`, `last_name` and course `name`, `schedule_info`
4. **Audit Trail**: All payment details stored in `REGISTRATIONS` table

### **Attendance Tracking Flow**
1. **Session Creation**: Admin creates `CLASS_SESSIONS` with `course_id`, `session_date`
2. **Roster Loading**: Students with `payment_status = 'completed'` loaded from `REGISTRATIONS` JOIN `STUDENTS`
3. **Attendance Marking**: Updates `ATTENDANCE_RECORDS` with `status`, `marked_by`, `marked_at`
4. **Completion Tracking**: Calculates present sessions vs total sessions per student

### **Waitlist Management Flow**
1. **Capacity Check**: When `COURSE_SLOTS.capacity` is reached for a course
2. **Waitlist Entry**: Student added to `WAITLIST` with `waitlist_position`, `status = 'active'`
3. **Notification**: Admin triggers notification, updates `notification_sent`, `payment_link_token`
4. **Priority Registration**: Token allows bypass of normal capacity limits

---

*This accurate data model reflects only the fields and relationships actually implemented and used in your Dance Registration Portal application.*
