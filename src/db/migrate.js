import 'dotenv/config';
import pool from '../config/database.js';
import { runMigrations } from './run-migrations.js';

try {
  console.log('Running migrations...');
  await runMigrations(pool);
  console.log('Migrations completed successfully');
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
