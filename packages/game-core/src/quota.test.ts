import { describe, expect, it } from 'vitest';
import type { SampleMethod, Season } from '@shanhai/contracts';
import { SPECIES_BY_ID } from './catalog.ts';
import {
  BASE_QUOTA,
  computeSampleQuota,
  disturbanceFactor,
  getProtectionTier,
  occupancyFactor
} from './quota.ts';
import { createSpeciesState } from './simulation.ts';
import { generateSiteState } from './simulation.ts';

const prunus = SPECIES_BY_ID.get('prunus-davidiana')!;
const metasequoia = SPECIES_BY_ID.get('metasequoia-glyptostroboides')!;

function context(
  speciesId: string,
  siteId: Parameters<typeof generateSiteState>[5],
  season: Season,
  day: number,
  method: SampleMethod,
  overrides: {
    population?: number;
    health?: number;
    disturbance?: number;
    used?: number;
    seed?: string;
  } = {}
) {
  const definition = SPECIES_BY_ID.get(speciesId)!;
  const seed = overrides.seed ?? `quota-${speciesId}-${season}-${day}`;
  const site = { ...generateSiteState('save', seed, 1, season, day, siteId), disturbance: overrides.disturbance ?? 0.08 };
  const state = {
    ...createSpeciesState('save', seed, 1, season, siteId, speciesId),
    population: overrides.population ?? definition.zones[siteId]!.initialPopulation,
    health: overrides.health ?? 88
  };
  return computeSampleQuota({ method, definition, state, site, season, day, used: overrides.used ?? 0 });
}

describe('protection tier', () => {
  it('infers class_i from the protected flag and honors explicit tiers', () => {
    expect(getProtectionTier(metasequoia)).toBe('class_i');
    expect(getProtectionTier(prunus)).toBe('unprotected');
  });

  it('bans destructive methods for protected species outright (factor 0)', () => {
    const cutting = context('metasequoia-glyptostroboides', 'stream_valley', 'summer', 5, 'cutting');
    expect(cutting.limit).toBe(0);
    const litter = context('metasequoia-glyptostroboides', 'stream_valley', 'autumn', 9, 'litter');
    expect(litter.limit).toBe(0);
  });

  it('still allows contact rubbing on a class_i species during a safe phenology', () => {
    // 水杉春末（day 9 已过盛花，叶部成熟）拓印允许，但额度减半
    const rubbing = context('metasequoia-glyptostroboides', 'stream_valley', 'spring', 9, 'rubbing');
    expect(rubbing.factors.protection).toBe(0.5);
    expect(rubbing.limit).toBeGreaterThanOrEqual(1);
  });

  it('never restricts photos', () => {
    const photo = context('metasequoia-glyptostroboides', 'stream_valley', 'winter', 3, 'photo');
    expect(photo.limit).toBe(99);
    expect(photo.factors.protection).toBe(1);
  });
});

describe('phenology-driven quota', () => {
  it('expands rubbing quota around full bloom relative to the historical cap of 3', () => {
    // 山桃花期 spring peak day 5
    const peak = context('prunus-davidiana', 'foothill', 'spring', 5, 'rubbing');
    expect(peak.factors.phenology).toBe(1.5);
    expect(peak.limit).toBeGreaterThan(BASE_QUOTA.rubbing);
    expect(peak.limit).toBeGreaterThan(3);
  });

  it('zeroes cutting at full bloom (reproductive window)', () => {
    const cutting = context('prunus-davidiana', 'foothill', 'spring', 5, 'cutting');
    expect(cutting.factors.phenology).toBe(0);
    expect(cutting.limit).toBe(0);
  });

  it('expands litter quota in autumn leaf-fall beyond the historical cap of 3', () => {
    const autumn = context('prunus-davidiana', 'foothill', 'autumn', 9, 'litter');
    expect(autumn.factors.phenology).toBeGreaterThanOrEqual(1.25);
    expect(autumn.limit).toBeGreaterThan(3);
  });

  it('keeps a minimum quota of 1 for physically possible but mistimed sampling', () => {
    // 春季采落叶是错误物候，但残枝存在，应恰好允许 1 次以承担错误采集代价
    const mistimed = context('prunus-davidiana', 'foothill', 'spring', 3, 'litter');
    expect(mistimed.limit).toBe(1);
  });
});

describe('carrying-capacity pressure', () => {
  it('steps the occupancy factor by population ratio', () => {
    const capacity = prunus.zones.foothill!.carryingCapacity;
    expect(occupancyFactor(capacity * 0.9, capacity)).toBe(1);
    expect(occupancyFactor(capacity * 0.7, capacity)).toBe(0.75);
    expect(occupancyFactor(capacity * 0.4, capacity)).toBe(0.5);
    expect(occupancyFactor(capacity * 0.2, capacity)).toBe(0.25);
    expect(occupancyFactor(capacity * 0.05, capacity)).toBe(0);
  });

  it('shrinks destructive quotas for a depleted population', () => {
    const capacity = prunus.zones.foothill!.carryingCapacity;
    const healthy = context('prunus-davidiana', 'foothill', 'summer', 5, 'cutting', {
      population: capacity * 0.9
    });
    const depleted = context('prunus-davidiana', 'foothill', 'summer', 5, 'cutting', {
      population: capacity * 0.2
    });
    expect(depleted.factors.occupancy).toBe(0.25);
    expect(healthy.factors.occupancy).toBe(1);
    expect(depleted.limit).toBeLessThanOrEqual(healthy.limit);
  });

  it('does not apply occupancy pressure to non-harvest rubbing', () => {
    const capacity = prunus.zones.foothill!.carryingCapacity;
    const rubbing = context('prunus-davidiana', 'foothill', 'spring', 5, 'rubbing', {
      population: capacity * 0.1
    });
    expect(rubbing.factors.occupancy).toBe(1);
  });
});

describe('site disturbance', () => {
  it('shrinks cutting quota faster than rubbing as disturbance rises', () => {
    expect(disturbanceFactor('cutting', 0.42)).toBeLessThan(disturbanceFactor('rubbing', 0.42));
    expect(disturbanceFactor('photo', 0.42)).toBe(1);
    const calm = context('prunus-davidiana', 'foothill', 'summer', 5, 'cutting', { disturbance: 0 });
    const busy = context('prunus-davidiana', 'foothill', 'summer', 5, 'cutting', { disturbance: 0.42 });
    expect(busy.factors.disturbance).toBeLessThan(calm.factors.disturbance);
    expect(busy.limit).toBeLessThanOrEqual(calm.limit);
  });
});

describe('quota pinning', () => {
  it('reports pinned=true and freezes the limit when a ledger grant is supplied', () => {
    const quota = context('prunus-davidiana', 'foothill', 'spring', 5, 'rubbing', { used: 2 });
    const pinned = computeSampleQuota({
      method: 'rubbing',
      definition: prunus,
      state: {
        ...createSpeciesState('save', 'seed', 1, 'spring', 'foothill', prunus.id),
        population: 1
      },
      site: generateSiteState('save', 'seed', 1, 'spring', 5, 'foothill'),
      season: 'spring',
      day: 5,
      used: 2,
      pinnedLimit: quota.limit
    });
    expect(pinned.pinned).toBe(true);
    expect(pinned.limit).toBe(quota.limit);
  });

  it('preserves the original factor breakdown when a pinned grant is supplied', () => {
    const originalFactors = {
      base: 4,
      phenology: 0,
      protection: 1,
      occupancy: 1,
      disturbance: 0.9
    };
    const pinned = computeSampleQuota({
      method: 'rubbing',
      definition: prunus,
      state: createSpeciesState('save', 'seed', 1, 'spring', 'foothill', prunus.id),
      site: generateSiteState('save', 'seed', 1, 'spring', 5, 'foothill'),
      season: 'spring',
      day: 5,
      used: 1,
      pinnedLimit: 0,
      pinnedFactors: originalFactors
    });
    expect(pinned.factors).toEqual(originalFactors);
    expect(pinned.limit).toBe(0);
    expect(pinned.pinned).toBe(true);
  });

  it('floors every positive raw quota at 1 and rounds down otherwise', () => {
    // 0.25 phenology * base 4 * 1.0 protection * occupancy 1 * disturbance ~1 => 1
    const floor = context('prunus-davidiana', 'foothill', 'spring', 3, 'litter');
    expect(floor.limit).toBeGreaterThanOrEqual(1);
  });
});
