import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { SolarEphemerisDay } from '../types';
import { getSolarCoordinates, getLunarCoordinates, getHorizontalCoordinates } from '../lib/ephemeris';
import { siteNoon, siteParts, formatSiteTimeHM } from '../lib/siteTime';
import { getSmoothSplinePath } from '../lib/splinePath';
import { MONTHS_SHORT_EN } from '../lib/calendarNames';
import { degToCompass } from '../lib/weatherService';

export interface AltitudeCurveProps {
  days: readonly SolarEphemerisDay[];
  latitude: number;
  longitude: number;
  timeZone: string;
  horizonProfile?: readonly number[];
}

const VIEW_BOX_HEIGHT = 225;
const PAD_LEFT = 45;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 45;
const PLOT_HEIGHT = VIEW_BOX_HEIGHT - PAD_TOP - PAD_BOTTOM;

function altToY(alt: number): number {
  const clamped = Math.max(-92, Math.min(92, alt));
  return PAD_TOP + ((92 - clamped) / 184) * PLOT_HEIGHT;
}

const ALT_MARKS: readonly number[] = [90, 60, 30, 0, -30, -60, -90];

const THREE_HOUR_TICKS: readonly number[] = [
  0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57, 60, 63, 66, 69, 72,
];

const MIDNIGHT_OFFSETS: readonly number[] = [12, 36, 60];

// Fractional midpoints between midnights: [6/72, 24/72, 48/72, 66/72]
const DATE_MIDPOINTS: readonly number[] = [6, 24, 48, 66];

interface MoonDaySegment {
  dIdx: number;
  path: string;
  strokeWidth: number;
  opacity: number;
}

export const AltitudeCurve: React.FC<AltitudeCurveProps> = ({
  days,
  latitude,
  longitude,
  timeZone,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(640);
  const [scrubRatio, setScrubRatio] = useState<number>(0.1667);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const scrollAnimRef = useRef<number | null>(null);
  const scrollDirRef = useRef<-1 | 0 | 1>(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateWidth();
      });
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const dayPlotWidth = Math.max(260, containerWidth - PAD_LEFT - PAD_RIGHT);
  const plotWidth = dayPlotWidth * 3;
  const viewBoxWidth = PAD_LEFT + plotWidth + PAD_RIGHT;

  const baseDay = days[0];
  const startMs = useMemo(() => {
    if (!baseDay) return 0;
    return siteNoon(baseDay.dateKey, timeZone).getTime();
  }, [baseDay, timeZone]);

  const totalDurationMs = 72 * 3600 * 1000;
  const endMs = useMemo(() => startMs + totalDurationMs, [startMs, totalDurationMs]);

  const sunPoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    if (!days || days.length === 0 || totalDurationMs <= 0) return pts;
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      if (!day) continue;
      const dayStartMs = siteNoon(day.dateKey, timeZone).getTime();
      const count = day.timeline.length;
      for (let i = 0; i < count; i++) {
        const seg = day.timeline[i];
        if (!seg) continue;
        const ptMs = dayStartMs + (i / Math.max(1, count - 1)) * 24 * 3600 * 1000;
        const frac = (ptMs - startMs) / totalDurationMs;
        if (frac >= 0 && frac <= 1) {
          const x = PAD_LEFT + frac * plotWidth;
          const y = altToY(seg.sunAltitude);
          pts.push({ x, y });
        }
      }
    }
    return pts;
  }, [days, startMs, totalDurationMs, timeZone, plotWidth]);

  const sunPath = useMemo(() => getSmoothSplinePath(sunPoints), [sunPoints]);

  const galCorePoints = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    if (!days || days.length === 0 || totalDurationMs <= 0) return pts;
    const stepCount = 144;
    for (let i = 0; i <= stepCount; i++) {
      const ptMs = startMs + (i / stepCount) * totalDurationMs;
      const t = new Date(ptMs);
      const horiz = getHorizontalCoordinates(t, 17.7611, -29.0078, latitude, longitude);
      const frac = (ptMs - startMs) / totalDurationMs;
      if (frac >= 0 && frac <= 1) {
        const x = PAD_LEFT + frac * plotWidth;
        const y = altToY(horiz.altitude);
        pts.push({ x, y });
      }
    }
    return pts;
  }, [days, startMs, totalDurationMs, latitude, longitude, plotWidth]);

  const galCorePath = useMemo(() => getSmoothSplinePath(galCorePoints), [galCorePoints]);

  const moonDaySegments = useMemo(() => {
    const segments: MoonDaySegment[] = [];
    if (!days || days.length === 0 || totalDurationMs <= 0) return segments;

    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      if (!day) continue;
      const dayStartMs = siteNoon(day.dateKey, timeZone).getTime();
      const count = day.timeline.length;
      const pts: { x: number; y: number }[] = [];

      for (let i = 0; i < count; i++) {
        const seg = day.timeline[i];
        if (!seg) continue;
        const ptMs = dayStartMs + (i / Math.max(1, count - 1)) * 24 * 3600 * 1000;
        const frac = (ptMs - startMs) / totalDurationMs;
        if (frac >= 0 && frac <= 1) {
          const x = PAD_LEFT + frac * plotWidth;
          const y = altToY(seg.moonAltitude);
          pts.push({ x, y });
        }
      }

      const nextDay = days[d + 1];
      if (nextDay && nextDay.timeline.length > 0) {
        const firstNextSeg = nextDay.timeline[0];
        if (firstNextSeg) {
          const nextDayStartMs = siteNoon(nextDay.dateKey, timeZone).getTime();
          const fracNext = (nextDayStartMs - startMs) / totalDurationMs;
          if (fracNext >= 0 && fracNext <= 1) {
            pts.push({
              x: PAD_LEFT + fracNext * plotWidth,
              y: altToY(firstNextSeg.moonAltitude),
            });
          }
        }
      }

      const path = getSmoothSplinePath(pts);
      const strokeWidth = 1.4 + (day.moonIllumination / 100) * 1.6;
      const opacity = 0.6 + (day.moonIllumination / 100) * 0.4;

      segments.push({
        dIdx: d,
        path,
        strokeWidth,
        opacity,
      });
    }
    return segments;
  }, [days, startMs, totalDurationMs, timeZone, plotWidth]);

  const activeDayIndex = Math.min(
    Math.max(0, days.length - 1),
    Math.max(0, Math.floor(scrubRatio * 3))
  );
  const activeDay = days[activeDayIndex] ?? baseDay;

  const sessionDateLabels = useMemo(() => {
    return DATE_MIDPOINTS.map((hCenter) => {
      const t = new Date(startMs + hCenter * 3600 * 1000);
      const p = siteParts(t, timeZone);
      const mName = MONTHS_SHORT_EN[p.month - 1] ?? '';
      const dateStr = `${p.day} ${mName} ${p.year}`;
      const x = PAD_LEFT + (hCenter / 72) * plotWidth;
      return { hCenter, dateStr, x };
    });
  }, [startMs, timeZone, plotWidth]);

  const updateScrub = useCallback((clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xInSvg = ((clientX - rect.left) / rect.width) * viewBoxWidth;
    const ratio = Math.max(0, Math.min(1, (xInSvg - PAD_LEFT) / plotWidth));
    setScrubRatio(ratio);

    const c = containerRef.current;
    if (c) {
      const cRect = c.getBoundingClientRect();
      const distLeft = clientX - cRect.left;
      const distRight = cRect.right - clientX;
      if (distLeft < 40) {
        scrollDirRef.current = -1;
      } else if (distRight < 40) {
        scrollDirRef.current = 1;
      } else {
        scrollDirRef.current = 0;
      }
    }
  }, [viewBoxWidth, plotWidth]);

  const stopScrollLoop = useCallback(() => {
    scrollDirRef.current = 0;
    if (scrollAnimRef.current !== null) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  const startScrollLoop = useCallback(() => {
    if (scrollAnimRef.current !== null) return;
    const step = () => {
      const c = containerRef.current;
      const dir = scrollDirRef.current;
      if (c && dir !== 0) {
        c.scrollLeft += dir * 12.0;
        scrollAnimRef.current = requestAnimationFrame(step);
      } else {
        scrollAnimRef.current = null;
      }
    };
    scrollAnimRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    return () => {
      stopScrollLoop();
    };
  }, [stopScrollLoop]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsScrubbing(true);
    updateScrub(e.clientX);
    startScrollLoop();
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isScrubbing) {
      updateScrub(e.clientX);
      startScrollLoop();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    setIsScrubbing(false);
    stopScrollLoop();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const scrubTelemetry = useMemo(() => {
    const currentMs = startMs + scrubRatio * totalDurationMs;
    const t = new Date(currentMs);

    const sunCoords = getSolarCoordinates(t);
    const sunHoriz = getHorizontalCoordinates(t, sunCoords.ra, sunCoords.dec, latitude, longitude);

    const moonCoords = getLunarCoordinates(t);
    const moonHoriz = getHorizontalCoordinates(t, moonCoords.ra, moonCoords.dec, latitude, longitude);

    const tPlus = new Date(currentMs + 60 * 1000);
    const tMinus = new Date(currentMs - 60 * 1000);

    const sCoordsPlus = getSolarCoordinates(tPlus);
    const sHorizPlus = getHorizontalCoordinates(tPlus, sCoordsPlus.ra, sCoordsPlus.dec, latitude, longitude);
    const sCoordsMinus = getSolarCoordinates(tMinus);
    const sHorizMinus = getHorizontalCoordinates(tMinus, sCoordsMinus.ra, sCoordsMinus.dec, latitude, longitude);
    const sunRate = (sHorizPlus.altitude - sHorizMinus.altitude) * 30;

    const mCoordsPlus = getLunarCoordinates(tPlus);
    const mHorizPlus = getHorizontalCoordinates(tPlus, mCoordsPlus.ra, mCoordsPlus.dec, latitude, longitude);
    const mCoordsMinus = getLunarCoordinates(tMinus);
    const mHorizMinus = getHorizontalCoordinates(tMinus, mCoordsMinus.ra, mCoordsMinus.dec, latitude, longitude);
    const moonRate = (mHorizPlus.altitude - mHorizMinus.altitude) * 30;

    const sunAz = Math.round(((sunHoriz.azimuth % 360) + 360) % 360) % 360;
    const sunCardinal = degToCompass(sunAz);
    const moonAz = Math.round(((moonHoriz.azimuth % 360) + 360) % 360) % 360;
    const moonCardinal = degToCompass(moonAz);

    const galHoriz = getHorizontalCoordinates(t, 17.7611, -29.0078, latitude, longitude);
    const gCoordsPlus = getHorizontalCoordinates(tPlus, 17.7611, -29.0078, latitude, longitude);
    const gCoordsMinus = getHorizontalCoordinates(tMinus, 17.7611, -29.0078, latitude, longitude);
    const galCoreRate = (gCoordsPlus.altitude - gCoordsMinus.altitude) * 30;
    const galCoreAz = Math.round(((galHoriz.azimuth % 360) + 360) % 360) % 360;
    const galCoreCardinal = degToCompass(galCoreAz);

    const p = siteParts(t, timeZone);
    const hh = String(p.hour).padStart(2, '0');
    const mm = String(p.minute).padStart(2, '0');
    const timeHM = `${hh}:${mm}`;

    const upcomingEvents: { label: string; timeMs: number }[] = [];
    for (let d = 0; d < days.length; d++) {
      const day = days[d];
      if (!day) continue;
      if (day.sunset) upcomingEvents.push({ label: 'Sunset', timeMs: day.sunset.getTime() });
      if (day.astroDusk) upcomingEvents.push({ label: 'Astro Dark', timeMs: day.astroDusk.getTime() });
      if (day.astroDawn) upcomingEvents.push({ label: 'Dawn', timeMs: day.astroDawn.getTime() });
      if (day.sunrise) upcomingEvents.push({ label: 'Sunrise', timeMs: day.sunrise.getTime() });
      if (day.moonrise) upcomingEvents.push({ label: 'Moonrise', timeMs: day.moonrise.getTime() });
      if (day.moonset) upcomingEvents.push({ label: 'Moonset', timeMs: day.moonset.getTime() });
    }

    upcomingEvents.sort((a, b) => a.timeMs - b.timeMs);

    let nextEventBadge = 'Cycle Complete';
    let nextEventType: 'sun' | 'moon' | 'darkness' | 'none' = 'none';
    for (let i = 0; i < upcomingEvents.length; i++) {
      const ev = upcomingEvents[i];
      if (ev && ev.timeMs > currentMs) {
        const diffMs = ev.timeMs - currentMs;
        const h = Math.floor(diffMs / 3600000);
        const m = Math.floor((diffMs % 3600000) / 60000);
        nextEventBadge = h > 0 ? `${ev.label} in ${h}h ${m}m` : `${ev.label} in ${m}m`;
        if (ev.label === 'Sunset' || ev.label === 'Sunrise') {
          nextEventType = 'sun';
        } else if (ev.label === 'Moonrise' || ev.label === 'Moonset') {
          nextEventType = 'moon';
        } else {
          nextEventType = 'darkness';
        }
        break;
      }
    }

    return {
      timeHM,
      nextEventBadge,
      nextEventType,
      sunAlt: sunHoriz.altitude,
      moonAlt: moonHoriz.altitude,
      galCoreAlt: galHoriz.altitude,
      sunRate,
      moonRate,
      galCoreRate,
      sunAz,
      sunCardinal,
      moonAz,
      moonCardinal,
      galCoreAz,
      galCoreCardinal,
      scrubX: PAD_LEFT + scrubRatio * plotWidth,
      sunY: altToY(sunHoriz.altitude),
      moonY: altToY(moonHoriz.altitude),
      galCoreY: altToY(galHoriz.altitude),
    };
  }, [startMs, scrubRatio, totalDurationMs, latitude, longitude, timeZone, days, plotWidth]);

  const sunsetInfo = useMemo(() => {
    if (!activeDay || !activeDay.sunset) return null;
    const ms = activeDay.sunset.getTime();
    if (ms < startMs || ms > endMs) return null;
    const x = PAD_LEFT + ((ms - startMs) / totalDurationMs) * plotWidth;
    const time = formatSiteTimeHM(activeDay.sunset, timeZone);
    return { x, time };
  }, [activeDay, startMs, endMs, totalDurationMs, timeZone, plotWidth]);

  const sunriseInfo = useMemo(() => {
    if (!activeDay || !activeDay.sunrise) return null;
    const ms = activeDay.sunrise.getTime();
    if (ms < startMs || ms > endMs) return null;
    const x = PAD_LEFT + ((ms - startMs) / totalDurationMs) * plotWidth;
    const time = formatSiteTimeHM(activeDay.sunrise, timeZone);
    return { x, time };
  }, [activeDay, startMs, endMs, totalDurationMs, timeZone, plotWidth]);

  const moonriseInfo = useMemo(() => {
    if (!activeDay || !activeDay.moonrise) return null;
    const ms = activeDay.moonrise.getTime();
    if (ms < startMs || ms > endMs) return null;
    const x = PAD_LEFT + ((ms - startMs) / totalDurationMs) * plotWidth;
    const time = formatSiteTimeHM(activeDay.moonrise, timeZone);
    return { x, time };
  }, [activeDay, startMs, endMs, totalDurationMs, timeZone, plotWidth]);

  const moonsetInfo = useMemo(() => {
    if (!activeDay || !activeDay.moonset) return null;
    const ms = activeDay.moonset.getTime();
    if (ms < startMs || ms > endMs) return null;
    const x = PAD_LEFT + ((ms - startMs) / totalDurationMs) * plotWidth;
    const time = formatSiteTimeHM(activeDay.moonset, timeZone);
    return { x, time };
  }, [activeDay, startMs, endMs, totalDurationMs, timeZone, plotWidth]);

  const nadirInfo = useMemo(() => {
    if (!activeDay || activeDay.timeline.length === 0) return null;
    let minSeg = activeDay.timeline[0];
    for (let i = 1; i < activeDay.timeline.length; i++) {
      const seg = activeDay.timeline[i];
      if (seg && minSeg && seg.sunAltitude < minSeg.sunAltitude) {
        minSeg = seg;
      }
    }
    if (!minSeg) return null;
    return { time: formatSiteTimeHM(minSeg.time, timeZone) };
  }, [activeDay, timeZone]);

  const y0 = altToY(0);
  const yMinus18 = altToY(-18);
  const skyHeight = Math.max(0, y0 - PAD_TOP);

  const sunBadgeX = Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, scrubTelemetry.scrubX - 22));
  const sunBadgeY = scrubTelemetry.sunY < PAD_TOP + 24 ? scrubTelemetry.sunY + 8 : scrubTelemetry.sunY - 22;

  const isNearSun = Math.abs(scrubTelemetry.moonY - scrubTelemetry.sunY) < 26;
  const moonBadgeX = Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, scrubTelemetry.scrubX - 22));
  let moonBadgeY = scrubTelemetry.moonY < PAD_TOP + 24 ? scrubTelemetry.moonY + 8 : scrubTelemetry.moonY - 22;
  if (isNearSun) {
    if (scrubTelemetry.moonY >= scrubTelemetry.sunY) {
      moonBadgeY = scrubTelemetry.moonY + 8;
    } else {
      moonBadgeY = scrubTelemetry.moonY - 22;
    }
  }

  const galBadgeX = Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, scrubTelemetry.scrubX - 22));
  const galBadgeY = scrubTelemetry.galCoreY < PAD_TOP + 24 ? scrubTelemetry.galCoreY + 8 : scrubTelemetry.galCoreY - 22;

  let eventBadgeColorClass = 'text-slate-300 border border-slate-500/40 bg-slate-950/50';
  if (scrubTelemetry.nextEventType === 'sun') {
    eventBadgeColorClass = 'text-amber-300 border border-amber-500/40 bg-amber-950/50';
  } else if (scrubTelemetry.nextEventType === 'moon') {
    eventBadgeColorClass = 'text-cyan-300 border border-cyan-500/40 bg-cyan-950/50';
  } else if (scrubTelemetry.nextEventType === 'darkness') {
    eventBadgeColorClass = 'text-indigo-300 border border-indigo-500/40 bg-indigo-950/50';
  }

  if (!baseDay) return null;

  return (
    <div className="w-full flex flex-col rounded-2xl border border-theme bg-[var(--theme-card)]/80 p-3 sm:p-4 shadow-lg backdrop-blur-md">
      {/* Header & Title */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs sm:text-sm font-mono font-bold uppercase tracking-wider text-white">
          CELESTIAL ELEVATION CHART
        </span>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-1.5 rounded-full bg-[#f59e0b]" />
            <span className="text-slate-300">Sun</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-1.5 rounded-full bg-[#38bdf8]" />
            <span className="text-slate-300">Moon</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-1.5 rounded-full bg-[#c084fc]" />
            <span className="text-slate-300">Galactic Core</span>
          </div>
        </div>
      </div>

      {/* Edge-Pan Scrollable SVG Container (Dynamic 1-Day Viewport Lock) */}
      <div
        ref={containerRef}
        className="relative w-full overflow-x-auto touch-pan-x scrollbar-none select-none h-[225px]"
      >
        <svg
          ref={svgRef}
          width={viewBoxWidth}
          height={VIEW_BOX_HEIGHT}
          viewBox={`0 0 ${viewBoxWidth} ${VIEW_BOX_HEIGHT}`}
          className="max-w-none shrink-0 block cursor-crosshair"
          style={{
            width: `${viewBoxWidth}px`,
            minWidth: `${viewBoxWidth}px`,
            maxWidth: 'none',
            height: `${VIEW_BOX_HEIGHT}px`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <defs>
            <filter id="moonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#38bdf8" floodOpacity={0.85} />
            </filter>
            <filter id="silverGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#ffffff" floodOpacity={0.5} />
            </filter>
          </defs>

          {/* Layer A — Sub-Horizon Zones (Solid Horizontal Bands) */}
          {/* Twilight Corridor (0° to -18°): Solid distinct steel-gray */}
          <rect
            x={PAD_LEFT}
            y={y0}
            width={plotWidth}
            height={Math.max(0, yMinus18 - y0)}
            fill="#334155"
          />
          {/* Astro Dark Void (Below -18°): Solid pitch black */}
          <rect
            x={PAD_LEFT}
            y={yMinus18}
            width={plotWidth}
            height={Math.max(0, PAD_TOP + PLOT_HEIGHT - yMinus18)}
            fill="#020617"
          />

          {/* Layer B — Above 0° Sky Region ONLY */}
          {/* Base Sky Background */}
          <rect
            x={PAD_LEFT}
            y={PAD_TOP}
            width={plotWidth}
            height={skyHeight}
            fill="#020617"
          />

          {/* Vertical Timeline Stripes (Day Navy #172554, Twilight Purple #3b0764, Night Black #020617 bounded strictly to skyHeight) */}
          {days.map((dItem, dIdx) => {
            const dayStart = siteNoon(dItem.dateKey, timeZone).getTime();
            const count = dItem.timeline.length;
            if (count < 2) return null;
            return dItem.timeline.slice(0, -1).map((seg, i) => {
              if (!seg) return null;
              const segStartMs = dayStart + (i / (count - 1)) * 24 * 3600 * 1000;
              const segEndMs = dayStart + ((i + 1) / (count - 1)) * 24 * 3600 * 1000;
              const fracStart = (segStartMs - startMs) / totalDurationMs;
              const fracEnd = (segEndMs - startMs) / totalDurationMs;
              const x = PAD_LEFT + fracStart * plotWidth;
              const nextX = PAD_LEFT + fracEnd * plotWidth;
              const w = Math.max(0.5, nextX - x + 0.3);

              let fill = '#020617';
              if (seg.sunAltitude > 0) {
                fill = '#172554';
              } else if (seg.sunAltitude > -18) {
                fill = '#3b0764';
              }

              return (
                <rect
                  key={`stripe-${dIdx}-${i}`}
                  x={x}
                  y={PAD_TOP}
                  width={w}
                  height={skyHeight}
                  fill={fill}
                />
              );
            });
          })}

          {/* Horizontal Reference Lines (Drawn cleanly OVER the background) */}
          {/* 0° Optical Horizon Line */}
          <line
            x1={PAD_LEFT}
            y1={y0}
            x2={PAD_LEFT + plotWidth}
            y2={y0}
            stroke="rgba(226, 232, 240, 0.7)"
            strokeWidth="1.2"
          />
          <text
            x={PAD_LEFT + 6}
            y={y0 - 4}
            fill="rgba(255, 255, 255, 0.7)"
            fontSize="9"
            fontFamily="monospace"
          >
            Horizon
          </text>

          {/* -18° Astro Dark Threshold Line */}
          <line
            x1={PAD_LEFT}
            y1={yMinus18}
            x2={PAD_LEFT + plotWidth}
            y2={yMinus18}
            stroke="#38bdf8"
            strokeDasharray="4 3"
            strokeWidth="1.2"
          />
          <text
            x={PAD_LEFT + 6}
            y={yMinus18 - 4}
            fill="rgba(56, 189, 248, 0.9)"
            fontSize="9"
            fontFamily="monospace"
          >
            Astro Dark
          </text>

          {/* Thin Silver Midnight (00:00) Lines with Subtle Glow */}
          {MIDNIGHT_OFFSETS.map((hOffset) => {
            const x = PAD_LEFT + (hOffset / 72) * plotWidth;
            return (
              <line
                key={`midnight-line-${hOffset}`}
                x1={x}
                y1={PAD_TOP}
                x2={x}
                y2={PAD_TOP + PLOT_HEIGHT}
                stroke="#e2e8f0"
                strokeWidth="1.2"
                strokeDasharray="none"
                filter="url(#silverGlow)"
              />
            );
          })}

          {/* Clean Gridless Y-axis Labels on Left: +90, +60, +30, 0, -30, -60, -90 */}
          {ALT_MARKS.map((alt) => {
            const y = altToY(alt);
            return (
              <text
                key={`alt-label-${alt}`}
                x={PAD_LEFT - 6}
                y={y + 3}
                textAnchor="end"
                fill="rgba(148, 163, 184, 0.85)"
                fontSize="10"
                fontFamily="monospace"
              >
                {alt > 0 ? `+${alt}°` : `${alt}°`}
              </text>
            );
          })}

          {/* Row 1: Gridless X-Axis 3-Hour Interval Ticks */}
          {THREE_HOUR_TICKS.map((h) => {
            const x = PAD_LEFT + (h / 72) * plotWidth;
            const hourInDay = (12 + h) % 24;
            const isMidnight = hourInDay === 0;
            const label = `${String(hourInDay).padStart(2, '0')}:00`;

            return (
              <text
                key={`tick-3h-${h}`}
                x={x}
                y={PAD_TOP + PLOT_HEIGHT + 14}
                textAnchor="middle"
                fill={isMidnight ? '#e2e8f0' : 'rgba(148, 163, 184, 0.75)'}
                fontSize={isMidnight ? '10' : '9.5'}
                fontFamily="monospace"
                fontWeight={isMidnight ? 'bold' : 'normal'}
              >
                {label}
              </text>
            );
          })}

          {/* Row 2: Session Dates Placed at Fractional Midpoints [6/72, 24/72, 48/72, 66/72] */}
          {sessionDateLabels.map((lbl) => {
            return (
              <text
                key={`date-midpoint-${lbl.hCenter}`}
                x={lbl.x}
                y={PAD_TOP + PLOT_HEIGHT + 28}
                textAnchor="middle"
                fill="#38bdf8"
                fontSize="10.5"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {lbl.dateStr}
              </text>
            );
          })}

          {/* Minimal Rise/Set Crossing Badges (Time Only, Active Day Only) */}
          {sunsetInfo && (
            <g key="sunset-marker">
              <line
                x1={sunsetInfo.x}
                y1={PAD_TOP}
                x2={sunsetInfo.x}
                y2={PAD_TOP + PLOT_HEIGHT}
                stroke="rgba(245, 158, 11, 0.5)"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <rect
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, sunsetInfo.x - 22))}
                y={PAD_TOP + 4}
                width={44}
                height={16}
                rx={4}
                fill="rgba(245, 158, 11, 0.2)"
                stroke="#f59e0b"
                strokeWidth={1}
              />
              <text
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, sunsetInfo.x - 22)) + 22}
                y={PAD_TOP + 15}
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {sunsetInfo.time}
              </text>
            </g>
          )}

          {sunriseInfo && (
            <g key="sunrise-marker">
              <line
                x1={sunriseInfo.x}
                y1={PAD_TOP}
                x2={sunriseInfo.x}
                y2={PAD_TOP + PLOT_HEIGHT}
                stroke="rgba(245, 158, 11, 0.5)"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <rect
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, sunriseInfo.x - 22))}
                y={PAD_TOP + 4}
                width={44}
                height={16}
                rx={4}
                fill="rgba(245, 158, 11, 0.2)"
                stroke="#f59e0b"
                strokeWidth={1}
              />
              <text
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, sunriseInfo.x - 22)) + 22}
                y={PAD_TOP + 15}
                textAnchor="middle"
                fill="#fbbf24"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {sunriseInfo.time}
              </text>
            </g>
          )}

          {moonriseInfo && (
            <g key="moonrise-marker">
              <line
                x1={moonriseInfo.x}
                y1={PAD_TOP}
                x2={moonriseInfo.x}
                y2={PAD_TOP + PLOT_HEIGHT}
                stroke="rgba(56, 189, 248, 0.45)"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <rect
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, moonriseInfo.x - 22))}
                y={PAD_TOP + 22}
                width={44}
                height={16}
                rx={4}
                fill="rgba(56, 189, 248, 0.2)"
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <text
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, moonriseInfo.x - 22)) + 22}
                y={PAD_TOP + 33}
                textAnchor="middle"
                fill="#38bdf8"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {moonriseInfo.time}
              </text>
            </g>
          )}

          {moonsetInfo && (
            <g key="moonset-marker">
              <line
                x1={moonsetInfo.x}
                y1={PAD_TOP}
                x2={moonsetInfo.x}
                y2={PAD_TOP + PLOT_HEIGHT}
                stroke="rgba(56, 189, 248, 0.45)"
                strokeDasharray="3 3"
                strokeWidth="1.2"
              />
              <rect
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, moonsetInfo.x - 22))}
                y={PAD_TOP + 22}
                width={44}
                height={16}
                rx={4}
                fill="rgba(56, 189, 248, 0.2)"
                stroke="#38bdf8"
                strokeWidth={1}
              />
              <text
                x={Math.max(PAD_LEFT + 2, Math.min(PAD_LEFT + plotWidth - 46, moonsetInfo.x - 22)) + 22}
                y={PAD_TOP + 33}
                textAnchor="middle"
                fill="#38bdf8"
                fontSize="9"
                fontFamily="monospace"
                fontWeight="bold"
              >
                {moonsetInfo.time}
              </text>
            </g>
          )}

          {/* Sun Curve */}
          {sunPath && (
            <path
              d={sunPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Moon Curves (Continuous per-day illumination stroke width & glow) */}
          {moonDaySegments.map((seg) => {
            if (!seg.path) return null;
            return (
              <path
                key={`moon-segment-${seg.dIdx}`}
                d={seg.path}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={seg.strokeWidth}
                opacity={seg.opacity}
                filter="url(#moonGlow)"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {/* Galactic Core Curve (Sgr A* RA 17.7611, Dec -29.0078) */}
          {galCorePath && (
            <path
              d={galCorePath}
              fill="none"
              stroke="#c084fc"
              strokeWidth="1.8"
              strokeDasharray="4 3"
              opacity={0.85}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Scrubber Hairline */}
          <line
            x1={scrubTelemetry.scrubX}
            y1={PAD_TOP}
            x2={scrubTelemetry.scrubX}
            y2={PAD_TOP + PLOT_HEIGHT}
            stroke="#38bdf8"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />

          {/* Floating Altitude Pins */}
          <g key="galcore-pin">
            <circle
              cx={scrubTelemetry.scrubX}
              cy={scrubTelemetry.galCoreY}
              r="3.5"
              fill="#c084fc"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <rect
              x={galBadgeX}
              y={galBadgeY}
              width="44"
              height="16"
              rx="4"
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#c084fc"
              strokeWidth={1}
            />
            <text
              x={galBadgeX + 22}
              y={galBadgeY + 11.5}
              textAnchor="middle"
              fill="#c084fc"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {scrubTelemetry.galCoreAlt > 0 ? `+${scrubTelemetry.galCoreAlt.toFixed(1)}°` : `${scrubTelemetry.galCoreAlt.toFixed(1)}°`}
            </text>
          </g>

          <g key="sun-pin">
            <circle
              cx={scrubTelemetry.scrubX}
              cy={scrubTelemetry.sunY}
              r="4"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <rect
              x={sunBadgeX}
              y={sunBadgeY}
              width="44"
              height="16"
              rx="4"
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#f59e0b"
              strokeWidth={1}
            />
            <text
              x={sunBadgeX + 22}
              y={sunBadgeY + 11.5}
              textAnchor="middle"
              fill="#f59e0b"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {scrubTelemetry.sunAlt > 0 ? `+${scrubTelemetry.sunAlt.toFixed(1)}°` : `${scrubTelemetry.sunAlt.toFixed(1)}°`}
            </text>
          </g>

          <g key="moon-pin">
            <circle
              cx={scrubTelemetry.scrubX}
              cy={scrubTelemetry.moonY}
              r="4"
              fill="#38bdf8"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <rect
              x={moonBadgeX}
              y={moonBadgeY}
              width="44"
              height="16"
              rx="4"
              fill="rgba(15, 23, 42, 0.9)"
              stroke="#38bdf8"
              strokeWidth={1}
            />
            <text
              x={moonBadgeX + 22}
              y={moonBadgeY + 11.5}
              textAnchor="middle"
              fill="#38bdf8"
              fontSize="9"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {scrubTelemetry.moonAlt > 0 ? `+${scrubTelemetry.moonAlt.toFixed(1)}°` : `${scrubTelemetry.moonAlt.toFixed(1)}°`}
            </text>
          </g>
        </svg>
      </div>

      {/* 2-Row Responsive Telemetry Footer */}
      <div className="flex flex-col mt-2 rounded-xl border border-slate-800/80 bg-black/50 overflow-hidden font-mono select-none">
        {/* Row 1: Time & Contextual Event Badge */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Time:</span>
            <span className="text-slate-100 font-bold text-sm tracking-wider">{scrubTelemetry.timeHM}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Next:</span>
            <span
              className={`px-2 py-0.5 rounded-md font-bold text-xs w-[165px] shrink-0 text-center justify-center flex items-center ${eventBadgeColorClass}`}
            >
              {scrubTelemetry.nextEventBadge}
            </span>
          </div>
        </div>

        {/* Row 2: Celestial Velocity (°/h rates) with Azimuth & Terrain Telemetry */}
        <div className="flex flex-wrap items-center justify-center gap-3 px-3 py-1.5 text-[11px] bg-slate-950/40 text-slate-300">
          <div className="flex items-center gap-1">
            <span>☀️ Sun:</span>
            <span className={`font-bold ${scrubTelemetry.sunRate >= 0 ? 'text-amber-400' : 'text-amber-300/70'}`}>
              {scrubTelemetry.sunRate >= 0
                ? `+${scrubTelemetry.sunRate.toFixed(1)}°/h ⇗`
                : `${scrubTelemetry.sunRate.toFixed(1)}°/h ⇘`}
            </span>
            <span className="text-slate-400 font-normal">
              ({scrubTelemetry.sunAz}° {scrubTelemetry.sunCardinal})
            </span>
          </div>
          <span className="text-white/10">|</span>
          <div className="flex items-center gap-1">
            <span>🌙 Moon:</span>
            <span className={`font-bold ${scrubTelemetry.moonRate >= 0 ? 'text-sky-300' : 'text-sky-300/70'}`}>
              {scrubTelemetry.moonRate >= 0
                ? `+${scrubTelemetry.moonRate.toFixed(1)}°/h ⇗`
                : `${scrubTelemetry.moonRate.toFixed(1)}°/h ⇘`}
            </span>
            <span className="text-slate-400 font-normal">
              ({scrubTelemetry.moonAz}° {scrubTelemetry.moonCardinal})
            </span>
          </div>
          <span className="text-white/10">|</span>
          <div className="flex items-center gap-1">
            <span>🌌 Core:</span>
            <span className={`font-bold ${scrubTelemetry.galCoreRate >= 0 ? 'text-purple-300' : 'text-purple-300/70'}`}>
              {scrubTelemetry.galCoreRate >= 0
                ? `+${scrubTelemetry.galCoreRate.toFixed(1)}°/h ⇗`
                : `${scrubTelemetry.galCoreRate.toFixed(1)}°/h ⇘`}
            </span>
            <span className="text-slate-400 font-normal">
              ({scrubTelemetry.galCoreAz}° {scrubTelemetry.galCoreCardinal})
            </span>
          </div>
          {baseDay.hasActiveTerrainMask && (
            <>
              <span className="text-white/10">|</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 font-semibold">
                🏔️ Terrain Active
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
