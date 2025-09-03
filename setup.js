const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Create database directory if it doesn't exist
const dbDir = path.dirname(process.env.DATABASE_PATH || './database/registrations.db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(process.env.DATABASE_PATH || './database/registrations.db');

console.log('🚀 Setting up Dance Registration Portal Database...\n');

// Create all necessary tables
db.serialize(() => {
    // Admin users table
    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
    )`);


    // Courses table
    db.run(`CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        course_type TEXT NOT NULL CHECK(course_type IN ('multi-week', 'drop-in')),
        duration_weeks INTEGER,
        level TEXT CHECK(level IN ('Beginner', 'Intermediate', 'Advanced', 'All Levels')),
        capacity INTEGER NOT NULL DEFAULT 30,
        full_course_price DECIMAL(10,2),
        per_class_price DECIMAL(10,2),
        schedule_info TEXT,
        prerequisites TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Drop-in classes table (for specific class instances)
    db.run(`CREATE TABLE IF NOT EXISTS drop_in_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        class_date DATE NOT NULL,
        class_time TIME NOT NULL,
        instructor TEXT,
        capacity INTEGER NOT NULL DEFAULT 30,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses (id)
    )`);

    // Students table
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        instagram_id TEXT,
        dance_experience TEXT,
        phone TEXT,
        first_name TEXT,
        last_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Registrations table
    db.run(`CREATE TABLE IF NOT EXISTS registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        course_id INTEGER,
        drop_in_class_id INTEGER,
        registration_type TEXT NOT NULL CHECK(registration_type IN ('full-course', 'per-class', 'drop-in')),
        payment_status TEXT DEFAULT 'pending' CHECK(payment_status IN ('pending', 'completed', 'failed', 'refunded')),
        payment_amount DECIMAL(10,2) NOT NULL,
        payment_method TEXT,
        paypal_transaction_id TEXT,
        paypal_order_id TEXT,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmation_sent BOOLEAN DEFAULT 0,
        notes TEXT,
        FOREIGN KEY (student_id) REFERENCES students (id),
        FOREIGN KEY (course_id) REFERENCES courses (id),
        FOREIGN KEY (drop_in_class_id) REFERENCES drop_in_classes (id)
    )`);

    // Email templates table
    db.run(`CREATE TABLE IF NOT EXISTS email_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        template_type TEXT NOT NULL CHECK(template_type IN ('registration_confirmation', 'payment_confirmation', 'course_update', 'reminder', 'custom')),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // System settings table
    db.run(`CREATE TABLE IF NOT EXISTS system_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Email logs table
    db.run(`CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        template_name TEXT,
        status TEXT DEFAULT 'sent' CHECK(status IN ('sent', 'failed', 'pending')),
        error_message TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_registrations_student_id ON registrations(student_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_registrations_course_id ON registrations(course_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_students_email ON students(email)`);

    console.log('✅ Database tables created successfully');

    // Insert default admin user
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const saltRounds = 10;
    
    bcrypt.hash(defaultPassword, saltRounds, (err, hash) => {
        if (err) {
            console.error('❌ Error hashing password:', err);
            return;
        }

        db.run(`INSERT OR IGNORE INTO admin_users (username, password_hash, email) VALUES (?, ?, ?)`,
            [process.env.ADMIN_USERNAME || 'admin', hash, process.env.EMAIL_USER || 'admin@example.com'],
            function(err) {
                if (err) {
                    console.error('❌ Error creating admin user:', err);
                } else if (this.changes > 0) {
                    console.log('✅ Default admin user created');
                    console.log(`   Username: ${process.env.ADMIN_USERNAME || 'admin'}`);
                    console.log(`   Password: ${defaultPassword}`);
                    console.log('   ⚠️  Please change the default password after first login!');
                } else {
                    console.log('ℹ️  Admin user already exists');
                }
                checkCompletion();
            }
        );
    });

    // Insert default email templates
    const defaultTemplates = [
        {
            name: 'registration_confirmation',
            subject: 'Registration Confirmation - {{courseName}}',
            body: `Dear {{studentName}},

Thank you for registering for {{courseName}}!

Registration Details:
- Course: {{courseName}}
- Duration: {{courseDuration}}
- Schedule: {{courseSchedule}}
- Payment Amount: $\{{paymentAmount}}
- Registration ID: {{registrationId}}

{{#if courseDescription}}
Course Description:
{{courseDescription}}
{{/if}}

We're excited to have you join us! If you have any questions, please don't hesitate to reach out.

Best regards,
Dance Class Registration Team`,
            template_type: 'registration_confirmation'
        },
        {
            name: 'payment_confirmation',
            subject: 'Payment Confirmed - {{courseName}}',
            body: `Dear {{studentName}},

Your payment has been successfully processed!

Payment Details:
- Amount: $\{{paymentAmount}}
- Transaction ID: {{transactionId}}
- Course: {{courseName}}
- Payment Date: {{paymentDate}}

Your spot in the class is now confirmed. We look forward to seeing you!

Best regards,
Dance Class Registration Team`,
            template_type: 'payment_confirmation'
        },
        {
            name: 'course_reminder',
            subject: 'Class Reminder - {{courseName}}',
            body: `Dear {{studentName}},

This is a friendly reminder about your upcoming dance class:

Class Details:
- Course: {{courseName}}
- Date: {{classDate}}
- Time: {{classTime}}
- Location: {{location}}

Please arrive 10 minutes early. Don't forget to bring comfortable clothes and water!

See you soon!
Dance Class Registration Team`,
            template_type: 'reminder'
        }
    ];

    defaultTemplates.forEach(template => {
        db.run(`INSERT OR IGNORE INTO email_templates (name, subject, body, template_type) VALUES (?, ?, ?, ?)`,
            [template.name, template.subject, template.body, template.template_type],
            function(err) {
                if (err) {
                    console.error(`❌ Error creating template ${template.name}:`, err);
                } else if (this.changes > 0) {
                    console.log(`✅ Email template '${template.name}' created`);
                }
            }
        );
    });

    // Insert default system settings
    const defaultSettings = [
        { key: 'registration_open', value: 'false', description: 'Global registration status' },
        { key: 'app_name', value: process.env.APP_NAME || 'Dance Class Registration Portal', description: 'Application name' },
        { key: 'currency', value: process.env.CURRENCY || 'USD', description: 'Default currency' },
        { key: 'max_registrations_per_student', value: '5', description: 'Maximum courses a student can register for' },
        { key: 'allow_same_day_dropins', value: 'true', description: 'Allow same-day drop-in registrations' },
        { key: 'email_notifications_enabled', value: 'true', description: 'Enable automatic email notifications' },
        { key: 'paypal_client_id', value: process.env.PAYPAL_CLIENT_ID || '', description: 'PayPal Client ID for payment processing' }
    ];

    defaultSettings.forEach(setting => {
        db.run(`INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)`,
            [setting.key, setting.value, setting.description],
            function(err) {
                if (err) {
                    console.error(`❌ Error creating setting ${setting.key}:`, err);
                } else if (this.changes > 0) {
                    console.log(`✅ System setting '${setting.key}' created`);
                }
            }
        );
    });

    // Close database after all async operations complete
    let completedOperations = 0;
    const totalOperations = 1; // Only admin user creation is async

    function checkCompletion() {
        completedOperations++;
        if (completedOperations >= totalOperations) {
            console.log('\n🎉 Database setup completed successfully!');
            console.log('\nNext steps:');
            console.log('1. Copy .env.example to .env and update with your configuration');
            console.log('2. Run "npm install" to install dependencies');
            console.log('3. Run "npm start" to start the server');
            console.log('\n📖 Check the README.md for detailed setup instructions');

            db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err);
                } else {
                    console.log('✅ Database connection closed');
                }
            });
        }
    }
});
