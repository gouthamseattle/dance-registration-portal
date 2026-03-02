# Archived Scripts

This directory contains one-time scripts that have already been executed in production. They are kept here for historical reference and documentation purposes.

## 📜 Script Inventory

### `setup-january-2026-session.js`
**Purpose**: One-time setup for the January 2026 dance session  
**Executed**: January 2026  
**What it did**:
- Created Level 1 and Level 2 House course series
- Set up 4-week schedule (Jan 6, 13, 20, 27)
- Created Friday crew practice sessions
- Generated drop-in classes for weeks 1-3
- Configured pricing and capacity for all courses

**Status**: ✅ Completed - Session is now live in production

---

### `setup-combo-packages.js`
**Purpose**: One-time setup for combo package offerings  
**Executed**: January 2026  
**What it did**:
- Created "Level 1 + 2 Combo Package" ($150)
- Created "Crew + House Unlimited Package" ($200)
- Created "Triple Threat Package" ($220)
- Configured multi-class access and bundled pricing

**Status**: ✅ Completed - Packages are now available

---

### `migrate-slots-schema.js`
**Purpose**: Database migration to add `practice_date` column  
**Executed**: During schema evolution  
**What it did**:
- Added `practice_date` column to `course_slots` table
- Migrated existing crew practice data to use practice dates
- Updated queries to use new date-specific scheduling

**Status**: ✅ Completed - Schema is updated in production

---

### `fix-course-access.js`
**Purpose**: One-time fix for course access control issues  
**Executed**: During access control rollout  
**What it did**:
- Updated `required_student_type` for all courses
- Set crew practice courses to crew_member only
- Set house/drop-in courses to be available to all
- Fixed visibility issues in student portal

**Status**: ✅ Completed - Access control is working correctly

---

### `fix-production-access.js`
**Purpose**: Production hotfix for student access issues  
**Executed**: During production troubleshooting  
**What it did**:
- Applied emergency fixes to production database
- Corrected course visibility for general students
- Updated access control rules

**Status**: ✅ Completed - Production issue resolved

---

### `apply-production-access-fix.js`
**Purpose**: Batch update to apply access control fixes  
**Executed**: After access control system implementation  
**What it did**:
- Batch updated course access settings
- Ensured consistent access rules across all courses
- Verified changes with production data

**Status**: ✅ Completed - All courses have correct access settings

---

## 🚫 Do Not Re-run

These scripts were designed for one-time execution and should **not** be run again, as they:
- Would create duplicate data
- Expect specific database states that no longer exist
- Have been superseded by the normal course creation workflow

## 📚 Historical Reference

These scripts are kept for:
- Understanding how the current data structure was created
- Debugging historical issues
- Learning patterns for future one-time migrations
- Audit trail and documentation

## ✅ Current Process

For new sessions and courses, use:
- Admin dashboard course creation UI
- `/api/admin/courses` API endpoints
- Manual SQL if needed (with proper backups)

---

**Archive Date**: March 1, 2026  
**Archived By**: System modularization project
