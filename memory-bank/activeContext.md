# Active Context

## Current Focus: Code Modularization (In Progress)

### Recent Changes (March 1, 2026)
- ✅ Created modular code structure with separate directories
- ✅ Extracted database initialization to `database/initialize.js`
- ✅ Extracted auth middleware to `middleware/auth.js`
- ✅ Extracted course availability logic to `utils/courseAvailability.js`
- ✅ Created placeholder `routes/index.js` for route modularization
- ✅ Archived one-time scripts to `scripts/archive/` with documentation
- ⏳ Server.js still needs to import and use new modules

### Key Files Modified
- `database/initialize.js` - Database setup and migrations
- `middleware/auth.js` - Authentication helpers (asyncHandler, requireAuth)
- `utils/courseAvailability.js` - Course capacity calculation logic
- `routes/index.js` - Placeholder for extracted routes
- `scripts/archive/` - Historical one-time scripts with README

### Next Steps
1. **Complete route extraction**: Update server.js to import from routes/index.js
2. **Test locally**: Ensure all endpoints work with modular structure
3. **Deploy to Railway**: Test in production environment
4. **Update documentation**: Document new code organization

## Active Decisions

### Code Organization Strategy
- **Separation of Concerns**: Breaking monolithic server.js into focused modules
- **Backward Compatibility**: Maintaining all existing API endpoints
- **Incremental Migration**: Creating modules first, then updating imports
- **Testing First**: Local validation before production deployment

### Testing Approach
- Deploy-first for production validation (per .clinerules)
- User validates functionality in deployed environment
- No local browser testing required

## Important Patterns

### Module Structure
```
database/
  initialize.js     # DB setup, migrations, schema updates
middleware/
  auth.js          # asyncHandler, requireAuth helpers
utils/
  courseAvailability.js  # Capacity calculation logic
  mailer.js        # Email utilities (existing)
  schedule.js      # Schedule helpers (existing)
routes/
  index.js         # Route handlers (to be completed)
scripts/
  archive/         # One-time historical scripts
    README.md      # Documentation of archived scripts
```

### Database Initialization Pattern
- Centralized in `database/initialize.js`
- Exported function called from server.js
- Handles schema migrations and table creation
- Database-agnostic (SQLite/PostgreSQL compatible)

### Middleware Pattern
- Reusable auth functions in dedicated module
- asyncHandler wraps async route handlers
- requireAuth validates admin session

### Utility Pattern
- Course availability logic isolated in utils
- Accepts dbConfig as parameter for testability
- Handles different course types (choreography vs others)

## Current System State

### Codebase Organization
- **Before**: 6000+ line monolithic server.js
- **After**: Modular structure with focused files
- **Status**: Modules created, server.js integration pending

### Recent Learnings
1. **File Size Challenge**: 6000+ line server.js requires careful refactoring
2. **Incremental Approach**: Create modules first, update imports second
3. **Git Strategy**: Commit modular structure before integration
4. **Documentation Value**: Archive README prevents confusion about old scripts

### Known Considerations
- Routes are placeholder - full extraction requires careful SEARCH/REPLACE
- Server.js needs import updates (too large for single operation)
- All existing endpoints must continue to work
- Production deployment will validate integration

## Memory Bank Updates Needed
- ✅ activeContext.md - Current work documented
- ✅ systemPatterns.md - Architecture patterns updated
- ✅ progress.md - Status tracking updated
- ⏳ Complete after route extraction finished
