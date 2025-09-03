# Active Context - Dance Registration Portal

## Current Work Focus

### Recently Completed (Last Session)
- ✅ **Memory Bank Setup**: Implementing Cline Memory Bank system for project continuity
- ✅ **Production Deployment**: Successfully deployed to Railway with PostgreSQL
- ✅ **PayPal Integration**: Fixed PayPal SDK configuration and payment processing
- ✅ **Admin Authentication**: Resolved session management issues for Railway deployment
- ✅ **Course Management**: Enhanced admin course creation with advanced form features
- ✅ **Database Migration**: Automated SQLite to PostgreSQL migration working

### Current Status
- **Project State**: Fully functional dance registration portal
- **Deployment**: Live on Railway at GouMo-Dance-Portal
- **Database**: PostgreSQL in production, SQLite for development
- **Admin Access**: Working with username: admin, password: admin123
- **Payment Processing**: PayPal integration functional
- **Memory Bank**: Currently being established for future development continuity

## Active Decisions and Considerations

### Technical Decisions Made
1. **Database Strategy**: Dual database support (SQLite dev, PostgreSQL prod) via DatabaseConfig abstraction
2. **Session Security**: Disabled secure cookies for Railway compatibility while maintaining httpOnly and sameSite
3. **Form Validation**: Server-side validation with client-side field mapping fixes
4. **Migration Strategy**: Automatic migration on production deployment with bcrypt password refresh

### Current Architecture Patterns
- **Database Abstraction**: Single DatabaseConfig class handles both SQLite and PostgreSQL
- **Error Handling**: Consistent asyncHandler pattern for all async routes
- **Authentication**: Session-based admin auth with bcrypt password hashing
- **Payment Flow**: PayPal SDK → Registration → Payment Confirmation → Database Update

## Important Patterns and Preferences

### Code Organization Preferences
- **Minimal Dependencies**: Vanilla JavaScript frontend, no frameworks
- **Self-Contained**: All functionality in single repository
- **Environment Agnostic**: Code works in both development and production without changes
- **Mobile-First**: All UI decisions prioritize mobile experience

### Development Workflow Patterns
```bash
# Standard development cycle
npm run dev                    # Local development with auto-restart
git add . && git commit -m ""  # Commit changes
git push origin main           # Auto-deploy to Railway
railway logs                   # Monitor deployment
```

### Database Patterns
```javascript
// Consistent query pattern
const result = await dbConfig.run(query, params);
const data = await dbConfig.get(query, params);
const list = await dbConfig.all(query, params);

// Production vs Development handling
if (dbConfig.isProduction) {
    // PostgreSQL specific syntax
} else {
    // SQLite specific syntax
}
```

## Learnings and Project Insights

### Key Technical Insights
1. **Railway Deployment**: Session cookies must have `secure: false` for Railway's proxy setup
2. **Form Field Mapping**: HTML form field IDs must exactly match JavaScript getElementById calls
3. **Database Migration**: bcrypt hashes must be regenerated during migration, not copied
4. **PayPal Integration**: Client ID configuration through system settings works better than environment variables

### User Experience Insights
1. **Mobile Optimization**: WhatsApp sharing is primary distribution method
2. **Admin Workflow**: Course creation should be streamlined with auto-populated fields
3. **Payment Flow**: Students prefer not creating PayPal accounts - guest checkout essential
4. **Real-time Updates**: Capacity tracking must be immediate to prevent overbooking

### Performance Insights
1. **Database Queries**: JOIN queries for registration counts are efficient enough for expected load
2. **Session Management**: 24-hour session timeout balances security and usability
3. **Static Files**: Express static middleware sufficient for current asset size
4. **Mobile Performance**: Vanilla JavaScript loads faster than framework alternatives

## Next Steps and Priorities

### Immediate Tasks (Current Session)
- [ ] Complete memory bank file creation (progress.md remaining)
- [ ] Verify memory bank structure and content
- [ ] Test memory bank integration with Cline workflow

### Short-term Enhancements
- [ ] Add QR code generation for course sharing
- [ ] Implement bulk email functionality for student communication
- [ ] Add CSV export for student lists
- [ ] Create WhatsApp message templates

### Medium-term Features
- [ ] Email notification system for registration confirmations
- [ ] Advanced course scheduling (recurring classes)
- [ ] Student dashboard for registration history
- [ ] Payment receipt generation

### Long-term Considerations
- [ ] Multi-instructor support
- [ ] Advanced reporting and analytics
- [ ] Integration with calendar systems
- [ ] Mobile app development

## Development Environment Notes

### Current Setup
- **Local Database**: SQLite at `./database/registrations.db`
- **Production Database**: PostgreSQL via Railway DATABASE_URL
- **Admin Credentials**: admin/admin123 (configured in migration)
- **PayPal**: Sandbox mode for testing, production client ID configurable
- **Port**: 3000 (configurable via PORT environment variable)

### Known Issues and Workarounds
1. **Railway Session Issues**: Resolved by setting `secure: false` in session config
2. **Form Field Validation**: Fixed by using getElementById instead of FormData
3. **Database Migration**: Automated with proper bcrypt hash generation
4. **PayPal SDK Loading**: Requires valid client ID, empty string causes 400 error

### Testing Patterns
```bash
# Local testing
npm start
open http://localhost:3000
open http://localhost:3000/admin

# Network testing (same WiFi)
open http://10.0.0.24:3000

# Production testing
open https://dance-registration-portal-production.up.railway.app
```

## Memory Bank Integration

### Current Memory Bank Status
- **Setup Phase**: Currently implementing memory bank structure
- **Files Created**: projectbrief.md, productContext.md, systemPatterns.md, techContext.md
- **Remaining**: activeContext.md (this file), progress.md
- **Integration**: Will enable seamless context preservation across Cline sessions

### Memory Bank Usage Pattern
```
1. Start new Cline session
2. "follow your custom instructions" - loads memory bank
3. Cline reads all memory bank files for context
4. Continue development with full project understanding
5. "update memory bank" when significant changes made
