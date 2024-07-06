import express, { Router } from 'express';
import { AppError } from '../errorHandler';
import { DataSynchronizer } from './DataSynchronizer';
import { AppleMetadataService } from './AppleMetadataService';
import { LivePhotoService } from './LivePhotoService';
import { ConflictResolutionService } from './ConflictResolutionService';

class SyncQueue {
    private queue: any[] = [];

    enqueue(item: any) {
        this.queue.push(item);
    }

    dequeue() {
        return this.queue.shift();
    }

    isEmpty() {
        return this.queue.length === 0;
    }
}

export const syncRouter = (
    appleMetadataService: AppleMetadataService,
    livePhotoService: LivePhotoService,
    conflictResolutionService: ConflictResolutionService
): Router => {
    const router = express.Router();
    const syncQueue = new SyncQueue();

    router.post('/enqueue', (req, res) => {
        const { accessToken, type, data } = req.body;
        syncQueue.enqueue({ accessToken, type, data });
        res.status(200).json({ success: true, message: "Sync task enqueued" });
    });

    router.get('/process-queue', async (_req, res) => {
        const processingResults = [];
        while (!syncQueue.isEmpty()) {
            const task = syncQueue.dequeue();
            try {
                const result = await processTask(task, appleMetadataService, livePhotoService, conflictResolutionService);
                processingResults.push({ task, result, status: 'success' });
            } catch (error) {
                if (error instanceof Error) {
                    processingResults.push({ task, error: error.message, status: 'failed' });
                } else {
                    processingResults.push({ task, error: 'An unknown error occurred', status: 'failed' });
                }
            }
        }
        res.status(200).json({ success: true, message: "Queue processed", results: processingResults });
    });

    return router;
};

async function processTask(
    task: any,
    appleMetadataService: AppleMetadataService,
    livePhotoService: LivePhotoService,
    conflictResolutionService: ConflictResolutionService
): Promise<any> {
    const { accessToken, type, data } = task;
    const dataSynchronizer = new DataSynchronizer(
        accessToken,
        appleMetadataService,
        livePhotoService,
        conflictResolutionService
    );

    switch (type) {
        case 'drive':
            return await dataSynchronizer.syncData(`webdav.icloud.com${data.path}`, data.content, 'PUT');
        case 'photo':
            return await dataSynchronizer.syncData('photos.icloud.com/upload', data, 'POST');
        case 'contact':
            return await dataSynchronizer.syncData(`contacts.icloud.com/${data.id}`, data, 'PUT');
        case 'live-photo':
            return await dataSynchronizer.syncLivePhoto(data.photo, data.video);
        default:
            throw new AppError('Unknown sync type', 400);
    }
}