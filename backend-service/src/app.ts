import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import compression from 'compression';

import { validateToken } from './middleware/authMiddleware';
import { iCloudRouter } from './services/iCloudService';
import { syncRouter } from './services/syncOrchestrator';
import { errorHandler, AppError } from './errorHandler';
import { AppleMetadataService } from './services/AppleMetadataService';
import { LivePhotoService } from './services/LivePhotoService';
import { ConflictResolutionService } from './services/ConflictResolutionService';
import logger from './util/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(morgan('combined'));

// Enable gzip compression for all responses
app.use(compression())

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Enable JSON body parsing
app.use(express.json());

// 
app.use(validateToken);

// Initialize services
const appleMetadataService = new AppleMetadataService(process.env.STORAGE_PATH || './storage');
const livePhotoService = new LivePhotoService(process.env.TEMP_DIR || './temp');
const conflictResolutionService = new ConflictResolutionService();

// Pass services to routers
app.use('/icloud', iCloudRouter(appleMetadataService, livePhotoService, conflictResolutionService));
app.use('/sync', syncRouter(appleMetadataService, livePhotoService, conflictResolutionService));

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof AppError) {
        return errorHandler(err, req, res, next);
    }

    const unknownError = new AppError('An unexpected error occurred', 500, false);
    return errorHandler(unknownError, req, res, next);
});

app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`);
});

export default app;