import type {
  LeafTexture,
  PhenologyStage,
  ProtectionTier,
  QuotaFactors,
  SampleMethod,
  Season,
  SiteId
} from '@shanhai/contracts';

export type { QuotaFactors };

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
  /** 法定/设定保护级别；缺省按 protected 字段推断。 */
  protectionTier?: ProtectionTier;
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

export interface SampleQuota {
  method: SampleMethod;
  /** 本季剩余判断所依据的总量上限（动态计算或账本钉住）。 */
  limit: number;
  /** 已使用次数。 */
  used: number;
  factors: QuotaFactors;
  /** 上限是否已被本季配额账本钉住（钉住后不再随状态浮动）。 */
  pinned: boolean;
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
  quota: SampleQuota;
}

export interface SeasonEvolutionResult {
  state: SpeciesState;
  populationChange: number;
  healthChange: number;
}
