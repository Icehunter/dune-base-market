import { verifyToken } from '@clerk/backend';
import type { Env } from '../env';

export async function verifyAuth(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  try {
    const payload = await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY });
    return payload.sub;
  } catch {
    return null;
  }
}
