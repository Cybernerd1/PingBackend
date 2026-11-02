import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const migrationsFolder = fileURLToPath(new URL('./migrations/', import.meta.url));
const MIGRATION_LOCK_ID = 746464;

// Shared by the CLI and server startup, including Render's `node server.js`.
export const runMigrations = async (pool) => {
  const client = await pool.connect();
  try {
    // Serialize overlapping deploys BEFORE Drizzle reads migration history.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    // Destroy this dedicated connection, releasing its session-level lock even
    // if a migration or rollback fails. Never return a locked client to the pool.
    client.release(true);
  }
};
