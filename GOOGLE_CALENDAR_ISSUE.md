# Add Google Calendar OpenClaw Skill

## Overview

Create a new OpenClaw skill/plugin to integrate with Google Calendar, enabling AI-assisted calendar management, event scheduling, and time analysis.

## Motivation

Google Calendar is one of the most widely used productivity tools. An OpenClaw skill would enable users to:
- Query their schedule using natural language
- Create and manage events through conversation
- Find optimal meeting times
- Get intelligent scheduling suggestions
- Analyze time usage patterns

## Proposed Architecture

Following the established plugin pattern from `ynab-budget-manager`:

```
plugins/
└── google-calendar/
    ├── openclaw.plugin.json     # Plugin manifest & config schema
    ├── package.json
    ├── tsconfig.json
    ├── index.ts                 # Plugin entry point
    ├── src/
    │   ├── types.ts             # TypeScript interfaces
    │   ├── client.ts            # Google Calendar API client
    │   ├── state.ts             # State management
    │   ├── scheduling.ts        # Time slot analysis logic
    │   └── utils/
    │       └── datetime.ts      # Date/time utilities
    └── skills/
        └── google-calendar/
            └── SKILL.md         # Skill documentation
```

## Configuration Schema

```json
{
  "id": "google-calendar",
  "configSchema": {
    "type": "object",
    "properties": {
      "googleCredentials": {
        "type": "string",
        "sensitive": true,
        "description": "Google OAuth2 credentials JSON or API key"
      },
      "defaultCalendarId": {
        "type": "string",
        "default": "primary",
        "description": "Default calendar to use when none specified"
      },
      "writeToolsEnabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable event creation/modification tools"
      },
      "escapeHatchEnabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable raw Google Calendar API access"
      },
      "statePath": {
        "type": "string",
        "default": "~/.google-calendar-logs",
        "description": "Directory for state and logs"
      }
    },
    "required": ["googleCredentials"]
  }
}
```

## Proposed Tools

### Read Tools (Always Available)

| Tool | Description |
|------|-------------|
| `gcal_list_calendars` | List all calendars the user has access to |
| `gcal_get_events` | Get events within a date range (default: today + 7 days) |
| `gcal_get_event_details` | Get full details of a specific event |
| `gcal_search_events` | Search events by text query |
| `gcal_find_free_time` | Find available time slots within a date range |
| `gcal_get_busy_times` | Get busy/free information for scheduling |

### Write Tools (Opt-in, Dry-Run by Default)

| Tool | Description |
|------|-------------|
| `gcal_create_event` | Create a new calendar event |
| `gcal_update_event` | Update an existing event |
| `gcal_delete_event` | Delete an event (with confirmation) |
| `gcal_rsvp_event` | Respond to an event invitation |
| `gcal_add_attendees` | Add attendees to an event |

### Escape Hatch (Opt-in)

| Tool | Description |
|------|-------------|
| `gcal_api_request` | Make raw Google Calendar API requests |

## Tool Specifications

### `gcal_get_events`

```typescript
parameters: {
  calendarId?: string;      // Default: "primary"
  timeMin?: string;         // ISO 8601 datetime (default: now)
  timeMax?: string;         // ISO 8601 datetime (default: now + 7 days)
  maxResults?: number;      // Default: 50
  singleEvents?: boolean;   // Expand recurring events (default: true)
  orderBy?: "startTime" | "updated";
}

output: {
  events: Array<{
    id: string;
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    attendees?: Array<{ email: string; responseStatus: string }>;
    isRecurring: boolean;
    meetingLink?: string;
  }>;
  nextPageToken?: string;
}
```

### `gcal_create_event`

```typescript
parameters: {
  calendarId?: string;
  summary: string;           // Event title (required)
  description?: string;
  location?: string;
  start: string;             // ISO 8601 datetime or date
  end: string;               // ISO 8601 datetime or date
  attendees?: string[];      // Array of email addresses
  reminders?: Array<{ method: "email" | "popup"; minutes: number }>;
  recurrence?: string[];     // RRULE strings
  dryRun?: boolean;          // Default: true
}
```

### `gcal_find_free_time`

```typescript
parameters: {
  timeMin: string;           // Start of search range
  timeMax: string;           // End of search range
  duration: number;          // Desired slot duration in minutes
  calendars?: string[];      // Calendars to check (default: ["primary"])
  workingHours?: {           // Constrain to working hours
    start: string;           // e.g., "09:00"
    end: string;             // e.g., "17:00"
    timezone: string;
  };
}

output: {
  freeSlots: Array<{
    start: string;
    end: string;
    duration: number;
  }>;
}
```

## State Management

The plugin should persist:
- Selected/default calendar ID
- Sync tokens for efficient polling
- User preferences (working hours, default event duration)
- Recent event cache for quick lookups

## Safety Considerations

Following the anti-thrash philosophy from `PLAN.md`:

1. **Write tools disabled by default** - Users must explicitly enable via config
2. **Dry-run by default** - All write operations preview changes first
3. **Recurring event warnings** - Require explicit confirmation when modifying recurring events
4. **Deletion safeguards** - Double-confirm before deleting events
5. **Attendee notifications** - Warn before sending invites to attendees
6. **Audit logging** - Log all operations to state directory

## Example Workflows

### "What's on my calendar this week?"
```
1. Call gcal_get_events with timeMin=today, timeMax=today+7days
2. Format events grouped by day
3. Highlight upcoming event within next hour
```

### "Schedule a 30-minute meeting with bob@example.com next week"
```
1. Call gcal_find_free_time for next week with duration=30
2. Present available slots to user
3. On user selection, call gcal_create_event with dryRun=true
4. Show preview, ask for confirmation
5. Execute with dryRun=false
```

### "Find time for a 2-hour focus block tomorrow"
```
1. Call gcal_get_events for tomorrow
2. Call gcal_find_free_time with duration=120
3. Present options considering existing meetings
```

## Authentication

Google Calendar API requires OAuth 2.0. Options to support:

1. **Service Account** - For server-to-server (JSON key file)
2. **OAuth 2.0** - For user accounts (requires refresh token handling)
3. **API Key** - Limited to public calendars (not recommended)

The plugin should support OAuth refresh token flow with secure credential storage.

## Dependencies

- `googleapis` or direct REST API calls
- Date/time handling (native or lightweight library)
- OAuth2 client for token refresh

## Acceptance Criteria

- [ ] Plugin structure follows `ynab-budget-manager` patterns
- [ ] All read tools implemented and tested
- [ ] Write tools with dry-run default behavior
- [ ] Escape hatch for advanced use cases
- [ ] SKILL.md with comprehensive documentation
- [ ] State persistence for calendar selection and sync tokens
- [ ] Error handling for API rate limits and auth failures
- [ ] TypeScript types for all API responses

## References

- [Google Calendar API Documentation](https://developers.google.com/calendar/api/v3/reference)
- [YNAB Plugin Implementation](plugins/ynab-budget-manager/)
- [OpenClaw Plugin Architecture](PLAN.md)
