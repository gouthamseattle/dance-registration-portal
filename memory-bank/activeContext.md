# Active Context - Dance Registration Portal

## Current Work Focus

### Recently Completed (Current Session)
- ✅ Start Date made optional in New Dance Series form (frontend label updated to "Start Date (optional)")
- ✅ Verified backend accepts NULL start_date values (server and DB schema already allow NULL)
- ✅ Schedule Information and Prerequisites removed as required fields in admin form and JS payload
- ✅ Slot-based course architecture implemented (multi-slot support with per-slot capacity and pricing)

### Current Status
- Project State: Fully functional dance registration portal
- Deployment: Live on Railway (auto-deploy from GitHub)
- Database: PostgreSQL in production, SQLite for local development
- Admin Access: admin / admin123
- Payments: PayPal integration functional
- UI: Bootstrap-based admin dashboard with dynamic slot management

## Active Decisions and Considerations

### Technical Decisions Made
1. Database Strategy: Dual DB support via DatabaseConfig (SQLite dev, PostgreSQL prod)
2. Session Security: secure=false for Railway proxy compatibility; httpOnly + sameSite=lax
3. Validation: Server-side validation; client-side ID mapping explicit
4. Migration Strategy: Automatic migration on production with bcrypt hash regeneration
5. Course Creation:
   - Slot-based model replaces legacy single-course fields for capacity/pricing
   - Crew Practice limited to a single slot; Dance Series/Drop In can have multiple slots
   - Start Date is optional for all series types
   - Schedule Information and Prerequisites are non-required metadata (safe to omit)

### Current Architecture Patterns
- Slot-Based Courses:
  - Tables: course_slots (difficulty_level, capacity, timing, location), course_pricing (full_package, drop_in)
  - Per-slot pricing and capacity; total capacity computed as sum of slot capacities
- Database Abstraction: DatabaseConfig with `run/get/all` and isProduction branching
- Error Handling: asyncHandler wrapper for all async routes
- Auth: Session-based admin auth with bcrypt password hashing
- Frontend: Vanilla JS admin dashboard; Bootstrap modals; dynamic slot cards

## Important Patterns and Preferences

### Code Organization Preferences
- Minimal dependencies; no frontend framework
- Single-repo, self-contained application
- Environment-agnostic code paths for dev/prod
- Mobile-first UI considerations

### Development Workflow Patterns
```bash
npm run dev
git add .
git commit -m "..."
git push origin main   # triggers Railway deployment
# Optionally: railway logs (if CLI authed) to monitor deploy
```

### Database Patterns
```javascript
const result = await dbConfig.run(query, params);
const data = await dbConfig.get(query, params);
const list = await dbConfig.all(query, params);

if (dbConfig.isProduction) {
  // PostgreSQL specifics
} else {
  // SQLite specifics
}
```

## Learnings and Project Insights

### Key Technical Insights
1. Railway proxies require session cookies with secure=false
2. Form field IDs must exactly match JS selectors
3. Bcrypt hashes must be regenerated during migration
4. PayPal Client ID via system settings improves operational flexibility
5. Legacy course fields should not be treated as required under slot model

### User Experience Insights
1. Mobile optimization and WhatsApp sharing are primary channels
2. Admin course creation must be streamlined; dynamic slots improve UX
3. Guest checkout preferred; keep PayPal UX minimal
4. Capacity and availability should reflect slot-level reality

### Performance Insights
1. Aggregations for registration counts are acceptable for current scale
2. Session timeout 24h strikes reasonable balance
3. Static asset serving from Express is fine for current footprint
4. Vanilla JS remains performant and lightweight

## Next Steps and Priorities

### Immediate Tasks
- Deploy "Start Date optional" change to Railway
- Validate course creation without start_date in production
- Update memory bank progress to reflect deployment outcome

### Short-term Enhancements
- QR code generation exposed in UI
- CSV export connected to admin actions
- WhatsApp message templates for sharing

### Medium-term Features
- Email notifications and templates in registration flow
- Recurring classes scheduling UX
- Student dashboard and receipt generation

### Long-term Considerations
- Multi-instructor support
- Advanced reporting and analytics
- Calendar integrations
- Mobile app exploration

## Development Environment Notes

- Local DB: ./database/registrations.db (SQLite)
- Production DB: PostgreSQL via DATABASE_URL
- Admin: admin/admin123 (set during migration)
- PayPal: Sandbox/production controlled via settings
- Port: 3000 (configurable)

## Testing Patterns
```bash
# Local
npm start
open http://localhost:3000
open http://localhost:3000/admin

# Production
open https://dance-registration-portal-production.up.railway.app
```

## Memory Bank Integration
- Status: Active and updated (this session)
- This update documents: Slot-based architecture, form field simplifications, and Start Date now optional
- Keep activeContext.md and progress.md synchronized with deployment changes
