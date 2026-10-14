import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Eye,
  Crosshair,
  Layers,
  Sparkles,
  Camera,
  Clock,
  RotateCw,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Upload,
  Image as ImageIcon,
  Grid,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { LocationData, ResolvedSite } from '../../types';
import {
  getHorizontalCoordinates,
  getLunarCoordinates,
  getSolarCoordinates,
  getLST,
  formatTimeHM,
} from '../../lib/ephemeris';
import {
  TARGET_CATALOG_30,
  BRIGHT_STAR_CATALOG_120,
  generateGalacticEquatorNodes,
  generateMicroStarDust,
  GREAT_RIFT_DUST_LANES,
  CONSTELLATION_LINES,
} from '../../lib/celestialData';
import { PolarScopeModal } from '../PolarScopeModal';
import { siteParts, zonedTimeToInstant } from '../../lib/siteTime';
import { getTerrainObstructionAtAzimuth } from '../../lib/targetOpsEngine';
import {
  detectBrightStarsFromImageData,
  solveFrameAlignment,
  FrameAlignmentSolution,
  DetectedStar,
} from '../../lib/starAlignmentEngine';

interface SkyVizorTabProps {
  location: ResolvedSite;
  initialDate?: Date;
}

type ProjectionMode = 'dome' | 'panorama' | 'target';
type ModulHMode = 'ghost' | 'blink' | 'swipe';

interface SensorPreset {
  readonly id: string;
  readonly label: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly cropFactor: number;
  readonly defaultPixelSizeUm: number;
}

const SENSOR_PRESETS: readonly SensorPreset[] = [
  { id: 'full-frame', label: 'Full-Frame (36×24mm, 1.0×)', widthMm: 36, heightMm: 24, cropFactor: 1.0, defaultPixelSizeUm: 3.76 },
  { id: 'aps-c', label: 'APS-C (23.5×15.6mm, 1.5×)', widthMm: 23.5, heightMm: 15.6, cropFactor: 1.5, defaultPixelSizeUm: 3.76 },
  { id: 'm43', label: 'Micro 4/3 (17.3×13mm, 2.0×)', widthMm: 17.3, heightMm: 13.0, cropFactor: 2.0, defaultPixelSizeUm: 3.8 },
  { id: '1-inch', label: '1-Inch (13.2×8.8mm, 2.7×)', widthMm: 13.2, heightMm: 8.8, cropFactor: 2.7, defaultPixelSizeUm: 2.4 },
  { id: 'planetary', label: 'Planetary (7.4×5.5mm, 4.8×)', widthMm: 7.4, heightMm: 5.5, cropFactor: 4.8, defaultPixelSizeUm: 2.9 },
];

const PROJECTION_MODES: readonly { readonly id: ProjectionMode; readonly label: string }[] = [
  { id: 'dome', label: '360° Dome' },
  { id: 'panorama', label: '120° Panorama' },
  { id: 'target', label: 'Target View' },
];

const MODUL_H_MODES: readonly { readonly id: ModulHMode; readonly label: string }[] = [
  { id: 'ghost', label: 'Ghost Overlay' },
  { id: 'blink', label: 'Blink (450ms)' },
  { id: 'swipe', label: 'Swipe Split' },
];

const MODUL_H_STORAGE_REF = 'chroma_nocta_modulh_ref_img';
const MODUL_H_STORAGE_TEST = 'chroma_nocta_modulh_test_img';

function openModulHDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open('chroma_nocta_modulh_db', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('frames')) {
        db.createObjectStore('frames');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveFrameToIDB(key: string, dataUrl: string): Promise<void> {
  return openModulHDatabase()
    .then((db) => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('frames', 'readwrite');
        const store = tx.objectStore('frames');
        const req = store.put(dataUrl, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    })
    .catch((err) => {
      console.warn('IDB write error', err);
    });
}

function loadFrameFromIDB(key: string): Promise<string | null> {
  return openModulHDatabase()
    .then((db) => {
      return new Promise<string | null>((resolve, reject) => {
        const tx = db.transaction('frames', 'readonly');
        const store = tx.objectStore('frames');
        const req = store.get(key);
        req.onsuccess = () => {
          const res = req.result;
          if (typeof res === 'string') {
            resolve(res);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    })
    .catch(() => null);
}

function removeFrameFromIDB(key: string): Promise<void> {
  return openModulHDatabase()
    .then((db) => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('frames', 'readwrite');
        const store = tx.objectStore('frames');
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    })
    .catch((err) => {
      console.warn('IDB remove error', err);
    });
}

export const SkyVizorTab: React.FC<SkyVizorTabProps> = ({ location, initialDate }) => {
  const tz = location.timeZone;
  const [obsDate, setObsDate] = useState<Date>(() => {
    const base = initialDate || new Date();
    const p = siteParts(base, tz);
    return zonedTimeToInstant(p.year, p.month, p.day, 23, 0, 0, tz);
  });
  const [isLiveTime, setIsLiveTime] = useState<boolean>(false);

  useEffect(() => {
    if (initialDate) {
      const p = siteParts(initialDate, tz);
      setObsDate(zonedTimeToInstant(p.year, p.month, p.day, 23, 0, 0, tz));
      setIsLiveTime(false);
    }
  }, [initialDate, tz]);

  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('dome');
  const [viewAzimuth, setViewAzimuth] = useState<number>(180);
  const [viewTilt, setViewTilt] = useState<number>(45);

  const [selectedTargetId, setSelectedTargetId] = useState<string>('m42');
  const selectedTarget =
    TARGET_CATALOG_30.find((t) => t.id === selectedTargetId) || TARGET_CATALOG_30[0];

  const [isCameraUnlocked, setIsCameraUnlocked] = useState<boolean>(false);
  const [cameraAzimuth, setCameraAzimuth] = useState<number>(180);
  const [cameraAltitude, setCameraAltitude] = useState<number>(45);

  const [isMosaicEnabled, setIsMosaicEnabled] = useState<boolean>(false);
  const [mosaicRows, setMosaicRows] = useState<number>(2);
  const [mosaicCols, setMosaicCols] = useState<number>(2);
  const [mosaicOverlapPercent, setMosaicOverlapPercent] = useState<number>(15);

  const [focalLength, setFocalLength] = useState<number>(135);
  const [cameraRotationPA, setCameraRotationPA] = useState<number>(0);
  const [showEquatorialGrid, setShowEquatorialGrid] = useState<boolean>(false);
  const [isPolarModalOpen, setIsPolarModalOpen] = useState<boolean>(false);

  const [selectedSensorId, setSelectedSensorId] = useState<string>('full-frame');
  const activeSensor = SENSOR_PRESETS.find((s) => s.id === selectedSensorId) || SENSOR_PRESETS[0];

  const [plateSolveSolution, setPlateSolveSolution] = useState<FrameAlignmentSolution | null>(null);
  const [isPlateSolving, setIsPlateSolving] = useState<boolean>(false);
  const [plateSolveError, setPlateSolveError] = useState<string | null>(null);
  const [detectedRefStars, setDetectedRefStars] = useState<readonly DetectedStar[]>([]);
  const [detectedTestStars, setDetectedTestStars] = useState<readonly DetectedStar[]>([]);

  const [refImage, setRefImage] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MODUL_H_STORAGE_REF);
    } catch {
      return null;
    }
  });
  const [testImage, setTestImage] = useState<string | null>(() => {
    try {
      return localStorage.getItem(MODUL_H_STORAGE_TEST);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    loadFrameFromIDB(MODUL_H_STORAGE_REF).then((val) => {
      if (val) setRefImage(val);
    });
    loadFrameFromIDB(MODUL_H_STORAGE_TEST).then((val) => {
      if (val) setTestImage(val);
    });
  }, []);

  const [modulHMode, setModulHMode] = useState<ModulHMode>('ghost');
  const [ghostOpacity, setGhostOpacity] = useState<number>(50);
  const [swipeDivider, setSwipeDivider] = useState<number>(50);
  const [isBlinking, setIsBlinking] = useState<boolean>(true);
  const [blinkActiveFrame, setBlinkActiveFrame] = useState<'ref' | 'test'>('ref');
  const [overlayOnSkyCanvas, setOverlayOnSkyCanvas] = useState<boolean>(false);

  const refImageObj = useRef<HTMLImageElement | null>(null);
  const testImageObj = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (refImage) {
      const img = new Image();
      img.src = refImage;
      img.onload = () => {
        refImageObj.current = img;
      };
    } else {
      refImageObj.current = null;
    }
  }, [refImage]);

  useEffect(() => {
    if (testImage) {
      const img = new Image();
      img.src = testImage;
      img.onload = () => {
        testImageObj.current = img;
      };
    } else {
      testImageObj.current = null;
    }
  }, [testImage]);

  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => {
      setObsDate(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  useEffect(() => {
    if (!isBlinking || modulHMode !== 'blink') return;
    const interval = setInterval(() => {
      setBlinkActiveFrame((prev) => (prev === 'ref' ? 'test' : 'ref'));
    }, 450);
    return () => clearInterval(interval);
  }, [isBlinking, modulHMode]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    az: number;
    tilt: number;
    camAz: number;
    camAlt: number;
  }>({
    x: 0,
    y: 0,
    az: 180,
    tilt: 45,
    camAz: 180,
    camAlt: 45,
  });
  const touchStartDist = useRef<number | null>(null);
  const touchStartFocal = useRef<number>(135);

  const galacticNodes = useMemo(() => generateGalacticEquatorNodes(), []);
  const microStarDust = useMemo(() => generateMicroStarDust(), []);

  const currentLST = useMemo(
    () => getLST(obsDate, location.longitude),
    [obsDate, location.longitude]
  );

  const meridianFlipStatus = useMemo(() => {
    const ra = selectedTarget.ra;
    let ha = currentLST - ra;
    while (ha < 0) ha += 24;
    ha = ha % 24;
    const signedHA = ha > 12 ? ha - 24 : ha;
    const isPreMeridian = signedHA < 0;
    const hoursToTransit = isPreMeridian ? -signedHA : 24 - signedHA;
    const minsToTransit = Math.round(hoursToTransit * 60);
    const transitDate = new Date(obsDate.getTime() + minsToTransit * 60000);
    const isFlipImminent = Math.abs(signedHA * 60) <= 20;

    return {
      hourAngleHours: Number(signedHA.toFixed(2)),
      isPreMeridian,
      axisSide: isPreMeridian ? 'Pre-Meridian (East)' : 'Post-Meridian (West)',
      hoursToTransit: Math.floor(minsToTransit / 60),
      minsRemainderToTransit: minsToTransit % 60,
      transitTimeStr: formatTimeHM(transitDate, tz),
      isFlipImminent,
    };
  }, [selectedTarget, currentLST, obsDate, tz]);

  const calculatedTargets = useMemo(() => {
    return TARGET_CATALOG_30.map((target) => {
      const horiz = getHorizontalCoordinates(
        obsDate,
        target.ra,
        target.dec,
        location.latitude,
        location.longitude
      );
      return {
        ...target,
        altitude: horiz.altitude,
        azimuth: horiz.azimuth,
      };
    });
  }, [obsDate, location.latitude, location.longitude]);

  const calculatedStars = useMemo(() => {
    return BRIGHT_STAR_CATALOG_120.map((star) => {
      const horiz = getHorizontalCoordinates(
        obsDate,
        star.ra,
        star.dec,
        location.latitude,
        location.longitude
      );
      return {
        ...star,
        altitude: horiz.altitude,
        azimuth: horiz.azimuth,
      };
    });
  }, [obsDate, location.latitude, location.longitude]);

  const celestialBodies = useMemo(() => {
    const sunCoords = getSolarCoordinates(obsDate);
    const sunHoriz = getHorizontalCoordinates(
      obsDate,
      sunCoords.ra,
      sunCoords.dec,
      location.latitude,
      location.longitude
    );
    const moonCoords = getLunarCoordinates(obsDate);
    const moonHoriz = getHorizontalCoordinates(
      obsDate,
      moonCoords.ra,
      moonCoords.dec,
      location.latitude,
      location.longitude
    );
    return {
      sun: { altitude: sunHoriz.altitude, azimuth: sunHoriz.azimuth },
      moon: {
        altitude: moonHoriz.altitude,
        azimuth: moonHoriz.azimuth,
        illumination: moonCoords.illumination,
        phase: moonCoords.phase,
        phaseName: moonCoords.phaseName,
      },
    };
  }, [obsDate, location.latitude, location.longitude]);

  const fovDegrees = useMemo(() => {
    const sensorW = activeSensor.widthMm;
    const sensorH = activeSensor.heightMm;
    const fovW = (2 * Math.atan(sensorW / (2 * focalLength)) * 180) / Math.PI;
    const fovH = (2 * Math.atan(sensorH / (2 * focalLength)) * 180) / Math.PI;
    const pixelScaleArcsec = (206.265 * activeSensor.defaultPixelSizeUm) / focalLength;
    return {
      width: fovW,
      height: fovH,
      pixelScaleArcsec: Math.round(pixelScaleArcsec * 100) / 100,
      cropFactor: activeSensor.cropFactor,
    };
  }, [activeSensor, focalLength]);

  const activeTargetCoordinates = useMemo(() => {
    return (
      calculatedTargets.find((t) => t.id === selectedTargetId) || calculatedTargets[0]
    );
  }, [calculatedTargets, selectedTargetId]);

  useEffect(() => {
    if (!isCameraUnlocked) {
      setCameraAzimuth(Math.round(activeTargetCoordinates.azimuth));
      setCameraAltitude(Math.round(activeTargetCoordinates.altitude));
    }
  }, [selectedTargetId, activeTargetCoordinates, isCameraUnlocked]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = Math.min(480, Math.max(340, width * 0.72));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const bgGrad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      10,
      width / 2,
      height / 2,
      Math.max(width, height)
    );
    bgGrad.addColorStop(0, '#040714');
    bgGrad.addColorStop(0.7, '#020308');
    bgGrad.addColorStop(1, '#000000');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const DEG2RAD = Math.PI / 180;
    const boxW = Math.min(width * 0.82, (height * 0.82 * 36) / 24);
    const boxH = (boxW * 24) / 36;
    const pixelsPerDegree = boxW / fovDegrees.width;

    const projectToCanvas = (altDeg: number, azDeg: number): [number, number, boolean] => {
      if (projectionMode === 'dome') {
        const radius = Math.min(width, height) * 0.44;
        const cx = width / 2;
        const cy = height / 2;
        const relAz = (azDeg - viewAzimuth + 360) % 360;
        const r = radius * (1 - Math.max(-10, altDeg) / 90);
        const theta = (relAz - 90) * DEG2RAD;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta);
        const isVisible = altDeg >= -2 && r <= radius * 1.08;
        return [x, y, isVisible];
      } else if (projectionMode === 'panorama') {
        const cx = width / 2;
        const cy = height / 2;
        const pFovH = 120;
        const pFovV = 75;
        let diffAz = azDeg - viewAzimuth;
        while (diffAz > 180) diffAz -= 360;
        while (diffAz < -180) diffAz += 360;
        const tiltRad = viewTilt * DEG2RAD;
        const altDiff = altDeg - viewTilt;
        const curvatureOffset = Math.sin(tiltRad) * (diffAz / 60) ** 2 * 18;
        const x = cx + (diffAz / (pFovH / 2)) * (width / 2);
        const y = cy - (altDiff / (pFovV / 2)) * (height / 2) + curvatureOffset;
        const isVisible =
          x >= -20 && x <= width + 20 && y >= -20 && y <= height + 20 && altDeg >= -5;
        return [x, y, isVisible];
      } else {
        const cx = width / 2;
        const cy = height / 2;
        const targetAlt = isCameraUnlocked ? cameraAltitude : activeTargetCoordinates.altitude;
        const targetAz = isCameraUnlocked ? cameraAzimuth : activeTargetCoordinates.azimuth;
        let diffAz = azDeg - targetAz;
        while (diffAz > 180) diffAz -= 360;
        while (diffAz < -180) diffAz += 360;
        const diffAlt = altDeg - targetAlt;
        const cosAlt = Math.cos((targetAlt * Math.PI) / 180);
        const x = cx + diffAz * cosAlt * pixelsPerDegree;
        const y = cy - diffAlt * pixelsPerDegree;
        const isVisible = x >= -40 && x <= width + 40 && y >= -40 && y <= height + 40;
        return [x, y, isVisible];
      }
    };

    if (
      projectionMode === 'target' &&
      overlayOnSkyCanvas &&
      refImageObj.current &&
      refImageObj.current.complete
    ) {
      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.rotate((cameraRotationPA * Math.PI) / 180);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(refImageObj.current, -boxW / 2, -boxH / 2, boxW, boxH);
      ctx.restore();
    }

    if (projectionMode === 'dome') {
      const radius = Math.min(width, height) * 0.44;
      const cx = width / 2;
      const cy = height / 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      const r30 = radius * (1 - 30 / 90);
      const r60 = radius * (1 - 60 / 90);
      ctx.beginPath();
      ctx.arc(cx, cy, r30, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r60, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
      ctx.stroke();

      // Mountain Terrain Obstruction Silhouette on 360° Dome
      if (location.horizonProfile && location.horizonProfile.length >= 8) {
        ctx.save();
        ctx.beginPath();
        for (let deg = 0; deg <= 360; deg += 3) {
          const az = (deg + viewAzimuth) % 360;
          const terrainAlt = getTerrainObstructionAtAzimuth(az, location.horizonProfile);
          const r = radius * (1 - Math.max(0, terrainAlt) / 90);
          const theta = (deg - 90) * DEG2RAD;
          const px = cx + r * Math.cos(theta);
          const py = cy + r * Math.sin(theta);
          if (deg === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.restore();
      }

      const cardinalPoints = [
        { label: 'K', az: 0 },
        { label: 'KD', az: 45 },
        { label: 'D', az: 90 },
        { label: 'GD', az: 135 },
        { label: 'G', az: 180 },
        { label: 'GB', az: 225 },
        { label: 'B', az: 270 },
        { label: 'KB', az: 315 },
      ];
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      cardinalPoints.forEach((cp) => {
        const theta = (cp.az - viewAzimuth - 90) * DEG2RAD;
        const lx = cx + (radius + 15) * Math.cos(theta);
        const ly = cy + (radius + 15) * Math.sin(theta);
        ctx.fillText(cp.label, lx, ly);
      });
    } else if (projectionMode === 'panorama') {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 10) {
        const azOffset = ((x - width / 2) / (width / 2)) * 60;
        const curAz = (viewAzimuth + azOffset + 360) % 360;
        const [px, py] = projectToCanvas(0, curAz);
        if (x === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Mountain Terrain Obstruction Silhouette on 120° Panorama
      if (location.horizonProfile && location.horizonProfile.length >= 8) {
        ctx.save();
        ctx.beginPath();
        for (let x = 0; x <= width; x += 6) {
          const azOffset = ((x - width / 2) / (width / 2)) * 60;
          const curAz = (viewAzimuth + azOffset + 360) % 360;
          const terrainAlt = getTerrainObstructionAtAzimuth(curAz, location.horizonProfile);
          const [px, py] = projectToCanvas(terrainAlt, curAz);
          if (x === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fillStyle = 'rgba(180, 83, 9, 0.22)';
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
      }
      const cardinalPoints = [
        { label: 'N (0°)', az: 0 },
        { label: 'NE (45°)', az: 45 },
        { label: 'E (90°)', az: 90 },
        { label: 'SE (135°)', az: 135 },
        { label: 'S (180°)', az: 180 },
        { label: 'SW (225°)', az: 225 },
        { label: 'W (270°)', az: 270 },
        { label: 'NW (315°)', az: 315 },
      ];
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      cardinalPoints.forEach((cp) => {
        const [px, py, isVis] = projectToCanvas(0, cp.az);
        if (isVis && px >= 15 && px <= width - 15) {
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillText(cp.label, px, py + 14);
        }
      });
    }

    // Yerel Meridyen Yayı
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    let meridianStarted = false;
    for (let alt = 0; alt <= 90; alt += 3) {
      const [px, py, isVis] = projectToCanvas(alt, 180);
      if (isVis) {
        if (!meridianStarted) {
          ctx.moveTo(px, py);
          meridianStarted = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    for (let alt = 90; alt >= 0; alt -= 3) {
      const [px, py, isVis] = projectToCanvas(alt, 0);
      if (isVis) {
        if (!meridianStarted) {
          ctx.moveTo(px, py);
          meridianStarted = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    if (showEquatorialGrid) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 4]);
      const decSteps = [-30, 0, 30, 60];
      decSteps.forEach((dVal) => {
        ctx.beginPath();
        let started = false;
        for (let ra = 0; ra <= 24; ra += 0.5) {
          const horiz = getHorizontalCoordinates(
            obsDate,
            ra,
            dVal,
            location.latitude,
            location.longitude
          );
          const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
          if (isVis) {
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
        }
        ctx.stroke();
      });
      for (let ra = 0; ra < 24; ra += 2) {
        ctx.beginPath();
        let started = false;
        for (let dec = -60; dec <= 85; dec += 5) {
          const horiz = getHorizontalCoordinates(
            obsDate,
            ra,
            dec,
            location.latitude,
            location.longitude
          );
          const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
          if (isVis) {
            if (!started) {
              ctx.moveTo(px, py);
              started = true;
            } else {
              ctx.lineTo(px, py);
            }
          }
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Procedural Milky Way Ribbon along Galactic Equator
    ctx.save();
    let ribbonStarted = false;
    ctx.beginPath();
    for (let i = 0; i < galacticNodes.length; i++) {
      const node = galacticNodes[i];
      if (!node) continue;
      const horiz = getHorizontalCoordinates(
        obsDate,
        node.raHours,
        node.decDeg,
        location.latitude,
        location.longitude
      );
      if (horiz.altitude < -5) continue;
      const [rx, ry, rVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
      if (!rVis) continue;
      if (!ribbonStarted) {
        ctx.moveTo(rx, ry);
        ribbonStarted = true;
      } else {
        ctx.lineTo(rx, ry);
      }
    }
    if (ribbonStarted) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.07)';
      ctx.lineWidth = projectionMode === 'dome' ? 36 : 72;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.10)';
      ctx.lineWidth = projectionMode === 'dome' ? 18 : 36;
      ctx.stroke();
    }
    ctx.restore();

    // Samanyolu
    galacticNodes.forEach((node) => {
      const horiz = getHorizontalCoordinates(
        obsDate,
        node.raHours,
        node.decDeg,
        location.latitude,
        location.longitude
      );
      if (horiz.altitude < -4) return;
      const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
      if (!isVis) return;
      const isSgrACore = node.isNearCore;
      const puffRadius = isSgrACore ? 60 : 36 + node.intensity * 20;
      const puffGrad = ctx.createRadialGradient(px, py, 1, px, py, puffRadius);
      if (isSgrACore && horiz.altitude > 0) {
        puffGrad.addColorStop(0, 'rgba(251, 191, 36, 0.32)');
        puffGrad.addColorStop(0.35, 'rgba(245, 158, 11, 0.18)');
        puffGrad.addColorStop(0.7, 'rgba(6, 182, 212, 0.08)');
        puffGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        puffGrad.addColorStop(0, `rgba(224, 242, 254, ${node.intensity * 0.12})`);
        puffGrad.addColorStop(0.5, `rgba(6, 182, 212, ${node.intensity * 0.06})`);
        puffGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }
      ctx.fillStyle = puffGrad;
      ctx.beginPath();
      ctx.arc(px, py, puffRadius, 0, 2 * Math.PI);
      ctx.fill();
    });

    microStarDust.forEach((star) => {
      const horiz = getHorizontalCoordinates(
        obsDate,
        star.raHours,
        star.decDeg,
        location.latitude,
        location.longitude
      );
      if (horiz.altitude <= 0) return;
      const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
      if (!isVis) return;
      ctx.fillStyle = `rgba(255, 255, 255, ${star.brightness})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.8, 0, 2 * Math.PI);
      ctx.fill();
    });

    GREAT_RIFT_DUST_LANES.forEach((rift) => {
      const horiz = getHorizontalCoordinates(
        obsDate,
        rift.raHours,
        rift.decDeg,
        location.latitude,
        location.longitude
      );
      if (horiz.altitude <= 0) return;
      const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
      if (!isVis) return;
      const riftRadius = 18;
      const riftGrad = ctx.createRadialGradient(px, py, 1, px, py, riftRadius);
      riftGrad.addColorStop(0, `rgba(2, 6, 23, ${rift.darkness * 0.75})`);
      riftGrad.addColorStop(0.7, `rgba(4, 7, 20, ${rift.darkness * 0.4})`);
      riftGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = riftGrad;
      ctx.beginPath();
      ctx.arc(px, py, riftRadius, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    CONSTELLATION_LINES.forEach((cLine) => {
      ctx.beginPath();
      let started = false;
      cLine.stars.forEach(([sRa, sDec]) => {
        const horiz = getHorizontalCoordinates(
          obsDate,
          sRa,
          sDec,
          location.latitude,
          location.longitude
        );
        const [px, py, isVis] = projectToCanvas(horiz.altitude, horiz.azimuth);
        if (isVis && horiz.altitude > 0) {
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
      });
      ctx.stroke();
    });

    calculatedStars.forEach((star) => {
      if (star.altitude <= 0) return;
      const [sx, sy, isVis] = projectToCanvas(star.altitude, star.azimuth);
      if (!isVis) return;
      const starRadius = Math.max(0.9, 3.8 - star.vMag * 0.65);
      if (star.vMag < 2.0) {
        const haloRadius = Math.max(6, 18 - star.vMag * 5);
        const haloGrad = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, haloRadius);
        haloGrad.addColorStop(0, star.color);
        haloGrad.addColorStop(0.4, star.color + '40');
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haloGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, haloRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.fillStyle = star.vMag < 1.0 ? '#ffffff' : star.color;
      ctx.beginPath();
      ctx.arc(sx, sy, starRadius, 0, 2 * Math.PI);
      ctx.fill();
      if (star.vMag < 1.4 || (projectionMode === 'target' && star.vMag < 3.0)) {
        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(star.name.split(' ')[0], sx, sy - 6);
      }
    });

    if (celestialBodies.sun.altitude > -8) {
      const [sx, sy, sVis] = projectToCanvas(
        celestialBodies.sun.altitude,
        celestialBodies.sun.azimuth
      );
      if (sVis) {
        const sunGrad = ctx.createRadialGradient(sx, sy, 2, sx, sy, 18);
        sunGrad.addColorStop(0, '#fef08a');
        sunGrad.addColorStop(0.5, 'rgba(234, 179, 8, 0.4)');
        sunGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    if (celestialBodies.moon.altitude > -4) {
      const [mx, my, mVis] = projectToCanvas(
        celestialBodies.moon.altitude,
        celestialBodies.moon.azimuth
      );
      if (mVis) {
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(mx, my, 6, 0, 2 * Math.PI);
        ctx.fill();
        const phase = celestialBodies.moon.phase;
        ctx.fillStyle = 'rgba(2, 6, 23, 0.75)';
        ctx.beginPath();
        ctx.arc(mx + (phase - 0.5) * 6, my, 5.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '8px JetBrains Mono';
        ctx.fillText(`Ay (%${celestialBodies.moon.illumination})`, mx, my - 10);
      }
    }

    calculatedTargets.forEach((target) => {
      const [tx, ty, isVis] = projectToCanvas(target.altitude, target.azimuth);
      if (!isVis) return;
      const isSelected = target.id === selectedTargetId;
      const glowRad = isSelected ? 18 : 8;
      const tGrad = ctx.createRadialGradient(tx, ty, 1, tx, ty, glowRad);
      tGrad.addColorStop(0, target.color);
      tGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = tGrad;
      ctx.beginPath();
      ctx.arc(tx, ty, glowRad, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = isSelected ? '#ffffff' : target.color;
      ctx.beginPath();
      ctx.arc(tx, ty, isSelected ? 3.5 : 2, 0, 2 * Math.PI);
      ctx.fill();
      if (isSelected || projectionMode === 'target' || target.magnitude < 5) {
        ctx.font = isSelected
          ? 'bold 9px JetBrains Mono, monospace'
          : '8px JetBrains Mono, monospace';
        ctx.fillStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.65)';
        ctx.textAlign = 'center';
        ctx.fillText(target.name.split(' ')[0], tx, ty - 8);
      }
    });

    if (projectionMode === 'target') {
      const cx = width / 2;
      const cy = height / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((cameraRotationPA * Math.PI) / 180);

      if (isMosaicEnabled && mosaicRows > 0 && mosaicCols > 0) {
        // Multi-panel Mosaic Grid Planner
        const stepFrac = 1 - mosaicOverlapPercent / 100;
        const stepX = boxW * stepFrac;
        const stepY = boxH * stepFrac;

        for (let r = 0; r < mosaicRows; r++) {
          for (let c = 0; c < mosaicCols; c++) {
            const panelNum = r * mosaicCols + c + 1;
            const offX = (c - (mosaicCols - 1) / 2) * stepX;
            const offY = (r - (mosaicRows - 1) / 2) * stepY;

            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 1.4;
            ctx.strokeRect(offX - boxW / 2, offY - boxH / 2, boxW, boxH);

            // Subdued crosshair for each panel
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(offX - 6, offY);
            ctx.lineTo(offX + 6, offY);
            ctx.moveTo(offX, offY - 6);
            ctx.lineTo(offX, offY + 6);
            ctx.stroke();

            // Panel label
            ctx.font = 'bold 8px JetBrains Mono';
            ctx.fillStyle = '#f43f5e';
            ctx.textAlign = 'left';
            ctx.fillText(`P#${panelNum}`, offX - boxW / 2 + 4, offY - boxH / 2 + 10);
          }
        }

        // Total Mosaic bounding box
        const totalW = boxW + (mosaicCols - 1) * stepX;
        const totalH = boxH + (mosaicRows - 1) * stepY;
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(-totalW / 2, -totalH / 2, totalW, totalH);
        ctx.setLineDash([]);

        ctx.font = '8px JetBrains Mono';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(
          `Mosaic: ${mosaicRows}×${mosaicCols} (${mosaicRows * mosaicCols} Panels | ${mosaicOverlapPercent}% Overlap) | Total FOV: ${(
            fovDegrees.width * (1 + (mosaicCols - 1) * stepFrac)
          ).toFixed(1)}° × ${(fovDegrees.height * (1 + (mosaicRows - 1) * stepFrac)).toFixed(1)}°`,
          -boxW / 2,
          boxH / 2 + 14
        );
      } else {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-boxW / 6, -boxH / 2);
        ctx.lineTo(-boxW / 6, boxH / 2);
        ctx.moveTo(boxW / 6, -boxH / 2);
        ctx.lineTo(boxW / 6, boxH / 2);
        ctx.moveTo(-boxW / 2, -boxH / 6);
        ctx.lineTo(boxW / 2, -boxH / 6);
        ctx.moveTo(-boxW / 2, boxH / 6);
        ctx.lineTo(boxW / 2, boxH / 6);
        ctx.stroke();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.lineTo(8, 0);
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 8);
        ctx.stroke();
        ctx.font = '8px JetBrains Mono';
        ctx.fillStyle = '#f43f5e';
        ctx.textAlign = 'left';
        ctx.fillText(
          `Full-Frame 36×24mm | PA: ${cameraRotationPA}° | ${focalLength}mm (FOV: ${fovDegrees.width.toFixed(
            1
          )}° × ${fovDegrees.height.toFixed(1)}°)`,
          -boxW / 2,
          boxH / 2 + 14
        );
      }
      ctx.restore();
    }
  }, [
    projectionMode,
    viewAzimuth,
    viewTilt,
    selectedTargetId,
    focalLength,
    cameraRotationPA,
    showEquatorialGrid,
    obsDate,
    calculatedTargets,
    calculatedStars,
    celestialBodies,
    galacticNodes,
    microStarDust,
    activeTargetCoordinates,
    fovDegrees,
    overlayOnSkyCanvas,
    location,
    isCameraUnlocked,
    cameraAzimuth,
    cameraAltitude,
    isMosaicEnabled,
    mosaicRows,
    mosaicCols,
    mosaicOverlapPercent,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      az: viewAzimuth,
      tilt: viewTilt,
      camAz: cameraAzimuth,
      camAlt: cameraAltitude,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (projectionMode === 'dome') {
      const newAz = (dragStart.current.az - dx * 0.45 + 360) % 360;
      setViewAzimuth(Math.round(newAz));
    } else if (projectionMode === 'panorama') {
      const newAz = (dragStart.current.az - dx * 0.35 + 360) % 360;
      const newTilt = Math.max(0, Math.min(85, dragStart.current.tilt + dy * 0.25));
      setViewAzimuth(Math.round(newAz));
      setViewTilt(Math.round(newTilt));
    } else {
      setIsCameraUnlocked(true);
      const newCamAz = (dragStart.current.camAz - dx * 0.15 + 360) % 360;
      const newCamAlt = Math.max(-10, Math.min(90, dragStart.current.camAlt + dy * 0.15));
      setCameraAzimuth(Math.round(newCamAz));
      setCameraAltitude(Math.round(newCamAlt));
    }
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      touchStartDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartFocal.current = focalLength;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && touchStartDist.current !== null) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = currentDist / touchStartDist.current;
      const newFocal = Math.max(14, Math.min(600, Math.round(touchStartFocal.current * ratio)));
      setFocalLength(newFocal);
    }
  };

  const handleTouchEnd = () => {
    touchStartDist.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 15 : -15;
    setFocalLength((prev) => Math.max(14, Math.min(600, prev + delta)));
  };

  const handleUploadRefImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== 'string') return;
      const base64 = result;
      setRefImage(base64);
      setPlateSolveSolution(null);
      saveFrameToIDB(MODUL_H_STORAGE_REF, base64);
      try {
        localStorage.setItem(MODUL_H_STORAGE_REF, base64);
      } catch (err) {
        console.warn('LocalStorage image storage limit exceeded', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadTestImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== 'string') return;
      const base64 = result;
      setTestImage(base64);
      setPlateSolveSolution(null);
      saveFrameToIDB(MODUL_H_STORAGE_TEST, base64);
      try {
        localStorage.setItem(MODUL_H_STORAGE_TEST, base64);
      } catch (err) {
        console.warn('LocalStorage image storage limit exceeded', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunPlateSolve = () => {
    if (!refImage || !testImage) {
      setPlateSolveError('Please upload both Night 1 Reference and Night 2 Test frames to align.');
      return;
    }
    setIsPlateSolving(true);
    setPlateSolveError(null);

    const processFrame = (imgSrc: string): Promise<DetectedStar[]> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 480;
            let w = img.width || 480;
            let h = img.height || 480;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve([]);
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            const stars = detectBrightStarsFromImageData(data, w, h, 35);
            resolve(stars);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Image failed to load for star detection'));
        img.src = imgSrc;
      });
    };

    Promise.all([processFrame(refImage), processFrame(testImage)])
      .then(([rStars, tStars]) => {
        setDetectedRefStars(rStars);
        setDetectedTestStars(tStars);
        const sol = solveFrameAlignment(rStars, tStars, fovDegrees.width, fovDegrees.height);
        setPlateSolveSolution(sol);
        setIsPlateSolving(false);
      })
      .catch((err) => {
        console.warn('Plate-solve failed', err);
        setIsPlateSolving(false);
        setPlateSolveError('Plate-solve failed to extract image pixel data.');
      });
  };

  return (
    <div id="tabSky" className="space-y-4 pb-24 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border border-theme bg-black/40">
        <div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider font-mono text-theme-primary flex items-center gap-2">
            <Eye className="w-4 h-4" /> 2D Sky Viewfinder & Framing Matcher
          </h1>
          <p className="text-[11px] text-theme-muted mt-0.5">
            Dynamic LST Milky Way, 120+ Bright Stars & Framing Tool
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsPolarModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/50 bg-red-950/40 hover:bg-red-900/40 text-xs font-mono font-bold text-red-300 transition-all glow-primary-subtle shadow-md cursor-pointer"
            title="Polar Scope Alignment Assistant (Polaris Reticle)"
          >
            <Crosshair className="w-3.5 h-3.5 text-red-400 animate-pulse" />
            <span>Polar Scope</span>
          </button>
          <div className="flex items-center gap-1 p-1 rounded-xl border border-theme bg-black/60">
            {PROJECTION_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setProjectionMode(mode.id)}
                className={`px-3 py-1 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                  projectionMode === mode.id
                    ? 'bg-theme-primary text-black font-bold glow-primary-subtle shadow-sm'
                    : 'text-theme-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`p-3 rounded-2xl border transition-all ${
          meridianFlipStatus.isFlipImminent
            ? 'border-red-500 bg-red-950/40 shadow-lg shadow-red-500/30'
            : 'border-theme bg-[var(--theme-card)]'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold shrink-0 ${
                meridianFlipStatus.isFlipImminent
                  ? 'bg-red-500 text-white animate-bounce'
                  : 'bg-theme-primary/20 text-theme-primary border border-theme'
              }`}
            >
              🔄
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono text-white">
                  Meridian Flip Counter: {selectedTarget.name}
                </span>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold ${
                    meridianFlipStatus.isPreMeridian
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {meridianFlipStatus.axisSide}
                </span>
              </div>
              <div className="text-[10px] text-theme-muted font-mono mt-0.5">
                Hour Angle (HA): {meridianFlipStatus.hourAngleHours}h | Meridian Transit Time:{' '}
                <b className="text-white">{meridianFlipStatus.transitTimeStr}</b>
              </div>
            </div>
          </div>
          <div>
            {meridianFlipStatus.isFlipImminent ? (
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-red-500 text-white animate-pulse flex items-center gap-1.5 shadow-md">
                <AlertTriangle className="w-3.5 h-3.5" /> ⚠️ Meridian Flip Imminent!
              </span>
            ) : (
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-lg bg-white/5 border border-white/10 text-cyan-300">
                Time to Transit: {meridianFlipStatus.hoursToTransit}h{' '}
                {meridianFlipStatus.minsRemainderToTransit}m
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-3 sm:p-4 space-y-3 relative overflow-hidden">
        <div className="flex items-center justify-between text-xs font-mono border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-theme-muted">
              {projectionMode === 'target' ? (
                <>
                  Cam Az: <b className="text-white">{cameraAzimuth}°</b> • Alt:{' '}
                  <b className="text-white">{cameraAltitude}°</b>
                </>
              ) : (
                <>
                  Azimuth: <b className="text-white">{viewAzimuth}°</b> • Altitude:{' '}
                  <b className="text-white">{viewTilt}°</b>
                </>
              )}
            </span>
            <span className="text-[10px] text-theme-muted hidden sm:inline">
              (Drag to Pan & Tilt / Two-finger pinch to zoom)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEquatorialGrid(!showEquatorialGrid)}
              className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all flex items-center gap-1 cursor-pointer ${
                showEquatorialGrid
                  ? 'bg-theme-primary text-black font-bold border-theme'
                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
              title="Toggle Celestial Equator & RA/Dec Grid"
            >
              <Grid className="w-3 h-3" />
              <span>RA/Dec Grid</span>
            </button>
            {projectionMode === 'target' && (
              <button
                onClick={() => {
                  if (isCameraUnlocked) {
                    setIsCameraUnlocked(false);
                    setCameraAzimuth(Math.round(activeTargetCoordinates.azimuth));
                    setCameraAltitude(Math.round(activeTargetCoordinates.altitude));
                  } else {
                    setIsCameraUnlocked(true);
                  }
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                  isCameraUnlocked
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-red-950/40 text-red-400 border-red-500/30'
                }`}
                title="Toggle Unlocked Free Pan/Tilt FOV vs Locked Target"
              >
                {isCameraUnlocked
                  ? '🔓 Free Pan/Tilt FOV'
                  : `🔒 Locked: ${activeTargetCoordinates.name.split(' ')[0]}`}
              </button>
            )}
            <button
              onClick={() => {
                setViewAzimuth(180);
                setViewTilt(45);
                setIsCameraUnlocked(false);
                setCameraAzimuth(Math.round(activeTargetCoordinates.azimuth));
                setCameraAltitude(Math.round(activeTargetCoordinates.altitude));
              }}
              className="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-theme-muted hover:text-white cursor-pointer"
              title="Reset View"
            >
              Reset View
            </button>
          </div>
        </div>

        <div className="relative w-full rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          <canvas
            id="skyCanvas"
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            className="w-full cursor-grab active:cursor-grabbing block touch-none"
            style={{ height: '360px' }}
          />
          <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-10">
            <button
              onClick={() => setFocalLength((prev) => Math.min(600, prev + 25))}
              className="w-7 h-7 rounded-lg bg-black/70 hover:bg-black border border-white/20 text-white flex items-center justify-center text-xs cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setFocalLength((prev) => Math.max(14, prev - 25))}
              className="w-7 h-7 rounded-lg bg-black/70 hover:bg-black border border-white/20 text-white flex items-center justify-center text-xs cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="p-2.5 rounded-xl border border-white/10 bg-black/40 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-theme-muted flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-theme-primary" /> Ephemeris Time
            </span>
            <div className="flex items-center gap-2">
              <span className="text-theme-primary font-bold">
                {obsDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                - {formatTimeHM(obsDate, tz)}
              </span>
              <button
                onClick={() => {
                  setIsLiveTime(!isLiveTime);
                  if (!isLiveTime) setObsDate(new Date());
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                  isLiveTime
                    ? 'bg-emerald-500 text-black animate-pulse'
                    : 'bg-white/10 hover:bg-white/20 text-slate-300'
                }`}
              >
                ● {isLiveTime ? 'Live Now' : 'Live Now'}
              </button>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={287}
            step={1}
            value={(() => {
              const p = siteParts(obsDate, tz);
              return Math.round((p.hour * 60 + p.minute) / 5);
            })()}
            onChange={(e) => {
              setIsLiveTime(false);
              const totalMins = parseInt(e.target.value) * 5;
              const h = Math.floor(totalMins / 60);
              const m = totalMins % 60;
              const p = siteParts(obsDate, tz);
              const d = zonedTimeToInstant(p.year, p.month, p.day, h, m, 0, tz);
              setObsDate(d);
            }}
            className="w-full accent-[var(--theme-primary)] h-2 bg-slate-900 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-theme-muted">
            <span>00:00 (Midnight)</span>
            <span>06:00 (Dawn)</span>
            <span>12:00 (Noon)</span>
            <span>18:00 (Dusk)</span>
            <span>23:55</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/10 pb-2 gap-2">
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-theme-primary" /> Optical Sensors & Framing FOV
          </span>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-theme-muted">Scale:</span>
            <span className="text-cyan-300 font-bold">{fovDegrees.pixelScaleArcsec}″/px</span>
            <span className="text-slate-600">|</span>
            <span className="text-theme-muted">Crop:</span>
            <span className="text-amber-300 font-bold">{fovDegrees.cropFactor.toFixed(1)}×</span>
            <span className="text-slate-600">|</span>
            <span className="text-theme-accent">{activeSensor.label}</span>
          </div>
        </div>

        {/* Sensor Preset Selector */}
        <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-black/40 border border-white/10">
          {SENSOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setSelectedSensorId(preset.id)}
              className={`px-2.5 py-1 text-[10px] font-mono rounded-lg border transition-all cursor-pointer ${
                selectedSensorId === preset.id
                  ? 'bg-theme-primary text-black font-bold border-theme shadow-xs'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-theme-muted">
                Focal Length (FOV: {fovDegrees.width.toFixed(1)}° × {fovDegrees.height.toFixed(1)}°)
              </span>
              <span className="font-bold text-white text-sm">{focalLength} mm</span>
            </div>
            <input
              type="range"
              min={14}
              max={600}
              step={1}
              value={focalLength}
              onChange={(e) => setFocalLength(parseInt(e.target.value))}
              className="w-full accent-[var(--theme-primary)] h-2 bg-slate-900 rounded-lg cursor-pointer"
            />
            <div className="flex gap-1 pt-1">
              {[14, 24, 50, 85, 135, 250, 400, 600].map((fl) => (
                <button
                  key={fl}
                  onClick={() => setFocalLength(fl)}
                  className={`flex-1 py-0.5 text-[9px] font-mono rounded border transition-all cursor-pointer ${
                    focalLength === fl
                      ? 'bg-theme-primary text-black font-bold border-theme'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {fl}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-theme-muted flex items-center gap-1">
                <RotateCw className="w-3.5 h-3.5 text-theme-accent" /> Camera Position Angle (PA)
              </span>
              <span className="font-bold text-theme-accent text-sm">
                {cameraRotationPA}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={360}
              step={1}
              value={cameraRotationPA}
              onChange={(e) => setCameraRotationPA(parseInt(e.target.value))}
              className="w-full accent-theme-accent h-2 bg-slate-900 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-theme-muted pt-1">
              <span>0° (Landscape)</span>
              <span>90° (Portrait)</span>
              <span>180°</span>
              <span>270°</span>
              <span>360°</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mosaic Grid Planner & Multi-Panel Calculator */}
      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-theme-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-white">
              Mosaic Grid Planner & Field Calculator
            </h2>
          </div>
          <button
            onClick={() => {
              setIsMosaicEnabled(!isMosaicEnabled);
              if (projectionMode !== 'target') setProjectionMode('target');
            }}
            className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-all cursor-pointer ${
              isMosaicEnabled
                ? 'bg-theme-primary text-black border-theme shadow-sm glow-primary-subtle'
                : 'bg-white/5 border-white/10 text-theme-muted hover:text-white'
            }`}
          >
            {isMosaicEnabled ? '✓ Mosaic Mode Active' : '+ Enable Mosaic Planner'}
          </button>
        </div>

        {isMosaicEnabled && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="flex justify-between text-theme-muted">
                  <span>Grid Matrix (Rows × Cols):</span>
                  <b className="text-white">{mosaicRows} × {mosaicCols}</b>
                </div>
                <div className="flex gap-1 pt-1">
                  {[
                    { r: 1, c: 1, label: '1×1' },
                    { r: 2, c: 1, label: '2×1' },
                    { r: 2, c: 2, label: '2×2' },
                    { r: 3, c: 2, label: '3×2' },
                    { r: 3, c: 3, label: '3×3' },
                    { r: 4, c: 3, label: '4×3' },
                  ].map((cfg) => {
                    const isSel = mosaicRows === cfg.r && mosaicCols === cfg.c;
                    return (
                      <button
                        key={cfg.label}
                        onClick={() => {
                          setMosaicRows(cfg.r);
                          setMosaicCols(cfg.c);
                        }}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                          isSel
                            ? 'bg-theme-primary text-black font-bold border-theme'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                <div className="flex justify-between text-theme-muted">
                  <span>Panel Overlap:</span>
                  <b className="text-theme-primary">%{mosaicOverlapPercent}</b>
                </div>
                <div className="flex gap-1 pt-1">
                  {[10, 15, 20, 25].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setMosaicOverlapPercent(pct)}
                      className={`flex-1 py-1 rounded text-[10px] font-mono border transition-all cursor-pointer ${
                        mosaicOverlapPercent === pct
                          ? 'bg-theme-primary text-black font-bold border-theme'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      %{pct}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 space-y-1.5 flex flex-col justify-center">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-theme-muted">Total Panels:</span>
                  <span className="font-bold text-amber-300 px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-500/30">
                    {mosaicRows * mosaicCols} Panels
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-theme-muted">Total Effective FOV:</span>
                  <span className="font-bold text-sky-300">
                    {(fovDegrees.width * (1 + (mosaicCols - 1) * (1 - mosaicOverlapPercent / 100))).toFixed(1)}° ×{' '}
                    {(fovDegrees.height * (1 + (mosaicRows - 1) * (1 - mosaicOverlapPercent / 100))).toFixed(1)}°
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-theme-primary" /> 30 Popular Deep-Sky Targets
          </span>
          <span className="text-[10px] font-mono text-theme-muted">
            Click to lock onto target
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
          {calculatedTargets.map((target) => {
            const isSelected = target.id === selectedTargetId;
            const isVisible = target.altitude > 0;
            return (
              <button
                key={target.id}
                onClick={() => {
                  setSelectedTargetId(target.id);
                  if (projectionMode !== 'target') setProjectionMode('target');
                }}
                className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-theme bg-theme-primary/10 glow-primary-subtle'
                    : 'border-white/5 bg-black/40 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-white truncate">
                    {target.name.split(' ')[0]}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: target.color }}
                  />
                </div>
                <div className="text-[10px] font-mono text-theme-muted truncate mt-0.5">
                  {target.catalog.split('/')[0]}
                </div>
                <div className="text-[9px] font-mono mt-1 flex justify-between">
                  <span className={isVisible ? 'text-emerald-400' : 'text-red-400'}>
                    {isVisible ? `${target.altitude.toFixed(0)}° Alt` : 'Below Horizon'}
                  </span>
                  <span className="text-slate-400">{target.recommendedFocal}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-theme-primary" /> Module H: Framing Matcher
            </h2>
            <p className="text-[10px] text-theme-muted">
              Align reference and test frames across multi-night sessions (Ghost, Blink, Swipe)
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-xl border border-theme bg-black/60 self-start sm:self-auto">
            {MODUL_H_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setModulHMode(m.id)}
                className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                  modulHMode === m.id
                    ? 'bg-theme-primary text-black font-bold glow-primary-subtle'
                    : 'text-theme-muted hover:text-white hover:bg-white/5'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Night 1 Reference Frame
              </span>
              {refImage && (
                <button
                  onClick={() => {
                    setRefImage(null);
                    setPlateSolveSolution(null);
                    removeFrameFromIDB(MODUL_H_STORAGE_REF);
                    try {
                      localStorage.removeItem(MODUL_H_STORAGE_REF);
                    } catch {}
                  }}
                  className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex-1 py-1.5 px-3 rounded-lg border border-theme/60 bg-white/5 hover:bg-white/10 text-center cursor-pointer text-[11px] text-theme-accent truncate">
                <Upload className="w-3.5 h-3.5 inline mr-1" />
                {refImage ? 'Replace Reference' : 'Upload Reference Image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadRefImage}
                  className="hidden"
                />
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-theme-muted">
                <input
                  type="checkbox"
                  checked={overlayOnSkyCanvas}
                  onChange={(e) => setOverlayOnSkyCanvas(e.target.checked)}
                  className="accent-[var(--theme-primary)]"
                />
                <span>Overlay on Viewfinder</span>
              </label>
            </div>
          </div>
          <div className="p-3 rounded-xl border border-white/10 bg-black/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Night 2 Test Frame
              </span>
              {testImage && (
                <button
                  onClick={() => {
                    setTestImage(null);
                    setPlateSolveSolution(null);
                    removeFrameFromIDB(MODUL_H_STORAGE_TEST);
                    try {
                      localStorage.removeItem(MODUL_H_STORAGE_TEST);
                    } catch {}
                  }}
                  className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
                >
                  Remove
                </button>
              )}
            </div>
            <label className="block py-1.5 px-3 rounded-lg border border-theme/60 bg-white/5 hover:bg-white/10 text-center cursor-pointer text-[11px] text-amber-300 truncate">
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              {testImage ? 'Replace Test Frame' : 'Upload Test Image'}
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadTestImage}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden bg-black border border-white/20 flex items-center justify-center select-none">
          {!refImage && !testImage ? (
            <div className="text-center p-4 text-xs font-mono text-theme-muted space-y-1">
              <ImageIcon className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <p>Please upload Night 1 Reference and Night 2 Test frames to match composition.</p>
              <p className="text-[10px] text-slate-500">
                Detect star alignment drift and field rotation micrometrically with blink comparator.
              </p>
            </div>
          ) : (
            <div className="relative w-full h-full">
              {modulHMode === 'ghost' && (
                <>
                  {refImage && (
                    <img
                      src={refImage}
                      alt="Ref"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  {testImage && (
                    <img
                      src={testImage}
                      alt="Test"
                      style={{ opacity: ghostOpacity / 100 }}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity"
                    />
                  )}
                </>
              )}
              {modulHMode === 'blink' && (
                <>
                  {blinkActiveFrame === 'ref' && refImage && (
                    <img
                      src={refImage}
                      alt="Blink Ref"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  {blinkActiveFrame === 'test' && testImage && (
                    <img
                      src={testImage}
                      alt="Blink Test"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/80 border border-theme text-[10px] font-mono font-bold text-white">
                    Displayed: {blinkActiveFrame === 'ref' ? 'Night 1 Reference' : 'Night 2 Test'}
                  </div>
                </>
              )}
              {modulHMode === 'swipe' && (
                <>
                  {refImage && (
                    <img
                      src={refImage}
                      alt="Swipe Left"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}
                  {testImage && (
                    <div
                      className="absolute inset-0 overflow-hidden pointer-events-none"
                      style={{ clipPath: `inset(0 0 0 ${swipeDivider}%)` }}
                    >
                      <img
                        src={testImage}
                        alt="Swipe Right"
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      />
                    </div>
                  )}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-theme-primary pointer-events-none shadow-lg glow-primary"
                    style={{ left: `${swipeDivider}%` }}
                  />
                </>
              )}
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-black/40 border border-white/10">
          {modulHMode === 'ghost' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-theme-muted">Test Layer Opacity:</span>
                <span className="font-bold text-white">%{ghostOpacity}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={ghostOpacity}
                onChange={(e) => setGhostOpacity(parseInt(e.target.value))}
                className="w-full accent-[var(--theme-primary)] h-2 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>
          )}
          {modulHMode === 'blink' && (
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-theme-muted">
                Blink Interval: <b>450 ms</b> (Cyclic)
              </span>
              <button
                onClick={() => setIsBlinking(!isBlinking)}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-theme-primary text-black font-bold text-xs cursor-pointer"
              >
                {isBlinking ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isBlinking ? 'Pause' : 'Start'}</span>
              </button>
            </div>
          )}
          {modulHMode === 'swipe' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-theme-muted">Split Position:</span>
                <span className="font-bold text-white">%{swipeDivider}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={swipeDivider}
                onChange={(e) => setSwipeDivider(parseInt(e.target.value))}
                className="w-full accent-[var(--theme-primary)] h-2 bg-slate-900 rounded-lg cursor-pointer"
              />
            </div>
          )}
        </div>

        {/* Module H Plate-Solve (Star-Triangle Framing & HFR Matching) */}
        <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-slate-950/70 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div>
              <span className="text-xs font-bold font-mono text-cyan-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" /> Relative Star-Triangle Plate-Solve & HFR
              </span>
              <p className="text-[10px] text-slate-400 font-mono">
                Solve camera PA rotation (ΔPA), framing shift (ΔAz / ΔAlt), and optical focus (HFR)
              </p>
            </div>
            <button
              onClick={handleRunPlateSolve}
              disabled={isPlateSolving || !refImage || !testImage}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isPlateSolving || !refImage || !testImage
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-md glow-primary'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{isPlateSolving ? 'Solving Asterisms...' : 'Run Plate-Solve Align'}</span>
            </button>
          </div>

          {plateSolveError && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs font-mono text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{plateSolveError}</span>
            </div>
          )}

          {plateSolveSolution && (
            <div className="space-y-2.5 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-black/50 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Stars Matched</span>
                  <span className="font-bold text-cyan-300 text-sm">
                    {plateSolveSolution.matchedStarsCount} Stars
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/50 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Camera Angle (ΔPA)</span>
                  <span className={`font-bold text-sm ${Math.abs(plateSolveSolution.rotationDeltaDeg) < 0.5 ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {plateSolveSolution.rotationDeltaDeg > 0 ? '+' : ''}{plateSolveSolution.rotationDeltaDeg}° {plateSolveSolution.rotationDeltaDeg >= 0 ? 'CW' : 'CCW'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/50 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Framing Shift (Az / Alt)</span>
                  <span className="font-bold text-white text-xs">
                    ΔAz {plateSolveSolution.shiftAzDeg >= 0 ? '+' : ''}{plateSolveSolution.shiftAzDeg}° | ΔAlt {plateSolveSolution.shiftAltDeg >= 0 ? '+' : ''}{plateSolveSolution.shiftAltDeg}°
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Offset: X {plateSolveSolution.shiftXPercent}%, Y {plateSolveSolution.shiftYPercent}%
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-black/50 border border-white/10">
                  <span className="text-slate-400 block text-[10px]">Focus Quality (HFR)</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        plateSolveSolution.focusStatus === 'sharp'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : plateSolveSolution.focusStatus === 'soft'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      {plateSolveSolution.focusStatus}
                    </span>
                    <span className="text-[10px] text-slate-300">
                      {plateSolveSolution.testAvgHfrPx}px / {plateSolveSolution.refAvgHfrPx}px
                    </span>
                  </div>
                </div>
              </div>

              {/* Actionable Instruction Summary */}
              <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/40 text-xs font-mono text-cyan-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-cyan-300 block text-[11px]">Field Re-Alignment Guidance:</span>
                  <p className="text-[11px] leading-relaxed">{plateSolveSolution.instructionSummary}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PolarScopeModal
        isOpen={isPolarModalOpen}
        onClose={() => setIsPolarModalOpen(false)}
        location={location}
        observationDate={obsDate}
      />
    </div>
  );
};
