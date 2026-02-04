/**
 * YNAB uses "milliunits" where 1000 milliunits = $1.00
 * These utilities handle conversion between milliunits and display values
 */

/**
 * Convert milliunits to display dollars
 * @param milliunits - Amount in milliunits (1000 = $1.00)
 * @returns Amount in dollars
 * @example milliunitsToDisplay(123930) // returns 123.93
 */
export function milliunitsToDisplay(milliunits: number): number {
  return milliunits / 1000;
}

/**
 * Convert display dollars to milliunits
 * @param dollars - Amount in dollars
 * @returns Amount in milliunits
 * @example displayToMilliunits(123.93) // returns 123930
 */
export function displayToMilliunits(dollars: number): number {
  return Math.round(dollars * 1000);
}

/**
 * Format milliunits as a currency string
 * @param milliunits - Amount in milliunits
 * @param options - Formatting options
 * @returns Formatted currency string
 * @example formatCurrency(123930) // returns "$123.93"
 * @example formatCurrency(-50000) // returns "-$50.00"
 */
export function formatCurrency(
  milliunits: number,
  options: {
    showSign?: boolean;
    locale?: string;
    currency?: string;
  } = {}
): string {
  const { showSign = false, locale = 'en-US', currency = 'USD' } = options;

  const dollars = milliunitsToDisplay(milliunits);
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(dollars));

  const sign = dollars < 0 ? '-' : (showSign && dollars > 0 ? '+' : '');
  return `${sign}${formatted}`;
}

/**
 * Format milliunits as a simple dollar amount without currency symbol
 * @param milliunits - Amount in milliunits
 * @returns Formatted number string
 * @example formatAmount(123930) // returns "123.93"
 */
export function formatAmount(milliunits: number): string {
  const dollars = milliunitsToDisplay(milliunits);
  return dollars.toFixed(2);
}

/**
 * Parse a currency string to milliunits
 * Handles various formats: "$123.45", "123.45", "-$50", "($50.00)"
 * @param value - Currency string to parse
 * @returns Amount in milliunits, or null if parsing fails
 */
export function parseCurrencyToMilliunits(value: string): number | null {
  if (!value || typeof value !== 'string') {
    return null;
  }

  // Remove currency symbols, spaces, and commas
  let cleaned = value.trim().replace(/[$,\s]/g, '');

  // Handle parentheses notation for negative: ($50.00) -> -50.00
  const isParenthesesNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  if (isParenthesesNegative) {
    cleaned = '-' + cleaned.slice(1, -1);
  }

  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) {
    return null;
  }

  return displayToMilliunits(parsed);
}

/**
 * Check if an amount represents an outflow (negative/expense)
 * In YNAB, outflows are negative amounts
 */
export function isOutflow(milliunits: number): boolean {
  return milliunits < 0;
}

/**
 * Check if an amount represents an inflow (positive/income)
 * In YNAB, inflows are positive amounts
 */
export function isInflow(milliunits: number): boolean {
  return milliunits > 0;
}

/**
 * Get the absolute value in display dollars
 * Useful for displaying transaction amounts regardless of direction
 */
export function absoluteDisplay(milliunits: number): number {
  return Math.abs(milliunitsToDisplay(milliunits));
}
