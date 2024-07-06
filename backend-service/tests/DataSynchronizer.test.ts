import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import type { Mocked } from "jest-mock";
import fetch from "node-fetch";
import type { Response } from "node-fetch";

import { DataSynchronizer } from "../src/services/DataSynchronizer";
import { AppleMetadataService } from "../src/services/AppleMetadataService";
import { LivePhotoService } from "../src/services/LivePhotoService";
import { ConflictResolutionService } from "../src/services/ConflictResolutionService";
import { AppError } from "../src/errorHandler";

jest.mock("node-fetch");
jest.mock("../src/services/AppleMetadataService");
jest.mock("../src/services/LivePhotoService");
jest.mock("../src/services/ConflictResolutionService");

describe("DataSynchronizer", () => {
  let dataSynchronizer: DataSynchronizer;
  let mockAppleMetadataService: Mocked<AppleMetadataService>;
  let mockLivePhotoService: Mocked<LivePhotoService>;
  let mockConflictResolutionService: Mocked<ConflictResolutionService>;

  beforeEach(() => {
    mockAppleMetadataService = new AppleMetadataService(
      ""
    ) as Mocked<AppleMetadataService>;
    mockLivePhotoService = new LivePhotoService("") as Mocked<LivePhotoService>;
    mockConflictResolutionService =
      new ConflictResolutionService() as Mocked<ConflictResolutionService>;
    dataSynchronizer = new DataSynchronizer(
      "test-token",
      mockAppleMetadataService,
      mockLivePhotoService,
      mockConflictResolutionService
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("syncData", () => {
    it.each([
      ["POST", { id: "123", data: "test" }],
      ["GET", null],
      ["PUT", { id: "456", data: "update" }],
      ["DELETE", { id: "789" }],
    ])("should successfully sync data with %s method", async (method, data) => {
      const mockResponse = {
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ success: true })),
        ok: true,
        status: 200,
        statusText: "OK",
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      const result = await dataSynchronizer.syncData(
        "test-endpoint",
        data,
        method as any
      );

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledWith(
        "https://api.icloud.com/test-endpoint",
        expect.objectContaining({
          method,
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
            "Content-Type": "application/json",
          }),
          body: data ? JSON.stringify(data) : undefined,
        })
      );
    });

    it("should retry on network failure with exponential backoff", async () => {
      jest.useFakeTimers();
      (fetch as jest.MockedFunction<typeof fetch>)
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response);

      const syncPromise = dataSynchronizer.syncData("test-endpoint", {
        data: "test",
      });

      // Fast-forward time for first retry
      jest.advanceTimersByTime(2000);
      // Fast-forward time for second retry
      jest.advanceTimersByTime(4000);

      const result = await syncPromise;

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it("should throw AppError after max retries", async () => {
      jest.useFakeTimers();
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network error")
      );

      const syncPromise = dataSynchronizer.syncData("test-endpoint", {
        data: "test",
      });

      // Fast-forward time for all retries
      jest.advanceTimersByTime(2000 + 4000 + 8000);

      await expect(syncPromise).rejects.toThrow(AppError);
      expect(fetch).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    it("should handle rate limiting with retry-after header", async () => {
      const mockRateLimitResponse = {
        ok: false,
        status: 429,
        headers: new Map([["retry-after", "2"]]),
      } as unknown as Response;
      const mockSuccessResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ success: true })),
      } as unknown as Response;

      (fetch as jest.MockedFunction<typeof fetch>)
        .mockResolvedValueOnce(mockRateLimitResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      jest.useFakeTimers();
      const syncPromise = dataSynchronizer.syncData("test-endpoint", {
        data: "test",
      });

      jest.advanceTimersByTime(2000);
      const result = await syncPromise;

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it("should save metadata for successful syncs", async () => {
      const mockResponse = {
        json: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ success: true, id: "file-123" })
          ),
        ok: true,
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      const testMetadata = {
        key: "value",
        createdAt: new Date().toISOString(),
      };
      await dataSynchronizer.syncData("test-endpoint", {
        id: "file-123",
        data: "test",
        metadata: testMetadata,
      });

      expect(
        mockAppleMetadataService.convertToAppleMetadata
      ).toHaveBeenCalledWith(testMetadata);
      expect(mockAppleMetadataService.saveMetadata).toHaveBeenCalledWith(
        "file-123",
        expect.any(Object)
      );
    });

    it("should handle invalid authentication token", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Invalid authentication token");
    });
    describe("batchSync", () => {
      it("should successfully sync large datasets by batching", async () => {
        const largeDataset = Array(250)
          .fill(null)
          .map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
          mockResponse
        );

        const result = await dataSynchronizer.syncData(
          "test-endpoint",
          largeDataset
        );

        expect(fetch).toHaveBeenCalledTimes(3); // 250 items / 100 batch size = 3 calls
        expect(result.results).toHaveLength(3); // 3 batch results
        expect(result.errors).toHaveLength(0);
      });

      it("should handle partial failures in batches", async () => {
        const largeDataset = Array(250)
          .fill(null)
          .map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockSuccessResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;

        (fetch as jest.MockedFunction<typeof fetch>)
          .mockResolvedValueOnce(mockSuccessResponse)
          .mockRejectedValueOnce(new Error("Network error"))
          .mockResolvedValueOnce(mockSuccessResponse);

        const result = await dataSynchronizer.syncData(
          "test-endpoint",
          largeDataset
        );

        expect(fetch).toHaveBeenCalledTimes(9); // 3 batches * 3 attempts each
        expect(result.results).toHaveLength(2); // 2 successful batches
        expect(result.errors).toHaveLength(100); // 1 failed batch
        expect(result.errors[0]).toEqual(
          expect.objectContaining({
            id: "item-100",
            error: "Network error",
          })
        );
      });

      it("should retry failed batches with exponential backoff", async () => {
        jest.useFakeTimers();

        const dataset = Array(100)
          .fill(null)
          .map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockSuccessResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;

        (fetch as jest.MockedFunction<typeof fetch>)
          .mockRejectedValueOnce(new Error("Network error"))
          .mockRejectedValueOnce(new Error("Network error"))
          .mockResolvedValueOnce(mockSuccessResponse);

        const syncPromise = dataSynchronizer.syncData("test-endpoint", dataset);

        // Fast-forward timers for each retry
        jest.advanceTimersByTime(1000); // 1 second
        jest.advanceTimersByTime(2000); // 2 seconds

        const result = await syncPromise;

        expect(fetch).toHaveBeenCalledTimes(3); // 3 attempts
        expect(result.results).toHaveLength(1); // 1 successful batch
        expect(result.errors).toHaveLength(0); // No errors after successful retry

        jest.useRealTimers();
      });

      it("should handle rate limiting", async () => {
        const dataset = Array(100)
          .fill(null)
          .map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockRateLimitResponse = {
          ok: false,
          status: 429,
          statusText: "Too Many Requests",
          headers: new Map([["Retry-After", "2"]]),
        } as unknown as Response;
        const mockSuccessResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;

        (fetch as jest.MockedFunction<typeof fetch>)
          .mockResolvedValueOnce(mockRateLimitResponse)
          .mockResolvedValueOnce(mockSuccessResponse);

        jest.useFakeTimers();
        const syncPromise = dataSynchronizer.syncData("test-endpoint", dataset);

        jest.advanceTimersByTime(2000); // Advance time by 2 seconds (Retry-After value)

        const result = await syncPromise;

        expect(fetch).toHaveBeenCalledTimes(2); // 2 attempts
        expect(result.results).toHaveLength(1); // 1 successful batch
        expect(result.errors).toHaveLength(0); // No errors after successful retry

        jest.useRealTimers();
      });

      it("should handle invalid data in batch", async () => {
        const dataset = Array(100)
          .fill(null)
          .map((_, i) =>
            i === 50 ? null : { id: `item-${i}`, data: `test-${i}` }
          );
        const mockResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
          mockResponse
        );

        const result = await dataSynchronizer.syncData(
          "test-endpoint",
          dataset
        );

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.results).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual(
          expect.objectContaining({
            id: undefined,
            error: expect.stringContaining("Invalid data"),
          })
        );
      });
    });
  });

  describe("syncLivePhoto", () => {
    it("should successfully sync a Live Photo", async () => {
      const fakeMotionPhoto = Buffer.from("fake-motion-photo");
      mockLivePhotoService.convertToAndroidMotionPhoto.mockResolvedValue(
        fakeMotionPhoto
      );
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ success: true, id: "photo-123" })
          ),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      const result = await dataSynchronizer.syncLivePhoto(
        "test.jpg",
        "test.mov"
      );

      expect(result).toEqual({ success: true, id: "photo-123" });
      expect(
        mockLivePhotoService.convertToAndroidMotionPhoto
      ).toHaveBeenCalledWith("test.jpg", "test.mov");
      expect(fetch).toHaveBeenCalledWith(
        "https://api.icloud.com/photos.icloud.com/upload",
        expect.objectContaining({
          method: "POST",
          body: fakeMotionPhoto,
          headers: expect.objectContaining({
            "Content-Type": "image/jpeg",
            "X-Apple-Live-Photo": "true",
          }),
        })
      );
    });

    it("should handle conversion errors", async () => {
      mockLivePhotoService.convertToAndroidMotionPhoto.mockRejectedValue(
        new Error("Conversion failed")
      );

      await expect(
        dataSynchronizer.syncLivePhoto("test.jpg", "test.mov")
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to convert Live Photo");
    });

    it("should handle upload errors", async () => {
      mockLivePhotoService.convertToAndroidMotionPhoto.mockResolvedValue(
        Buffer.from("fake-motion-photo")
      );
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Upload failed")
      );

      await expect(
        dataSynchronizer.syncLivePhoto("test.jpg", "test.mov")
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to upload Live Photo");
    });
  });

  describe("downloadAndConvertLivePhoto", () => {
    it("should successfully download and convert a Live Photo", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ jpeg: "fake-jpeg-data", mov: "fake-mov-data" })
          ),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );
      mockLivePhotoService.convertToAndroidMotionPhoto.mockResolvedValue(
        Buffer.from("fake-motion-photo")
      );

      const result = await dataSynchronizer.downloadAndConvertLivePhoto(
        "photo-id"
      );

      expect(result).toEqual(Buffer.from("fake-motion-photo"));
      expect(fetch).toHaveBeenCalledWith(
        "https://api.icloud.com/photos.icloud.com/download/photo-id",
        expect.objectContaining({ method: "GET" })
      );
      expect(
        mockLivePhotoService.convertToAndroidMotionPhoto
      ).toHaveBeenCalledWith("fake-jpeg-data", "fake-mov-data");
    });

    it("should handle download errors", async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Download failed")
      );

      await expect(
        dataSynchronizer.downloadAndConvertLivePhoto("photo-id")
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to download Live Photo");
    });

    it("should handle conversion errors after successful download", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ jpeg: "fake-jpeg-data", mov: "fake-mov-data" })
          ),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );
      mockLivePhotoService.convertToAndroidMotionPhoto.mockRejectedValue(
        new Error("Conversion failed")
      );

      await expect(
        dataSynchronizer.downloadAndConvertLivePhoto("photo-id")
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to convert downloaded Live Photo");
    });
  });

  describe("resolveConflict", () => {
    it.each([
      [
        "lastWriteWins",
        {
          local: { modifiedAt: "2023-01-02" },
          cloud: { modifiedAt: "2023-01-01" },
        },
      ],
      ["manualMerge", { local: { name: "Local" }, cloud: { name: "Cloud" } }],
      ["automaticMerge", { local: { a: 1, b: 2 }, cloud: { b: 3, c: 4 } }],
    ])(
      "should successfully resolve a conflict using %s strategy",
      async (strategy, data) => {
        const resolvedData = { ...data.local, ...data.cloud };
        mockConflictResolutionService.resolveConflict.mockResolvedValue(
          resolvedData
        );

        const result = await dataSynchronizer.resolveConflict(
          data.local,
          data.cloud,
          strategy
        );

        expect(result).toEqual(resolvedData);
        expect(
          mockConflictResolutionService.resolveConflict
        ).toHaveBeenCalledWith(data.local, data.cloud, strategy);
      }
    );

    it("should use default strategy when not specified", async () => {
      const data = { local: { a: 1 }, cloud: { b: 2 } };
      await dataSynchronizer.resolveConflict(data.local, data.cloud);

      expect(
        mockConflictResolutionService.resolveConflict
      ).toHaveBeenCalledWith(data.local, data.cloud, "lastWriteWins");
    });

    it("should throw AppError on resolution failure", async () => {
      mockConflictResolutionService.resolveConflict.mockRejectedValue(
        new Error("Resolution failed")
      );

      await expect(
        dataSynchronizer.resolveConflict({ local: "data" }, { cloud: "data" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to resolve conflict");
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle invalid JSON responses", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve(new Error("Invalid JSON"))),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Invalid response from server");
    });

    it("should handle network timeouts", async () => {
      (fetch as jest.MockedFunction<typeof fetch>).mockRejectedValue(
        new Error("Network timeout")
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Network timeout");
    });

    it("should handle large payloads", async () => {
      const largeData = "a".repeat(1024 * 1024 * 5); // 5MB of data
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ success: true })),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await dataSynchronizer.syncData("test-endpoint", { data: largeData });

      expect(fetch).toHaveBeenCalledWith(
        "https://api.icloud.com/test-endpoint",
        expect.objectContaining({
          body: expect.stringContaining(largeData),
        })
      );
    });

    it("should handle server errors", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Server error: Internal Server Error");
    });

    it("should handle unexpected response formats", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve("Not an object")),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Unexpected response format from server");
    });
  });

  describe("Token management", () => {
    it("should use the provided token in the Authorization header", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ success: true })),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await dataSynchronizer.syncData("test-endpoint", { data: "test" });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should throw an error if the token is invalid", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", { data: "test" })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Invalid authentication token");
    });
  });

  describe("Metadata handling", () => {
    it("should correctly handle and save metadata for various data types", async () => {
      const testCases = [
        { id: "file1", type: "document", size: 1024 },
        { id: "photo1", type: "image", width: 800, height: 600 },
        {
          id: "contact1",
          type: "contact",
          name: "John Doe",
          phone: "1234567890",
        },
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          ok: true,
          json: jest
            .fn()
            .mockImplementation(() =>
              Promise.resolve({ success: true, id: testCase.id })
            ),
        } as unknown as Response;
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
          mockResponse
        );

        await dataSynchronizer.syncData("test-endpoint", {
          ...testCase,
          data: "test content",
        });

        expect(
          mockAppleMetadataService.convertToAppleMetadata
        ).toHaveBeenCalledWith(expect.objectContaining(testCase));
        expect(mockAppleMetadataService.saveMetadata).toHaveBeenCalledWith(
          testCase.id,
          expect.any(Object)
        );
      }
    });

    it("should handle metadata conversion errors", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() =>
            Promise.resolve({ success: true, id: "test-id" })
          ),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );
      mockAppleMetadataService.convertToAppleMetadata.mockRejectedValue(
        new Error("Conversion error")
      );

      await expect(
        dataSynchronizer.syncData("test-endpoint", {
          id: "test-id",
          data: "test",
          metadata: { key: "value" },
        })
      ).rejects.toThrow(AppError);
      expect(
        (AppError as jest.MockedClass<typeof AppError>).mock.calls[0][0]
      ).toBe("Failed to convert metadata");
    });
  });

  describe("Performance and optimization", () => {
    it("should handle concurrent requests efficiently", async () => {
      const mockResponse = {
        ok: true,
        json: jest
          .fn()
          .mockImplementation(() => Promise.resolve({ success: true })),
      } as unknown as Response;
      (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(
        mockResponse
      );

      const concurrentRequests = 10;
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          dataSynchronizer.syncData("test-endpoint", { data: "test" })
        );

      await Promise.all(promises);

      expect(fetch).toHaveBeenCalledTimes(concurrentRequests);
    });

    describe('batchSync', () => {
      it('should successfully sync large datasets by batching', async () => {
        const largeDataset = Array(250).fill(null).map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockResponse = {
          ok: true,
          json: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
  
        const result = await dataSynchronizer.syncData("test-endpoint", largeDataset);
  
        expect(fetch).toHaveBeenCalledTimes(3); // 250 items / 100 batch size = 3 calls
        expect(result.results).toHaveLength(3); // 3 batch results
        expect(result.errors).toHaveLength(0);
      });
  
      it('should handle partial failures in batches', async () => {
        const largeDataset = Array(250).fill(null).map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockSuccessResponse = {
          ok: true,
          json: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        
        (fetch as jest.MockedFunction<typeof fetch>)
          .mockResolvedValueOnce(mockSuccessResponse)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(mockSuccessResponse);
  
        const result = await dataSynchronizer.syncData("test-endpoint", largeDataset);
  
        expect(fetch).toHaveBeenCalledTimes(9); // 3 batches * 3 attempts each
        expect(result.results).toHaveLength(2); // 2 successful batches
        expect(result.errors).toHaveLength(100); // 1 failed batch
        expect(result.errors[0]).toEqual(expect.objectContaining({
          id: 'item-100',
          error: 'Network error'
        }));
      });
  
      it('should retry failed batches with exponential backoff', async () => {
        jest.useFakeTimers();
        
        const dataset = Array(100).fill(null).map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockSuccessResponse = {
          ok: true,
          json: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        
        (fetch as jest.MockedFunction<typeof fetch>)
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(mockSuccessResponse);
  
        const syncPromise = dataSynchronizer.syncData("test-endpoint", dataset);
        
        // Fast-forward timers for each retry
        jest.advanceTimersByTime(1000); // 1 second
        jest.advanceTimersByTime(2000); // 2 seconds
  
        const result = await syncPromise;
  
        expect(fetch).toHaveBeenCalledTimes(3); // 3 attempts
        expect(result.results).toHaveLength(1); // 1 successful batch
        expect(result.errors).toHaveLength(0); // No errors after successful retry
        
        jest.useRealTimers();
      });
  
      it('should handle rate limiting', async () => {
        const dataset = Array(100).fill(null).map((_, i) => ({ id: `item-${i}`, data: `test-${i}` }));
        const mockRateLimitResponse = {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Map([['Retry-After', '2']]),
        } as unknown as Response;
        const mockSuccessResponse = {
          ok: true,
          json: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        
        (fetch as jest.MockedFunction<typeof fetch>)
          .mockResolvedValueOnce(mockRateLimitResponse)
          .mockResolvedValueOnce(mockSuccessResponse);
  
        jest.useFakeTimers();
        const syncPromise = dataSynchronizer.syncData("test-endpoint", dataset);
        
        jest.advanceTimersByTime(2000); // Advance time by 2 seconds (Retry-After value)
        
        const result = await syncPromise;
  
        expect(fetch).toHaveBeenCalledTimes(2); // 2 attempts
        expect(result.results).toHaveLength(1); // 1 successful batch
        expect(result.errors).toHaveLength(0); // No errors after successful retry
        
        jest.useRealTimers();
      });
  
      it('should handle invalid data in batch', async () => {
        const dataset = Array(100).fill(null).map((_, i) => i === 50 ? null : { id: `item-${i}`, data: `test-${i}` });
        const mockResponse = {
          ok: true,
          json: jest.fn().mockImplementation(() => Promise.resolve({ success: true })),
        } as unknown as Response;
        (fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue(mockResponse);
  
        const result = await dataSynchronizer.syncData("test-endpoint", dataset);
  
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(result.results).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toEqual(expect.objectContaining({
          id: undefined,
          error: expect.stringContaining('Invalid data')
        }));
      });
    });
  });
});
