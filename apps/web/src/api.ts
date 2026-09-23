import type {
  AnnualReview,
  ApiErrorShape,
  CatalogMeta,
  CommandRequest,
  GameCommand,
  JournalEntry,
  Season,
  SiteId,
  SpeciesSnapshot,
  WorldSnapshot
} from '@shanhai/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorShape
  ) {
    super(payload.message);
    this.name = 'ApiError';
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers
    }
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const body = (await response.json().catch(() => null)) as T | ApiErrorShape | null;
  if (!response.ok) {
    const fallback: ApiErrorShape = {
      code: 'NETWORK_ERROR',
      message: '请求失败，请稍后重试',
      traceId: 'client',
      retryable: true
    };
    throw new ApiError(response.status, (body as ApiErrorShape | null) ?? fallback);
  }
  return body as T;
}

export const api = {
  getCatalog: () => request<CatalogMeta>('/api/meta/catalog'),
  getCurrent: () =>
    request<{
      save: { id: string; year: number; season: Season; revision: number } | null;
      world: WorldSnapshot | null;
    }>('/api/save/current'),
  createSave: () =>
    request<WorldSnapshot>('/api/save', {
      method: 'POST'
    }),
  getWorld: (saveId: string) => request<WorldSnapshot>(`/api/save/${saveId}/world`),
  sendCommand: (saveId: string, requestBody: CommandRequest) =>
    request<{ world: WorldSnapshot; event: WorldSnapshot['recentEvents'][number]; evaluation: unknown }>(
      `/api/save/${saveId}/commands`,
      {
        method: 'POST',
        body: JSON.stringify(requestBody)
      }
    ),
  getJournal: (saveId: string, filters: { season?: Season; siteId?: SiteId } = {}) => {
    const params = new URLSearchParams();
    if (filters.season) params.set('season', filters.season);
    if (filters.siteId) params.set('siteId', filters.siteId);
    const suffix = params.size > 0 ? `?${params}` : '';
    return request<{ entries: JournalEntry[] }>(`/api/save/${saveId}/journal${suffix}`);
  },
  getSpecies: (saveId: string, speciesId: string) =>
    request<{
      species: {
        id: string;
        name: string;
        latinName: string;
        lifeForm: string;
        description: string;
        protected: boolean;
        protectionTier: 'unprotected' | 'local' | 'class_ii' | 'class_i';
        protectionTierLabel?: string;
        preferred: Record<string, number>;
        sampleProtocol: string[];
        colors: Record<string, string>;
      };
      states: Array<SpeciesSnapshot & { siteId: SiteId; siteName: string }>;
      observations: Array<{
        id: string;
        season: string;
        year: number;
        day: number;
        score: number;
        values: Record<string, unknown>;
        feedback: Record<string, unknown>;
      }>;
      history: Array<Record<string, unknown>>;
    }>(`/api/save/${saveId}/species/${speciesId}`),
  getReport: (saveId: string, year: number) =>
    request<AnnualReview>(`/api/save/${saveId}/report/${year}`),
  exportSave: (saveId: string) =>
    request<{ token: string; expiresAt: string }>(`/api/save/${saveId}/export`, {
      method: 'POST'
    }),
  importSave: (token: string) =>
    request<WorldSnapshot>('/api/save/import', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),
  deleteSave: (saveId: string) =>
    request<void>(`/api/save/${saveId}`, {
      method: 'DELETE'
    })
};

export function commandRequest(command: GameCommand, revision: number): CommandRequest {
  return {
    expectedRevision: revision,
    idempotencyKey: crypto.randomUUID(),
    command
  };
}
