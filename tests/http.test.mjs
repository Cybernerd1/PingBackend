import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

// Do not load a developer's credentials or connect to their database.
process.env.DOTENV_CONFIG_PATH = fileURLToPath(new URL('./.nonexistent-test-env', import.meta.url));
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/config/database.js');

test('HTTP smoke checks preserve auth enforcement and avoid favicon errors', async (t) => {
  t.mock.method(pool, 'query', () => { throw new Error('Unexpected database access'); });
  t.mock.method(pool, 'connect', () => { throw new Error('Unexpected database connection'); });
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await pool.end();
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  for (const path of ['/', '/api/v1/health']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    await response.text();
  }
  const favicon = await fetch(base + '/favicon.ico');
  assert.equal(favicon.status, 204);
  assert.equal(await favicon.text(), '');

  for (const path of ['/api/v1/users/profile', '/api/v1/users/photos']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 401, path);
    await response.text();
  }
  const refresh = await fetch(base + '/api/v1/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: 'invalid-token' }),
  });
  assert.equal(refresh.status, 401);
  await refresh.text();
});
