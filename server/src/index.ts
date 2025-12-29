import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

// Routes
import employeeRoutes from './routes/employee.js';
import companyRoutes from './routes/company.js';
import payrollRoutes from './routes/payroll.js';
import authRoutes from './routes/auth.js';
import taxInfoRoutes from './routes/taxInfo.js';
import taxLiabilityRoutes from './routes/taxLiability.js';

// Middleware
import { authenticate } from './middleware/auth.js';
import { generalLimiter } from './middleware/rateLimit.js';
import { csrfProtection, csrfTokenHandler, csrfErrorHandler } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

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

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Apply general rate limiting to all API routes
// Skip in development if DISABLE_RATE_LIMIT=true
if (process.env.DISABLE_RATE_LIMIT !== 'true') {
  app.use('/api', generalLimiter);
}

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

// CSRF token endpoint - must be called before making state-changing requests
app.get('/api/csrf-token', csrfTokenHandler);

// Check if CSRF protection is enabled
const ENABLE_CSRF = process.env.DISABLE_CSRF !== 'true';

// Protected API Routes - require authentication in production
if (REQUIRE_AUTH) {
  if (ENABLE_CSRF) {
    // Full security: auth + CSRF protection
    app.use('/api/employees', authenticate, csrfProtection, employeeRoutes);
    app.use('/api/companies', authenticate, csrfProtection, companyRoutes);
    app.use('/api/payroll', authenticate, csrfProtection, payrollRoutes);
    app.use('/api/tax-info', authenticate, taxInfoRoutes); // Read-only, no CSRF needed
    app.use('/api/tax-liability', authenticate, taxLiabilityRoutes); // Read-only reports
  } else {
    console.warn('⚠️  CSRF protection is DISABLED. Set DISABLE_CSRF=false for production.');
    app.use('/api/employees', authenticate, employeeRoutes);
    app.use('/api/companies', authenticate, companyRoutes);
    app.use('/api/payroll', authenticate, payrollRoutes);
    app.use('/api/tax-info', authenticate, taxInfoRoutes);
    app.use('/api/tax-liability', authenticate, taxLiabilityRoutes);
  }
} else {
  // Development mode - no auth required
  console.warn('⚠️  Authentication is DISABLED. Set REQUIRE_AUTH=true for production.');
  app.use('/api/employees', employeeRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/payroll', payrollRoutes);
  app.use('/api/tax-info', taxInfoRoutes);
  app.use('/api/tax-liability', taxLiabilityRoutes);
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

// Start server
async function main() {
  try {
    // Check database configuration
    checkDatabaseConfig();

    await prisma.$connect();
    console.log('Connected to database');

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
