import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { GameCommand, WorldSnapshot } from '@shanhai/contracts';
import { createApp } from '../src/app.ts';

describe('dynamic quotas and atomic sampling', () => {
  let app: ReturnType<typeof createApp>['app'];
  let store: ReturnType<typeof createApp>['store'];
  let service: ReturnType<typeof createApp>['service'];
  let agent: ReturnType<typeof request.agent>;
  let world: WorldSnapshot;

  beforeAll(async () => {
    const created = createApp({ databasePath: ':memory:', loggerEnabled: false });
    app = created.app;
    store = created.store;
    service = created.service;
    agent = request.agent(app);
    const response = await agent.post('/api/save').expect(201);
    world = response.body as WorldSnapshot;
  });

  afterAll(() => store.close());

  function prunus() {
    const snapshot = world.sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana');
    if (!snapshot) {
      throw new Error('prunus-davidiana should be visible at foothill in spring');
    }
    return snapshot;
  }

  it('publishes expanded, factor-driven quotas in the world snapshot', () => {
    const species = prunus();
    const photo = species.sampleLimits.photo;
    expect(photo.limit).toBeGreaterThan(12);
    expect(photo.factors?.phenology).toBe(1);
    expect(photo.factors?.protection).toBe(1);
    expect(photo.factors?.carryingCapacity).toBeGreaterThan(1);
    const cutting = species.sampleLimits.cutting;
    expect(cutting.factors).toBeDefined();
    expect(cutting.used).toBe(0);
  });

  it('rolls back quota, ledger and ecology together when sampling fails mid-flight', async () => {
    const before = prunus();
    const ledgerBefore = quotaRow(world, 'foothill', 'prunus-davidiana', 'photo');
    expect(Number(ledgerBefore.used)).toBe(0);

    service.crashAfterQuotaReservation = true;
    const failed = await sendRaw({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'photo' });
    expect(failed.status).toBe(500);
    expect(failed.body.code).toBe('SIMULATED_CRASH');
    service.crashAfterQuotaReservation = false;

    const sampleCount = countSamples(world.saveId);
    expect(sampleCount).toBe(0);

    const ledgerAfter = quotaRow(world, 'foothill', 'prunus-davidiana', 'photo');
    expect(Number(ledgerAfter.used)).toBe(0);

    const fresh = await getWorld();
    expect(fresh.revision).toBe(world.revision);
    const freshSpecies = fresh.sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana')!;
    expect(freshSpecies.health).toBe(before.health);
    expect(freshSpecies.population).toBe(before.population);
  });

  it('takes a photo sample and atomically reserves one quota slot', async () => {
    const response = await send({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'photo' });
    expect(response.status).toBe(200);
    const ledger = quotaRow(world, 'foothill', 'prunus-davidiana', 'photo');
    expect(Number(ledger.used)).toBe(1);
    const sampleRows = store.db
      .prepare('SELECT COUNT(*) AS count FROM samples WHERE save_id = ? AND revoked = 0')
      .all(world.saveId) as unknown as Array<{ count: number }>;
    expect(Number(sampleRows[0]!.count)).toBe(1);
  });

  it('serializes concurrent sampling requests so only one commits per revision', async () => {
    const first = sendRaw({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'photo' }, 'race-a');
    const second = sendRaw({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'photo' }, 'race-b');
    const [left, right] = await Promise.all([first, second]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = [left, right].find((entry) => entry.status === 409)!;
    expect(conflict.body.code).toBe('REVISION_CONFLICT');
    world = await getWorld();
    const ledger = quotaRow(world, 'foothill', 'prunus-davidiana', 'photo');
    expect(Number(ledger.used)).toBe(2);
  });

  it('revokes a same-season sample, reverses ecology and returns the quota atomically', async () => {
    const before = (await getWorld()).sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana')!;
    const sample = await send({ type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' });
    expect(sample.status).toBe(200);
    const sampleId = String(
      (
        store.db
          .prepare(
            `SELECT id FROM samples
             WHERE save_id = ? AND species_id = 'prunus-davidiana' AND method = 'litter' AND revoked = 0
             ORDER BY created_at DESC LIMIT 1`
          )
          .get(world.saveId) as unknown as { id: string }
      ).id
    );
    const sampled = world.sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana')!;
    expect(sampled.health).toBeLessThan(before.health);

    const revoked = await send({ type: 'REVOKE_SAMPLE', sampleId });
    expect(revoked.body.event.type).toBe('REVOKE_SAMPLE');

    const restored = world.sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana')!;
    expect(restored.health).toBe(before.health);
    expect(restored.population).toBe(before.population);
    expect(restored.seedBank).toBe(before.seedBank);

    const ledger = quotaRow(world, 'foothill', 'prunus-davidiana', 'litter');
    expect(Number(ledger.used)).toBe(0);
    const row = store.db.prepare('SELECT revoked FROM samples WHERE id = ?').get(sampleId) as unknown as {
      revoked: number;
    };
    expect(row.revoked).toBe(1);

    // 撤销幂等守卫：再次撤销必须失败，不能重复归还配额。
    const again = await sendRaw({ type: 'REVOKE_SAMPLE', sampleId }, 'revoke-again');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('SAMPLE_ALREADY_REVOKED');
    expect(Number(quotaRow(world, 'foothill', 'prunus-davidiana', 'litter').used)).toBe(0);
  });

  it('freezes samples once the season is settled and blocks cross-season revocation', async () => {
    const sampleId = String(
      (
        store.db
          .prepare('SELECT id FROM samples WHERE save_id = ? AND revoked = 0 ORDER BY created_at DESC LIMIT 1')
          .get(world.saveId) as unknown as { id: string }
      ).id
    );

    while (world.day < 8) {
      const waited = await send({ type: 'WAIT' });
      expect(waited.status).toBe(200);
    }
    const settled = await send({ type: 'END_SEASON' });
    expect(settled.status).toBe(200);
    expect(world.phase).toBe('season_review');
    const nextSeason = await send({ type: 'BEGIN_NEXT_SEASON' });
    expect(nextSeason.status).toBe(200);
    expect(world.season).toBe('summer');

    const locked = await sendRaw({ type: 'REVOKE_SAMPLE', sampleId }, 'cross-season-revoke');
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('SAMPLE_REVOKE_LOCKED');

    // 夏季新台账独立，未受春季撤销尝试影响。
    const summerPhoto = world.sites
      .flatMap((site) => site.species)
      .find((species) => species.id === 'prunus-davidiana')!;
    expect(summerPhoto.sampleLimits.photo.used).toBe(0);
  });

  async function getWorld() {
    const response = await agent.get(`/api/save/${world.saveId}/world`).expect(200);
    return response.body as WorldSnapshot;
  }

  async function send(command: GameCommand) {
    const response = await sendRaw(command);
    if (response.status === 200) {
      world = response.body.world as WorldSnapshot;
    }
    return response;
  }

  async function sendRaw(command: GameCommand, keySuffix = `k-${Math.random().toString(16).slice(2)}`) {
    return agent
      .post(`/api/save/${world.saveId}/commands`)
      .send({
        expectedRevision: world.revision,
        idempotencyKey: `quota-test-${world.revision}-${command.type}-${keySuffix}`,
        command
      });
  }

  function quotaRow(snapshot: WorldSnapshot, siteId: string, speciesId: string, method: string) {
    const row = store.db
      .prepare(
        `SELECT * FROM sample_quotas
         WHERE save_id = ? AND year = ? AND season = ? AND site_id = ? AND species_id = ? AND method = ?`
      )
      .get(snapshot.saveId, snapshot.year, snapshot.season, siteId, speciesId, method) as unknown as {
      used: number;
      quota: number;
    };
    return row;
  }

  function countSamples(saveId: string): number {
    const row = store.db
      .prepare('SELECT COUNT(*) AS count FROM samples WHERE save_id = ?')
      .get(saveId) as unknown as { count: number };
    return Number(row.count);
  }
});
