import crypto from "crypto";
import dotenv from "dotenv";
import { AppError } from "./errorHandler";

dotenv.config();

const { ENCRYPTION_KEY, IV } = process.env;

if (!ENCRYPTION_KEY || !IV) {
  throw new Error(
    "ENCRYPTION_KEY or IV is not defined in the environment variables"
  );
}

// Encrypt data before sending to client
export function encryptData(text: string): string {
  if (!ENCRYPTION_KEY || !IV) {
    throw new Error(
      "ENCRYPTION_KEY or IV is not defined in the environment variables"
    );
  }
  try {
    const cipher = crypto.createCipheriv(
      "aes-256-gcm",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      Buffer.from(IV, "hex")
    );
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();
    return encrypted + ":" + tag.toString("hex");
  } catch (error) {
    throw new AppError("Encryption failed", 500);
  }
}

// Decrypt data received from client
export function decryptData(encryptedText: string): string {
  if (!ENCRYPTION_KEY || !IV) {
    throw new Error(
      "ENCRYPTION_KEY or IV is not defined in the environment variables"
    );
  }
  try {
    const [encrypted, tag] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      Buffer.from(IV, "hex")
    );
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    throw new AppError("Decryption failed", 500);
  }
}
