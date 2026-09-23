import type { SpeciesDefinition, SiteDefinition } from './types.ts';

export const CATALOG_VERSION = '1.0.0';

export const SITES: SiteDefinition[] = [
  {
    id: 'foothill',
    name: '山麓林缘',
    habitat: '光照充足、土壤较干、昼夜温差大',
    description: '早春最先回暖的开阔坡地，适合观察花期和地面覆盖。',
    mapX: 24,
    mapY: 68,
    temperatureOffset: 1.2,
    humidityOffset: -7,
    soilMoistureOffset: -8,
    lightMultiplier: 1.25
  },
  {
    id: 'mixed_forest',
    name: '针阔混交林',
    habitat: '半阴、腐殖质较厚、湿度中等',
    description: '结构复杂的林下生境，乔木、灌木与草本层叠分布。',
    mapX: 51,
    mapY: 43,
    temperatureOffset: -0.4,
    humidityOffset: 4,
    soilMoistureOffset: 3,
    lightMultiplier: 0.72
  },
  {
    id: 'stream_valley',
    name: '溪谷湿地',
    habitat: '湿度高、土壤含水量高、光照较弱',
    description: '水流调节小气候，是湿生植物和落叶乔木的重要栖息地。',
    mapX: 74,
    mapY: 74,
    temperatureOffset: -0.8,
    humidityOffset: 14,
    soilMoistureOffset: 18,
    lightMultiplier: 0.62
  },
  {
    id: 'ridge',
    name: '山脊疏林',
    habitat: '风大、土层薄、温度偏低、扩散距离长',
    description: '环境波动最明显的区域，物候变化也更早显露。',
    mapX: 75,
    mapY: 22,
    temperatureOffset: -2.1,
    humidityOffset: -3,
    soilMoistureOffset: -5,
    lightMultiplier: 1.05
  }
];

export const SPECIES: SpeciesDefinition[] = [
  {
    id: 'prunus-davidiana',
    name: '山桃',
    latinName: 'Prunus davidiana',
    lifeForm: '乔木',
    description: '早春先花后叶，是山麓地区最直观的物候指示物种之一。',
    protected: false,
    zones: {
      foothill: { initialPopulation: 180, carryingCapacity: 280 },
      mixed_forest: { initialPopulation: 42, carryingCapacity: 145 },
      ridge: { initialPopulation: 34, carryingCapacity: 105 }
    },
    preferred: { temperatureC: 17, humidity: 58, soilMoisture: 42, lightLux: 34000 },
    tolerance: { temperatureC: 13, humidity: 32, soilMoisture: 28, lightLux: 24000 },
    ecology: { growthRate: 0.14, stressRate: 0.025, seedRate: 0.07, dispersalRate: 0.75 },
    phenology: {
      spring: { start: 2, peak: 5, end: 8 },
      summer: { start: 0, peak: 0, end: 0 }
    },
    leafTexture: 'smooth',
    colors: { green: '#557a45', autumn: '#b57f35', winter: '#6d604f' },
    sampleProtocol: ['photo', 'rubbing', 'litter', 'cutting']
  },
  {
    id: 'orychophragmus-violaceus',
    name: '二月兰',
    latinName: 'Orychophragmus violaceus',
    lifeForm: '草本',
    description: '春季铺展于林缘地表，花期和地表覆盖对温度和光照敏感。',
    protected: false,
    zones: {
      foothill: { initialPopulation: 260, carryingCapacity: 430 },
      mixed_forest: { initialPopulation: 110, carryingCapacity: 260 },
      stream_valley: { initialPopulation: 36, carryingCapacity: 135 }
    },
    preferred: { temperatureC: 15, humidity: 64, soilMoisture: 52, lightLux: 22000 },
    tolerance: { temperatureC: 12, humidity: 30, soilMoisture: 30, lightLux: 18000 },
    ecology: { growthRate: 0.22, stressRate: 0.035, seedRate: 0.11, dispersalRate: 0.38 },
    phenology: {
      spring: { start: 1, peak: 4, end: 8 },
      summer: { start: 9, peak: 10, end: 10 }
    },
    leafTexture: 'pubescent',
    colors: { green: '#648b4a', autumn: '#a69a4c', winter: '#665f4a' },
    sampleProtocol: ['photo', 'rubbing', 'litter']
  },
  {
    id: 'rhododendron-simsii',
    name: '杜鹃',
    latinName: 'Rhododendron simsii',
    lifeForm: '灌木',
    description: '林下与山脊常见的春季开花灌木，革质叶可反映水分压力。',
    protected: false,
    zones: {
      mixed_forest: { initialPopulation: 170, carryingCapacity: 270 },
      ridge: { initialPopulation: 118, carryingCapacity: 225 },
      stream_valley: { initialPopulation: 28, carryingCapacity: 110 },
      foothill: { initialPopulation: 45, carryingCapacity: 140 }
    },
    preferred: { temperatureC: 18, humidity: 70, soilMoisture: 55, lightLux: 18000 },
    tolerance: { temperatureC: 14, humidity: 30, soilMoisture: 32, lightLux: 16000 },
    ecology: { growthRate: 0.12, stressRate: 0.03, seedRate: 0.055, dispersalRate: 0.3 },
    phenology: {
      spring: { start: 4, peak: 7, end: 10 },
      summer: { start: 8, peak: 9, end: 10 }
    },
    leafTexture: 'leathery',
    colors: { green: '#315f3f', autumn: '#55714a', winter: '#35523d' },
    sampleProtocol: ['photo', 'rubbing', 'litter', 'cutting']
  },
  {
    id: 'camellia-japonica',
    name: '山茶',
    latinName: 'Camellia japonica',
    lifeForm: '灌木',
    description: '冬季至早春开花，革质叶片和花芽对暖冬反应明显。',
    protected: false,
    zones: {
      mixed_forest: { initialPopulation: 85, carryingCapacity: 180 },
      stream_valley: { initialPopulation: 35, carryingCapacity: 120 }
    },
    preferred: { temperatureC: 13, humidity: 74, soilMoisture: 58, lightLux: 15000 },
    tolerance: { temperatureC: 12, humidity: 28, soilMoisture: 30, lightLux: 14000 },
    ecology: { growthRate: 0.09, stressRate: 0.022, seedRate: 0.045, dispersalRate: 0.24 },
    phenology: {
      winter: { start: 1, peak: 5, end: 10 },
      spring: { start: 1, peak: 2, end: 4 }
    },
    leafTexture: 'leathery',
    colors: { green: '#285b40', autumn: '#3f6847', winter: '#214c36' },
    sampleProtocol: ['photo', 'rubbing', 'litter']
  },
  {
    id: 'acorus-calamus',
    name: '菖蒲',
    latinName: 'Acorus calamus',
    lifeForm: '湿生草本',
    description: '依赖稳定的浅水与湿润土壤，叶片姿态能反映水位变化。',
    protected: false,
    zones: {
      stream_valley: { initialPopulation: 230, carryingCapacity: 380 },
      mixed_forest: { initialPopulation: 28, carryingCapacity: 110 }
    },
    preferred: { temperatureC: 21, humidity: 84, soilMoisture: 82, lightLux: 12000 },
    tolerance: { temperatureC: 15, humidity: 25, soilMoisture: 22, lightLux: 12000 },
    ecology: { growthRate: 0.2, stressRate: 0.04, seedRate: 0.08, dispersalRate: 0.22 },
    phenology: {
      spring: { start: 3, peak: 6, end: 10 },
      summer: { start: 1, peak: 5, end: 9 }
    },
    leafTexture: 'smooth',
    colors: { green: '#4f7d43', autumn: '#887f45', winter: '#5e6544' },
    sampleProtocol: ['photo', 'rubbing', 'litter']
  },
  {
    id: 'carex-community',
    name: '苔草群落',
    latinName: 'Carex spp.',
    lifeForm: '草本群落',
    description: '地表覆盖变化较快，是溪谷与山脊生境稳定性的敏感指标。',
    protected: false,
    zones: {
      stream_valley: { initialPopulation: 285, carryingCapacity: 450 },
      ridge: { initialPopulation: 165, carryingCapacity: 320 },
      foothill: { initialPopulation: 145, carryingCapacity: 260 },
      mixed_forest: { initialPopulation: 95, carryingCapacity: 220 }
    },
    preferred: { temperatureC: 18, humidity: 75, soilMoisture: 66, lightLux: 17000 },
    tolerance: { temperatureC: 16, humidity: 30, soilMoisture: 34, lightLux: 18000 },
    ecology: { growthRate: 0.24, stressRate: 0.03, seedRate: 0.1, dispersalRate: 0.42 },
    phenology: {
      spring: { start: 3, peak: 6, end: 10 },
      summer: { start: 1, peak: 4, end: 8 }
    },
    leafTexture: 'rough',
    colors: { green: '#667d3d', autumn: '#9b8140', winter: '#6b6848' },
    sampleProtocol: ['photo', 'rubbing', 'litter']
  },
  {
    id: 'metasequoia-glyptostroboides',
    name: '水杉',
    latinName: 'Metasequoia glyptostroboides',
    lifeForm: '乔木',
    description: '溪谷中的落叶针叶乔木，禁止破坏性采样。',
    protected: true,
    protectionTier: 'class_i',
    zones: {
      stream_valley: { initialPopulation: 78, carryingCapacity: 145 },
      mixed_forest: { initialPopulation: 20, carryingCapacity: 80 }
    },
    preferred: { temperatureC: 18, humidity: 80, soilMoisture: 78, lightLux: 26000 },
    tolerance: { temperatureC: 14, humidity: 25, soilMoisture: 26, lightLux: 20000 },
    ecology: { growthRate: 0.1, stressRate: 0.025, seedRate: 0.04, dispersalRate: 0.28 },
    phenology: {
      spring: { start: 3, peak: 6, end: 9 },
      summer: { start: 4, peak: 6, end: 8 }
    },
    leafTexture: 'needle',
    colors: { green: '#467153', autumn: '#ad7040', winter: '#786a52' },
    sampleProtocol: ['photo', 'rubbing', 'litter']
  },
  {
    id: 'quercus-acutissima',
    name: '麻栎',
    latinName: 'Quercus acutissima',
    lifeForm: '乔木',
    description: '叶缘锯齿明显，是混交林结构变化的长期观察对象。',
    protected: false,
    zones: {
      mixed_forest: { initialPopulation: 155, carryingCapacity: 255 },
      foothill: { initialPopulation: 72, carryingCapacity: 180 },
      ridge: { initialPopulation: 58, carryingCapacity: 150 }
    },
    preferred: { temperatureC: 19, humidity: 63, soilMoisture: 50, lightLux: 31000 },
    tolerance: { temperatureC: 16, humidity: 34, soilMoisture: 32, lightLux: 22000 },
    ecology: { growthRate: 0.11, stressRate: 0.024, seedRate: 0.05, dispersalRate: 0.32 },
    phenology: {
      spring: { start: 4, peak: 7, end: 10 },
      summer: { start: 5, peak: 7, end: 9 }
    },
    leafTexture: 'rough',
    colors: { green: '#3f6a38', autumn: '#a97836', winter: '#685b49' },
    sampleProtocol: ['photo', 'rubbing', 'litter', 'cutting']
  },
  {
    id: 'liquidambar-formosana',
    name: '枫香',
    latinName: 'Liquidambar formosana',
    lifeForm: '乔木',
    description: '秋季叶色变化显著，山脊种群对强风和干旱较敏感。',
    protected: false,
    zones: {
      ridge: { initialPopulation: 132, carryingCapacity: 225 },
      mixed_forest: { initialPopulation: 66, carryingCapacity: 165 },
      foothill: { initialPopulation: 32, carryingCapacity: 115 }
    },
    preferred: { temperatureC: 20, humidity: 68, soilMoisture: 54, lightLux: 36000 },
    tolerance: { temperatureC: 16, humidity: 34, soilMoisture: 32, lightLux: 26000 },
    ecology: { growthRate: 0.13, stressRate: 0.032, seedRate: 0.06, dispersalRate: 0.58 },
    phenology: {
      spring: { start: 4, peak: 7, end: 10 },
      summer: { start: 5, peak: 8, end: 10 }
    },
    leafTexture: 'compound',
    colors: { green: '#3c7043', autumn: '#b54e32', winter: '#6f5644' },
    sampleProtocol: ['photo', 'rubbing', 'litter', 'cutting']
  },
  {
    id: 'ginkgo-biloba',
    name: '银杏',
    latinName: 'Ginkgo biloba',
    lifeForm: '乔木',
    description: '叶形独特、秋季叶色变化集中，可作为物候偏移的明显标记。',
    protected: false,
    zones: {
      mixed_forest: { initialPopulation: 108, carryingCapacity: 185 },
      foothill: { initialPopulation: 42, carryingCapacity: 130 },
      stream_valley: { initialPopulation: 26, carryingCapacity: 100 }
    },
    preferred: { temperatureC: 17, humidity: 66, soilMoisture: 52, lightLux: 29000 },
    tolerance: { temperatureC: 15, humidity: 34, soilMoisture: 32, lightLux: 22000 },
    ecology: { growthRate: 0.09, stressRate: 0.022, seedRate: 0.045, dispersalRate: 0.3 },
    phenology: {
      spring: { start: 4, peak: 7, end: 10 },
      summer: { start: 5, peak: 8, end: 10 }
    },
    leafTexture: 'smooth',
    colors: { green: '#5b8044', autumn: '#d3a838', winter: '#71644d' },
    sampleProtocol: ['photo', 'rubbing', 'litter', 'cutting']
  }
];

export const SPECIES_BY_ID = new Map(SPECIES.map((species) => [species.id, species]));
export const SITES_BY_ID = new Map(SITES.map((site) => [site.id, site]));
