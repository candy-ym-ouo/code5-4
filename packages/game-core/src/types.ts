import type { LeafTexture, PhenologyStage, SampleMethod, Season, SiteId } from '@shanhai/contracts';

export interface SiteDefinition {
  id: SiteId;
  name: string;
  habitat: string;
  description: string;
  mapX: number;
  mapY: number;
  temperatureOffset: number;
  humidityOffset: number;
  soilMoistureOffset: number;
  lightMultiplier: number;
}

export interface ZoneProfile {
  initialPopulation: number;
  carryingCapacity: number;
}

export interface SpeciesDefinition {
  id: string;
  name: string;
  latinName: string;
  lifeForm: string;
  description: string;
  protected: boolean;
  zones: Partial<Record<SiteId, ZoneProfile>>;
  preferred: {
    temperatureC: number;
    humidity: number;
    soilMoisture: number;
    lightLux: number;
  };
  tolerance: {
    temperatureC: number;
    humidity: number;
    soilMoisture: number;
    lightLux: number;
  };
  ecology: {
    growthRate: number;
    stressRate: number;
    seedRate: number;
    dispersalRate: number;
  };
  phenology: Partial<Record<Season, { start: number; peak: number; end: number }>>;
  leafTexture: LeafTexture;
  colors: Record<'green' | 'autumn' | 'winter', string>;
  sampleProtocol: SampleMethod[];
}

export interface SiteState {
  saveId: string;
  year: number;
  siteId: SiteId;
  weather: string;
  temperatureC: number;
  humidity: number;
  soilMoisture: number;
  lightLux: number;
  windSpeed: number;
  disturbance: number;
}

export interface PhenologyState {
  bloomStartDay: number;
  bloomPeakDay: number;
  bloomEndDay: number;
  shift: number;
}

export interface SpeciesState {
  saveId: string;
  year: number;
  siteId: SiteId;
  speciesId: string;
  population: number;
  health: number;
  seedBank: number;
  suitability: number;
  status: string;
  phenology: PhenologyState;
}

export interface PlantPresentation {
  stage: PhenologyStage;
  label: string;
  dominantColor: string;
  leafTexture: LeafTexture;
}

export interface SampleDecision {
  allowed: boolean;
  reason?: string;
  protocolMatch: boolean;
  effects: {
    health: number;
    populationDelta: number;
    seedBankDelta: number;
  };
  messages: string[];
}

export interface QuotaFactors {
  phenology: number;
  protection: number;
  carryingCapacity: number;
}

export interface SeasonQuota {
  method: SampleMethod;
  base: number;
  quota: number;
  factors: QuotaFactors;
}

export interface SeasonEvolutionResult {
  state: SpeciesState;
  populationChange: number;
  healthChange: number;
}
