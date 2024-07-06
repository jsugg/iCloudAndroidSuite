import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
  ConflictResolutionService,
  ConflictResolutionStrategy,
} from "../src/services/ConflictResolutionService";
import { AppError } from "../src/errorHandler";
import logger from "../src/util/logger";

jest.mock("../src/util/logger");

describe("ConflictResolutionService", () => {
  let conflictResolutionService: ConflictResolutionService;

  beforeEach(() => {
    conflictResolutionService = new ConflictResolutionService();
    jest.clearAllMocks();
  });

  describe("resolveConflict", () => {
    describe("LastWriteWins strategy", () => {
      it("should choose local data when it's more recent", async () => {
        const localData = {
          id: "1",
          content: "local",
          modificationDate: "2023-07-03T13:00:00Z",
        };
        const cloudData = {
          id: "1",
          content: "cloud",
          modificationDate: "2023-07-03T12:00:00Z",
        };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "lastWriteWins"
        );

        expect(result).toEqual(localData);
      });

      it("should choose cloud data when it's more recent", async () => {
        const localData = {
          id: "1",
          content: "local",
          modificationDate: "2023-07-03T12:00:00Z",
        };
        const cloudData = {
          id: "1",
          content: "cloud",
          modificationDate: "2023-07-03T13:00:00Z",
        };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "lastWriteWins"
        );

        expect(result).toEqual(cloudData);
      });

      it("should handle equal modification dates", async () => {
        const localData = {
          id: "1",
          content: "local",
          modificationDate: "2023-07-03T13:00:00Z",
        };
        const cloudData = {
          id: "1",
          content: "cloud",
          modificationDate: "2023-07-03T13:00:00Z",
        };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "lastWriteWins"
        );

        expect(result).toEqual(localData); // Assuming local is preferred when dates are equal
      });

      it("should handle missing modification dates", async () => {
        const localData = { id: "1", content: "local" };
        const cloudData = {
          id: "1",
          content: "cloud",
          modificationDate: "2023-07-03T13:00:00Z",
        };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "lastWriteWins"
        );

        expect(result).toEqual(cloudData);
      });

      it("should handle invalid date formats", async () => {
        const localData = {
          id: "1",
          content: "local",
          modificationDate: "invalid-date",
        };
        const cloudData = {
          id: "1",
          content: "cloud",
          modificationDate: "2023-07-03T13:00:00Z",
        };

        await expect(
          conflictResolutionService.resolveConflict(
            localData,
            cloudData,
            "lastWriteWins"
          )
        ).rejects.toThrow(AppError);
      });
    });

    describe("Merge strategy", () => {
      it("should merge non-conflicting fields", async () => {
        const localData = { id: "1", content: "local", extra: "local extra" };
        const cloudData = { id: "1", content: "cloud", another: "cloud extra" };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "merge"
        );

        expect(result).toEqual({
          id: "1",
          content: "local",
          extra: "local extra",
          another: "cloud extra",
        });
      });

      it("should prefer local data for conflicting fields", async () => {
        const localData = { id: "1", content: "local", shared: "local shared" };
        const cloudData = { id: "1", content: "cloud", shared: "cloud shared" };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "merge"
        );

        expect(result).toEqual({
          id: "1",
          content: "local",
          shared: "local shared",
        });
      });

      it("should handle nested objects", async () => {
        const localData = { id: "1", nested: { a: 1, b: 2 } };
        const cloudData = { id: "1", nested: { b: 3, c: 4 } };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "merge"
        );

        expect(result).toEqual({
          id: "1",
          nested: { a: 1, b: 2, c: 4 },
        });
      });

      it("should handle arrays", async () => {
        const localData = { id: "1", array: [1, 2, 3] };
        const cloudData = { id: "1", array: [3, 4, 5] };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "merge"
        );

        expect(result).toEqual({
          id: "1",
          array: [1, 2, 3, 4, 5],
        });
      });

      it("should handle deep nested structures", async () => {
        const localData = {
          id: "1",
          deep: { nested: { structure: { local: true } } },
        };
        const cloudData = {
          id: "1",
          deep: { nested: { structure: { cloud: true } } },
        };

        const result = await conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "merge"
        );

        expect(result).toEqual({
          id: "1",
          deep: { nested: { structure: { local: true, cloud: true } } },
        });
      });
    });

    describe("Manual resolution strategy", () => {
      it("should throw AppError for Manual resolution strategy", async () => {
        const localData = { id: "1", content: "local" };
        const cloudData = { id: "1", content: "cloud" };

        await expect(
          conflictResolutionService.resolveConflict(
            localData,
            cloudData,
            "manual"
          )
        ).rejects.toThrow(AppError);
      });

      it("should include both local and cloud data in the error", async () => {
        const localData = { id: "1", content: "local" };
        const cloudData = { id: "1", content: "cloud" };

        try {
          await conflictResolutionService.resolveConflict(
            localData,
            cloudData,
            "manual"
          );
          fail("Expected an AppError to be thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(AppError);
          if (error instanceof AppError) {
            expect(error.message).toContain("Manual resolution required");
            expect(error.message).toContain(JSON.stringify(localData));
            expect(error.message).toContain(JSON.stringify(cloudData));
          }
        }
      });
    });

    it("should throw AppError for invalid strategy", async () => {
      const localData = { id: "1", content: "local" };
      const cloudData = { id: "1", content: "cloud" };

      await expect(
        conflictResolutionService.resolveConflict(
          localData,
          cloudData,
          "invalidStrategy" as any
        )
      ).rejects.toThrow(AppError);
    });

    it("should use lastWriteWins as default strategy when not specified", async () => {
      const localData = {
        id: "1",
        content: "local",
        modificationDate: "2023-07-03T13:00:00Z",
      };
      const cloudData = {
        id: "1",
        content: "cloud",
        modificationDate: "2023-07-03T12:00:00Z",
      };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData
      );

      expect(result).toEqual(localData);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle empty objects", async () => {
      const localData = {};
      const cloudData = {};

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({});
    });

    it("should handle null values", async () => {
      const localData = { id: "1", content: null };
      const cloudData = { id: "1", content: "cloud" };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({ id: "1", content: null });
    });

    it("should handle undefined values", async () => {
      const localData = { id: "1", content: undefined };
      const cloudData = { id: "1", content: "cloud" };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({ id: "1", content: undefined });
    });

    it("should handle different data types", async () => {
      const localData = { id: "1", content: 123 };
      const cloudData = { id: "1", content: "cloud" };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({ id: "1", content: 123 });
    });

    it("should handle circular references", async () => {
      const localData: Record<string, any> = { id: "1" };
      localData.self = localData;
      const cloudData = { id: "1", content: "cloud" };

      await expect(
        conflictResolutionService.resolveConflict(localData, cloudData, "merge")
      ).rejects.toThrow(AppError);
    });

    it("should handle Date objects", async () => {
      const localDate = new Date("2023-07-03T13:00:00Z");
      const cloudDate = new Date("2023-07-03T12:00:00Z");
      const localData = { id: "1", date: localDate };
      const cloudData = { id: "1", date: cloudDate };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "lastWriteWins"
      );

      expect(result).toEqual(localData);
    });

    it("should handle functions in objects", async () => {
      const localFunc = () => console.log("local");
      const cloudFunc = () => console.log("cloud");
      const localData = { id: "1", func: localFunc };
      const cloudData = { id: "1", func: cloudFunc };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(typeof result.func).toBe("function");
      expect((result as { func: Function }).func.toString()).toEqual(
        localFunc.toString()
      );
    });

    it("should throw AppError when strategy throws non-AppError", async () => {
      const localData = { id: 1 };
      const cloudData = { id: 1 };

      // Mock the strategy to throw an error
      jest
        .spyOn(ConflictResolutionService.prototype as any, "strategies")
        .mockReturnValue(
          new Map([
            [
              "error",
              {
                resolve: () => {
                  throw new Error("Test error");
                },
              },
            ],
          ])
        );

      await expect(
        conflictResolutionService.resolveConflict(localData, cloudData, "error")
      ).rejects.toThrow(AppError);

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to resolve conflict",
        expect.any(Object)
      );

      // Clean up after the test
      jest.restoreAllMocks();
    });

    it("should throw AppError when strategy throws non-AppError", async () => {
      const errorStrategy: ConflictResolutionStrategy = {
        resolve: jest
          .fn()
          .mockImplementation(() => Promise.reject(new Error("Test error"))),
      };

      jest
        .spyOn(conflictResolutionService as any, "strategies")
        .mockReturnValue(new Map([["error", errorStrategy]]));

      await expect(
        conflictResolutionService.resolveConflict({}, {}, "error")
      ).rejects.toThrow(AppError);

      expect(logger.error).toHaveBeenCalledWith(
        "Failed to resolve conflict",
        expect.any(Object)
      );
    });
  });

  describe("Performance", () => {
    it("should handle large objects efficiently", async () => {
      const largeObject = Array(10000)
        .fill(null)
        .reduce((acc, _, index) => {
          acc[`key${index}`] = `value${index}`;
          return acc;
        }, {});

      const localData = { id: "1", ...largeObject, local: true };
      const cloudData = { id: "1", ...largeObject, cloud: true };

      const startTime = Date.now();
      await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should resolve in less than 1 second
    });

    it("should handle deeply nested objects efficiently", async () => {
      const createNestedObject = (depth: number): any => {
        if (depth === 0) {
          return { value: "leaf" };
        }
        return { nested: createNestedObject(depth - 1) };
      };

      const localData = createNestedObject(100);
      const cloudData = createNestedObject(100);

      const startTime = Date.now();
      await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should resolve in less than 1 second
    });
  });

  describe("Specific use cases", () => {
    it("should correctly merge arrays of objects", async () => {
      const localData = {
        id: "1",
        items: [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
        ],
      };
      const cloudData = {
        id: "1",
        items: [
          { id: "b", value: 3 },
          { id: "c", value: 4 },
        ],
      };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({
        id: "1",
        items: [
          { id: "a", value: 1 },
          { id: "b", value: 2 },
          { id: "c", value: 4 },
        ],
      });
    });

    it("should handle conflicts in nested arrays", async () => {
      const localData = { id: "1", nested: { array: [1, 2, 3] } };
      const cloudData = { id: "1", nested: { array: [3, 4, 5] } };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({
        id: "1",
        nested: { array: [1, 2, 3, 4, 5] },
      });
    });

    it("should handle conflicts with different types", async () => {
      const localData = { id: "1", value: "string" };
      const cloudData = { id: "1", value: 123 };

      const result = await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(result).toEqual({
        id: "1",
        value: "string", // Local value should be preserved
      });
    });
  });
  describe("Logging", () => {
    it("should log info when conflict is resolved", async () => {
      const localData = { id: 1 };
      const cloudData = { id: 2 };

      await conflictResolutionService.resolveConflict(
        localData,
        cloudData,
        "merge"
      );

      expect(logger.info).toHaveBeenCalledWith("Conflict resolved", {
        strategy: "merge",
      });
    });
  });
});
