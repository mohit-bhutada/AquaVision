import { Router, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { enhanceImageWithMLService } from '../services/mlService.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { createProjectWithEnhancement } from '../services/projectService.js';
import {
  reserveCredit,
  refundCredit,
  getUserCreditState,
  formatCreditsResponse,
  createPendingEnhancementOperation,
  markEnhancementOpCompleted,
  markEnhancementOpFailed,
} from '../services/creditService.js';
import { logger } from '../lib/logger.js';
import { validateImageUpload, MAX_UPLOAD_BYTES } from '../lib/uploadValidation.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new AppError('Unsupported file type. Please upload a JPEG, PNG, or WebP image.', 415, 'UNSUPPORTED_FILE_TYPE'));
    }
  },
});

const enhanceRateLimiter = createRateLimiter('enhance-endpoints', {
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: 'Too many enhancement requests. Please slow down and try again shortly.',
});

const handleEnhance = async (req: AuthenticatedRequest, res: Response, next: any) => {
  const startTime = Date.now();
  const userId = req.user!.id;
  let creditReservation: { success: boolean; poolUsed: 'DAILY_BASE' | 'MONTHLY_BONUS' | null; grantId: string | null } | null = null;

  try {
    // Validate BEFORE any credit is reserved. Runs for both runtimes (multer on Node,
    // multipart adapter on Cloudflare Workers) and checks the real file signature,
    // never the client-declared MIME type.
    const uploadedFile = validateImageUpload(req.file || (req.files && (req.files as any)[0]));

    const sha256 = crypto.createHash('sha256').update(uploadedFile.buffer).digest('hex');

    logger.info(
      `Enhancement requested for file: ${uploadedFile.filename} (${uploadedFile.size} bytes) by user ${userId}`,
      req.id,
      'EnhanceRoute',
      { userId, filename: uploadedFile.filename }
    );

    // 1. Credit Validation & Concurrency-Safe Reservation (BEFORE ML execution)
    creditReservation = await reserveCredit(userId);
    if (!creditReservation.success || !creditReservation.poolUsed) {
      logger.warn(`Enhancement rejected due to insufficient credits for user ${userId}`, req.id, 'EnhanceRoute');
      throw new AppError('You have 0 tokens left for an enhancement.', 402, 'INSUFFICIENT_CREDITS');
    }

    const opId = await createPendingEnhancementOperation(
      userId,
      sha256 || crypto.randomUUID(),
      creditReservation.poolUsed,
      creditReservation.grantId
    );

    // 2. Run inference via Python ML service (with refund fallback)
    let mlResult;
    try {
      mlResult = await enhanceImageWithMLService(
        uploadedFile.buffer,
        uploadedFile.filename,
        uploadedFile.mime,
        req.id
      );
    } catch (mlErr) {
      logger.error(`ML enhancement failed. Refunding credit to pool ${creditReservation.poolUsed}...`, req.id, 'EnhanceRoute');
      await markEnhancementOpFailed(opId, 'ML enhancement engine failure refund');
      await refundCredit(userId, creditReservation.poolUsed, creditReservation.grantId, 'ML enhancement engine failure refund');
      throw mlErr;
    }

    const processingTimeMs = Date.now() - startTime;

    // 3. Persist project metadata & storage files (with refund fallback)
    let project;
    try {
      project = await createProjectWithEnhancement({
        userId,
        originalBuffer: uploadedFile.buffer,
        originalFilename: uploadedFile.filename,
        originalMimeType: uploadedFile.mime,
        enhancedBuffer: mlResult.buffer,
        enhancedMimeType: mlResult.contentType,
        processingTimeMs,
        sha256,
        creditPoolUsed: creditReservation.poolUsed,
      });
      await markEnhancementOpCompleted(opId, project.id);
    } catch (persistErr) {
      logger.error(`Project persistence failed. Refunding credit to pool ${creditReservation.poolUsed}...`, req.id, 'EnhanceRoute');
      await markEnhancementOpFailed(opId, 'Storage/Database persistence failure refund');
      await refundCredit(userId, creditReservation.poolUsed, creditReservation.grantId, 'Storage/Database persistence failure refund');
      throw persistErr;
    }

    // 4. Fetch updated credit state for response
    const updatedCredits = await getUserCreditState(userId);

    // 5. Return API CONTRACT response: { project: Project, credits: Credits }
    res.status(201).json({
      project: {
        id: project.id,
        name: project.title,
        status: 'COMPLETED',
        originalUrl: `/api/v1/projects/${project.id}/original`,
        enhancedUrl: `/api/v1/projects/${project.id}/enhanced`,
        shareToken: null,
        createdAt: project.created_at,
      },
      credits: formatCreditsResponse(updatedCredits),
    });
  } catch (err) {
    next(err);
  }
};

const processUpload = (fieldName: string) => (req: any, res: Response, next: any) => {
  if (req.file || (req.files && (req.files as any)[0])) {
    return next();
  }
  return upload.single(fieldName)(req, res, next);
};

// Accept either 'image' (API contract) or 'file' (legacy upload field name)
router.post('/projects/enhance', requireAuth, enhanceRateLimiter, processUpload('image'), handleEnhance);
router.post('/v1/enhance', requireAuth, enhanceRateLimiter, processUpload('file'), handleEnhance);
router.post('/enhance', requireAuth, enhanceRateLimiter, processUpload('file'), handleEnhance);

export default router;

