/**
 * idea_status tool
 * Get detailed status of a specific idea
 */

import type { StateManager } from '../state.js';
import type { NotificationManager } from '../notifications.js';
import type { GetIdeaStatusInput, GetIdeaStatusOutput } from '../types.js';
import { createError } from '../errors.js';

export const ideaStatusDefinition = {
  name: 'idea_status',
  description: 'Get detailed status of a specific idea',
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

export async function getIdeaStatus(
  state: StateManager,
  notificationManager: NotificationManager,
  params: GetIdeaStatusInput
): Promise<{ content: Array<{ type: string; text: string }>; details: GetIdeaStatusOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  const notifications = notificationManager.getForIdea(params.ideaId);
  const unreadNotifications = notifications.filter((n) => !n.read);

  // Mark notifications as read when viewing status
  notificationManager.markAllRead(params.ideaId);

  const lines = [
    `Idea: "${idea.title}" [${idea.id.slice(0, 8)}]`,
    `Status: ${idea.status}`,
    `Created: ${new Date(idea.createdAt).toLocaleDateString()}`,
    `Updated: ${new Date(idea.updatedAt).toLocaleDateString()}`,
    '',
  ];

  // Repository info
  if (idea.github) {
    lines.push(`Repository: ${idea.github.repo}`);
    if (idea.github.issueUrl) {
      lines.push(`Issue: ${idea.github.issueUrl}`);
    }
    if (idea.github.prUrl) {
      lines.push(`PR: ${idea.github.prUrl}`);
    }
    if (idea.github.branch) {
      lines.push(`Branch: ${idea.github.branch}`);
    }
    lines.push('');
  }

  // Description
  lines.push('Description:');
  lines.push(idea.description);
  lines.push('');

  // Clarifications
  if (idea.clarificationHistory.length > 0) {
    lines.push(`Clarifications (${idea.clarificationHistory.length}):`);
    for (const c of idea.clarificationHistory) {
      lines.push(`- Q: ${c.question}`);
      lines.push(`  A: ${c.answer}`);
    }
    lines.push('');
  }

  // Plan summary
  if (idea.plan) {
    lines.push('Plan:');
    lines.push(`- Complexity: ${idea.plan.estimatedComplexity}`);
    lines.push(`- Steps: ${idea.plan.steps.length}`);
    lines.push(`- Critical files: ${idea.plan.criticalFiles.length}`);
    if (idea.plan.commentUrl) {
      lines.push(`- Comment: ${idea.plan.commentUrl}`);
    }
    lines.push('');
  }

  // Sessions
  if (idea.sessions.length > 0) {
    const latestSession = idea.sessions[idea.sessions.length - 1];
    lines.push(`Latest session: ${latestSession.purpose} (${latestSession.status})`);
    if (latestSession.claudeCodeUrl) {
      lines.push(`Session URL: ${latestSession.claudeCodeUrl}`);
    }
    lines.push('');
  }

  // Unread notifications
  if (unreadNotifications.length > 0) {
    lines.push(`Notifications (${unreadNotifications.length} new):`);
    for (const n of unreadNotifications) {
      lines.push(`- [${n.type}] ${n.message.split('\n')[0]}`);
    }
    lines.push('');
  }

  // Suggested actions based on status
  lines.push('Available actions:');
  switch (idea.status) {
    case 'draft':
    case 'clarifying':
      lines.push('- idea_clarify: Add more clarifications');
      lines.push('- idea_to_issue: Create GitHub issue');
      break;
    case 'issue_ready':
      lines.push('- idea_plan: Generate implementation plan');
      lines.push('- idea_implement: Start implementation');
      lines.push('- idea_modify: Request changes to issue');
      lines.push('- idea_delete: Delete this idea');
      break;
    case 'planned':
      lines.push('- idea_implement: Start implementation');
      lines.push('- idea_modify: Request changes to plan');
      break;
    case 'implemented':
      lines.push('- idea_modify: Request changes to implementation');
      break;
    default:
      lines.push('- idea_delete: Delete this idea');
  }

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    details: {
      idea,
      pendingNotifications: unreadNotifications,
    },
  };
}
