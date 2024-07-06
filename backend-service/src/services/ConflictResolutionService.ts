import { AppError } from "../errorHandler";
import logger from "../util/logger";

interface ConflictData {
  [key: string]: unknown;
  modificationDate?: string;
}

export interface ConflictResolutionStrategy {
  resolve(localData: ConflictData, cloudData: ConflictData): Promise<ConflictData>;
}

class LastWriteWinsStrategy implements ConflictResolutionStrategy {
  async resolve(localData: ConflictData, cloudData: ConflictData): Promise<ConflictData> {
    const localDate = new Date(localData.modificationDate || '');
    const cloudDate = new Date(cloudData.modificationDate || '');

    if (isNaN(localDate.getTime()) && isNaN(cloudDate.getTime())) {
      return localData; // If both dates are invalid, prefer local data
    } else if (isNaN(localDate.getTime())) {
      return cloudData; // If local date is invalid, use cloud data
    } else if (isNaN(cloudDate.getTime())) {
      return localData; // If cloud date is invalid, use local data
    }

    return localDate >= cloudDate ? localData : cloudData;
  }
}

class MergeStrategy implements ConflictResolutionStrategy {
  async resolve(localData: ConflictData, cloudData: ConflictData): Promise<ConflictData> {
    return this.deepMerge(cloudData, localData, new WeakMap());
  }

  private deepMerge(target: ConflictData, source: ConflictData, seen: WeakMap<object, unknown>): ConflictData {
    if (seen.has(source)) {
      return seen.get(source) as ConflictData;
    }

    const output = { ...target };
    seen.set(source, output);
    
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (Array.isArray(source[key])) {
          output[key] = Array.from(new Set([...(target[key] as unknown[]), ...(source[key] as unknown[])]));
        } else if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key] as ConflictData, source[key] as ConflictData, seen);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
}

class ManualResolutionStrategy implements ConflictResolutionStrategy {
  async resolve(localData: ConflictData, cloudData: ConflictData): Promise<ConflictData> {
    const errorMessage = `Manual resolution required: ${JSON.stringify({ localData, cloudData })}`;
    logger.warn(errorMessage);
    throw new AppError(errorMessage, 409);
  }
}

export class ConflictResolutionService {
  private strategies: Map<string, ConflictResolutionStrategy>;

  constructor() {
    this.strategies = new Map();
    this.strategies.set("lastWriteWins", new LastWriteWinsStrategy());
    this.strategies.set("merge", new MergeStrategy());
    this.strategies.set("manual", new ManualResolutionStrategy());
  }

  async resolveConflict(
    localData: ConflictData,
    cloudData: ConflictData,
    strategyName = "lastWriteWins"
  ): Promise<ConflictData> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new AppError("Invalid conflict resolution strategy", 400);
    }

    try {
      const resolvedData = await strategy.resolve(localData, cloudData);
      logger.info("Conflict resolved", { strategy: strategyName });
      return resolvedData;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      logger.error("Failed to resolve conflict", {
        error,
        strategy: strategyName,
      });
      throw new AppError("Failed to resolve conflict", 500);
    }
  }
}

function isObject(item: unknown): item is Record<string, unknown> {
  return (item && typeof item === 'object' && !Array.isArray(item)) as boolean;
}