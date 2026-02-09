// ============================================================================
// Configuration Types
// ============================================================================

export interface PluginConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  defaultCalendarId?: string;
  statePath?: string;
  defaultTimeZone?: string;
  defaultLookAheadDays?: number;
}

// ============================================================================
// OAuth Types
// ============================================================================

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
}

export interface TokenRefreshResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// ============================================================================
// Google Calendar API Response Types
// ============================================================================

export interface CalendarListResponse {
  kind: "calendar#calendarList";
  etag: string;
  nextPageToken?: string;
  nextSyncToken?: string;
  items: CalendarListEntry[];
}

export interface EventsListResponse {
  kind: "calendar#events";
  etag: string;
  summary: string;
  description?: string;
  updated: string;
  timeZone: string;
  accessRole: AccessRole;
  nextPageToken?: string;
  nextSyncToken?: string;
  items: Event[];
}

export interface FreeBusyResponse {
  kind: "calendar#freeBusy";
  timeMin: string;
  timeMax: string;
  calendars: Record<string, FreeBusyCalendar>;
}

// ============================================================================
// Calendar Types
// ============================================================================

export interface CalendarListEntry {
  kind: "calendar#calendarListEntry";
  etag: string;
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone: string;
  summaryOverride?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  hidden?: boolean;
  selected?: boolean;
  accessRole: AccessRole;
  defaultReminders: Reminder[];
  notificationSettings?: NotificationSettings;
  primary?: boolean;
  deleted?: boolean;
  conferenceProperties?: ConferenceProperties;
}

export type AccessRole = "freeBusyReader" | "reader" | "writer" | "owner";

export interface Reminder {
  method: "email" | "popup";
  minutes: number;
}

export interface NotificationSettings {
  notifications: Notification[];
}

export interface Notification {
  type: "eventCreation" | "eventChange" | "eventCancellation" | "eventResponse" | "agenda";
  method: "email";
}

export interface ConferenceProperties {
  allowedConferenceSolutionTypes: string[];
}

// ============================================================================
// Event Types
// ============================================================================

export interface Event {
  kind: "calendar#event";
  etag: string;
  id: string;
  status: EventStatus;
  htmlLink: string;
  created: string;
  updated: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  creator: EventPerson;
  organizer: EventPerson;
  start: EventDateTime;
  end: EventDateTime;
  endTimeUnspecified?: boolean;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: EventDateTime;
  transparency?: "opaque" | "transparent";
  visibility?: "default" | "public" | "private" | "confidential";
  attendees?: Attendee[];
  attendeesOmitted?: boolean;
  hangoutLink?: string;
  conferenceData?: ConferenceData;
  reminders?: {
    useDefault: boolean;
    overrides?: Reminder[];
  };
  attachments?: Attachment[];
  iCalUID: string;
  sequence: number;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  privateCopy?: boolean;
  locked?: boolean;
  eventType?: EventType;
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  source?: {
    url: string;
    title: string;
  };
}

export type EventStatus = "confirmed" | "tentative" | "cancelled";

export type EventType = "default" | "outOfOffice" | "focusTime" | "workingLocation";

export interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface EventPerson {
  id?: string;
  email?: string;
  displayName?: string;
  self?: boolean;
}

export interface Attendee {
  id?: string;
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  optional?: boolean;
  responseStatus: ResponseStatus;
  comment?: string;
  additionalGuests?: number;
}

export type ResponseStatus = "needsAction" | "declined" | "tentative" | "accepted";

export interface ConferenceData {
  createRequest?: {
    requestId: string;
    conferenceSolutionKey: { type: string };
    status: { statusCode: string };
  };
  entryPoints?: ConferenceEntryPoint[];
  conferenceSolution?: {
    key: { type: string };
    name: string;
    iconUri: string;
  };
  conferenceId?: string;
  signature?: string;
  notes?: string;
}

export interface ConferenceEntryPoint {
  entryPointType: "video" | "phone" | "sip" | "more";
  uri: string;
  label?: string;
  pin?: string;
  accessCode?: string;
  meetingCode?: string;
  passcode?: string;
  password?: string;
}

export interface Attachment {
  fileUrl: string;
  title: string;
  mimeType: string;
  iconLink: string;
  fileId?: string;
}

// ============================================================================
// FreeBusy Types
// ============================================================================

export interface FreeBusyCalendar {
  errors?: FreeBusyError[];
  busy: TimePeriod[];
}

export interface FreeBusyError {
  domain: string;
  reason: string;
}

export interface TimePeriod {
  start: string;
  end: string;
}

// ============================================================================
// API Error Types
// ============================================================================

export interface GoogleApiError {
  error: {
    code: number;
    message: string;
    errors: Array<{
      domain: string;
      reason: string;
      message: string;
      locationType?: string;
      location?: string;
    }>;
    status?: string;
  };
}

// ============================================================================
// State Types
// ============================================================================

export interface PluginState {
  selectedCalendar: SelectedCalendar | null;
  syncTokens: Record<string, string>;
  lastSyncAt: string | null;
  oauthTokens: OAuthTokens | null;
}

export interface SelectedCalendar {
  id: string;
  summary: string;
  selectedAt: string;
}

// ============================================================================
// Tool Output Types
// ============================================================================

export interface CalendarSummary {
  id: string;
  name: string;
  description?: string;
  timeZone: string;
  isPrimary: boolean;
  accessRole: AccessRole;
  color?: string;
}

export interface EventSummary {
  id: string;
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  status: EventStatus;
  organizer?: string;
  attendeeCount: number;
  myResponseStatus?: ResponseStatus;
  hasVideoConference: boolean;
  videoConferenceUrl?: string;
  recurringEventId?: string;
  eventType?: EventType;
}

export interface EventDetail extends EventSummary {
  htmlLink: string;
  created: string;
  updated: string;
  attendees: AttendeeSummary[];
  reminders: Reminder[];
  attachments: AttachmentSummary[];
  recurrenceRules?: string[];
  visibility?: string;
  transparency?: string;
}

export interface AttendeeSummary {
  email: string;
  name?: string;
  responseStatus: ResponseStatus;
  isOrganizer: boolean;
  isOptional: boolean;
  isSelf: boolean;
}

export interface AttachmentSummary {
  title: string;
  url: string;
  mimeType: string;
}

export interface BusySlot {
  start: string;
  end: string;
  calendarId: string;
}

export interface FreeSlot {
  start: string;
  end: string;
  durationMinutes: number;
  durationFormatted: string;
}

export interface CalendarAvailability {
  calendarId: string;
  calendarName?: string;
  busyPeriods: TimePeriod[];
  errors?: string[];
}
