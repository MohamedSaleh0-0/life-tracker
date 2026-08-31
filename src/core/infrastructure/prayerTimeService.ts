// Prayer time fetching and caching service.
// Integrates with Aladhan API (free, no key required).
// See design-habit-tracking.md §Habit Reminders.

export interface PrayerTimes {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export interface PrayerLocation {
  lat: number;
  lon: number;
  calculationMethod: number; // Aladhan method id, default 2 = ISNA
}

export type UrlFetcher = (url: string) => Promise<{ status: number; json: unknown }>;

export class PrayerTimeFetchError extends Error {
  constructor(public readonly status: number) {
    super(`Prayer time fetch failed with status ${status}`);
    this.name = 'PrayerTimeFetchError';
  }
}

interface AladhanResponse {
  data: { timings: { Fajr: string; Sunrise: string; Dhuhr: string; Asr: string; Maghrib: string; Isha: string } };
}

function isAladhanResponse(j: unknown): j is AladhanResponse {
  return typeof j === 'object' && j !== null && 'data' in j;
}

export class PrayerTimeService {
  private cache = new Map<string, PrayerTimes>();

  constructor(private fetcher: UrlFetcher) {}

  private cacheKey(date: string, loc: PrayerLocation): string {
    return `${date}|${loc.lat}|${loc.lon}|${loc.calculationMethod}`;
  }

  async getTimesForDate(date: string, loc: PrayerLocation): Promise<PrayerTimes> {
    const key = this.cacheKey(date, loc);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const [y, m, d] = date.split('-');
    const url = `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${loc.lat}&longitude=${loc.lon}&method=${loc.calculationMethod}`;

    const { status, json } = await this.fetcher(url);
    if (status !== 200) throw new PrayerTimeFetchError(status);
    if (!isAladhanResponse(json)) throw new Error('Unexpected Aladhan response shape');

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

  pruneCacheExcept(keepDate: string): void {
    for (const key of this.cache.keys()) {
      if (!key.startsWith(`${keepDate}|`)) this.cache.delete(key);
    }
  }
}

export function makeObsidianUrlFetcher(
  requestUrl: (opts: { url: string }) => Promise<{ status: number; json: unknown }>
): UrlFetcher {
  return async (url) => {
    const res = await requestUrl({ url });
    return { status: res.status, json: res.json };
  };
}
