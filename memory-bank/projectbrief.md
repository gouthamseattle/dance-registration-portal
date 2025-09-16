# Dance Registration Portal - Project Brief

## Project Overview
A comprehensive, self-hosted web portal for dance class registration with PayPal/Venmo integration, designed for dance instructors to manage course registrations, payments, and attendance efficiently.

## Core Purpose
Enable dance instructors to:
- Create and manage dance courses (multi-week series and drop-in classes)
- Accept registrations with secure payment processing
- Monitor registrations in real time
- Communicate with students
- Export student data for class management
- Record per-session attendance for classes

## Key Features
- Mobile-First Design: Optimized for WhatsApp sharing and mobile registration
- Flexible Course Management: Slot-based schedule, per-slot pricing, multi-week series, and drop-ins
- Payments:
  - PayPal SDK support
  - Venmo link/QR handoff for mobile-first payments
- Real-Time Monitoring: Live registration counts and capacity tracking
- Attendance Management:
  - Manage Attendance modal with sessions on the left and student roster on the right
  - Paid-only roster filter for accurate in-class lists
  - Suggested session dates generated from course metadata (one-click creation)
  - Individual Present/Late/Absent radios per student and bulk actions
  - Bulk upsert of attendance records; persisted sessions prioritized above suggested dates
- Data Export: CSV export for registrations (filter-aware); planned: attendance exports
- Admin Dashboard: Comprehensive tools for course, student, and settings management
- Zero Hosting Cost Option: Runs locally with optional public access via ngrok; production via Railway

## Target Users
- Primary: Dance instructors managing class registrations and attendance
- Secondary: Students registering for dance classes via mobile devices

## Technical Stack
- Backend: Node.js with Express
- Database: SQLite (development) / PostgreSQL (production)
- Frontend: Vanilla HTML/CSS/JavaScript
- Payments: PayPal SDK, Venmo deep-link/QR
- Deployment: Railway (production), local hosting (development)

## Success Criteria
- Mobile-responsive registration process
- Secure payment processing with 99% success rate
- Real-time capacity management
- Easy course creation and management
- Professional email notifications
- Data export capabilities
- Attendance marking: under 60 seconds to mark 20 students using bulk + individual controls
- Roster fidelity: 100% paid-only attendees shown in Manage Attendance by default

## Current Status
- ✅ Core functionality implemented
- ✅ PayPal/Venmo payment flows supported (admin approval triggers confirmation email)
- ✅ Admin dashboard functional
- ✅ Production deployment on Railway with cache-busting for assets
- ✅ Attendance (Phase 3) core shipped:
  - Paid-only roster, individual Present/Late/Absent radios, bulk actions
  - Suggested session dates derived from course metadata; one-click session creation and auto-selection
  - Visibility hardened for white backgrounds and dark mode (larger radios, gridlines, column tint)
- 🔜 Next: Attendance summary/export, improved auto-select to nearest upcoming or most recent session, mobile ergonomics for in-class marking
