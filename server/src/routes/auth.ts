import { Router, Request, Response } from 'express';
import { prisma } from '../index.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, authorizeRoles, AuthRequest } from '../middleware/auth.js';
import { authLimiter, registrationLimiter } from '../middleware/rateLimit.js';
import { logAuthEvent } from '../services/auditLog.js';

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

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
    console.error('Error registering user:', error);
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
    console.error('Error logging in:', error);
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
    console.error('Error fetching user:', error);
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
      console.error('Error updating user role:', error);
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
      console.error('Error listing users:', error);
      res.status(500).json({ error: 'Failed to list users' });
    }
  }
);

export default router;
