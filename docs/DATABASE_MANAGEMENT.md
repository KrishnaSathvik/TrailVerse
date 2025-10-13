# Database Management Guide

This guide covers all database management tools and scripts available in the TrailVerse project.

## Overview

The database management system includes:
- **Backup & Restore**: Automated database backup and restore functionality
- **Migrations**: Schema change management system
- **Health Checks**: Comprehensive database health monitoring
- **Database Manager**: Unified command-line tool for all database operations

## Quick Start

### Database Manager (Recommended)
The easiest way to manage your database is using the unified database manager:

```bash
# Check database health
node scripts/db-manager.js health

# Create a backup
node scripts/db-manager.js backup

# Optimize database
node scripts/db-manager.js optimize

# Show help
node scripts/db-manager.js help
```

## Individual Tools

### 1. Backup & Restore

#### Creating Backups
```bash
# Create a new backup
node scripts/backup.js create

# List all backups
node scripts/backup.js list
```

#### Restoring from Backups
```bash
# Interactive restore (shows list of available backups)
node scripts/restore.js restore

# Restore from specific backup path
node scripts/restore.js restore /path/to/backup

# List available backups
node scripts/restore.js list
```

**Features:**
- Automatic timestamped backups
- Pre-restore backup creation (safety)
- Backup size and collection information
- Interactive restore selection
- Backup verification

### 2. Database Migrations

#### Creating Migrations
```bash
# Create a new migration
node scripts/migrate.js create add-user-preferences
```

#### Running Migrations
```bash
# Run all pending migrations
node scripts/migrate.js up

# Run specific migration
node scripts/migrate.js run 2024-01-01-add-user-preferences.js

# Check migration status
node scripts/migrate.js status
```

#### Rolling Back Migrations
```bash
# Rollback last migration
node scripts/migrate.js down

# Rollback specific migration
node scripts/migrate.js rollback 2024-01-01-add-user-preferences.js
```

**Features:**
- Migration tracking in database
- Up and down migration support
- Migration status tracking
- Automatic migration file generation

### 3. Health Checks

#### API Endpoints
```bash
# Basic health check
GET /health

# Detailed database health
GET /health/database

# Simple ping
GET /health/ping

# Readiness check (for Kubernetes)
GET /health/ready

# Liveness check (for Kubernetes)
GET /health/live
```

#### Health Check Features
- Database connection status
- Collection statistics
- Memory and CPU usage
- Response time monitoring
- Detailed database information
- Kubernetes-ready endpoints

### 4. Database Manager

The unified database manager provides access to all database operations:

```bash
# Available commands
node scripts/db-manager.js health     # Check database health
node scripts/db-manager.js optimize   # Optimize database
node scripts/db-manager.js clean      # Clean up test data
node scripts/db-manager.js stats      # Show detailed statistics
node scripts/db-manager.js backup     # Create backup
node scripts/db-manager.js restore    # Restore from backup
node scripts/db-manager.js migrate    # Run migrations
node scripts/db-manager.js seed       # Seed database
```

## Database Models

The system includes 8 comprehensive models:

### 1. User Model
- Authentication and authorization
- Email verification system
- Password reset functionality
- Park saving capabilities
- Role-based access control

### 2. TripPlan Model
- AI conversation tracking
- Form data storage
- Plan generation and storage
- Provider tracking (Claude/OpenAI)

### 3. Favorite Model
- Park favorites with notes
- Visit status tracking
- Rating system
- Tag support

### 4. Review Model
- Park reviews and ratings
- Helpful vote system
- Image support
- Visit date tracking

### 5. Event Model
- Park events and activities
- Registration system
- Capacity management
- Category classification

### 6. BlogPost Model
- SEO-friendly blog system
- Category and tag support
- Featured post system
- Read time calculation

### 7. Comment Model
- Blog comment system
- Like functionality
- Approval system

### 8. Testimonial Model
- User testimonials
- Approval and featuring system
- Verification system
- Source tracking

## Performance Features

### Indexing
All models include comprehensive indexing:
- Unique indexes for email fields
- Compound indexes for common queries
- Text indexes for search functionality
- Performance-optimized index strategies

### Validation
- Comprehensive field validation
- Data type checking
- Length and format validation
- Custom validation rules

### Security
- Password hashing with bcrypt
- JWT token management
- Field selection for security
- Input sanitization

## Environment Configuration

### Required Environment Variables
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/nomadiq

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Server
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000
```

### MongoDB Atlas Setup
For production, use MongoDB Atlas:
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/nomadiq?retryWrites=true&w=majority
```

## Monitoring & Maintenance

### Regular Maintenance Tasks
1. **Weekly**: Run database optimization
2. **Daily**: Check database health
3. **Before deployments**: Create backup
4. **Monthly**: Review and clean old data

### Monitoring Endpoints
- `/health` - Basic health check
- `/health/database` - Detailed database info
- `/health/ready` - Kubernetes readiness
- `/health/live` - Kubernetes liveness

### Backup Strategy
- Automated daily backups (recommended)
- Pre-deployment backups
- Pre-restore backups (automatic)
- Backup retention policy

## Troubleshooting

### Common Issues

#### Connection Problems
```bash
# Check database connection
node scripts/db-manager.js health

# Verify environment variables
echo $MONGODB_URI
```

#### Performance Issues
```bash
# Optimize database
node scripts/db-manager.js optimize

# Check database statistics
node scripts/db-manager.js stats
```

#### Migration Issues
```bash
# Check migration status
node scripts/migrate.js status

# Rollback problematic migration
node scripts/migrate.js rollback <migration-file>
```

### Recovery Procedures

#### From Backup
```bash
# List available backups
node scripts/restore.js list

# Restore from backup
node scripts/restore.js restore
```

#### Database Reset
```bash
# Drop and reseed database
node scripts/seed.js
```

## Security Considerations

### Database Security
- Use strong JWT secrets
- Implement proper authentication
- Regular security updates
- Monitor access logs

### Backup Security
- Encrypt backup files
- Secure backup storage
- Regular backup testing
- Access control for backups

## Production Deployment

### Pre-deployment Checklist
1. Create database backup
2. Run health checks
3. Test migrations (if any)
4. Verify environment variables
5. Check database connectivity

### Post-deployment Verification
1. Verify health endpoints
2. Check database statistics
3. Test critical operations
4. Monitor performance metrics

## Support

For database-related issues:
1. Check the health endpoints
2. Review database logs
3. Use the database manager tools
4. Consult this documentation

## Script Locations

All database management scripts are located in:
```
server/scripts/
├── backup.js          # Backup functionality
├── restore.js         # Restore functionality
├── migrate.js         # Migration system
├── seed.js           # Database seeding
├── makeAdmin.js      # Admin user creation
└── db-manager.js     # Unified database manager
```

## API Documentation

### Health Check Endpoints

#### GET /health
Basic health check with system information.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "state": "connected",
      "responseTime": 5
    },
    "memory": {
      "status": "healthy",
      "rss": 50,
      "heapTotal": 30,
      "heapUsed": 20
    }
  }
}
```

#### GET /health/database
Detailed database health information.

#### GET /health/ready
Kubernetes readiness probe endpoint.

#### GET /health/live
Kubernetes liveness probe endpoint.

This comprehensive database management system ensures your TrailVerse application has robust, scalable, and maintainable database operations.
