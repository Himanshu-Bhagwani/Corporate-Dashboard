const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true' || !!process.env.DATABASE_URL;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false
    }
  : {
      user: process.env.DB_USER || 'dashboard_user',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'dashboard_db',
      password: process.env.DB_PASSWORD || 'dashboard123',
      port: parseInt(process.env.DB_PORT) || 5433,
      ssl: (process.env.DB_SSL === 'true') ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(poolConfig);

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL Connected Successfully');
    client.release();
  } catch (error) {
    console.error('PostgreSQL Connection Failed:', error.message);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };
