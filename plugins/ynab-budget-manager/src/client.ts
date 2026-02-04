/**
 * YNAB API HTTP Client
 * Handles authentication, rate limiting, and error handling
 */

import type {
  YNABResponse,
  YNABErrorResponse,
  Budget,
  BudgetSummary,
  BudgetSettings,
  Account,
  CategoryGroup,
  Category,
  TransactionDetail,
  SaveTransaction,
  UpdateTransaction,
  Payee,
  MonthSummary,
  MonthDetail,
  ScheduledTransaction,
} from './types';

const BASE_URL = 'https://api.ynab.com/v1';

export interface YNABClientConfig {
  token: string;
  onRateLimitWarning?: (remaining: number) => void;
}

export class YNABClientError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorId?: string,
    public errorName?: string,
    public errorDetail?: string
  ) {
    super(message);
    this.name = 'YNABClientError';
  }
}

export class YNABClient {
  private token: string;
  private onRateLimitWarning?: (remaining: number) => void;
  private lastRateLimitRemaining: number = 200;

  constructor(config: YNABClientConfig) {
    this.token = config.token;
    this.onRateLimitWarning = config.onRateLimitWarning;
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    // Build URL with query params
    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url.toString(), options);

    // Track rate limit
    const rateLimitRemaining = response.headers.get('X-Rate-Limit-Remaining');
    if (rateLimitRemaining) {
      this.lastRateLimitRemaining = parseInt(rateLimitRemaining, 10);
      // Warn when getting low on requests
      if (this.lastRateLimitRemaining < 20 && this.onRateLimitWarning) {
        this.onRateLimitWarning(this.lastRateLimitRemaining);
      }
    }

    if (!response.ok) {
      let errorData: YNABErrorResponse | null = null;
      try {
        errorData = await response.json() as YNABErrorResponse;
      } catch {
        // Couldn't parse error response
      }

      if (response.status === 429) {
        throw new YNABClientError(
          'YNAB API rate limit exceeded (200 requests/hour). Please wait before making more requests.',
          429,
          '429',
          'too_many_requests',
          'Rate limit exceeded'
        );
      }

      throw new YNABClientError(
        errorData?.error?.detail || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData?.error?.id,
        errorData?.error?.name,
        errorData?.error?.detail
      );
    }

    const data = await response.json() as YNABResponse<T>;
    return data.data;
  }

  get rateLimitRemaining(): number {
    return this.lastRateLimitRemaining;
  }

  // ============================================================================
  // Budget Endpoints
  // ============================================================================

  async getBudgets(): Promise<{ budgets: BudgetSummary[]; default_budget?: BudgetSummary }> {
    return this.request('GET', '/budgets');
  }

  async getBudget(budgetId: string): Promise<{ budget: Budget; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}`);
  }

  async getBudgetSettings(budgetId: string): Promise<{ settings: BudgetSettings }> {
    return this.request('GET', `/budgets/${budgetId}/settings`);
  }

  // ============================================================================
  // Account Endpoints
  // ============================================================================

  async getAccounts(budgetId: string): Promise<{ accounts: Account[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/accounts`);
  }

  async getAccount(budgetId: string, accountId: string): Promise<{ account: Account }> {
    return this.request('GET', `/budgets/${budgetId}/accounts/${accountId}`);
  }

  // ============================================================================
  // Category Endpoints
  // ============================================================================

  async getCategories(budgetId: string): Promise<{ category_groups: CategoryGroup[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/categories`);
  }

  async getCategory(budgetId: string, categoryId: string): Promise<{ category: Category }> {
    return this.request('GET', `/budgets/${budgetId}/categories/${categoryId}`);
  }

  async getCategoryForMonth(
    budgetId: string,
    month: string,
    categoryId: string
  ): Promise<{ category: Category }> {
    return this.request('GET', `/budgets/${budgetId}/months/${month}/categories/${categoryId}`);
  }

  async updateCategoryForMonth(
    budgetId: string,
    month: string,
    categoryId: string,
    budgeted: number
  ): Promise<{ category: Category }> {
    return this.request('PATCH', `/budgets/${budgetId}/months/${month}/categories/${categoryId}`, {
      category: { budgeted },
    });
  }

  // ============================================================================
  // Transaction Endpoints
  // ============================================================================

  async getTransactions(
    budgetId: string,
    options?: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    }
  ): Promise<{ transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/transactions`, undefined, {
      since_date: options?.sinceDate,
      type: options?.type,
      last_knowledge_of_server: options?.lastKnowledgeOfServer,
    });
  }

  async getAccountTransactions(
    budgetId: string,
    accountId: string,
    options?: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    }
  ): Promise<{ transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/accounts/${accountId}/transactions`, undefined, {
      since_date: options?.sinceDate,
      type: options?.type,
      last_knowledge_of_server: options?.lastKnowledgeOfServer,
    });
  }

  async getCategoryTransactions(
    budgetId: string,
    categoryId: string,
    options?: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    }
  ): Promise<{ transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/categories/${categoryId}/transactions`, undefined, {
      since_date: options?.sinceDate,
      type: options?.type,
      last_knowledge_of_server: options?.lastKnowledgeOfServer,
    });
  }

  async getPayeeTransactions(
    budgetId: string,
    payeeId: string,
    options?: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    }
  ): Promise<{ transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/payees/${payeeId}/transactions`, undefined, {
      since_date: options?.sinceDate,
      type: options?.type,
      last_knowledge_of_server: options?.lastKnowledgeOfServer,
    });
  }

  async getTransaction(budgetId: string, transactionId: string): Promise<{ transaction: TransactionDetail }> {
    return this.request('GET', `/budgets/${budgetId}/transactions/${transactionId}`);
  }

  async createTransaction(
    budgetId: string,
    transaction: SaveTransaction
  ): Promise<{ transaction_ids: string[]; transaction: TransactionDetail; server_knowledge: number }> {
    return this.request('POST', `/budgets/${budgetId}/transactions`, { transaction });
  }

  async createTransactions(
    budgetId: string,
    transactions: SaveTransaction[]
  ): Promise<{ transaction_ids: string[]; transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('POST', `/budgets/${budgetId}/transactions`, { transactions });
  }

  async updateTransaction(
    budgetId: string,
    transactionId: string,
    transaction: Partial<UpdateTransaction>
  ): Promise<{ transaction: TransactionDetail; server_knowledge: number }> {
    return this.request('PUT', `/budgets/${budgetId}/transactions/${transactionId}`, { transaction });
  }

  async updateTransactions(
    budgetId: string,
    transactions: UpdateTransaction[]
  ): Promise<{ transactions: TransactionDetail[]; server_knowledge: number }> {
    return this.request('PATCH', `/budgets/${budgetId}/transactions`, { transactions });
  }

  async deleteTransaction(budgetId: string, transactionId: string): Promise<{ transaction: TransactionDetail }> {
    return this.request('DELETE', `/budgets/${budgetId}/transactions/${transactionId}`);
  }

  // ============================================================================
  // Payee Endpoints
  // ============================================================================

  async getPayees(budgetId: string): Promise<{ payees: Payee[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/payees`);
  }

  async getPayee(budgetId: string, payeeId: string): Promise<{ payee: Payee }> {
    return this.request('GET', `/budgets/${budgetId}/payees/${payeeId}`);
  }

  // ============================================================================
  // Month Endpoints
  // ============================================================================

  async getMonths(budgetId: string): Promise<{ months: MonthSummary[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/months`);
  }

  async getMonth(budgetId: string, month: string): Promise<{ month: MonthDetail }> {
    return this.request('GET', `/budgets/${budgetId}/months/${month}`);
  }

  // ============================================================================
  // Scheduled Transaction Endpoints
  // ============================================================================

  async getScheduledTransactions(budgetId: string): Promise<{ scheduled_transactions: ScheduledTransaction[]; server_knowledge: number }> {
    return this.request('GET', `/budgets/${budgetId}/scheduled_transactions`);
  }

  async getScheduledTransaction(budgetId: string, scheduledTransactionId: string): Promise<{ scheduled_transaction: ScheduledTransaction }> {
    return this.request('GET', `/budgets/${budgetId}/scheduled_transactions/${scheduledTransactionId}`);
  }

  // ============================================================================
  // Raw Request (for escape hatch)
  // ============================================================================

  async rawRequest(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<unknown> {
    return this.request(method, endpoint, body);
  }
}

/**
 * Create a YNAB client instance
 */
export function createClient(token: string): YNABClient {
  return new YNABClient({
    token,
    onRateLimitWarning: (remaining) => {
      console.warn(`YNAB API rate limit warning: ${remaining} requests remaining`);
    },
  });
}
