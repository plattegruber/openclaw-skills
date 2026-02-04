/**
 * Read-only YNAB tools
 * These are always available and don't modify any data
 */

import type { YNABClient } from '../client';
import type { StateManager } from '../state';
import type {
  PluginConfig,
  ListBudgetsOutput,
  GetAccountsInput,
  GetAccountsOutput,
  AccountSummary,
  GetRecentTransactionsInput,
  GetRecentTransactionsOutput,
  TransactionSummary,
  GetCategoriesInput,
  GetCategoriesOutput,
  CategoryGroupSummary,
  CategorySummary,
  GetMonthSummaryInput,
  GetMonthSummaryOutput,
  Transaction,
} from '../types';
import { milliunitsToDisplay } from '../utils/milliunits';
import { detectNeedsReview } from '../review';

export interface ToolContext {
  client: YNABClient;
  state: StateManager;
  config: PluginConfig;
}

/**
 * Resolve budget ID from: parameter -> state -> config
 * Returns null if no budget is available (caller should prompt user)
 */
function resolveBudgetId(
  paramBudgetId: string | undefined,
  state: StateManager,
  config: PluginConfig
): string | null {
  if (paramBudgetId) {
    return paramBudgetId;
  }

  const selectedBudget = state.getSelectedBudget();
  if (selectedBudget) {
    return selectedBudget.id;
  }

  if (config.budgetId) {
    return config.budgetId;
  }

  return null;
}

// ============================================================================
// ynab_list_budgets
// ============================================================================

export interface ListBudgetsToolInput {
  // No parameters needed
}

export async function listBudgets(
  _input: ListBudgetsToolInput,
  ctx: ToolContext
): Promise<ListBudgetsOutput> {
  const response = await ctx.client.getBudgets();
  const selectedBudget = ctx.state.getSelectedBudget();

  const budgets = response.budgets.map(b => ({
    id: b.id,
    name: b.name,
    last_modified_on: b.last_modified_on,
    first_month: b.first_month,
    last_month: b.last_month,
  }));

  // Sort by last modified, most recent first
  budgets.sort((a, b) => b.last_modified_on.localeCompare(a.last_modified_on));

  return {
    budgets,
    selectedBudgetId: selectedBudget?.id ?? null,
    selectedBudgetName: selectedBudget?.name ?? null,
  };
}

export const listBudgetsDefinition = {
  name: 'ynab_list_budgets',
  description: 'List all available YNAB budgets and show which one is currently selected',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
};

// ============================================================================
// ynab_get_accounts
// ============================================================================

export async function getAccounts(
  input: GetAccountsInput,
  ctx: ToolContext
): Promise<GetAccountsOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  const response = await ctx.client.getAccounts(budgetId);

  const accounts: AccountSummary[] = [];
  const brokenLinks: AccountSummary[] = [];

  for (const account of response.accounts) {
    if (account.deleted) continue;
    if (account.closed && !input.includeHidden) continue;

    const summary: AccountSummary = {
      id: account.id,
      name: account.name,
      type: account.type,
      balance: milliunitsToDisplay(account.balance),
      clearedBalance: milliunitsToDisplay(account.cleared_balance),
      unclearedBalance: milliunitsToDisplay(account.uncleared_balance),
      linked: account.direct_import_linked,
      linkError: account.direct_import_in_error,
      closed: account.closed,
    };

    accounts.push(summary);

    // Track accounts with broken links
    if (account.direct_import_linked && account.direct_import_in_error) {
      brokenLinks.push(summary);
    }
  }

  // Sort by type, then name
  accounts.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return a.name.localeCompare(b.name);
  });

  return { accounts, brokenLinks };
}

export const getAccountsDefinition = {
  name: 'ynab_get_accounts',
  description: 'Get all accounts in the budget with balances and bank link status. Reports accounts with broken bank connections.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include closed accounts (default: false)',
      },
    },
    required: [] as string[],
  },
};

// ============================================================================
// ynab_get_recent_transactions
// ============================================================================

export async function getRecentTransactions(
  input: GetRecentTransactionsInput,
  ctx: ToolContext
): Promise<GetRecentTransactionsOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  // Default lookback
  const lookbackDays = ctx.config.syncLookbackDays || 30;
  const defaultSinceDate = new Date();
  defaultSinceDate.setDate(defaultSinceDate.getDate() - lookbackDays);
  const sinceDate = input.sinceDate || defaultSinceDate.toISOString().slice(0, 10);

  let response;

  if (input.accountId) {
    response = await ctx.client.getAccountTransactions(budgetId, input.accountId, {
      sinceDate,
      type: input.type,
    });
  } else if (input.categoryId) {
    response = await ctx.client.getCategoryTransactions(budgetId, input.categoryId, {
      sinceDate,
      type: input.type,
    });
  } else {
    response = await ctx.client.getTransactions(budgetId, {
      sinceDate,
      type: input.type,
    });
  }

  // Get categories for review detection
  const categoriesResponse = await ctx.client.getCategories(budgetId);
  const categoryMap = new Map<string, string>();
  for (const group of categoriesResponse.category_groups) {
    for (const cat of group.categories) {
      categoryMap.set(cat.id, cat.name);
    }
  }

  const transactions: TransactionSummary[] = [];

  for (const tx of response.transactions) {
    if (tx.deleted) continue;

    const reviewResult = detectNeedsReview(
      tx as Transaction,
      ctx.config.reviewMode,
      ctx.config.catchAllCategories,
      ctx.config.reviewFlags,
      categoryMap
    );

    const summary: TransactionSummary = {
      id: tx.id,
      date: tx.date,
      payeeName: tx.payee_name,
      amount: milliunitsToDisplay(tx.amount),
      categoryName: tx.category_name,
      categoryId: tx.category_id,
      accountName: tx.account_name,
      memo: tx.memo,
      flagColor: tx.flag_color,
      isTransfer: tx.transfer_account_id !== null,
      needsReview: reviewResult.needsReview,
      reviewReason: reviewResult.reason,
    };

    transactions.push(summary);
  }

  // Sort by date descending (most recent first)
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  // Apply limit
  const limit = input.limit || 100;
  const limited = transactions.slice(0, limit);

  return {
    transactions: limited,
    totalCount: transactions.length,
  };
}

export const getRecentTransactionsDefinition = {
  name: 'ynab_get_recent_transactions',
  description: 'Get recent transactions with optional filtering by account, category, or type (uncategorized/unapproved). Includes review status for each transaction.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      sinceDate: {
        type: 'string',
        description: 'Start date in YYYY-MM-DD format (default: last 30 days)',
      },
      accountId: {
        type: 'string',
        description: 'Filter to specific account',
      },
      categoryId: {
        type: 'string',
        description: 'Filter to specific category',
      },
      type: {
        type: 'string',
        enum: ['uncategorized', 'unapproved'],
        description: 'Filter by transaction type',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of transactions to return (default: 100)',
      },
    },
    required: [] as string[],
  },
};

// ============================================================================
// ynab_get_categories
// ============================================================================

export async function getCategories(
  input: GetCategoriesInput,
  ctx: ToolContext
): Promise<GetCategoriesOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  const response = await ctx.client.getCategories(budgetId);

  const categoryGroups: CategoryGroupSummary[] = [];

  for (const group of response.category_groups) {
    // Skip internal groups
    if (group.name === 'Internal Master Category') continue;
    if (group.hidden && !input.includeHidden) continue;
    if (group.deleted) continue;

    const categories: CategorySummary[] = [];

    for (const cat of group.categories) {
      if (cat.hidden && !input.includeHidden) continue;
      if (cat.deleted) continue;

      categories.push({
        id: cat.id,
        name: cat.name,
        budgeted: milliunitsToDisplay(cat.budgeted),
        activity: milliunitsToDisplay(cat.activity),
        balance: milliunitsToDisplay(cat.balance),
        goalType: cat.goal_type,
        goalPercentComplete: cat.goal_percentage_complete,
      });
    }

    if (categories.length > 0) {
      categoryGroups.push({
        id: group.id,
        name: group.name,
        categories,
      });
    }
  }

  return { categoryGroups };
}

export const getCategoriesDefinition = {
  name: 'ynab_get_categories',
  description: 'Get all budget categories grouped by category group, with current month budgeted/activity/balance amounts',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      includeHidden: {
        type: 'boolean',
        description: 'Include hidden categories (default: false)',
      },
    },
    required: [] as string[],
  },
};

// ============================================================================
// ynab_get_month_summary
// ============================================================================

export async function getMonthSummary(
  input: GetMonthSummaryInput,
  ctx: ToolContext
): Promise<GetMonthSummaryOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  const month = input.month || 'current';
  const response = await ctx.client.getMonth(budgetId, month);
  const monthData = response.month;

  // Group categories
  const groupMap = new Map<string, CategorySummary[]>();
  const groupNames = new Map<string, string>();

  for (const cat of monthData.categories) {
    if (cat.hidden || cat.deleted) continue;

    const groupId = cat.category_group_id;
    const groupName = cat.category_group_name || 'Unknown';

    // Skip internal group
    if (groupName === 'Internal Master Category') continue;

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, []);
      groupNames.set(groupId, groupName);
    }

    groupMap.get(groupId)!.push({
      id: cat.id,
      name: cat.name,
      budgeted: milliunitsToDisplay(cat.budgeted),
      activity: milliunitsToDisplay(cat.activity),
      balance: milliunitsToDisplay(cat.balance),
      goalType: cat.goal_type,
      goalPercentComplete: cat.goal_percentage_complete,
    });
  }

  const categoryGroups: CategoryGroupSummary[] = [];
  for (const [groupId, categories] of groupMap) {
    categoryGroups.push({
      id: groupId,
      name: groupNames.get(groupId)!,
      categories,
    });
  }

  return {
    month: monthData.month,
    income: milliunitsToDisplay(monthData.income),
    budgeted: milliunitsToDisplay(monthData.budgeted),
    activity: milliunitsToDisplay(monthData.activity),
    toBeBudgeted: milliunitsToDisplay(monthData.to_be_budgeted),
    ageOfMoney: monthData.age_of_money,
    categoryGroups,
  };
}

export const getMonthSummaryDefinition = {
  name: 'ynab_get_month_summary',
  description: 'Get budget summary for a specific month including income, activity, to-be-budgeted, and category breakdowns',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      month: {
        type: 'string',
        description: 'Month in YYYY-MM format or "current" (default: current)',
      },
    },
    required: [] as string[],
  },
};

// ============================================================================
// Export all read tools
// ============================================================================

export const readToolDefinitions = [
  listBudgetsDefinition,
  getAccountsDefinition,
  getRecentTransactionsDefinition,
  getCategoriesDefinition,
  getMonthSummaryDefinition,
];

export const readToolHandlers = {
  ynab_list_budgets: listBudgets,
  ynab_get_accounts: getAccounts,
  ynab_get_recent_transactions: getRecentTransactions,
  ynab_get_categories: getCategories,
  ynab_get_month_summary: getMonthSummary,
};
