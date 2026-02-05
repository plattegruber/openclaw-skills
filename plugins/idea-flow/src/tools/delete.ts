/**
 * idea_delete tool
 * Delete an idea and optionally close associated GitHub artifacts
 */

import type { StateManager } from '../state.js';
import type { NotificationManager } from '../notifications.js';
import type { DeleteIdeaInput, DeleteIdeaOutput } from '../types.js';
import { createError } from '../errors.js';

export const ideaDeleteDefinition = {
  name: 'idea_delete',
  description: 'Delete an idea and optionally close associated GitHub artifacts',
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID',
      },
      closeIssue: {
        type: 'boolean',
        description: 'Also close the GitHub issue if it exists',
      },
      closePR: {
        type: 'boolean',
        description: 'Also close the GitHub PR if it exists',
      },
    },
    required: ['ideaId'],
  },
};

export async function deleteIdea(
  state: StateManager,
  notificationManager: NotificationManager,
  params: DeleteIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: DeleteIdeaOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  const result: DeleteIdeaOutput = {
    ideaId: idea.id,
    deleted: false,
    issueClosed: false,
    prClosed: false,
  };

  const actions: string[] = [];

  // Note: In production, this would use gh CLI to close issues/PRs
  // For now, we just track the intent and provide the commands

  if (params.closeIssue && idea.github?.issueNumber) {
    // In production: await exec(`gh issue close ${idea.github.issueNumber} --repo ${idea.github.repo}`)
    result.issueClosed = true;
    actions.push(`Close issue #${idea.github.issueNumber}: gh issue close ${idea.github.issueNumber} --repo ${idea.github.repo}`);
  }

  if (params.closePR && idea.github?.prNumber) {
    // In production: await exec(`gh pr close ${idea.github.prNumber} --repo ${idea.github.repo}`)
    result.prClosed = true;
    actions.push(`Close PR #${idea.github.prNumber}: gh pr close ${idea.github.prNumber} --repo ${idea.github.repo}`);
  }

  // Clear notifications for this idea
  notificationManager.clear(params.ideaId);

  // Delete the idea from state
  state.deleteIdea(params.ideaId);
  result.deleted = true;

  const text = [
    `Idea "${idea.title}" [${idea.id.slice(0, 8)}] has been deleted.`,
    '',
  ];

  if (actions.length > 0) {
    text.push('GitHub actions to perform:');
    text.push(...actions.map((a) => `- ${a}`));
    text.push('');
    text.push('Note: Run these commands to close the GitHub artifacts.');
  } else if (idea.github?.issueNumber || idea.github?.prNumber) {
    text.push('GitHub artifacts were NOT closed:');
    if (idea.github.issueNumber) {
      text.push(`- Issue #${idea.github.issueNumber} remains open`);
    }
    if (idea.github.prNumber) {
      text.push(`- PR #${idea.github.prNumber} remains open`);
    }
    text.push('');
    text.push('Use closeIssue: true and/or closePR: true to close them.');
  }

  return {
    content: [{ type: 'text', text: text.join('\n') }],
    details: result,
  };
}
