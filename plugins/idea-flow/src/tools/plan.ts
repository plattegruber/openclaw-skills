/**
 * idea_plan tool
 * Generate an implementation plan using Claude Code's Plan agent and post as comment
 */

import type { StateManager } from '../state.js';
import type { ClaudeCodeSessionManager } from '../claude-code/session-manager.js';
import type { NotificationManager } from '../notifications.js';
import type { PlanIdeaInput, PlanIdeaOutput } from '../types.js';
import { createError } from '../errors.js';
import { parseSessionOutput } from '../claude-code/parsers.js';

export const ideaPlanDefinition = {
  name: 'idea_plan',
  description: "Generate an implementation plan using Claude Code's Plan agent and post as comment",
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

export async function planIdea(
  state: StateManager,
  sessionManager: ClaudeCodeSessionManager,
  notificationManager: NotificationManager,
  params: PlanIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: PlanIdeaOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  if (!idea.github?.issueNumber) {
    throw createError(
      'NO_ISSUE_EXISTS',
      'No GitHub issue exists for this idea. Create one first with idea_to_issue.',
      params.ideaId
    );
  }

  // Update status
  state.updateIdeaStatus(params.ideaId, 'planning');

  // Start Claude Code session in plan mode
  const result = await sessionManager.startSession('planning', {
    repo: idea.github.repo,
    issueNumber: idea.github.issueNumber,
    issueUrl: idea.github.issueUrl!,
  });

  // Record session
  state.addSession(params.ideaId, {
    sessionId: result.sessionId,
    purpose: 'planning',
    startedAt: new Date().toISOString(),
    status: 'running',
    claudeCodeUrl: result.claudeCodeUrl,
  });

  // Parse plan from output
  const parsed = parseSessionOutput(result.messages);

  if (parsed.plan) {
    // Update plan with comment URL if available
    const plan = {
      ...parsed.plan,
      postedAsComment: !!parsed.commentUrl,
      commentUrl: parsed.commentUrl ?? undefined,
    };

    state.updatePlan(params.ideaId, plan);
    state.updateIdeaStatus(params.ideaId, 'planned');
    state.updateSessionStatus(params.ideaId, result.sessionId, 'completed');

    // Notify user
    if (parsed.commentUrl) {
      await notificationManager.notifyPlanReady(
        params.ideaId,
        idea.title,
        idea.github.issueUrl!,
        parsed.commentUrl
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: [
            parsed.commentUrl
              ? `Implementation plan posted: ${parsed.commentUrl}`
              : 'Implementation plan generated.',
            '',
            `Summary: ${plan.summary}`,
            `Complexity: ${plan.estimatedComplexity}`,
            `Steps: ${plan.steps.length}`,
            '',
            'To proceed, use idea_implement or request modifications.',
          ].join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
        sessionId: result.sessionId,
        plan,
        commentUrl: parsed.commentUrl ?? undefined,
      },
    };
  }

  // Session started but plan not yet ready (async)
  return {
    content: [
      {
        type: 'text',
        text: [
          'Claude Code session started for planning.',
          '',
          `Session URL: ${result.claudeCodeUrl}`,
          '',
          'The Plan agent is analyzing the codebase and generating an implementation plan.',
          'Check idea_status for updates when the session completes.',
        ].join('\n'),
      },
    ],
    details: {
      ideaId: idea.id,
      sessionId: result.sessionId,
    },
  };
}
