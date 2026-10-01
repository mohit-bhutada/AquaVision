import crypto from 'crypto';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  uploadOriginalImage,
  uploadEnhancedImage,
  deleteStorageFile,
  deleteProjectStorageFiles,
  downloadStorageFile,
} from './storageService.js';

export interface ProjectRecord {
  id: string;
  user_id: string;
  title: string;
  original_file_key: string;
  enhanced_file_key: string | null;
  processing_time_ms: number | null;
  credit_pool_used?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShareTokenRecord {
  id: string;
  project_id: string;
  created_by: string;
  token: string;
  is_revoked: boolean;
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export async function createProjectWithEnhancement(params: {
  userId: string;
  originalBuffer: Buffer;
  originalFilename: string;
  originalMimeType: string;
  enhancedBuffer: Buffer;
  enhancedMimeType: string;
  processingTimeMs: number;
  sha256?: string;
  creditPoolUsed?: string;
}): Promise<ProjectRecord> {
  const {
    userId,
    originalBuffer,
    originalFilename,
    originalMimeType,
    enhancedBuffer,
    enhancedMimeType,
    processingTimeMs,
    sha256,
    creditPoolUsed,
  } = params;

  const projectId = crypto.randomUUID();

  // Determine file extensions
  const origExt = originalMimeType.includes('webp') ? 'webp' : (originalMimeType.includes('jpeg') || originalMimeType.includes('jpg') ? 'jpg' : 'png');
  const enhExt = enhancedMimeType.includes('webp') ? 'webp' : (enhancedMimeType.includes('jpeg') || enhancedMimeType.includes('jpg') ? 'jpg' : 'png');

  // 1. Upload original image
  let originalKey: string;
  try {
    originalKey = await uploadOriginalImage(userId, projectId, originalBuffer, origExt, originalMimeType);
  } catch (err: any) {
    logger.error(`Project creation failed at original storage step: ${err.message}`, undefined, 'ProjectService');
    throw err;
  }

  // 2. Upload enhanced image
  let enhancedKey: string;
  try {
    enhancedKey = await uploadEnhancedImage(userId, projectId, enhancedBuffer, enhExt, enhancedMimeType);
  } catch (err: any) {
    logger.warn(`Enhanced upload failed. Cleaning up original object [${originalKey}]...`, undefined, 'ProjectService');
    await deleteStorageFile(originalKey);
    throw err;
  }

  // 3. Database Insertion
  const { data: project, error: dbError } = await supabaseAdmin
    .from('projects')
    .insert({
      id: projectId,
      user_id: userId,
      title: originalFilename || 'Underwater Restoration',
      original_file_key: originalKey,
      enhanced_file_key: enhancedKey,
      processing_time_ms: processingTimeMs,
      credit_pool_used: creditPoolUsed || 'DAILY_BASE',
      is_archived: false,
    })
    .select()
    .single();

  if (dbError || !project) {
    logger.error(`Database insertion failed for project ${projectId}: ${dbError?.message}. Cleaning up storage objects...`, undefined, 'ProjectService');
    await deleteProjectStorageFiles(originalKey, enhancedKey);
    throw new AppError('Failed to persist project metadata in database.', 500);
  }

  // 4. Record enhancement operation log
  try {
    await supabaseAdmin.from('enhancement_operations').insert({
      user_id: userId,
      idempotency_key: sha256 || crypto.randomUUID(),
      project_id: projectId,
      status: 'COMPLETED',
      sha256_checksum: sha256,
      completed_at: new Date().toISOString(),
    });
  } catch (opErr: any) {
    logger.warn(`Non-critical enhancement_operation log insert warning: ${opErr.message}`, undefined, 'ProjectService');
  }

  logger.info(`Successfully created project ${projectId} for user ${userId}`, undefined, 'ProjectService');
  return project as ProjectRecord;
}

export async function getUserProjects(userId: string): Promise<ProjectRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error(`Failed to fetch projects for user ${userId}: ${error.message}`, undefined, 'ProjectService');
    throw new AppError('Failed to retrieve project history.', 500);
  }

  return (data || []) as ProjectRecord[];
}

export async function getProjectById(userId: string, projectId: string): Promise<ProjectRecord> {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .eq('is_archived', false)
    .single();

  if (error || !data) {
    throw new AppError('Project not found or access unauthorized.', 404);
  }

  return data as ProjectRecord;
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  // 1. Verify ownership & lookup project
  const project = await getProjectById(userId, projectId);

  // 2. Delete linked share tokens
  await supabaseAdmin
    .from('share_tokens')
    .delete()
    .eq('project_id', projectId);

  // 3. Delete database record
  const { error: deleteDbErr } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (deleteDbErr) {
    logger.error(`Failed to delete project record ${projectId}: ${deleteDbErr.message}`, undefined, 'ProjectService');
    throw new AppError('Failed to delete project record.', 500);
  }

  // 4. Delete storage objects
  await deleteProjectStorageFiles(project.original_file_key, project.enhanced_file_key);
  logger.info(`Successfully deleted project ${projectId} and files`, undefined, 'ProjectService');
}

export async function deleteProjects(userId: string, projectIds: string[]): Promise<{ deletedIds: string[]; failedIds: string[] }> {
  const deletedIds: string[] = [];
  const failedIds: string[] = [];

  for (const projectId of projectIds) {
    try {
      await deleteProject(userId, projectId);
      deletedIds.push(projectId);
    } catch (err: any) {
      logger.error(`Failed bulk deletion for project ${projectId} of user ${userId}: ${err.message}`, undefined, 'ProjectService');
      failedIds.push(projectId);
    }
  }

  return { deletedIds, failedIds };
}

export async function updateProjectTitle(userId: string, projectId: string, title: string): Promise<ProjectRecord> {
  const existing = await getProjectById(userId, projectId);

  // Extract original extension from file key or title
  let ext = '.png';
  if (existing.original_file_key && existing.original_file_key.includes('.')) {
    ext = existing.original_file_key.substring(existing.original_file_key.lastIndexOf('.')).toLowerCase();
  } else if (existing.title && existing.title.includes('.')) {
    ext = existing.title.substring(existing.title.lastIndexOf('.')).toLowerCase();
  }

  // Clean raw title input: sanitize path separators
  let cleanInput = title.trim().replace(/[\/\\]/g, '-');

  // If user pasted/typed a known image extension at the end of input, strip it off
  const knownExts = ['.jpg', '.jpeg', '.png', '.webp'];
  for (const kExt of knownExts) {
    if (cleanInput.toLowerCase().endsWith(kExt)) {
      cleanInput = cleanInput.substring(0, cleanInput.length - kExt.length).trim();
      break;
    }
  }

  // Final stem + original extension
  const stem = cleanInput || 'Untitled Project';
  const finalTitle = `${stem}${ext}`;

  const { data: updated, error } = await supabaseAdmin
    .from('projects')
    .update({ title: finalTitle, updated_at: new Date().toISOString() })
    .eq('id', projectId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !updated) {
    logger.error(`Failed to update title for project ${projectId}: ${error?.message}`, undefined, 'ProjectService');
    throw new AppError('Failed to rename project.', 500);
  }

  return updated as ProjectRecord;
}

export async function createShareToken(userId: string, projectId: string): Promise<ShareTokenRecord> {
  // Verify ownership
  await getProjectById(userId, projectId);

  // Check for existing active share token
  const { data: existing } = await supabaseAdmin
    .from('share_tokens')
    .select('*')
    .eq('project_id', projectId)
    .eq('created_by', userId)
    .eq('is_revoked', false)
    .single();

  if (existing) {
    return existing as ShareTokenRecord;
  }

  const tokenHex = crypto.randomBytes(24).toString('hex');

  const { data: created, error } = await supabaseAdmin
    .from('share_tokens')
    .insert({
      project_id: projectId,
      created_by: userId,
      token: tokenHex,
      is_revoked: false,
    })
    .select()
    .single();

  if (error || !created) {
    logger.error(`Failed to generate share token for project ${projectId}: ${error?.message}`, undefined, 'ProjectService');
    throw new AppError('Failed to generate secure share link.', 500);
  }

  return created as ShareTokenRecord;
}

export async function revokeShareToken(userId: string, projectId: string): Promise<void> {
  // Verify ownership
  await getProjectById(userId, projectId);

  const { error } = await supabaseAdmin
    .from('share_tokens')
    .update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
    })
    .eq('project_id', projectId)
    .eq('created_by', userId);

  if (error) {
    logger.error(`Failed to revoke share tokens for project ${projectId}: ${error.message}`, undefined, 'ProjectService');
    throw new AppError('Failed to revoke share link.', 500);
  }
}

export async function getActiveShareToken(userId: string, projectId: string): Promise<ShareTokenRecord | null> {
  await getProjectById(userId, projectId);

  const { data } = await supabaseAdmin
    .from('share_tokens')
    .select('*')
    .eq('project_id', projectId)
    .eq('created_by', userId)
    .eq('is_revoked', false)
    .single();

  return (data || null) as ShareTokenRecord | null;
}

export async function getSharedProjectByToken(token: string): Promise<{ project: ProjectRecord; shareToken: ShareTokenRecord }> {
  const { data: tokenRecord, error: tokenError } = await supabaseAdmin
    .from('share_tokens')
    .select('*')
    .eq('token', token)
    .single();

  if (tokenError || !tokenRecord) {
    throw new AppError('Shared project link not found or invalid.', 404);
  }

  if (tokenRecord.is_revoked) {
    throw new AppError('This share link has been revoked by the owner.', 404);
  }

  if (tokenRecord.expires_at && new Date(tokenRecord.expires_at) < new Date()) {
    throw new AppError('This share link has expired.', 404);
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, title, original_file_key, enhanced_file_key, processing_time_ms, created_at')
    .eq('id', tokenRecord.project_id)
    .eq('is_archived', false)
    .single();

  if (projectError || !project) {
    throw new AppError('Shared project not found.', 404);
  }

  return {
    project: project as ProjectRecord,
    shareToken: tokenRecord as ShareTokenRecord,
  };
}

export async function getProjectAssetForOwner(
  userId: string,
  projectId: string,
  type: 'original' | 'enhanced'
): Promise<{ buffer: Buffer; contentType: string }> {
  const project = await getProjectById(userId, projectId);
  const fileKey = type === 'original' ? project.original_file_key : project.enhanced_file_key;

  if (!fileKey) {
    throw new AppError(`Requested ${type} asset is unavailable.`, 404);
  }

  return await downloadStorageFile(fileKey);
}

export async function getProjectAssetForShareToken(
  token: string,
  type: 'original' | 'enhanced'
): Promise<{ buffer: Buffer; contentType: string }> {
  const { project } = await getSharedProjectByToken(token);
  const fileKey = type === 'original' ? project.original_file_key : project.enhanced_file_key;

  if (!fileKey) {
    throw new AppError(`Requested ${type} asset is unavailable.`, 404);
  }

  return await downloadStorageFile(fileKey);
}
