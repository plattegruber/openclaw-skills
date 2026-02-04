/**
 * Escape hatch tool for raw YNAB API access
 * Requires escapeHatchEnabled: true in config
 * Non-GET requests default to dryRun: true
 */

import type { YNABClient } from '../client';
import type { StateManager } from '../state';
import type {
  PluginConfig,
  ApiRequestInput,
  ApiRequestOutput,
} from '../types';

export interface ToolContext {
  client: YNABClient;
  state: StateManager;
  config: PluginConfig;
}

/**
 * Endpoints that are too dangerous for the escape hatch
 * These could cause data loss or are bulk operations
 */
const BLOCKED_ENDPOINTS = [
  // Bulk delete operations
  /\/budgets\/[^/]+\/transactions$/,  // PATCH with delete could bulk delete
];

/**
 * Methods + endpoint patterns that require extra caution
 */
const DANGEROUS_PATTERNS = [
  { method: 'DELETE', pattern: /.*/ },
  { method: 'PATCH', pattern: /\/transactions$/ },  // Bulk update
];

function isBlockedEndpoint(endpoint: string): boolean {
  return BLOCKED_ENDPOINTS.some(pattern => pattern.test(endpoint));
}

function isDangerousOperation(method: string, endpoint: string): { dangerous: boolean; reason?: string } {
  for (const { method: m, pattern } of DANGEROUS_PATTERNS) {
    if (method === m && pattern.test(endpoint)) {
      if (method === 'DELETE') {
        return { dangerous: true, reason: 'DELETE operations are blocked for safety' };
      }
      if (endpoint.endsWith('/transactions') && method === 'PATCH') {
        return { dangerous: true, reason: 'Bulk transaction updates are blocked for safety' };
      }
    }
  }
  return { dangerous: false };
}

// ============================================================================
// ynab_api_request
// ============================================================================

export async function apiRequest(
  input: ApiRequestInput,
  ctx: ToolContext
): Promise<ApiRequestOutput> {
  // Validate endpoint format
  if (!input.endpoint.startsWith('/')) {
    throw new Error('Endpoint must start with /');
  }

  // Check for blocked endpoints
  if (isBlockedEndpoint(input.endpoint)) {
    throw new Error('This endpoint is blocked for safety. Use the specific tools instead.');
  }

  // Check for dangerous operations
  const dangerCheck = isDangerousOperation(input.method, input.endpoint);
  if (dangerCheck.dangerous) {
    throw new Error(dangerCheck.reason);
  }

  // Determine if this should be a dry run
  // GET requests don't modify data, so no dry run needed
  // Non-GET requests default to dry run
  const isReadOnly = input.method === 'GET';
  const dryRun = isReadOnly ? false : (input.dryRun !== false);

  if (dryRun) {
    // Return a preview of what would happen
    return {
      success: true,
      dryRun: true,
      statusCode: 200,
      data: {
        _preview: true,
        _message: `Would ${input.method} to ${input.endpoint}`,
        _body: input.body || null,
      },
    };
  }

  // Make the actual request
  try {
    const data = await ctx.client.rawRequest(
      input.method,
      input.endpoint,
      input.body
    );

    return {
      success: true,
      dryRun: false,
      statusCode: 200,
      data,
    };
  } catch (error) {
    if (error instanceof Error && 'statusCode' in error) {
      const clientError = error as Error & { statusCode: number };
      return {
        success: false,
        dryRun: false,
        statusCode: clientError.statusCode,
        data: { error: clientError.message },
      };
    }
    throw error;
  }
}

export const apiRequestDefinition = {
  name: 'ynab_api_request',
  description: `Make a raw request to the YNAB API. Use this for advanced operations not covered by other tools.
Non-GET requests default to dry-run mode for safety. Some dangerous operations (DELETE, bulk updates) are blocked.
Endpoint should be the path after https://api.ynab.com/v1, e.g., "/budgets/abc-123/accounts"`,
  inputSchema: {
    type: 'object' as const,
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH'],
        description: 'HTTP method (DELETE is blocked for safety)',
      },
      endpoint: {
        type: 'string',
        description: 'API endpoint path, e.g., "/budgets/{budget_id}/transactions"',
      },
      body: {
        type: 'object',
        description: 'Request body for POST/PUT/PATCH requests',
      },
      dryRun: {
        type: 'boolean',
        description: 'If true (default for non-GET), preview the request without executing it',
        default: true,
      },
    },
    required: ['method', 'endpoint'] as string[],
  },
};

// ============================================================================
// Export escape hatch tool
// ============================================================================

export const escapeHatchToolDefinitions = [apiRequestDefinition];

export const escapeHatchToolHandlers = {
  ynab_api_request: apiRequest,
};
