/**
 * Notification management for Idea Flow plugin
 * Handles user notifications when Claude Code tasks complete
 */

import type {
  PluginConfig,
  Notification,
  NotificationType,
} from './types.js';
import type { StateManager } from './state.js';

export interface NotificationPayload {
  type: NotificationType;
  ideaId: string;
  title: string;
  message: string;
  issueUrl?: string;
  prUrl?: string;
  commentUrl?: string;
  error?: string;
}

export class NotificationManager {
  private config: PluginConfig;
  private state: StateManager;

  constructor(config: PluginConfig, state: StateManager) {
    this.config = config;
    this.state = state;
  }

  /**
   * Send a notification to the user
   */
  async notify(payload: NotificationPayload): Promise<Notification> {
    // Store notification in state
    const notification = this.state.addNotification(
      payload.type,
      payload.ideaId,
      payload.title,
      payload.message,
      {
        issueUrl: payload.issueUrl,
        prUrl: payload.prUrl,
        commentUrl: payload.commentUrl,
        error: payload.error,
      }
    );

    // If auto-notify is enabled, log for immediate delivery
    // In a real implementation, this would trigger OpenClaw's notification system
    if (this.config.autoNotify) {
      console.log(`[NOTIFICATION] ${payload.type}: ${payload.message}`);
    }

    return notification;
  }

  /**
   * Create notification for issue creation
   */
  async notifyIssueCreated(
    ideaId: string,
    title: string,
    issueUrl: string
  ): Promise<Notification> {
    return this.notify({
      type: 'issue_created',
      ideaId,
      title,
      message: `GitHub issue created for "${title}".\n\nReview at: ${issueUrl}\n\nYou can now:\n- Plan: "plan the implementation"\n- Implement: "implement this idea"\n- Modify: "change the issue to..."\n- Delete: "delete this idea"`,
      issueUrl,
    });
  }

  /**
   * Create notification for plan completion
   */
  async notifyPlanReady(
    ideaId: string,
    title: string,
    issueUrl: string,
    commentUrl: string
  ): Promise<Notification> {
    return this.notify({
      type: 'plan_ready',
      ideaId,
      title,
      message: `Implementation plan ready for "${title}".\n\nPlan posted at: ${commentUrl}\n\nTo proceed, say "implement this idea" or request modifications.`,
      issueUrl,
      commentUrl,
    });
  }

  /**
   * Create notification for implementation completion
   */
  async notifyImplementationReady(
    ideaId: string,
    title: string,
    prUrl: string
  ): Promise<Notification> {
    return this.notify({
      type: 'implementation_ready',
      ideaId,
      title,
      message: `Implementation complete for "${title}"!\n\nPull Request: ${prUrl}\n\nReview the PR and request modifications if needed.`,
      prUrl,
    });
  }

  /**
   * Create notification for modification completion
   */
  async notifyModificationComplete(
    ideaId: string,
    title: string,
    target: 'issue' | 'plan' | 'implementation'
  ): Promise<Notification> {
    return this.notify({
      type: 'modification_complete',
      ideaId,
      title,
      message: `Modifications applied to ${target} for "${title}".`,
    });
  }

  /**
   * Create notification for errors
   */
  async notifyError(
    ideaId: string,
    title: string,
    error: string
  ): Promise<Notification> {
    return this.notify({
      type: 'error',
      ideaId,
      title,
      message: `Error processing "${title}": ${error}`,
      error,
    });
  }

  /**
   * Get all unread notifications
   */
  getUnread(): Notification[] {
    return this.state.getUnreadNotifications();
  }

  /**
   * Get notifications for a specific idea
   */
  getForIdea(ideaId: string): Notification[] {
    return this.state.getNotificationsForIdea(ideaId);
  }

  /**
   * Mark notification as read
   */
  markRead(notificationId: string): void {
    this.state.markNotificationRead(notificationId);
  }

  /**
   * Mark all notifications as read
   */
  markAllRead(ideaId?: string): void {
    this.state.markAllNotificationsRead(ideaId);
  }

  /**
   * Clear notifications
   */
  clear(ideaId?: string): void {
    this.state.clearNotifications(ideaId);
  }

  /**
   * Format notifications for display
   */
  formatNotifications(notifications: Notification[]): string {
    if (notifications.length === 0) {
      return 'No notifications.';
    }

    return notifications
      .map((n, i) => {
        const icon = this.getNotificationIcon(n.type);
        const readStatus = n.read ? '' : ' [NEW]';
        return `${i + 1}. ${icon} ${n.title}${readStatus}\n   ${n.message.split('\n')[0]}`;
      })
      .join('\n\n');
  }

  private getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'issue_created':
        return '[Issue]';
      case 'plan_ready':
        return '[Plan]';
      case 'implementation_ready':
        return '[PR]';
      case 'modification_complete':
        return '[Modified]';
      case 'error':
        return '[Error]';
      default:
        return '[Info]';
    }
  }
}

/**
 * Create a notification manager instance
 */
export function createNotificationManager(
  config: PluginConfig,
  state: StateManager
): NotificationManager {
  return new NotificationManager(config, state);
}
