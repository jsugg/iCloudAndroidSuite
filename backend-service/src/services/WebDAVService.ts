import { createClient, WebDAVClient, FileStat, ResponseDataDetailed, WebDAVClientOptions } from 'webdav';
import { promises as fs } from 'fs';
import { AppError } from '../errorHandler';
import logger from '../util/logger';

export class WebDAVService {
    private client: WebDAVClient;

    constructor(baseURL: string, username: string, password: string) {
        const options: WebDAVClientOptions = { username, password };
        this.client = this.createWebDAVClient(baseURL, options);
    }

    private createWebDAVClient(remoteURL: string, options: WebDAVClientOptions): WebDAVClient {
        const client = createClient(remoteURL, options) as WebDAVClient;
        if (!this.isWebDAVClient(client)) {
            throw new Error('Failed to create WebDAV client');
        }
        return client;
    }

    private isWebDAVClient(client: unknown): client is WebDAVClient {
        return (
            typeof client === 'object' &&
            client !== null &&
            client !== undefined &&
            'getFileContents' in client &&
            'putFileContents' in client &&
            'getDirectoryContents' in client &&
            'createDirectory' in client &&
            'deleteFile' in client &&
            'moveFile' in client &&
            'copyFile' in client &&
            'stat' in client
        );
    }

    async uploadFile(localPath: string, remotePath: string): Promise<void> {
        try {
            const content = await fs.readFile(localPath);
            const result = await this.client.putFileContents(remotePath, content);
            if (typeof result !== 'boolean') {
                throw new Error('Unexpected result from putFileContents');
            }
            logger.info(`File uploaded successfully: ${remotePath}`);
        } catch (error) {
            logger.error(`Failed to upload file: ${remotePath}`, { error });
            throw new AppError(`Failed to upload file: ${remotePath}`, 500);
        }
    }

    async downloadFile(remotePath: string, localPath: string): Promise<void> {
        try {
            const content = await this.client.getFileContents(remotePath);
            if (!(content instanceof Buffer)) {
                throw new Error('Unexpected content type from getFileContents');
            }
            await fs.writeFile(localPath, content);
            logger.info(`File downloaded successfully: ${remotePath}`);
        } catch (error) {
            logger.error(`Failed to download file: ${remotePath}`, { error });
            throw new AppError(`Failed to download file: ${remotePath}`, 500);
        }
    }

    async listDirectory(remotePath: string): Promise<string[]> {
        try {
            const directoryItems = await this.client.getDirectoryContents(remotePath);
            const items = this.ensureFileStatArray(directoryItems);
            return items.map(item => item.filename);
        } catch (error) {
            logger.error(`Failed to list directory: ${remotePath}`, { error });
            throw new AppError(`Failed to list directory: ${remotePath}`, 500);
        }
    }

    async createDirectory(remotePath: string): Promise<void> {
        try {
            await this.client.createDirectory(remotePath);
            logger.info(`Directory created successfully: ${remotePath}`);
        } catch (error) {
            logger.error(`Failed to create directory: ${remotePath}`, { error });
            throw new AppError(`Failed to create directory: ${remotePath}`, 500);
        }
    }

    async deleteFile(remotePath: string): Promise<void> {
        try {
            await this.client.deleteFile(remotePath);
            logger.info(`File deleted successfully: ${remotePath}`);
        } catch (error) {
            logger.error(`Failed to delete file: ${remotePath}`, { error });
            throw new AppError(`Failed to delete file: ${remotePath}`, 500);
        }
    }

    async moveFile(fromPath: string, toPath: string): Promise<void> {
        try {
            await this.client.moveFile(fromPath, toPath);
            logger.info(`File moved successfully: ${fromPath} -> ${toPath}`);
        } catch (error) {
            logger.error(`Failed to move file: ${fromPath} -> ${toPath}`, { error });
            throw new AppError(`Failed to move file: ${fromPath} -> ${toPath}`, 500);
        }
    }

    async copyFile(fromPath: string, toPath: string): Promise<void> {
        try {
            await this.client.copyFile(fromPath, toPath);
            logger.info(`File copied successfully: ${fromPath} -> ${toPath}`);
        } catch (error) {
            logger.error(`Failed to copy file: ${fromPath} -> ${toPath}`, { error });
            throw new AppError(`Failed to copy file: ${fromPath} -> ${toPath}`, 500);
        }
    }

    async getFileStats(remotePath: string): Promise<FileStat> {
        try {
            const stats = await this.client.stat(remotePath);
            return this.ensureFileStat(stats);
        } catch (error) {
            logger.error(`Failed to get file stats: ${remotePath}`, { error });
            throw new AppError(`Failed to get file stats: ${remotePath}`, 500);
        }
    }

    private ensureFileStatArray(value: FileStat[] | ResponseDataDetailed<FileStat[]>): FileStat[] {
        if (Array.isArray(value)) {
            return value;
        }
        if (this.isResponseDataDetailed(value)) {
            return value.data;
        }
        throw new Error('Unexpected result type');
    }

    private ensureFileStat(value: FileStat | ResponseDataDetailed<FileStat>): FileStat {
        if (this.isFileStat(value)) {
            return value;
        }
        if (this.isResponseDataDetailed(value)) {
            return value.data;
        }
        throw new Error('Unexpected result type');
    }

    private isFileStat(value: unknown): value is FileStat {
        return typeof value === 'object' && value !== null && 'filename' in value;
    }

    private isResponseDataDetailed(value: unknown): value is ResponseDataDetailed<FileStat | FileStat[]> {
        return typeof value === 'object' && value !== null && 'data' in value;
    }
}
