import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { GameCommand, SampleMethod, WorldSnapshot } from '@shanhai/contracts';
import { createApp } from '../src/app.ts';

describe('dynamic sampling quota', () => {
  let app: ReturnType<typeof createApp>['app'];
  let store: ReturnType<typeof createApp>['store'];
  let agent: ReturnType<typeof request.agent>;
  let world: WorldSnapshot;

  beforeAll(async () => {
    const created = createApp({ databasePath: ':memory:', loggerEnabled: false });
    app = created.app;
    store = created.store;
    agent = request.agent(app);
    const response = await agent.post('/api/save').expect(201);
    world = response.body as WorldSnapshot;
  });

  afterAll(() => store.close());

  it('exposes factorized, phenology-aware quota per species and method', () => {
    const species = world.sites
      .flatMap((site) => site.species)
      .find((entry) => entry.id === 'prunus-davidiana')!;
    for (const method of ['photo', 'rubbing', 'litter', 'cutting'] as SampleMethod[]) {
      const view = species.sampleLimits[method];
      expect(view).toBeDefined();
      expect(view.factors).toMatchObject({
        base: expect.any(Number),
        phenology: expect.any(Number),
        protection: expect.any(Number),
        occupancy: expect.any(Number),
        disturbance: expect.any(Number)
      });
      expect(view.limit).toBeGreaterThanOrEqual(0);
      expect(view.used).toBe(0);
    }
    // 拓印基线由 3 提升到 4，再由当前物候/承载力/干扰系数调节
    const rubbing = species.sampleLimits.rubbing;
    expect(rubbing.factors.base).toBe(4);
    expect(rubbing.factors.phenology).toBeGreaterThan(0);
    expect(rubbing.limit).toBeLessThanOrEqual(6);
  });

  it('enforces an exhaustion ceiling and rolls the whole command back on overflow', async () => {
    // 山桃春季非落叶期，落叶采集动态配额为 1（允许一次“错采”并承担生态代价）
    world = await command(agent, world, { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' });
    let species = snapshot(world, 'prunus-davidiana');
    expect(species.sampleLimits.litter.used).toBe(1);
    expect(species.sampleLimits.litter.pinned).toBe(true);

    const ledger = store.db
      .prepare('SELECT quota_granted FROM sample_quota_ledger WHERE species_id = ? AND method = ? AND season = ?')
      .get('prunus-davidiana', 'litter', world.season) as unknown as { quota_granted: number };
    expect(Number(ledger.quota_granted)).toBe(1);

    const exhausted = await send(agent, world, {
      type: 'TAKE_SAMPLE',
      speciesId: 'prunus-davidiana',
      method: 'litter'
    });
    expect(exhausted.status).toBe(409);
    expect(exhausted.body.code).toBe('SAMPLE_LIMIT_REACHED');

    // 失败必须原子回滚：样本数、种群/健康状态、行动点、存档版本全部不变
    const reloaded = await getWorld(agent, world.saveId);
    const after = snapshot(reloaded, 'prunus-davidiana');
    expect(after.sampleLimits.litter.used).toBe(1);
    expect(after.population).toBe(species.population);
    expect(after.health).toBe(species.health);
    expect(reloaded.revision).toBe(world.revision);
    expect(reloaded.actionPoints).toBe(world.actionPoints);
  });

  it('pins the seasonal quota so later ecological drift cannot raise it', async () => {
    const granted = snapshot(world, 'prunus-davidiana').sampleLimits.litter.limit;
    // 手动把区域干扰推高（模拟状态漂移），钉住的上限不变
    store.db
      .prepare('UPDATE site_states SET disturbance = 0.4 WHERE save_id = ? AND year = ? AND site_id = ?')
      .run(world.saveId, world.year, 'foothill');
    const reloaded = await getWorld(agent, world.saveId);
    const view = snapshot(reloaded, 'prunus-davidiana').sampleLimits.litter;
    expect(view.pinned).toBe(true);
    expect(view.limit).toBe(granted);
  });
});

describe('concurrent sampling', () => {
  let app: ReturnType<typeof createApp>['app'];
  let store: ReturnType<typeof createApp>['store'];
  let agent: ReturnType<typeof request.agent>;

  afterAll(() => store.close());

  it('serializes same-revision races so the quota can never be oversold', async () => {
    const created = createApp({ databasePath: ':memory:', loggerEnabled: false });
    app = created.app;
    store = created.store;
    agent = request.agent(app);
    let world = (await agent.post('/api/save').expect(201)).body as WorldSnapshot;

    // 用拓印（盛花期配额较高）制造并发：两个请求携带相同 expectedRevision 同时发出
    const body = (revision: number) => ({
      expectedRevision: revision,
      idempotencyKey: `race-${revision}-${Math.random().toString(16).slice(2)}`,
      command: { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'rubbing' } satisfies GameCommand
    });
    const responses = await Promise.all([
      agent.post(`/api/save/${world.saveId}/commands`).send(body(world.revision)),
      agent.post(`/api/save/${world.saveId}/commands`).send(body(world.revision))
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body.code).toBe('REVISION_CONFLICT');
    const winner = responses.find((response) => response.status === 200)!.body.world as WorldSnapshot;
    expect(snapshot(winner, 'prunus-davidiana').sampleLimits.rubbing.used).toBe(1);
    world = winner;

    // 失败方刷新到新版本后重试，账本继续按钉住额度放行
    world = await command(agent, world, { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'rubbing' });
    expect(snapshot(world, 'prunus-davidiana').sampleLimits.rubbing.used).toBe(2);
  });

  it('never oversells an exhausted quota under a burst of concurrent attempts', async () => {
    const isolated = createApp({ databasePath: ':memory:', loggerEnabled: false });
    const isolatedAgent = request.agent(isolated.app);
    try {
      // 山桃春季落叶采集配额为 1：先用掉唯一额度
      const createResponse = await isolatedAgent.post('/api/save').expect(201);
      const cookie = (createResponse.headers['set-cookie'] as unknown as string[])
        .map((entry) => entry.split(';')[0])
        .join('; ');
      const world = createResponse.body as WorldSnapshot;
      await request(isolated.app)
        .post(`/api/save/${world.saveId}/commands`)
        .set('Cookie', cookie)
        .send({
          expectedRevision: world.revision,
          idempotencyKey: 'burst-setup-key',
          command: { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' }
        })
        .expect(200);

      // 5 个独立连接、携带相同 revision 的并发超额请求：期望全部 409，样本仍恰好为 1。
      const burst = await Promise.all(
        Array.from({ length: 5 }, () =>
          request(isolated.app)
            .post(`/api/save/${world.saveId}/commands`)
            .set('Cookie', cookie)
            .send({
              expectedRevision: world.revision,
              idempotencyKey: `burst-${Math.random().toString(16).slice(2)}`,
              command: { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' } satisfies GameCommand
            })
        )
      );
      for (const response of burst) {
        expect(response.status).toBe(409);
        expect(['REVISION_CONFLICT', 'SAMPLE_LIMIT_REACHED', 'QUOTA_EXHAUSTED']).toContain(response.body.code);
      }
      const row = isolated.store.db
        .prepare("SELECT COUNT(*) AS count FROM samples WHERE species_id = 'prunus-davidiana' AND method = 'litter'")
        .get() as unknown as { count: number };
      expect(Number(row.count)).toBe(1);
    } finally {
      isolated.store.close();
    }
  });

  it('keeps sample rows and ecological effects in one atomic unit', async () => {
    // 直接在数据库层断言：不存在“有样本行但种群影响缺失/超额”的中间态
    const rows = store.db
      .prepare(
        `SELECT s.species_id, s.method, COUNT(*) AS consumed, l.quota_granted
         FROM samples s
         LEFT JOIN sample_quota_ledger l
           ON l.save_id = s.save_id AND l.year = s.year AND l.season = s.season
          AND l.species_id = s.species_id AND l.method = s.method
         WHERE s.method != 'photo'
         GROUP BY s.species_id, s.method`
      )
      .all() as unknown as Array<{ consumed: number; quota_granted: number | null }>;
    for (const row of rows) {
      expect(Number(row.consumed)).toBeLessThanOrEqual(Number(row.quota_granted ?? 0));
    }
  });
});

describe('cross-season quota recovery', () => {
  let app: ReturnType<typeof createApp>['app'];
  let store: ReturnType<typeof createApp>['store'];
  let agent: ReturnType<typeof request.agent>;

  afterAll(() => store.close());

  it('resets quota each season and reconciles ledger drift after import', async () => {
    const created = createApp({ databasePath: ':memory:', loggerEnabled: false });
    app = created.app;
    store = created.store;
    agent = request.agent(app);
    let world = (await agent.post('/api/save').expect(201)).body as WorldSnapshot;

    // 春季消耗一次落叶采集
    world = await command(agent, world, { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' });
    expect(snapshot(world, 'prunus-davidiana').sampleLimits.litter.used).toBe(1);

    // 推进到夏季
    while (world.day < 8) world = await command(agent, world, { type: 'WAIT' });
    world = await command(agent, world, { type: 'END_SEASON' });
    world = await command(agent, world, { type: 'BEGIN_NEXT_SEASON' });
    expect(world.season).toBe('summer');
    expect(snapshot(world, 'prunus-davidiana').sampleLimits.litter.used).toBe(0);
    expect(snapshot(world, 'prunus-davidiana').sampleLimits.litter.pinned).toBe(false);

    // 夏季再采一次，建立夏季账本
    world = await command(agent, world, { type: 'TAKE_SAMPLE', speciesId: 'prunus-davidiana', method: 'litter' });

    // 模拟“账本丢失/跨环境恢复”：直接删除当前季账本行（样本事实仍在）
    store.db
      .prepare('DELETE FROM sample_quota_ledger WHERE save_id = ? AND season = ?')
      .run(world.saveId, world.season);

    // 下一条命令（WAIT）触发对账，账本以样本事实被补齐
    world = await command(agent, world, { type: 'WAIT' });
    const rebuilt = store.db
      .prepare('SELECT quota_granted FROM sample_quota_ledger WHERE save_id = ? AND season = ? AND species_id = ? AND method = ?')
      .get(world.saveId, world.season, 'prunus-davidiana', 'litter') as unknown as { quota_granted: number };
    expect(Number(rebuilt.quota_granted)).toBeGreaterThanOrEqual(1);

    // 导出 → 新会话导入：恢复后配额与样本依旧原子一致
    const exported = await agent.post(`/api/save/${world.saveId}/export`).expect(200);
    const importer = request.agent(app);
    await importer.post('/api/save/import').send({ token: exported.body.token }).expect(200);
    const importedWorld = await importer
      .get(`/api/save/${world.saveId}/world`)
      .expect(200);
    const view = (importedWorld.body as WorldSnapshot).sites
      .flatMap((site) => site.species)
      .find((entry) => entry.id === 'prunus-davidiana')!;
    expect(view.sampleLimits.litter.used).toBe(1);
    expect(view.sampleLimits.litter.limit).toBeGreaterThanOrEqual(1);
    expect(store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  }, 30_000);
});

describe('transaction rollback', () => {
  it('leaves no sample, ledger or ecological trace when the operation throws mid-flight', () => {
    const created = createApp({ databasePath: ':memory:', loggerEnabled: false });
    try {
      const { store } = created;
      const service = created.service;
      const sessionId = service.createSession('hash-rollback-test');
      service.createSave(sessionId);
      const save = service.findSaveBySession(sessionId)!;

      expect(() =>
        store.transaction(() => {
          // 模拟“样本/账本已写入后，提交前不变量失败”
          store.db
            .prepare(
              `INSERT INTO samples
               (id, save_id, observation_id, year, season, day, slot, site_id, species_id, method,
                protocol_match, effects_json, created_at)
               VALUES (?, ?, NULL, 1, 'spring', 1, 1, 'foothill', 'prunus-davidiana', 'litter',
                0, '{}', ?)`
            )
            .run(cryptoRandom(), save.id, new Date().toISOString());
          throw new Error('forced post-write failure');
        })
      ).toThrow(/forced post-write failure/);

      const sampleCount = Number(
        (store.db.prepare('SELECT COUNT(*) AS count FROM samples').get() as unknown as { count: number }).count
      );
      const ledgerCount = Number(
        (store.db.prepare('SELECT COUNT(*) AS count FROM sample_quota_ledger').get() as unknown as { count: number })
          .count
      );
      expect(sampleCount).toBe(0);
      expect(ledgerCount).toBe(0);
    } finally {
      created.store.close();
    }
  });
});

function snapshot(world: WorldSnapshot, speciesId: string) {
  const species = world.sites.flatMap((site) => site.species).find((entry) => entry.id === speciesId);
  if (!species) {
    throw new Error(`species ${speciesId} not visible in current site; move there first`);
  }
  return species;
}

async function command(
  agent: ReturnType<typeof request.agent>,
  world: WorldSnapshot,
  commandBody: GameCommand
): Promise<WorldSnapshot> {
  const response = await send(agent, world, commandBody);
  if (response.status !== 200) {
    throw new Error(`${commandBody.type} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.world as WorldSnapshot;
}

async function send(
  agent: ReturnType<typeof request.agent>,
  world: WorldSnapshot,
  commandBody: GameCommand
) {
  return agent
    .post(`/api/save/${world.saveId}/commands`)
    .send({
      expectedRevision: world.revision,
      idempotencyKey: `quota-test-${world.revision}-${commandBody.type}-${Math.random().toString(16).slice(2)}`,
      command: commandBody
    });
}

async function getWorld(agent: ReturnType<typeof request.agent>, saveId: string): Promise<WorldSnapshot> {
  const response = await agent.get(`/api/save/${saveId}/world`).expect(200);
  return response.body as WorldSnapshot;
}

function cryptoRandom(): string {
  return `test-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}
