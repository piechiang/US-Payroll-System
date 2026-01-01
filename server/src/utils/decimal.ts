/**
 * Decimal.js utility functions for financial calculations
 *
 * This module provides a centralized configuration for all monetary calculations
 * to ensure penny-perfect precision throughout the payroll system.
 *
 * WHY DECIMAL.JS?
 * - JavaScript's native number type uses IEEE 754 floating-point
 * - This causes precision errors: 0.1 + 0.2 !== 0.3
 * - Financial calculations require exact decimal arithmetic
 * - Decimal.js provides arbitrary-precision decimal arithmetic
 */

import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
// Precision: 20 significant digits (more than enough for payroll)
// Rounding: ROUND_HALF_UP (standard rounding used by IRS)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9e15,  // Don't use exponential notation for small numbers
  toExpPos: 9e15    // Don't use exponential notation for large numbers
});

/**
 * Create a Decimal from a number, string, or existing Decimal
 * Always rounds to 2 decimal places (cents precision)
 */
export function decimal(value: number | string | Decimal): Decimal {
  return new Decimal(value).toDecimalPlaces(2);
}

/**
 * Convert Decimal to number (for database storage and JSON serialization)
 * Always rounds to 2 decimal places
 */
export function toNumber(value: Decimal): number {
  return value.toDecimalPlaces(2).toNumber();
}

/**
 * Safely add multiple Decimal values
 * Example: add(10.5, 20.3, 5.1) = 35.90
 */
export function add(...values: (number | string | Decimal)[]): Decimal {
  return values.reduce(
    (sum, val) => sum.plus(val),
    new Decimal(0)
  ).toDecimalPlaces(2);
}

/**
 * Safely subtract values
 * Example: subtract(100, 10, 5) = 85.00
 */
export function subtract(first: number | string | Decimal, ...values: (number | string | Decimal)[]): Decimal {
  return values.reduce(
    (result, val) => result.minus(val),
    new Decimal(first)
  ).toDecimalPlaces(2);
}

/**
 * Multiply with precision
 * Example: multiply(10.5, 1.5) = 15.75
 */
export function multiply(...values: (number | string | Decimal)[]): Decimal {
  return values.reduce(
    (product, val) => product.times(val),
    new Decimal(1)
  ).toDecimalPlaces(2);
}

/**
 * Divide with precision
 * Example: divide(100, 3) = 33.33
 */
export function divide(numerator: number | string | Decimal, denominator: number | string | Decimal): Decimal {
  return new Decimal(numerator)
    .dividedBy(denominator)
    .toDecimalPlaces(2);
}

/**
 * Calculate percentage of a value
 * Example: percentOf(1000, 6.2) = 62.00 (6.2% of 1000)
 */
export function percentOf(value: number | string | Decimal, percent: number | string | Decimal): Decimal {
  return new Decimal(value)
    .times(percent)
    .dividedBy(100)
    .toDecimalPlaces(2);
}

/**
 * Find the minimum of multiple values
 */
export function min(...values: (number | string | Decimal)[]): Decimal {
  return Decimal.min(...values.map(v => new Decimal(v))).toDecimalPlaces(2);
}

/**
 * Find the maximum of multiple values
 */
export function max(...values: (number | string | Decimal)[]): Decimal {
  return Decimal.max(...values.map(v => new Decimal(v))).toDecimalPlaces(2);
}

/**
 * Ensure a value is not negative (floor at zero)
 */
export function nonNegative(value: number | string | Decimal): Decimal {
  return Decimal.max(0, value).toDecimalPlaces(2);
}

/**
 * Convert Prisma Decimal to our Decimal
 * Prisma returns Decimal as a custom type, this normalizes it
 */
export function fromPrisma(value: any): Decimal {
  if (value === null || value === undefined) {
    return new Decimal(0);
  }
  return new Decimal(value.toString()).toDecimalPlaces(2);
}

/**
 * Round to nearest cent using banker's rounding (ROUND_HALF_UP)
 */
export function toCents(value: number | string | Decimal): Decimal {
  return new Decimal(value).toDecimalPlaces(2);
}

// Export the configured Decimal class for advanced use cases
export { Decimal };

/**
 * Helper to validate that calculations are precise
 * Throws an error if precision is lost
 */
export function assertPrecision(value: Decimal, expectedCents: number): void {
  const actualCents = Math.round(value.toNumber() * 100);
  if (actualCents !== expectedCents) {
    throw new Error(
      `Precision error: expected ${expectedCents} cents but got ${actualCents} cents`
    );
  }
}
