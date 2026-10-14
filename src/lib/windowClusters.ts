import { siteParts } from './siteTime';
import { MONTHS_EN, MONTHS_SHORT_EN, assertMonthIndex } from './calendarNames';

export interface ClusterDay {
  readonly date: Date;
  readonly dateKey: string;
  readonly month: number;
  readonly ratio: number;
}

export type ClusterBufferDay = ClusterDay & {
  readonly illum: number;
  readonly moonlessDarkMinutes: number;
};

export interface ClusterRun<T extends ClusterDay = ClusterDay> {
  startIdx: number;
  endIdx: number;
  avgRatio: number;
  inMonthCount: number;
  days: readonly T[];
}

export interface WindowGroup<T extends ClusterDay = ClusterDay> {
  available: boolean;
  text: string;
  dateKey: string;
  date: Date;
  dateKeys: string[];
  days: readonly T[];
  startIdx: number;
  endIdx: number;
}

export interface WindowClusters<T extends ClusterDay = ClusterDay> {
  early: WindowGroup<T>;
  best: WindowGroup<T>;
  late: WindowGroup<T>;
  monthName: string;
  shortMonth: string;
  bestRun: ClusterRun<T> | null;
}

export const BEST_MIN_RATIO = 90;
export const SHOULDER_MIN_RATIO = 70;

function emptyGroup<T extends ClusterDay>(text: string, date: Date): WindowGroup<T> {
  return {
    available: false,
    text,
    dateKey: '',
    date,
    dateKeys: [],
    days: [],
    startIdx: -1,
    endIdx: -1,
  };
}

function formatRange(startItem: ClusterDay, endItem: ClusterDay, timeZone: string): string {
  const sParts = siteParts(startItem.date, timeZone);
  const eParts = siteParts(endItem.date, timeZone);
  const sDay = sParts.day;
  const eDay = eParts.day;
  const sMonth = MONTHS_SHORT_EN[sParts.month - 1];
  const eMonth = MONTHS_SHORT_EN[eParts.month - 1];
  if (sParts.month === eParts.month) {
    if (sDay === eDay) return `${sDay} ${sMonth}`;
    return `${sDay} - ${eDay} ${sMonth}`;
  }
  return `${sDay} ${sMonth} - ${eDay} ${eMonth}`;
}

export function findBestRuns<T extends ClusterDay>(
  days: readonly T[],
  targetMonth: number
): ClusterRun<T>[] {
  assertMonthIndex(targetMonth);

  const allBestRuns: ClusterRun<T>[] = [];
  let currentStart: number | null = null;

  for (let i = 0; i < days.length; i++) {
    if (days[i].ratio >= BEST_MIN_RATIO) {
      if (currentStart === null) currentStart = i;
    } else {
      if (currentStart !== null) {
        const slice = days.slice(currentStart, i);
        const avg = slice.reduce((acc, c) => acc + c.ratio, 0) / slice.length;
        const inMonthCount = slice.filter((d) => d.month === targetMonth).length;
        allBestRuns.push({
          startIdx: currentStart,
          endIdx: i - 1,
          avgRatio: avg,
          inMonthCount,
          days: slice,
        });
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    const slice = days.slice(currentStart);
    const avg = slice.reduce((acc, c) => acc + c.ratio, 0) / slice.length;
    const inMonthCount = slice.filter((d) => d.month === targetMonth).length;
    allBestRuns.push({
      startIdx: currentStart,
      endIdx: days.length - 1,
      avgRatio: avg,
      inMonthCount,
      days: slice,
    });
  }

  return allBestRuns;
}

export function pickBestRun<T extends ClusterDay>(
  runs: readonly ClusterRun<T>[]
): ClusterRun<T> | null {
  if (runs.length === 0) return null;

  const relevantRuns = runs.filter((r) => r.inMonthCount > 0);
  const sorted = [...relevantRuns].sort((a, b) => {
    if (b.inMonthCount !== a.inMonthCount) {
      return b.inMonthCount - a.inMonthCount;
    }
    const lenA = a.endIdx - a.startIdx;
    const lenB = b.endIdx - b.startIdx;
    if (lenA !== lenB) {
      return lenB - lenA;
    }
    return b.avgRatio - a.avgRatio;
  });

  return sorted[0] || null;
}

export function computeWindowClusters<T extends ClusterDay>(
  days: readonly T[],
  targetMonth: number,
  timeZone: string,
  fallbackDate: Date
): WindowClusters<T> {
  assertMonthIndex(targetMonth);

  const monthName = MONTHS_EN[targetMonth];
  const shortMonth = MONTHS_SHORT_EN[targetMonth];

  const allBestRuns = findBestRuns(days, targetMonth);
  const bestCluster = pickBestRun(allBestRuns);

  if (!bestCluster) {
    return {
      monthName,
      shortMonth,
      early: emptyGroup('-', fallbackDate),
      best: emptyGroup('Not Available This Month', fallbackDate),
      late: emptyGroup('-', fallbackDate),
      bestRun: null,
    };
  }

  const bestDaysSlice = days.slice(bestCluster.startIdx, bestCluster.endIdx + 1);
  const enIyiText = formatRange(days[bestCluster.startIdx], days[bestCluster.endIdx], timeZone);

  // Early shoulder: adjacent to bestCluster.startIdx going backwards
  const earlyEligibleIdxs: number[] = [];
  for (let i = bestCluster.startIdx - 1; i >= 0; i--) {
    if (days[i].ratio >= SHOULDER_MIN_RATIO && days[i].ratio < BEST_MIN_RATIO) {
      earlyEligibleIdxs.unshift(i);
    } else {
      break;
    }
  }

  const earlyAvailable = earlyEligibleIdxs.length > 0;
  const earlyStartIdx = earlyAvailable ? earlyEligibleIdxs[0] : -1;
  const earlyEndIdx = earlyAvailable ? earlyEligibleIdxs[earlyEligibleIdxs.length - 1] : -1;
  const earlyDaysSlice = earlyAvailable ? days.slice(earlyStartIdx, earlyEndIdx + 1) : [];
  const erkenText = earlyAvailable
    ? formatRange(days[earlyStartIdx], days[earlyEndIdx], timeZone)
    : '-';

  // Late shoulder: adjacent to bestCluster.endIdx going forwards
  const lateEligibleIdxs: number[] = [];
  for (let i = bestCluster.endIdx + 1; i < days.length; i++) {
    if (days[i].ratio >= SHOULDER_MIN_RATIO && days[i].ratio < BEST_MIN_RATIO) {
      lateEligibleIdxs.push(i);
    } else {
      break;
    }
  }

  const lateAvailable = lateEligibleIdxs.length > 0;
  const lateStartIdx = lateAvailable ? lateEligibleIdxs[0] : -1;
  const lateEndIdx = lateAvailable ? lateEligibleIdxs[lateEligibleIdxs.length - 1] : -1;
  const lateDaysSlice = lateAvailable ? days.slice(lateStartIdx, lateEndIdx + 1) : [];
  const gecText = lateAvailable
    ? formatRange(days[lateStartIdx], days[lateEndIdx], timeZone)
    : '-';

  return {
    monthName,
    shortMonth,
    early: earlyAvailable
      ? {
          available: true,
          text: erkenText,
          dateKey: days[earlyStartIdx].dateKey,
          date: days[earlyStartIdx].date,
          dateKeys: earlyDaysSlice.map((d) => d.dateKey),
          days: earlyDaysSlice,
          startIdx: earlyStartIdx,
          endIdx: earlyEndIdx,
        }
      : emptyGroup('-', fallbackDate),
    best: {
      available: true,
      text: enIyiText,
      dateKey: days[bestCluster.startIdx].dateKey,
      date: days[bestCluster.startIdx].date,
      dateKeys: bestDaysSlice.map((d) => d.dateKey),
      days: bestDaysSlice,
      startIdx: bestCluster.startIdx,
      endIdx: bestCluster.endIdx,
    },
    late: lateAvailable
      ? {
          available: true,
          text: gecText,
          dateKey: days[lateStartIdx].dateKey,
          date: days[lateStartIdx].date,
          dateKeys: lateDaysSlice.map((d) => d.dateKey),
          days: lateDaysSlice,
          startIdx: lateStartIdx,
          endIdx: lateEndIdx,
        }
      : emptyGroup('-', fallbackDate),
    bestRun: bestCluster,
  };
}
