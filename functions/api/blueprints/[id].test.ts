import { describe, it, expect, vi } from 'vitest';
import type { Env } from '../../env';

function makeDb(row: object | null) {
  return {
    prepare: () => ({
      bind: () => ({
        first: async () => row,
        all:   async () => ({ results: [] }),
        run:   async () => ({ success: true }),
      }),
    }),
  } as unknown as D1Database;
}

const publicRow = {
  id: 'bp1', title: 'Test', username: 'alice', user_id: 'user_alice',
  is_public: 1, piece_count: 5, file_size: 200,
  tags: '["Wall"]', download_count: 0, created_at: '2026-01-01T00:00:00Z',
  blueprint_data: '{"instances":[],"placeables":[]}',
};

const privateRow = { ...publicRow, is_public: 0 };

describe('GET /api/blueprints/:id', () => {
  it('returns 200 for a public blueprint', async () => {
    const { onRequestGet } = await import('./[id]');
    const req = new Request('http://localhost/api/blueprints/bp1');
    const env: Partial<Env> = { DB: makeDb(publicRow), CLERK_SECRET_KEY: 'sk_test' };
    const ctx = { request: req, env, params: { id: 'bp1' }, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await onRequestGet(ctx as any);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.id).toBe('bp1');
  });

  it('returns 404 for a private blueprint when not the owner', async () => {
    const { onRequestGet } = await import('./[id]');
    const req = new Request('http://localhost/api/blueprints/bp1');
    const env: Partial<Env> = { DB: makeDb(privateRow), CLERK_SECRET_KEY: 'sk_test' };
    const ctx = { request: req, env, params: { id: 'bp1' }, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await onRequestGet(ctx as any);
    expect(res.status).toBe(404);
  });

  it('returns 404 for non-existent blueprint', async () => {
    const { onRequestGet } = await import('./[id]');
    const req = new Request('http://localhost/api/blueprints/missing');
    const env: Partial<Env> = { DB: makeDb(null), CLERK_SECRET_KEY: 'sk_test' };
    const ctx = { request: req, env, params: { id: 'missing' }, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await onRequestGet(ctx as any);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/blueprints/:id', () => {
  it('returns 401 when not authenticated', async () => {
    const { onRequestDelete } = await import('./[id]');
    const req = new Request('http://localhost/api/blueprints/bp1', { method: 'DELETE' });
    const env: Partial<Env> = { DB: makeDb(publicRow), CLERK_SECRET_KEY: 'sk_test', BUCKET: { delete: vi.fn() } as any };
    const ctx = { request: req, env, params: { id: 'bp1' }, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await onRequestDelete(ctx as any);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/blueprints/:id', () => {
  it('returns 401 when not authenticated', async () => {
    const { onRequestPatch } = await import('./[id]');
    const req = new Request('http://localhost/api/blueprints/bp1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Title' }),
    });
    const env: Partial<Env> = { DB: makeDb(publicRow), CLERK_SECRET_KEY: 'sk_test' };
    const ctx = { request: req, env, params: { id: 'bp1' }, waitUntil: vi.fn(), next: vi.fn(), data: {} };
    const res = await onRequestPatch(ctx as any);
    expect(res.status).toBe(401);
  });
});
