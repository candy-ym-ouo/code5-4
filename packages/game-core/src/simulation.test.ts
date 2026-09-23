import { describe, expect, it } from 'vitest';
import { SPECIES, SPECIES_BY_ID } from './catalog.ts';
import {
  applyOverwinter,
  computeSeasonQuota,
  createSpeciesState,
  disperseSpecies,
  evaluateSample,
  evolveSeason,
  generateSiteState,
  getPhenologyWindow,
  getPlantPresentation,
  getSuitability
} from './simulation.ts';

describe('deterministic world simulation', () => {
  it('generates identical environments for the same seed', () => {
    const first = generateSiteState('save', 'seed-alpha', 1, 'spring', 3, 'foothill');
    const second = generateSiteState('save', 'seed-alpha', 1, 'spring', 3, 'foothill');
    expect(first).toEqual(second);
  });

  it('penalizes a wrong litter sample', () => {
    const species = SPECIES_BY_ID.get('prunus-davidiana')!;
    const site = generateSiteState('save', 'seed-beta', 1, 'spring', 3, 'foothill');
    const state = createSpeciesState('save', 'seed-beta', 1, 'spring', 'foothill', species.id);
    const decision = evaluateSample(species, state, site, 'spring', 3, 'litter');
    expect(decision.allowed).toBe(true);
    expect(decision.protocolMatch).toBe(false);
    expect(decision.effects.health).toBeLessThan(0);
    expect(decision.effects.populationDelta).toBeLessThan(0);
  });

  it('keeps multi-year simulations finite and bounded', () => {
    const species = SPECIES_BY_ID.get('ginkgo-biloba')!;
    let state = createSpeciesState('save', 'seed-gamma', 1, 'spring', 'mixed_forest', species.id);

    for (let year = 1; year <= 250; year += 1) {
      for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
        const site = generateSiteState('save', 'seed-gamma', year, season, 5, 'mixed_forest');
        expect(getSuitability(species, site)).toBeGreaterThanOrEqual(0);
        expect(getSuitability(species, site)).toBeLessThanOrEqual(1);
        state = evolveSeason(state, site, [site]).state;
      }
      state = applyOverwinter(state, generateSiteState('save', 'seed-gamma', year, 'winter', 5, 'mixed_forest'));
      expect(Number.isFinite(state.population)).toBe(true);
      expect(Number.isFinite(state.health)).toBe(true);
      expect(state.population).toBeGreaterThanOrEqual(0);
      expect(state.health).toBeGreaterThanOrEqual(0);
      expect(state.health).toBeLessThanOrEqual(100);
    }
  });
});

describe('catalog-wide stability', () => {
  it('keeps every configured species and site finite for 120 years', () => {
    for (const species of SPECIES) {
      for (const [siteId, profile] of Object.entries(species.zones)) {
        if (!siteId || !profile) continue;
        let state = createSpeciesState('save', `seed-${species.id}`, 1, 'spring', siteId as never, species.id);
        for (let year = 1; year <= 120; year += 1) {
          for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
            const site = generateSiteState('save', `seed-${species.id}`, year, season, 5, siteId as never);
            state = evolveSeason(state, site, [site]).state;
          }
          state = applyOverwinter(state, generateSiteState('save', `seed-${species.id}`, year, 'winter', 5, siteId as never));
          expect(Number.isFinite(state.population)).toBe(true);
          expect(Number.isFinite(state.health)).toBe(true);
          expect(Number.isFinite(state.seedBank)).toBe(true);
          expect(state.population).toBeGreaterThanOrEqual(0);
          expect(state.population).toBeLessThanOrEqual(profile.carryingCapacity * 1.2 + 0.01);
          expect(state.health).toBeGreaterThanOrEqual(0);
          expect(state.health).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});

describe('dynamic seasonal quotas', () => {
  it('expands photo quota beyond the old fixed 99 cap and keeps it stable', () => {
    const species = SPECIES_BY_ID.get('prunus-davidiana')!;
    const state = createSpeciesState('save', 'quota-seed', 1, 'spring', 'foothill', species.id);
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const plan = computeSeasonQuota(species, state, season, 'photo');
      expect(plan.base).toBe(12);
      expect(plan.factors.phenology).toBe(1);
      expect(plan.factors.protection).toBe(1);
      expect(plan.quota).toBeGreaterThanOrEqual(6);
    }
  });

  it('varies destructive quotas by phenological stage weight', () => {
    const species = SPECIES_BY_ID.get('liquidambar-formosana')!;
    const state = createSpeciesState('save', 'quota-seed', 1, 'autumn', 'ridge', species.id);
    const autumnLitter = computeSeasonQuota(species, state, 'autumn', 'litter');
    const springLitter = computeSeasonQuota(species, state, 'spring', 'litter');
    expect(autumnLitter.factors.phenology).toBeGreaterThan(springLitter.factors.phenology);
    expect(autumnLitter.quota).toBeGreaterThan(springLitter.quota);
  });

  it('shrinks quotas with protection level and bans cutting protected species', () => {
    const species = SPECIES_BY_ID.get('metasequoia-glyptostroboides')!;
    const state = createSpeciesState('save', 'quota-seed', 1, 'spring', 'stream_valley', species.id);
    const rubbing = computeSeasonQuota(species, state, 'spring', 'rubbing');
    const cutting = computeSeasonQuota(species, state, 'spring', 'cutting');
    expect(rubbing.factors.protection).toBe(0.5);
    expect(cutting.factors.protection).toBe(0);
    expect(cutting.quota).toBe(0);
    expect(computeSeasonQuota(species, state, 'spring', 'photo').factors.protection).toBe(1);
  });

  it('scales quotas with regional carrying capacity pressure', () => {
    const species = SPECIES_BY_ID.get('prunus-davidiana')!;
    const abundant = {
      ...createSpeciesState('save', 'quota-seed', 1, 'spring', 'foothill', species.id),
      population: species.zones.foothill!.carryingCapacity
    };
    const depleted = { ...abundant, population: Math.round(species.zones.foothill!.carryingCapacity * 0.1) };
    const high = computeSeasonQuota(species, abundant, 'spring', 'cutting');
    const low = computeSeasonQuota(species, depleted, 'spring', 'cutting');
    expect(high.factors.carryingCapacity).toBeGreaterThan(low.factors.carryingCapacity);
  });
});

describe('sampling safety', () => {
  it('does not allow destructive sampling on protected species', () => {
    const species = SPECIES_BY_ID.get('metasequoia-glyptostroboides')!;
    const site = generateSiteState('save', 'protected-seed', 1, 'spring', 5, 'stream_valley');
    const state = createSpeciesState('save', 'protected-seed', 1, 'spring', 'stream_valley', species.id);
    expect(evaluateSample(species, state, site, 'spring', 5, 'litter').allowed).toBe(false);
    expect(evaluateSample(species, state, site, 'spring', 5, 'cutting').allowed).toBe(false);
    expect(evaluateSample(species, state, site, 'spring', 5, 'photo').allowed).toBe(true);
  });
});

describe('annual dispersal', () => {
  it('moves surplus individuals into a suitable neighboring habitat without creating mass', () => {
    const species = SPECIES_BY_ID.get('prunus-davidiana')!;
    const base = generateSiteState('save', 'dispersal-seed', 1, 'spring', 5, 'foothill');
    const preferred = {
      temperatureC: species.preferred.temperatureC,
      humidity: species.preferred.humidity,
      soilMoisture: species.preferred.soilMoisture,
      lightLux: species.preferred.lightLux,
      windSpeed: 1,
      disturbance: 0
    };
    const foothill = { ...base, ...preferred };
    const mixed = { ...base, ...preferred, siteId: 'mixed_forest' as const };
    const source = {
      ...createSpeciesState('save', 'dispersal-seed', 1, 'spring', 'foothill', species.id),
      population: species.zones.foothill!.carryingCapacity * 0.95,
      health: 90
    };
    const target = {
      ...createSpeciesState('save', 'dispersal-seed', 1, 'spring', 'mixed_forest', species.id),
      population: 10,
      health: 85
    };
    const before = source.population + target.population;
    const result = disperseSpecies([source, target], [foothill, mixed]);
    const nextSource = result.find((state) => state.siteId === 'foothill')!;
    const nextTarget = result.find((state) => state.siteId === 'mixed_forest')!;
    expect(nextSource.population).toBeLessThan(source.population);
    expect(nextTarget.population).toBeGreaterThan(target.population);
    expect(nextSource.population + nextTarget.population).toBeCloseTo(before, 1);
  });
});

describe('phenology shift', () => {
  it('uses annual temperature shifts in the effective bloom window and presentation', () => {
    const species = SPECIES_BY_ID.get('prunus-davidiana')!;
    const site = generateSiteState('save', 'phenology-seed', 1, 'spring', 4, 'foothill');
    const state = createSpeciesState('save', 'phenology-seed', 1, 'spring', 'foothill', species.id);
    const shifted = { ...state, phenology: { ...state.phenology, shift: -1 } };
    expect(getPhenologyWindow(species, shifted, 'spring')).toEqual({ start: 1, peak: 4, end: 7 });
    expect(getPlantPresentation(species, shifted, 'spring', 4).stage).toBe('full_bloom');
    expect(applyOverwinter(state, { ...site, temperatureC: 12 }).phenology.shift).toBe(-1);
  });
});
