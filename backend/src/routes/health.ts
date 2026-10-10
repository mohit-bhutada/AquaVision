import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

const router = Router();
const startTime = Date.now();

// The database probe is cached for a few seconds: /health is public, and without this every request
// (including a flood of them) would cost a database query.
const DB_CACHE_MS = 15_000;
let dbCache: { status: 'healthy' | 'degraded' | 'unavailable'; at: number } | null = null;

async function databaseStatus(): Promise<'healthy' | 'degraded' | 'unavailable'> {
  if (dbCache && Date.now() - dbCache.at < DB_CACHE_MS) return dbCache.status;
  let status: 'healthy' | 'degraded' | 'unavailable' = 'healthy';
  try {
    const { error } = await supabaseAdmin.from('plans').select('code').limit(1);
    if (error) status = 'degraded';
  } catch {
    status = 'unavailable';
  }
  dbCache = { status, at: Date.now() };
  return status;
}

// GET /api/health - Minimal service health response
router.get('/health', async (_req: Request, res: Response) => {
  const dbStatus = await databaseStatus();

  res.json({
    status: dbStatus === 'healthy' ? 'ok' : 'degraded',
    service: 'aquavision-backend',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    database: dbStatus,
  });
});

export default router;
