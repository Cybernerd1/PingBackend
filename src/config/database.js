import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema/index.js';

const { Pool } = pg;

// NeonDB requires SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // required for Neon
  },
  max: 10,                  // max pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection
pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
  process.exit(1);
});

export const db = drizzle(pool, { schema });

export const connectDB = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log(`NeonDB Connected at: ${result.rows[0].now}`);
  } finally {
    client.release();
  }
};

export default pool;
