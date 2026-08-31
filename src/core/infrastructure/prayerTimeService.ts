// Fetches today's prayer times from Aladhan, cached per calendar day so
// habits sharing a location don't refetch repeatedly. No API key required.
// See design-habit-tracking.md §Habit Reminders.

export interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export class PrayerTimeService {
  private cache = new Map<string, PrayerTimes>(); // key: `${date}|${lat}|${lon}|${method}`

  async getTimesForToday(
    lat: number,
    lon: number,
    method: number,
    today: string
  ): Promise<PrayerTimes> {
    const key = `${today}|${lat}|${lon}|${method}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Convert YYYY-MM-DD to DD-MM-YYYY for Aladhan API
    const [year, month, day] = today.split('-');
    const dateStr = `${day}-${month}-${year}`;

    const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${lat}&longitude=${lon}&method=${method}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Prayer time fetch failed: ${res.status}`);

    const json = (await res.json()) as {
      data?: {
        timings?: Record<string, string>;
      };
    };

    if (!json.data?.timings) {
      throw new Error('Invalid prayer times response format');
    }

    const t = json.data.timings;
    const times: PrayerTimes = {
      fajr: t.Fajr.slice(0, 5),
      sunrise: t.Sunrise.slice(0, 5),
      dhuhr: t.Dhuhr.slice(0, 5),
      asr: t.Asr.slice(0, 5),
      maghrib: t.Maghrib.slice(0, 5),
      isha: t.Isha.slice(0, 5),
    };
    this.cache.set(key, times);
    return times;
  }
}
