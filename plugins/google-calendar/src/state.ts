import * as fs from "node:fs";
import * as path from "node:path";
import type { PluginState, SelectedCalendar, OAuthTokens } from "./types.js";

export class StateManager {
  private statePath: string;
  private stateFilePath: string;
  private state: PluginState;

  constructor(statePath: string) {
    // Expand ~ to home directory
    this.statePath = statePath.replace(/^~/, process.env.HOME || "");
    this.stateFilePath = path.join(this.statePath, "state.json");
    this.state = this.loadState();
  }

  private getDefaultState(): PluginState {
    return {
      selectedCalendar: null,
      syncTokens: {},
      lastSyncAt: null,
      oauthTokens: null,
    };
  }

  private loadState(): PluginState {
    try {
      if (!fs.existsSync(this.statePath)) {
        fs.mkdirSync(this.statePath, { recursive: true });
      }
      if (fs.existsSync(this.stateFilePath)) {
        const content = fs.readFileSync(this.stateFilePath, "utf-8");
        const parsed = JSON.parse(content) as Partial<PluginState>;
        return { ...this.getDefaultState(), ...parsed };
      }
    } catch (error) {
      console.error("Failed to load state:", error);
    }
    return this.getDefaultState();
  }

  private saveState(): void {
    try {
      fs.mkdirSync(this.statePath, { recursive: true });
      fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error("Failed to save state:", error);
    }
  }

  // Selected Calendar
  getSelectedCalendar(): SelectedCalendar | null {
    return this.state.selectedCalendar;
  }

  setSelectedCalendar(id: string, summary: string): void {
    this.state.selectedCalendar = {
      id,
      summary,
      selectedAt: new Date().toISOString(),
    };
    this.saveState();
  }

  clearSelectedCalendar(): void {
    this.state.selectedCalendar = null;
    this.saveState();
  }

  // OAuth Tokens
  getOAuthTokens(): OAuthTokens | null {
    return this.state.oauthTokens;
  }

  setOAuthTokens(tokens: OAuthTokens): void {
    this.state.oauthTokens = tokens;
    this.saveState();
  }

  clearOAuthTokens(): void {
    this.state.oauthTokens = null;
    this.saveState();
  }

  // Sync Tokens
  getSyncToken(calendarId: string): string | undefined {
    return this.state.syncTokens[calendarId];
  }

  setSyncToken(calendarId: string, token: string): void {
    this.state.syncTokens[calendarId] = token;
    this.saveState();
  }

  // Last Sync
  getLastSyncAt(): string | null {
    return this.state.lastSyncAt;
  }

  setLastSyncAt(timestamp: string): void {
    this.state.lastSyncAt = timestamp;
    this.saveState();
  }

  // Full state access
  getState(): PluginState {
    return { ...this.state };
  }
}
