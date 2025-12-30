import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, authorizeRoles, AuthRequest } from '../middleware/auth.js';
import { authLimiter, registrationLimiter } from '../middleware/rateLimit.js';
import { logAuthEvent } from '../services/auditLog.js';
import { logger } from '../services/logger.js';

const router = Router();

/**
 * Get JWT secret - reuses validation from middleware
 * SECURITY: No default value allowed
 */
function getJWTSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable must be set');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
}

const JWT_SECRET = getJWTSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Common passwords to reject (top 100 most common)
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '12345678', '123456789',
  'qwerty', 'abc123', 'monkey', 'master', 'dragon', 'letmein', 'login',
  'admin', 'welcome', 'passw0rd', 'Password1', 'Password123'
]);

/**
 * Password strength validation
 * Requirements:
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * - Not a common password
 */
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .refine(pwd => /[A-Z]/.test(pwd), 'Password must contain at least one uppercase letter')
  .refine(pwd => /[a-z]/.test(pwd), 'Password must contain at least one lowercase letter')
  .refine(pwd => /[0-9]/.test(pwd), 'Password must contain at least one number')
  .refine(pwd => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pwd), 'Password must contain at least one special character')
  .refine(pwd => !COMMON_PASSWORDS.has(pwd.toLowerCase()), 'Password is too common, please choose a stronger password');

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1)
  // NOTE: role is NOT accepted from registration request - always defaults to VIEWER
  // Only admins can promote users to higher roles via a separate endpoint
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

// POST /api/auth/register - Register new user
// Rate limited: 3 registrations per hour per IP
router.post('/register', registrationLimiter, async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Create user - ALWAYS start as VIEWER for security
    // Role elevation must be done by an admin through a separate endpoint
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        role: 'VIEWER' // Forced to VIEWER - never accept role from request
      }
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// POST /api/auth/login - Login user
// Rate limited: 5 login attempts per 15 minutes per IP (only counts failures)
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email }
    });

    if (!user) {
      // Audit log: failed login (user not found)
      logAuthEvent(req as AuthRequest, 'LOGIN_FAILED', data.email, false, 'User not found');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      // Audit log: failed login (wrong password)
      logAuthEvent(req as AuthRequest, 'LOGIN_FAILED', data.email, false, 'Invalid password');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Audit log: successful login
    logAuthEvent(req as AuthRequest, 'LOGIN', user.email, true);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error logging in:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    logger.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PUT /api/auth/users/:userId/role - Update user role (ADMIN only)
const updateRoleSchema = z.object({
  role: z.enum(['ADMIN', 'ACCOUNTANT', 'MANAGER', 'VIEWER'])
});

router.put(
  '/users/:userId/role',
  authenticate,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;
      const data = updateRoleSchema.parse(req.body);

      // Prevent admin from demoting themselves
      if (req.user?.userId === userId && data.role !== 'ADMIN') {
        return res.status(400).json({
          error: 'Cannot demote yourself',
          message: 'Ask another admin to change your role'
        });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role: data.role },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true
        }
      });

      res.json({
        message: 'User role updated successfully',
        user
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      logger.error('Error updating user role:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  }
);

// GET /api/auth/users - List all users (ADMIN only)
router.get(
  '/users',
  authenticate,
  authorizeRoles('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(users);
    } catch (error) {
      logger.error('Error listing users:', error);
      res.status(500).json({ error: 'Failed to list users' });
    }
  }
);

// POST /api/auth/change-password - Change current user's password
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = changePasswordSchema.parse(req.body);

    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValidPassword) {
      logAuthEvent(req, 'PASSWORD_CHANGE_FAILED', user.email, false, 'Invalid current password');
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Ensure new password is different from current
    const isSamePassword = await bcrypt.compare(data.newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(data.newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    logAuthEvent(req, 'PASSWORD_CHANGE', user.email, true);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// POST /api/auth/logout - Logout (client should discard token)
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Log the logout event
    if (req.user?.email) {
      logAuthEvent(req, 'LOGOUT', req.user.email, true);
    }

    // Note: With JWT, we can't truly invalidate the token server-side
    // For full session management, consider adding a token blacklist or session table
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error logging out:', error);
    res.status(500).json({ error: 'Failed to logout' });
  }
});

// GET /api/auth/password-requirements - Get password requirements (public)
router.get('/password-requirements', (_req, res: Response) => {
  res.json({
    minLength: 12,
    requirements: [
      'At least 12 characters',
      'At least one uppercase letter (A-Z)',
      'At least one lowercase letter (a-z)',
      'At least one number (0-9)',
      'At least one special character (!@#$%^&*...)',
      'Cannot be a common password'
    ]
  });
});

export default router;
