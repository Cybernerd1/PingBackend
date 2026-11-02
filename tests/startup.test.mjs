import test from 'node:test';
import assert from 'node:assert/strict';

let importId = 0;
const setup = (t, { connectError, migrationError } = {}) => {
  const events = [];
  const pool = {};
  const errors = [];
  t.mock.module('dotenv/config', { namedExports: {} });
  t.mock.module('../src/app.js', { defaultExport: {} });
  t.mock.module('../src/config/database.js', {
    defaultExport: pool,
    namedExports: {
      connectDB: async () => {
        events.push('connect');
        if (connectError) throw connectError;
      },
    },
  });
  t.mock.module('../src/db/run-migrations.js', {
    namedExports: {
      runMigrations: async (receivedPool) => {
        assert.equal(receivedPool, pool);
        events.push('migrate');
        if (migrationError) throw migrationError;
        events.push('migrated');
      },
    },
  });
  t.mock.module('http', {
    namedExports: {
      createServer: () => {
        events.push('createServer');
        return { listen: (_port, cb) => { events.push('listen'); cb(); } };
      },
    },
  });
  t.mock.module('../src/socket/index.js', {
    namedExports: { initSocket: () => events.push('socket') },
  });
  t.mock.module('../src/jobs/purge.job.js', {
    namedExports: { startPurgeJob: () => events.push('purge') },
  });
  t.mock.module('../src/utils/logger.js', {
    defaultExport: { info() {}, error: (...args) => errors.push(args) },
  });
  const exit = t.mock.method(process, 'exit', (code) => {
    assert.equal(code, 1);
    throw new Error('startup exited');
  });
  const start = () => import(`../server.js?test=${++importId}`);
  return { start, events, errors, exit };
};

test('direct server entrypoint migrates before HTTP, sockets, and background jobs', async (t) => {
  const { start, events, exit } = setup(t);
  await start();
  assert.deepEqual(events, ['connect', 'migrate', 'migrated', 'createServer', 'socket', 'purge', 'listen']);
  assert.equal(exit.mock.callCount(), 0);
});

test('a failed migration prevents a live service and logs a startup error', async (t) => {
  const error = new Error('migration failed');
  const { start, events, errors } = setup(t, { migrationError: error });
  await assert.rejects(start(), /startup exited/);
  assert.deepEqual(events, ['connect', 'migrate']);
  assert.equal(errors[0][0].err, error);
  assert.equal(errors[0][1], 'Server startup failed');
});

test('a failed database connection prevents migrations and a live service', async (t) => {
  const error = new Error('connection failed');
  const { start, events, errors } = setup(t, { connectError: error });
  await assert.rejects(start(), /startup exited/);
  assert.deepEqual(events, ['connect']);
  assert.equal(errors[0][0].err, error);
});
