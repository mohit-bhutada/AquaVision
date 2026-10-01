import { Router, Response, NextFunction } from 'express';
import { uuidParam, isUuid } from '../middleware/validateParams.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import {
  getUserProjects,
  getProjectById,
  deleteProject,
  deleteProjects,
  updateProjectTitle,
  createShareToken,
  revokeShareToken,
  getActiveShareToken,
  getProjectAssetForOwner,
} from '../services/projectService.js';
import { getSignedUrl, getSignedUrlsBatch } from '../services/storageService.js';
import { getFullUserProfile } from './subscriptions.js';

const router = Router();
router.param('id', uuidParam);

export async function formatProjectAsync(p: any): Promise<any> {
  const [originalUrl, enhancedUrl] = await Promise.all([
    getSignedUrl(p.original_file_key, 3600),
    p.enhanced_file_key ? getSignedUrl(p.enhanced_file_key, 3600) : Promise.resolve(null),
  ]);

  return {
    id: p.id,
    name: p.title || 'Untitled Project',
    status: (p.enhanced_file_key ? 'COMPLETED' : 'PROCESSING') as 'COMPLETED' | 'PROCESSING' | 'FAILED',
    originalUrl: originalUrl || `/api/v1/projects/${p.id}/original`,
    enhancedUrl: enhancedUrl || (p.enhanced_file_key ? `/api/v1/projects/${p.id}/enhanced` : null),
    shareToken: p.share_tokens?.[0]?.token || null,
    createdAt: p.created_at,
  };
}

export async function formatProjectsBatch(projects: any[]): Promise<any[]> {
  if (projects.length === 0) return [];

  const keysToSign: string[] = [];
  for (const p of projects) {
    if (p.original_file_key) keysToSign.push(p.original_file_key);
    if (p.enhanced_file_key) keysToSign.push(p.enhanced_file_key);
  }

  const signedUrlMap = await getSignedUrlsBatch(keysToSign, 3600);

  return projects.map((p) => {
    const origSigned = p.original_file_key ? signedUrlMap[p.original_file_key] : null;
    const enhSigned = p.enhanced_file_key ? signedUrlMap[p.enhanced_file_key] : null;

    return {
      id: p.id,
      name: p.title || 'Untitled Project',
      status: (p.enhanced_file_key ? 'COMPLETED' : 'PROCESSING') as 'COMPLETED' | 'PROCESSING' | 'FAILED',
      originalUrl: origSigned || `/api/v1/projects/${p.id}/original`,
      enhancedUrl: enhSigned || (p.enhanced_file_key ? `/api/v1/projects/${p.id}/enhanced` : null),
      shareToken: p.share_tokens?.[0]?.token || null,
      createdAt: p.created_at,
    };
  });
}

// GET /projects - List user's project history (API contract: Project[], newest first)
router.get('/', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projects = await getUserProjects(req.user!.id);
    const formatted = await formatProjectsBatch(projects);
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// GET /projects/workspace/summary - Consolidated workspace summary dashboard data
router.get('/workspace/summary', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;

    const [fullProfile, projects, totalCountRes, completedCountRes] = await Promise.all([
      getFullUserProfile(userId),
      getUserProjects(userId),
      supabaseAdmin
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false),
      supabaseAdmin
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_archived', false)
        .not('enhanced_file_key', 'is', null),
    ]);

    const formattedProjects = await formatProjectsBatch(projects.slice(0, 10));

    res.json({
      profile: fullProfile,
      stats: {
        totalProjects: totalCountRes.count ?? projects.length,
        completedProjects: completedCountRes.count ?? projects.filter((p) => p.enhanced_file_key).length,
        dailyTokensRemaining: fullProfile.credits.daily.balance,
        monthlyTokensRemaining: fullProfile.credits.monthly.balance,
      },
      recentProjects: formattedProjects,
    });
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id - Get project metadata (API contract: Project)
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const project = await getProjectById(req.user!.id, projectId);
    const formatted = await formatProjectAsync(project);
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// PATCH /projects/:id - Rename project title
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const name = req.body?.name || req.body?.title;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name is required.' } });
      return;
    }
    const updated = await updateProjectTitle(req.user!.id, projectId, name.trim());
    res.json(await formatProjectAsync(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /projects/:id - Delete project and storage files (API contract: 204)
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    await deleteProject(req.user!.id, projectId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /projects/bulk-delete - Bulk delete user projects
router.post('/bulk-delete', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every(isUuid)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A list of 1-100 valid project IDs is required.' } });
      return;
    }
    const result = await deleteProjects(req.user!.id, ids);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/original - Stream original image asset for project owner
router.get('/:id/original', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const asset = await getProjectAssetForOwner(req.user!.id, projectId, 'original');
    res.set('Content-Type', asset.contentType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/enhanced - Stream enhanced image asset for project owner
router.get('/:id/enhanced', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const asset = await getProjectAssetForOwner(req.user!.id, projectId, 'enhanced');
    res.set('Content-Type', asset.contentType);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
});

// POST /projects/:id/share - Generate share link token (API contract: { shareToken })
router.post('/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const shareTokenRecord = await createShareToken(req.user!.id, projectId);
    res.json({
      shareToken: shareTokenRecord.token,
    });
  } catch (err) {
    next(err);
  }
});

// GET /projects/:id/share - Get active share link if exists for project owner
router.get('/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    const shareTokenRecord = await getActiveShareToken(req.user!.id, projectId);
    res.json({
      shareToken: shareTokenRecord?.token || null,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /projects/:id/share - Revoke share link for project owner (API contract: 204)
router.delete('/:id/share', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id as string;
    await revokeShareToken(req.user!.id, projectId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
