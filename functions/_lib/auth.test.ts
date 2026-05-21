import { describe, it, expect, vi } from 'vitest';
import { verifyAuth } from './auth';

describe('verifyAuth', () => {
  it('returns null when Authorization header is missing', async () => {
    const req = new Request('http://localhost/api/test');
    const env = { CLERK_SECRET_KEY: 'sk_test_xxx', DB: {} as D1Database, BUCKET: {} as R2Bucket };
    expect(await verifyAuth(req, env)).toBeNull();
  });

  it('returns null when header does not start with Bearer', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Basic abc123' },
    });
    const env = { CLERK_SECRET_KEY: 'sk_test_xxx', DB: {} as D1Database, BUCKET: {} as R2Bucket };
    expect(await verifyAuth(req, env)).toBeNull();
  });

  it('returns null when verifyToken throws', async () => {
    const req = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer bad.token.here' },
    });
    const env = { CLERK_SECRET_KEY: 'sk_test_xxx', DB: {} as D1Database, BUCKET: {} as R2Bucket };
    // bad token — verifyToken will throw, should return null
    expect(await verifyAuth(req, env)).toBeNull();
  });
});
