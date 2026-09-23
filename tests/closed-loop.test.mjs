import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const requireFromServer = createRequire(path.join(root, 'apps/server/package.json'));
const tsxLoader = requireFromServer.resolve('tsx');

const runtime = await mkdtemp(path.join(tmpdir(), 'shanhai-e2e-'));
const databasePath = path.join(runtime, 'e2e.db');
const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;

const child = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', '--import', tsxLoader, path.join(root, 'apps/server/dist/index.js')],
  {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_URL: databasePath,
    APP_ORIGIN: 'http://127.0.0.1:5173',
    LOG_LEVEL: 'error'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

try {
  await waitForServer();
  let cookie = '';
  let world = await api('/api/save', { method: 'POST' }, true);

  const send = async (command) => {
    const response = await api(`/api/save/${world.saveId}/commands`, {
      method: 'POST',
      body: JSON.stringify({
        expectedRevision: world.revision,
        idempotencyKey: crypto.randomUUID(),
        command
      })
    });
    world = response.world;
  };

  await send({
    type: 'OBSERVE_PLANT',
    speciesId: 'prunus-davidiana',
    values: {
      phenology: 'leafing',
      leafTexture: 'smooth',
      dominantColor: '#557a45',
      temperatureC: 16,
      humidity: 60,
      soilMoisture: 50,
      lightLux: 30000,
      note: '端到端闭环观察'
    }
  });
  await send({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' });

  for (const expectedSeason of ['spring', 'summer', 'autumn', 'winter']) {
    assert.equal(world.season, expectedSeason);
    while (world.day < 8) {
      await send({ type: 'WAIT' });
    }
    await send({ type: 'END_SEASON' });
    if (expectedSeason !== 'winter') {
      await send({ type: 'BEGIN_NEXT_SEASON' });
    }
  }

  assert.equal(world.phase, 'year_review');
  assert.equal(world.annualReview.year, 1);
  assert.ok(world.annualReview.incorrectSamples > 0);
  await send({ type: 'BEGIN_NEXT_YEAR' });
  assert.equal(world.year, 2);
  assert.equal(world.season, 'spring');
  assert.equal(world.phase, 'active');

  const report = await api(`/api/save/${world.saveId}/report/1`);
  assert.equal(report.year, 1);
  console.log('Closed-loop E2E passed: create -> observe -> wrong sample -> four seasons -> report -> year 2');

  async function waitForServer() {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Server exited early.\n${serverOutput}`);
      }
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) return;
      } catch {
        // Retry until the process starts listening.
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    throw new Error(`Server did not start in time.\n${serverOutput}`);
  }

  async function api(url, init = {}, captureCookie = false) {
    const response = await fetch(`${baseUrl}${url}`, {
      ...init,
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...init.headers
      }
    });
    if (captureCookie) {
      const setCookie = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
      assert.ok(setCookie, 'save creation did not return a session cookie');
      cookie = setCookie.split(';')[0];
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${url} failed: ${response.status} ${JSON.stringify(body)}`);
    }
    return body;
  }
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5_000))
    ]);
  }
  await rm(runtime, { recursive: true, force: true });
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 8799;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}
