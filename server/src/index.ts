import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { logger } from './services/logger.js';

// Routes
import employeeRoutes from './routes/employee.js';
import companyRoutes from './routes/company.js';
import payrollRoutes from './routes/payroll.js';
import payPeriodRoutes from './routes/payPeriods.js';
import authRoutes from './routes/auth.js';
import taxInfoRoutes from './routes/taxInfo.js';
import taxLiabilityRoutes from './routes/taxLiability.js';
import w2Routes from './routes/w2.js';
import payrollApprovalRoutes from './routes/payrollApproval.js';
import achRoutes from './routes/ach.js';

// Middleware
import { authenticate } from './middleware/auth.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { csrfProtection, csrfTokenHandler, csrfErrorHandler } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sanitizeInput } from './middleware/sanitize.js';
import { getCacheStats, clearAllCaches } from './services/cache.js';
import { getMetrics, getMetricsContentType, recordHttpRequest } from './services/metrics.js';

// Load environment variables
dotenv.config();

// Initialize Prisma
export const prisma = new PrismaClient();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Check if authentication is required
// DEFAULT: Authentication is ENABLED
// Only disable for local development by explicitly setting REQUIRE_AUTH=false
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== 'false';

// SECURITY: Block disabled auth in production environment
if (!REQUIRE_AUTH && process.env.NODE_ENV === 'production') {
  console.error('❌ FATAL: Authentication cannot be disabled in production!');
  console.error('   Remove REQUIRE_AUTH=false from your environment variables.');
  process.exit(1);
}

// Extend Express Request type to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

// Request ID middleware - adds unique ID for request tracing
function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

// Request logging middleware with metrics
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;

    // Log request
    logger.info(`${req.method} ${req.path}`, {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.headers['user-agent']
    });

    // Record metrics (skip health and metrics endpoints to avoid noise)
    if (!req.path.includes('/health') && !req.path.includes('/metrics')) {
      recordHttpRequest(req.method, req.path, res.statusCode, duration);
    }
  });
  next();
}

// Middleware
app.use(requestIdMiddleware); // Add request ID first
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
      scriptSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
      imgSrc: ["'self'", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow Swagger UI to load
})); // Security headers
app.use(compression()); // Enable gzip compression for responses
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Limit request body size
app.use(cookieParser());
app.use(sanitizeInput); // Sanitize all input to prevent XSS/injection
app.use(requestLogger); // Log all requests

// Apply general rate limiting to all API routes
// Skip in development if DISABLE_RATE_LIMIT=true
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
  app.use('/api', generalLimiter);
}

// API Version
const API_VERSION = 'v1';

// Health check (public)
app.get('/api/health', async (_req, res) => {
  const cacheStats = getCacheStats();
  const health: {
    status: string;
    version: string;
    timestamp: string;
    uptime: number;
    memory: { heapUsed: number; heapTotal: number; rss: number };
    database: { status: string; latency?: number; error?: string };
    cache: typeof cacheStats;
  } = {
    status: 'ok',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    database: { status: 'unknown' },
    cache: cacheStats
  };

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.database = {
      status: 'connected',
      latency: Date.now() - start
    };
  } catch (error) {
    health.status = 'degraded';
    health.database = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Cache management (admin only)
app.post('/api/admin/cache/clear', authenticate, (req, res) => {
  // Only admins can clear cache
  if ((req as any).user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  clearAllCaches();
  res.json({ message: 'All caches cleared', timestamp: new Date().toISOString() });
});

// Prometheus metrics endpoint
app.get('/api/metrics', async (_req, res) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', getMetricsContentType());
    res.send(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

// API Documentation (public)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'US Payroll System API'
}));

// Serve OpenAPI spec as JSON
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Auth routes (public)
app.use('/api/auth', authRoutes);
app.use(`/api/${API_VERSION}/auth`, authRoutes); // Versioned

// CSRF token endpoint - must be called before making state-changing requests
app.get('/api/csrf-token', csrfTokenHandler);
app.get(`/api/${API_VERSION}/csrf-token`, csrfTokenHandler); // Versioned

// Check if CSRF protection is enabled
const ENABLE_CSRF = process.env.DISABLE_CSRF !== 'true';

// Helper function to register routes with and without version prefix
function registerRoutes(
  basePath: string,
  middleware: Array<typeof authenticate | typeof csrfProtection>,
  router: typeof employeeRoutes
) {
  // Register unversioned route (for backward compatibility)
  app.use(`/api/${basePath}`, ...middleware, router);
  // Register versioned route
  app.use(`/api/${API_VERSION}/${basePath}`, ...middleware, router);
}

// Protected API Routes - require authentication in production
if (REQUIRE_AUTH) {
  if (ENABLE_CSRF) {
    // Full security: auth + CSRF protection
    registerRoutes('employees', [authenticate, csrfProtection], employeeRoutes);
    registerRoutes('companies', [authenticate, csrfProtection], companyRoutes);
    registerRoutes('payroll', [authenticate, csrfProtection], payrollRoutes);
    registerRoutes('pay-periods', [authenticate, csrfProtection], payPeriodRoutes);
    registerRoutes('tax-info', [authenticate], taxInfoRoutes); // Read-only, no CSRF needed
    registerRoutes('tax-liability', [authenticate], taxLiabilityRoutes); // Read-only reports
    registerRoutes('w2', [authenticate, csrfProtection], w2Routes);
    registerRoutes('payroll-approval', [authenticate, csrfProtection], payrollApprovalRoutes);
    registerRoutes('ach', [authenticate, csrfProtection], achRoutes);
  } else {
    console.warn('⚠️  CSRF protection is DISABLED. Set DISABLE_CSRF=false for production.');
    registerRoutes('employees', [authenticate], employeeRoutes);
    registerRoutes('companies', [authenticate], companyRoutes);
    registerRoutes('payroll', [authenticate], payrollRoutes);
    registerRoutes('pay-periods', [authenticate], payPeriodRoutes);
    registerRoutes('tax-info', [authenticate], taxInfoRoutes);
    registerRoutes('tax-liability', [authenticate], taxLiabilityRoutes);
    registerRoutes('w2', [authenticate], w2Routes);
    registerRoutes('payroll-approval', [authenticate], payrollApprovalRoutes);
    registerRoutes('ach', [authenticate], achRoutes);
  }
} else {
  // Development mode - no auth required
  console.warn('⚠️  Authentication is DISABLED. Set REQUIRE_AUTH=true for production.');
  registerRoutes('employees', [], employeeRoutes);
  registerRoutes('companies', [], companyRoutes);
  registerRoutes('payroll', [], payrollRoutes);
  registerRoutes('pay-periods', [], payPeriodRoutes);
  registerRoutes('tax-info', [], taxInfoRoutes);
  registerRoutes('tax-liability', [], taxLiabilityRoutes);
  registerRoutes('w2', [], w2Routes);
  registerRoutes('payroll-approval', [], payrollApprovalRoutes);
  registerRoutes('ach', [], achRoutes);
}

// CSRF error handling middleware
app.use(csrfErrorHandler);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Central error handling middleware
app.use(errorHandler);

// Check database configuration
function checkDatabaseConfig(): void {
  const dbUrl = process.env.DATABASE_URL || '';
  const isProduction = process.env.NODE_ENV === 'production';
  const isSQLite = dbUrl.startsWith('file:') || dbUrl.includes('.db');

  if (isSQLite && isProduction) {
    console.warn('');
    console.warn('⚠️  WARNING: SQLite is not recommended for production use!');
    console.warn('   SQLite limitations:');
    console.warn('   - No concurrent write support');
    console.warn('   - Limited connection pooling');
    console.warn('   - Not suitable for high-traffic applications');
    console.warn('');
    console.warn('   Consider migrating to PostgreSQL or MySQL for production.');
    console.warn('   Update DATABASE_URL in your .env file.');
    console.warn('');
  }
}

// Export app for Vercel serverless
export default app;

// Only start server in non-serverless environment (local development)
if (process.env.VERCEL !== '1') {
  // Start server
  async function main() {
    try {
      // Check database configuration
      checkDatabaseConfig();

      await prisma.$connect();
      logger.info('Connected to database');

      const httpServer = app.listen(PORT, () => {
        logger.info(`Server running on http://localhost:${PORT}`);
        logger.info(`Health check: http://localhost:${PORT}/api/health`);
      });

      return httpServer;
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  // Store server reference for graceful shutdown
  let server: ReturnType<typeof app.listen> | undefined;

  main().then(s => { if (s) server = s; });

  // Graceful shutdown handler
  async function gracefulShutdown(signal: string) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    if (server) {
      server.close(() => {
        logger.info('HTTP server closed');
      });
    }

    // Give existing requests time to complete (30 seconds max)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Shutdown timeout reached, forcing exit');
      process.exit(1);
    }, 30000);

    try {
      // Disconnect from database
      await prisma.$disconnect();
      logger.info('Database connection closed');

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  // Handle shutdown signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception:', error);
    gracefulShutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', { promise, reason });
  });
}
