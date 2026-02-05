/**
 * Google Calendar Read-Only Plugin for OpenClaw
 *
 * This plugin provides tools for viewing Google Calendar events and availability.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenClawPluginApi = any;

import { GoogleCalendarClient } from "./src/client.js";
import { OAuthManager } from "./src/oauth.js";
import { StateManager } from "./src/state.js";
import type {
  PluginConfig,
  Event,
  CalendarListEntry,
  EventSummary,
  EventDetail,
  CalendarSummary,
  FreeSlot,
  BusySlot,
  CalendarAvailability,
} from "./src/types.js";
import {
  parseEventDateTime,
  isAllDayEvent,
  formatEventTimeRange,
  formatDurationMinutes,
  toRFC3339,
  parseInputDate,
  addDays,
  addHours,
  endOfDay,
  getDefaultTimeRange,
} from "./src/utils/datetime.js";

// Resolve calendar ID from param -> state -> config -> "primary"
function resolveCalendarId(
  paramCalendarId: string | undefined,
  state: StateManager,
  config: PluginConfig
): string {
  if (paramCalendarId) return paramCalendarId;
  const selectedCalendar = state.getSelectedCalendar();
  if (selectedCalendar) return selectedCalendar.id;
  if (config.defaultCalendarId) return config.defaultCalendarId;
  return "primary";
}

// Convert API Event to EventSummary
function eventToSummary(event: Event, calendarId: string): EventSummary {
  const isAllDay = isAllDayEvent(event.start, event.end);
  const startDate = parseEventDateTime(event.start);
  const endDate = parseEventDateTime(event.end);

  const videoUrl =
    event.hangoutLink ||
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
      ?.uri;

  const selfAttendee = event.attendees?.find((a) => a.self);

  return {
    id: event.id,
    calendarId,
    summary: event.summary || "(No title)",
    description: event.description,
    location: event.location,
    start: isAllDay ? event.start.date! : event.start.dateTime!,
    end: isAllDay ? event.end.date! : event.end.dateTime!,
    isAllDay,
    status: event.status,
    organizer: event.organizer?.displayName || event.organizer?.email,
    attendeeCount: event.attendees?.length || 0,
    myResponseStatus: selfAttendee?.responseStatus,
    hasVideoConference: !!videoUrl,
    videoConferenceUrl: videoUrl,
    recurringEventId: event.recurringEventId,
    eventType: event.eventType,
  };
}

// Convert API Event to EventDetail
function eventToDetail(event: Event, calendarId: string): EventDetail {
  const summary = eventToSummary(event, calendarId);

  return {
    ...summary,
    htmlLink: event.htmlLink,
    created: event.created,
    updated: event.updated,
    attendees: (event.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName,
      responseStatus: a.responseStatus,
      isOrganizer: a.organizer || false,
      isOptional: a.optional || false,
      isSelf: a.self || false,
    })),
    reminders: event.reminders?.overrides || [],
    attachments: (event.attachments || []).map((a) => ({
      title: a.title,
      url: a.fileUrl,
      mimeType: a.mimeType,
    })),
    recurrenceRules: event.recurrence,
    visibility: event.visibility,
    transparency: event.transparency,
  };
}

// Convert CalendarListEntry to CalendarSummary
function calendarToSummary(cal: CalendarListEntry): CalendarSummary {
  return {
    id: cal.id,
    name: cal.summaryOverride || cal.summary,
    description: cal.description,
    timeZone: cal.timeZone,
    isPrimary: cal.primary || false,
    accessRole: cal.accessRole,
    color: cal.backgroundColor,
  };
}

// Calculate free slots from busy periods
function calculateFreeSlots(
  busyPeriods: Array<{ start: string; end: string }>,
  timeMin: string,
  timeMax: string
): FreeSlot[] {
  const freeSlots: FreeSlot[] = [];

  // Sort busy periods by start time
  const sorted = [...busyPeriods].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );

  let currentTime = new Date(timeMin);
  const endTime = new Date(timeMax);

  for (const busy of sorted) {
    const busyStart = new Date(busy.start);
    const busyEnd = new Date(busy.end);

    // If there's a gap before this busy period
    if (currentTime < busyStart) {
      const durationMinutes = Math.round(
        (busyStart.getTime() - currentTime.getTime()) / (1000 * 60)
      );
      if (durationMinutes >= 15) {
        // Only show slots >= 15 minutes
        freeSlots.push({
          start: toRFC3339(currentTime),
          end: toRFC3339(busyStart),
          durationMinutes,
          durationFormatted: formatDurationMinutes(durationMinutes),
        });
      }
    }

    // Move current time to end of busy period
    if (busyEnd > currentTime) {
      currentTime = busyEnd;
    }
  }

  // Check for free time after last busy period
  if (currentTime < endTime) {
    const durationMinutes = Math.round(
      (endTime.getTime() - currentTime.getTime()) / (1000 * 60)
    );
    if (durationMinutes >= 15) {
      freeSlots.push({
        start: toRFC3339(currentTime),
        end: toRFC3339(endTime),
        durationMinutes,
        durationFormatted: formatDurationMinutes(durationMinutes),
      });
    }
  }

  return freeSlots;
}

export default function register(api: OpenClawPluginApi) {
  const pluginConfig = (api.pluginConfig ?? {}) as unknown as PluginConfig;

  // Validate required config
  if (!pluginConfig.clientId) {
    console.error("Google Calendar: clientId is required in plugin config");
    return;
  }
  if (!pluginConfig.clientSecret) {
    console.error("Google Calendar: clientSecret is required in plugin config");
    return;
  }
  if (!pluginConfig.refreshToken) {
    console.error("Google Calendar: refreshToken is required in plugin config");
    return;
  }

  // Initialize state manager
  const state = new StateManager(
    pluginConfig.statePath || "~/.google-calendar-state"
  );

  // Initialize OAuth manager with token persistence
  const oauthManager = new OAuthManager({
    clientId: pluginConfig.clientId,
    clientSecret: pluginConfig.clientSecret,
    initialTokens: state.getOAuthTokens() || undefined,
    onTokensUpdated: (tokens) => {
      state.setOAuthTokens(tokens);
    },
  });

  // Initialize with refresh token if we don't have valid tokens
  if (!oauthManager.hasValidTokens()) {
    oauthManager.initializeWithRefreshToken(pluginConfig.refreshToken).catch((err) => {
      console.error("Google Calendar: Failed to initialize OAuth:", err);
    });
  }

  // Initialize client
  const client = new GoogleCalendarClient(oauthManager);

  const config: PluginConfig = {
    defaultCalendarId: "primary",
    defaultLookAheadDays: 7,
    ...pluginConfig,
  };

  // ============================================================================
  // Read Tools
  // ============================================================================

  // gcal_list_calendars
  api.registerTool({
    name: "gcal_list_calendars",
    description:
      "List all Google Calendar calendars the user has access to and show which one is selected",
    parameters: {
      type: "object",
      properties: {
        showHidden: {
          type: "boolean",
          description: "Include hidden calendars (default: false)",
        },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const response = await client.getCalendarList(
        params.showHidden as boolean | undefined
      );
      const selectedCalendar = state.getSelectedCalendar();

      const calendars = response.items
        .filter((c) => !c.deleted)
        .filter((c) => !c.hidden || params.showHidden)
        .map(calendarToSummary)
        .sort((a, b) => {
          // Primary first, then alphabetical
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      const text = [
        `Found ${calendars.length} calendar(s):`,
        ...calendars.map((c) => {
          const selected = selectedCalendar?.id === c.id ? " (selected)" : "";
          const primary = c.isPrimary ? " [primary]" : "";
          return `- ${c.name}${primary}${selected} [${c.id}]`;
        }),
        "",
        selectedCalendar
          ? `Currently selected: ${selectedCalendar.summary}`
          : "No calendar selected. The primary calendar will be used by default.",
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: { calendars, selectedCalendarId: selectedCalendar?.id ?? null },
      };
    },
  });

  // gcal_list_events
  api.registerTool({
    name: "gcal_list_events",
    description:
      "List events from a Google Calendar with optional date range and search filtering",
    parameters: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (uses selected or primary if not provided)",
        },
        timeMin: {
          type: "string",
          description:
            "Start time (RFC3339, YYYY-MM-DD, or 'today'/'tomorrow'). Defaults to now.",
        },
        timeMax: {
          type: "string",
          description:
            "End time (RFC3339, YYYY-MM-DD, or 'today'/'tomorrow'). Defaults to 7 days from now.",
        },
        maxResults: {
          type: "number",
          description: "Maximum events to return (default: 50)",
        },
        q: {
          type: "string",
          description: "Free-text search query to filter events",
        },
        singleEvents: {
          type: "boolean",
          description: "Expand recurring events into instances (default: true)",
        },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const calendarId = resolveCalendarId(
        params.calendarId as string | undefined,
        state,
        config
      );

      // Parse time range
      let timeMin: string;
      let timeMax: string;

      if (params.timeMin) {
        timeMin = toRFC3339(parseInputDate(params.timeMin as string));
      } else {
        timeMin = toRFC3339(new Date());
      }

      if (params.timeMax) {
        timeMax = toRFC3339(endOfDay(parseInputDate(params.timeMax as string)));
      } else {
        timeMax = toRFC3339(
          endOfDay(addDays(new Date(), config.defaultLookAheadDays || 7))
        );
      }

      const singleEvents = params.singleEvents !== false;

      const response = await client.listEvents({
        calendarId,
        timeMin,
        timeMax,
        maxResults: (params.maxResults as number) || 50,
        q: params.q as string | undefined,
        singleEvents,
        orderBy: singleEvents ? "startTime" : undefined,
      });

      const events = response.items
        .filter((e) => e.status !== "cancelled")
        .map((e) => eventToSummary(e, calendarId));

      let text = `Found ${events.length} event(s):\n\n`;

      if (events.length === 0) {
        text = "No events found in the specified time range.";
      } else {
        for (const event of events) {
          const timeRange = formatEventTimeRange(
            { date: event.isAllDay ? event.start : undefined, dateTime: event.isAllDay ? undefined : event.start },
            { date: event.isAllDay ? event.end : undefined, dateTime: event.isAllDay ? undefined : event.end },
            config.defaultTimeZone
          );
          const video = event.hasVideoConference ? " [video]" : "";
          const location = event.location ? ` @ ${event.location}` : "";

          text += `- ${event.summary}${video}\n`;
          text += `  ${timeRange}${location}\n`;
          if (event.attendeeCount > 0) {
            text += `  ${event.attendeeCount} attendee(s)\n`;
          }
          text += `  ID: ${event.id}\n\n`;
        }
      }

      return {
        content: [{ type: "text", text: text.trim() }],
        details: {
          events,
          totalCount: events.length,
          timeRange: { start: timeMin, end: timeMax },
        },
      };
    },
  });

  // gcal_get_event
  api.registerTool({
    name: "gcal_get_event",
    description: "Get detailed information about a specific calendar event",
    parameters: {
      type: "object",
      properties: {
        eventId: {
          type: "string",
          description: "The event ID",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID (uses selected or primary if not provided)",
        },
      },
      required: ["eventId"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const calendarId = resolveCalendarId(
        params.calendarId as string | undefined,
        state,
        config
      );

      const event = await client.getEvent(
        calendarId,
        params.eventId as string
      );
      const detail = eventToDetail(event, calendarId);

      const timeRange = formatEventTimeRange(
        { date: detail.isAllDay ? detail.start : undefined, dateTime: detail.isAllDay ? undefined : detail.start },
        { date: detail.isAllDay ? detail.end : undefined, dateTime: detail.isAllDay ? undefined : detail.end },
        config.defaultTimeZone
      );

      let text = [
        `Event: ${detail.summary}`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `When: ${timeRange}`,
        detail.location ? `Where: ${detail.location}` : "",
        detail.organizer ? `Organizer: ${detail.organizer}` : "",
        detail.hasVideoConference
          ? `Video: ${detail.videoConferenceUrl}`
          : "",
        "",
        detail.description ? `Description:\n${detail.description}\n` : "",
      ]
        .filter(Boolean)
        .join("\n");

      if (detail.attendees.length > 0) {
        text += "\nAttendees:\n";
        for (const attendee of detail.attendees) {
          const status =
            attendee.responseStatus === "accepted"
              ? "✓"
              : attendee.responseStatus === "declined"
              ? "✗"
              : attendee.responseStatus === "tentative"
              ? "?"
              : "•";
          const role = attendee.isOrganizer
            ? " (organizer)"
            : attendee.isOptional
            ? " (optional)"
            : "";
          text += `  ${status} ${attendee.name || attendee.email}${role}\n`;
        }
      }

      if (detail.attachments.length > 0) {
        text += "\nAttachments:\n";
        for (const attachment of detail.attachments) {
          text += `  - ${attachment.title}: ${attachment.url}\n`;
        }
      }

      text += `\nLink: ${detail.htmlLink}`;

      return {
        content: [{ type: "text", text }],
        details: { event: detail },
      };
    },
  });

  // gcal_get_upcoming
  api.registerTool({
    name: "gcal_get_upcoming",
    description:
      "Get upcoming events in the next few hours - a quick view of what's coming up",
    parameters: {
      type: "object",
      properties: {
        calendarId: {
          type: "string",
          description: "Calendar ID (uses selected or primary if not provided)",
        },
        hours: {
          type: "number",
          description: "Hours to look ahead (default: 24)",
        },
        maxResults: {
          type: "number",
          description: "Maximum events to return (default: 10)",
        },
      },
      required: [],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const calendarId = resolveCalendarId(
        params.calendarId as string | undefined,
        state,
        config
      );

      const hours = (params.hours as number) || 24;
      const now = new Date();
      const timeMin = toRFC3339(now);
      const timeMax = toRFC3339(addHours(now, hours));

      const response = await client.listEvents({
        calendarId,
        timeMin,
        timeMax,
        maxResults: (params.maxResults as number) || 10,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.items
        .filter((e) => e.status !== "cancelled")
        .map((e) => eventToSummary(e, calendarId));

      let text = `Upcoming events (next ${hours} hours):\n\n`;

      if (events.length === 0) {
        text = `No upcoming events in the next ${hours} hours.`;
      } else {
        for (const event of events) {
          const timeRange = formatEventTimeRange(
            { date: event.isAllDay ? event.start : undefined, dateTime: event.isAllDay ? undefined : event.start },
            { date: event.isAllDay ? event.end : undefined, dateTime: event.isAllDay ? undefined : event.end },
            config.defaultTimeZone
          );
          const video = event.hasVideoConference ? " [video]" : "";
          text += `- ${event.summary}${video}\n  ${timeRange}\n\n`;
        }
      }

      return {
        content: [{ type: "text", text: text.trim() }],
        details: { events, hours },
      };
    },
  });

  // gcal_search_events
  api.registerTool({
    name: "gcal_search_events",
    description: "Search for events by text query across event titles and descriptions",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query",
        },
        calendarId: {
          type: "string",
          description: "Calendar ID (uses selected or primary if not provided)",
        },
        timeMin: {
          type: "string",
          description: "Search from date (default: 30 days ago)",
        },
        timeMax: {
          type: "string",
          description: "Search until date (default: 30 days from now)",
        },
        maxResults: {
          type: "number",
          description: "Maximum results (default: 25)",
        },
      },
      required: ["query"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const calendarId = resolveCalendarId(
        params.calendarId as string | undefined,
        state,
        config
      );

      const now = new Date();
      const timeMin = params.timeMin
        ? toRFC3339(parseInputDate(params.timeMin as string))
        : toRFC3339(addDays(now, -30));
      const timeMax = params.timeMax
        ? toRFC3339(endOfDay(parseInputDate(params.timeMax as string)))
        : toRFC3339(endOfDay(addDays(now, 30)));

      const response = await client.listEvents({
        calendarId,
        timeMin,
        timeMax,
        maxResults: (params.maxResults as number) || 25,
        q: params.query as string,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = response.items
        .filter((e) => e.status !== "cancelled")
        .map((e) => eventToSummary(e, calendarId));

      let text = `Search results for "${params.query}":\n\n`;

      if (events.length === 0) {
        text = `No events found matching "${params.query}".`;
      } else {
        text += `Found ${events.length} event(s):\n\n`;
        for (const event of events) {
          const timeRange = formatEventTimeRange(
            { date: event.isAllDay ? event.start : undefined, dateTime: event.isAllDay ? undefined : event.start },
            { date: event.isAllDay ? event.end : undefined, dateTime: event.isAllDay ? undefined : event.end },
            config.defaultTimeZone
          );
          text += `- ${event.summary}\n  ${timeRange}\n  ID: ${event.id}\n\n`;
        }
      }

      return {
        content: [{ type: "text", text: text.trim() }],
        details: { events, query: params.query },
      };
    },
  });

  // gcal_check_availability
  api.registerTool({
    name: "gcal_check_availability",
    description:
      "Check free/busy availability for one or more calendars in a time range",
    parameters: {
      type: "object",
      properties: {
        timeMin: {
          type: "string",
          description: "Start of time range (RFC3339, YYYY-MM-DD, or 'today'/'tomorrow')",
        },
        timeMax: {
          type: "string",
          description: "End of time range (RFC3339, YYYY-MM-DD, or 'today'/'tomorrow')",
        },
        calendarIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Calendar IDs to check (defaults to selected/primary calendar)",
        },
      },
      required: ["timeMin", "timeMax"],
    },
    async execute(_id: string, params: Record<string, unknown>) {
      const timeMin = toRFC3339(parseInputDate(params.timeMin as string));
      const timeMax = toRFC3339(endOfDay(parseInputDate(params.timeMax as string)));

      let calendarIds = params.calendarIds as string[] | undefined;
      if (!calendarIds || calendarIds.length === 0) {
        calendarIds = [resolveCalendarId(undefined, state, config)];
      }

      const response = await client.getFreeBusy({
        timeMin,
        timeMax,
        calendarIds,
      });

      const calendars: CalendarAvailability[] = [];
      const allBusySlots: BusySlot[] = [];

      for (const [calId, calData] of Object.entries(response.calendars)) {
        const errors = calData.errors?.map((e) => e.reason) || [];
        calendars.push({
          calendarId: calId,
          busyPeriods: calData.busy,
          errors: errors.length > 0 ? errors : undefined,
        });

        for (const busy of calData.busy) {
          allBusySlots.push({
            start: busy.start,
            end: busy.end,
            calendarId: calId,
          });
        }
      }

      const freeSlots = calculateFreeSlots(allBusySlots, timeMin, timeMax);

      let text = `Availability check:\n`;
      text += `Time range: ${new Date(timeMin).toLocaleString()} - ${new Date(timeMax).toLocaleString()}\n\n`;

      if (allBusySlots.length === 0) {
        text += "You are completely free during this time period!\n";
      } else {
        text += `Busy periods (${allBusySlots.length}):\n`;
        for (const busy of allBusySlots.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
        )) {
          text += `  - ${new Date(busy.start).toLocaleString()} - ${new Date(busy.end).toLocaleString()}\n`;
        }
        text += "\n";
      }

      if (freeSlots.length > 0) {
        text += `Free slots (${freeSlots.length}):\n`;
        for (const free of freeSlots) {
          text += `  - ${new Date(free.start).toLocaleString()} - ${new Date(free.end).toLocaleString()} (${free.durationFormatted})\n`;
        }
      }

      return {
        content: [{ type: "text", text }],
        details: {
          calendars,
          busySlots: allBusySlots,
          freeSlots,
          timeRange: { start: timeMin, end: timeMax },
        },
      };
    },
  });
}
