import { Router, Request, Response } from 'express';
import { sign, verify } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import AppleAuth from 'apple-auth';
import dotenv from 'dotenv';
import { AppError } from '../errorHandler';
import logger from '../util/logger';

dotenv.config();

const router = Router();
const { 
  SECRET_KEY, 
  APPLE_CLIENT_ID, 
  APPLE_TEAM_ID, 
  APPLE_KEY_ID, 
  APPLE_PRIVATE_KEY,
  GOOGLE_CLIENT_ID 
} = process.env;

if (!SECRET_KEY || !APPLE_CLIENT_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY || !GOOGLE_CLIENT_ID) {
  throw new Error('Missing required environment variables for authentication');
}

const appleAuth = new AppleAuth({
  client_id: APPLE_CLIENT_ID,
  team_id: APPLE_TEAM_ID,
  key_id: APPLE_KEY_ID,
  private_key: APPLE_PRIVATE_KEY,
});

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { provider, token } = req.body;

    let userId: string;
    let email: string;

    switch (provider) {
      case 'apple':
        const appleResult = await appleAuth.verifyIdToken(token);
        userId = appleResult.sub;
        email = appleResult.email;
        break;

      case 'google':
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) {
          throw new AppError('Invalid Google token', 401);
        }
        userId = payload.sub;
        email = payload.email || '';
        break;

      default:
        throw new AppError('Invalid authentication provider', 400);
    }

    const jwtToken = sign({ userId, email }, SECRET_KEY, { expiresIn: '1h' });
    res.json({ token: jwtToken });
  } catch (error) {
    logger.error('Authentication failed', { error });
    if (error instanceof AppError) {
      res.status(error.status).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Authentication failed' });
    }
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400);
    }

    const decoded = verify(refreshToken, SECRET_KEY) as { userId: string; email: string };
    const newToken = sign({ userId: decoded.userId, email: decoded.email }, SECRET_KEY, { expiresIn: '1h' });

    res.json({ token: newToken });
  } catch (error) {
    logger.error('Token refresh failed', { error });
    res.status(401).json({ message: 'Invalid refresh token' });
  }
});

router.post('/revoke', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      throw new AppError('Token is required', 400);
    }

    // Add the token to a blacklist or invalidate it in your database
    // For simplicity, we'll just acknowledge the revocation here
    res.json({ message: 'Token revoked successfully' });
  } catch (error) {
    logger.error('Token revocation failed', { error });
    res.status(400).json({ message: 'Failed to revoke token' });
  }
});

export const authRouter = router;