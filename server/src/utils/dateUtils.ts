/**
 * Date Utilities for US Payroll System
 *
 * Handles timezone-aware date operations for payroll processing.
 * All payroll dates should be processed in the company's local timezone.
 *
 * Key principles:
 * - Store dates in UTC in database
 * - Process dates in company's local timezone
 * - Use explicit timezone when creating dates from user input
 */

// Default timezone for payroll processing (US Eastern)
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Parse a date string with explicit timezone handling
 * Treats the input as a local date (midnight in the specified timezone)
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @param timezone - IANA timezone (default: America/New_York)
 * @returns Date object representing midnight in the specified timezone
 */
export function parseLocalDate(dateString: string, timezone: string = DEFAULT_TIMEZONE): Date {
  // Validate format
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid date format: ${dateString}. Expected YYYY-MM-DD`);
  }

  const [, year, month, day] = match;
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  const d = parseInt(day, 10);

  // Validate ranges
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    throw new Error(`Invalid date: ${dateString}`);
  }

  // Create date in the specified timezone
  // Using Intl.DateTimeFormat to get correct offset for the timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Create a date at noon UTC to avoid DST edge cases during parsing
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));

  // Get the timezone offset for this date
  const parts = formatter.formatToParts(utcDate);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

  // Parse the formatted date to get local values
  const localYear = parseInt(getPart('year'), 10);
  const localMonth = parseInt(getPart('month'), 10);
  const localDay = parseInt(getPart('day'), 10);

  // Calculate the offset by comparing UTC to local
  // This accounts for DST correctly
  const localDate = new Date(Date.UTC(localYear, localMonth - 1, localDay, 0, 0, 0));
  const offset = utcDate.getTime() - localDate.getTime();

  // Return midnight in the specified timezone
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offset);
}

/**
 * Format a date for display in a specific timezone
 *
 * @param date - Date object
 * @param timezone - IANA timezone
 * @param format - Output format ('date', 'datetime', 'iso')
 */
export function formatDate(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
  format: 'date' | 'datetime' | 'iso' = 'date'
): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone
  };

  switch (format) {
    case 'date':
      return date.toLocaleDateString('en-US', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });

    case 'datetime':
      return date.toLocaleString('en-US', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

    case 'iso':
      // Return ISO date portion in local timezone
      const parts = new Intl.DateTimeFormat('en-CA', {
        ...options,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(date);

      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const d = parts.find(p => p.type === 'day')?.value;
      return `${y}-${m}-${d}`;
  }
}

/**
 * Get the tax year for a given pay date
 * Uses the date in the specified timezone
 */
export function getTaxYear(payDate: Date, timezone: string = DEFAULT_TIMEZONE): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric'
  });
  return parseInt(formatter.format(payDate), 10);
}

/**
 * Get the start of a year in a specific timezone
 */
export function getYearStart(year: number, timezone: string = DEFAULT_TIMEZONE): Date {
  return parseLocalDate(`${year}-01-01`, timezone);
}

/**
 * Get the end of a year in a specific timezone (Dec 31, 23:59:59.999)
 */
export function getYearEnd(year: number, timezone: string = DEFAULT_TIMEZONE): Date {
  const start = parseLocalDate(`${year + 1}-01-01`, timezone);
  return new Date(start.getTime() - 1);
}

/**
 * Check if two dates are in the same tax year
 */
export function isSameTaxYear(date1: Date, date2: Date, timezone: string = DEFAULT_TIMEZONE): boolean {
  return getTaxYear(date1, timezone) === getTaxYear(date2, timezone);
}

/**
 * Get number of pay periods per year based on pay frequency
 */
export function getPayPeriodsPerYear(payFrequency: string): number {
  switch (payFrequency.toUpperCase()) {
    case 'WEEKLY':
      return 52;
    case 'BIWEEKLY':
      return 26;
    case 'SEMIMONTHLY':
      return 24;
    case 'MONTHLY':
      return 12;
    default:
      return 26; // Default to biweekly
  }
}

/**
 * Calculate days between two dates (timezone-aware)
 */
export function daysBetween(startDate: Date, endDate: Date, timezone: string = DEFAULT_TIMEZONE): number {
  const start = formatDate(startDate, timezone, 'iso');
  const end = formatDate(endDate, timezone, 'iso');

  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);

  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);

  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
}

/**
 * Validate that pay period dates are logical
 */
export function validatePayPeriod(
  payPeriodStart: Date,
  payPeriodEnd: Date,
  payDate: Date,
  timezone: string = DEFAULT_TIMEZONE
): { valid: boolean; error?: string } {
  // Start must be before end
  if (payPeriodStart >= payPeriodEnd) {
    return { valid: false, error: 'Pay period start must be before end' };
  }

  // Pay date must be on or after period end
  if (payDate < payPeriodEnd) {
    return { valid: false, error: 'Pay date must be on or after pay period end' };
  }

  // Pay period shouldn't be more than 31 days
  const days = daysBetween(payPeriodStart, payPeriodEnd, timezone);
  if (days > 31) {
    return { valid: false, error: 'Pay period cannot exceed 31 days' };
  }

  // Pay date shouldn't be more than 30 days after period end
  const daysAfterEnd = daysBetween(payPeriodEnd, payDate, timezone);
  if (daysAfterEnd > 30) {
    return { valid: false, error: 'Pay date should be within 30 days of period end' };
  }

  return { valid: true };
}

// Timezone mappings for US states
export const STATE_TIMEZONES: Record<string, string> = {
  // Eastern Time
  CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', IN: 'America/Indiana/Indianapolis',
  KY: 'America/Kentucky/Louisville', ME: 'America/New_York', MD: 'America/New_York',
  MA: 'America/New_York', MI: 'America/Detroit', NH: 'America/New_York',
  NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York',
  WV: 'America/New_York',

  // Central Time
  AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago',
  IA: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MS: 'America/Chicago', MO: 'America/Chicago',
  NE: 'America/Chicago', ND: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',

  // Mountain Time
  AZ: 'America/Phoenix', CO: 'America/Denver', ID: 'America/Boise',
  MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver',
  WY: 'America/Denver',

  // Pacific Time
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles',

  // Alaska & Hawaii
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu'
};

/**
 * Get timezone for a state
 */
export function getStateTimezone(state: string): string {
  return STATE_TIMEZONES[state.toUpperCase()] || DEFAULT_TIMEZONE;
}
