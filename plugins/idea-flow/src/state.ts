/**
 * State management for Idea Flow plugin
 * Handles persistent state across sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  PluginState,
  Idea,
  IdeaStatus,
  Notification,
  NotificationType,
  ClarificationEntry,
  SessionRecord,
  ImplementationPlan,
  GitHubArtifacts,
} from './types.js';

export class StateManager {
  private statePath: string;
  private stateFilePath: string;
  private state: PluginState;

  constructor(statePath: string) {
    // Expand ~ to home directory
    this.statePath = statePath.replace(/^~/, process.env.HOME || '');
    this.stateFilePath = path.join(this.statePath, 'state.json');
    this.state = this.loadState();
  }

  private getDefaultState(): PluginState {
    return {
      ideas: {},
      notifications: [],
      lastUpdatedAt: null,
    };
  }

  private loadState(): PluginState {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.statePath)) {
        fs.mkdirSync(this.statePath, { recursive: true });
      }

      if (fs.existsSync(this.stateFilePath)) {
        const content = fs.readFileSync(this.stateFilePath, 'utf-8');
        const parsed = JSON.parse(content) as Partial<PluginState>;

        // Merge with defaults to ensure all fields exist
        return {
          ...this.getDefaultState(),
          ...parsed,
        };
      }
    } catch (error) {
      console.error('Error loading state file:', error);
    }

    return this.getDefaultState();
  }

  private saveState(): void {
    try {
      // Ensure directory exists
      if (!fs.existsSync(this.statePath)) {
        fs.mkdirSync(this.statePath, { recursive: true });
      }

      this.state.lastUpdatedAt = new Date().toISOString();

      fs.writeFileSync(
        this.stateFilePath,
        JSON.stringify(this.state, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving state file:', error);
      throw error;
    }
  }

  // ============================================================================
  // Idea Management
  // ============================================================================

  getIdea(ideaId: string): Idea | null {
    return this.state.ideas[ideaId] ?? null;
  }

  getAllIdeas(): Idea[] {
    return Object.values(this.state.ideas);
  }

  getIdeasByStatus(status: IdeaStatus): Idea[] {
    return this.getAllIdeas().filter(idea => idea.status === status);
  }

  saveIdea(idea: Idea): void {
    idea.updatedAt = new Date().toISOString();
    this.state.ideas[idea.id] = idea;
    this.saveState();
  }

  deleteIdea(ideaId: string): boolean {
    if (this.state.ideas[ideaId]) {
      delete this.state.ideas[ideaId];
      this.saveState();
      return true;
    }
    return false;
  }

  createIdea(
    id: string,
    title: string,
    description: string,
    repo: string
  ): Idea {
    const now = new Date().toISOString();
    const idea: Idea = {
      id,
      title,
      description,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      clarificationHistory: [],
      github: { repo },
      sessions: [],
    };
    this.saveIdea(idea);
    return idea;
  }

  updateIdeaStatus(ideaId: string, status: IdeaStatus): void {
    const idea = this.getIdea(ideaId);
    if (idea) {
      idea.status = status;
      this.saveIdea(idea);
    }
  }

  // ============================================================================
  // Clarification Management
  // ============================================================================

  addClarification(
    ideaId: string,
    question: string,
    answer: string,
    updateDescription: boolean = true
  ): void {
    const idea = this.getIdea(ideaId);
    if (!idea) return;

    idea.clarificationHistory.push({
      question,
      answer,
      askedAt: new Date().toISOString(),
    });

    if (updateDescription) {
      idea.description = `${idea.description}\n\n**Clarification**: ${question}\n${answer}`;
    }

    idea.status = 'clarifying';
    this.saveIdea(idea);
  }

  // ============================================================================
  // GitHub Artifacts Management
  // ============================================================================

  updateGitHubArtifacts(ideaId: string, artifacts: Partial<GitHubArtifacts>): void {
    const idea = this.getIdea(ideaId);
    if (!idea) return;

    idea.github = {
      ...idea.github,
      ...artifacts,
    } as GitHubArtifacts;
    this.saveIdea(idea);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  addSession(ideaId: string, session: SessionRecord): void {
    const idea = this.getIdea(ideaId);
    if (!idea) return;

    idea.sessions.push(session);
    this.saveIdea(idea);
  }

  updateSessionStatus(
    ideaId: string,
    sessionId: string,
    status: SessionRecord['status'],
    error?: string
  ): void {
    const idea = this.getIdea(ideaId);
    if (!idea) return;

    const session = idea.sessions.find(s => s.sessionId === sessionId);
    if (session) {
      session.status = status;
      session.completedAt = new Date().toISOString();
      if (error) {
        session.error = error;
      }
      this.saveIdea(idea);
    }
  }

  getLastSession(ideaId: string, purpose?: SessionRecord['purpose']): SessionRecord | null {
    const idea = this.getIdea(ideaId);
    if (!idea) return null;

    const sessions = purpose
      ? idea.sessions.filter(s => s.purpose === purpose)
      : idea.sessions;

    return sessions[sessions.length - 1] ?? null;
  }

  // ============================================================================
  // Plan Management
  // ============================================================================

  updatePlan(ideaId: string, plan: ImplementationPlan): void {
    const idea = this.getIdea(ideaId);
    if (!idea) return;

    idea.plan = plan;
    this.saveIdea(idea);
  }

  // ============================================================================
  // Notification Management
  // ============================================================================

  addNotification(
    type: NotificationType,
    ideaId: string,
    title: string,
    message: string,
    extras?: {
      issueUrl?: string;
      prUrl?: string;
      commentUrl?: string;
      error?: string;
    }
  ): Notification {
    const notification: Notification = {
      id: this.generateId(),
      type,
      ideaId,
      title,
      message,
      createdAt: new Date().toISOString(),
      read: false,
      ...extras,
    };

    this.state.notifications.push(notification);
    this.saveState();
    return notification;
  }

  getUnreadNotifications(): Notification[] {
    return this.state.notifications.filter(n => !n.read);
  }

  getNotificationsForIdea(ideaId: string): Notification[] {
    return this.state.notifications.filter(n => n.ideaId === ideaId);
  }

  markNotificationRead(notificationId: string): void {
    const notification = this.state.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      this.saveState();
    }
  }

  markAllNotificationsRead(ideaId?: string): void {
    for (const notification of this.state.notifications) {
      if (!ideaId || notification.ideaId === ideaId) {
        notification.read = true;
      }
    }
    this.saveState();
  }

  clearNotifications(ideaId?: string): void {
    if (ideaId) {
      this.state.notifications = this.state.notifications.filter(
        n => n.ideaId !== ideaId
      );
    } else {
      this.state.notifications = [];
    }
    this.saveState();
  }

  // ============================================================================
  // Utility
  // ============================================================================

  generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }

  getFullState(): PluginState {
    return { ...this.state };
  }

  resetState(): void {
    this.state = this.getDefaultState();
    this.saveState();
  }
}

/**
 * Create a state manager instance
 */
export function createStateManager(statePath: string = '~/.idea-flow'): StateManager {
  return new StateManager(statePath);
}
