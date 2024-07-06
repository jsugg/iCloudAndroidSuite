//import { Request, Response, NextFunction } from 'express';
import { Request, Response } from 'express';

export class AppError extends Error {
    public status: number;
    public isOperational: boolean;
    public additionalInfo?: Record<string, unknown>;
  
    constructor(message: string, status: number, additionalInfo?: Record<string, unknown>, isOperational = true) {
      super(message);
      this.status = status;
      this.isOperational = isOperational;
      this.additionalInfo = additionalInfo;
  
      Error.captureStackTrace(this, this.constructor);
    }
  }

// export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction | null) => {
    export const errorHandler = (err: AppError, _req: Request, res: Response) => {
    console.error('Error:', err);

    if (err.isOperational) {
        res.status(err.status).json({ message: err.message });
    } else {
        res.status(500).json({ message: 'An unexpected error occurred. Please try again later.' });
    }
};

export const logError = (tag: string, message: string, error: Error) => {
    console.error(`[${tag}] ${message}:`, error);
};

export const formatErrorMessage = (error: Error): string => {
    return `Error during operation: ${error.message}`;
};