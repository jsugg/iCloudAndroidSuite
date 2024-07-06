import express from "express";

import { validateToken } from "../middleware/authMiddleware";
import { AppError, errorHandler } from "../errorHandler";
import { DataSynchronizer } from "./DataSynchronizer";
import { AppleMetadataService } from "./AppleMetadataService";
import { LivePhotoService } from "./LivePhotoService";
import { ConflictResolutionService } from "./ConflictResolutionService";
import logger from "../util/logger";

export const iCloudRouter = (
  appleMetadataService: AppleMetadataService,
  livePhotoService: LivePhotoService,
  conflictResolutionService: ConflictResolutionService
) => {
  const router = express.Router();

  router.use(validateToken);

  // iCloud Drive
  router.post("/drive/upload", async (req, res) => {
    const { accessToken, filePath, fileContent, metadata } = req.body;
    const dataSynchronizer = new DataSynchronizer(
      accessToken,
      appleMetadataService,
      livePhotoService,
      conflictResolutionService
    );

    try {
      const response = await dataSynchronizer.syncData(
        `webdav.icloud.com${filePath}`,
        { content: fileContent, metadata },
        "PUT"
      );
      res.status(200).json({ success: true, response });
    } catch (error) {
      logger.error("Failed to upload to iCloud Drive", { error });
      errorHandler(
        new AppError("Failed to upload to iCloud Drive", 500),
        req,
        res,
        null
      );
    }
  });

  router.get("/drive/download", async (req, res) => {
    const { accessToken, filePath } = req.query;
    if (typeof accessToken !== "string" || typeof filePath !== "string") {
      return errorHandler(
        new AppError("Invalid parameters", 400),
        req,
        res,
        null
      );
    }

    const dataSynchronizer = new DataSynchronizer(
      accessToken,
      appleMetadataService,
      livePhotoService,
      conflictResolutionService
    );

    try {
      const response = await dataSynchronizer.syncData(
        `webdav.icloud.com${filePath}`,
        null,
        "GET"
      );
      const metadata = await appleMetadataService.getMetadata(response.id);
      res.status(200).json({ ...response, metadata });
    } catch (error) {
      logger.error("Failed to download from iCloud Drive", { error });
      errorHandler(
        new AppError("Failed to download from iCloud Drive", 500),
        req,
        res,
        null
      );
    }
  });

  // iCloud Photos
  router.post("/photos/upload", async (req, res) => {
    const { accessToken, photoPath, isLivePhoto, videoPath } = req.body;
    const dataSynchronizer = new DataSynchronizer(
      accessToken,
      appleMetadataService,
      livePhotoService,
      conflictResolutionService
    );

    try {
      let response;
      if (isLivePhoto && videoPath) {
        response = await dataSynchronizer.syncLivePhoto(photoPath, videoPath);
      } else {
        response = await dataSynchronizer.syncData(
          "photos.icloud.com/upload",
          { photoPath },
          "POST"
        );
      }
      res.status(200).json({ success: true, response });
    } catch (error) {
      logger.error("Failed to upload photo to iCloud", { error });
      errorHandler(
        new AppError("Failed to upload photo to iCloud", 500),
        req,
        res,
        null
      );
    }
  });

  router.get("/photos/download", async (req, res) => {
    const { accessToken, photoId, isLivePhoto } = req.query;
    if (typeof accessToken !== "string" || typeof photoId !== "string") {
      return errorHandler(
        new AppError("Invalid parameters", 400),
        req,
        res,
        null
      );
    }

    const dataSynchronizer = new DataSynchronizer(
      accessToken,
      appleMetadataService,
      livePhotoService,
      conflictResolutionService
    );

    try {
      let response;
      if (isLivePhoto === "true") {
        response = await dataSynchronizer.downloadAndConvertLivePhoto(photoId);
      } else {
        response = await dataSynchronizer.syncData(
          `photos.icloud.com/download/${photoId}`,
          null,
          "GET"
        );
      }
      res.status(200).send(response);
    } catch (error) {
      logger.error("Failed to download photo from iCloud", { error });
      errorHandler(
        new AppError("Failed to download photo from iCloud", 500),
        req,
        res,
        null
      );
    }
  });

  // iCloud Contacts
  router.post("/contacts/sync", async (req, res) => {
    const { accessToken, contacts } = req.body;
    const dataSynchronizer = new DataSynchronizer(
      accessToken,
      appleMetadataService,
      livePhotoService,
      conflictResolutionService
    );

    try {
      for (const contact of contacts) {
        await dataSynchronizer.syncData(
          `contacts.icloud.com/${contact.id}`,
          contact,
          "PUT"
        );
      }
      res
        .status(200)
        .json({ success: true, message: "Contacts sync initiated" });
    } catch (error) {
      logger.error("Failed to sync contacts to iCloud", { error });
      errorHandler(
        new AppError("Failed to sync contacts to iCloud", 500),
        req,
        res,
        null
      );
    }
  });

  return router;
};