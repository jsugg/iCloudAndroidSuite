import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { rateLimit } from 'express-rate-limit';
import { authRouter } from './authController';
import { iCloudRouter } from '../services/iCloudService';
import { syncRouter } from '../services/syncOrchestrator';

// Rate limiting to prevent abuse
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet()); // Security best practices
app.use(morgan('combined')); // Logging
app.use(express.json());
app.use(limiter);
app.use('/auth', authRouter);
app.use('/icloud', iCloudRouter);
app.use('/sync', syncRouter);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;
