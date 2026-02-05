/**
 * idea_clarify tool
 * Record a clarifying question and answer for an idea
 */

import type { StateManager } from '../state.js';
import type { ClarifyIdeaInput, ClarifyIdeaOutput } from '../types.js';
import { createError } from '../errors.js';

export const ideaClarifyDefinition = {
  name: 'idea_clarify',
  description: 'Record a clarifying question and answer for an idea',
  parameters: {
    type: 'object',
    properties: {
      ideaId: {
        type: 'string',
        description: 'Idea ID',
      },
      question: {
        type: 'string',
        description: 'The clarifying question asked',
      },
      answer: {
        type: 'string',
        description: "The user's answer",
      },
      updateDescription: {
        type: 'boolean',
        description: 'Whether to incorporate this into the description (default: true)',
      },
    },
    required: ['ideaId', 'question', 'answer'],
  },
};

export async function clarifyIdea(
  state: StateManager,
  params: ClarifyIdeaInput
): Promise<{ content: Array<{ type: string; text: string }>; details: ClarifyIdeaOutput }> {
  const idea = state.getIdea(params.ideaId);
  if (!idea) {
    throw createError('IDEA_NOT_FOUND', `Idea not found: ${params.ideaId}`, params.ideaId);
  }

  const updateDescription = params.updateDescription !== false;
  state.addClarification(params.ideaId, params.question, params.answer, updateDescription);

  // Refresh idea to get updated clarification count
  const updatedIdea = state.getIdea(params.ideaId)!;

  const text = [
    `Clarification recorded for "${idea.title}".`,
    '',
    `Total clarifications: ${updatedIdea.clarificationHistory.length}`,
    '',
    'Continue asking questions or use idea_to_issue when ready.',
  ].join('\n');

  return {
    content: [{ type: 'text', text }],
    details: {
      ideaId: idea.id,
      clarificationCount: updatedIdea.clarificationHistory.length,
    },
  };
}
