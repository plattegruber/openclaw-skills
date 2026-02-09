import type { OAuthTokens, TokenRefreshResponse } from "./types.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes early

export class OAuthError extends Error {
  constructor(
    message: string,
    public errorCode: string,
    public requiresReauth: boolean = false
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

export interface OAuthManagerConfig {
  clientId: string;
  clientSecret: string;
  initialTokens?: OAuthTokens;
  onTokensUpdated?: (tokens: OAuthTokens) => void;
}

export class OAuthManager {
  private clientId: string;
  private clientSecret: string;
  private tokens: OAuthTokens | null = null;
  private onTokensUpdated?: (tokens: OAuthTokens) => void;
  private refreshPromise: Promise<void> | null = null;

  constructor(config: OAuthManagerConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokens = config.initialTokens || null;
    this.onTokensUpdated = config.onTokensUpdated;
  }

  async initializeWithRefreshToken(refreshToken: string): Promise<OAuthTokens> {
    const tokens = await this.refreshAccessToken(refreshToken);
    this.tokens = tokens;
    this.onTokensUpdated?.(tokens);
    return tokens;
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      throw new OAuthError(
        "No OAuth tokens available. Plugin needs to be configured with a refresh token.",
        "no_tokens",
        true
      );
    }

    if (this.isTokenExpired()) {
      await this.refresh();
    }

    return this.tokens.accessToken;
  }

  private isTokenExpired(): boolean {
    if (!this.tokens) return true;
    return Date.now() >= this.tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  private async refresh(): Promise<void> {
    // Avoid concurrent refresh requests
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.doRefresh();
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<void> {
    if (!this.tokens?.refreshToken) {
      throw new OAuthError(
        "No refresh token available. Re-authorization required.",
        "no_refresh_token",
        true
      );
    }

    const newTokens = await this.refreshAccessToken(this.tokens.refreshToken);
    this.tokens = newTokens;
    this.onTokensUpdated?.(newTokens);
  }

  private async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      let errorData: { error?: string; error_description?: string } = {};
      try {
        errorData = (await response.json()) as {
          error?: string;
          error_description?: string;
        };
      } catch {
        errorData = { error: "unknown", error_description: response.statusText };
      }

      if (errorData.error === "invalid_grant") {
        throw new OAuthError(
          "Refresh token is invalid or expired. User needs to re-authorize the application.",
          "invalid_grant",
          true
        );
      }

      throw new OAuthError(
        errorData.error_description ||
          `Token refresh failed: ${response.status}`,
        errorData.error || "token_refresh_failed"
      );
    }

    const data = (await response.json()) as TokenRefreshResponse;

    return {
      accessToken: data.access_token,
      refreshToken: refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  getTokens(): OAuthTokens | null {
    return this.tokens;
  }

  setTokens(tokens: OAuthTokens): void {
    this.tokens = tokens;
  }

  hasValidTokens(): boolean {
    return this.tokens !== null && !this.isTokenExpired();
  }
}
