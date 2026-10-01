import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { config } from '../config/env.js';

const router = Router();
const startTime = Date.now();

// GET /api/health - Minimal service health response
router.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'healthy';

  try {
    const { error } = await supabaseAdmin.from('plans').select('code').limit(1);
    if (error) {
      dbStatus = 'degraded';
    }
  } catch {
    dbStatus = 'unavailable';
  }

  res.json({
    status: dbStatus === 'healthy' ? 'ok' : 'degraded',
    service: 'aquavision-backend',
    environment: config.env,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    database: dbStatus,
  });
});

export default router;
