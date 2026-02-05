/**
 * Claude Code Session Manager
 * Manages Claude Code web sessions for issue creation, planning, and implementation
 */

import type {
  PluginConfig,
  SessionPurpose,
  SessionParams,
  SessionStartResult,
  SessionResumeResult,
  StreamMessage,
  ClarificationEntry,
  ImplementationPlan,
} from '../types.js';

/**
 * Manages Claude Code web sessions
 * Note: In production, this would use the Claude Agent SDK for programmatic control
 * For now, this provides the interface and prompt generation
 */
export class ClaudeCodeSessionManager {
  private config: PluginConfig;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Start a Claude Code web session for a specific purpose
   * In production, this would use the Claude Agent SDK
   */
  async startSession(
    purpose: SessionPurpose,
    params: SessionParams
  ): Promise<SessionStartResult> {
    const prompt = this.buildPrompt(purpose, params);
    const sessionId = this.generateSessionId();

    // In production, this would call the Claude Agent SDK:
    // const response = await query({
    //   prompt,
    //   options: {
    //     model: "claude-sonnet-4-5",
    //     allowedTools: this.getToolsForPurpose(purpose),
    //     remote: true,
    //     environment: this.config.claudeCodeEnvironment
    //   }
    // });

    // For now, return a simulated result with the generated prompt
    // The actual execution would happen in the Claude Code web session
    return {
      sessionId,
      claudeCodeUrl: `https://claude.ai/code/session_${sessionId}`,
      messages: [
        {
          type: 'system',
          subtype: 'init',
          session_id: sessionId,
        },
        {
          type: 'prompt',
          content: prompt,
        },
      ],
    };
  }

  /**
   * Resume an existing session to continue work
   */
  async resumeSession(
    sessionId: string,
    additionalPrompt: string,
    fork: boolean = false
  ): Promise<SessionResumeResult> {
    // In production, this would use the Claude Agent SDK to resume
    // For now, return the additional prompt context
    const newSessionId = fork ? this.generateSessionId() : sessionId;

    return {
      sessionId: newSessionId,
      messages: [
        {
          type: 'prompt',
          content: additionalPrompt,
        },
      ],
    };
  }

  /**
   * Build appropriate prompt for each session purpose
   */
  buildPrompt(purpose: SessionPurpose, params: SessionParams): string {
    switch (purpose) {
      case 'issue_creation':
        return this.buildIssueCreationPrompt(params);
      case 'planning':
        return this.buildPlanningPrompt(params);
      case 'implementation':
        return this.buildImplementationPrompt(params);
      case 'modification':
        return this.buildModificationPrompt(params);
    }
  }

  private buildIssueCreationPrompt(params: SessionParams): string {
    const clarificationsText = params.clarifications?.length
      ? params.clarifications
          .map((c) => `- Q: ${c.question}\n  A: ${c.answer}`)
          .join('\n')
      : 'None';

    return `Create a GitHub issue for the following feature request.

**Repository**: ${params.repo}

**Title**: ${params.title || 'Untitled'}

**Requirements**:
${params.description || 'No description provided'}

**Clarifications gathered**:
${clarificationsText}

Instructions:
1. Create a well-structured GitHub issue using the gh CLI
2. Include:
   - Clear title
   - Problem statement / motivation
   - Detailed requirements
   - Acceptance criteria
   - Technical considerations (if applicable)
3. Add appropriate labels if you can determine them
4. Return the issue URL when complete

Use: gh issue create --repo ${params.repo} --title "..." --body "..."`;
  }

  private buildPlanningPrompt(params: SessionParams): string {
    return `Generate an implementation plan for GitHub issue #${params.issueNumber}.

**Repository**: ${params.repo}
**Issue**: ${params.issueUrl}

Instructions:
1. Read the issue to understand requirements
2. Explore the codebase to understand architecture
3. Create a detailed implementation plan including:
   - Step-by-step implementation strategy
   - Critical files to modify/create
   - Architectural trade-offs and considerations
   - Potential risks or blockers
   - Recommended order of implementation
4. Post the plan as a comment on the issue using:
   gh issue comment ${params.issueNumber} --repo ${params.repo} --body "## Implementation Plan\n..."
5. Return the comment URL when complete`;
  }

  private buildImplementationPrompt(params: SessionParams): string {
    const planText = params.plan
      ? `\n**Implementation Plan**:\n${params.plan.summary}\n\nSteps:\n${params.plan.steps.map((s) => `${s.order}. ${s.description}`).join('\n')}`
      : '';

    return `Implement the feature described in GitHub issue #${params.issueNumber}.

**Repository**: ${params.repo}
**Issue**: ${params.issueUrl}${planText}

Instructions:
1. Create a new branch for this feature (e.g., feature/issue-${params.issueNumber})
2. Implement the changes following the plan
3. Write tests where appropriate
4. Ensure all tests pass
5. Create a pull request linked to the issue
6. Return the PR URL when complete

Use:
- git checkout -b feature/issue-${params.issueNumber}
- [make changes]
- git add . && git commit -m "..."
- git push -u origin feature/issue-${params.issueNumber}
- gh pr create --repo ${params.repo} --title "..." --body "Closes #${params.issueNumber}\n\n..."`;
  }

  private buildModificationPrompt(params: SessionParams): string {
    return `Make modifications to the existing work on issue #${params.issueNumber}.

**Repository**: ${params.repo}
**Issue**: ${params.issueUrl}
**Requested changes**: ${params.modificationRequest}

Instructions:
1. Review the current state of the branch/PR
2. Make the requested modifications
3. Ensure tests still pass
4. Update the PR description if needed
5. Push the changes

Use:
- git pull
- [make modifications]
- git add . && git commit -m "Address review: ${params.modificationRequest?.slice(0, 50)}..."
- git push`;
  }

  /**
   * Get allowed tools for each session purpose
   */
  getToolsForPurpose(purpose: SessionPurpose): string[] {
    const baseTools = ['Read', 'Glob', 'Grep', 'Bash'];

    switch (purpose) {
      case 'issue_creation':
        return [...baseTools]; // Read-only + Bash for gh
      case 'planning':
        return [...baseTools]; // Read-only exploration
      case 'implementation':
      case 'modification':
        return [...baseTools, 'Edit', 'Write']; // Full write access
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get the prompt that was used for a session (for debugging)
   */
  getPromptForSession(purpose: SessionPurpose, params: SessionParams): string {
    return this.buildPrompt(purpose, params);
  }
}

/**
 * Create a session manager instance
 */
export function createSessionManager(config: PluginConfig): ClaudeCodeSessionManager {
  return new ClaudeCodeSessionManager(config);
}
