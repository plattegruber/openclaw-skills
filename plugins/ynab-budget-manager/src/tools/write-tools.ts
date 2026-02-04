/**
 * Write YNAB tools
 * These are optional and require writeToolsEnabled: true in config
 * All write tools default to dryRun: true for safety
 */

import type { YNABClient } from '../client';
import type { StateManager } from '../state';
import type {
  PluginConfig,
  SetTransactionCategoryInput,
  SetTransactionCategoryOutput,
  AddTransactionMemoInput,
  AddTransactionMemoOutput,
  SetTransactionFlagInput,
  SetTransactionFlagOutput,
  SetCategoryBudgetInput,
  SetCategoryBudgetOutput,
  FlagColor,
} from '../types';
import { displayToMilliunits, milliunitsToDisplay } from '../utils/milliunits';

export interface ToolContext {
  client: YNABClient;
  state: StateManager;
  config: PluginConfig;
}

/**
 * Resolve budget ID from: parameter -> state -> config
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
// ynab_set_transaction_category
// ============================================================================

export async function setTransactionCategory(
  input: SetTransactionCategoryInput,
  ctx: ToolContext
): Promise<SetTransactionCategoryOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  // Default to dry run for safety
  const dryRun = input.dryRun !== false;

  // Get current transaction state
  const { transaction } = await ctx.client.getTransaction(budgetId, input.transactionId);

  // Get category name for the new category
  const { category: newCategory } = await ctx.client.getCategory(budgetId, input.categoryId);

  const result: SetTransactionCategoryOutput = {
    success: true,
    dryRun,
    transactionId: input.transactionId,
    previousCategoryId: transaction.category_id,
    previousCategoryName: transaction.category_name,
    newCategoryId: input.categoryId,
    newCategoryName: newCategory.name,
  };

  if (!dryRun) {
    // Actually update the transaction
    await ctx.client.updateTransaction(budgetId, input.transactionId, {
      category_id: input.categoryId,
    });

    // Remove from pending review if it was there
    ctx.state.removeFromPendingReview(input.transactionId);
  }

  return result;
}

export const setTransactionCategoryDefinition = {
  name: 'ynab_set_transaction_category',
  description: 'Set or change the category of a transaction. Defaults to dry-run mode - set dryRun: false to actually apply the change.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      transactionId: {
        type: 'string',
        description: 'The transaction ID to categorize',
      },
      categoryId: {
        type: 'string',
        description: 'The category ID to assign',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true (default), only preview the change without applying it',
        default: true,
      },
    },
    required: ['transactionId', 'categoryId'] as string[],
  },
};

// ============================================================================
// ynab_add_transaction_memo
// ============================================================================

export async function addTransactionMemo(
  input: AddTransactionMemoInput,
  ctx: ToolContext
): Promise<AddTransactionMemoOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  // Default to dry run for safety
  const dryRun = input.dryRun !== false;

  // Get current transaction state
  const { transaction } = await ctx.client.getTransaction(budgetId, input.transactionId);

  // Calculate new memo
  let newMemo: string;
  if (input.append && transaction.memo) {
    newMemo = `${transaction.memo} | ${input.memo}`;
  } else {
    newMemo = input.memo;
  }

  const result: AddTransactionMemoOutput = {
    success: true,
    dryRun,
    transactionId: input.transactionId,
    previousMemo: transaction.memo,
    newMemo,
  };

  if (!dryRun) {
    // Actually update the transaction
    await ctx.client.updateTransaction(budgetId, input.transactionId, {
      memo: newMemo,
    });
  }

  return result;
}

export const addTransactionMemoDefinition = {
  name: 'ynab_add_transaction_memo',
  description: 'Add or update the memo field of a transaction. Can optionally append to existing memo. Defaults to dry-run mode.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      transactionId: {
        type: 'string',
        description: 'The transaction ID to update',
      },
      memo: {
        type: 'string',
        description: 'The memo text to set or append',
      },
      append: {
        type: 'boolean',
        description: 'If true, append to existing memo with " | " separator (default: false, replaces memo)',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true (default), only preview the change without applying it',
        default: true,
      },
    },
    required: ['transactionId', 'memo'] as string[],
  },
};

// ============================================================================
// ynab_set_transaction_flag
// ============================================================================

const VALID_FLAG_COLORS: FlagColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', null];

export async function setTransactionFlag(
  input: SetTransactionFlagInput,
  ctx: ToolContext
): Promise<SetTransactionFlagOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  // Validate flag color
  if (!VALID_FLAG_COLORS.includes(input.flagColor)) {
    throw new Error(`Invalid flag color: ${input.flagColor}. Valid colors: red, orange, yellow, green, blue, purple, or null to clear`);
  }

  // Default to dry run for safety
  const dryRun = input.dryRun !== false;

  // Get current transaction state
  const { transaction } = await ctx.client.getTransaction(budgetId, input.transactionId);

  const result: SetTransactionFlagOutput = {
    success: true,
    dryRun,
    transactionId: input.transactionId,
    previousFlagColor: transaction.flag_color,
    newFlagColor: input.flagColor,
  };

  if (!dryRun) {
    // Actually update the transaction
    await ctx.client.updateTransaction(budgetId, input.transactionId, {
      flag_color: input.flagColor,
    });
  }

  return result;
}

export const setTransactionFlagDefinition = {
  name: 'ynab_set_transaction_flag',
  description: 'Set or clear the flag color on a transaction. Use null to clear the flag. Defaults to dry-run mode.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      transactionId: {
        type: 'string',
        description: 'The transaction ID to update',
      },
      flagColor: {
        type: ['string', 'null'],
        enum: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', null],
        description: 'The flag color to set, or null to clear',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true (default), only preview the change without applying it',
        default: true,
      },
    },
    required: ['transactionId', 'flagColor'] as string[],
  },
};

// ============================================================================
// ynab_set_category_budget
// ============================================================================

/**
 * Get current month in YYYY-MM-DD format (first of month)
 */
function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export async function setCategoryBudget(
  input: SetCategoryBudgetInput,
  ctx: ToolContext
): Promise<SetCategoryBudgetOutput> {
  const budgetId = resolveBudgetId(input.budgetId, ctx.state, ctx.config);
  if (!budgetId) {
    throw new Error('No budget selected. Use ynab_list_budgets to see available budgets, then select one.');
  }

  // Default to dry run for safety
  const dryRun = input.dryRun !== false;

  // Use provided month or current month
  const month = input.month || getCurrentMonth();

  // Convert dollars to milliunits
  const budgetedMilliunits = displayToMilliunits(input.amount);

  // Get current category state for this month
  const { category: currentCategory } = await ctx.client.getCategoryForMonth(budgetId, month, input.categoryId);

  const previousBudgeted = milliunitsToDisplay(currentCategory.budgeted);
  const previousBalance = milliunitsToDisplay(currentCategory.balance);

  // Estimate new balance (previous balance + change in budgeted)
  const budgetChange = input.amount - previousBudgeted;
  const estimatedNewBalance = previousBalance + budgetChange;

  const result: SetCategoryBudgetOutput = {
    success: true,
    dryRun,
    categoryId: input.categoryId,
    categoryName: currentCategory.name,
    month,
    previousBudgeted,
    newBudgeted: input.amount,
    previousBalance,
    newBalance: estimatedNewBalance,
  };

  if (!dryRun) {
    // Actually update the category budget
    const { category: updatedCategory } = await ctx.client.updateCategoryForMonth(
      budgetId,
      month,
      input.categoryId,
      budgetedMilliunits
    );
    // Use actual new balance from API
    result.newBalance = milliunitsToDisplay(updatedCategory.balance);
  }

  return result;
}

export const setCategoryBudgetDefinition = {
  name: 'ynab_set_category_budget',
  description: 'Assign or update the budgeted amount for a category in a specific month. This is how you fund categories from "Ready to Assign". Amount is in dollars. Defaults to dry-run mode - set dryRun: false to actually apply the change.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      budgetId: {
        type: 'string',
        description: 'Budget ID (optional - uses selected budget if not provided)',
      },
      categoryId: {
        type: 'string',
        description: 'The category ID to fund',
      },
      month: {
        type: 'string',
        description: 'Month in YYYY-MM-DD format (first of month, e.g., "2025-02-01"). Defaults to current month.',
      },
      amount: {
        type: 'number',
        description: 'Amount to budget in dollars (e.g., 500 for $500.00). This sets the total budgeted amount, not an increment.',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true (default), only preview the change without applying it. Set to false to actually assign money.',
        default: true,
      },
    },
    required: ['categoryId', 'amount'] as string[],
  },
};

// ============================================================================
// Export all write tools
// ============================================================================

export const writeToolDefinitions = [
  setTransactionCategoryDefinition,
  addTransactionMemoDefinition,
  setTransactionFlagDefinition,
  setCategoryBudgetDefinition,
];

export const writeToolHandlers = {
  ynab_set_transaction_category: setTransactionCategory,
  ynab_add_transaction_memo: addTransactionMemo,
  ynab_set_transaction_flag: setTransactionFlag,
  ynab_set_category_budget: setCategoryBudget,
};
