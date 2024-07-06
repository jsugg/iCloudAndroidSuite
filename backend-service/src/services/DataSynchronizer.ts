import fetch from "node-fetch";

import { AppError } from "../errorHandler";
import { AppleMetadataService } from "./AppleMetadataService";
import { LivePhotoService } from "./LivePhotoService";
import { ConflictResolutionService } from "./ConflictResolutionService";
import logger from "../util/logger";

export class DataSynchronizer {
  private readonly BASE_URL = "https://api.icloud.com";
  private readonly MAX_RETRIES = 3;
  private readonly BATCH_SIZE = 100; // Apple's recommended batch size

  constructor(
    private accessToken: string,
    private appleMetadataService: AppleMetadataService,
    private livePhotoService: LivePhotoService,
    private conflictResolutionService: ConflictResolutionService
  ) {}

  async syncData(
    endpoint: string,
    data: any,
    method: string = "POST"
  ): Promise<any> {
    if (Array.isArray(data) && data.length > this.BATCH_SIZE) {
      return this.batchSync(endpoint, data, method);
    }
    return this.singleSync(endpoint, data, method);
  }

  private async batchSync(
    endpoint: string,
    data: any[],
    method: string
  ): Promise<{ results: any[]; errors: any[] }> {
    const results = [];
    const errors = [];
    const maxRetries = 3;

    for (let i = 0; i < data.length; i += this.BATCH_SIZE) {
      const batch = data.slice(i, i + this.BATCH_SIZE);
      let retries = 0;

      while (retries < maxRetries) {
        try {
          const result = await this.singleSync(endpoint, batch, method);
          results.push(...result);
          break; // Success, move to next batch
        } catch (error) {
          console.error(
            `Error syncing batch ${i / this.BATCH_SIZE + 1}, attempt ${
              retries + 1
            }:`,
            error
          );
          retries++;

          if (retries >= maxRetries) {
            if (error instanceof AppError) {
              errors.push(
                ...batch.map((item) => ({
                  id: item.id,
                  error: error instanceof Error ? error.message : "Unknown error while syncing batch",
                }))
              );
            } else {
              errors.push(
                ...batch.map((item) => ({
                  id: item.id,
                  error: "Unknown error while syncing batch",
                }))
              );
            }
          } else {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * Math.pow(2, retries))
            ); // Exponential backoff
          }
        }
      }
    }

    return { results, errors };
  }

  private async singleSync(
    endpoint: string,
    data: any,
    method: string
  ): Promise<any> {
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        const response = await fetch(`${this.BASE_URL}/${endpoint}`, {
          method: method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: method !== "GET" ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
          throw new AppError(
            `Failed to sync data: ${response.statusText}`,
            response.status
          );
        }

        const responseData = await response.json();

        if (data && data.id) {
          const appleMetadata =
            await this.appleMetadataService.convertToAppleMetadata(
              data.metadata
            );
          await this.appleMetadataService.saveMetadata(data.id, appleMetadata);
        }

        return responseData;
      } catch (error) {
        console.error(`Sync attempt ${retries + 1} failed:`, error);
        retries++;
        if (retries >= this.MAX_RETRIES) {
          throw new AppError(
            "Failed to sync data after multiple attempts",
            500
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, retries))
        ); // Exponential backoff
      }
    }
  }

  async syncLivePhoto(jpegPath: string, movPath: string): Promise<any> {
    try {
      const motionPhoto =
        await this.livePhotoService.convertToAndroidMotionPhoto(
          jpegPath,
          movPath
        );

      const response = await this.syncData(
        "photos.icloud.com/upload",
        motionPhoto,
        "POST"
      );

      logger.info("Live Photo converted and synced successfully");
      return response;
    } catch (error) {
      logger.error("Failed to sync Live Photo", { error });
      throw new AppError("Failed to sync Live Photo", 500);
    }
  }

  async downloadAndConvertLivePhoto(photoId: string): Promise<Buffer> {
    try {
      const livePhoto = await this.syncData(
        `photos.icloud.com/download/${photoId}`,
        null,
        "GET"
      );

      return await this.livePhotoService.convertToAndroidMotionPhoto(
        livePhoto.jpeg,
        livePhoto.mov
      );
    } catch (error) {
      logger.error("Failed to download and convert Live Photo", { error });
      throw new AppError("Failed to download and convert Live Photo", 500);
    }
  }

  async resolveConflict(
    localData: any,
    cloudData: any,
    strategyName: string = "lastWriteWins"
  ): Promise<any> {
    try {
      const resolvedData = await this.conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        strategyName
      );
      logger.info("Conflict resolved", { strategy: strategyName });
      return resolvedData;
    } catch (error) {
      logger.error("Failed to resolve conflict", { error });
      throw new AppError("Failed to resolve conflict", 500);
    }
  }
}
