import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../middleware/errorHandler.js';

export const BUCKET_NAME = 'Enhanced Files';

let bucketInitialized = false;

export async function ensureEnhancedFilesBucket(): Promise<void> {
  if (bucketInitialized) return;
  bucketInitialized = true;
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      logger.warn(`Failed to list Supabase storage buckets: ${error.message}`, undefined, 'StorageService');
      bucketInitialized = false;
      return;
    }

    const existing = buckets.find((b) => b.name === BUCKET_NAME || b.id === BUCKET_NAME);
    if (!existing) {
      logger.info(`Bucket "${BUCKET_NAME}" not found. Creating private storage bucket...`, undefined, 'StorageService');
      const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
        public: false,
        fileSizeLimit: 25 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'],
      });

      if (createError) {
        logger.error(`Failed to create private bucket "${BUCKET_NAME}": ${createError.message}`, undefined, 'StorageService');
      } else {
        logger.info(`Private storage bucket "${BUCKET_NAME}" created successfully.`, undefined, 'StorageService');
      }
    }
  } catch (err: any) {
    bucketInitialized = false;
    logger.warn(`Storage bucket initialization check failed: ${err.message}`, undefined, 'StorageService');
  }
}

export async function uploadOriginalImage(
  userId: string,
  projectId: string,
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<string> {
  await ensureEnhancedFilesBucket();

  const ext = extension.replace(/^\./, '').toLowerCase() || 'png';
  const objectKey = `${userId}/${projectId}/original.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(objectKey, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    logger.error(`Failed to upload original image to storage [${objectKey}]: ${error.message}`, undefined, 'StorageService');
    throw new AppError('Failed to store original image in secure storage.', 500);
  }

  return objectKey;
}

export async function uploadEnhancedImage(
  userId: string,
  projectId: string,
  buffer: Buffer,
  extension: string,
  mimeType: string
): Promise<string> {
  await ensureEnhancedFilesBucket();

  const ext = extension.replace(/^\./, '').toLowerCase() || 'png';
  const objectKey = `${userId}/${projectId}/enhanced.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(objectKey, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) {
    logger.error(`Failed to upload enhanced image to storage [${objectKey}]: ${error.message}`, undefined, 'StorageService');
    throw new AppError('Failed to store enhanced image in secure storage.', 500);
  }

  return objectKey;
}

export async function downloadStorageFile(objectKey: string): Promise<{ buffer: Buffer; contentType: string }> {
  await ensureEnhancedFilesBucket();

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(objectKey);

  if (error || !data) {
    logger.error(`Failed to download storage file [${objectKey}]: ${error?.message || 'Not found'}`, undefined, 'StorageService');
    throw new AppError('File asset not found in storage.', 404);
  }

  const arrayBuffer = await data.arrayBuffer();
  const contentType = data.type || (objectKey.endsWith('.jpg') || objectKey.endsWith('.jpeg') ? 'image/jpeg' : objectKey.endsWith('.webp') ? 'image/webp' : 'image/png');

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export async function deleteStorageFile(objectKey: string): Promise<void> {
  if (!objectKey) return;
  try {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove([objectKey]);

    if (error) {
      logger.warn(`Failed to remove storage object [${objectKey}]: ${error.message}`, undefined, 'StorageService');
    }
  } catch (err: any) {
    logger.warn(`Exception during storage object deletion [${objectKey}]: ${err.message}`, undefined, 'StorageService');
  }
}

export async function deleteProjectStorageFiles(originalKey: string, enhancedKey?: string | null): Promise<void> {
  const keysToDelete: string[] = [];
  if (originalKey) keysToDelete.push(originalKey);
  if (enhancedKey) keysToDelete.push(enhancedKey);
  await deleteStorageObjects(keysToDelete);
}

/** Remove any number of storage objects in a single request. */
export async function deleteStorageObjects(keysToDelete: string[]): Promise<void> {
  if (keysToDelete.length === 0) return;

  try {
    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .remove(keysToDelete);

    if (error) {
      logger.warn(`Failed to remove project storage files: ${error.message}`, undefined, 'StorageService');
    }
  } catch (err: any) {
    logger.warn(`Exception deleting project storage files: ${err.message}`, undefined, 'StorageService');
  }
}

export async function getSignedUrl(objectKey: string, expiresIn = 3600): Promise<string | null> {
  if (!objectKey) return null;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(objectKey, expiresIn);

    if (error || !data?.signedUrl) {
      logger.warn(`Failed to create signed URL for [${objectKey}]: ${error?.message}`, undefined, 'StorageService');
      return null;
    }

    return data.signedUrl;
  } catch (err: any) {
    logger.warn(`Exception creating signed URL for [${objectKey}]: ${err.message}`, undefined, 'StorageService');
    return null;
  }
}

export async function getSignedUrlsBatch(keys: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const validKeys = keys.filter(Boolean);
  if (validKeys.length === 0) return {};
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrls(validKeys, expiresIn);

    if (error || !data) {
      logger.warn(`Failed to create batch signed URLs: ${error?.message}`, undefined, 'StorageService');
      return {};
    }

    const resultMap: Record<string, string> = {};
    for (const item of data) {
      if (item.path && item.signedUrl) {
        resultMap[item.path] = item.signedUrl;
      }
    }
    return resultMap;
  } catch (err: any) {
    logger.warn(`Exception in batch signed URL generation: ${err.message}`, undefined, 'StorageService');
    return {};
  }
}
