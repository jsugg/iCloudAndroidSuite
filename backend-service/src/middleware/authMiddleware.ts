import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";
import logger from "../util/logger";
import { AppError } from "../errorHandler";

dotenv.config();

const { SECRET_KEY } = process.env;

if (!SECRET_KEY) {
  throw new Error("SECRET_KEY is not defined in the environment variables");
}

const verifyAsync = (token: string): Promise<JwtPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
      if (err) {
        return reject(err);
      }
      resolve(decoded as JwtPayload);
    });
  });
};

interface CustomRequest extends Request {
  user?: JwtPayload;
}

export const validateToken = async (
  req: CustomRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      throw new AppError("Authorization header is missing", 401);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      throw new AppError("Token is missing", 401);
    }

    const decoded = await verifyAsync(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      logger.error("Token verification failed", { error });
      next(new AppError("Invalid token", 403));
    } else if (error instanceof AppError) {
      next(error);
    } else {
      logger.error("Unexpected error in token validation", { error });
      next(new AppError("Authentication failed", 500));
    }
  }
};