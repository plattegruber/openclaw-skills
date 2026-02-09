import type { EventDateTime } from "../types.js";

export function parseEventDateTime(dt: EventDateTime): Date {
  if (dt.dateTime) {
    return new Date(dt.dateTime);
  }
  if (dt.date) {
    // All-day event: date is in YYYY-MM-DD format
    return new Date(dt.date + "T00:00:00");
  }
  return new Date();
}

export function isAllDayEvent(start: EventDateTime, end: EventDateTime): boolean {
  return !start.dateTime && !!start.date && !end.dateTime && !!end.date;
}

export function formatEventTime(
  dt: EventDateTime,
  isAllDay: boolean,
  timeZone?: string
): string {
  if (isAllDay && dt.date) {
    return formatDate(new Date(dt.date + "T00:00:00"));
  }

  const date = parseEventDateTime(dt);
  return formatDateTime(date, timeZone);
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  if (timeZone) {
    options.timeZone = timeZone;
  }

  return date.toLocaleString("en-US", options);
}

export function formatTimeOnly(date: Date, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };

  if (timeZone) {
    options.timeZone = timeZone;
  }

  return date.toLocaleTimeString("en-US", options);
}

export function formatDuration(startDate: Date, endDate: Date): string {
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (minutes === 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} minute${minutes !== 1 ? "s" : ""}`;
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return `${hours}h ${remainingMinutes}m`;
}

export function toRFC3339(date: Date): string {
  return date.toISOString();
}

export function parseInputDate(input: string): Date {
  // Handle YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return new Date(input + "T00:00:00");
  }

  // Handle relative dates
  const now = new Date();
  const lower = input.toLowerCase();

  if (lower === "today") {
    return startOfDay(now);
  }

  if (lower === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return startOfDay(tomorrow);
  }

  if (lower === "yesterday") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return startOfDay(yesterday);
  }

  // Try parsing as ISO date
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  throw new Error(`Unable to parse date: ${input}`);
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addHours(date: Date, hours: number): Date {
  const result = new Date(date);
  result.setTime(result.getTime() + hours * 60 * 60 * 1000);
  return result;
}

export function getDefaultTimeRange(lookAheadDays: number): {
  timeMin: string;
  timeMax: string;
} {
  const now = new Date();
  const end = addDays(now, lookAheadDays);

  return {
    timeMin: toRFC3339(now),
    timeMax: toRFC3339(endOfDay(end)),
  };
}

export function formatEventTimeRange(
  start: EventDateTime,
  end: EventDateTime,
  timeZone?: string
): string {
  const isAllDay = isAllDayEvent(start, end);

  if (isAllDay) {
    const startDate = start.date!;
    const endDate = end.date!;

    if (startDate === endDate) {
      return formatDate(new Date(startDate + "T00:00:00")) + " (all day)";
    }

    // Multi-day all-day event
    const endDateParsed = new Date(endDate + "T00:00:00");
    endDateParsed.setDate(endDateParsed.getDate() - 1); // End date is exclusive

    return `${formatDate(new Date(startDate + "T00:00:00"))} - ${formatDate(endDateParsed)} (all day)`;
  }

  const startDt = parseEventDateTime(start);
  const endDt = parseEventDateTime(end);

  // Same day
  if (startDt.toDateString() === endDt.toDateString()) {
    return `${formatDateTime(startDt, timeZone)} - ${formatTimeOnly(endDt, timeZone)}`;
  }

  // Different days
  return `${formatDateTime(startDt, timeZone)} - ${formatDateTime(endDt, timeZone)}`;
}
