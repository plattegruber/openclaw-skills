/**
 * YNAB API TypeScript interfaces
 * Based on YNAB API v1: https://api.ynab.com/v1
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface PluginConfig {
  ynabToken: string;
  budgetId?: string;
  reviewMode: ReviewMode;
  syncLookbackDays: number;
  statePath: string;
  writeToolsEnabled: boolean;
  escapeHatchEnabled: boolean;
  catchAllCategories: string[];
  reviewFlags: FlagColor[];
}

export type ReviewMode = 'uncategorizedOnly' | 'categoryAllowlistBlocklist' | 'flagBased';

// ============================================================================
// YNAB API Response Wrapper
// ============================================================================

export interface YNABResponse<T> {
  data: T;
}

export interface YNABErrorResponse {
  error: {
    id: string;
    name: string;
    detail: string;
  };
}

// ============================================================================
// Budget Types
// ============================================================================

export interface Budget {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
  date_format: DateFormat;
  currency_format: CurrencyFormat;
}

export interface BudgetSummary {
  id: string;
  name: string;
  last_modified_on: string;
  first_month: string;
  last_month: string;
}

export interface DateFormat {
  format: string;
}

export interface CurrencyFormat {
  iso_code: string;
  example_format: string;
  decimal_digits: number;
  decimal_separator: string;
  symbol_first: boolean;
  group_separator: string;
  currency_symbol: string;
  display_symbol: boolean;
}

export interface BudgetSettings {
  date_format: DateFormat;
  currency_format: CurrencyFormat;
}

// ============================================================================
// Account Types
// ============================================================================

export type AccountType =
  | 'checking'
  | 'savings'
  | 'creditCard'
  | 'cash'
  | 'lineOfCredit'
  | 'otherAsset'
  | 'otherLiability'
  | 'mortgage'
  | 'autoLoan'
  | 'studentLoan'
  | 'personalLoan'
  | 'medicalDebt'
  | 'otherDebt';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  on_budget: boolean;
  closed: boolean;
  note: string | null;
  balance: number; // milliunits
  cleared_balance: number; // milliunits
  uncleared_balance: number; // milliunits
  transfer_payee_id: string;
  direct_import_linked: boolean;
  direct_import_in_error: boolean;
  last_reconciled_at: string | null;
  debt_original_balance: number | null;
  debt_interest_rates: Record<string, number>;
  debt_minimum_payments: Record<string, number>;
  debt_escrow_amounts: Record<string, number>;
  deleted: boolean;
}

// ============================================================================
// Category Types
// ============================================================================

export interface CategoryGroup {
  id: string;
  name: string;
  hidden: boolean;
  deleted: boolean;
  categories: Category[];
}

export interface Category {
  id: string;
  category_group_id: string;
  category_group_name?: string;
  name: string;
  hidden: boolean;
  original_category_group_id: string | null;
  note: string | null;
  budgeted: number; // milliunits
  activity: number; // milliunits
  balance: number; // milliunits
  goal_type: GoalType | null;
  goal_day: number | null;
  goal_cadence: number | null;
  goal_cadence_frequency: number | null;
  goal_creation_month: string | null;
  goal_target: number | null; // milliunits
  goal_target_month: string | null;
  goal_percentage_complete: number | null;
  goal_months_to_budget: number | null;
  goal_under_funded: number | null;
  goal_overall_funded: number | null;
  goal_overall_left: number | null;
  deleted: boolean;
}

export type GoalType = 'TB' | 'TBD' | 'MF' | 'NEED' | 'DEBT';

// ============================================================================
// Transaction Types
// ============================================================================

export type FlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null;

export type ClearedStatus = 'cleared' | 'uncleared' | 'reconciled';

export type DebtTransactionType = 'payment' | 'refund' | 'fee' | 'interest' | 'escrow' | 'balanceAdjustment' | 'credit' | 'charge' | null;

export interface Transaction {
  id: string;
  date: string;
  amount: number; // milliunits
  memo: string | null;
  cleared: ClearedStatus;
  approved: boolean;
  flag_color: FlagColor;
  flag_name: string | null;
  account_id: string;
  account_name?: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  matched_transaction_id: string | null;
  import_id: string | null;
  import_payee_name: string | null;
  import_payee_name_original: string | null;
  debt_transaction_type: DebtTransactionType;
  deleted: boolean;
  subtransactions: SubTransaction[];
}

export interface SubTransaction {
  id: string;
  transaction_id: string;
  amount: number; // milliunits
  memo: string | null;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  transfer_transaction_id: string | null;
  deleted: boolean;
}

export interface TransactionDetail extends Transaction {
  account_name: string;
}

export interface SaveTransaction {
  account_id: string;
  date: string;
  amount: number; // milliunits
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
  cleared?: ClearedStatus;
  approved?: boolean;
  flag_color?: FlagColor;
  import_id?: string | null;
  subtransactions?: SaveSubTransaction[];
}

export interface SaveSubTransaction {
  amount: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
}

export interface UpdateTransaction {
  id: string;
  account_id?: string;
  date?: string;
  amount?: number;
  payee_id?: string | null;
  payee_name?: string | null;
  category_id?: string | null;
  memo?: string | null;
  cleared?: ClearedStatus;
  approved?: boolean;
  flag_color?: FlagColor;
  subtransactions?: SaveSubTransaction[];
}

// ============================================================================
// Payee Types
// ============================================================================

export interface Payee {
  id: string;
  name: string;
  transfer_account_id: string | null;
  deleted: boolean;
}

// ============================================================================
// Month Types
// ============================================================================

export interface MonthSummary {
  month: string;
  note: string | null;
  income: number; // milliunits
  budgeted: number; // milliunits
  activity: number; // milliunits
  to_be_budgeted: number; // milliunits
  age_of_money: number | null;
  deleted: boolean;
}

export interface MonthDetail extends MonthSummary {
  categories: Category[];
}

// ============================================================================
// Scheduled Transaction Types
// ============================================================================

export type Frequency =
  | 'never'
  | 'daily'
  | 'weekly'
  | 'everyOtherWeek'
  | 'twiceAMonth'
  | 'every4Weeks'
  | 'monthly'
  | 'everyOtherMonth'
  | 'every3Months'
  | 'every4Months'
  | 'twiceAYear'
  | 'yearly'
  | 'everyOtherYear';

export interface ScheduledTransaction {
  id: string;
  date_first: string;
  date_next: string;
  frequency: Frequency;
  amount: number; // milliunits
  memo: string | null;
  flag_color: FlagColor;
  flag_name: string | null;
  account_id: string;
  account_name?: string;
  payee_id: string | null;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
  subtransactions: ScheduledSubTransaction[];
}

export interface ScheduledSubTransaction {
  id: string;
  scheduled_transaction_id: string;
  amount: number;
  memo: string | null;
  payee_id: string | null;
  category_id: string | null;
  transfer_account_id: string | null;
  deleted: boolean;
}

// ============================================================================
// State Types (for local storage)
// ============================================================================

export interface PluginState {
  lastSyncAt: string | null;
  seenTransactionIds: string[];
  pendingReview: PendingReviewItem[];
  lastReviewPromptAt: string | null;
  selectedBudget: SelectedBudget | null;
  serverKnowledge: Record<string, number>; // endpoint -> knowledge
}

export interface PendingReviewItem {
  transactionId: string;
  reason: ReviewReason;
  addedAt: string;
  suggestedCategoryId?: string;
}

export type ReviewReason = 'uncategorized' | 'catch_all_category' | 'flagged' | 'manual';

export interface SelectedBudget {
  id: string;
  name: string;
  selectedAt: string;
}

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface ListBudgetsInput {
  // No parameters needed
}

export interface ListBudgetsOutput {
  budgets: BudgetSummary[];
  selectedBudgetId: string | null;
  selectedBudgetName: string | null;
}

export interface GetAccountsInput {
  budgetId?: string;
  includeHidden?: boolean;
}

export interface GetAccountsOutput {
  accounts: AccountSummary[];
  brokenLinks: AccountSummary[];
}

export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  balance: number; // dollars
  clearedBalance: number; // dollars
  unclearedBalance: number; // dollars
  linked: boolean;
  linkError: boolean;
  closed: boolean;
}

export interface GetRecentTransactionsInput {
  budgetId?: string;
  sinceDate?: string;
  accountId?: string;
  categoryId?: string;
  type?: 'uncategorized' | 'unapproved';
  limit?: number;
}

export interface GetRecentTransactionsOutput {
  transactions: TransactionSummary[];
  totalCount: number;
}

export interface TransactionSummary {
  id: string;
  date: string;
  payeeName: string | null;
  amount: number; // dollars
  categoryName: string | null;
  categoryId: string | null;
  accountName: string;
  memo: string | null;
  flagColor: FlagColor;
  isTransfer: boolean;
  needsReview: boolean;
  reviewReason: ReviewReason | null;
}

export interface GetCategoriesInput {
  budgetId?: string;
  includeHidden?: boolean;
}

export interface GetCategoriesOutput {
  categoryGroups: CategoryGroupSummary[];
}

export interface CategoryGroupSummary {
  id: string;
  name: string;
  categories: CategorySummary[];
}

export interface CategorySummary {
  id: string;
  name: string;
  budgeted: number; // dollars
  activity: number; // dollars
  balance: number; // dollars
  goalType: GoalType | null;
  goalPercentComplete: number | null;
}

export interface GetMonthSummaryInput {
  budgetId?: string;
  month?: string; // YYYY-MM or 'current'
}

export interface GetMonthSummaryOutput {
  month: string;
  income: number; // dollars
  budgeted: number; // dollars
  activity: number; // dollars
  toBeBudgeted: number; // dollars
  ageOfMoney: number | null;
  categoryGroups: CategoryGroupSummary[];
}

// Write tool types

export interface SetTransactionCategoryInput {
  budgetId?: string;
  transactionId: string;
  categoryId: string;
  dryRun?: boolean; // defaults to true
}

export interface SetTransactionCategoryOutput {
  success: boolean;
  dryRun: boolean;
  transactionId: string;
  previousCategoryId: string | null;
  previousCategoryName: string | null;
  newCategoryId: string;
  newCategoryName: string;
}

export interface AddTransactionMemoInput {
  budgetId?: string;
  transactionId: string;
  memo: string;
  append?: boolean; // if true, append to existing memo
  dryRun?: boolean; // defaults to true
}

export interface AddTransactionMemoOutput {
  success: boolean;
  dryRun: boolean;
  transactionId: string;
  previousMemo: string | null;
  newMemo: string;
}

export interface SetTransactionFlagInput {
  budgetId?: string;
  transactionId: string;
  flagColor: FlagColor;
  dryRun?: boolean; // defaults to true
}

export interface SetTransactionFlagOutput {
  success: boolean;
  dryRun: boolean;
  transactionId: string;
  previousFlagColor: FlagColor;
  newFlagColor: FlagColor;
}

export interface SetCategoryBudgetInput {
  budgetId?: string;
  categoryId: string;
  month?: string; // YYYY-MM-DD format, defaults to current month
  amount: number; // dollars (will be converted to milliunits)
  dryRun?: boolean; // defaults to true
}

export interface SetCategoryBudgetOutput {
  success: boolean;
  dryRun: boolean;
  categoryId: string;
  categoryName: string;
  month: string;
  previousBudgeted: number; // dollars
  newBudgeted: number; // dollars
  previousBalance: number; // dollars
  newBalance: number; // dollars (estimated)
}

// Escape hatch types

export interface ApiRequestInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string; // e.g., '/budgets/{id}/transactions'
  body?: Record<string, unknown>;
  dryRun?: boolean; // defaults to true for non-GET
}

export interface ApiRequestOutput {
  success: boolean;
  dryRun: boolean;
  statusCode: number;
  data: unknown;
}

// ============================================================================
// Credit Card Types
// ============================================================================

export type CreditCardTransactionType =
  | 'payment'      // Transfer from checking to CC (not spending)
  | 'purchase'     // Normal spending
  | 'refund'       // Money back
  | 'fee'          // Annual fee, late fee, etc.
  | 'interest'     // Interest charge
  | 'reward'       // Cash back, points redemption
  | 'unknown';

export interface CreditCardStatus {
  accountId: string;
  accountName: string;
  balance: number; // dollars (positive = debt)
  paymentAvailable: number; // dollars
  difference: number; // dollars (available - balance, negative = shortfall)
  isHealthy: boolean;
  status: string;
  paymentCategoryId: string | null;
}

export interface CreditCardAnalysis {
  cards: CreditCardStatus[];
  totalDebt: number;
  totalPaymentAvailable: number;
  totalShortfall: number;
  hasIssues: boolean;
}
