/**
 * idea_list tool
 * List all ideas with their current status
 */

import type { StateManager } from '../state.js';
import type { ListIdeasInput, ListIdeasOutput, IdeaSummary, Idea } from '../types.js';

export const ideaListDefinition = {
  name: 'idea_list',
  description: 'List all ideas with their current status',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: [
          'draft',
          'clarifying',
          'issue_creating',
          'issue_ready',
          'planning',
          'planned',
          'implementing',
          'implemented',
          'completed',
          'deleted',
        ],
        description: 'Filter by status',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of ideas to return',
      },
    },
    required: [],
  },
};

function ideaToSummary(idea: Idea): IdeaSummary {
  return {
    id: idea.id,
    title: idea.title,
    status: idea.status,
    createdAt: idea.createdAt,
    updatedAt: idea.updatedAt,
    hasIssue: !!idea.github?.issueNumber,
    hasPlan: !!idea.plan,
    hasPR: !!idea.github?.prNumber,
  };
}

export async function listIdeas(
  state: StateManager,
  params: ListIdeasInput
): Promise<{ content: Array<{ type: string; text: string }>; details: ListIdeasOutput }> {
  let ideas = params.status
    ? state.getIdeasByStatus(params.status)
    : state.getAllIdeas();

  // Sort by most recently updated
  ideas = ideas.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const totalCount = ideas.length;

  // Apply limit
  if (params.limit && params.limit > 0) {
    ideas = ideas.slice(0, params.limit);
  }

  const summaries = ideas.map(ideaToSummary);

  if (summaries.length === 0) {
    const statusFilter = params.status ? ` with status "${params.status}"` : '';
    return {
      content: [
        {
          type: 'text',
          text: `No ideas found${statusFilter}.\n\nUse idea_capture to start a new idea.`,
        },
      ],
      details: { ideas: [], totalCount: 0 },
    };
  }

  const lines = [
    `Found ${totalCount} idea(s):`,
    '',
    ...summaries.map((s) => {
      const indicators = [];
      if (s.hasIssue) indicators.push('Issue');
      if (s.hasPlan) indicators.push('Plan');
      if (s.hasPR) indicators.push('PR');
      const indicatorStr = indicators.length > 0 ? ` [${indicators.join(', ')}]` : '';
      return `- [${s.id.slice(0, 8)}] "${s.title}" (${s.status})${indicatorStr}`;
    }),
    '',
    'Use idea_status <ideaId> for details.',
  ];

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    details: { ideas: summaries, totalCount },
  };
}
