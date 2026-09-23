import type {
  PhenologyStage,
  ProtectionTier,
  QuotaFactors,
  SampleMethod,
  Season
} from '@shanhai/contracts';
import type { SampleQuota, SiteState, SpeciesDefinition, SpeciesState } from './types.ts';
import { clamp, getPlantPresentation, getStatus } from './simulation.ts';

/**
 * 非破坏性记录（拍照）几乎不产生生态压力，给一个足够大的操作上限即可，
 * 不参与物候/保护/承载力调节。
 */
export const PHOTO_QUOTA = 99;

/**
 * 每个采集方式在“最优物候期、常规物种、种群健康、区域无人为干扰”下的基础季配额。
 * 相对历史固定上限（rubbing 3 / litter 3 / cutting 1），基线略放宽，
 * 再由下列系数随生态状况收缩或扩张。
 */
export const BASE_QUOTA: Record<Exclude<SampleMethod, 'photo'>, number> = {
  rubbing: 4,
  litter: 4,
  cutting: 2
};

/**
 * 物候期系数：只在“操作安全/材料可得”的阶段放宽配额，
 * 敏感期（现蕾、盛花、休眠）收紧或归零。
 */
const PHENOLOGY_FACTORS: Record<Exclude<SampleMethod, 'photo'>, Partial<Record<PhenologyStage, number>>> = {
  rubbing: {
    leafing: 0.5,
    budding: 0,
    early_bloom: 1,
    full_bloom: 1.5,
    late_bloom: 1.25,
    fruiting: 1,
    leaf_color: 1.25,
    leaf_fall: 0.75,
    dormant: 0.5
  },
  litter: {
    // 非落叶期地表仍可能有少量残枝：保留极小额度（通常 1 次），
    // 让“判断失误的错采”可发生并承受生态代价，但很快耗尽。
    leafing: 0.25,
    budding: 0.25,
    early_bloom: 0.25,
    full_bloom: 0.25,
    late_bloom: 0.25,
    fruiting: 0.5,
    leaf_color: 1,
    leaf_fall: 1.75,
    dormant: 1.25
  },
  cutting: {
    leafing: 0.5,
    budding: 0,
    early_bloom: 0.25,
    full_bloom: 0,
    late_bloom: 0.5,
    fruiting: 1,
    leaf_color: 0.75,
    leaf_fall: 0.5,
    dormant: 0
  }
};

/** 保护级别系数：保护越严，破坏性/接触式操作配额越低。拍照恒为 1。 */
const PROTECTION_FACTORS: Record<
  Exclude<SampleMethod, 'photo'>,
  Record<Exclude<ProtectionTier, 'unprotected'>, number>
> = {
  rubbing: {
    local: 0.75,
    class_ii: 0.5,
    class_i: 0.5
  },
  litter: {
    local: 0.5,
    class_ii: 0.25,
    class_i: 0
  },
  cutting: {
    local: 0,
    class_ii: 0,
    class_i: 0
  }
};

export function getProtectionTier(definition: SpeciesDefinition): ProtectionTier {
  if (definition.protectionTier) {
    return definition.protectionTier;
  }
  return definition.protected ? 'class_i' : 'unprotected';
}

/**
 * 区域承载力压力：以当前种群相对承载力的占比分档。
 * 种群越接近或超过承载力，可承受的人为损失越小。
 */
export function occupancyFactor(population: number, carryingCapacity: number): number {
  const ratio = population / Math.max(1, carryingCapacity);
  if (ratio >= 0.85) return 1;
  if (ratio >= 0.6) return 0.75;
  if (ratio >= 0.35) return 0.5;
  if (ratio >= 0.15) return 0.25;
  return 0;
}

/**
 * 区域人为干扰：干扰越高，本季越应收缩破坏性取样。
 * 拍照不受影响。
 */
export function disturbanceFactor(method: SampleMethod, disturbance: number): number {
  if (method === 'photo') {
    return 1;
  }
  const level = clamp(disturbance, 0, 0.42) / 0.42;
  if (method === 'cutting') {
    return roundFactor(1 - level * 0.6);
  }
  return roundFactor(1 - level * 0.3);
}

export interface QuotaContext {
  method: SampleMethod;
  definition: SpeciesDefinition;
  state: SpeciesState;
  site: SiteState;
  season: Season;
  day: number;
  used?: number;
  /** 配额账本已钉住的上限；提供后不再重新计算，保证季内展示与执行一致。 */
  pinnedLimit?: number;
  /** 钉住上限时保存的原始系数明细，用于在 UI 上继续展示配额构成。 */
  pinnedFactors?: QuotaFactors;
}

/**
 * 计算某采集方式在当前物候期、保护级别与区域承载力下的季配额。
 * 纯函数：相同输入必得相同输出，便于服务端、客户端与测试共享。
 */
export function computeSampleQuota(context: QuotaContext): SampleQuota {
  const { method, definition, state, site, season, day, used = 0 } = context;

  if (context.pinnedLimit !== undefined) {
    return {
      method,
      limit: context.pinnedLimit,
      used,
      pinned: true,
      factors: context.pinnedFactors ?? pinnedFactors(context.pinnedLimit)
    };
  }

  const profile = definition.zones[site.siteId];
  if (method === 'photo' || !profile) {
    return {
      method,
      limit: method === 'photo' ? PHOTO_QUOTA : 0,
      used,
      pinned: false,
      factors: {
        base: method === 'photo' ? PHOTO_QUOTA : 0,
        phenology: 1,
        protection: 1,
        occupancy: 1,
        disturbance: 1
      }
    };
  }

  const stage = getPlantPresentation(definition, state, season, day).stage;
  const tier = getProtectionTier(definition);
  const phenology = PHENOLOGY_FACTORS[method][stage] ?? 0;
  const protection = tier === 'unprotected' ? 1 : PROTECTION_FACTORS[method][tier];
  // 拓印属于接触式但非取材，对种群压力小，不受承载力压力系数约束。
  const occupancy = method === 'rubbing' ? 1 : occupancyFactor(state.population, profile.carryingCapacity);
  const disturbance = disturbanceFactor(method, site.disturbance);
  const base = BASE_QUOTA[method];
  const factors: QuotaFactors = {
    base,
    phenology: roundFactor(phenology),
    protection: roundFactor(protection),
    occupancy: roundFactor(occupancy),
    disturbance
  };
  const raw = base * phenology * protection * occupancy * disturbance;
  const limit = raw <= 0 ? 0 : Math.max(1, Math.floor(raw + 1e-4));

  return { method, limit, used, pinned: false, factors };
}

function pinnedFactors(limit: number): QuotaFactors {
  return { base: limit, phenology: 1, protection: 1, occupancy: 1, disturbance: 1 };
}

function roundFactor(value: number): number {
  return Math.round(clamp(value, 0, 2) * 100) / 100;
}

/** 状态派生辅助：与 simulation 内的 getStatus 保持一致的导出包装。 */
export function quotaStatus(population: number, carryingCapacity: number, health: number): SpeciesState['status'] {
  return getStatus(population, carryingCapacity, health);
}
