/**
 * Credit card handling logic
 *
 * YNAB Credit Card Behavior:
 * 1. Each credit card account has a matching "Credit Card Payments" category
 * 2. When you spend with a credit card, YNAB moves money FROM the budget category TO the payment category
 * 3. The "Available" in payment category = cash ready to pay the card
 * 4. Payments are recorded as transfers (checking → credit card)
 *
 * Key Fields for Detection:
 * - transfer_account_id: If non-null, this is a transfer (payment) not spending
 * - debt_transaction_type: Identifies fee/interest/refund transactions on CC accounts
 */

import type {
  Transaction,
  Account,
  Category,
  CategoryGroup,
  CreditCardTransactionType,
  CreditCardStatus,
  CreditCardAnalysis,
} from './types';
import { milliunitsToDisplay } from './utils/milliunits';

/**
 * Classify a credit card transaction type
 *
 * Uses the transfer_account_id field (NOT payee name guessing) to detect payments
 * Uses debt_transaction_type for fee/interest/refund classification
 */
export function classifyCreditCardTransaction(
  transaction: Transaction,
  accountType: string
): CreditCardTransactionType {
  // If this account isn't a credit card, return unknown
  if (accountType !== 'creditCard') {
    return 'unknown';
  }

  // Payment transfers have a transfer_account_id
  // This means money is moving FROM another account TO this credit card
  if (transaction.transfer_account_id !== null) {
    return 'payment';
  }

  // Use the debt_transaction_type field if available
  // YNAB sets this for transactions on debt accounts
  if (transaction.debt_transaction_type) {
    switch (transaction.debt_transaction_type) {
      case 'payment':
        return 'payment';
      case 'refund':
      case 'credit':
        return 'refund';
      case 'fee':
        return 'fee';
      case 'interest':
        return 'interest';
      case 'charge':
        return 'purchase';
      default:
        // balanceAdjustment, escrow, etc.
        return 'unknown';
    }
  }

  // Default: if it's an outflow (negative amount), it's a purchase
  // If it's an inflow (positive amount), it could be a refund or reward
  if (transaction.amount < 0) {
    return 'purchase';
  } else if (transaction.amount > 0) {
    return 'refund';
  }

  return 'unknown';
}

/**
 * Check if a transaction should be excluded from spending totals
 *
 * Credit card payments are transfers, not spending - they shouldn't count
 * in category spending totals or trends analysis
 */
export function shouldExcludeFromSpending(
  transaction: Transaction,
  accountType: string
): boolean {
  // Transfers are never spending (they're just money moving between accounts)
  if (transaction.transfer_account_id !== null) {
    return true;
  }

  // Credit card payments shouldn't count as spending
  const txType = classifyCreditCardTransaction(transaction, accountType);
  if (txType === 'payment') {
    return true;
  }

  return false;
}

/**
 * Check if a transaction should be excluded from the review queue
 *
 * Transfers don't need categorization (they're not spending)
 */
export function shouldExcludeFromReview(transaction: Transaction): boolean {
  // Transfers don't need categories - they're just money moving
  return transaction.transfer_account_id !== null;
}

/**
 * Find the payment category for a credit card account
 *
 * YNAB creates a category in "Credit Card Payments" group for each CC account
 * The category name usually matches the account name
 */
export function findPaymentCategory(
  cardAccountName: string,
  categoryGroups: CategoryGroup[]
): Category | null {
  // Find the Credit Card Payments group
  const ccPaymentGroup = categoryGroups.find(
    g => g.name === 'Credit Card Payments' && !g.deleted && !g.hidden
  );

  if (!ccPaymentGroup) {
    return null;
  }

  // Try to find a matching category
  // First, try exact match
  let category = ccPaymentGroup.categories.find(
    c => c.name === cardAccountName && !c.deleted && !c.hidden
  );

  if (category) {
    return category;
  }

  // Try case-insensitive match
  const lowerCardName = cardAccountName.toLowerCase();
  category = ccPaymentGroup.categories.find(
    c => c.name.toLowerCase() === lowerCardName && !c.deleted && !c.hidden
  );

  if (category) {
    return category;
  }

  // Try partial match (card name contains category name or vice versa)
  category = ccPaymentGroup.categories.find(c => {
    if (c.deleted || c.hidden) return false;
    const lowerCatName = c.name.toLowerCase();
    return lowerCardName.includes(lowerCatName) || lowerCatName.includes(lowerCardName);
  });

  return category || null;
}

/**
 * Analyze the health status of a single credit card
 */
export function analyzeCreditCardStatus(
  account: Account,
  paymentCategory: Category | null
): CreditCardStatus {
  // Balance is negative (debt) in YNAB, convert to positive for display
  const balance = Math.abs(milliunitsToDisplay(account.balance));

  // Available in payment category
  const paymentAvailable = paymentCategory
    ? milliunitsToDisplay(paymentCategory.balance)
    : 0;

  // Difference: positive = surplus (can pay more than owed), negative = shortfall
  const difference = paymentAvailable - balance;

  const isHealthy = difference >= 0;

  let status: string;
  if (isHealthy) {
    if (difference > 0) {
      status = 'Ready to pay in full (with surplus)';
    } else {
      status = 'Ready to pay in full';
    }
  } else {
    const shortfall = Math.abs(difference);
    if (shortfall < 50) {
      status = `Minor shortfall: $${shortfall.toFixed(2)}`;
    } else {
      status = `Shortfall: $${shortfall.toFixed(2)} not covered`;
    }
  }

  return {
    accountId: account.id,
    accountName: account.name,
    balance,
    paymentAvailable,
    difference,
    isHealthy,
    status,
    paymentCategoryId: paymentCategory?.id ?? null,
  };
}

/**
 * Analyze all credit cards in a budget
 */
export function analyzeAllCreditCards(
  accounts: Account[],
  categoryGroups: CategoryGroup[]
): CreditCardAnalysis {
  const creditCards = accounts.filter(
    a => a.type === 'creditCard' && !a.deleted && !a.closed
  );

  const cards: CreditCardStatus[] = [];
  let totalDebt = 0;
  let totalPaymentAvailable = 0;
  let hasIssues = false;

  for (const card of creditCards) {
    const paymentCategory = findPaymentCategory(card.name, categoryGroups);
    const status = analyzeCreditCardStatus(card, paymentCategory);

    cards.push(status);

    totalDebt += status.balance;
    totalPaymentAvailable += status.paymentAvailable;

    if (!status.isHealthy) {
      hasIssues = true;
    }
  }

  const totalShortfall = Math.max(0, totalDebt - totalPaymentAvailable);

  return {
    cards,
    totalDebt,
    totalPaymentAvailable,
    totalShortfall,
    hasIssues,
  };
}

/**
 * Format credit card analysis as a human-readable report
 */
export function formatCreditCardReport(analysis: CreditCardAnalysis): string {
  const lines: string[] = [];

  lines.push('Credit Card Status Report');
  lines.push('='.repeat(40));
  lines.push('');

  for (const card of analysis.cards) {
    const indicator = card.isHealthy ? '[OK]' : (card.difference > -50 ? '[!!]' : '[XX]');
    lines.push(`${indicator} ${card.accountName}`);
    lines.push(`    Balance: $${card.balance.toFixed(2)}`);
    lines.push(`    Payment Available: $${card.paymentAvailable.toFixed(2)}`);

    if (card.isHealthy) {
      if (card.difference > 0) {
        lines.push(`    Surplus: $${card.difference.toFixed(2)} (paying down debt)`);
      } else {
        lines.push(`    Status: ${card.status}`);
      }
    } else {
      lines.push(`    SHORTFALL: $${Math.abs(card.difference).toFixed(2)}`);
      lines.push(`    Action: Need to cover overspending`);
    }

    lines.push('');
  }

  // Summary
  lines.push('Summary');
  lines.push('-'.repeat(40));
  lines.push(`Total Credit Card Debt: $${analysis.totalDebt.toFixed(2)}`);
  lines.push(`Total Payment Available: $${analysis.totalPaymentAvailable.toFixed(2)}`);

  if (analysis.totalShortfall > 0) {
    lines.push(`Total Shortfall: $${analysis.totalShortfall.toFixed(2)}`);
  } else {
    lines.push('All cards can be paid in full!');
  }

  return lines.join('\n');
}
