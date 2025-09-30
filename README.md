# Dance Registration Portal

A comprehensive web application for managing dance class registrations, student profiles, waitlists, and payments. Built for GouMo Dance Chronicles and Dreamers Dance Crew.

## 🎯 Features

### Student Portal
- **Email-based Registration**: Students can register using just their email address
- **Course Discovery**: Browse available dance classes with pricing and schedule information
- **Profile Management**: Complete student profiles with dance experience and Instagram handles
- **Registration Status**: Track registration status and see which courses you're enrolled in
- **Waitlist System**: Join waitlists for full courses with automatic notifications
- **Payment Options**: Secure payments via Venmo and Zelle
- **Multi-class Registration**: Register for multiple courses seamlessly

### Admin Dashboard
- **Course Management**: Create, edit, and manage dance courses and slots
- **Student Classification**: Classify students as general, crew members, or test accounts
- **Registration Oversight**: View, confirm, and manage all registrations
- **Waitlist Management**: Monitor waitlists and notify students when spots open
- **Payment Tracking**: Confirm payments and send confirmation emails
- **Analytics**: View registration statistics and course performance
- **Email Notifications**: Automated confirmation and waitlist notification emails

### Technical Features
- **Responsive Design**: Mobile-friendly interface with Bootstrap styling
- **Database Flexibility**: Supports both SQLite (development) and PostgreSQL (production)
- **Email System**: SendGrid integration for automated notifications
- **Access Control**: Role-based access for different student types
- **Crew Practice Mode**: Special branding and features for crew practice sessions
- **Data Export**: CSV export functionality for registrations and waitlists

## 🏗️ Architecture

### Frontend
- **HTML/CSS/JavaScript**: Vanilla JavaScript with modern ES6+ features
- **Bootstrap 5**: Responsive UI framework
- **Dynamic UI**: Single-page application with dynamic content loading

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web application framework
- **SQLite/PostgreSQL**: Database with automatic migration
- **SendGrid**: Email service integration
- **Session Management**: Secure admin authentication

### Key Components
```
├── public/                 # Frontend assets
│   ├── js/
│   │   ├── registration.js           # Main student registration flow
│   │   ├── email-profile-registration.js # Email-based registration
│   │   └── admin.js                  # Admin dashboard functionality
│   ├── css/                # Styling
│   └── *.html             # HTML templates
├── server.js              # Main application server
├── database-config.js     # Database abstraction layer
├── utils/
│   ├── mailer.js         # Email notification system
│   └── schedule.js       # Schedule utilities
└── scripts/              # Database and maintenance scripts
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- SendGrid account (for email notifications)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/gouthamseattle/dance-registration-portal.git
   cd dance-registration-portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database (optional - defaults to SQLite)
   DATABASE_URL=sqlite:database.db
   
   # Email Configuration (SendGrid)
   SENDGRID_API_KEY=your_sendgrid_api_key
   FROM_EMAIL=your_from_email@domain.com
   
   # Session Security
   SESSION_SECRET=your_secure_session_secret
   
   # Server Configuration
   NODE_ENV=development
   PORT=3000
   ```

4. **Initialize the database**
   ```bash
   npm run setup
   ```

5. **Start the development server**
   ```bash
   npm start
   ```

6. **Access the application**
   - Student Portal: http://localhost:3000
   - Admin Dashboard: http://localhost:3000/admin

### Default Admin Account
- **Username**: admin
- **Password**: admin123 (change immediately after first login)

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | Database connection string | `sqlite:database.db` | No |
| `SENDGRID_API_KEY` | SendGrid API key for emails | - | Yes* |
| `FROM_EMAIL` | Sender email address | - | Yes* |
| `SESSION_SECRET` | Session encryption key | Auto-generated | No |
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment mode | `development` | No |

*Required for email functionality

### Database Configuration

The application automatically handles database setup and migrations:
- **Development**: Uses SQLite by default
- **Production**: Automatically migrates to PostgreSQL when `DATABASE_URL` is provided
- **Schema Updates**: Automatic migration system handles database updates

## 📚 API Documentation

### Public Endpoints

#### Courses
- `GET /api/courses?active_only=true` - Get active courses
- `GET /api/courses?active_only=true&student_email=email` - Get courses with registration status

#### Registration
- `POST /api/register` - Create new registration
- `POST /api/waitlist` - Join course waitlist

#### Student Profiles
- `POST /api/check-student-profile` - Check if student exists and get eligible courses
- `POST /api/create-student-profile` - Create new student profile
- `POST /api/update-student-profile` - Update existing student profile

#### Payments
- `POST /api/generate-venmo-link` - Generate Venmo payment link
- `POST /api/generate-zelle-payment` - Get Zelle payment details

### Admin Endpoints (Authentication Required)

#### Course Management
- `GET /api/admin/registrations` - Get all registrations
- `PUT /api/admin/registrations/:id/confirm-payment` - Confirm payment
- `PUT /api/admin/registrations/:id/cancel` - Cancel registration

#### Student Management
- `GET /api/admin/students/pending` - Get students pending classification
- `PUT /api/admin/students/:id/classify` - Classify student type

#### Waitlist Management
- `GET /api/admin/waitlists` - Get all waitlists
- `POST /api/admin/waitlists/notify` - Notify selected waitlist students
- `POST /api/admin/waitlists/remove` - Remove students from waitlists

## 🚀 Deployment

### Railway Deployment (Recommended)

1. **Connect to Railway**
   ```bash
   railway login
   railway link [project-id]
   ```

2. **Set environment variables**
   ```bash
   railway variables set SENDGRID_API_KEY=your_key
   railway variables set FROM_EMAIL=your_email
   railway variables set NODE_ENV=production
   ```

3. **Deploy**
   ```bash
   railway up
   ```

### Manual Deployment

1. **Build the application**
   ```bash
   npm install --production
   ```

2. **Set up environment variables**
   - Configure all required environment variables
   - Ensure `NODE_ENV=production`

3. **Run the application**
   ```bash
   npm start
   ```

## 📖 Usage Guide

### For Students

1. **Registration Process**:
   - Visit the student portal
   - Enter your email address
   - Complete your profile (if new student)
   - Select a course and payment option
   - Complete payment via Venmo or Zelle

2. **Profile Management**:
   - Update your dance experience and Instagram handle
   - View your registration history
   - Access course materials and information

### For Administrators

1. **Course Management**:
   - Create new courses with multiple difficulty levels
   - Set pricing for full packages and drop-in classes
   - Manage course capacity and schedules

2. **Student Classification**:
   - Review new student profiles
   - Classify students as general or crew members
   - Manage access to crew-only courses

3. **Registration Management**:
   - Confirm payments from Venmo/Zelle
   - Cancel registrations when needed
   - Send confirmation emails

4. **Waitlist Management**:
   - Monitor course waitlists
   - Notify students when spots become available
   - Manage waitlist positions

## 🔐 Security Features

- **Session Management**: Secure admin authentication
- **CSRF Protection**: Built-in request validation
- **Access Control**: Role-based course access
- **Data Validation**: Server-side input validation
- **Email Verification**: Email-based student verification

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style and patterns
- Test your changes thoroughly
- Update documentation as needed
- Ensure database migrations are backward compatible

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Contact the development team
- Review the documentation in the `/docs` folder

## 🔄 Recent Updates

- ✅ Fixed "Register Another Class" functionality
- ✅ Added registration status tracking
- ✅ Implemented comprehensive waitlist system
- ✅ Enhanced student profile management
- ✅ Improved admin dashboard features
- ✅ Added email notification system

## 🧰 Built With

- [Node.js](https://nodejs.org/) - JavaScript runtime
- [Express.js](https://expressjs.com/) - Web framework
- [SQLite](https://www.sqlite.org/) / [PostgreSQL](https://www.postgresql.org/) - Database
- [Bootstrap 5](https://getbootstrap.com/) - CSS framework
- [SendGrid](https://sendgrid.com/) - Email service
- [Railway](https://railway.app/) - Deployment platform

---

Made with ❤️ for the dance community by GouMo Dance Chronicles
