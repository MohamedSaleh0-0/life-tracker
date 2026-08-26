// Pure domain logic for duration-type data points: the user enters a
// start and end time for an activity (sleep, play time, shopping
// time, ...) and the duration is computed automatically, rather than
// the user computing and typing the duration by hand. No I/O.

/**
 * Minutes elapsed from `start` to `end`, both "HH:MM" local times.
 * Handles an end time earlier than the start time as crossing
 * midnight (e.g. sleep 23:30 -> 07:00 is 7h30m, not negative) — this
 * is the whole point of the feature: multiple sleep/play/shopping
 * entries a day, any of which may span midnight.
 */
export function computeDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const diff = endMinutes - startMinutes;
  return diff >= 0 ? diff : diff + 24 * 60;
}

/** Formats a minute count as "7h 30m" (or just "45m" / "3h" when one part is zero). */
export function formatDurationMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
