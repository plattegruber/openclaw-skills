/**
 * Output parsing utilities for Claude Code session results
 * Extracts URLs, issue numbers, PR info, and plans from session output
 */

import type { StreamMessage, ImplementationPlan, PlanStep, CriticalFile } from '../types.js';

/**
 * Extract GitHub issue URL from session messages
 */
export function extractIssueUrl(messages: StreamMessage[]): string | null {
  for (const message of messages) {
    if (message.content) {
      // Match GitHub issue URLs
      const match = message.content.match(
        /https:\/\/github\.com\/[\w-]+\/[\w-]+\/issues\/\d+/
      );
      if (match) {
        return match[0];
      }
    }
  }
  return null;
}

/**
 * Extract issue number from URL
 */
export function extractIssueNumber(issueUrl: string | null): number | null {
  if (!issueUrl) return null;
  const match = issueUrl.match(/\/issues\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract GitHub PR URL from session messages
 */
export function extractPRUrl(messages: StreamMessage[]): string | null {
  for (const message of messages) {
    if (message.content) {
      // Match GitHub PR URLs
      const match = message.content.match(
        /https:\/\/github\.com\/[\w-]+\/[\w-]+\/pull\/\d+/
      );
      if (match) {
        return match[0];
      }
    }
  }
  return null;
}

/**
 * Extract PR number from URL
 */
export function extractPRNumber(prUrl: string | null): number | null {
  if (!prUrl) return null;
  const match = prUrl.match(/\/pull\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract GitHub comment URL from session messages
 */
export function extractCommentUrl(messages: StreamMessage[]): string | null {
  for (const message of messages) {
    if (message.content) {
      // Match GitHub issue comment URLs
      const match = message.content.match(
        /https:\/\/github\.com\/[\w-]+\/[\w-]+\/issues\/\d+#issuecomment-\d+/
      );
      if (match) {
        return match[0];
      }
    }
  }
  return null;
}

/**
 * Extract branch name from session messages
 */
export function extractBranch(messages: StreamMessage[]): string | null {
  for (const message of messages) {
    if (message.content) {
      // Match common branch patterns
      const patterns = [
        /git checkout -b ([\w-/]+)/,
        /branch[:\s]+'?([\w-/]+)'?/i,
        /feature\/[\w-]+/,
      ];

      for (const pattern of patterns) {
        const match = message.content.match(pattern);
        if (match) {
          return match[1] || match[0];
        }
      }
    }
  }
  return null;
}

/**
 * Extract implementation plan from session messages
 * Parses structured plan content from Claude Code output
 */
export function extractPlan(messages: StreamMessage[]): ImplementationPlan | null {
  let planContent = '';

  // Collect all content that might contain plan information
  for (const message of messages) {
    if (message.content) {
      planContent += message.content + '\n';
    }
  }

  if (!planContent.includes('Implementation Plan') && !planContent.includes('## Plan')) {
    return null;
  }

  try {
    // Extract summary (first paragraph after plan header)
    const summaryMatch = planContent.match(
      /(?:Implementation Plan|## Plan)[:\s]*\n+([^\n]+(?:\n[^\n#]+)*)/i
    );
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Implementation plan generated';

    // Extract steps (numbered list items)
    const steps: PlanStep[] = [];
    const stepMatches = planContent.matchAll(
      /(\d+)\.\s+([^\n]+)(?:\n\s+[-*]\s+([^\n]+))?/g
    );
    for (const match of stepMatches) {
      steps.push({
        order: parseInt(match[1], 10),
        description: match[2].trim(),
        filesInvolved: match[3] ? [match[3].trim()] : [],
      });
    }

    // Extract critical files
    const criticalFiles: CriticalFile[] = [];
    const fileMatches = planContent.matchAll(
      /[-*]\s+`([^`]+)`\s*[-:]\s*([^\n]+)/g
    );
    for (const match of fileMatches) {
      criticalFiles.push({
        path: match[1],
        reason: match[2].trim(),
      });
    }

    // Extract risks
    const risks: string[] = [];
    const riskSection = planContent.match(/(?:Risks?|Blockers?)[:\s]*\n((?:[-*]\s+[^\n]+\n?)+)/i);
    if (riskSection) {
      const riskMatches = riskSection[1].matchAll(/[-*]\s+([^\n]+)/g);
      for (const match of riskMatches) {
        risks.push(match[1].trim());
      }
    }

    // Estimate complexity based on steps and files
    let estimatedComplexity: 'low' | 'medium' | 'high' = 'medium';
    if (steps.length <= 3 && criticalFiles.length <= 5) {
      estimatedComplexity = 'low';
    } else if (steps.length > 10 || criticalFiles.length > 15) {
      estimatedComplexity = 'high';
    }

    return {
      summary,
      steps: steps.length > 0 ? steps : [{ order: 1, description: summary, filesInvolved: [] }],
      criticalFiles,
      risks,
      estimatedComplexity,
      postedAsComment: false,
    };
  } catch {
    return null;
  }
}

/**
 * Check if session output indicates success
 */
export function isSessionSuccessful(messages: StreamMessage[]): boolean {
  for (const message of messages) {
    if (message.content) {
      // Check for common success indicators
      if (
        message.content.includes('successfully created') ||
        message.content.includes('PR created') ||
        message.content.includes('issue created') ||
        message.content.includes('plan posted')
      ) {
        return true;
      }

      // Check for URLs which indicate successful creation
      if (
        message.content.includes('github.com') &&
        (message.content.includes('/issues/') ||
          message.content.includes('/pull/') ||
          message.content.includes('#issuecomment-'))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract error message from session output
 */
export function extractError(messages: StreamMessage[]): string | null {
  for (const message of messages) {
    if (message.content) {
      // Check for common error patterns
      const errorPatterns = [
        /error[:\s]+([^\n]+)/i,
        /failed[:\s]+([^\n]+)/i,
        /permission denied[:\s]*([^\n]*)/i,
        /not found[:\s]*([^\n]*)/i,
      ];

      for (const pattern of errorPatterns) {
        const match = message.content.match(pattern);
        if (match) {
          return match[0];
        }
      }
    }
  }
  return null;
}

/**
 * Parse all relevant data from session messages
 */
export function parseSessionOutput(messages: StreamMessage[]): {
  issueUrl: string | null;
  issueNumber: number | null;
  prUrl: string | null;
  prNumber: number | null;
  commentUrl: string | null;
  branch: string | null;
  plan: ImplementationPlan | null;
  success: boolean;
  error: string | null;
} {
  const issueUrl = extractIssueUrl(messages);
  const prUrl = extractPRUrl(messages);

  return {
    issueUrl,
    issueNumber: extractIssueNumber(issueUrl),
    prUrl,
    prNumber: extractPRNumber(prUrl),
    commentUrl: extractCommentUrl(messages),
    branch: extractBranch(messages),
    plan: extractPlan(messages),
    success: isSessionSuccessful(messages),
    error: extractError(messages),
  };
}
