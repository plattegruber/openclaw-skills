import type {
  CalendarListResponse,
  EventsListResponse,
  Event,
  FreeBusyResponse,
  GoogleApiError,
} from "./types.js";
import { OAuthManager, OAuthError } from "./oauth.js";

const BASE_URL = "https://www.googleapis.com/calendar/v3";

export class GoogleCalendarError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public reason?: string,
    public isRetryable: boolean = false
  ) {
    super(message);
    this.name = "GoogleCalendarError";
  }
}

export interface ListEventsParams {
  calendarId: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  q?: string;
  singleEvents?: boolean;
  orderBy?: "startTime" | "updated";
  showDeleted?: boolean;
  pageToken?: string;
}

export interface FreeBusyParams {
  timeMin: string;
  timeMax: string;
  calendarIds: string[];
}

export class GoogleCalendarClient {
  private oauthManager: OAuthManager;
  private lastRateLimitRemaining: number | null = null;

  constructor(oauthManager: OAuthManager) {
    this.oauthManager = oauthManager;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown
  ): Promise<T> {
    const accessToken = await this.oauthManager.getAccessToken();

    const url = new URL(`${BASE_URL}${endpoint}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Track rate limits
    const rateLimitRemaining = response.headers.get("X-RateLimit-Remaining");
    if (rateLimitRemaining) {
      this.lastRateLimitRemaining = parseInt(rateLimitRemaining, 10);
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    return (await response.json()) as T;
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorData: GoogleApiError | undefined;
    try {
      errorData = (await response.json()) as GoogleApiError;
    } catch {
      // Ignore JSON parse errors
    }

    const message = errorData?.error?.message || `HTTP ${response.status}`;
    const reason = errorData?.error?.errors?.[0]?.reason;

    if (response.status === 401) {
      throw new OAuthError(
        "Authentication failed. Token may have been revoked.",
        "unauthorized",
        true
      );
    }

    if (response.status === 403) {
      if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
        throw new GoogleCalendarError(
          "Google Calendar API rate limit exceeded. Please wait before making more requests.",
          403,
          reason,
          true
        );
      }
      throw new GoogleCalendarError(
        `Access forbidden: ${message}`,
        403,
        reason
      );
    }

    if (response.status === 404) {
      throw new GoogleCalendarError(
        `Not found: ${message}`,
        404,
        reason
      );
    }

    if (response.status === 429) {
      throw new GoogleCalendarError(
        "Too many requests. Please wait before making more requests.",
        429,
        "rateLimitExceeded",
        true
      );
    }

    if (response.status >= 500) {
      throw new GoogleCalendarError(
        `Server error: ${message}`,
        response.status,
        reason,
        true
      );
    }

    throw new GoogleCalendarError(message, response.status, reason);
  }

  // Calendar List Operations

  async getCalendarList(showHidden?: boolean): Promise<CalendarListResponse> {
    const params: Record<string, string | boolean | undefined> = {};
    if (showHidden !== undefined) {
      params.showHidden = showHidden;
    }
    return this.request<CalendarListResponse>("GET", "/users/me/calendarList", params);
  }

  async getCalendar(calendarId: string): Promise<CalendarListResponse["items"][0]> {
    const encodedId = encodeURIComponent(calendarId);
    return this.request("GET", `/users/me/calendarList/${encodedId}`);
  }

  // Event Operations

  async listEvents(params: ListEventsParams): Promise<EventsListResponse> {
    const encodedCalendarId = encodeURIComponent(params.calendarId);
    const queryParams: Record<string, string | number | boolean | undefined> = {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults,
      q: params.q,
      singleEvents: params.singleEvents,
      orderBy: params.orderBy,
      showDeleted: params.showDeleted,
      pageToken: params.pageToken,
    };

    return this.request<EventsListResponse>(
      "GET",
      `/calendars/${encodedCalendarId}/events`,
      queryParams
    );
  }

  async getEvent(calendarId: string, eventId: string): Promise<Event> {
    const encodedCalendarId = encodeURIComponent(calendarId);
    const encodedEventId = encodeURIComponent(eventId);
    return this.request<Event>(
      "GET",
      `/calendars/${encodedCalendarId}/events/${encodedEventId}`
    );
  }

  async listAllEvents(params: ListEventsParams): Promise<Event[]> {
    const allEvents: Event[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.listEvents({
        ...params,
        pageToken,
      });

      allEvents.push(...response.items);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return allEvents;
  }

  // FreeBusy Operations

  async getFreeBusy(params: FreeBusyParams): Promise<FreeBusyResponse> {
    const body = {
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      items: params.calendarIds.map((id) => ({ id })),
    };

    return this.request<FreeBusyResponse>("POST", "/freeBusy", undefined, body);
  }

  // Utility Methods

  getRateLimitRemaining(): number | null {
    return this.lastRateLimitRemaining;
  }
}
