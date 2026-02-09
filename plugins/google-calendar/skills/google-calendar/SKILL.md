---
name: google-calendar
description: Read-only access to Google Calendar events and availability
user-invocable: true
---

# Google Calendar

This skill provides read-only access to Google Calendar, allowing you to view events, check availability, and search your calendar.

## Available Tools

### `gcal_list_calendars`
List all calendars the user has access to.

**Parameters:**
- `showHidden` (boolean, optional): Include hidden calendars

**Use when:** User wants to see available calendars or select a different calendar.

### `gcal_list_events`
List events from a calendar with optional filtering.

**Parameters:**
- `calendarId` (string, optional): Calendar ID (uses selected/primary if not provided)
- `timeMin` (string, optional): Start time (RFC3339, YYYY-MM-DD, 'today', 'tomorrow')
- `timeMax` (string, optional): End time (same formats)
- `maxResults` (number, optional): Maximum events (default: 50)
- `q` (string, optional): Free-text search query
- `singleEvents` (boolean, optional): Expand recurring events (default: true)

**Use when:** User asks about events in a time range, like "What's on my calendar this week?"

### `gcal_get_event`
Get detailed information about a specific event.

**Parameters:**
- `eventId` (string, required): The event ID
- `calendarId` (string, optional): Calendar ID

**Use when:** User wants details about a specific event (attendees, description, video link).

### `gcal_get_upcoming`
Quick view of events in the next few hours.

**Parameters:**
- `calendarId` (string, optional): Calendar ID
- `hours` (number, optional): Hours to look ahead (default: 24)
- `maxResults` (number, optional): Maximum events (default: 10)

**Use when:** User asks "What's next?" or "What do I have coming up?"

### `gcal_search_events`
Search events by text query.

**Parameters:**
- `query` (string, required): Search query
- `calendarId` (string, optional): Calendar ID
- `timeMin` (string, optional): Search from date (default: 30 days ago)
- `timeMax` (string, optional): Search until date (default: 30 days ahead)
- `maxResults` (number, optional): Maximum results (default: 25)

**Use when:** User wants to find events by name, like "Find all meetings with John"

### `gcal_check_availability`
Check free/busy status across calendars.

**Parameters:**
- `timeMin` (string, required): Start of time range
- `timeMax` (string, required): End of time range
- `calendarIds` (array, optional): Calendar IDs to check

**Use when:** User asks "When am I free?" or "Am I available on Friday?"

## Common Workflows

### "What's on my calendar today?"
```
1. Call gcal_list_events with timeMin: "today", timeMax: "today"
2. Present the list of events with times and details
```

### "When am I free this week?"
```
1. Call gcal_check_availability with timeMin: "today", timeMax: 7 days from now
2. Show the free slots with durations
```

### "Find all meetings with [person]"
```
1. Call gcal_search_events with query: "[person's name]"
2. Present matching events
```

### "What's my next meeting?"
```
1. Call gcal_get_upcoming with hours: 8, maxResults: 1
2. If found, present the event details
3. Optionally call gcal_get_event for full details including video link
```

## Date/Time Handling

The tools accept flexible date formats:
- RFC3339: `2026-02-05T09:00:00-08:00`
- Date only: `2026-02-05` (interpreted as start of day)
- Relative: `today`, `tomorrow`

When displaying times to users:
- All-day events show just the date
- Timed events show date and time
- Multi-day events show the full range

## Error Handling

- **401 Unauthorized**: The OAuth token may have expired or been revoked. The plugin will attempt to refresh automatically.
- **403 Forbidden**: Rate limit exceeded or insufficient permissions. Wait before retrying.
- **404 Not Found**: Calendar or event doesn't exist. Verify the ID.

## Privacy Notes

- This skill only has **read-only** access to calendar data
- It cannot create, modify, or delete events
- Calendar data may contain sensitive information (meeting titles, attendees, locations)
- Never log or display the OAuth tokens

## Configuration

Required configuration:
- `clientId`: Google OAuth 2.0 Client ID
- `clientSecret`: Google OAuth 2.0 Client Secret
- `refreshToken`: OAuth 2.0 Refresh Token

Optional configuration:
- `defaultCalendarId`: Default calendar (default: "primary")
- `statePath`: State storage path (default: "~/.google-calendar-state")
- `defaultTimeZone`: Timezone for display
- `defaultLookAheadDays`: Days to look ahead (default: 7)
