import { AppError } from '../errorHandler';
import { AppleMetadataService } from './AppleMetadataService';
import { LivePhotoService } from './LivePhotoService';
import { ConflictResolutionService, ConflictData } from './ConflictResolutionService';
import { WebDAVService } from './WebDAVService';
import logger from '../util/logger';
import fetchWithTimeout from '../util/fetchWithTimeout';

interface SyncResult<T> {
  results: T[];
  errors: Array<{
    id: string;
    error: string;
  }>;
}

interface SyncData {
  id: string;
  metadata?: unknown;
  [key: string]: unknown;
}

interface LivePhotoData extends SyncData {
  jpeg: string;
  mov: string;
}

export class DataSynchronizer {
  private readonly BASE_URL = 'https://api.icloud.com';
  private readonly MAX_RETRIES = 5;
  private readonly BATCH_SIZE = 100;
  private readonly INITIAL_BACKOFF = 1000; // 1 second

  constructor(
    private readonly accessToken: string,
    private readonly appleMetadataService: AppleMetadataService,
    private readonly livePhotoService: LivePhotoService,
    private readonly conflictResolutionService: ConflictResolutionService,
    private readonly webDAVService: WebDAVService
  ) {}

  public async syncData<T extends SyncData>(
    endpoint: string,
    data: T | T[],
    method = 'POST'
  ): Promise<SyncResult<T>> {
    if (Array.isArray(data) && data.length > this.BATCH_SIZE) {
      return this.batchSync(endpoint, data, method);
    }
    const result = await this.singleSync(endpoint, data, method);
    return {
      results: Array.isArray(result) ? result : [result],
      errors: [],
    };
  }

  private async batchSync<T extends SyncData>(
    endpoint: string,
    data: T[],
    method: string
  ): Promise<SyncResult<T>> {
    const results: T[] = [];
    const errors: Array<{ id: string; error: string }> = [];

    for (let i = 0; i < data.length; i += this.BATCH_SIZE) {
      const batch = data.slice(i, i + this.BATCH_SIZE);
      try {
        const result = await this.retryOperation(() =>
          this.singleSync(endpoint, batch, method)
        );
        results.push(...(Array.isArray(result) ? result : [result]));
      } catch (error) {
        logger.error(`Error syncing batch ${Math.floor(i / this.BATCH_SIZE) + 1}:`, error);
        errors.push(
          ...batch.map((item) => ({
            id: item.id,
            error: error instanceof Error ? error.message : 'Unknown error while syncing batch',
          }))
        );
      }
    }

    return { results, errors };
  }

  private async singleSync<T extends SyncData>(
    endpoint: string,
    data: T | T[],
    method: string
  ): Promise<T | T[]> {
    try {
      const response = await this.retryOperation(() =>
        fetchWithTimeout(`${this.BASE_URL}/${endpoint}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: method !== 'GET' ? JSON.stringify(data) : undefined,
        })
      );

      if (!response.ok) {
        throw new AppError(
          `Failed to sync data: ${response.statusText}`,
          response.status
        );
      }

      const responseData = (await response.json()) as T | T[];

      if (Array.isArray(data)) {
        await Promise.all(data.map(async (item) => {
          if (item.metadata) {
            const appleMetadata = await this.appleMetadataService.convertToAppleMetadata(item.metadata);
            await this.appleMetadataService.saveMetadata(item.id, appleMetadata);
          }
        }));
      } else if (data.metadata) {
        const appleMetadata = await this.appleMetadataService.convertToAppleMetadata(data.metadata);
        await this.appleMetadataService.saveMetadata(data.id, appleMetadata);
      }

      return responseData;
    } catch (error) {
      logger.error('Sync operation failed:', error);
      throw new AppError('Failed to sync data', 500);
    }
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = this.MAX_RETRIES
  ): Promise<T> {
    for (let i = 0; i < retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries - 1) throw error;
        const delay = this.INITIAL_BACKOFF * Math.pow(2, i);
        logger.warn(`Retry attempt ${i + 1} failed. Retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new AppError('Max retries reached', 500);
  }

  public async syncLivePhoto(jpegPath: string, movPath: string): Promise<SyncResult<SyncData>> {
    return this.retryOperation(async () => {
      try {
        const motionPhoto = await this.livePhotoService.convertToAndroidMotionPhoto(
          jpegPath,
          movPath
        );

        const response = await this.syncData<SyncData>(
          'photos.icloud.com/upload',
          { id: `livePhoto_${Date.now()}`, data: motionPhoto },
          'POST'
        );

        logger.info('Live Photo converted and synced successfully');
        return response;
      } catch (error) {
        logger.error('Failed to sync Live Photo', { error });
        throw new AppError('Failed to sync Live Photo', 500);
      }
    });
  }

  public async downloadAndConvertLivePhoto(photoId: string): Promise<Buffer> {
    return this.retryOperation(async () => {
      try {
        const livePhoto = await this.syncData<LivePhotoData>(
          `photos.icloud.com/download/${photoId}`,
          { id: photoId, jpeg: '', mov: '' },
          'GET'
        );

        if (!Array.isArray(livePhoto.results) || livePhoto.results.length === 0 || !livePhoto.results[0].jpeg || !livePhoto.results[0].mov) {
          throw new AppError('Invalid Live Photo data received', 500);
        }

        return await this.livePhotoService.convertToAndroidMotionPhoto(
          livePhoto.results[0].jpeg,
          livePhoto.results[0].mov
        );
      } catch (error) {
        logger.error('Failed to download and convert Live Photo', { error });
        throw new AppError('Failed to download and convert Live Photo', 500);
      }
    });
  }

  public async resolveConflict(
    localData: ConflictData,
    cloudData: ConflictData,
    strategyName = 'lastWriteWins'
  ): Promise<ConflictData> {
    return this.retryOperation(async () => {
      try {
        const resolvedData = await this.conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          strategyName
        );
        logger.info('Conflict resolved', { strategy: strategyName });
        return resolvedData;
      } catch (error) {
        logger.error('Failed to resolve conflict', { error });
        throw new AppError('Failed to resolve conflict', 500);
      }
    });
  }

  public async syncFile(localPath: string, remotePath: string): Promise<void> {
    return this.retryOperation(async () => {
      try {
        if (typeof this.webDAVService.uploadFile !== 'function') {
          throw new Error('WebDAVService.uploadFile is not a function');
        }
        await this.webDAVService.uploadFile(localPath, remotePath);
        logger.info(`File synced successfully: ${localPath} -> ${remotePath}`);
      } catch (error) {
        logger.error(`Failed to sync file: ${localPath} -> ${remotePath}`, { error });
        throw new AppError(`Failed to sync file: ${localPath} -> ${remotePath}`, 500);
      }
    });
  }
}
