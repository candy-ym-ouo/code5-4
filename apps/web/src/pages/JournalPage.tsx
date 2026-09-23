import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SEASONS, SEASON_LABELS, SLOT_LABELS, type Season } from '@shanhai/contracts';
import { api } from '../api.ts';
import { useGame } from '../game-context.tsx';

export function JournalPage() {
  const { world, execute, pending } = useGame();
  const [season, setSeason] = useState<Season | ''>('');
  const journal = useQuery({
    queryKey: ['journal', world.saveId, season],
    queryFn: () => api.getJournal(world.saveId, season ? { season } : {})
  });

  const revoke = async (sampleId: string) => {
    await execute({ type: 'REVOKE_SAMPLE', sampleId });
  };

  return (
    <div className="document-page">
      <header className="document-heading">
        <div>
          <p className="eyebrow">OBSERVATION JOURNAL</p>
          <h1>山林观察笔记</h1>
          <p>所有植物、环境与采集记录按真实游戏时间保存。</p>
        </div>
        <label className="filter-field">
          <span>季节筛选</span>
          <select value={season} onChange={(event) => setSeason(event.target.value as Season | '')}>
            <option value="">全部季节</option>
            {SEASONS.map((item) => <option key={item} value={item}>{SEASON_LABELS[item]}季</option>)}
          </select>
        </label>
      </header>

      {journal.isLoading && <p className="empty-copy">正在翻阅笔记…</p>}
      {journal.isError && <p className="form-error">笔记读取失败，请刷新重试。</p>}
      {journal.data?.entries.length === 0 && <p className="empty-copy">当前筛选下还没有记录。</p>}

      <div className="journal-grid">
        {journal.data?.entries.map((entry) => (
          <article className={`journal-card journal-${entry.kind}`} key={`${entry.kind}-${entry.id}`}>
            <div className="journal-meta">
              <span>{entry.year} 年 · {SEASON_LABELS[entry.season]}季 · 第 {entry.day} 日 {SLOT_LABELS[entry.slot - 1] ?? ''}</span>
              <span>{entry.siteName}</span>
            </div>
            <div className="journal-title">
              <h2>{entry.kind === 'sample' ? '采集记录' : entry.kind === 'environment' ? '环境记录' : entry.speciesName}</h2>
              {entry.score !== null && <strong>{entry.score.toFixed(0)} 分</strong>}
            </div>
            {entry.kind === 'plant' && (
              <div className="journal-values">
                <span>物候 {String(entry.details.phenology ?? '—')}</span>
                <span>纹理 {String(entry.details.leafTexture ?? '—')}</span>
                <span>温度 {String(entry.details.temperatureC ?? '—')}°C</span>
              </div>
            )}
            {entry.kind === 'environment' && (
              <div className="journal-values">
                <span>{String(entry.details.temperatureC)}°C</span>
                <span>湿度 {String(entry.details.humidity)}%</span>
                <span>土壤 {String(entry.details.soilMoisture)}%</span>
              </div>
            )}
            {entry.kind === 'sample' && (
              <div className="journal-values">
                <span>{String(entry.details.methodLabel)}</span>
                {entry.details.revoked ? (
                  <span className="neutral">已撤销 · 生态影响已逆转</span>
                ) : (
                  <span className={entry.details.protocolMatch ? 'positive' : 'negative'}>
                    {entry.details.protocolMatch ? '符合协议' : '不符合协议'}
                  </span>
                )}
              </div>
            )}
            {entry.note && <p>{entry.note}</p>}
            <footer>
              <time>{new Date(entry.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
              {entry.kind === 'sample' &&
                !entry.details.revoked &&
                entry.year === world.year &&
                entry.season === world.season &&
                world.phase === 'active' && (
                  <button
                    type="button"
                    className="text-link text-link-button"
                    disabled={pending}
                    onClick={() => void revoke(entry.id)}
                    title="当季可撤销：样本标记作废，配额归还，生态影响逆转"
                  >
                    撤销采集
                  </button>
                )}
              {entry.speciesId && <Link to={`/play/species/${entry.speciesId}`}>物种档案 →</Link>}
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}
