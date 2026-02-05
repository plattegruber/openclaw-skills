/**
 * Claude Code Session Manager
 * Manages Claude Code sessions via CLI subprocess for issue creation, planning, and implementation
 */

import { spawn, type ChildProcess } from 'child_process';
import type {
  PluginConfig,
  SessionPurpose,
  SessionParams,
  SessionStartResult,
  SessionResumeResult,
  StreamMessage,
} from '../types.js';

export interface ClaudeSessionOptions {
  model?: 'opus' | 'sonnet' | 'haiku';
  maxTurns?: number;
  allowedTools?: string[];
  resume?: string;
  verbose?: boolean;
}

/**
 * Manages Claude Code sessions via CLI subprocess
 *
 * Uses the claude CLI with --print --output-format stream-json flags
 * to programmatically control Claude Code sessions.
 */
export class ClaudeCodeSessionManager {
  private config: PluginConfig;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  /**
   * Start a Claude Code session for a specific purpose
   */
  async startSession(
    purpose: SessionPurpose,
    params: SessionParams
  ): Promise<SessionStartResult> {
    const prompt = this.buildPrompt(purpose, params);
    const allowedTools = this.getToolsForPurpose(purpose);

    const options: ClaudeSessionOptions = {
      model: 'sonnet',
      allowedTools,
      verbose: true,
    };

    const messages = await this.runClaudeSession(prompt, options);

    // Extract session ID from system message
    const systemMessage = messages.find(
      (m) => m.type === 'system' && m.subtype === 'init'
    );
    const sessionId = systemMessage?.session_id || this.generateSessionId();

    return {
      sessionId,
      claudeCodeUrl: `https://claude.ai/code/session_${sessionId}`,
      messages,
    };
  }

  /**
   * Resume an existing session to continue work
   */
  async resumeSession(
    sessionId: string,
    additionalPrompt: string,
    _fork: boolean = false
  ): Promise<SessionResumeResult> {
    const options: ClaudeSessionOptions = {
      model: 'sonnet',
      resume: sessionId,
      verbose: true,
    };

    const messages = await this.runClaudeSession(additionalPrompt, options);

    // Check if we got a new session ID (forked)
    const systemMessage = messages.find(
      (m) => m.type === 'system' && m.subtype === 'init'
    );
    const newSessionId = systemMessage?.session_id || sessionId;

    return {
      sessionId: newSessionId,
      messages,
    };
  }

  /**
   * Run a Claude CLI session and collect all messages
   */
  private runClaudeSession(
    prompt: string,
    options: ClaudeSessionOptions
  ): Promise<StreamMessage[]> {
    return new Promise((resolve, reject) => {
      const args = this.buildCliArgs(prompt, options);
      const messages: StreamMessage[] = [];

      let proc: ChildProcess;
      try {
        proc = spawn('claude', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });
      } catch (error) {
        reject(new Error(`Failed to spawn claude CLI: ${error}`));
        return;
      }

      let buffer = '';

      proc.stdout?.on('data', (data: Buffer) => {
        buffer += data.toString();

        // Parse newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line) as StreamMessage;
              messages.push(message);
            } catch {
              // Non-JSON output, log for debugging
              console.error('[claude-session] Non-JSON output:', line.substring(0, 100));
            }
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const stderr = data.toString();
        // Claude CLI outputs progress to stderr, which is fine
        if (!stderr.includes('Error') && !stderr.includes('error')) {
          console.log('[claude-session] Progress:', stderr.trim());
        } else {
          console.error('[claude-session] Error:', stderr);
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Claude CLI error: ${error.message}`));
      });

      proc.on('close', (code) => {
        // Process any remaining buffer
        if (buffer.trim()) {
          try {
            const message = JSON.parse(buffer) as StreamMessage;
            messages.push(message);
          } catch {
            // Ignore incomplete JSON
          }
        }

        if (code === 0 || messages.length > 0) {
          resolve(messages);
        } else {
          reject(new Error(`Claude CLI exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Build CLI arguments for the claude command
   */
  private buildCliArgs(prompt: string, options: ClaudeSessionOptions): string[] {
    const args: string[] = [
      '--print',
      '--output-format', 'stream-json',
    ];

    if (options.verbose) {
      args.push('--verbose');
    }

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.maxTurns) {
      args.push('--max-turns', options.maxTurns.toString());
    }

    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', options.allowedTools.join(','));
    }

    if (options.resume) {
      args.push('--resume', options.resume);
    }

    // Add the prompt as positional argument
    args.push('--', prompt);

    return args;
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
        return [...baseTools, 'Task']; // Add Task for Plan agent
      case 'implementation':
      case 'modification':
        return [...baseTools, 'Edit', 'Write', 'Task']; // Full write access
    }
  }

  /**
   * Generate a unique session ID (fallback if not provided by CLI)
   */
  private generateSessionId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 9)}`;
  }
}

/**
 * Create a session manager instance
 */
export function createSessionManager(config: PluginConfig): ClaudeCodeSessionManager {
  return new ClaudeCodeSessionManager(config);
}
