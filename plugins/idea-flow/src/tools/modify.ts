/**
 * idea_modify tool
 * Request modifications to an idea's issue, plan, or implementation
 */

import type { StateManager } from '../state.js';
import type { ClaudeCodeSessionManager } from '../claude-code/session-manager.js';
import type { NotificationManager } from '../notifications.js';
import type { ModifyIdeaInput, ModifyIdeaOutput } from '../types.js';
import { createError } from '../errors.js';
import { parseSessionOutput } from '../claude-code/parsers.js';

export const ideaModifyDefinition = {
  name: 'idea_modify',
  description: "Request modifications to an idea's issue, plan, or implementation",
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID',
      },
      modificationRequest: {
        type: 'string',
        description: 'Description of the modifications to make',
      },
      target: {
        type: 'string',
        enum: ['issue', 'plan', 'implementation'],
        description: 'What to modify: issue, plan, or implementation',
      },
    },
    required: ['ideaId', 'modificationRequest', 'target'],
  },
};

export async function modifyIdea(
  state: StateManager,
  sessionManager: ClaudeCodeSessionManager,
  notificationManager: NotificationManager,
  params: ModifyIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: ModifyIdeaOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  // Validate target exists
  switch (params.target) {
    case 'issue':
      if (!idea.github?.issueNumber) {
        throw createError(
          'NO_ISSUE_EXISTS',
          'No GitHub issue exists for this idea.',
          params.ideaId
        );
      }
      break;
    case 'plan':
      if (!idea.plan) {
        throw createError(
          'NO_PLAN_EXISTS',
          'No implementation plan exists for this idea.',
          params.ideaId
        );
      }
      break;
    case 'implementation':
      if (!idea.github?.prNumber) {
        throw createError(
          'NO_ISSUE_EXISTS',
          'No pull request exists for this idea.',
          params.ideaId
        );
      }
      break;
  }

  // Get the last session for this target to potentially resume
  const lastSession = state.getLastSession(
    params.ideaId,
    params.target === 'issue' ? 'issue_creation' : params.target === 'plan' ? 'planning' : 'implementation'
  );

  // Start or resume modification session
  let result;
  if (lastSession && lastSession.status === 'completed') {
    // Resume the previous session with modification request
    result = await sessionManager.resumeSession(
      lastSession.sessionId,
      `Make the following modifications: ${params.modificationRequest}`,
      true // fork the session
    );
  } else {
    // Start new modification session
    result = await sessionManager.startSession('modification', {
      repo: idea.github!.repo,
      issueNumber: idea.github?.issueNumber,
      issueUrl: idea.github?.issueUrl,
      modificationRequest: params.modificationRequest,
    });
  }

  // Record session
  state.addSession(params.ideaId, {
    sessionId: result.sessionId,
    purpose: 'modification',
    startedAt: new Date().toISOString(),
    status: 'running',
    claudeCodeUrl: `https://claude.ai/code/session_${result.sessionId}`,
  });

  // Check if modifications were applied
  const parsed = parseSessionOutput(result.messages);

  if (parsed.success) {
    state.updateSessionStatus(params.ideaId, result.sessionId, 'completed');
    await notificationManager.notifyModificationComplete(params.ideaId, idea.title, params.target);

    return {
      content: [
        {
          type: 'text',
          text: [
            `Modifications applied to ${params.target} for "${idea.title}".`,
            '',
            `Request: ${params.modificationRequest}`,
            '',
            'Check the updated artifacts:',
            idea.github?.issueUrl ? `- Issue: ${idea.github.issueUrl}` : '',
            idea.github?.prUrl ? `- PR: ${idea.github.prUrl}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
        sessionId: result.sessionId,
        success: true,
      },
    };
  }

  // Session started but modifications not yet complete (async)
  return {
    content: [
      {
        type: 'text',
        text: [
          `Claude Code session started for ${params.target} modifications.`,
          '',
          `Request: ${params.modificationRequest}`,
          '',
          `Session URL: https://claude.ai/code/session_${result.sessionId}`,
          '',
          'Check idea_status for updates when the session completes.',
        ].join('\n'),
      },
    ],
    details: {
      ideaId: idea.id,
      sessionId: result.sessionId,
      success: false,
    },
  };
}
