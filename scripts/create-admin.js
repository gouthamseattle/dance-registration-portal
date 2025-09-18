const bcrypt = require('bcryptjs');
const DatabaseConfig = require('../database-config');

async function createAdmin() {
    console.log('🔐 Creating admin user...');
    
    // Use the same database configuration as the main server
    const dbConfig = new DatabaseConfig();
    let db = null;
    
    try {
        db = await dbConfig.connect();
        console.log('✅ Connected to database');
        
        // Ensure admin_users table exists with correct schema
        if (dbConfig.isProduction) {
            // PostgreSQL
            await dbConfig.run(`
                CREATE TABLE IF NOT EXISTS admin_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    email VARCHAR(100),
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP
                )
            `);
        } else {
            // SQLite - Drop and recreate to ensure correct schema
            await dbConfig.run(`DROP TABLE IF EXISTS admin_users`);
            await dbConfig.run(`
                CREATE TABLE admin_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    email TEXT,
                    is_active INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_login DATETIME
                )
            `);
        }
        
        // Hash the password
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Check if admin user already exists
        const existingAdmin = await dbConfig.get('SELECT id FROM admin_users WHERE username = $1', ['admin']);
        
        if (existingAdmin) {
            // Update existing admin user
            await dbConfig.run(`
                UPDATE admin_users SET 
                    password_hash = $1,
                    email = $2,
                    is_active = $3
                WHERE username = $4
            `, [hashedPassword, 'admin@dancestudio.com', dbConfig.isProduction ? true : 1, 'admin']);
            console.log('✅ Admin user updated successfully');
        } else {
            // Insert new admin user
            await dbConfig.run(`
                INSERT INTO admin_users (username, password_hash, email, is_active) 
                VALUES ($1, $2, $3, $4)
            `, ['admin', hashedPassword, 'admin@dancestudio.com', dbConfig.isProduction ? true : 1]);
            console.log('✅ Admin user created successfully');
        }
        
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change this password after first login!');
        
    } catch (error) {
        console.error('❌ Failed to create admin user:', error);
        throw error;
    } finally {
        if (dbConfig) {
            await dbConfig.close();
        }
    }
}

// Run if called directly
if (require.main === module) {
    createAdmin().catch(console.error);
}

module.exports = { createAdmin };
