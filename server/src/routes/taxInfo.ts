import { Router, Response } from 'express';
import { AuthRequest, authorizeRoles } from '../middleware/auth.js';
import {
  loadFederalConfig,
  loadStateConfig,
  getAvailableFederalYears,
  getAvailableStateYears,
  getConfiguredStates
} from '../tax/config/taxConfigLoader.js';
import { getSupportedStates } from '../tax/state/index.js';

const router = Router();

/**
 * GET /api/tax-info/years
 * Returns available tax years and current configuration
 */
router.get('/years', async (req: AuthRequest, res: Response) => {
  try {
    const currentYear = new Date().getFullYear();
    const overrideYear = process.env.TAX_YEAR ? parseInt(process.env.TAX_YEAR, 10) : null;
    const federalYears = getAvailableFederalYears();
    const configuredStates = getConfiguredStates();

    res.json({
      currentYear,
      overrideYear,
      effectiveYear: overrideYear || currentYear,
      federal: {
        availableYears: federalYears,
        latestYear: federalYears[0] || null
      },
      states: {
        configuredStates,
        supportedStates: getSupportedStates()
      },
      warning: overrideYear && overrideYear !== currentYear
        ? `Using tax year ${overrideYear} (override from TAX_YEAR env variable)`
        : null
    });
  } catch (error) {
    console.error('Error fetching tax years:', error);
    res.status(500).json({ error: 'Failed to fetch tax configuration info' });
  }
});

/**
 * GET /api/tax-info/federal/:year
 * Returns federal tax configuration for a specific year
 * Admin only - contains sensitive rate information
 */
router.get('/federal/:year', authorizeRoles('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res: Response) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2020 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    const config = loadFederalConfig(year);
    res.json(config);
  } catch (error) {
    console.error('Error fetching federal config:', error);
    res.status(500).json({ error: 'Failed to fetch federal tax configuration' });
  }
});

/**
 * GET /api/tax-info/state/:state/:year
 * Returns state tax configuration for a specific state and year
 * Admin only - contains sensitive rate information
 */
router.get('/state/:state/:year', authorizeRoles('ADMIN', 'ACCOUNTANT'), async (req: AuthRequest, res: Response) => {
  try {
    const { state } = req.params;
    const year = parseInt(req.params.year, 10);

    if (isNaN(year) || year < 2020 || year > 2100) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    if (!state || state.length !== 2) {
      return res.status(400).json({ error: 'Invalid state code' });
    }

    const config = loadStateConfig(state.toUpperCase(), year);
    if (!config) {
      return res.status(404).json({
        error: 'State configuration not found',
        availableYears: getAvailableStateYears(state.toUpperCase())
      });
    }

    res.json(config);
  } catch (error) {
    console.error('Error fetching state config:', error);
    res.status(500).json({ error: 'Failed to fetch state tax configuration' });
  }
});

/**
 * GET /api/tax-info/rates-summary
 * Returns a summary of key tax rates for the current/effective year
 */
router.get('/rates-summary', async (req: AuthRequest, res: Response) => {
  try {
    const year = process.env.TAX_YEAR
      ? parseInt(process.env.TAX_YEAR, 10)
      : new Date().getFullYear();

    const federalConfig = loadFederalConfig(year);

    res.json({
      year: federalConfig.year,
      effectiveDate: federalConfig.effectiveDate,
      fica: {
        socialSecurityRate: `${(federalConfig.fica.socialSecurityRate * 100).toFixed(2)}%`,
        medicareRate: `${(federalConfig.fica.medicareRate * 100).toFixed(2)}%`,
        socialSecurityWageCap: `$${federalConfig.fica.socialSecurityWageCap.toLocaleString()}`
      },
      futa: {
        effectiveRate: `${(federalConfig.futa.effectiveRate * 100).toFixed(1)}%`,
        wageCap: `$${federalConfig.futa.wageCap.toLocaleString()}`
      },
      standardDeductions: {
        SINGLE: `$${federalConfig.federalWithholding.SINGLE.standardDeduction.toLocaleString()}`,
        MARRIED_FILING_JOINTLY: `$${federalConfig.federalWithholding.MARRIED_FILING_JOINTLY.standardDeduction.toLocaleString()}`,
        HEAD_OF_HOUSEHOLD: `$${federalConfig.federalWithholding.HEAD_OF_HOUSEHOLD.standardDeduction.toLocaleString()}`
      }
    });
  } catch (error) {
    console.error('Error fetching rates summary:', error);
    res.status(500).json({ error: 'Failed to fetch tax rates summary' });
  }
});

export default router;
