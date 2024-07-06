import {
  jest,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "@jest/globals";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";

import { LivePhotoService } from "../src/services/LivePhotoService";
import { AppError } from "../src/errorHandler";

jest.mock("fluent-ffmpeg");
jest.mock("fs/promises");

type MockFfmpeg = {
  outputOptions: jest.Mock;
  output: jest.Mock;
  on: jest.Mock;
  run: jest.Mock;
};

describe("LivePhotoService", () => {
  let livePhotoService: LivePhotoService;
  const testTempDir = "/test/temp";
  const ARTIFACTS_DIR = "artifacts"

  beforeEach(() => {
    livePhotoService = new LivePhotoService(testTempDir);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("convertToAndroidMotionPhoto", () => {
    it("should convert Live Photo to Android Motion Photo successfully", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "end") {
            callback();
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
        .mockResolvedValueOnce(Buffer.from("fake-jpeg"))
        .mockResolvedValueOnce(Buffer.from("fake-mp4"));

      const result = await livePhotoService.convertToAndroidMotionPhoto(
        `${ARTIFACTS_DIR}/test.jpg`,
        `${ARTIFACTS_DIR}/test.mov`
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(ffmpeg).toHaveBeenCalledWith(`${ARTIFACTS_DIR}/test.mov`);
      expect(fs.readFile).toHaveBeenCalledWith(`${ARTIFACTS_DIR}/test.jpg`);
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("temp_")
      );
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining("temp_"));
    });

    it("should throw AppError on ffmpeg conversion failure", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "error") {
            callback(new Error("Conversion failed"));
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(`${ARTIFACTS_DIR}/test.jpg`, `${ARTIFACTS_DIR}/test.mov`)
      ).rejects.toThrow(AppError);
    });

    it("should throw AppError on file read failure", async () => {
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockRejectedValue(new Error("File read error"));

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(`${ARTIFACTS_DIR}/test.jpg`, `${ARTIFACTS_DIR}/test.mov`)
      ).rejects.toThrow(AppError);
    });

    it("should handle large files", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "end") {
            callback();
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );
      const largeBuffer = Buffer.alloc(1024 * 1024 * 10); // 10MB buffer
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
        .mockResolvedValueOnce(largeBuffer)
        .mockResolvedValueOnce(largeBuffer);

      const result = await livePhotoService.convertToAndroidMotionPhoto(
        `${ARTIFACTS_DIR}/large.jpg`,
        `${ARTIFACTS_DIR}/large.mov`
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(1024 * 1024 * 10);
    });

    it("should handle different file formats", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "end") {
            callback();
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
        .mockResolvedValueOnce(Buffer.from("fake-png"))
        .mockResolvedValueOnce(Buffer.from("fake-mp4"));

      const result = await livePhotoService.convertToAndroidMotionPhoto(
        `${ARTIFACTS_DIR}/test.png`,
        `${ARTIFACTS_DIR}/test.mp4`
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(ffmpeg).toHaveBeenCalledWith(`${ARTIFACTS_DIR}/test.mp4`);
    });
  });

  describe("convertToAppleLivePhoto", () => {
    it("should convert Android Motion Photo to Apple Live Photo successfully", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "end") {
            callback();
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );
      (fs.readFile as jest.MockedFunction<typeof fs.readFile>)
        .mockResolvedValueOnce(Buffer.from("fake-jpeg"))
        .mockResolvedValueOnce(Buffer.from("fake-mov"));

      const result = await livePhotoService.convertToAppleLivePhoto(`${ARTIFACTS_DIR}/test.mp4`);

      expect(result).toEqual({
        jpeg: expect.any(Buffer),
        mov: expect.any(Buffer),
      });
      expect(ffmpeg).toHaveBeenCalledTimes(2);
      expect(fs.readFile).toHaveBeenCalledTimes(2);
      expect(fs.unlink).toHaveBeenCalledTimes(3);
    });

    it("should throw AppError on ffmpeg conversion failure", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "error") {
            callback(new Error("Conversion failed"));
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );

      await expect(
        livePhotoService.convertToAppleLivePhoto(`${ARTIFACTS_DIR}/test.mp4`)
      ).rejects.toThrow(AppError);
    });

    it("should handle file read errors", async () => {
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockRejectedValue(new Error("File read error"));

      await expect(
        livePhotoService.convertToAppleLivePhoto(`${ARTIFACTS_DIR}/test.mp4`)
      ).rejects.toThrow(AppError);
    });

    it("should handle file write errors", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "end") {
            callback();
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockResolvedValue(Buffer.from("fake-data"));
      (
        fs.writeFile as jest.MockedFunction<typeof fs.writeFile>
      ).mockRejectedValue(new Error("File write error"));

      await expect(
        livePhotoService.convertToAppleLivePhoto(`${ARTIFACTS_DIR}/test.mp4`)
      ).rejects.toThrow(AppError);
    });
  });

  describe("extractJpegAndMp4", () => {
    it("should extract JPEG and MP4 from Android Motion Photo", async () => {
      const mockBuffer = Buffer.concat([
        Buffer.from([0xff, 0xd8]), // JPEG start
        Buffer.from("fake-jpeg-content"),
        Buffer.from([0xff, 0xd9]), // JPEG end
        Buffer.from("fake-mp4-content"),
      ]);
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockResolvedValue(mockBuffer);

      await livePhotoService["extractJpegAndMp4"](
        `${ARTIFACTS_DIR}/test.jpg`,
        `${ARTIFACTS_DIR}/jpeg.jpg`,
        `${ARTIFACTS_DIR}/video.mp4`
      );

      expect(fs.writeFile).toHaveBeenCalledTimes(2);
      expect(fs.writeFile).toHaveBeenCalledWith(`${ARTIFACTS_DIR}/jpeg.jpg`, expect.any(Buffer));
      expect(fs.writeFile).toHaveBeenCalledWith(
        `${ARTIFACTS_DIR}/video.mp4`,
        expect.any(Buffer)
      );
    });

    it("should throw AppError if JPEG end marker is not found", async () => {
      const mockBuffer = Buffer.from("invalid-content");
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockResolvedValue(mockBuffer);

      await expect(
        livePhotoService["extractJpegAndMp4"](
          `${ARTIFACTS_DIR}/test.jpg`,
          `${ARTIFACTS_DIR}/jpeg.jpg`,
          `${ARTIFACTS_DIR}/video.mp4`
        )
      ).rejects.toThrow(AppError);
    });
  });

  describe("embedMp4IntoJpeg", () => {
    it("should embed MP4 into JPEG", async () => {
      const jpegBuffer = Buffer.from("fake-jpeg");
      const mp4Buffer = Buffer.from("fake-mp4");

      const result = await livePhotoService["embedMp4IntoJpeg"](
        jpegBuffer,
        mp4Buffer
      );

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(
        jpegBuffer.length + mp4Buffer.length
      );
    });

    it("should include correct XMP metadata", async () => {
      const jpegBuffer = Buffer.from("fake-jpeg");
      const mp4Buffer = Buffer.from("fake-mp4");

      const result = await livePhotoService["embedMp4IntoJpeg"](
        jpegBuffer,
        mp4Buffer
      );

      expect(result.toString()).toContain("GCamera:MotionPhoto");
      expect(result.toString()).toContain("GCamera:MotionPhotoVersion");
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle missing temporary directory", async () => {
      (fs.mkdir as jest.MockedFunction<typeof fs.mkdir>).mockRejectedValue(
        new Error("Directory creation failed")
      );

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(`${ARTIFACTS_DIR}/test.jpg`, `${ARTIFACTS_DIR}/test.mov`)
      ).rejects.toThrow(AppError);
    });

    it("should handle ffmpeg not installed", async () => {
      // Create a minimal mock of FfmpegCommand
      class MockFfmpegCommand {
        outputOptions() {
          return this;
        }
        output() {
          return this;
        }
        on(event: string, callback: (err?: Error) => void) {
          if (event === "error") {
            callback(new Error("ffmpeg not found"));
          }
          return this;
        }
        run() {}
      }

      // Create a mock ffmpeg function with additional properties
      const mockFfmpeg = Object.assign(
        jest.fn().mockImplementation(() => {
          throw new Error("ffmpeg not found");
        }),
        {
          setFfmpegPath: jest.fn().mockReturnThis(),
          setFfprobePath: jest.fn().mockReturnThis(),
          setFlvtoolPath: jest.fn().mockReturnThis(),
          FfmpegCommand: MockFfmpegCommand,
        }
      ) as unknown as typeof ffmpeg;

      // Mock the entire ffmpeg module
      jest.mock("fluent-ffmpeg", () => mockFfmpeg);

      // Ensure LivePhotoService uses the mocked ffmpeg
      jest.resetModules();
      const { LivePhotoService } = require("../src/services/LivePhotoService");
      const livePhotoService = new LivePhotoService("/test/temp");

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(`${ARTIFACTS_DIR}/test.jpg`, `${ARTIFACTS_DIR}/test.mov`)
      ).rejects.toThrow(AppError);

      expect(mockFfmpeg).toHaveBeenCalled();
    });

    it("should handle corrupt input files", async () => {
      (
        fs.readFile as jest.MockedFunction<typeof fs.readFile>
      ).mockResolvedValue(Buffer.from("corrupt-data"));

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(
          `${ARTIFACTS_DIR}/corrupt.jpg`,
          `${ARTIFACTS_DIR}/corrupt.mov`
        )
      ).rejects.toThrow(AppError);
    });

    it("should handle out of disk space scenario", async () => {
      const mockFfmpeg: MockFfmpeg = {
        outputOptions: jest.fn().mockReturnThis(),
        output: jest.fn().mockReturnThis(),
        on: jest.fn().mockImplementation((...args: any[]) => {
          const [event, callback] = args;
          if (event === "error") {
            callback(new Error("No space left on device"));
          }
          return mockFfmpeg;
        }),
        run: jest.fn(),
      };
      (ffmpeg as jest.MockedFunction<typeof ffmpeg>).mockReturnValue(
        mockFfmpeg as any
      );

      await expect(
        livePhotoService.convertToAndroidMotionPhoto(`${ARTIFACTS_DIR}/test.jpg`, `${ARTIFACTS_DIR}/test.mov`)
      ).rejects.toThrow(AppError);
    });
  });
});
