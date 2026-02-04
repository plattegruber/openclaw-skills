/**
 * State file management for YNAB plugin
 * Handles persistent state across sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  PluginState,
  PendingReviewItem,
  SelectedBudget,
  ReviewReason,
} from './types';

const MAX_SEEN_TRANSACTIONS = 10000;

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
      lastSyncAt: null,
      seenTransactionIds: [],
      pendingReview: [],
      lastReviewPromptAt: null,
      selectedBudget: null,
      serverKnowledge: {},
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
  // Budget Selection
  // ============================================================================

  getSelectedBudget(): SelectedBudget | null {
    return this.state.selectedBudget;
  }

  setSelectedBudget(budgetId: string, budgetName: string): void {
    this.state.selectedBudget = {
      id: budgetId,
      name: budgetName,
      selectedAt: new Date().toISOString(),
    };
    this.saveState();
  }

  clearSelectedBudget(): void {
    this.state.selectedBudget = null;
    this.saveState();
  }

  // ============================================================================
  // Sync State
  // ============================================================================

  getLastSyncAt(): string | null {
    return this.state.lastSyncAt;
  }

  updateLastSyncAt(): void {
    this.state.lastSyncAt = new Date().toISOString();
    this.saveState();
  }

  getServerKnowledge(endpoint: string): number | undefined {
    return this.state.serverKnowledge[endpoint];
  }

  setServerKnowledge(endpoint: string, knowledge: number): void {
    this.state.serverKnowledge[endpoint] = knowledge;
    this.saveState();
  }

  // ============================================================================
  // Seen Transactions (for detecting new transactions)
  // ============================================================================

  hasSeenTransaction(transactionId: string): boolean {
    return this.state.seenTransactionIds.includes(transactionId);
  }

  markTransactionsSeen(transactionIds: string[]): void {
    const existingSet = new Set(this.state.seenTransactionIds);
    for (const id of transactionIds) {
      existingSet.add(id);
    }

    // Keep bounded to MAX_SEEN_TRANSACTIONS (FIFO)
    const allIds = Array.from(existingSet);
    if (allIds.length > MAX_SEEN_TRANSACTIONS) {
      this.state.seenTransactionIds = allIds.slice(-MAX_SEEN_TRANSACTIONS);
    } else {
      this.state.seenTransactionIds = allIds;
    }

    this.saveState();
  }

  clearSeenTransactions(): void {
    this.state.seenTransactionIds = [];
    this.saveState();
  }

  // ============================================================================
  // Pending Review Queue
  // ============================================================================

  getPendingReview(): PendingReviewItem[] {
    return this.state.pendingReview;
  }

  addToPendingReview(
    transactionId: string,
    reason: ReviewReason,
    suggestedCategoryId?: string
  ): void {
    // Don't add duplicates
    if (this.state.pendingReview.some(item => item.transactionId === transactionId)) {
      return;
    }

    this.state.pendingReview.push({
      transactionId,
      reason,
      addedAt: new Date().toISOString(),
      suggestedCategoryId,
    });
    this.saveState();
  }

  removeFromPendingReview(transactionId: string): void {
    this.state.pendingReview = this.state.pendingReview.filter(
      item => item.transactionId !== transactionId
    );
    this.saveState();
  }

  clearPendingReview(): void {
    this.state.pendingReview = [];
    this.saveState();
  }

  // ============================================================================
  // Review Prompts
  // ============================================================================

  getLastReviewPromptAt(): string | null {
    return this.state.lastReviewPromptAt;
  }

  updateLastReviewPromptAt(): void {
    this.state.lastReviewPromptAt = new Date().toISOString();
    this.saveState();
  }

  // ============================================================================
  // Full State Access (for debugging)
  // ============================================================================

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
export function createStateManager(statePath: string = '~/.ynab-logs'): StateManager {
  return new StateManager(statePath);
}
