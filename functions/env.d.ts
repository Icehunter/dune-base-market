export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  CLERK_SECRET_KEY: string;
  CDN_BASE?: string;
}
