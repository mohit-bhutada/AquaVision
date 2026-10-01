import { Router, Request, Response, NextFunction } from 'express';
import { shareTokenParam } from '../middleware/validateParams.js';
import { getSharedProjectByToken, getProjectAssetForShareToken } from '../services/projectService.js';

const router = Router();
router.param('token', shareTokenParam);

// GET /share/:token - Public lookup for shared project details (API contract: SharedProject)
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const { project } = await getSharedProjectByToken(token);

    res.json({
      name: project.title || 'Shared Project',
      createdAt: project.created_at,
      originalUrl: `/api/v1/share/${token}/original`,
      enhancedUrl: `/api/v1/share/${token}/enhanced`,
    });
  } catch (err) {
    next(err);
  }
});

// GET /share/:token/original - Stream original image asset for valid share token
router.get('/:token/original', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const asset = await getProjectAssetForShareToken(token, 'original');

    res.set('Content-Type', asset.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
});

// GET /share/:token/enhanced - Stream enhanced image asset for valid share token
router.get('/:token/enhanced', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.params.token as string;
    const asset = await getProjectAssetForShareToken(token, 'enhanced');

    res.set('Content-Type', asset.contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(asset.buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
