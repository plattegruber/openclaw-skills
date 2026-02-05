/**
 * idea_to_issue tool
 * Create a GitHub issue from the captured idea using Claude Code
 */

import type { StateManager } from '../state.js';
import type { ClaudeCodeSessionManager } from '../claude-code/session-manager.js';
import type { NotificationManager } from '../notifications.js';
import type { IdeaToIssueInput, IdeaToIssueOutput } from '../types.js';
import { createError } from '../errors.js';
import { parseSessionOutput } from '../claude-code/parsers.js';

export const ideaToIssueDefinition = {
  name: 'idea_to_issue',
  description: 'Create a GitHub issue from the captured idea using Claude Code',
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID to create issue for',
      },
      dryRun: {
        type: 'boolean',
        description: 'Preview the issue without creating',
      },
    },
    required: ['ideaId'],
  },
};

export async function ideaToIssue(
  state: StateManager,
  sessionManager: ClaudeCodeSessionManager,
  notificationManager: NotificationManager,
  params: IdeaToIssueInput
): Promise<{ content: Array<{ type: string; text: string }>; details: IdeaToIssueOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  if (!idea.github?.repo) {
    throw createError('CONFIGURATION_ERROR', 'No repository configured for this idea', params.ideaId);
  }

  // Dry run mode - preview only
  if (params.dryRun) {
    const prompt = sessionManager.buildPrompt('issue_creation', {
      repo: idea.github.repo,
      title: idea.title,
      description: idea.description,
      clarifications: idea.clarificationHistory,
    });

    return {
      content: [
        {
          type: 'text',
          text: [
            '[DRY RUN] Would create issue:',
            '',
            `Title: ${idea.title}`,
            `Repository: ${idea.github.repo}`,
            '',
            'Prompt that would be sent to Claude Code:',
            '---',
            prompt,
            '---',
          ].join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
        dryRun: true,
      },
    };
  }

  // Update status to creating
  state.updateIdeaStatus(params.ideaId, 'issue_creating');

  // Start Claude Code session for issue creation
  const result = await sessionManager.startSession('issue_creation', {
    repo: idea.github.repo,
    title: idea.title,
    description: idea.description,
    clarifications: idea.clarificationHistory,
  });

  // Record the session
  state.addSession(params.ideaId, {
    sessionId: result.sessionId,
    purpose: 'issue_creation',
    startedAt: new Date().toISOString(),
    status: 'running',
    claudeCodeUrl: result.claudeCodeUrl,
  });

  // Parse results from Claude Code output
  const parsed = parseSessionOutput(result.messages);

  if (parsed.issueUrl && parsed.issueNumber) {
    // Update GitHub artifacts
    state.updateGitHubArtifacts(params.ideaId, {
      issueNumber: parsed.issueNumber,
      issueUrl: parsed.issueUrl,
    });

    // Update status
    state.updateIdeaStatus(params.ideaId, 'issue_ready');
    state.updateSessionStatus(params.ideaId, result.sessionId, 'completed');

    // Notify user
    await notificationManager.notifyIssueCreated(params.ideaId, idea.title, parsed.issueUrl);

    return {
      content: [
        {
          type: 'text',
          text: [
            `GitHub issue created: ${parsed.issueUrl}`,
            '',
            'The user has been notified. They can now ask to:',
            '- plan: Generate implementation plan',
            '- implement: Start implementation',
            '- modify: Change the issue',
            '- delete: Delete this idea',
          ].join('\n'),
        },
      ],
      details: {
        ideaId: idea.id,
        sessionId: result.sessionId,
        issueUrl: parsed.issueUrl,
        issueNumber: parsed.issueNumber,
        dryRun: false,
      },
    };
  }

  // Session started but issue not yet created (async)
  return {
    content: [
      {
        type: 'text',
        text: [
          'Claude Code session started for issue creation.',
          '',
          `Session URL: ${result.claudeCodeUrl}`,
          '',
          'Check idea_status for updates when the session completes.',
        ].join('\n'),
      },
    ],
    details: {
      ideaId: idea.id,
      sessionId: result.sessionId,
      dryRun: false,
    },
  };
}
