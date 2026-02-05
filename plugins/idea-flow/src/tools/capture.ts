/**
 * idea_capture tool
 * Start capturing a new idea
 */

import type { StateManager } from '../state.js';
import type { PluginConfig, CaptureIdeaInput, CaptureIdeaOutput } from '../types.js';

export const ideaCaptureDefinition = {
  name: 'idea_capture',
  description: 'Start capturing a new idea. Returns an idea ID for tracking.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Short title for the idea (2-10 words)',
      },
      description: {
        type: 'string',
        description: 'Initial description of what the user wants',
      },
      repo: {
        type: 'string',
        description: 'Target repository (owner/repo). Uses default if not provided.',
      },
    },
    required: ['title', 'description'],
  },
};

export async function captureIdea(
  state: StateManager,
  config: PluginConfig,
  params: CaptureIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: CaptureIdeaOutput }> {
  const ideaId = state.generateId();
  const repo = params.repo || config.defaultRepo;

  const idea = state.createIdea(ideaId, params.title, params.description, repo);

  const text = [
    `Idea captured: "${params.title}" [${ideaId.slice(0, 8)}]`,
    '',
    `Repository: ${repo}`,
    '',
    'To refine this idea, ask clarifying questions using idea_clarify.',
    'When ready, use idea_to_issue to create a GitHub issue.',
  ].join('\n');

  return {
    content: [{ type: 'text', text }],
    details: {
      ideaId,
      status: idea.status,
      title: params.title,
    },
  };
}
