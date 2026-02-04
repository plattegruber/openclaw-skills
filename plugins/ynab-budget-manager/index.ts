/**
 * YNAB Budget Manager Plugin for OpenClaw
 *
 * This plugin provides tools for managing YNAB budgets through the OpenClaw agent.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { createClient } from "./src/client.js";
import { createStateManager, StateManager } from "./src/state.js";
import type {
  ReviewMode,
  FlagColor,
  Transaction,
} from "./src/types.js";
import { milliunitsToDisplay } from "./src/utils/milliunits.js";
import { detectNeedsReview } from "./src/review.js";

// Plugin configuration type
interface YNABPluginConfig {
  ynabToken?: string;
  budgetId?: string;
  reviewMode?: ReviewMode;
  syncLookbackDays?: number;
  statePath?: string;
  writeToolsEnabled?: boolean;
  escapeHatchEnabled?: boolean;
  catchAllCategories?: string[];
  reviewFlags?: FlagColor[];
}

// Resolve budget ID from param -> state -> config
function resolveBudgetId(
  paramBudgetId: string | undefined,
  state: StateManager,
  config: YNABPluginConfig
): string | null {
  if (paramBudgetId) return paramBudgetId;
  const selectedBudget = state.getSelectedBudget();
  if (selectedBudget) return selectedBudget.id;
  if (config.budgetId) return config.budgetId;
  return null;
}

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = (api.pluginConfig ?? {}) as YNABPluginConfig;

  // Validate token
  if (!pluginConfig.ynabToken) {
    console.error("YNAB Budget Manager: ynabToken is required in plugin config");
    return;
  }

  // Initialize client and state
  const client = createClient(pluginConfig.ynabToken);
  const state = createStateManager(pluginConfig.statePath || "~/.ynab-logs");

  const config: YNABPluginConfig = {
    reviewMode: pluginConfig.reviewMode || "uncategorizedOnly",
    syncLookbackDays: pluginConfig.syncLookbackDays || 30,
    catchAllCategories: pluginConfig.catchAllCategories || [],
    reviewFlags: pluginConfig.reviewFlags || ["orange"],
    ...pluginConfig,
  };

  // ============================================================================
  // Read Tools (Always Available)
  // ============================================================================

  // ynab_list_budgets
  api.registerTool({
    name: "ynab_list_budgets",
    description: "List all available YNAB budgets and show which one is currently selected",
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      const response = await client.getBudgets();
      const selectedBudget = state.getSelectedBudget();

      const budgets = response.budgets
        .map((b) => ({
          id: b.id,
          name: b.name,
          lastModified: b.last_modified_on,
        }))
        .sort((a, b) => b.lastModified.localeCompare(a.lastModified));

      const text = [
        `Found ${budgets.length} budget(s):`,
        ...budgets.map((b) =>
          `- ${b.name}${selectedBudget?.id === b.id ? " (selected)" : ""} [${b.id}]`
        ),
        "",
        selectedBudget
          ? `Currently selected: ${selectedBudget.name}`
          : "No budget selected. Use the budget ID to select one.",
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { budgets, selectedBudgetId: selectedBudget?.id ?? null },
      };
    },
  });

  // ynab_get_accounts
  api.registerTool({
    name: "ynab_get_accounts",
    description: "Get all accounts in the budget with balances and bank link status",
    parameters: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "Budget ID (uses selected if not provided)" },
        includeHidden: { type: "boolean", description: "Include closed accounts" },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
      if (!budgetId) {
        throw new Error("No budget selected. Use ynab_list_budgets to see available budgets.");
      }

      const response = await client.getAccounts(budgetId);
      const accounts = response.accounts
        .filter((a) => !a.deleted && (!a.closed || params.includeHidden))
        .map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          balance: milliunitsToDisplay(a.balance),
          linked: a.direct_import_linked,
          linkError: a.direct_import_in_error,
        }));

      const brokenLinks = accounts.filter((a) => a.linked && a.linkError);

      let text = `Found ${accounts.length} account(s):\n`;
      for (const a of accounts) {
        const status = a.linkError ? " [LINK ERROR]" : a.linked ? " [linked]" : "";
        text += `- ${a.name} (${a.type}): $${a.balance.toFixed(2)}${status}\n`;
      }

      if (brokenLinks.length > 0) {
        text += `\n⚠️ ${brokenLinks.length} account(s) have broken bank links. Log in to YNAB to reconnect.`;
      }

      return {
        content: [{ type: "text", text }],
        details: { accounts, brokenLinks },
      };
    },
  });

  // ynab_get_recent_transactions
  api.registerTool({
    name: "ynab_get_recent_transactions",
    description: "Get recent transactions with optional filtering",
    parameters: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "Budget ID" },
        sinceDate: { type: "string", description: "Start date YYYY-MM-DD" },
        type: { type: "string", enum: ["uncategorized", "unapproved"], description: "Filter by type" },
        limit: { type: "number", description: "Max transactions to return" },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
      if (!budgetId) {
        throw new Error("No budget selected. Use ynab_list_budgets to see available budgets.");
      }

      const lookbackDays = config.syncLookbackDays || 30;
      const defaultSince = new Date();
      defaultSince.setDate(defaultSince.getDate() - lookbackDays);
      const sinceDate = (params.sinceDate as string) || defaultSince.toISOString().slice(0, 10);

      const response = await client.getTransactions(budgetId, {
        sinceDate,
        type: params.type as "uncategorized" | "unapproved" | undefined,
      });

      // Get categories for review detection
      const catResponse = await client.getCategories(budgetId);
      const categoryMap = new Map<string, string>();
      for (const group of catResponse.category_groups) {
        for (const cat of group.categories) {
          categoryMap.set(cat.id, cat.name);
        }
      }

      const transactions = response.transactions
        .filter((t) => !t.deleted)
        .map((t) => {
          const reviewResult = detectNeedsReview(
            t as Transaction,
            config.reviewMode || "uncategorizedOnly",
            config.catchAllCategories || [],
            config.reviewFlags || ["orange"],
            categoryMap
          );
          return {
            id: t.id,
            date: t.date,
            payee: t.payee_name,
            amount: milliunitsToDisplay(t.amount),
            category: t.category_name,
            account: t.account_name,
            memo: t.memo,
            isTransfer: t.transfer_account_id !== null,
            needsReview: reviewResult.needsReview,
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, (params.limit as number) || 100);

      const needsReview = transactions.filter((t) => t.needsReview);

      let text = `Found ${transactions.length} transaction(s):\n`;
      for (const t of transactions) {
        const review = t.needsReview ? " [NEEDS REVIEW]" : "";
        const transfer = t.isTransfer ? " [transfer]" : "";
        text += `- ${t.date}: ${t.payee || "Unknown"} $${Math.abs(t.amount).toFixed(2)} → ${t.category || "Uncategorized"}${review}${transfer}\n`;
      }

      if (needsReview.length > 0) {
        text += `\n${needsReview.length} transaction(s) need review.`;
      }

      return {
        content: [{ type: "text", text }],
        details: { transactions, needsReviewCount: needsReview.length },
      };
    },
  });

  // ynab_get_categories
  api.registerTool({
    name: "ynab_get_categories",
    description: "Get all budget categories grouped by category group",
    parameters: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "Budget ID" },
        includeHidden: { type: "boolean", description: "Include hidden categories" },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
      if (!budgetId) {
        throw new Error("No budget selected. Use ynab_list_budgets to see available budgets.");
      }

      const response = await client.getCategories(budgetId);

      const groups = response.category_groups
        .filter((g) => !g.deleted && g.name !== "Internal Master Category")
        .filter((g) => !g.hidden || params.includeHidden)
        .map((g) => ({
          name: g.name,
          categories: g.categories
            .filter((c) => !c.deleted && (!c.hidden || params.includeHidden))
            .map((c) => ({
              id: c.id,
              name: c.name,
              budgeted: milliunitsToDisplay(c.budgeted),
              activity: milliunitsToDisplay(c.activity),
              balance: milliunitsToDisplay(c.balance),
            })),
        }));

      let text = "";
      for (const g of groups) {
        text += `\n${g.name}:\n`;
        for (const c of g.categories) {
          const status = c.balance < 0 ? " [OVERSPENT]" : "";
          text += `  - ${c.name}: Budgeted $${c.budgeted.toFixed(2)}, Spent $${Math.abs(c.activity).toFixed(2)}, Available $${c.balance.toFixed(2)}${status}\n`;
        }
      }

      return {
        content: [{ type: "text", text: text.trim() }],
        details: { categoryGroups: groups },
      };
    },
  });

  // ynab_get_month_summary
  api.registerTool({
    name: "ynab_get_month_summary",
    description: "Get budget summary for a specific month",
    parameters: {
      type: "object",
      properties: {
        budgetId: { type: "string", description: "Budget ID" },
        month: { type: "string", description: 'Month YYYY-MM or "current"' },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
      if (!budgetId) {
        throw new Error("No budget selected. Use ynab_list_budgets to see available budgets.");
      }

      const month = (params.month as string) || "current";
      const response = await client.getMonth(budgetId, month);
      const m = response.month;

      const text = [
        `Budget Summary: ${m.month}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `Income: $${milliunitsToDisplay(m.income).toFixed(2)}`,
        `Budgeted: $${milliunitsToDisplay(m.budgeted).toFixed(2)}`,
        `Activity: $${Math.abs(milliunitsToDisplay(m.activity)).toFixed(2)}`,
        `To Be Budgeted: $${milliunitsToDisplay(m.to_be_budgeted).toFixed(2)}`,
        m.age_of_money ? `Age of Money: ${m.age_of_money} days` : "",
      ].filter(Boolean).join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          month: m.month,
          income: milliunitsToDisplay(m.income),
          budgeted: milliunitsToDisplay(m.budgeted),
          activity: milliunitsToDisplay(m.activity),
          toBeBudgeted: milliunitsToDisplay(m.to_be_budgeted),
          ageOfMoney: m.age_of_money,
        },
      };
    },
  });

  // ============================================================================
  // Write Tools (Optional)
  // ============================================================================

  if (config.writeToolsEnabled) {
    // ynab_set_transaction_category
    api.registerTool(
      {
        name: "ynab_set_transaction_category",
        description: "Set the category of a transaction. Defaults to dry-run mode.",
        parameters: {
          type: "object",
          properties: {
            budgetId: { type: "string", description: "Budget ID" },
            transactionId: { type: "string", description: "Transaction ID" },
            categoryId: { type: "string", description: "Category ID to assign" },
            dryRun: { type: "boolean", description: "Preview only (default: true)" },
          },
          required: ["transactionId", "categoryId"],
        },
        async execute(_id: string, params: Record<string, unknown>) {
          const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
          if (!budgetId) {
            throw new Error("No budget selected.");
          }

          const dryRun = params.dryRun !== false;
          const { transaction } = await client.getTransaction(budgetId, params.transactionId as string);
          const { category } = await client.getCategory(budgetId, params.categoryId as string);

          if (!dryRun) {
            await client.updateTransaction(budgetId, params.transactionId as string, {
              category_id: params.categoryId as string,
            });
            state.removeFromPendingReview(params.transactionId as string);
          }

          const text = dryRun
            ? `[DRY RUN] Would change category from "${transaction.category_name || "Uncategorized"}" to "${category.name}"`
            : `Changed category from "${transaction.category_name || "Uncategorized"}" to "${category.name}"`;

          return {
            content: [{ type: "text", text }],
            details: {
              dryRun,
              transactionId: params.transactionId,
              previousCategory: transaction.category_name,
              newCategory: category.name,
            },
          };
        },
      },
      { optional: true }
    );

    // ynab_add_transaction_memo
    api.registerTool(
      {
        name: "ynab_add_transaction_memo",
        description: "Add or update a transaction memo. Defaults to dry-run mode.",
        parameters: {
          type: "object",
          properties: {
            budgetId: { type: "string", description: "Budget ID" },
            transactionId: { type: "string", description: "Transaction ID" },
            memo: { type: "string", description: "Memo text" },
            append: { type: "boolean", description: "Append to existing memo" },
            dryRun: { type: "boolean", description: "Preview only (default: true)" },
          },
          required: ["transactionId", "memo"],
        },
        async execute(_id: string, params: Record<string, unknown>) {
          const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
          if (!budgetId) {
            throw new Error("No budget selected.");
          }

          const dryRun = params.dryRun !== false;
          const { transaction } = await client.getTransaction(budgetId, params.transactionId as string);

          const newMemo = params.append && transaction.memo
            ? `${transaction.memo} | ${params.memo}`
            : params.memo as string;

          if (!dryRun) {
            await client.updateTransaction(budgetId, params.transactionId as string, { memo: newMemo });
          }

          const text = dryRun
            ? `[DRY RUN] Would set memo to: "${newMemo}"`
            : `Set memo to: "${newMemo}"`;

          return {
            content: [{ type: "text", text }],
            details: { dryRun, previousMemo: transaction.memo, newMemo },
          };
        },
      },
      { optional: true }
    );

    // ynab_set_transaction_flag
    api.registerTool(
      {
        name: "ynab_set_transaction_flag",
        description: "Set or clear a transaction flag. Defaults to dry-run mode.",
        parameters: {
          type: "object",
          properties: {
            budgetId: { type: "string", description: "Budget ID" },
            transactionId: { type: "string", description: "Transaction ID" },
            flagColor: {
              type: ["string", "null"],
              enum: ["red", "orange", "yellow", "green", "blue", "purple", null],
              description: "Flag color or null to clear",
            },
            dryRun: { type: "boolean", description: "Preview only (default: true)" },
          },
          required: ["transactionId", "flagColor"],
        },
        async execute(_id: string, params: Record<string, unknown>) {
          const budgetId = resolveBudgetId(params.budgetId as string | undefined, state, config);
          if (!budgetId) {
            throw new Error("No budget selected.");
          }

          const dryRun = params.dryRun !== false;
          const { transaction } = await client.getTransaction(budgetId, params.transactionId as string);

          if (!dryRun) {
            await client.updateTransaction(budgetId, params.transactionId as string, {
              flag_color: params.flagColor as FlagColor,
            });
          }

          const text = dryRun
            ? `[DRY RUN] Would change flag from "${transaction.flag_color || "none"}" to "${params.flagColor || "none"}"`
            : `Changed flag from "${transaction.flag_color || "none"}" to "${params.flagColor || "none"}"`;

          return {
            content: [{ type: "text", text }],
            details: {
              dryRun,
              previousFlag: transaction.flag_color,
              newFlag: params.flagColor,
            },
          };
        },
      },
      { optional: true }
    );
  }

  // ============================================================================
  // Escape Hatch (Optional)
  // ============================================================================

  if (config.escapeHatchEnabled) {
    api.registerTool(
      {
        name: "ynab_api_request",
        description: "Make a raw YNAB API request. Non-GET requests default to dry-run. DELETE is blocked.",
        parameters: {
          type: "object",
          properties: {
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH"], description: "HTTP method" },
            endpoint: { type: "string", description: "API endpoint path" },
            body: { type: "object", description: "Request body" },
            dryRun: { type: "boolean", description: "Preview only (default: true for non-GET)" },
          },
          required: ["method", "endpoint"],
        },
        async execute(_id: string, params: Record<string, unknown>) {
          const method = params.method as string;
          const endpoint = params.endpoint as string;
          const isReadOnly = method === "GET";
          const dryRun = isReadOnly ? false : params.dryRun !== false;

          if (dryRun) {
            return {
              content: [{ type: "text", text: `[DRY RUN] Would ${method} ${endpoint}` }],
              details: { dryRun: true, method, endpoint, body: params.body },
            };
          }

          const data = await client.rawRequest(
            method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
            endpoint,
            params.body as Record<string, unknown> | undefined
          );

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            details: { dryRun: false, data },
          };
        },
      },
      { optional: true }
    );
  }
}
