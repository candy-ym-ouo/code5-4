import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SEASON_LABELS,
  SLOT_LABELS,
  type GameCommand,
  type QuotaFactors,
  type SampleMethod,
  type SpeciesSnapshot
} from '@shanhai/contracts';
import { useGame } from '../game-context.tsx';
import { EnvironmentForm, ObservationForm } from '../components/ObservationForm.tsx';
import { PlantGlyph } from '../components/PlantGlyph.tsx';
import { ReviewPanel } from '../components/ReviewPanel.tsx';

const SAMPLE_LABELS: Record<SampleMethod, string> = {
  photo: '拍照',
  rubbing: '叶脉拓印',
  litter: '落叶采集',
  cutting: '标准剪取'
};

const STATUS_LABELS: Record<SpeciesSnapshot['status'], string> = {
  growing: '增长',
  stable: '稳定',
  vulnerable: '脆弱',
  endangered: '濒危',
  absent: '消失'
};

export function PlayPage() {
  const { world, execute, pending } = useGame();
  const currentSite = world.sites.find((site) => site.current) ?? world.sites[0]!;
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(currentSite.species[0]?.id ?? '');
  const [restoreAction, setRestoreAction] = useState<'reduce_disturbance' | 'protect_seed_bank' | 'restore_wetland' | 'establish_plot'>('reduce_disturbance');

  useEffect(() => {
    if (!currentSite.species.some((species) => species.id === selectedSpeciesId)) {
      setSelectedSpeciesId(currentSite.species[0]?.id ?? '');
    }
  }, [currentSite, selectedSpeciesId]);

  useEffect(() => {
    if (currentSite.id !== 'stream_valley' && restoreAction === 'restore_wetland') {
      setRestoreAction('reduce_disturbance');
    }
  }, [currentSite.id, restoreAction]);

  const selectedSpecies = useMemo(
    () => currentSite.species.find((species) => species.id === selectedSpeciesId) ?? currentSite.species[0] ?? null,
    [currentSite, selectedSpeciesId]
  );

  const run = async (command: GameCommand): Promise<boolean> => {
    try {
      await execute(command);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="play-layout">
      <section className="world-column">
        <div className="field-heading">
          <div>
            <p className="eyebrow">FIELD SITE · {currentSite.name}</p>
            <h1>{world.year} 年 {SEASON_LABELS[world.season]}季 · 第 {world.day} 日</h1>
            <p>{currentSite.description}</p>
          </div>
          <div className="time-chip">
            <span>{SLOT_LABELS[world.slot - 1] ?? '暮'}</span>
            <strong>{world.actionPoints} AP</strong>
          </div>
        </div>

        {world.phase !== 'active' ? (
          <ReviewPanel
            world={world}
            busy={pending}
            onContinueSeason={() => void run({ type: 'BEGIN_NEXT_SEASON' })}
            onContinueYear={() => void run({ type: 'BEGIN_NEXT_YEAR' })}
          />
        ) : (
          <>
            <div className="map-and-weather">
              <div className="mountain-map">
                <div className="map-contours" aria-hidden="true" />
                {world.sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className={`map-stop ${site.current ? 'active' : ''}`}
                    style={{ left: `${site.mapX}%`, top: `${site.mapY}%` }}
                    onClick={() => {
                      if (!site.current) void run({ type: 'MOVE_ZONE', siteId: site.id });
                    }}
                    disabled={pending}
                  >
                    <span>{site.name}</span>
                    <small>{site.species.length} 个对象</small>
                  </button>
                ))}
                <div className="map-path" aria-hidden="true" />
              </div>
              <aside className="weather-card">
                <span className="weather-symbol">{weatherSymbol(currentSite.environment.weather)}</span>
                <div>
                  <p className="eyebrow">CURRENT ENVIRONMENT</p>
                  <h2>{weatherLabel(currentSite.environment.weather)}</h2>
                </div>
                <dl>
                  <div><dt>温度</dt><dd>{currentSite.environment.temperatureC.toFixed(1)}°C</dd></div>
                  <div><dt>湿度</dt><dd>{currentSite.environment.humidity.toFixed(0)}%</dd></div>
                  <div><dt>土壤</dt><dd>{currentSite.environment.soilMoisture.toFixed(0)}%</dd></div>
                  <div><dt>光照</dt><dd>{Math.round(currentSite.environment.lightLux).toLocaleString()} lux</dd></div>
                  <div><dt>风速</dt><dd>{currentSite.environment.windSpeed.toFixed(1)} m/s</dd></div>
                  <div><dt>干扰</dt><dd>{Math.round(currentSite.environment.disturbance * 100)}%</dd></div>
                </dl>
                <button className="button button-quiet full-width" type="button" onClick={() => void run({ type: 'WAIT' })} disabled={pending}>
                  原地等待一轮
                </button>
              </aside>
            </div>

            <section className="site-species">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">VISIBLE SUBJECTS</p>
                  <h2>当前可观察对象</h2>
                </div>
                <span>选择一个对象填写观察笔记</span>
              </div>
              <div className="species-strip">
                {currentSite.species.map((species) => (
                  <button
                    type="button"
                    key={species.id}
                    className={`species-tab ${selectedSpecies?.id === species.id ? 'active' : ''}`}
                    onClick={() => setSelectedSpeciesId(species.id)}
                  >
                    <span className="species-dot" style={{ background: species.phenology.dominantColor }} />
                    <span>
                      <strong>{species.name}</strong>
                      <small>{STATUS_LABELS[species.status]} · 健康 {Math.round(species.health)}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            {selectedSpecies && (
              <section className="species-workspace">
                <div className="species-visual">
                  <PlantGlyph species={selectedSpecies} large />
                  <div className={`habitat-status status-${selectedSpecies.status}`}>
                    <span>区域状态</span>
                    <strong>{STATUS_LABELS[selectedSpecies.status]}</strong>
                  </div>
                  <dl className="species-metrics">
                    <div><dt>种群</dt><dd>{selectedSpecies.population.toFixed(0)}</dd></div>
                    <div><dt>承载量</dt><dd>{selectedSpecies.carryingCapacity}</dd></div>
                    <div><dt>健康</dt><dd>{selectedSpecies.health.toFixed(0)}</dd></div>
                    <div><dt>种子库</dt><dd>{selectedSpecies.seedBank.toFixed(0)}</dd></div>
                  </dl>
                  <Link className="text-link" to={`/play/species/${selectedSpecies.id}`}>查看物种档案 →</Link>
                </div>
                <div className="notebook-sheet">
                  <div className="sheet-heading">
                    <div>
                      <p className="eyebrow">OBSERVATION NOTE</p>
                      <h2>{selectedSpecies.name}</h2>
                      <p><i>{selectedSpecies.latinName}</i> · 当前可见形态颜色 <span className="inline-color" style={{ background: selectedSpecies.phenology.dominantColor }} /></p>
                    </div>
                    {selectedSpecies.protected && <span className="protected-badge">保护物种</span>}
                  </div>
                  <ObservationForm
                    key={`${selectedSpecies.id}-${world.revision}`}
                    species={selectedSpecies}
                    site={currentSite}
                    busy={pending}
                    onSubmit={(values) => run({ type: 'OBSERVE_PLANT', speciesId: selectedSpecies.id, values })}
                  />
                </div>
              </section>
            )}

            <section className="field-tools">
              <div className="tool-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">SAMPLING PROTOCOL</p>
                    <h2>采集方式</h2>
                  </div>
                </div>
                <p className="helper-text">
                  绿色表示安全且当前可用。配额随物候期、保护级别与区域承载力逐季变动；错误协议仍可能执行，但会真实影响生态。
                </p>
                <div className="sample-grid">
                  {(Object.keys(SAMPLE_LABELS) as SampleMethod[]).map((method) => {
                    const limit = selectedSpecies?.sampleLimits[method];
                    const exhausted = limit ? limit.used >= limit.limit : false;
                    return (
                      <button
                        key={method}
                        type="button"
                        className={`sample-button${exhausted ? ' sample-exhausted' : ''}`}
                        disabled={pending || !selectedSpecies || !limit?.allowed}
                        onClick={() => {
                          if (selectedSpecies) void run({ type: 'TAKE_SAMPLE', speciesId: selectedSpecies.id, method });
                        }}
                        title={limit ? quotaTitle(limit.factors) : undefined}
                      >
                        <strong>{SAMPLE_LABELS[method]}</strong>
                        <span>
                          {limit ? `${limit.used}/${limit.limit}` : '不可用'}
                          {limit?.pinned ? ' · 本季锁定' : ''}
                        </span>
                        {limit && !limit.pinned && limit.limit > 0 && (
                          <small className="quota-hint">动态配额</small>
                        )}
                        {limit?.reason && <small>{limit.reason}</small>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tool-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">ENVIRONMENT STATION</p>
                    <h2>环境记录</h2>
                  </div>
                </div>
                <EnvironmentForm
                  key={`${currentSite.id}-${world.revision}`}
                  site={currentSite}
                  busy={pending}
                  onSubmit={(values) => run({ type: 'RECORD_ENVIRONMENT', values })}
                />
              </div>
            </section>

            {world.restorationUnlocked && selectedSpecies && (
              <section className="restoration-card">
                <div>
                  <p className="eyebrow">RESTORATION UNLOCKED</p>
                  <h2>把年报结论变成行动</h2>
                  <p>修复行动消耗 2 个行动点，影响会在季末或下一年度显现。</p>
                </div>
                <label>
                  <span>修复方式</span>
                  <select value={restoreAction} onChange={(event) => setRestoreAction(event.target.value as typeof restoreAction)}>
                    <option value="reduce_disturbance">降低区域干扰</option>
                    <option value="protect_seed_bank">保留种子区</option>
                    <option value="restore_wetland" disabled={currentSite.id !== 'stream_valley'}>恢复湿生带（仅溪谷）</option>
                    <option value="establish_plot">设置长期观察样方</option>
                  </select>
                </label>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending || world.actionPoints < 2}
                  onClick={() => void run({ type: 'RESTORE_HABITAT', speciesId: selectedSpecies.id, action: restoreAction })}
                >
                  执行修复
                </button>
              </section>
            )}

            <div className="end-season-bar">
              <div>
                <strong>本季第 {world.day} 日</strong>
                <span>{world.day < 8 ? '第 8 日后可结束季节结算' : '环境与采集影响已准备结算'}</span>
              </div>
              <button
                className="button button-primary"
                type="button"
                disabled={pending || world.day < 8 || world.actionPoints > 0 && world.day >= 10}
                onClick={() => void run({ type: 'END_SEASON' })}
              >
                结束 {SEASON_LABELS[world.season]}季
              </button>
            </div>
          </>
        )}
      </section>

      <aside className="event-rail">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIELD EVENTS</p>
            <h2>最近变化</h2>
          </div>
        </div>
        <div className="event-list">
          {world.recentEvents.length === 0 && <p className="empty-copy">还没有事件。开始移动、观察或记录环境。</p>}
          {world.recentEvents.map((event) => (
            <article key={event.id}>
              <span>#{event.sequence}</span>
              <strong>{event.message}</strong>
              <ul>
                {event.effects.map((effect) => <li key={effect}>{effect}</li>)}
              </ul>
              <time>{new Date(event.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}

function weatherSymbol(weather: string): string {
  return ({ sunny: '☀', cloudy: '◒', overcast: '☁', light_rain: '☂', heavy_rain: '☔', fog: '≋', snow: '❄' } as Record<string, string>)[weather] ?? '◌';
}

function weatherLabel(weather: string): string {
  return ({ sunny: '晴', cloudy: '多云', overcast: '阴', light_rain: '小雨', heavy_rain: '大雨', fog: '雾', snow: '雪' } as Record<string, string>)[weather] ?? weather;
}

function quotaTitle(factors: QuotaFactors): string {
  return `基础 ${factors.base} × 物候 ${factors.phenology} × 保护 ${factors.protection} × 承载力 ${factors.occupancy} × 干扰 ${factors.disturbance}`;
}
