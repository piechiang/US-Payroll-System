import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

// Use ALS to ensure requestId is available throughout the async chain
export const storage = new AsyncLocalStorage<Map<string, string>>();

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId; // Pass to downstream services

  const store = new Map<string, string>();
  store.set('requestId', requestId);

  storage.run(store, () => {
    // Log request start
    console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);
    
    // Log response finish
    res.on('finish', () => {
      console.log(
        `[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url} ${res.statusCode}`
      );
    });

    next();
  });
}