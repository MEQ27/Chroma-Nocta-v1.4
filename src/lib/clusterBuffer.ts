import type { ResolvedSite } from '../types';
import type { ClusterBufferDay } from './windowClusters';
import { assertMonthIndex } from './calendarNames';
import { zonedTimeToInstant, siteParts } from './siteTime';
import { calculateNightEphemeris } from './ephemeris';

export const CLUSTER_BUFFER_DAYS_BEFORE = 9;
export const CLUSTER_BUFFER_DAYS_AFTER = 10;

export type ClusterBufferSite = Pick<
  ResolvedSite,
  'latitude' | 'longitude' | 'elevation' | 'timeZone' | 'horizonProfile'
>;

export function buildClusterBuffer(
  site: ClusterBufferSite,
  year: number,
  month: number
): ClusterBufferDay[] {
  assertMonthIndex(month);

  const tz = site.timeZone;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const totalDays = CLUSTER_BUFFER_DAYS_BEFORE + daysInMonth + CLUSTER_BUFFER_DAYS_AFTER;
  const bufferDays: ClusterBufferDay[] = [];

  for (let i = 0; i < totalDays; i++) {
    const date = zonedTimeToInstant(
      year,
      month + 1,
      -CLUSTER_BUFFER_DAYS_BEFORE + i + 1,
      12,
      0,
      0,
      tz
    );
    const ephem = calculateNightEphemeris(
      date,
      site.latitude,
      site.longitude,
      site.elevation,
      tz,
      site.horizonProfile
    );
    const ratio =
      ephem.darkDurationMinutes > 0
        ? Math.round((ephem.moonlessDarkMinutes / ephem.darkDurationMinutes) * 100)
        : 0;
    const dp = siteParts(date, tz);
    bufferDays.push({
      date,
      dateKey: ephem.dateKey,
      month: dp.month - 1,
      ratio,
      illum: ephem.moonIllumination,
      moonlessDarkMinutes: ephem.moonlessDarkMinutes,
    });
  }

  return bufferDays;
}
