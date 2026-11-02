import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runMigrations } from '../src/db/run-migrations.js';

const { entries } = JSON.parse(readFileSync(
  new URL('../src/db/migrations/meta/_journal.json', import.meta.url), 'utf8'
));

// Exercise the real Drizzle migrator and checked-in SQL with an isolated pg
// client double. These tests must never connect to a configured database.
const makePool = (lastMigration, failOn) => {
  let committed = lastMigration;
  let pending = committed;
  const queries = [];
  const releases = [];
  const client = {
    async query(config, params = []) {
      const text = typeof config === 'string' ? config : config.text;
      queries.push({ text, params });
      if (failOn?.test(text)) throw new Error('database permission denied');
      if (text.startsWith('select id, hash, created_at')) {
        return { rows: committed ? [{ created_at: committed }] : [] };
      }
      if (text === 'begin') pending = committed;
      if (text.startsWith('insert into "drizzle"."__drizzle_migrations"')) pending = params[1];
      if (text === 'commit') committed = pending;
      return { rows: [] };
    },
    release(destroy) { releases.push(destroy); },
  };
  return { connect: async () => client, queries, releases };
};

test('a database at 0007 receives the password schema migration under a lock', async () => {
  const pool = makePool(entries.at(-2).when);
  await runMigrations(pool);

  assert.match(pool.queries[0].text, /pg_advisory_lock/);
  assert.equal(pool.queries.filter(q => q.text.includes('ADD COLUMN "session_version"')).length, 1);
  assert.ok(pool.queries.some(q => q.text.includes("ADD VALUE 'create_password'")));
  assert.ok(!pool.queries.some(q => q.text.includes('CREATE TABLE "users"')));
  const history = pool.queries.filter(q => q.text.startsWith('insert into "drizzle"'));
  assert.equal(history.length, 1);
  assert.equal(history[0].params[1], entries.at(-1).when);
  assert.ok(pool.queries.some(q => q.text === 'commit'));
  assert.deepEqual(pool.releases, [true]);
});

test('a second startup does not replay applied migrations', async () => {
  const pool = makePool(entries.at(-2).when);
  await runMigrations(pool);
  pool.queries.length = 0;
  await runMigrations(pool);

  assert.ok(!pool.queries.some(q => /ALTER |insert into "drizzle"/.test(q.text)));
  assert.deepEqual(pool.releases, [true, true]);
});

test('a fresh database runs every journal entry in order', async () => {
  const pool = makePool();
  await runMigrations(pool);
  const history = pool.queries.filter(q => q.text.startsWith('insert into "drizzle"'));
  assert.deepEqual(history.map(q => q.params[1]), entries.map(e => e.when));
});

test('migration failure rolls back, propagates, and releases the lock connection', async () => {
  const pool = makePool(entries.at(-2).when, /ADD COLUMN "session_version"/);
  await assert.rejects(runMigrations(pool), (error) => {
    assert.match(error.message, /ADD COLUMN "session_version"/);
    assert.equal(error.cause.message, 'database permission denied');
    return true;
  });
  assert.ok(pool.queries.some(q => q.text === 'rollback'));
  assert.ok(!pool.queries.some(q => q.text === 'commit'));
  assert.deepEqual(pool.releases, [true]);
});

test('lock failure destroys the client without attempting any migrations', async () => {
  const pool = makePool(undefined, /pg_advisory_lock/);
  await assert.rejects(runMigrations(pool), /database permission denied/);
  assert.equal(pool.queries.length, 1);
  assert.deepEqual(pool.releases, [true]);
});

test('connection failure propagates without a client to release', async () => {
  await assert.rejects(runMigrations({
    connect: async () => { throw new Error('database unavailable'); },
  }), /database unavailable/);
});

test('migration files are resolved independently of the working directory', async () => {
  const cwd = process.cwd();
  try {
    process.chdir(tmpdir());
    const pool = makePool(entries.at(-2).when);
    await runMigrations(pool);
    assert.ok(pool.queries.some(q => q.text.includes('ADD COLUMN "session_version"')));
  } finally {
    process.chdir(cwd);
  }
});
