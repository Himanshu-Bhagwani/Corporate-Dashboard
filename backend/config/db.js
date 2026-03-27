const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'dashboard_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'dashboard_db',
  password: process.env.DB_PASSWORD || 'dashboard123',
  port: parseInt(process.env.DB_PORT) || 5433,
});

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
