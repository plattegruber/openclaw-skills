/**
 * idea_implement tool
 * Implement the idea using Claude Code, creating a PR
 */

import type { StateManager } from '../state.js';
import type { ClaudeCodeSessionManager } from '../claude-code/session-manager.js';
import type { NotificationManager } from '../notifications.js';
import type { PluginConfig, ImplementIdeaInput, ImplementIdeaOutput } from '../types.js';
import { createError } from '../errors.js';
import { parseSessionOutput } from '../claude-code/parsers.js';

export const ideaImplementDefinition = {
  name: 'idea_implement',
  description: 'Implement the idea using Claude Code, creating a PR',
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID',
      },
      skipPlan: {
        type: 'boolean',
        description: 'Skip planning phase if no plan exists',
      },
    },
    required: ['ideaId'],
  },
};

export async function implementIdea(
  state: StateManager,
  sessionManager: ClaudeCodeSessionManager,
  notificationManager: NotificationManager,
  config: PluginConfig,
  params: ImplementIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: ImplementIdeaOutput }> {
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

  // Enforce planning before implementation unless explicitly skipped
  if (!idea.plan && !params.skipPlan && config.requirePlanBeforeImplement) {
    return {
      content: [
        {
          type: 'text',
          text: [
            'No implementation plan exists for this idea.',
            '',
            'Options:',
            '1. Generate a plan first with idea_plan (recommended)',
            '2. Pass skipPlan: true to implement without a plan',
            '',
            'Planning helps ensure a well-structured implementation.',
          ].join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
      },
    };
  }

  // Update status
  state.updateIdeaStatus(params.ideaId, 'implementing');

  // Start implementation session
  const result = await sessionManager.startSession('implementation', {
    repo: idea.github.repo,
    issueNumber: idea.github.issueNumber,
    issueUrl: idea.github.issueUrl!,
    plan: idea.plan,
  });

  // Record session
  state.addSession(params.ideaId, {
    sessionId: result.sessionId,
    purpose: 'implementation',
    startedAt: new Date().toISOString(),
    status: 'running',
    claudeCodeUrl: result.claudeCodeUrl,
  });

  // Parse PR info from output
  const parsed = parseSessionOutput(result.messages);

  if (parsed.prUrl && parsed.prNumber) {
    // Update GitHub artifacts
    state.updateGitHubArtifacts(params.ideaId, {
      prNumber: parsed.prNumber,
      prUrl: parsed.prUrl,
      branch: parsed.branch ?? undefined,
    });

    // Update status
    state.updateIdeaStatus(params.ideaId, 'implemented');
    state.updateSessionStatus(params.ideaId, result.sessionId, 'completed');

    // Notify user
    await notificationManager.notifyImplementationReady(params.ideaId, idea.title, parsed.prUrl);

    return {
      content: [
        {
          type: 'text',
          text: [
            `Pull request created: ${parsed.prUrl}`,
            '',
            parsed.branch ? `Branch: ${parsed.branch}` : '',
            '',
            'Review the PR and request modifications if needed.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
        sessionId: result.sessionId,
        prUrl: parsed.prUrl,
        prNumber: parsed.prNumber,
        branch: parsed.branch ?? undefined,
      },
    };
  }

  // Session started but PR not yet created (async)
  return {
    content: [
      {
        type: 'text',
        text: [
          'Claude Code session started for implementation.',
          '',
          `Session URL: ${result.claudeCodeUrl}`,
          '',
          'Claude Code is:',
          '1. Creating a feature branch',
          '2. Implementing the changes',
          '3. Running tests',
          '4. Creating a pull request',
          '',
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
