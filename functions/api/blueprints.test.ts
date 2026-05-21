import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../env';

// Minimal D1 mock
function makeDb(rows: object[]) {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: rows }),
        first: async () => rows[0] ?? null,
        run: async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

describe('GET /api/blueprints', () => {
  it('returns public blueprints as JSON', async () => {
    const rows = [
      { id: 'bp1', title: 'Test Base', username: 'alice', is_public: 1,
        piece_count: 10, file_size: 500, tags: '["Wall","Foundation"]',
        download_count: 3, created_at: '2026-01-01T00:00:00Z' },
    ];
    const env: Partial<Env> = { DB: makeDb(rows), CLERK_SECRET_KEY: 'sk_test' };

    // Dynamic import after mock setup
    const { onRequestGet } = await import('./blueprints');
    const req = new Request('http://localhost/api/blueprints');
    const ctx = { request: req, env, params: {}, waitUntil: vi.fn(), next: vi.fn(), data: {} };

    const res = await onRequestGet(ctx as any);
    const body = await res.json() as { blueprints: unknown[] };

    expect(res.status).toBe(200);
    expect(body.blueprints).toHaveLength(1);
    expect((body.blueprints[0] as any).id).toBe('bp1');
  });
});

describe('POST /api/blueprints', () => {
  it('returns 401 when not authenticated', async () => {
    const body = new FormData();
    body.append('title', 'My Base');
    body.append('is_public', 'true');
    body.append('file', new Blob(['{"instances":[],"placeables":[]}'], { type: 'application/json' }), 'bp.json');
    const req = new Request('http://localhost/api/blueprints', { method: 'POST', body });
    const env: Partial<Env> = { DB: makeDb([]), CLERK_SECRET_KEY: 'sk_test', BUCKET: {} as R2Bucket };
    const ctx = { request: req, env, params: {}, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await (await import('./blueprints')).onRequestPost(ctx as any);
    expect(res.status).toBe(401);
  });

  it('extractBlueprintTags returns correct categories', async () => {
    const { extractBlueprintTags } = await import('./blueprints');
    const json = JSON.stringify({
      instances: [
        { building_type: 'wall_segment', x: 0, y: 0, z: 0, rotation: 0 },
        { building_type: 'foundation_base', x: 1, y: 0, z: 0, rotation: 0 },
      ],
      placeables: [
        { building_type: 'door_frame', x: 0, y: 0, z: 0 },
      ],
    });
    const tags = extractBlueprintTags(json);
    expect(tags).toContain('Wall');
    expect(tags).toContain('Foundation');
    expect(tags).toContain('Door');
    expect(tags).toHaveLength(3);
  });

  it('extractBlueprintTags throws on invalid JSON', async () => {
    const { extractBlueprintTags } = await import('./blueprints');
    expect(() => extractBlueprintTags('not json')).toThrow();
  });
});
