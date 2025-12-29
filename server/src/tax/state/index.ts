/**
 * State Tax Calculator Index
 * Routes to appropriate state tax calculator based on state code
 * Supports all 50 US states + DC
 */

// Import all state calculators
import { calculateCaliforniaTax } from './california.js';
import { calculateNewYorkTax } from './newyork.js';
import { calculateNewJerseyTax } from './newjersey.js';
import { calculatePennsylvaniaTax } from './pennsylvania.js';
import { calculateIllinoisTax } from './illinois.js';
import { calculateMassachusettsTax } from './massachusetts.js';
import { calculateOhioTax } from './ohio.js';
import { calculateGeorgiaTax } from './georgia.js';
import { calculateNorthCarolinaTax } from './northcarolina.js';
import { calculateVirginiaTax } from './virginia.js';
import { calculateArizonaTax } from './arizona.js';
import { calculateColoradoTax } from './colorado.js';
import { calculateConnecticutTax } from './connecticut.js';
import { calculateDelawareTax } from './delaware.js';
import { calculateHawaiiTax } from './hawaii.js';
import { calculateIdahoTax } from './idaho.js';
import { calculateIndianaTax } from './indiana.js';
import { calculateIowaTax } from './iowa.js';
import { calculateKansasTax } from './kansas.js';
import { calculateKentuckyTax } from './kentucky.js';
import { calculateLouisianaTax } from './louisiana.js';
import { calculateMaineTax } from './maine.js';
import { calculateMarylandTax } from './maryland.js';
import { calculateMichiganTax } from './michigan.js';
import { calculateMinnesotaTax } from './minnesota.js';
import { calculateMississippiTax } from './mississippi.js';
import { calculateMissouriTax } from './missouri.js';
import { calculateMontanaTax } from './montana.js';
import { calculateNebraskaTax } from './nebraska.js';
import { calculateNewMexicoTax } from './newmexico.js';
import { calculateNorthDakotaTax } from './northdakota.js';
import { calculateOklahomaTax } from './oklahoma.js';
import { calculateOregonTax } from './oregon.js';
import { calculateRhodeIslandTax } from './rhodeisland.js';
import { calculateSouthCarolinaTax } from './southcarolina.js';
import { calculateUtahTax } from './utah.js';
import { calculateVermontTax } from './vermont.js';
import { calculateWestVirginiaTax } from './westvirginia.js';
import { calculateWisconsinTax } from './wisconsin.js';
import { calculateDCTax } from './dc.js';
import { calculateArkansasTax } from './arkansas.js';
import { calculateAlabamaTax } from './alabama.js';

export interface StateTaxInput {
  state: string;              // 2-letter state code
  grossPay: number;
  annualIncome: number;
  filingStatus: string;
  payPeriodsPerYear: number;
  ytdGrossWages?: number;
}

export interface StateTaxResult {
  incomeTax: number;
  sdi: number;                // State Disability Insurance
  sui: number;                // State Unemployment (employee portion)
  total: number;
  details?: {
    taxableWages?: number;
    marginalRate?: number;
  };
}

// States with no income tax
const NO_INCOME_TAX_STATES = [
  'AK', // Alaska
  'FL', // Florida
  'NV', // Nevada
  'SD', // South Dakota
  'TX', // Texas
  'WA', // Washington
  'WY', // Wyoming
  'NH', // New Hampshire (no wage income tax)
  'TN'  // Tennessee (no wage income tax)
];

export function calculateStateTax(input: StateTaxInput): StateTaxResult {
  const { state } = input;

  // Check if state has no income tax
  if (NO_INCOME_TAX_STATES.includes(state)) {
    return {
      incomeTax: 0,
      sdi: 0,
      sui: 0,
      total: 0,
      details: {
        taxableWages: input.grossPay,
        marginalRate: 0
      }
    };
  }

  // Route to specific state calculator
  switch (state) {
    // Original 11 states
    case 'CA': return calculateCaliforniaTax(input);
    case 'NY': return calculateNewYorkTax(input);
    case 'NJ': return calculateNewJerseyTax(input);
    case 'PA': return calculatePennsylvaniaTax(input);
    case 'IL': return calculateIllinoisTax(input);
    case 'MA': return calculateMassachusettsTax(input);
    case 'OH': return calculateOhioTax(input);
    case 'GA': return calculateGeorgiaTax(input);
    case 'NC': return calculateNorthCarolinaTax(input);
    case 'VA': return calculateVirginiaTax(input);
    case 'AZ': return calculateArizonaTax(input);

    // New states (alphabetical)
    case 'AL': return calculateAlabamaTax(input);
    case 'AR': return calculateArkansasTax(input);
    case 'CO': return calculateColoradoTax(input);
    case 'CT': return calculateConnecticutTax(input);
    case 'DC': return calculateDCTax(input);
    case 'DE': return calculateDelawareTax(input);
    case 'HI': return calculateHawaiiTax(input);
    case 'ID': return calculateIdahoTax(input);
    case 'IN': return calculateIndianaTax(input);
    case 'IA': return calculateIowaTax(input);
    case 'KS': return calculateKansasTax(input);
    case 'KY': return calculateKentuckyTax(input);
    case 'LA': return calculateLouisianaTax(input);
    case 'ME': return calculateMaineTax(input);
    case 'MD': return calculateMarylandTax(input);
    case 'MI': return calculateMichiganTax(input);
    case 'MN': return calculateMinnesotaTax(input);
    case 'MS': return calculateMississippiTax(input);
    case 'MO': return calculateMissouriTax(input);
    case 'MT': return calculateMontanaTax(input);
    case 'NE': return calculateNebraskaTax(input);
    case 'NM': return calculateNewMexicoTax(input);
    case 'ND': return calculateNorthDakotaTax(input);
    case 'OK': return calculateOklahomaTax(input);
    case 'OR': return calculateOregonTax(input);
    case 'RI': return calculateRhodeIslandTax(input);
    case 'SC': return calculateSouthCarolinaTax(input);
    case 'UT': return calculateUtahTax(input);
    case 'VT': return calculateVermontTax(input);
    case 'WV': return calculateWestVirginiaTax(input);
    case 'WI': return calculateWisconsinTax(input);

    default:
      // Throw error for unsupported states instead of silently returning zero
      throw new UnsupportedStateError(state);
  }
}

/**
 * Custom error for unsupported state tax
 */
export class UnsupportedStateError extends Error {
  public readonly state: string;
  public readonly supportedStates: string[];

  constructor(state: string) {
    const supported = getSupportedStates();
    super(`State tax calculation not supported for state: ${state}. Supported states: ${supported.join(', ')}`);
    this.name = 'UnsupportedStateError';
    this.state = state;
    this.supportedStates = supported;
  }
}

// States with income tax calculators implemented (41 states + DC)
const INCOME_TAX_STATES = [
  'AL', // Alabama (TODO)
  'AR', // Arkansas
  'AZ', // Arizona
  'CA', // California
  'CO', // Colorado
  'CT', // Connecticut
  'DC', // District of Columbia
  'DE', // Delaware
  'GA', // Georgia
  'HI', // Hawaii
  'ID', // Idaho
  'IL', // Illinois
  'IN', // Indiana
  'IA', // Iowa
  'KS', // Kansas
  'KY', // Kentucky
  'LA', // Louisiana
  'ME', // Maine
  'MD', // Maryland
  'MA', // Massachusetts
  'MI', // Michigan
  'MN', // Minnesota
  'MS', // Mississippi
  'MO', // Missouri
  'MT', // Montana
  'NE', // Nebraska
  'NJ', // New Jersey
  'NM', // New Mexico
  'NY', // New York
  'NC', // North Carolina
  'ND', // North Dakota
  'OH', // Ohio
  'OK', // Oklahoma
  'OR', // Oregon
  'PA', // Pennsylvania
  'RI', // Rhode Island
  'SC', // South Carolina
  'UT', // Utah
  'VT', // Vermont
  'VA', // Virginia
  'WV', // West Virginia
  'WI'  // Wisconsin
];

// Get list of supported states
export function getSupportedStates(): string[] {
  return [...INCOME_TAX_STATES, ...NO_INCOME_TAX_STATES];
}

// Check if state income tax is supported
export function isStateSupported(state: string): boolean {
  return getSupportedStates().includes(state);
}
