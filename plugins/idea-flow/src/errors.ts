/**
 * Error handling for Idea Flow plugin
 * Typed errors with recovery strategies
 */

import type { ErrorCode, RecoveryStrategy } from './types.js';

export class IdeaFlowError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public ideaId?: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'IdeaFlowError';
  }

  toUserMessage(): string {
    const strategy = recoveryStrategies[this.code];
    return `${this.message}\n\nSuggestion: ${strategy.message}`;
  }
}

/**
 * Recovery strategies per error type
 */
export const recoveryStrategies: Record<ErrorCode, RecoveryStrategy> = {
  IDEA_NOT_FOUND: {
    action: 'list_ideas',
    message: 'Use idea_list to see available ideas',
  },
  INVALID_STATE_TRANSITION: {
    action: 'check_status',
    message: 'Check idea status with idea_status first',
  },
  GITHUB_ERROR: {
    action: 'retry',
    message: 'GitHub API error, retry in a moment',
  },
  CLAUDE_CODE_SESSION_FAILED: {
    action: 'resume_or_restart',
    message: 'Session failed, can retry',
  },
  RATE_LIMIT_EXCEEDED: {
    action: 'wait',
    message: 'Rate limited, try again later',
  },
  NO_ISSUE_EXISTS: {
    action: 'create_issue',
    message: 'Create a GitHub issue first with idea_to_issue',
  },
  NO_PLAN_EXISTS: {
    action: 'create_plan',
    message: 'Generate a plan first with idea_plan, or pass skipPlan: true',
  },
  CONFIGURATION_ERROR: {
    action: 'check_config',
    message: 'Check plugin configuration',
  },
};

/**
 * Helper to create typed errors
 */
export function createError(
  code: ErrorCode,
  message?: string,
  ideaId?: string
): IdeaFlowError {
  const defaultMessages: Record<ErrorCode, string> = {
    IDEA_NOT_FOUND: 'Idea not found',
    INVALID_STATE_TRANSITION: 'Cannot perform this action in current state',
    GITHUB_ERROR: 'GitHub API error',
    CLAUDE_CODE_SESSION_FAILED: 'Claude Code session failed',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    NO_ISSUE_EXISTS: 'No GitHub issue exists for this idea',
    NO_PLAN_EXISTS: 'No implementation plan exists for this idea',
    CONFIGURATION_ERROR: 'Plugin configuration error',
  };

  return new IdeaFlowError(
    message || defaultMessages[code],
    code,
    ideaId
  );
}

/**
 * Check if error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof IdeaFlowError) {
    return error.recoverable;
  }
  return false;
}

/**
 * Get recovery suggestion for an error
 */
export function getRecoverySuggestion(error: unknown): string | null {
  if (error instanceof IdeaFlowError) {
    return recoveryStrategies[error.code]?.message || null;
  }
  return null;
}
