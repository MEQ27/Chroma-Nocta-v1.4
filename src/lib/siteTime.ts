import type { LocationData, ResolvedSite } from '../types';
import { MONTHS_SHORT_EN, WEEKDAYS_SHORT_EN } from './calendarNames';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0) return false;
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function getSiteTimeZone(site?: LocationData | null): string | null {
  if (site && site.timeZone && isValidTimeZone(site.timeZone)) {
    return site.timeZone;
  }
  return null;
}

export function isResolvedSite(site: LocationData | null | undefined): site is ResolvedSite {
  if (site !== null && site !== undefined && typeof site.timeZone === 'string') {
    return isValidTimeZone(site.timeZone);
  }
  return false;
}

export function resolveSite(site?: LocationData | null): ResolvedSite | null {
  return isResolvedSite(site) ? site : null;
}

export function partitionSitesByZone(sites: LocationData[]): {
  resolved: ResolvedSite[];
  unresolved: LocationData[];
} {
  const resolved: ResolvedSite[] = [];
  const unresolved: LocationData[] = [];
  for (const s of sites) {
    const res = resolveSite(s);
    if (res) {
      resolved.push(res);
    } else {
      unresolved.push(s);
    }
  }
  return { resolved, unresolved };
}

export function initialNightKeyForSite(
  site: LocationData | null | undefined,
  nowMs: number
): string | null {
  const tz = getSiteTimeZone(site);
  if (tz) {
    return currentNightKey(nowMs, tz);
  }
  return null;
}

export function deviceTimeZoneSuggestion(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(tz)) {
      return tz;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDeviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export interface SiteParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function siteParts(instant: Date | number, timeZone: string): SiteParts {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  const out: SiteParts = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of getFormatter(timeZone).formatToParts(ms)) {
    switch (p.type) {
      case 'year': out.year = Number(p.value); break;
      case 'month': out.month = Number(p.value); break;
      case 'day': out.day = Number(p.value); break;
      case 'hour': out.hour = Number(p.value) % 24; break;
      case 'minute': out.minute = Number(p.value); break;
      case 'second': out.second = Number(p.value); break;
      default: break;
    }
  }
  return out;
}

export function utcOffsetMinutes(instant: Date | number, timeZone: string): number {
  const ms = typeof instant === 'number' ? instant : instant.getTime();
  const flooredMs = Math.floor(ms / 1000) * 1000;
  const p = siteParts(flooredMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - flooredMs) / 60000);
}

export function formatUtcOffset(offsetMinutes: number): string {
  if (offsetMinutes === 0) return 'UTC+0';
  const sign = offsetMinutes < 0 ? '−' : '+';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function toDateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) throw new RangeError(`Geçersiz dateKey: ${dateKey}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function siteDateKey(instant: Date | number, timeZone: string): string {
  const p = siteParts(instant, timeZone);
  return toDateKey(p.year, p.month, p.day);
}

export function siteHour(instant: Date | number, timeZone: string): number {
  return siteParts(instant, timeZone).hour;
}

export function currentNightKey(instant: Date | number, timeZone: string): string {
  const p = siteParts(instant, timeZone);
  const todayKey = toDateKey(p.year, p.month, p.day);
  if (p.hour < 12) {
    return addDaysToDateKey(todayKey, -1);
  }
  return todayKey;
}

export function formatSiteTimeHM(instant: Date | number | null | undefined, timeZone: string): string {
  if (instant === null || instant === undefined) return '--:--';
  const p = siteParts(instant, timeZone);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const { year, month, day } = parseDateKey(dateKey);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return toDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function zonedTimeToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const DAY = 86400000;
  const offBefore = utcOffsetMinutes(naive - DAY, timeZone);
  const offAfter = utcOffsetMinutes(naive + DAY, timeZone);

  const candBefore = naive - offBefore * 60000;
  const candAfter = naive - offAfter * 60000;
  const validBefore = utcOffsetMinutes(candBefore, timeZone) === offBefore;
  const validAfter = utcOffsetMinutes(candAfter, timeZone) === offAfter;

  if (validBefore && validAfter) return new Date(Math.min(candBefore, candAfter));
  if (validBefore) return new Date(candBefore);
  if (validAfter) return new Date(candAfter);
  return new Date(candBefore);
}

export function siteNoon(dateKey: string, timeZone: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return zonedTimeToInstant(year, month, day, 12, 0, 0, timeZone);
}

export function weekdayOfDateKey(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatSiteDateLabel(dateKey: string): string {
  const { month, day } = parseDateKey(dateKey);
  const weekday = weekdayOfDateKey(dateKey);
  return `${day} ${MONTHS_SHORT_EN[month - 1]} ${WEEKDAYS_SHORT_EN[weekday]}`;
}

