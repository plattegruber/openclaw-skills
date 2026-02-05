# Add Google Calendar read-only skill for event management

## Summary

Create a new OpenClaw skill that provides read-only access to Google Calendar, enabling Claude to help users manage their schedules, find free time, and analyze calendar patterns.

## Motivation

Calendar management is a common daily task that benefits from AI assistance. With read-only access, Claude can:
- Help users understand their upcoming schedule
- Find available time slots for meetings
- Analyze time allocation patterns
- Summarize busy/free periods
- Answer questions about scheduled events

## Technical Research

### Google Calendar API v3

The [Google Calendar API](https://developers.google.com/workspace/calendar/api/guides/overview) is a RESTful API that provides programmatic access to calendar data.

**Base URL**: `https://www.googleapis.com/calendar/v3`

### OAuth Scopes (Read-Only)

Two read-only scopes are available ([documentation](https://developers.google.com/workspace/calendar/api/auth)):

| Scope | Description |
|-------|-------------|
| `https://www.googleapis.com/auth/calendar.readonly` | Full read access to calendars and events |
| `https://www.googleapis.com/auth/calendar.events.readonly` | Read access to events only |

**Recommendation**: Use `calendar.readonly` for full functionality while maintaining read-only safety.

### Key API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users/me/calendarList` | GET | List all calendars the user has access to |
| `/calendars/{calendarId}` | GET | Get metadata for a specific calendar |
| `/calendars/{calendarId}/events` | GET | List events on a calendar |
| `/calendars/{calendarId}/events/{eventId}` | GET | Get a specific event |
| `/freeBusy` | POST | Query free/busy information |

### Authentication

Google OAuth 2.0 with Bearer tokens. The skill should support:
- OAuth token stored in config (user handles OAuth flow externally)
- Optional: Service account JSON for workspace accounts

## Proposed Implementation

### Plugin Structure

```
plugins/google-calendar/
├── openclaw.plugin.json
├── package.json
├── tsconfig.json
├── index.ts
├── src/
│   ├── types.ts
│   ├── client.ts
│   ├── state.ts
│   └── tools/
│       ├── index.ts
│       └── read-tools.ts
└── skills/
    └── google-calendar/
        └── SKILL.md
```

### Configuration Schema

```json
{
  "configSchema": {
    "type": "object",
    "properties": {
      "googleAccessToken": {
        "type": "string",
        "sensitive": true,
        "description": "Google OAuth access token with calendar.readonly scope"
      },
      "defaultCalendarId": {
        "type": "string",
        "default": "primary",
        "description": "Default calendar ID (use 'primary' for user's main calendar)"
      },
      "defaultTimeZone": {
        "type": "string",
        "description": "IANA timezone (e.g., 'America/New_York')"
      }
    },
    "required": ["googleAccessToken"]
  }
}
```

### Proposed Tools

#### Core Read Tools

| Tool Name | Description |
|-----------|-------------|
| `gcal_list_calendars` | List all calendars the user has access to |
| `gcal_get_events` | Get events from a calendar with date range filtering |
| `gcal_get_event` | Get details of a specific event |
| `gcal_find_free_time` | Find available time slots in a date range |
| `gcal_get_upcoming` | Get upcoming events (convenience wrapper) |

#### Tool Specifications

**`gcal_list_calendars`**
```typescript
{
  name: "gcal_list_calendars",
  description: "List all calendars the user has access to",
  parameters: {
    type: "object",
    properties: {
      showHidden: { type: "boolean", description: "Include hidden calendars" }
    }
  }
}
```

**`gcal_get_events`**
```typescript
{
  name: "gcal_get_events",
  description: "Get events from a calendar within a date range",
  parameters: {
    type: "object",
    properties: {
      calendarId: { type: "string", description: "Calendar ID (defaults to 'primary')" },
      timeMin: { type: "string", description: "Start of time range (RFC3339, e.g., '2026-02-05T00:00:00Z')" },
      timeMax: { type: "string", description: "End of time range (RFC3339)" },
      maxResults: { type: "number", description: "Maximum events to return (default 50)" },
      query: { type: "string", description: "Free text search query" },
      singleEvents: { type: "boolean", description: "Expand recurring events (default true)" }
    }
  }
}
```

**`gcal_find_free_time`**
```typescript
{
  name: "gcal_find_free_time",
  description: "Find free time slots across one or more calendars",
  parameters: {
    type: "object",
    properties: {
      calendarIds: { type: "array", items: { type: "string" } },
      timeMin: { type: "string", description: "Start of search range (RFC3339)" },
      timeMax: { type: "string", description: "End of search range (RFC3339)" },
      durationMinutes: { type: "number", description: "Minimum slot duration in minutes" }
    },
    required: ["timeMin", "timeMax"]
  }
}
```

**`gcal_get_upcoming`**
```typescript
{
  name: "gcal_get_upcoming",
  description: "Get upcoming events from now",
  parameters: {
    type: "object",
    properties: {
      calendarId: { type: "string" },
      days: { type: "number", description: "Number of days ahead (default 7)" },
      maxResults: { type: "number", description: "Maximum events (default 20)" }
    }
  }
}
```

### State Management

Following the YNAB plugin pattern:
- Track selected calendar across tool calls
- Cache calendar list for performance
- Store user's timezone preference

## Example Usage

```
User: What's on my calendar this week?
Claude: [Uses gcal_get_upcoming with days=7]
"You have 12 events this week:
- Monday: Team standup (9am), 1:1 with Manager (2pm)
- Tuesday: Sprint planning (10am-12pm)
..."

User: When am I free on Thursday for a 1-hour meeting?
Claude: [Uses gcal_find_free_time for Thursday with durationMinutes=60]
"You have these available 1-hour slots on Thursday:
- 8:00 AM - 9:00 AM
- 11:30 AM - 1:00 PM
- 4:00 PM - 5:00 PM"
```

## Security Considerations

- **Read-only by design**: No write scopes requested, no mutation tools
- **Token storage**: Access token marked as `sensitive` in config
- **Scope verification**: Validate token has correct scope at startup
- **Rate limiting**: Google Calendar API has 1,000,000 queries/day limit; implement client-side tracking

## References

- [Google Calendar API Overview](https://developers.google.com/workspace/calendar/api/guides/overview)
- [API v3 Reference](https://developers.google.com/workspace/calendar/api/v3/reference)
- [OAuth Scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Events: list](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [CalendarList: list](https://developers.google.com/calendar/api/v3/reference/calendarList/list)

## Acceptance Criteria

- [ ] Plugin structure following YNAB pattern
- [ ] OAuth token-based authentication
- [ ] All 5 proposed read-only tools implemented
- [ ] State management for calendar selection
- [ ] Comprehensive SKILL.md with usage examples
- [ ] TypeScript types for all Google Calendar API responses
- [ ] Error handling for common API errors (401, 403, 429)
- [ ] Unit tests for client and utility functions
