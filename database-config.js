const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const path = require('path');

class DatabaseConfig {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.db = null;
        this.client = null;
    }

    async connect() {
        if (this.isProduction) {
            // PostgreSQL for production
            this.client = new Client({
                connectionString: process.env.DATABASE_URL,
                ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
            });
            await this.client.connect();
            console.log('✅ Connected to PostgreSQL database');
            return this.client;
        } else {
            // SQLite for development
            const dbPath = path.join(__dirname, 'database', 'registrations.db');
            this.db = new sqlite3.Database(dbPath);
            console.log('✅ Connected to SQLite database');
            return this.db;
        }
    }

    async query(sql, params = []) {
        if (this.isProduction) {
            // PostgreSQL query
            try {
                const result = await this.client.query(sql, params);
                return result.rows;
            } catch (error) {
                console.error('PostgreSQL query error:', error);
                throw error;
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
        if (this.isProduction && this.client) {
            await this.client.end();
            console.log('✅ PostgreSQL connection closed');
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
