const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    console.log('🔐 Creating admin user...');
    
    // Connect to PostgreSQL
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    });
    
    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL');
        
        // Hash the password
        const password = 'admin123';
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert or update admin user
        await client.query(`
            INSERT INTO admin_users (username, password_hash, email, is_active) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT (username) DO UPDATE SET 
                password_hash = $2,
                email = $3,
                is_active = $4
        `, ['admin', hashedPassword, 'admin@dancestudio.com', true]);
        
        console.log('✅ Admin user created/updated successfully');
        console.log('   Username: admin');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change this password after first login!');
        
    } catch (error) {
        console.error('❌ Failed to create admin user:', error);
        throw error;
    } finally {
        await client.end();
    }
}

// Run if called directly
if (require.main === module) {
    createAdmin().catch(console.error);
}

module.exports = { createAdmin };
