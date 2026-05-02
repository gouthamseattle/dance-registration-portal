let sqlite3; // lazy-loaded in development
const { Pool } = require('pg');
const path = require('path');

class DatabaseConfig {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.db = null;
        this.pool = null;
    }

    async connect() {
        if (this.isProduction) {
            // PostgreSQL for production — use Pool for auto-reconnect
            this.pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
                max: 10,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 5000
            });
            this.pool.on('error', (err) => {
                console.error('⚠️ PostgreSQL pool idle-client error:', err.message);
            });
            // Verify connectivity
            const testClient = await this.pool.connect();
            testClient.release();
            console.log('✅ Connected to PostgreSQL database (pool)');
            return this.pool;
        } else {
            // SQLite for development (lazy-load to avoid requiring in production)
            sqlite3 = sqlite3 || require('sqlite3').verbose();
            const dbPath = path.join(__dirname, 'database', 'registrations.db');
            this.db = new sqlite3.Database(dbPath);
            console.log('✅ Connected to SQLite database');
            return this.db;
        }
    }

    async query(sql, params = []) {
        if (this.isProduction) {
            // PostgreSQL query via pool with retry on connection errors
            const maxRetries = 2;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const result = await this.pool.query(sql, params);
                    return result.rows;
                } catch (error) {
                    const isConnectionError = [
                        'ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
                        'Connection terminated unexpectedly',
                        'connection terminated',
                        'Client has encountered a connection error',
                        'terminating connection',
                        'server closed the connection unexpectedly',
                        'sorry, too many clients already'
                    ].some(msg => (error.message || '').includes(msg) || (error.code || '') === msg);

                    if (isConnectionError && attempt < maxRetries) {
                        console.warn(`⚠️ DB connection error (attempt ${attempt}/${maxRetries}), retrying in 1s:`, error.message);
                        await new Promise(r => setTimeout(r, 1000));
                        continue;
                    }
                    console.error('PostgreSQL query error:', error.message);
                    throw error;
                }
            }
        } else {
            // SQLite query
            return new Promise((resolve, reject) => {
                if (sql.trim().toLowerCase().startsWith('select')) {
                    this.db.all(sql, params, (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                } else {
                    this.db.run(sql, params, function(err) {
                        if (err) reject(err);
                        else resolve({ lastID: this.lastID, changes: this.changes });
                    });
                }
            });
        }
    }

    async run(sql, params = []) {
        return this.query(sql, params);
    }

    async get(sql, params = []) {
        if (this.isProduction) {
            const result = await this.query(sql, params);
            return result[0] || null;
        } else {
            return new Promise((resolve, reject) => {
                this.db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row || null);
                });
            });
        }
    }

    async all(sql, params = []) {
        return this.query(sql, params);
    }

    async close() {
        if (this.isProduction && this.pool) {
            await this.pool.end();
            console.log('✅ PostgreSQL pool closed');
        } else if (this.db) {
            this.db.close();
            console.log('✅ SQLite connection closed');
        }
    }

    // Convert SQLite SQL to PostgreSQL compatible SQL
    convertSqlForPostgres(sql) {
        if (!this.isProduction) return sql;
        
        // Convert SQLite specific syntax to PostgreSQL
        return sql
            .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
            .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/g, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
            .replace(/TEXT/g, 'VARCHAR(255)')
            .replace(/REAL/g, 'DECIMAL(10,2)')
            .replace(/BOOLEAN DEFAULT 0/g, 'BOOLEAN DEFAULT FALSE')
            .replace(/BOOLEAN DEFAULT 1/g, 'BOOLEAN DEFAULT TRUE');
    }
}

module.exports = DatabaseConfig;
