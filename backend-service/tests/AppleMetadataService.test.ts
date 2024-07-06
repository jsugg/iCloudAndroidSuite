import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs/promises";
import path from "path";
import { AppleMetadataService, AppleMetadata } from "../src/services/AppleMetadataService";
import { AppError } from "../src/errorHandler";
import logger from "../src/util/logger";

jest.mock("fs/promises");
jest.mock("../src/util/logger");

describe("AppleMetadataService", () => {
  let appleMetadataService: AppleMetadataService;
  const testStoragePath = "/test/storage";

  beforeEach(() => {
    appleMetadataService = new AppleMetadataService(testStoragePath);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const sampleMetadata: AppleMetadata = {
    creationDate: "2023-07-03T12:00:00Z",
    modificationDate: "2023-07-03T13:00:00Z",
    label: "Test Label",
    tags: ["tag1", "tag2"],
    uti: "test-uti",
    quarantineAttribute: "test-quarantine",
    customIcon: Buffer.from("test-icon"),
    finderFlags: 1,
    acl: ["user1", "user2"],
    spotlightComments: "Test comment",
    contentCreationDate: "2023-07-03T11:00:00Z",
    customMetadata: { key: "value" },
  };

  describe("Constructor", () => {
    it("should create correct metadata path", () => {
      expect(appleMetadataService["metadataPath"]).toBe(path.join(testStoragePath, 'apple_metadata'));
    });

    it("should handle empty storage path", () => {
      const service = new AppleMetadataService("");
      expect(service["metadataPath"]).toBe(path.join('', 'apple_metadata'));
    });
  });

  describe("saveMetadata", () => {
    it("should save metadata successfully", async () => {
      const fileId = "test-file-id";
      await appleMetadataService.saveMetadata(fileId, sampleMetadata);
      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(expect.any(String), expect.any(String));
      expect(logger.info).toHaveBeenCalledWith(`Metadata saved for file ${fileId}`);
    });

    it("should throw AppError on mkdir failure", async () => {
      (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockRejectedValue(new Error("mkdir failed"));
      await expect(appleMetadataService.saveMetadata("test", sampleMetadata)).rejects.toThrow(AppError);
    });

    it("should throw AppError on writeFile failure", async () => {
      (fs.writeFile as jest.MockedFunction<typeof fs.writeFile>).mockRejectedValue(new Error("write failed"));
      await expect(appleMetadataService.saveMetadata("test", sampleMetadata)).rejects.toThrow(AppError);
    });

    it("should handle metadata with circular references", async () => {
      const circularMetadata: any = { ...sampleMetadata };
      circularMetadata.circular = circularMetadata;
      await expect(appleMetadataService.saveMetadata("test", circularMetadata)).rejects.toThrow();
    });
  });

  describe("getMetadata", () => {
    it("should retrieve metadata successfully", async () => {
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue(JSON.stringify(sampleMetadata));
      const result = await appleMetadataService.getMetadata("test");
      expect(result).toEqual(sampleMetadata);
    });

    it("should throw AppError on readFile failure", async () => {
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockRejectedValue(new Error("read failed"));
      await expect(appleMetadataService.getMetadata("test")).rejects.toThrow(AppError);
    });

    it("should throw AppError on JSON parse failure", async () => {
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>).mockResolvedValue("invalid json");
      await expect(appleMetadataService.getMetadata("test")).rejects.toThrow(AppError);
    });
  });

  describe("updateMetadata", () => {
    it("should update metadata successfully", async () => {
      jest.spyOn(appleMetadataService, 'getMetadata').mockResolvedValue(sampleMetadata);
      jest.spyOn(appleMetadataService, 'saveMetadata').mockResolvedValue();
      const updates = { label: "Updated Label" };
      await appleMetadataService.updateMetadata("test", updates);
      expect(appleMetadataService.saveMetadata).toHaveBeenCalledWith("test", expect.objectContaining(updates));
    });

    it("should throw AppError on getMetadata failure", async () => {
      jest.spyOn(appleMetadataService, 'getMetadata').mockRejectedValue(new Error("get failed"));
      await expect(appleMetadataService.updateMetadata("test", {})).rejects.toThrow(AppError);
    });

    it("should throw AppError on saveMetadata failure", async () => {
      jest.spyOn(appleMetadataService, 'getMetadata').mockResolvedValue(sampleMetadata);
      jest.spyOn(appleMetadataService, 'saveMetadata').mockRejectedValue(new Error("save failed"));
      await expect(appleMetadataService.updateMetadata("test", {})).rejects.toThrow(AppError);
    });

    it("should merge arrays instead of replacing them", async () => {
      jest.spyOn(appleMetadataService, 'getMetadata').mockResolvedValue(sampleMetadata);
      jest.spyOn(appleMetadataService, 'saveMetadata').mockResolvedValue();
      const updates = { tags: ["newTag"] };
      await appleMetadataService.updateMetadata("test", updates);
      expect(appleMetadataService.saveMetadata).toHaveBeenCalledWith("test", expect.objectContaining({
        tags: ["tag1", "tag2", "newTag"]
      }));
    });
  });

  describe("convertToAndroidMetadata", () => {
    it("should convert Apple metadata to Android format", async () => {
      const result = await appleMetadataService.convertToAndroidMetadata(sampleMetadata);
      expect(result).toMatchObject({
        dateCreated: expect.any(Number),
        dateModified: expect.any(Number),
        label: sampleMetadata.label,
        tags: sampleMetadata.tags.join(','),
        customMetadata: expect.any(String),
        uti: sampleMetadata.uti,
        quarantineAttribute: sampleMetadata.quarantineAttribute,
        finderFlags: sampleMetadata.finderFlags,
        acl: expect.any(String),
        spotlightComments: sampleMetadata.spotlightComments,
        contentCreationDate: expect.any(Number),
      });
    });

    it("should handle empty metadata", async () => {
      const emptyMetadata: AppleMetadata = {
        creationDate: "",
        modificationDate: "",
        label: "",
        tags: [],
        uti: "",
        quarantineAttribute: "",
        customIcon: Buffer.alloc(0),
        finderFlags: 0,
        acl: [],
        spotlightComments: "",
        contentCreationDate: "",
        customMetadata: {},
      };
      const result = await appleMetadataService.convertToAndroidMetadata(emptyMetadata);
      expect(result).toMatchObject({
        dateCreated: expect.any(Number),
        dateModified: expect.any(Number),
        label: "",
        tags: "",
        customMetadata: "{}",
        uti: "",
        quarantineAttribute: "",
        finderFlags: 0,
        acl: "[]",
        spotlightComments: "",
        contentCreationDate: expect.any(Number),
      });
    });
  });

  describe("convertToAppleMetadata", () => {
    const sampleAndroidMetadata = {
      dateCreated: 1625313600000,
      dateModified: 1625317200000,
      label: "Test Label",
      tags: "tag1,tag2",
      uti: "test-uti",
      quarantineAttribute: "test-quarantine",
      finderFlags: 1,
      acl: JSON.stringify(["user1", "user2"]),
      spotlightComments: "Test comment",
      contentCreationDate: 1625310000000,
      customMetadata: JSON.stringify({ key: "value" }),
    };

    it("should convert Android metadata to Apple format", async () => {
      const result = await appleMetadataService.convertToAppleMetadata(sampleAndroidMetadata);
      expect(result).toMatchObject({
        creationDate: expect.any(String),
        modificationDate: expect.any(String),
        label: sampleAndroidMetadata.label,
        tags: ["tag1", "tag2"],
        uti: sampleAndroidMetadata.uti,
        quarantineAttribute: sampleAndroidMetadata.quarantineAttribute,
        customIcon: expect.any(Buffer),
        finderFlags: sampleAndroidMetadata.finderFlags,
        acl: ["user1", "user2"],
        spotlightComments: sampleAndroidMetadata.spotlightComments,
        contentCreationDate: expect.any(String),
        customMetadata: { key: "value" },
      });
    });

    it("should handle missing fields", async () => {
      const incompleteMetadata = {
        dateCreated: 1625313600000,
        dateModified: 1625317200000,
      };
      const result = await appleMetadataService.convertToAppleMetadata(incompleteMetadata);
      expect(result).toMatchObject({
        creationDate: expect.any(String),
        modificationDate: expect.any(String),
        label: "",
        tags: [],
        uti: "",
        quarantineAttribute: "",
        customIcon: expect.any(Buffer),
        finderFlags: 0,
        acl: [],
        spotlightComments: "",
        contentCreationDate: expect.any(String),
        customMetadata: {},
      });
    });

    it("should handle invalid JSON in customMetadata and acl", async () => {
      const invalidJsonMetadata = {
        ...sampleAndroidMetadata,
        customMetadata: "invalid json",
        acl: "invalid json",
      };
      const result = await appleMetadataService.convertToAppleMetadata(invalidJsonMetadata);
      expect(result.customMetadata).toEqual({});
      expect(result.acl).toEqual([]);
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle file names with special characters", async () => {
      const fileId = "test file with spaces and !@#$%^&*()";
      await appleMetadataService.saveMetadata(fileId, sampleMetadata);
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent(fileId)), expect.any(String));
    });

    it("should prevent directory traversal", async () => {
      const fileId = "../../../etc/passwd";
      await appleMetadataService.saveMetadata(fileId, sampleMetadata);
      expect(fs.writeFile).not.toHaveBeenCalledWith(expect.stringContaining("/etc/passwd"), expect.any(String));
    });

    it("should handle very large metadata", async () => {
      const largeMetadata = {
        ...sampleMetadata,
        customMetadata: { large: "a".repeat(1000000) } // 1MB string
      };
      await expect(appleMetadataService.saveMetadata("large-file", largeMetadata)).resolves.not.toThrow();
    });

    it("should handle concurrent operations", async () => {
      const promises = Array(10).fill(null).map((_, i) => 
        appleMetadataService.saveMetadata(`file-${i}`, sampleMetadata)
      );
      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });
});