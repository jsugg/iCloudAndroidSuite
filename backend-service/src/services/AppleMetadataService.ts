import { promises as fs } from 'fs';
import path from 'path';
import { AppError } from '../errorHandler';
import logger from '../util/logger';

export interface AppleMetadata {
    creationDate: string;
    modificationDate: string;
    label: string;
    tags: string[];
    uti: string; // Uniform Type Identifier
    quarantineAttribute: string;
    customIcon: Buffer;
    finderFlags: number;
    acl: string[]; // Access Control List
    spotlightComments: string;
    contentCreationDate: string;
    customMetadata: Record<string, any>;
}

export class AppleMetadataService {
    private metadataPath: string;

    constructor(storagePath: string) {
        this.metadataPath = path.join(storagePath, 'apple_metadata');
    }

    async saveMetadata(fileId: string, metadata: AppleMetadata): Promise<void> {
        try {
            await fs.mkdir(this.metadataPath, { recursive: true });
            const filePath = path.join(this.metadataPath, `${fileId}.json`);
            await fs.writeFile(filePath, JSON.stringify(metadata, null, 2));
            logger.info(`Metadata saved for file ${fileId}`);
        } catch (error) {
            logger.error(`Failed to save metadata for file ${fileId}`, { error });
            throw new AppError('Failed to save Apple-specific metadata', 500);
        }
    }

    async getMetadata(fileId: string): Promise<AppleMetadata> {
        try {
            const filePath = path.join(this.metadataPath, `${fileId}.json`);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data) as AppleMetadata;
        } catch (error) {
            logger.error(`Failed to retrieve metadata for file ${fileId}`, { error });
            throw new AppError('Failed to retrieve Apple-specific metadata', 500);
        }
    }

    async updateMetadata(fileId: string, updates: Partial<AppleMetadata>): Promise<void> {
        try {
            const currentMetadata = await this.getMetadata(fileId);
            const updatedMetadata = { ...currentMetadata, ...updates };
            await this.saveMetadata(fileId, updatedMetadata);
            logger.info(`Metadata updated for file ${fileId}`);
        } catch (error) {
            logger.error(`Failed to update metadata for file ${fileId}`, { error });
            throw new AppError('Failed to update Apple-specific metadata', 500);
        }
    }

    async convertToAndroidMetadata(appleMetadata: AppleMetadata): Promise<any> {
        return {
            dateCreated: new Date(appleMetadata.creationDate).getTime(),
            dateModified: new Date(appleMetadata.modificationDate).getTime(),
            label: appleMetadata.label,
            tags: appleMetadata.tags.join(','),
            customMetadata: JSON.stringify(appleMetadata.customMetadata),
            uti: appleMetadata.uti,
            quarantineAttribute: appleMetadata.quarantineAttribute,
            finderFlags: appleMetadata.finderFlags,
            acl: JSON.stringify(appleMetadata.acl),
            spotlightComments: appleMetadata.spotlightComments,
            contentCreationDate: new Date(appleMetadata.contentCreationDate).getTime(),
        };
    }

    async convertToAppleMetadata(androidMetadata: any): Promise<AppleMetadata> {
        return {
            creationDate: new Date(androidMetadata.dateCreated).toISOString(),
            modificationDate: new Date(androidMetadata.dateModified).toISOString(),
            label: androidMetadata.label || '',
            tags: androidMetadata.tags ? androidMetadata.tags.split(',') : [],
            uti: androidMetadata.uti || '',
            quarantineAttribute: androidMetadata.quarantineAttribute || '',
            customIcon: Buffer.alloc(0),
            finderFlags: androidMetadata.finderFlags || 0,
            acl: androidMetadata.acl ? JSON.parse(androidMetadata.acl) : [],
            spotlightComments: androidMetadata.spotlightComments || '',
            contentCreationDate: androidMetadata.contentCreationDate 
                ? new Date(androidMetadata.contentCreationDate).toISOString()
                : new Date(androidMetadata.dateCreated).toISOString(),
            customMetadata: androidMetadata.customMetadata ? JSON.parse(androidMetadata.customMetadata) : {},
        };
    }
}