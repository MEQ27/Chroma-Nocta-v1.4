import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { calculateNightEphemeris } from '../lib/ephemeris';
import {
  siteParts,
  siteDateKey,
  currentNightKey,
  parseDateKey,
  zonedTimeToInstant,
} from '../lib/siteTime';
import { MONTHS_EN } from '../lib/calendarNames';

export const PreciseMoonIcon: React.FC<{
  phase: number;
  size?: number;
  className?: string;
  latitude?: number;
  isSouthern?: boolean;
}> = ({ phase, size = 18, className = '', latitude, isSouthern }) => {
  const isSouth = isSouthern ?? (typeof latitude === 'number' ? latitude < 0 : false);
  const p = ((phase % 1) + 1) % 1;
  const r = 46;
  const cx = 50;
  const cy = 50;

  if (p < 0.025 || p > 0.975) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={`shrink-0 ${isSouth ? 'scale-x-[-1]' : ''} ${className}`}
        style={isSouth ? { transform: 'scaleX(-1)', transformOrigin: 'center' } : undefined}
      >
        <circle cx={cx} cy={cy} r={r} fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r - 4} fill="#0b0f19" />
      </svg>
    );
  }

  if (p >= 0.48 && p <= 0.52) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        className={`shrink-0 ${isSouth ? 'scale-x-[-1]' : ''} ${className}`}
        style={isSouth ? { transform: 'scaleX(-1)', transformOrigin: 'center' } : undefined}
      >
        <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx={cx - 10} cy={cy - 10} r="6" fill="#f1f5f9" opacity="0.6" />
        <circle cx={cx + 12} cy={cy + 8} r="8" fill="#f1f5f9" opacity="0.6" />
      </svg>
    );
  }

  const angle = p * 2 * Math.PI;
  const c = Math.cos(angle);
  const rx = Math.max(0.5, Math.abs(c) * r);
  let pathD = '';

  if (p < 0.5) {
    const sweepTerm = p < 0.25 ? 0 : 1;
    pathD = `M 50 6 A 44 44 0 0 1 50 94 A ${rx.toFixed(2)} 44 0 0 ${sweepTerm} 50 6 Z`;
  } else {
    const sweepTerm = p < 0.75 ? 0 : 1;
    pathD = `M 50 6 A 44 44 0 0 0 50 94 A ${rx.toFixed(2)} 44 0 0 ${sweepTerm} 50 6 Z`;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 ${isSouth ? 'scale-x-[-1]' : ''} ${className}`}
      style={isSouth ? { transform: 'scaleX(-1)', transformOrigin: 'center' } : undefined}
    >
      <circle cx={cx} cy={cy} r={r} fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
      <circle cx="37" cy="35" r="7" fill="#0f172a" opacity="0.45" />
      <circle cx="56" cy="37" r="8" fill="#0f172a" opacity="0.45" />
      <circle cx="47" cy="57" r="9" fill="#0f172a" opacity="0.4" />
      <path d={pathD} fill="#f8fafc" />
    </svg>
  );
};

export interface MiniCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  latitude: number;
  longitude: number;
  elevation: number;
  timeZone: string;
  siteTodayKey?: string;
  activeWindowDateKeys?: Set<string>;
  windowGroup?: 'early' | 'best' | 'late';
}

export const MiniCalendarModal: React.FC<MiniCalendarModalProps> = ({
  isOpen,
  onClose,
  selectedDate,
  onSelectDate,
  latitude,
  longitude,
  elevation,
  timeZone,
  siteTodayKey,
  activeWindowDateKeys,
  windowGroup,
}) => {
  const tz = timeZone;
  const selParts = siteParts(selectedDate, tz);
  const [viewYear, setViewYear] = useState<number>(selParts.year);
  const [viewMonth, setViewMonth] = useState<number>(selParts.month - 1);

  useEffect(() => {
    if (isOpen) {
      const p = siteParts(selectedDate, tz);
      setViewYear(p.year);
      setViewMonth(p.month - 1);
    }
  }, [isOpen, selectedDate, tz]);

  const today = useMemo(() => {
    const key = siteTodayKey || currentNightKey(Date.now(), tz);
    const parts = parseDateKey(key);
    return zonedTimeToInstant(parts.year, parts.month, parts.day, 12, 0, 0, tz);
  }, [siteTodayKey, tz]);

  const monthData = useMemo(() => {
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const firstDayOfWeek = (new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay() + 6) % 7;
    const days: {
      dayNum: number;
      dateKey: string;
      date: Date;
      phase: number;
      illumination: number;
      isNewMoon: boolean;
    }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = zonedTimeToInstant(viewYear, viewMonth + 1, d, 12, 0, 0, tz);
      const ephem = calculateNightEphemeris(curDate, latitude, longitude, elevation, tz);
      days.push({
        dayNum: d,
        dateKey: ephem.dateKey,
        date: curDate,
        phase: ephem.moonPhase,
        illumination: ephem.moonIllumination,
        isNewMoon: ephem.moonIllumination <= 15,
      });
    }

    return { firstDayOfWeek, daysInMonth, days };
  }, [viewYear, viewMonth, latitude, longitude, elevation, tz]);

  const monthName = useMemo(() => {
    return `${MONTHS_EN[viewMonth]} ${viewYear}`;
  }, [viewYear, viewMonth]);

  if (!isOpen) return null;

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-sm rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl p-4 sm:p-5 relative animate-in zoom-in-95 duration-150 text-[var(--theme-text)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-3">
          <span className="text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-theme-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-theme-primary" /> Calendar Navigator
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-theme-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-1 mb-2.5">
          <button
            onClick={() => {
              if (viewMonth === 0) {
                setViewMonth(11);
                setViewYear((y) => y - 1);
              } else {
                setViewMonth((m) => m - 1);
              }
            }}
            className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-white transition-all active:scale-95 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono font-bold text-sm text-white capitalize">{monthName}</span>
          <button
            onClick={() => {
              if (viewMonth === 11) {
                setViewMonth(0);
                setViewYear((y) => y + 1);
              } else {
                setViewMonth((m) => m + 1);
              }
            }}
            className="p-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-white transition-all active:scale-95 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] text-theme-muted uppercase mb-1">
          {weekdays.map((w, idx) => (
            <div key={idx} className="py-0.5 font-semibold">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 text-center font-mono text-xs">
          {Array.from({ length: monthData.firstDayOfWeek }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-10" />
          ))}
          {monthData.days.map(({ dayNum, dateKey, date, phase, isNewMoon }) => {
            const isSelected = dateKey === siteDateKey(selectedDate, tz);
            const isToday = dateKey === (siteTodayKey || currentNightKey(Date.now(), tz));
            const isInActiveWindow =
              activeWindowDateKeys !== undefined && activeWindowDateKeys.has(dateKey);

            return (
              <button
                key={dayNum}
                onClick={() => {
                  onSelectDate(date);
                  onClose();
                }}
                className={`h-10 rounded-xl flex flex-col items-center justify-center p-0.5 relative transition-all active:scale-95 cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-400 text-black font-extrabold shadow-md ring-2 ring-cyan-300'
                    : isToday
                    ? 'bg-white/15 text-white font-bold border border-cyan-400/50 hover:bg-white/20'
                    : isInActiveWindow
                    ? windowGroup === 'best'
                      ? 'border border-cyan-400/80 bg-cyan-950/30 text-cyan-200'
                      : 'border border-amber-400/80 bg-amber-950/30 text-amber-200'
                    : 'bg-black/30 text-slate-200 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <span className="text-[11px] leading-tight font-bold">{dayNum}</span>
                <div className="mt-0.5">
                  <PreciseMoonIcon phase={phase} size={12} latitude={latitude} />
                </div>
                {isInActiveWindow && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full absolute bottom-0.5 ${
                      isSelected
                        ? 'bg-black'
                        : windowGroup === 'best'
                        ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]'
                        : 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                    }`}
                  />
                )}
                {!isInActiveWindow && isNewMoon && (
                  <span className="w-1 h-1 rounded-full absolute bottom-0.5 bg-cyan-400/40" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-theme-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
            <span>Optimal Window Days</span>
          </div>
          <button
            onClick={() => {
              onSelectDate(today);
              onClose();
            }}
            className="text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer"
          >
            Today
          </button>
        </div>
      </div>
    </div>
  );
};
