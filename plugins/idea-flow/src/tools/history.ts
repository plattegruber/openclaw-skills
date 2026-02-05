/**
 * idea_history tool
 * View full history of an idea including clarifications and sessions
 */

import type { StateManager } from '../state.js';
import type { GetIdeaHistoryInput, GetIdeaHistoryOutput } from '../types.js';
import { createError } from '../errors.js';

export const ideaHistoryDefinition = {
  name: 'idea_history',
  description: 'View full history of an idea including clarifications and sessions',
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID',
      },
    },
    required: ['ideaId'],
  },
};

export async function getIdeaHistory(
  state: StateManager,
  params: GetIdeaHistoryInput
): Promise<{ content: Array<{ type: string; text: string }>; details: GetIdeaHistoryOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  const lines = [
    `History for: "${idea.title}" [${idea.id.slice(0, 8)}]`,
    '',
    'Timeline:',
    `- Created: ${new Date(idea.createdAt).toLocaleString()}`,
    `- Last updated: ${new Date(idea.updatedAt).toLocaleString()}`,
    '',
  ];

  // Clarification history
  if (idea.clarificationHistory.length > 0) {
    lines.push('Clarifications:');
    for (const c of idea.clarificationHistory) {
      lines.push(`[${new Date(c.askedAt).toLocaleString()}]`);
      lines.push(`  Q: ${c.question}`);
      lines.push(`  A: ${c.answer}`);
      lines.push('');
    }
  } else {
    lines.push('Clarifications: None');
    lines.push('');
  }

  // Session history
  if (idea.sessions.length > 0) {
    lines.push('Claude Code Sessions:');
    for (const s of idea.sessions) {
      const duration = s.completedAt
        ? ` (${Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}s)`
        : '';
      lines.push(`[${new Date(s.startedAt).toLocaleString()}] ${s.purpose} - ${s.status}${duration}`);
      if (s.claudeCodeUrl) {
        lines.push(`  URL: ${s.claudeCodeUrl}`);
      }
      if (s.error) {
        lines.push(`  Error: ${s.error}`);
      }
    }
    lines.push('');
  } else {
    lines.push('Claude Code Sessions: None');
    lines.push('');
  }

  // GitHub artifacts
  if (idea.github) {
    lines.push('GitHub Artifacts:');
    lines.push(`  Repository: ${idea.github.repo}`);
    if (idea.github.issueNumber) {
      lines.push(`  Issue #${idea.github.issueNumber}: ${idea.github.issueUrl}`);
    }
    if (idea.github.prNumber) {
      lines.push(`  PR #${idea.github.prNumber}: ${idea.github.prUrl}`);
    }
    if (idea.github.branch) {
      lines.push(`  Branch: ${idea.github.branch}`);
    }
    lines.push('');
  }

  // Plan details
  if (idea.plan) {
    lines.push('Implementation Plan:');
    lines.push(`  Summary: ${idea.plan.summary}`);
    lines.push(`  Complexity: ${idea.plan.estimatedComplexity}`);
    lines.push(`  Steps: ${idea.plan.steps.length}`);
    for (const step of idea.plan.steps) {
      lines.push(`    ${step.order}. ${step.description}`);
    }
    if (idea.plan.criticalFiles.length > 0) {
      lines.push(`  Critical files:`);
      for (const file of idea.plan.criticalFiles) {
        lines.push(`    - ${file.path}: ${file.reason}`);
      }
    }
    if (idea.plan.risks.length > 0) {
      lines.push(`  Risks:`);
      for (const risk of idea.plan.risks) {
        lines.push(`    - ${risk}`);
      }
    }
    if (idea.plan.commentUrl) {
      lines.push(`  Posted at: ${idea.plan.commentUrl}`);
    }
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    details: {
      idea,
      clarifications: idea.clarificationHistory,
      sessions: idea.sessions,
    },
  };
}
