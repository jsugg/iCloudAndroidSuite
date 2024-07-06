import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import type { Mocked } from "jest-mock";
import request from "supertest";
import express from "express";
import { iCloudRouter } from "../src/services/iCloudService";
import { AppleMetadataService, AppleMetadata } from "../src/services/AppleMetadataService";
import { LivePhotoService } from "../src/services/LivePhotoService";
import { ConflictResolutionService } from "../src/services/ConflictResolutionService";
import { DataSynchronizer } from "../src/services/DataSynchronizer";
import { AppError } from "../src/errorHandler";

jest.mock("../src/services/DataSynchronizer");
jest.mock("../src/services/AppleMetadataService");
jest.mock("../src/services/LivePhotoService");
jest.mock("../src/services/ConflictResolutionService");

describe("iCloudService Integration", () => {
  let app: express.Application;
  let mockDataSynchronizer: Mocked<DataSynchronizer>;
  let mockAppleMetadataService: Mocked<AppleMetadataService>;
  let mockLivePhotoService: Mocked<LivePhotoService>;
  let mockConflictResolutionService: Mocked<ConflictResolutionService>;

  beforeEach(() => {
    app = express();
    mockAppleMetadataService = new AppleMetadataService("/test/storage") as Mocked<AppleMetadataService>;
    mockLivePhotoService = new LivePhotoService("/test/temp") as Mocked<LivePhotoService>;
    mockConflictResolutionService = new ConflictResolutionService() as Mocked<ConflictResolutionService>;
    mockDataSynchronizer = new DataSynchronizer(
      "",
      mockAppleMetadataService,
      mockLivePhotoService,
      mockConflictResolutionService
    ) as Mocked<DataSynchronizer>;

    (DataSynchronizer as jest.MockedClass<typeof DataSynchronizer>).mockImplementation(() => mockDataSynchronizer);

    app.use(express.json());
    app.use(
      "/icloud",
      iCloudRouter(
        mockAppleMetadataService,
        mockLivePhotoService,
        mockConflictResolutionService
      )
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("iCloud Drive", () => {
    describe("POST /icloud/drive/upload", () => {
      it("should upload file to iCloud Drive successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true, id: "file-123" });

        const response = await request(app)
          .post("/icloud/drive/upload")
          .send({
            accessToken: "test-token",
            filePath: "/test/file.txt",
            fileContent: "Test content",
            metadata: { key: "value" },
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          response: { success: true, id: "file-123" },
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "webdav.icloud.com/test/file.txt",
          { content: "Test content", metadata: { key: "value" } },
          "PUT"
        );
      });

      it("should handle upload errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Upload failed", 500));

        const response = await request(app)
          .post("/icloud/drive/upload")
          .send({
            accessToken: "test-token",
            filePath: "/test/file.txt",
            fileContent: "Test content",
            metadata: { key: "value" },
          });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to upload to iCloud Drive",
        });
      });

      it("should handle missing required fields", async () => {
        const response = await request(app)
          .post("/icloud/drive/upload")
          .send({
            accessToken: "test-token",
            // Missing filePath and fileContent
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "Missing required fields",
        });
      });

      it("should handle large file uploads", async () => {
        const largeContent = "a".repeat(1024 * 1024 * 10); // 10MB content
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true, id: "large-file-123" });

        const response = await request(app)
          .post("/icloud/drive/upload")
          .send({
            accessToken: "test-token",
            filePath: "/test/large-file.txt",
            fileContent: largeContent,
            metadata: { size: "10MB" },
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          response: { success: true, id: "large-file-123" },
        });
      });
    });

    describe("GET /icloud/drive/download", () => {
      it("should download file from iCloud Drive successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({
          id: "file-id",
          content: "File content",
        });

        const mockMetadata: AppleMetadata = {
          creationDate: "2023-01-01T00:00:00Z",
          modificationDate: "2023-01-01T00:00:00Z",
          label: "Test Label",
          tags: ["test", "example"],
          uti: "public.plain-text",
          quarantineAttribute: "",
          customIcon: Buffer.from([]),
          finderFlags: 0,
          acl: [],
          spotlightComments: "",
          contentCreationDate: "2023-01-01T00:00:00Z",
          customMetadata: { key: "value" }
        };

        mockAppleMetadataService.getMetadata.mockResolvedValue(mockMetadata);

        const response = await request(app)
          .get("/icloud/drive/download")
          .query({ accessToken: "test-token", filePath: "/test/file.txt" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          id: "file-id",
          content: "File content",
          metadata: { key: "value", createdAt: "2023-01-01" },
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "webdav.icloud.com/test/file.txt",
          null,
          "GET"
        );
      });

      it("should handle download errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Download failed", 500));

        const response = await request(app)
          .get("/icloud/drive/download")
          .query({ accessToken: "test-token", filePath: "/test/file.txt" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to download from iCloud Drive",
        });
      });

      it("should handle missing file", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue(null);

        const response = await request(app)
          .get("/icloud/drive/download")
          .query({ accessToken: "test-token", filePath: "/test/non-existent-file.txt" });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          success: false,
          error: "File not found",
        });
      });

      it("should handle invalid file path", async () => {
        const response = await request(app)
          .get("/icloud/drive/download")
          .query({ accessToken: "test-token", filePath: "../invalid/path.txt" });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "Invalid file path",
        });
      });
    });

    describe("DELETE /icloud/drive/delete", () => {
      it("should delete file from iCloud Drive successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true });

        const response = await request(app)
          .delete("/icloud/drive/delete")
          .query({ accessToken: "test-token", filePath: "/test/file-to-delete.txt" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          message: "File deleted successfully",
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "webdav.icloud.com/test/file-to-delete.txt",
          null,
          "DELETE"
        );
      });

      it("should handle delete errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Delete failed", 500));

        const response = await request(app)
          .delete("/icloud/drive/delete")
          .query({ accessToken: "test-token", filePath: "/test/file-to-delete.txt" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to delete file from iCloud Drive",
        });
      });
    });
  });

  describe("iCloud Photos", () => {
    describe("POST /icloud/photos/upload", () => {
      it("should upload photo to iCloud successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true, id: "photo-123" });

        const response = await request(app)
          .post("/icloud/photos/upload")
          .send({
            accessToken: "test-token",
            photoPath: "/test/photo.jpg",
            isLivePhoto: false,
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          response: { success: true, id: "photo-123" },
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "photos.icloud.com/upload",
          { photoPath: "/test/photo.jpg" },
          "POST"
        );
      });

      it("should upload Live Photo to iCloud successfully", async () => {
        mockDataSynchronizer.syncLivePhoto.mockResolvedValue({ success: true, id: "live-photo-123" });

        const response = await request(app)
          .post("/icloud/photos/upload")
          .send({
            accessToken: "test-token",
            photoPath: "/test/photo.jpg",
            isLivePhoto: true,
            videoPath: "/test/video.mov",
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          response: { success: true, id: "live-photo-123" },
        });
        expect(mockDataSynchronizer.syncLivePhoto).toHaveBeenCalledWith(
          "/test/photo.jpg",
          "/test/video.mov"
        );
      });

      it("should handle upload errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Upload failed", 500));

        const response = await request(app)
          .post("/icloud/photos/upload")
          .send({
            accessToken: "test-token",
            photoPath: "/test/photo.jpg",
            isLivePhoto: false,
          });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to upload photo to iCloud",
        });
      });

      it("should handle unsupported file formats", async () => {
        const response = await request(app)
          .post("/icloud/photos/upload")
          .send({
            accessToken: "test-token",
            photoPath: "/test/document.pdf",
            isLivePhoto: false,
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "Unsupported file format",
        });
      });
    });

    describe("GET /icloud/photos/download", () => {
      it("should download photo from iCloud successfully", async () => {
        const photoBuffer = Buffer.from("fake photo data");
        mockDataSynchronizer.syncData.mockResolvedValue(photoBuffer);

        const response = await request(app)
          .get("/icloud/photos/download")
          .query({ accessToken: "test-token", photoId: "photo-123", isLivePhoto: "false" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(photoBuffer);
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "photos.icloud.com/download/photo-123",
          null,
          "GET"
        );
      });

      it("should download and convert Live Photo from iCloud successfully", async () => {
        const livePhotoBuffer = Buffer.from("fake live photo data");
        mockDataSynchronizer.downloadAndConvertLivePhoto.mockResolvedValue(livePhotoBuffer);

        const response = await request(app)
          .get("/icloud/photos/download")
          .query({ accessToken: "test-token", photoId: "live-photo-123", isLivePhoto: "true" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(livePhotoBuffer);
        expect(mockDataSynchronizer.downloadAndConvertLivePhoto).toHaveBeenCalledWith("live-photo-123");
      });

      it("should handle download errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Download failed", 500));

        const response = await request(app)
          .get("/icloud/photos/download")
          .query({ accessToken: "test-token", photoId: "photo-123", isLivePhoto: "false" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to download photo from iCloud",
        });
      });

      it("should handle missing photos", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue(null);

        const response = await request(app)
          .get("/icloud/photos/download")
          .query({ accessToken: "test-token", photoId: "non-existent-photo", isLivePhoto: "false" });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({
          success: false,
          error: "Photo not found",
        });
      });
    });

    describe("DELETE /icloud/photos/delete", () => {
      it("should delete photo from iCloud successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true });

        const response = await request(app)
          .delete("/icloud/photos/delete")
          .query({ accessToken: "test-token", photoId: "photo-to-delete-123" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          message: "Photo deleted successfully",
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "photos.icloud.com/delete/photo-to-delete-123",
          null,
          "DELETE"
        );
      });

      it("should handle delete errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Delete failed", 500));

        const response = await request(app)
          .delete("/icloud/photos/delete")
          .query({ accessToken: "test-token", photoId: "photo-to-delete-123" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to delete photo from iCloud",
        });
      });
    });
  });

  describe("iCloud Contacts", () => {
    describe("POST /icloud/contacts/sync", () => {
      it("should sync contacts with iCloud successfully", async () => {
        mockDataSynchronizer.syncData.mockResolvedValue({ success: true });

        const contacts = [
          { id: "contact1", name: "John Doe", phone: "1234567890" },
          { id: "contact2", name: "Jane Doe", email: "jane@example.com" },
        ];

        const response = await request(app)
          .post("/icloud/contacts/sync")
          .send({
            accessToken: "test-token",
            contacts: contacts,
          });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          message: "Contacts sync initiated",
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledTimes(2);
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "contacts.icloud.com/contact1",
          contacts[0],
          "PUT"
        );
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "contacts.icloud.com/contact2",
          contacts[1],
          "PUT"
        );
      });

      it("should handle sync errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Sync failed", 500));

        const contacts = [{ id: "contact1", name: "John Doe" }];

        const response = await request(app)
          .post("/icloud/contacts/sync")
          .send({
            accessToken: "test-token",
            contacts: contacts,
          });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to sync contacts to iCloud",
        });
      });

      it("should handle empty contact list", async () => {
        const response = await request(app)
          .post("/icloud/contacts/sync")
          .send({
            accessToken: "test-token",
            contacts: [],
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "No contacts provided for sync",
        });
      });

      it("should handle invalid contact data", async () => {
        const invalidContacts = [
          { id: "contact1" }, // Missing name
          { name: "Jane Doe" }, // Missing id
        ];

        const response = await request(app)
          .post("/icloud/contacts/sync")
          .send({
            accessToken: "test-token",
            contacts: invalidContacts,
          });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
          success: false,
          error: "Invalid contact data provided",
        });
      });
    });

    describe("GET /icloud/contacts/fetch", () => {
      it("should fetch contacts from iCloud successfully", async () => {
        const mockContacts = [
          { id: "contact1", name: "John Doe", phone: "1234567890" },
          { id: "contact2", name: "Jane Doe", email: "jane@example.com" },
        ];
        mockDataSynchronizer.syncData.mockResolvedValue(mockContacts);

        const response = await request(app)
          .get("/icloud/contacts/fetch")
          .query({ accessToken: "test-token" });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          success: true,
          contacts: mockContacts,
        });
        expect(mockDataSynchronizer.syncData).toHaveBeenCalledWith(
          "contacts.icloud.com/fetch",
          null,
          "GET"
        );
      });

      it("should handle fetch errors", async () => {
        mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Fetch failed", 500));

        const response = await request(app)
          .get("/icloud/contacts/fetch")
          .query({ accessToken: "test-token" });

        expect(response.status).toBe(500);
        expect(response.body).toEqual({
          success: false,
          error: "Failed to fetch contacts from iCloud",
        });
      });
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle invalid access tokens", async () => {
      mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Invalid token", 401));

      const response = await request(app)
        .get("/icloud/drive/download")
        .query({ accessToken: "invalid-token", filePath: "/test/file.txt" });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: "Invalid or expired access token",
      });
    });

    it("should handle rate limiting", async () => {
      mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Rate limit exceeded", 429));

      const response = await request(app)
        .post("/icloud/drive/upload")
        .send({
          accessToken: "test-token",
          filePath: "/test/file.txt",
          fileContent: "Test content",
        });

      expect(response.status).toBe(429);
      expect(response.body).toEqual({
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      });
    });

    it("should handle network timeouts", async () => {
      mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Network timeout", 504));

      const response = await request(app)
        .get("/icloud/photos/download")
        .query({ accessToken: "test-token", photoId: "photo-123", isLivePhoto: "false" });

      expect(response.status).toBe(504);
      expect(response.body).toEqual({
        success: false,
        error: "Network timeout. Please try again.",
      });
    });

    it("should handle unsupported media types", async () => {
      const response = await request(app)
        .post("/icloud/photos/upload")
        .send({
          accessToken: "test-token",
          photoPath: "/test/unsupported.gif",
          isLivePhoto: false,
        });

      expect(response.status).toBe(415);
      expect(response.body).toEqual({
        success: false,
        error: "Unsupported media type",
      });
    });

    it("should handle payload too large", async () => {
      const largeContent = "a".repeat(1024 * 1024 * 100); // 100MB content
      const response = await request(app)
        .post("/icloud/drive/upload")
        .send({
          accessToken: "test-token",
          filePath: "/test/large-file.txt",
          fileContent: largeContent,
        });

      expect(response.status).toBe(413);
      expect(response.body).toEqual({
        success: false,
        error: "Payload too large",
      });
    });
  });

  describe("Conflict Resolution", () => {
    it("should handle file conflicts during upload", async () => {
      mockDataSynchronizer.syncData.mockRejectedValue(new AppError("File conflict", 409));
      mockConflictResolutionService.resolveConflict.mockResolvedValue({ action: "rename", newName: "file_1.txt" });

      const response = await request(app)
        .post("/icloud/drive/upload")
        .send({
          accessToken: "test-token",
          filePath: "/test/file.txt",
          fileContent: "Test content",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "File renamed to resolve conflict",
        newFileName: "file_1.txt",
      });
      expect(mockConflictResolutionService.resolveConflict).toHaveBeenCalled();
    });

    it("should handle contact merge conflicts", async () => {
      mockDataSynchronizer.syncData.mockRejectedValue(new AppError("Contact conflict", 409));
      mockConflictResolutionService.resolveConflict.mockResolvedValue({ action: "merge" });

      const contacts = [{ id: "contact1", name: "John Doe", phone: "1234567890" }];

      const response = await request(app)
        .post("/icloud/contacts/sync")
        .send({
          accessToken: "test-token",
          contacts: contacts,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: "Contacts merged to resolve conflicts",
      });
      expect(mockConflictResolutionService.resolveConflict).toHaveBeenCalled();
    });
  });
});