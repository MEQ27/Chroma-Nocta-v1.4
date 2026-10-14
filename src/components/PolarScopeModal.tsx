import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Compass,
  Crosshair,
  RotateCw,
  Clock,
  Sliders,
  Zap,
  Info,
  Sun,
} from 'lucide-react';
import { ResolvedSite } from '../types';
import { getLST, formatTimeHM } from '../lib/ephemeris';
import { useWakeLock } from '../lib/useWakeLock';
import { siteParts } from '../lib/siteTime';

interface PolarScopeModalProps {
  isOpen: boolean;
  onClose: () => void;
  location: ResolvedSite;
  observationDate?: Date;
}

// Basitleştirilmiş Dünya Manyetik Modeli (WMM) yaklaşıklığı
function getApproxMagneticDeclination(lat: number, lon: number): number {
  // Orta/düşük enlemler için ampirik dipol sapması derecesi
  const radLat = (lat * Math.PI) / 180;
  const radLon = (lon * Math.PI) / 180;
  const dec = 15 * Math.sin(radLon - 0.2) * Math.cos(radLat);
  return Number(dec.toFixed(1));
}

export const PolarScopeModal: React.FC<PolarScopeModalProps> = ({
  isOpen,
  onClose,
  location,
  observationDate,
}) => {
  const [isInverted, setIsInverted] = useState<boolean>(true);
  const [isRedIllumination, setIsRedIllumination] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<Date>(() => observationDate || new Date());
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    isSupported: isWakeLockSupported,
    isActive: isWakeLockActive,
    toggleWakeLock,
    requestWakeLock,
    releaseWakeLock,
  } = useWakeLock();

  useEffect(() => {
    if (isOpen) {
      requestWakeLock().catch(() => {});
    } else {
      releaseWakeLock().catch(() => {});
    }
  }, [isOpen, requestWakeLock, releaseWakeLock]);

  const isSouthern = location.latitude < 0;
  const declination = useMemo(
    () => getApproxMagneticDeclination(location.latitude, location.longitude),
    [location.latitude, location.longitude]
  );

  useEffect(() => {
    if (observationDate) {
      setCurrentTime(observationDate);
      return;
    }
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [observationDate]);

  const polarisData = useMemo(() => {
    const tz = location.timeZone;
    const parts = siteParts(currentTime, tz);
    const year = parts.year;
    const yearFraction = year + (parts.month - 1) / 12;
    const yearsSinceJ2000 = yearFraction - 2000;
    const lst = getLST(currentTime, location.longitude);

    let raHours: number;
    let polarDistanceArcmin: number;
    let ha: number;

    if (!isSouthern) {
      // Kuzey Yarımküre (Polaris)
      raHours = 2.53028 + (yearsSinceJ2000 * 3.08) / 3600;
      polarDistanceArcmin = Math.max(30, 44.16 - yearsSinceJ2000 * 0.214);
      ha = lst - raHours;
      while (ha < 0) ha += 24;
      ha = ha % 24;
    } else {
      // Güney Yarımküre (σ Octantis - Polaris Australis, Mag 5.42)
      // RA ~ 21.146h, Mesafe ~ 1.05° (Epoch 2026 ~ 63')
      raHours = 21.146 + (yearsSinceJ2000 * 1.5) / 3600;
      polarDistanceArcmin = 63.0;
      ha = lst - raHours;
      while (ha < 0) ha += 24;
      ha = ha % 24;
    }

    const haDegrees = ha * 15;
    let angleClockwiseDeg = (360 - haDegrees) % 360;
    if (isInverted) {
      angleClockwiseDeg = (angleClockwiseDeg + 180) % 360;
    }
    const clockDecimalHours = (angleClockwiseDeg / 360) * 12;
    const clockH = Math.floor(clockDecimalHours) === 0 ? 12 : Math.floor(clockDecimalHours);
    const clockM = Math.floor((clockDecimalHours % 1) * 60);
    const clockS = Math.floor((((clockDecimalHours % 1) * 60) % 1) * 60);
    const clockString = `${String(clockH).padStart(2, '0')}:${String(clockM).padStart(
      2,
      '0'
    )}:${String(clockS).padStart(2, '0')}`;
    const haH = Math.floor(ha);
    const haM = Math.floor((ha % 1) * 60);
    const haS = Math.floor((((ha % 1) * 60) % 1) * 60);
    const haFormatted = `${String(haH).padStart(2, '0')}:${String(haM).padStart(
      2,
      '0'
    )}:${String(haS).padStart(2, '0')}`;
    return {
      raHours,
      polarDistanceArcmin: Number(polarDistanceArcmin.toFixed(1)),
      lst,
      haDegrees: Number(haDegrees.toFixed(1)),
      haFormatted,
      clockString,
      angleClockwiseDeg,
    };
  }, [currentTime, location.longitude, isInverted, isSouthern]);

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height || 360);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size / 2;
    const outerRadius = size * 0.44;
    const reticleColor = isRedIllumination ? '#ef4444' : '#06b6d4';
    const dimColor = isRedIllumination ? 'rgba(239, 68, 68, 0.35)' : 'rgba(6, 182, 212, 0.35)';
    const textBright = isRedIllumination ? '#fee2e2' : '#f0fdfa';
    const glowColor = isRedIllumination ? 'rgba(239, 68, 68, 0.45)' : 'rgba(6, 182, 212, 0.45)';

    const bgGrad = ctx.createRadialGradient(cx, cy, outerRadius * 0.2, cx, cy, outerRadius * 1.15);
    bgGrad.addColorStop(0, '#000000');
    bgGrad.addColorStop(0.85, isRedIllumination ? '#120202' : '#020612');
    bgGrad.addColorStop(1, '#000000');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius * 1.1, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius * 1.08, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const gap = 4;
    const crossLen = 14;
    ctx.moveTo(cx - crossLen, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + crossLen, cy);
    ctx.moveTo(cx, cy - crossLen);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + crossLen);
    ctx.stroke();

    ctx.fillStyle = reticleColor;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.2, 0, 2 * Math.PI);
    ctx.fill();

    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.fillStyle = textBright;
    ctx.textAlign = 'left';
    ctx.fillText(isSouthern ? 'SCP (South Celestial Pole)' : 'NCP (North Celestial Pole)', cx + 8, cy - 8);

    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, 2 * Math.PI);
    ctx.stroke();

    for (let i = 0; i < 360; i++) {
      const angleRad = (i * Math.PI) / 180 - Math.PI / 2;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      const isHour = i % 30 === 0;
      const is10Min = i % 5 === 0;
      let tickLen = 3;
      if (isHour) tickLen = 10;
      else if (is10Min) tickLen = 6;

      ctx.strokeStyle = isHour ? reticleColor : dimColor;
      ctx.lineWidth = isHour ? 1.5 : 0.8;
      ctx.beginPath();
      ctx.moveTo(cx + (outerRadius - tickLen) * cosA, cy + (outerRadius - tickLen) * sinA);
      ctx.lineTo(cx + outerRadius * cosA, cy + outerRadius * sinA);
      ctx.stroke();

      if (isHour) {
        const hourNum = i === 0 ? 12 : i / 30;
        const textRadius = outerRadius - 19;
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillStyle = textBright;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(hourNum), cx + textRadius * cosA, cy + textRadius * sinA);
      }
    }

    const scaleFactor = isSouthern ? (outerRadius * 0.65) / 70 : (outerRadius * 0.65) / 40;
    const rings = isSouthern
      ? [
          { r: 55 * scaleFactor, label: "55'" },
          { r: 63 * scaleFactor, label: "63' (1.05°)" },
          { r: 70 * scaleFactor, label: "70'" },
        ]
      : [
          { r: 38 * scaleFactor, label: "38'" },
          { r: 39 * scaleFactor, label: "39'" },
          { r: 40 * scaleFactor, label: "40'" },
        ];

    rings.forEach((ring) => {
      ctx.strokeStyle = dimColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '8px JetBrains Mono, monospace';
      ctx.fillStyle = dimColor;
      ctx.textAlign = 'right';
      ctx.fillText(ring.label, cx - 4, cy - ring.r + 3);
    });

    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius + 22);
    ctx.lineTo(cx, cy - 16);
    ctx.moveTo(cx, cy + 16);
    ctx.lineTo(cx, cy + outerRadius - 22);
    ctx.moveTo(cx - outerRadius + 22, cy);
    ctx.lineTo(cx - 16, cy);
    ctx.moveTo(cx + 16, cy);
    ctx.lineTo(cx + outerRadius - 22, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    const polarisRadiusPx = polarisData.polarDistanceArcmin * scaleFactor;
    const polarisAngleRad = (polarisData.angleClockwiseDeg * Math.PI) / 180 - Math.PI / 2;
    const px = cx + polarisRadiusPx * Math.cos(polarisAngleRad);
    const py = cy + polarisRadiusPx * Math.sin(polarisAngleRad);

    if (isSouthern) {
      // 1) Crux (Güney Haçı) kılavuz oku
      const cruxAngleRad = polarisAngleRad + Math.PI * 0.85;
      const cruxLen = outerRadius * 0.88;
      const arrowStartX = cx + 22 * Math.cos(cruxAngleRad);
      const arrowStartY = cy + 22 * Math.sin(cruxAngleRad);
      const arrowEndX = cx + cruxLen * Math.cos(cruxAngleRad);
      const arrowEndY = cy + cruxLen * Math.sin(cruxAngleRad);

      ctx.strokeStyle = isRedIllumination ? 'rgba(239, 68, 68, 0.7)' : 'rgba(6, 182, 212, 0.7)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(arrowStartX, arrowStartY);
      ctx.lineTo(arrowEndX, arrowEndY);
      ctx.stroke();
      ctx.setLineDash([]);

      const headLen = 8;
      const headAngle1 = cruxAngleRad + Math.PI - 0.4;
      const headAngle2 = cruxAngleRad + Math.PI + 0.4;
      ctx.beginPath();
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(arrowEndX + headLen * Math.cos(headAngle1), arrowEndY + headLen * Math.sin(headAngle1));
      ctx.moveTo(arrowEndX, arrowEndY);
      ctx.lineTo(arrowEndX + headLen * Math.cos(headAngle2), arrowEndY + headLen * Math.sin(headAngle2));
      ctx.stroke();

      ctx.font = 'bold 8px JetBrains Mono, monospace';
      ctx.fillStyle = textBright;
      ctx.textAlign = 'center';
      ctx.fillText('CRUX (Southern Cross Direction)', arrowEndX, arrowEndY + (arrowEndY > cy ? 12 : -8));

      // 2) Octans Trapezium (σ, τ, χ, υ Octantis)
      const tauAngle = polarisAngleRad + 0.28;
      const tauR = polarisRadiusPx * 1.35;
      const tauX = cx + tauR * Math.cos(tauAngle);
      const tauY = cy + tauR * Math.sin(tauAngle);

      const chiAngle = polarisAngleRad + 0.52;
      const chiR = polarisRadiusPx * 1.55;
      const chiX = cx + chiR * Math.cos(chiAngle);
      const chiY = cy + chiR * Math.sin(chiAngle);

      const upsilonAngle = polarisAngleRad + 0.38;
      const upsilonR = polarisRadiusPx * 1.08;
      const upsilonX = cx + upsilonR * Math.cos(upsilonAngle);
      const upsilonY = cy + upsilonR * Math.sin(upsilonAngle);

      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tauX, tauY);
      ctx.lineTo(chiX, chiY);
      ctx.lineTo(upsilonX, upsilonY);
      ctx.closePath();
      ctx.stroke();

      const octansStars = [
        { x: tauX, y: tauY, name: 'τ' },
        { x: chiX, y: chiY, name: 'χ' },
        { x: upsilonX, y: upsilonY, name: 'υ' },
      ];
      octansStars.forEach((st) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(st.x, st.y, 1.5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font = 'bold 8px JetBrains Mono, monospace';
        ctx.fillStyle = textBright;
        ctx.fillText(st.name, st.x + 6, st.y + 3);
      });
    }

    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    const targetRingRadius = 6.5;
    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(px, py, targetRingRadius, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = reticleColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - targetRingRadius - 3, py);
    ctx.lineTo(px + targetRingRadius + 3, py);
    ctx.moveTo(px, py - targetRingRadius - 3);
    ctx.lineTo(px, py + targetRingRadius + 3);
    ctx.stroke();

    const starGlow = ctx.createRadialGradient(px, py, 1, px, py, 9);
    starGlow.addColorStop(0, '#ffffff');
    starGlow.addColorStop(0.4, reticleColor);
    starGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = starGlow;
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 1.8, 0, 2 * Math.PI);
    ctx.fill();

    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.fillStyle = textBright;
    ctx.textAlign = 'center';
    const labelOffset = py > cy ? 16 : -12;
    ctx.fillText(isSouthern ? '★ σ OCTANTIS' : '★ POLARIS', px, py + labelOffset);

    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.fillStyle = dimColor;
    ctx.textAlign = 'center';
    ctx.fillText(
      isInverted ? '[180° INVERTED POLAR SCOPE]' : '[TRUE SKY]',
      cx,
      cy + outerRadius * 0.8
    );
  }, [isOpen, polarisData, isRedIllumination, isInverted, isSouthern]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[95vh] flex flex-col rounded-2xl border border-theme bg-[var(--theme-card)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme bg-black/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
              <Crosshair className="w-4 h-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-1.5">
                {isSouthern ? 'POLAR SCOPE ALIGNMENT ASSISTANT (SCP)' : 'POLAR SCOPE ALIGNMENT ASSISTANT (NCP)'}
              </h2>
              <p className="text-[10px] text-theme-muted font-mono">
                {isSouthern
                  ? 'σ Octantis (Polaris Australis, Mag 5.42) & Octans Trapezium'
                  : 'Optical Engraved Reticle & Micrometric Dial Engine'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-theme-muted hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
          <div className="flex flex-col xs:flex-row items-stretch xs:items-center justify-between gap-2 p-1.5 rounded-xl border border-theme/60 bg-black/50">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-black/60 border border-white/10">
              <button
                onClick={() => setIsInverted(true)}
                className={`flex-1 xs:flex-initial px-2.5 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  isInverted
                    ? 'bg-theme-primary text-black font-bold shadow-sm'
                    : 'text-theme-muted hover:text-white'
                }`}
                title="Position viewed through optical polar scope"
              >
                Through Polar Scope (180° Inverted)
              </button>
              <button
                onClick={() => setIsInverted(false)}
                className={`flex-1 xs:flex-initial px-2.5 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  !isInverted
                    ? 'bg-theme-primary text-black font-bold shadow-sm'
                    : 'text-theme-muted hover:text-white'
                }`}
                title="True naked-eye orientation in sky"
              >
                True Sky
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {isWakeLockSupported && (
                <button
                  onClick={toggleWakeLock}
                  title={isWakeLockActive ? 'Screen Wake Lock Active' : 'Enable Screen Wake Lock'}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer ${
                    isWakeLockActive
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                      : 'bg-white/5 text-theme-muted border-white/10 hover:text-white'
                  }`}
                >
                  <Sun className={`w-3 h-3 ${isWakeLockActive ? 'animate-pulse text-amber-300' : ''}`} />
                  <span>{isWakeLockActive ? 'Screen Awake' : 'Keep Awake'}</span>
                </button>
              )}

              <button
                onClick={() => setIsRedIllumination(!isRedIllumination)}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-all cursor-pointer ${
                  isRedIllumination
                    ? 'bg-red-500/20 text-red-300 border-red-500/50'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                }`}
              >
                <Zap className="w-3 h-3" />
                <span>{isRedIllumination ? 'Red Reticle' : 'Cyan'}</span>
              </button>
            </div>
          </div>

          <div className="relative w-full aspect-square max-w-[340px] mx-auto rounded-2xl overflow-hidden bg-black border border-white/20 shadow-inner flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>

          <div className="p-3.5 rounded-xl border border-theme bg-black/60 space-y-2.5 glow-primary-subtle">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider font-mono text-white flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-theme-primary" /> Micrometric Digital Telemetry
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                Live Engine
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-theme-muted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Dial Direction (12h):</span>
                </div>
                <div className="text-base font-black text-amber-400 mt-0.5">
                  {polarisData.clockString}
                </div>
                <div className="text-[9px] text-slate-400">
                  {isInverted ? 'Inverted scope clock' : 'Natural sky clock'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-theme-muted flex items-center gap-1">
                  <RotateCw className="w-3 h-3 text-cyan-400" />
                  <span>Hour Angle (HA):</span>
                </div>
                <div className="text-base font-black text-cyan-400 mt-0.5">
                  {polarisData.haFormatted}
                </div>
                <div className="text-[9px] text-slate-400">{polarisData.haDegrees}° angular value</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-theme-muted flex items-center gap-1">
                  <Crosshair className="w-3 h-3 text-red-400" />
                  <span>Polar Distance:</span>
                </div>
                <div className="text-base font-black text-white mt-0.5">
                  {isSouthern ? '~1.05° (63\')' : `${polarisData.polarDistanceArcmin}' (arcmin)`}
                </div>
                <div className="text-[9px] text-slate-400">
                  {isSouthern ? 'σ Octantis (Epoch 2026)' : '2026 Epoch radius ring'}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/10">
                <div className="text-[10px] text-theme-muted flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-emerald-400" />
                  <span>Polar Altitude (Latitude):</span>
                </div>
                <div className="text-base font-black text-emerald-400 mt-0.5">
                  {Math.abs(location.latitude).toFixed(2)}°
                </div>
                <div className="text-[9px] text-slate-400">
                  {isSouthern ? 'South' : 'North'} Latitude (Elev: {location.elevation}m)
                </div>
              </div>
            </div>

            {/* Magnetic Declination Badge */}
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Compass className="w-4 h-4 text-theme-primary shrink-0" />
                <span className="font-bold">Magnetic Declination:</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-theme-primary/10 border border-theme/40 text-theme-primary font-bold text-[11px]">
                {declination >= 0 ? '+' : ''}{declination}° (Compass Offset)
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-mono text-slate-300 space-y-1.5">
              <div className="font-bold text-theme-primary flex items-center gap-1">
                <Info className="w-3.5 h-3.5" /> Step-by-Step Field Alignment Guide:
              </div>
              <p>1. Level your tripod bubble precisely before mounting equipment.</p>
              <p>
                2. Set mount latitude bolt to exactly <b>{Math.abs(location.latitude).toFixed(2)}°</b>.
              </p>
              <p>
                3. When acquiring {isSouthern ? 'south' : 'north'} via magnetic compass, apply{' '}
                <b className="text-amber-300">
                  {Math.abs(declination)}° {declination >= 0 ? 'east' : 'west'}
                </b>{' '}
                declination offset.
              </p>
              <p>
                4.{' '}
                {isSouthern ? (
                  <>
                    Looking through polar scope, align σ Octantis and the Octans trapezium onto the reticle guide markings at{' '}
                    <b className="text-amber-300">{polarisData.clockString} o&apos;clock</b> (using Crux arrow pointer as reference).
                  </>
                ) : (
                  <>
                    Looking through polar scope, center Polaris directly into the reticle target circle shown at{' '}
                    <b className="text-amber-300">{polarisData.clockString} o&apos;clock</b>.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-theme bg-black/60 flex items-center justify-between text-[11px] font-mono text-theme-muted">
          <span>
            LST: <b>{formatTimeHM(currentTime, location.timeZone)}</b> | Site: <b>{location.name.split(' ')[0]}</b> | Mag: <b>{declination >= 0 ? '+' : ''}{declination}°</b>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-theme-primary text-black font-bold text-xs hover:opacity-90 transition-all cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
