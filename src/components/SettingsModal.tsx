import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Check,
  Type,
  Gauge,
  Clock,
  ChevronDown,
  ShieldCheck,
  AlertCircle,
  BookOpen,
  Copy,
} from 'lucide-react';
import { ThemeId, UnitSystem } from '../types';
import { THEMES } from '../lib/theme';
import { runSelfCheck, SelfCheckReport } from '../lib/selfCheck';
import {
  AUDIT_TASKS,
  generateProjectStateMarkdown,
  AuditStatus,
} from '../docs/projectState';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
}

const FONT_OPTIONS = [
  { id: 'jetbrains', label: 'JetBrains Mono', font: "'JetBrains Mono', monospace" },
  { id: 'space', label: 'Space Mono', font: "'Space Mono', monospace" },
  { id: 'jakarta', label: 'Plus Jakarta Sans', font: "'Plus Jakarta Sans', sans-serif" },
];

const UNIT_OPTIONS: readonly { readonly id: UnitSystem; readonly label: string }[] = [
  { id: 'metric', label: 'Metric (°C, km/h)' },
  { id: 'imperial', label: 'Imperial (°F, mph)' },
];

const TIME_FORMAT_OPTIONS: readonly { readonly id: '24h' | '12h'; readonly label: string }[] = [
  { id: '24h', label: '24-Hour (23:14:05)' },
  { id: '12h', label: '12-Hour (11:14:05 PM)' },
];

function applyFont(fontId: string) {
  if (fontId === 'space') {
    document.body.style.fontFamily = "'Space Mono', monospace";
  } else if (fontId === 'jakarta') {
    document.body.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
  } else {
    document.body.style.fontFamily = "'JetBrains Mono', monospace";
  }
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  const [openDropdown, setOpenDropdown] = useState<'theme' | 'font' | 'unit' | 'timeFormat' | null>(null);
  const [unitSystem, setUnitSystem] = useState<UnitSystem>(() => {
    try {
      const val = localStorage.getItem('chroma_nocta_unit_system');
      if (val === 'imperial') return 'imperial';
    } catch {
      // fallback
    }
    return 'metric';
  });
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>(() => {
    try {
      const val = localStorage.getItem('chroma_nocta_time_format');
      if (val === '12h') return '12h';
    } catch {
      // fallback
    }
    return '24h';
  });
  const [fontFamily, setFontFamily] = useState<string>(() => {
    try {
      return localStorage.getItem('chroma_nocta_font_family') || 'jetbrains';
    } catch {
      return 'jetbrains';
    }
  });
  const [checkReport, setCheckReport] = useState<SelfCheckReport | null>(null);
  const [isDevNotesOpen, setIsDevNotesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const verifiedCount = AUDIT_TASKS.filter((t) => t.status === 'verified').length;
  const pendingCount = AUDIT_TASKS.filter((t) => t.status === 'pending').length;
  const openCount = AUDIT_TASKS.filter((t) => t.status === 'open').length;
  const failedCount = AUDIT_TASKS.filter((t) => t.status === 'failed').length;

  useEffect(() => {
    try {
      const saved = localStorage.getItem('chroma_nocta_font_family') || 'jetbrains';
      applyFont(saved);
    } catch {}
  }, []);

  const handleSelectUnit = (unit: UnitSystem) => {
    setUnitSystem(unit);
    try {
      localStorage.setItem('chroma_nocta_unit_system', unit);
      window.dispatchEvent(new Event('chroma_unit_system_changed'));
    } catch {
      // fallback
    }
  };

  const handleSelectTimeFormat = (fmt: '24h' | '12h') => {
    setTimeFormat(fmt);
    try {
      localStorage.setItem('chroma_nocta_time_format', fmt);
      window.dispatchEvent(new Event('chroma_time_format_changed'));
    } catch {
      // fallback
    }
  };

  const handleSelectFont = (fontId: string) => {
    setFontFamily(fontId);
    try {
      localStorage.setItem('chroma_nocta_font_family', fontId);
    } catch {}
    applyFont(fontId);
  };

  const toggleDropdown = (key: 'theme' | 'font' | 'unit' | 'timeFormat') => {
    setOpenDropdown((prev) => (prev === key ? null : key));
  };

  if (!isOpen) return null;

  const activeTheme = THEMES.find((t) => t.id === currentTheme) || THEMES[0];
  const activeFont = FONT_OPTIONS.find((f) => f.id === fontFamily) || FONT_OPTIONS[0];
  const activeUnitLabel = unitSystem === 'metric' ? 'Metric (°C, km/h)' : 'Imperial (°F, mph)';
  const activeTimeFormatLabel = timeFormat === '24h' ? '24-Hour (23:14:05)' : '12-Hour (11:14:05 PM)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[90vh] rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl flex flex-col"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-theme/30 bg-black/30 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-theme shadow-sm"
              style={{ backgroundColor: activeTheme.primary + '20' }}
            >
              <Palette className="w-4 h-4 text-theme-primary" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-mono uppercase tracking-wider text-white">
                Station Settings
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Theme */}
          <div className="relative z-40">
            <button
              type="button"
              onClick={() => toggleDropdown('theme')}
              className="w-full p-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 flex items-center justify-between text-xs font-mono transition-all cursor-pointer shadow-sm active:scale-98"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Palette className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="text-slate-300 font-bold shrink-0">Theme:</span>
                <span
                  className="w-3.5 h-3.5 rounded-full ring-2 ring-white/20 shrink-0"
                  style={{ backgroundColor: activeTheme.primary }}
                />
                <span className="text-white font-bold truncate">{activeTheme.name}</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
                  openDropdown === 'theme' ? 'rotate-180 text-theme-primary' : ''
                }`}
              />
            </button>
            {openDropdown === 'theme' && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0d1117] border border-white/20 rounded-xl shadow-2xl max-h-52 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-150">
                {THEMES.map((t) => {
                  const isSelected = t.id === currentTheme;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onSelectTheme(t.id);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-white/10 text-white font-bold ring-1 ring-[var(--theme-primary)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20 shrink-0"
                          style={{ backgroundColor: t.primary }}
                        />
                        <span>{t.name}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-theme-primary stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Validation */}
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-bold">
                <ShieldCheck className="w-4 h-4 text-theme-primary shrink-0" />
                <span>Validation</span>
              </div>
              <button
                type="button"
                onClick={() => setCheckReport(runSelfCheck())}
                className="px-2.5 py-1 rounded-lg bg-theme-primary/20 hover:bg-theme-primary/30 border border-theme text-theme-accent font-bold text-[11px] transition-all cursor-pointer active:scale-95"
              >
                Verify
              </button>
            </div>

            {checkReport && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Device time zone:</span>
                  <span className="text-white font-medium">{checkReport.deviceTimeZone}</span>
                </div>

                <div className="grid grid-cols-4 gap-1 text-center text-[9px] font-bold">
                  <div
                    className={`p-1.5 rounded-lg border ${
                      checkReport.koruma.fail === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    PROTECT {checkReport.koruma.pass}/{checkReport.koruma.pass + checkReport.koruma.fail}
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      checkReport.hedef.fail === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                    }`}
                  >
                    TARGET {checkReport.hedef.pass}/{checkReport.hedef.pass + checkReport.hedef.fail}
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      checkReport.ilke.fail === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    AXIOM {checkReport.ilke.pass}/{checkReport.ilke.pass + checkReport.ilke.fail}
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      checkReport.harici.fail === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}
                  >
                    EXTERNAL {checkReport.harici.pass}/{checkReport.harici.pass + checkReport.harici.fail}
                  </div>
                </div>

                {checkReport.failures.filter((f) => f.group === 'KORUMA').length > 0 && (
                  <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-400">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Failures detected in PROTECTION group!</span>
                    </div>
                    <div className="space-y-1 text-[9px] pt-1">
                      {checkReport.failures
                        .filter((f) => f.group === 'KORUMA')
                        .slice(0, 5)
                        .map((f, i) => (
                          <div key={i} className="bg-black/40 p-1.5 rounded border border-red-500/20 break-all leading-tight">
                            <span className="font-semibold text-red-300">{f.caseId}</span> {f.field}: expected{' '}
                            <span className="text-emerald-300">{f.expected}</span>, actual{' '}
                            <span className="text-red-300">{f.actual}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Audit Trail & Status */}
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300 font-bold">
                <BookOpen className="w-4 h-4 text-theme-primary shrink-0" />
                <span>Audit Trail & Status</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDevNotesOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white font-bold text-[11px] transition-all cursor-pointer active:scale-95"
              >
                Inspect
              </button>
            </div>
            <div className="text-[10px] text-theme-muted font-mono pl-6">
              {verifiedCount} Verified · {pendingCount} Pending · {openCount} Queued
              {failedCount > 0 ? ` · ${failedCount} Failed` : ''}
            </div>
          </div>

          {/* Font Family */}
          <div className="relative z-30">
            <button
              type="button"
              onClick={() => toggleDropdown('font')}
              className="w-full p-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 flex items-center justify-between text-xs font-mono transition-all cursor-pointer shadow-sm active:scale-98"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Type className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="text-slate-300 font-bold shrink-0">Font:</span>
                <span className="text-white font-bold truncate" style={{ fontFamily: activeFont.font }}>
                  {activeFont.label}
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
                  openDropdown === 'font' ? 'rotate-180 text-theme-primary' : ''
                }`}
              />
            </button>
            {openDropdown === 'font' && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0d1117] border border-white/20 rounded-xl shadow-2xl max-h-52 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-150">
                {FONT_OPTIONS.map((f) => {
                  const isSelected = fontFamily === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        handleSelectFont(f.id);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-white/10 text-white font-bold ring-1 ring-[var(--theme-primary)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                      style={{ fontFamily: f.font }}
                    >
                      <span>{f.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-theme-primary stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Units */}
          <div className="relative z-20">
            <button
              type="button"
              onClick={() => toggleDropdown('unit')}
              className="w-full p-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 flex items-center justify-between text-xs font-mono transition-all cursor-pointer shadow-sm active:scale-98"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Gauge className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="text-slate-300 font-bold shrink-0">Units:</span>
                <span className="text-white font-bold truncate">{activeUnitLabel}</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
                  openDropdown === 'unit' ? 'rotate-180 text-theme-primary' : ''
                }`}
              />
            </button>
            {openDropdown === 'unit' && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0d1117] border border-white/20 rounded-xl shadow-2xl max-h-52 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-150">
                {UNIT_OPTIONS.map((u) => {
                  const isSelected = unitSystem === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        handleSelectUnit(u.id);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-white/10 text-white font-bold ring-1 ring-[var(--theme-primary)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{u.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-theme-primary stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Time Format */}
          <div className="relative z-10">
            <button
              type="button"
              onClick={() => toggleDropdown('timeFormat')}
              className="w-full p-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 flex items-center justify-between text-xs font-mono transition-all cursor-pointer shadow-sm active:scale-98"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Clock className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="text-slate-300 font-bold shrink-0">Time Format:</span>
                <span className="text-white font-bold truncate">{activeTimeFormatLabel}</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ml-2 ${
                  openDropdown === 'timeFormat' ? 'rotate-180 text-theme-primary' : ''
                }`}
              />
            </button>
            {openDropdown === 'timeFormat' && (
              <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-[#0d1117] border border-white/20 rounded-xl shadow-2xl max-h-52 overflow-y-auto p-1.5 space-y-1 animate-in fade-in duration-150">
                {TIME_FORMAT_OPTIONS.map((tf) => {
                  const isSelected = timeFormat === tf.id;
                  return (
                    <button
                      key={tf.id}
                      type="button"
                      onClick={() => {
                        handleSelectTimeFormat(tf.id);
                        setOpenDropdown(null);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all cursor-pointer text-left ${
                        isSelected
                          ? 'bg-white/10 text-white font-bold ring-1 ring-[var(--theme-primary)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span>{tf.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-theme-primary stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-theme/30 bg-black/40 flex items-center justify-between rounded-b-2xl">
          <span className="text-[10px] font-mono text-theme-muted">
            Chroma Nocta
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-theme-primary text-black font-mono font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer active:scale-95"
          >
            Done
          </button>
        </div>
      </div>

      {isDevNotesOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsDevNotesOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-theme/30 bg-black/40">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-theme-primary shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold font-mono tracking-wider text-white uppercase">
                  CHROMA NOCTA AUDIT TRAIL (v1.4)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(generateProjectStateMarkdown());
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    copied
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-300 hover:text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
                      <span>✓ Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-theme-primary" />
                      <span>📋 Copy to Clipboard</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsDevNotesOpen(false)}
                  className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* 1. Live Task List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                  <span>Live Task List</span>
                  <span className="text-[10px] text-theme-muted font-normal">{AUDIT_TASKS.length} Tasks</span>
                </div>
                <div className="space-y-2">
                  {AUDIT_TASKS.map((task) => {
                    let badgeClass = 'bg-white/5 border-white/10 text-slate-400';
                    let badgeLabel = '○ QUEUED';
                    if (task.status === 'verified') {
                      badgeClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300';
                      badgeLabel = '● VERIFIED';
                    } else if (task.status === 'pending') {
                      badgeClass = 'bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse';
                      badgeLabel = '● PENDING TEST';
                    } else if (task.status === 'failed') {
                      badgeClass = 'bg-red-500/10 border-red-500/30 text-red-300';
                      badgeLabel = '✕ FAILED';
                    }

                    return (
                      <div
                        key={task.id}
                        className="p-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 transition-all space-y-2 font-mono"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-theme-accent border border-white/10 shrink-0">
                              {task.id}
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold px-1 rounded bg-black/60 border border-white/5 shrink-0">
                              {task.category}
                            </span>
                            <span className="text-xs font-bold text-white truncate">
                              {task.title}
                            </span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-sans pl-1">
                          {task.notes}
                        </p>
                        {task.evidence && (
                          <div className="p-2 rounded-lg bg-black/60 border border-white/5 text-[10px] space-y-1">
                            <div className="text-emerald-400 font-medium flex items-start gap-1">
                              <span className="shrink-0 font-bold">✓ Evidence:</span>
                              <span className="text-slate-300">{task.evidence.result}</span>
                            </div>
                            {task.evidence.command && (
                              <div className="text-slate-400 text-[9px]">
                                <span className="text-slate-500 font-bold">$ </span>
                                <span>{task.evidence.command}</span>
                              </div>
                            )}
                            {task.evidence.externalSource && (
                              <div className="text-sky-300/90 text-[9px]">
                                <span className="font-bold text-slate-400">Source: </span>
                                <span>{task.evidence.externalSource}</span>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[9px] text-slate-500 pl-1 font-mono pt-0.5">
                          <span>Last Updated: {task.updatedAt}</span>
                          {task.supersedes && (
                            <span className="text-amber-400/80">Supersedes: {task.supersedes}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Raw Markdown Preview */}
              <div className="space-y-1.5 pt-2 border-t border-white/10">
                <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider font-bold">
                  Raw Markdown Preview (AI Session Export)
                </div>
                <div className="p-2.5 rounded-xl bg-black/80 border border-white/10 font-mono text-[10px] text-slate-400 max-h-36 overflow-y-auto whitespace-pre-wrap select-text">
                  {generateProjectStateMarkdown()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
