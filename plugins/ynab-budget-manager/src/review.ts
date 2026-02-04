/**
 * Review mode detection for transactions
 * Determines which transactions need user review based on configured mode
 */

import type {
  Transaction,
  ReviewMode,
  ReviewReason,
  FlagColor,
} from './types';

export interface ReviewResult {
  needsReview: boolean;
  reason: ReviewReason | null;
}

/**
 * Detect if a transaction needs review based on the configured review mode
 *
 * @param transaction - The transaction to check
 * @param reviewMode - The review mode configuration
 * @param catchAllCategories - Category names to treat as needing review (for categoryAllowlistBlocklist mode)
 * @param reviewFlags - Flag colors that indicate review needed (for flagBased mode)
 * @param categoryNameMap - Map of category ID to category name (for category name lookup)
 */
export function detectNeedsReview(
  transaction: Transaction,
  reviewMode: ReviewMode,
  catchAllCategories: string[],
  reviewFlags: FlagColor[],
  categoryNameMap: Map<string, string>
): ReviewResult {
  // Transfers never need review - they don't have categories
  if (transaction.transfer_account_id !== null) {
    return { needsReview: false, reason: null };
  }

  // Deleted transactions don't need review
  if (transaction.deleted) {
    return { needsReview: false, reason: null };
  }

  switch (reviewMode) {
    case 'uncategorizedOnly':
      return detectUncategorized(transaction);

    case 'categoryAllowlistBlocklist':
      return detectCatchAllCategory(transaction, catchAllCategories, categoryNameMap);

    case 'flagBased':
      return detectFlagged(transaction, reviewFlags);

    default:
      // Default to uncategorized check
      return detectUncategorized(transaction);
  }
}

/**
 * Check if transaction is uncategorized
 * This is the simplest mode - just check for null category
 */
function detectUncategorized(transaction: Transaction): ReviewResult {
  if (transaction.category_id === null) {
    return { needsReview: true, reason: 'uncategorized' };
  }
  return { needsReview: false, reason: null };
}

/**
 * Check if transaction is in a "catch-all" category
 * Users configure which categories they treat as "needs attention"
 * Common examples: "Uncategorized", "To Be Categorized", "Review Later"
 */
function detectCatchAllCategory(
  transaction: Transaction,
  catchAllCategories: string[],
  categoryNameMap: Map<string, string>
): ReviewResult {
  // Also check for null category (always needs review)
  if (transaction.category_id === null) {
    return { needsReview: true, reason: 'uncategorized' };
  }

  // Look up category name
  const categoryName = transaction.category_name
    || categoryNameMap.get(transaction.category_id)
    || '';

  // Check if category name matches any catch-all patterns
  const normalizedCategoryName = categoryName.toLowerCase().trim();
  const isCatchAll = catchAllCategories.some(catchAll =>
    normalizedCategoryName === catchAll.toLowerCase().trim()
  );

  if (isCatchAll) {
    return { needsReview: true, reason: 'catch_all_category' };
  }

  return { needsReview: false, reason: null };
}

/**
 * Check if transaction has a review flag
 * Users configure which flag colors mean "needs review"
 */
function detectFlagged(
  transaction: Transaction,
  reviewFlags: FlagColor[]
): ReviewResult {
  if (transaction.flag_color && reviewFlags.includes(transaction.flag_color)) {
    return { needsReview: true, reason: 'flagged' };
  }

  // Also check for uncategorized as a fallback
  if (transaction.category_id === null) {
    return { needsReview: true, reason: 'uncategorized' };
  }

  return { needsReview: false, reason: null };
}

/**
 * Get a human-readable description of a review reason
 */
export function getReviewReasonDescription(reason: ReviewReason): string {
  switch (reason) {
    case 'uncategorized':
      return 'Transaction has no category assigned';
    case 'catch_all_category':
      return 'Transaction is in a catch-all category that needs review';
    case 'flagged':
      return 'Transaction is flagged for review';
    case 'manual':
      return 'Transaction was manually marked for review';
    default:
      return 'Transaction needs review';
  }
}

/**
 * Filter a list of transactions to only those needing review
 */
export function filterTransactionsNeedingReview(
  transactions: Transaction[],
  reviewMode: ReviewMode,
  catchAllCategories: string[],
  reviewFlags: FlagColor[],
  categoryNameMap: Map<string, string>
): Array<Transaction & { reviewReason: ReviewReason }> {
  const result: Array<Transaction & { reviewReason: ReviewReason }> = [];

  for (const tx of transactions) {
    const reviewResult = detectNeedsReview(
      tx,
      reviewMode,
      catchAllCategories,
      reviewFlags,
      categoryNameMap
    );

    if (reviewResult.needsReview && reviewResult.reason) {
      result.push({
        ...tx,
        reviewReason: reviewResult.reason,
      });
    }
  }

  return result;
}
