import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Compass,
  Navigation,
  MapPin,
  Clock,
  Car,
  Sliders,
  ExternalLink,
  BookOpen,
  Plus,
  Trash2,
  Download,
  Upload,
  Star,
  Sparkles,
  AlertCircle,
  CheckSquare,
  Square,
  ShieldAlert,
  BatteryCharging,
  Droplets,
  Wifi,
  Tent,
  RotateCcw,
  Layers,
  Fuel,
  Satellite,
} from 'lucide-react';
import {
  LocationData,
  ObservationLog,
  OriginCity,
  ResolvedSite,
  RoadConditionType,
  GsmCoverageLevel,
  SiteLogisticsProfile,
  EquipmentChecklistItem,
  EquipmentProfile,
} from '../../types';
import {
  calculateDrivingRoute,
  MAJOR_ORIGIN_CITIES,
  RouteResult,
} from '../../lib/routeService';
import { calculateNightEphemeris, formatTimeHM } from '../../lib/ephemeris';
import { siteDateKey } from '../../lib/siteTime';
import { saveJsonToDevice } from '../../lib/deviceStorage';

interface RouteTabProps {
  location: ResolvedSite;
  selectedNightKey?: string;
  onOpenLocationModal?: () => void;
}

const JOURNAL_STORAGE_KEY = 'chroma_nocta_observation_journal';
const ORIGIN_STORAGE_KEY = 'chroma_nocta_selected_origin';
const CHECKLIST_STORAGE_KEY = 'chroma_nocta_equipment_profiles_v2';

interface RoadOption {
  id: RoadConditionType;
  label: string;
}

const ROAD_OPTIONS: RoadOption[] = [
  { id: 'asphalt', label: 'Asphalt / Highway' },
  { id: 'stabilized', label: 'Stabilized Gravel' },
  { id: 'offroad-4x4', label: 'Off-Road 4x4 Only' },
  { id: 'winter-risk', label: 'Winter / Snow Risk' },
];

interface GsmOption {
  id: GsmCoverageLevel;
  label: string;
}

const GSM_OPTIONS: GsmOption[] = [
  { id: 'full', label: 'Full 4G/5G Signal' },
  { id: 'weak', label: 'Weak / Spotty Signal' },
  { id: 'none', label: 'No Cellular Signal' },
  { id: 'unknown', label: 'Unverified Signal' },
];

const INITIAL_LOGS: ObservationLog[] = [
  {
    id: 'log-1',
    date: '2026-09-18',
    targetName: 'M31 Andromeda Galaxy',
    locationName: 'Bolu Sarıalan Plateau (Aladağlar)',
    equipment: 'Askar 200mm f/4 Astro Lens + EQ5 Pro',
    camera: 'ASI533MC Pro (-10°C)',
    filter: 'Optolong L-Pro Broadband',
    subSeconds: 180,
    subCount: 45,
    totalIntegrationMinutes: 135,
    rating: 5,
    notes: 'Flawless transparency, Milky Way clearly visible to naked eye. Zero dew/frosting.',
    createdAt: 1726690800000,
  },
  {
    id: 'log-2',
    date: '2026-08-12',
    targetName: 'M45 Pleiades Dust Clouds',
    locationName: 'Isparta Melikler Plateau',
    equipment: 'William Optics Zenithstar 73',
    camera: 'Sony A7IV Full Frame (Astro-mod)',
    filter: 'Unfiltered (Luminance)',
    subSeconds: 120,
    subCount: 60,
    totalIntegrationMinutes: 120,
    rating: 4,
    notes: 'Mild breeze present, dew heaters remained on all night.',
    createdAt: 1723494000000,
  },
];

const DEFAULT_EQUIPMENT_PROFILES: EquipmentProfile[] = [
  {
    id: 'deepsky',
    name: 'Deep Sky Rig',
    description: 'Complete tracked imaging setup with guiding, cooling, and narrowband filtration',
    items: [
      { id: 'ds-1', name: 'Primary Telescope OTA / Astrograph', category: 'Optics', checked: true },
      { id: 'ds-2', name: 'Equatorial Mount & Heavy Tripod', category: 'Mount', checked: true },
      { id: 'ds-3', name: 'Counterweights & Shaft Bar', category: 'Mount', checked: true },
      { id: 'ds-4', name: 'Cooled Primary Astro Camera & Power Cable', category: 'Camera', checked: true },
      { id: 'ds-5', name: 'Guide Scope (30mm/50mm) & Guide Camera', category: 'Guiding', checked: true },
      { id: 'ds-6', name: 'Dew Heater Straps (OTA + Guide)', category: 'Environment', checked: true },
      { id: 'ds-7', name: 'ASIAIR / Mini PC & USB3 Data Cables', category: 'Control', checked: false },
      { id: 'ds-8', name: '12V/220V LiFePO4 Field Power Station', category: 'Power', checked: false },
      { id: 'ds-9', name: 'Bahtinov Focus Mask', category: 'Focus', checked: false },
      { id: 'ds-10', name: 'Filter Wheel / Dual-Narrowband Filters', category: 'Filters', checked: false },
      { id: 'ds-11', name: 'Allen Hex Keys & Bubble Level', category: 'Tools', checked: false },
      { id: 'ds-12', name: 'Red LED Headlamp & Ground Tarp', category: 'Safety', checked: false },
    ],
  },
  {
    id: 'widefield',
    name: 'Widefield & Milky Way',
    description: 'Lightweight star tracker setup for landscape astrophotography and Milky Way arches',
    items: [
      { id: 'wf-1', name: 'Carbon Fiber Tripod & Ballhead', category: 'Mount', checked: true },
      { id: 'wf-2', name: 'Compact Star Tracker & Declination Bracket', category: 'Mount', checked: true },
      { id: 'wf-3', name: 'Full-frame Mirrorless / DSLR Body', category: 'Camera', checked: true },
      { id: 'wf-4', name: 'Fast Wide-Angle Lens (14mm-24mm f/1.8-f/2.8)', category: 'Optics', checked: true },
      { id: 'wf-5', name: 'Programmable Remote Shutter / Intervalometer', category: 'Control', checked: false },
      { id: 'wf-6', name: 'USB Lens Dew Heater Band & Power Bank', category: 'Power', checked: false },
      { id: 'wf-7', name: 'Spare Camera Batteries (Cold-Tolerant)', category: 'Power', checked: false },
      { id: 'wf-8', name: 'Lens Cleaning Air Blower & Microfiber', category: 'Care', checked: false },
      { id: 'wf-9', name: 'Headlamp with Pure Red Light Mode', category: 'Safety', checked: false },
    ],
  },
  {
    id: 'timelapse',
    name: 'Nightscape & Holy Grail Time-Lapse',
    description: 'All-night automated continuous time-lapse and holy grail sunset-to-dark capture',
    items: [
      { id: 'tl-1', name: 'Sturdy Low-Vibration Tripod with Stone Bag', category: 'Mount', checked: true },
      { id: 'tl-2', name: 'Primary Camera with Clean High-ISO Sensor', category: 'Camera', checked: true },
      { id: 'tl-3', name: 'Fast Prime Wide Lens (20mm / 24mm f/1.4)', category: 'Optics', checked: true },
      { id: 'tl-4', name: 'Hardware Intervalometer (Ramping Support)', category: 'Control', checked: true },
      { id: 'tl-5', name: 'Continuous Dummy Battery (USB-C PD Powered)', category: 'Power', checked: false },
      { id: 'tl-6', name: 'High-Capacity 26800mAh PD Powerbank', category: 'Power', checked: false },
      { id: 'tl-7', name: 'Continuous Lens Dew Heater Strip', category: 'Environment', checked: false },
      { id: 'tl-8', name: 'Starglow / Diffuser Filter (Constellation Pop)', category: 'Filters', checked: false },
      { id: 'tl-9', name: 'Fast 256GB V60/V90 High-Endurance SD Card', category: 'Storage', checked: false },
    ],
  },
  {
    id: 'camping',
    name: 'Field Camp & Cold Safety',
    description: 'Survival, warmth, and base camp readiness for sub-zero mountain plateau nights',
    items: [
      { id: 'cp-1', name: 'Thermal Base Layers & Down Puffer Jacket', category: 'Clothing', checked: true },
      { id: 'cp-2', name: 'Windproof 4-Season Tent & Ground Footprint', category: 'Shelter', checked: true },
      { id: 'cp-3', name: 'Sub-Zero Sleeping Bag (-10°C Comfort Rating)', category: 'Shelter', checked: true },
      { id: 'cp-4', name: 'Insulated Inflatable Sleeping Pad (High R-Value)', category: 'Shelter', checked: true },
      { id: 'cp-5', name: 'Hands-Free Dual Red/White LED Headlamp', category: 'Lighting', checked: false },
      { id: 'cp-6', name: 'Stainless Vacuum Thermos with Hot Tea/Water', category: 'Food & Drink', checked: false },
      { id: 'cp-7', name: '5-Liter Potable Drinking Water Jug', category: 'Food & Drink', checked: false },
      { id: 'cp-8', name: 'Outdoor First Aid Kit & Emergency Mylar Blanket', category: 'Safety', checked: false },
      { id: 'cp-9', name: 'High-Lumen Red Area Lantern for Base Camp', category: 'Lighting', checked: false },
      { id: 'cp-10', name: 'Heavy Duty 500Wh+ Solar/LiFePO4 Power Station', category: 'Power', checked: false },
    ],
  },
];

export const RouteTab: React.FC<RouteTabProps> = ({
  location,
  selectedNightKey,
  onOpenLocationModal,
}) => {
  const [selectedOrigin, setSelectedOrigin] = useState<OriginCity>(() => {
    try {
      const saved = localStorage.getItem(ORIGIN_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return MAJOR_ORIGIN_CITIES[0];
  });
  const [isGpsLoading, setIsGpsLoading] = useState(false);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [setupBufferMinutes, setSetupBufferMinutes] = useState<number>(60);
  const [manualDriveMinutes, setManualDriveMinutes] = useState<number>(60);

  const targetNightKey =
    selectedNightKey && selectedNightKey.length > 0
      ? selectedNightKey
      : siteDateKey(Date.now(), location.timeZone);

  // --- Site Logistics Dossier State ---
  const siteLogisticsKey = `chroma_nocta_site_logistics_${location.id}`;
  const [logistics, setLogistics] = useState<SiteLogisticsProfile>(() => {
    try {
      const saved = localStorage.getItem(siteLogisticsKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return {
      siteId: location.id,
      roadCondition: location.elevation > 1500 ? 'stabilized' : 'asphalt',
      hasMainsPower: false,
      hasWater: false,
      hasRestroom: false,
      hasFlatCampArea: true,
      hasFlatCamping: true,
      gsmCoverage: location.elevation > 1800 ? 'weak' : 'full',
      notes: 'Remote dark sky site. Approach gravel roads with care. Bring independent power and warm layers.',
      winterTireRequired: location.elevation > 1200,
    };
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`chroma_nocta_site_logistics_${location.id}`);
      if (saved) {
        setLogistics(JSON.parse(saved));
        return;
      }
    } catch (e) {
      console.warn(e);
    }
    setLogistics({
      siteId: location.id,
      roadCondition: location.elevation > 1500 ? 'stabilized' : 'asphalt',
      hasMainsPower: false,
      hasWater: false,
      hasRestroom: false,
      hasFlatCampArea: true,
      hasFlatCamping: true,
      gsmCoverage: location.elevation > 1800 ? 'weak' : 'full',
      notes: 'Remote dark sky site. Approach gravel roads with care. Bring independent power and warm layers.',
      winterTireRequired: location.elevation > 1200,
    });
  }, [location.id, location.elevation]);

  const updateLogistics = (updater: (prev: SiteLogisticsProfile) => SiteLogisticsProfile) => {
    setLogistics((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(`chroma_nocta_site_logistics_${location.id}`, JSON.stringify(next));
      } catch (e) {
        console.warn(e);
      }
      return next;
    });
  };

  // --- Equipment Checklist State ---
  const [equipmentProfiles, setEquipmentProfiles] = useState<EquipmentProfile[]>(() => {
    try {
      const saved = localStorage.getItem(CHECKLIST_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return DEFAULT_EQUIPMENT_PROFILES;
  });
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_EQUIPMENT_PROFILES[0].id);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Gear');
  const checklistFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(equipmentProfiles));
    } catch (e) {
      console.warn(e);
    }
  }, [equipmentProfiles]);

  const activeEquipmentProfile = useMemo(() => {
    const found = equipmentProfiles.find((p) => p.id === activeProfileId);
    return found ? found : equipmentProfiles[0];
  }, [equipmentProfiles, activeProfileId]);

  const toggleChecklistItem = (itemId: string) => {
    setEquipmentProfiles((profiles) =>
      profiles.map((p) => {
        if (p.id !== activeProfileId) return p;
        return {
          ...p,
          items: p.items.map((it) => (it.id === itemId ? { ...it, checked: !it.checked } : it)),
        };
      })
    );
  };

  const handleDeleteChecklistItem = (itemId: string) => {
    setEquipmentProfiles((profiles) =>
      profiles.map((p) => {
        if (p.id !== activeProfileId) return p;
        return {
          ...p,
          items: p.items.filter((it) => it.id !== itemId),
        };
      })
    );
  };

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    const newItem: EquipmentChecklistItem = {
      id: `custom-${Date.now()}`,
      name: newItemName.trim(),
      category: newItemCategory.trim() || 'General',
      checked: true,
    };
    setEquipmentProfiles((profiles) =>
      profiles.map((p) => {
        if (p.id !== activeProfileId) return p;
        return {
          ...p,
          items: [...p.items, newItem],
        };
      })
    );
    setNewItemName('');
  };

  const handleResetChecklist = () => {
    if (confirm('Reset packed status for all items in this profile?')) {
      setEquipmentProfiles((profiles) =>
        profiles.map((p) => {
          if (p.id !== activeProfileId) return p;
          return {
            ...p,
            items: p.items.map((it) => ({ ...it, checked: false })),
          };
        })
      );
    }
  };

  const handleExportChecklistJSON = async () => {
    const dateStr = siteDateKey(Date.now(), location.timeZone);
    const filename = `chroma_nocta_equipment_checklist_${dateStr}.json`;
    await saveJsonToDevice(filename, equipmentProfiles);
  };

  const handleImportChecklistJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEquipmentProfiles(parsed);
          alert(`Successfully imported ${parsed.length} equipment profiles!`);
        } else {
          alert('Invalid checklist JSON format.');
        }
      } catch (err) {
        alert('Error reading checklist file.');
      }
    };
    reader.readAsText(file);
    if (checklistFileInputRef.current) checklistFileInputRef.current.value = '';
  };

  const checklistStats = useMemo(() => {
    const total = activeEquipmentProfile.items.length;
    const packed = activeEquipmentProfile.items.filter((it) => it.checked).length;
    const percent = total > 0 ? Math.round((packed / total) * 100) : 0;
    return { total, packed, percent };
  }, [activeEquipmentProfile]);

  // --- Observation Journal State ---
  const [journalLogs, setJournalLogs] = useState<ObservationLog[]>(() => {
    try {
      const saved = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return INITIAL_LOGS;
  });
  const [isAddingLog, setIsAddingLog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newLogDate, setNewLogDate] = useState<string>(() =>
    siteDateKey(Date.now(), location.timeZone)
  );
  const [newLogTarget, setNewLogTarget] = useState('');
  const [newLogEquipment, setNewLogEquipment] = useState('');
  const [newLogCamera, setNewLogCamera] = useState('');
  const [newLogFilter, setNewLogFilter] = useState('Unfiltered / UV-IR Cut');
  const [newLogSubSeconds, setNewLogSubSeconds] = useState<number>(180);
  const [newLogSubCount, setNewLogSubCount] = useState<number>(30);
  const [newLogRating, setNewLogRating] = useState<number>(5);
  const [newLogNotes, setNewLogNotes] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journalLogs));
    } catch (e) {
      console.warn(e);
    }
  }, [journalLogs]);

  useEffect(() => {
    try {
      localStorage.setItem(ORIGIN_STORAGE_KEY, JSON.stringify(selectedOrigin));
    } catch (e) {
      console.warn(e);
    }
  }, [selectedOrigin]);

  useEffect(() => {
    let isCancelled = false;
    async function calculate() {
      setIsRoutingLoading(true);
      const res = await calculateDrivingRoute(
        selectedOrigin.latitude,
        selectedOrigin.longitude,
        location.latitude,
        location.longitude
      );
      if (!isCancelled) {
        setRouteResult(res);
        setIsRoutingLoading(false);
      }
    }
    calculate();
    return () => {
      isCancelled = true;
    };
  }, [selectedOrigin, location.latitude, location.longitude]);

  // Use targetNightKey directly to avoid device clock leaks and sync with calendar selection
  const tonightEphemeris = useMemo(() => {
    return calculateNightEphemeris(
      targetNightKey,
      location.latitude,
      location.longitude,
      location.elevation,
      location.timeZone,
      location.horizonProfile
    );
  }, [targetNightKey, location.latitude, location.longitude, location.elevation, location.timeZone, location.horizonProfile]);

  const departureAnalysis = useMemo(() => {
    const astroDusk = tonightEphemeris.astroDusk;
    const travelMins = routeResult ? routeResult.durationMinutes : manualDriveMinutes;
    const totalLeadMinutes = travelMins + setupBufferMinutes;

    if (!astroDusk) {
      return {
        astroDusk: null,
        departureTime: null,
        arrivalTime: null,
        setupFinishTime: null,
        travelMins,
        diffMinutes: 0,
        isPassed: false,
        noDarkness: true,
      };
    }

    const departureTime = new Date(astroDusk.getTime() - totalLeadMinutes * 60000);
    const arrivalTime = new Date(departureTime.getTime() + travelMins * 60000);
    const setupFinishTime = new Date(arrivalTime.getTime() + setupBufferMinutes * 60000);
    const currentEpochMs = Date.now();
    const diffMinutes = Math.round((departureTime.getTime() - currentEpochMs) / 60000);
    return {
      astroDusk,
      departureTime,
      arrivalTime,
      setupFinishTime,
      travelMins,
      diffMinutes,
      isPassed: diffMinutes <= 0,
      noDarkness: false,
    };
  }, [tonightEphemeris, routeResult, manualDriveMinutes, setupBufferMinutes]);

  // First-visit field reconnaissance calculations
  const originElev = selectedOrigin.elevation !== undefined ? selectedOrigin.elevation : 850;
  const elevDiffM = location.elevation - originElev;
  const lapseRateDiffC = Number((-(elevDiffM / 1000) * 6.5).toFixed(1));

  const handleGPSOrigin = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported on this device.');
      return;
    }
    setIsGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gpsOrigin: OriginCity = {
          id: `gps-origin-${Date.now()}`,
          name: '📱 Device GPS',
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
          elevation: pos.coords.altitude ? Math.round(pos.coords.altitude) : undefined,
          isGps: true,
        };
        setSelectedOrigin(gpsOrigin);
        setIsGpsLoading(false);
      },
      (err) => {
        setIsGpsLoading(false);
        alert('Could not acquire GPS position: ' + err.message);
      },
      { timeout: 10000 }
    );
  };

  const handleCreateLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogTarget.trim()) return;
    const totalMins = Math.round((newLogSubSeconds * newLogSubCount) / 60);
    const log: ObservationLog = {
      id: `log-${Date.now()}`,
      date: newLogDate,
      targetName: newLogTarget.trim(),
      locationName: location.name,
      equipment: newLogEquipment.trim() || 'Primary Telescope / Lens',
      camera: newLogCamera.trim() || 'Astro Camera',
      filter: newLogFilter,
      subSeconds: newLogSubSeconds,
      subCount: newLogSubCount,
      totalIntegrationMinutes: totalMins,
      rating: newLogRating,
      notes: newLogNotes.trim(),
      createdAt: Date.now(),
    };
    setJournalLogs([log, ...journalLogs]);
    setIsAddingLog(false);
    setNewLogTarget('');
    setNewLogNotes('');
  };

  const handleDeleteLog = (id: string) => {
    if (confirm('Do you want to delete this observation journal entry?')) {
      setJournalLogs((prev) => prev.filter((l) => l.id !== id));
    }
  };

  const handleExportJSON = async () => {
    const dateStr = siteDateKey(Date.now(), location.timeZone);
    const filename = `chroma_nocta_observation_journal_${dateStr}.json`;
    await saveJsonToDevice(filename, journalLogs);
  };

  // AS3 invariant: must check typeof result !== 'string' and early return if not string
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') return;
        const parsed = JSON.parse(result);
        if (Array.isArray(parsed)) {
          setJournalLogs(parsed);
          alert(`Successfully imported ${parsed.length} observation entries!`);
        } else {
          alert('Invalid JSON format.');
        }
      } catch (err) {
        alert('Error reading file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${selectedOrigin.latitude},${selectedOrigin.longitude}&destination=${location.latitude},${location.longitude}`;
  const satelliteMapUrl = `https://www.google.com/maps/@?api=1&map_action=map&center=${location.latitude},${location.longitude}&zoom=16&basemap=satellite`;
  const fuelMarketMapUrl = `https://www.google.com/maps/search/fuel+station+market/@${location.latitude},${location.longitude},12z`;
  const lightPollutionUrl = `https://www.lightpollutionmap.info/#zoom=11&lat=${location.latitude}&lon=${location.longitude}&layers=B0FFFFFFFTFFFFFFFFFFF`;

  return (
    <div id="tabRoute" className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl border border-theme bg-black/40">
        <div>
          <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider font-mono text-theme-primary flex items-center gap-2">
            <Car className="w-4 h-4" /> Travel, Route & Setup Logistics
          </h1>
          <p className="text-[11px] text-theme-muted mt-0.5">
            OSRM Driving Engine, Logistics Dossier, Multi-Profile Checklist & Observation Journal
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold text-xs transition-all glow-primary-subtle shadow-md cursor-pointer"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>Google Maps</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </a>
          <a
            href={satelliteMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-theme bg-black/60 hover:bg-white/10 text-xs font-mono text-emerald-400 transition-all cursor-pointer"
            title="Inspect satellite terrain, clearing, and dirt roads"
          >
            <Satellite className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Satellite Recon</span>
            <span className="sm:hidden">Satellite</span>
          </a>
          <a
            href={fuelMarketMapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-theme bg-black/60 hover:bg-white/10 text-xs font-mono text-amber-400 transition-all cursor-pointer"
            title="Search for nearest gas stations, groceries, and water supply"
          >
            <Fuel className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Fuel & Supply</span>
            <span className="sm:hidden">Fuel</span>
          </a>
          <a
            href={lightPollutionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-theme bg-black/60 hover:bg-white/10 text-xs font-mono text-cyan-400 transition-all cursor-pointer"
            title="LightPollutionMap Bortle Light Pollution Map"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Light Pollution Map (Bortle)</span>
            <span className="sm:hidden">Bortle</span>
          </a>
        </div>
      </div>

      {/* Section 1: Route & Travel Points */}
      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
            <Compass className="w-4 h-4 text-theme-primary" /> Departure & Destination Points
          </span>
          <button
            onClick={handleGPSOrigin}
            disabled={isGpsLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-theme bg-white/5 hover:bg-white/10 text-[11px] font-mono text-theme-accent transition-all self-start sm:self-auto cursor-pointer"
          >
            <Navigation className="w-3 h-3" />
            <span>{isGpsLoading ? 'Locating...' : '📱 Use Device GPS'}</span>
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono text-theme-muted">
            Origin Point (City / Location):
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MAJOR_ORIGIN_CITIES.map((city) => {
              const isSelected = selectedOrigin.id === city.id;
              return (
                <button
                  key={city.id}
                  onClick={() => setSelectedOrigin(city)}
                  className={`px-3 py-1.5 text-xs font-mono rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-400/50 font-bold glow-primary-subtle'
                      : 'border-white/10 bg-black/40 text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {city.name}
                </button>
              );
            })}
            {selectedOrigin.isGps && (
              <span className="px-3 py-1.5 text-xs font-mono rounded-xl bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 font-bold">
                {selectedOrigin.name}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div
            onClick={onOpenLocationModal}
            className="p-3 rounded-xl bg-black/40 border border-white/10 hover:border-theme cursor-pointer group transition-all"
            title="Change Observation Site"
          >
            <div className="flex items-center justify-between text-[10px] text-theme-muted font-mono">
              <span>Destination Point (Click to Change):</span>
              <span className="text-[9px] text-theme-primary font-bold group-hover:underline">
                Change ↗
              </span>
            </div>
            <div className="font-bold text-white text-xs truncate mt-0.5 flex items-center gap-1 group-hover:text-theme-primary transition-colors">
              <MapPin className="w-3.5 h-3.5 text-theme-primary shrink-0 group-hover:scale-110 transition-transform" />
              <span>{location.name}</span>
            </div>
            <div className="text-[10px] text-theme-muted mt-0.5 font-mono">
              Elevation: {location.elevation}m • Bortle {location.bortleClass || 2}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] text-theme-muted font-mono">Driving Distance:</div>
            <div className="text-xl font-black font-mono text-theme-accent mt-0.5">
              {isRoutingLoading ? (
                'Calculating...'
              ) : routeResult ? (
                `${routeResult.distanceKm} km`
              ) : (
                '--'
              )}
            </div>
            <div className="text-[10px] text-theme-muted font-mono">
              {routeResult?.isEstimate ? 'Highway Estimate' : 'OSRM Live Road Network'}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/10">
            <div className="text-[10px] text-theme-muted font-mono">Estimated Driving Time:</div>
            <div className="text-xl font-black font-mono text-white mt-0.5">
              {isRoutingLoading ? (
                'Calculating...'
              ) : routeResult ? (
                `${Math.floor(routeResult.durationMinutes / 60)}h ${
                  routeResult.durationMinutes % 60
                }m`
              ) : (
                `${Math.floor(manualDriveMinutes / 60)}h ${manualDriveMinutes % 60}m (Manual)`
              )}
            </div>
            <div className="text-[10px] text-theme-muted font-mono">
              {routeResult ? 'One way' : 'Offline / manual input'}
            </div>
          </div>
        </div>

        {/* Manual Drive Time Slider when routeResult is absent/offline */}
        {!routeResult && !isRoutingLoading && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-amber-300 flex items-center gap-1.5 font-bold">
                <Car className="w-3.5 h-3.5" /> Manual / Offline Drive Time:
              </span>
              <span className="font-bold text-amber-400 text-sm">
                {Math.floor(manualDriveMinutes / 60)}h {manualDriveMinutes % 60}m ({manualDriveMinutes} min)
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={360}
              step={15}
              value={manualDriveMinutes}
              onChange={(e) => setManualDriveMinutes(parseInt(e.target.value))}
              className="w-full accent-amber-400 h-2 bg-slate-900 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[9px] font-mono text-theme-muted">
              <span>15m</span>
              <span>1h</span>
              <span>2h</span>
              <span>4h</span>
              <span>6h</span>
            </div>
          </div>
        )}

        <div className="p-3 rounded-xl border border-theme/60 bg-black/50 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-theme-muted flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-theme-primary" /> Setup & Polar Alignment Buffer:
            </span>
            <span className="font-bold text-theme-primary text-sm">
              {setupBufferMinutes} minutes
            </span>
          </div>
          <input
            type="range"
            min={15}
            max={180}
            step={15}
            value={setupBufferMinutes}
            onChange={(e) => setSetupBufferMinutes(parseInt(e.target.value))}
            className="w-full accent-[var(--theme-primary)] h-2 bg-slate-900 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-theme-muted">
            <span>15m (Quick Tripod)</span>
            <span>45m (Compact EQ)</span>
            <span className="text-theme-primary font-bold">60m (Recommended)</span>
            <span>120m</span>
            <span>180m (Full Rig)</span>
          </div>
        </div>
      </div>

      {/* Section 2: Calculated Departure Time Card */}
      <div className="p-4 sm:p-5 rounded-2xl border border-theme bg-gradient-to-r from-cyan-950/40 via-[var(--theme-card)] to-black shadow-2xl space-y-3 glow-primary">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-theme-primary/20 border border-theme flex items-center justify-center text-xl shrink-0">
              🚗
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold font-mono text-white">
                  Calculated Departure Time
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                  Target Night: {targetNightKey}
                </span>
              </div>
              <p className="text-[10px] text-theme-muted">
                Timeline to arrive before Astronomical Darkness (Sun &lt; -18°) on {targetNightKey}
              </p>
            </div>
          </div>
          <div>
            {departureAnalysis.noDarkness ? (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> No Astronomical Darkness
              </span>
            ) : departureAnalysis.isPassed ? (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> Departure Time Passed / Depart Immediately
              </span>
            ) : (
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {Math.floor(departureAnalysis.diffMinutes / 60)}h{' '}
                {departureAnalysis.diffMinutes % 60}m remaining
              </span>
            )}
          </div>
        </div>

        <div className="text-center py-2 bg-black/60 rounded-xl border border-theme/60">
          <div className="text-xs font-mono text-theme-muted uppercase tracking-wider">
            Latest Planned Departure Time
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono text-theme-primary mt-1 glow-primary-subtle">
            {formatTimeHM(departureAnalysis.departureTime, location.timeZone)}
          </div>
          <div className="text-[11px] text-slate-300 mt-1 font-mono">
            {selectedOrigin.name} → {location.name}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-amber-400 font-bold">1. Departure</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {formatTimeHM(departureAnalysis.departureTime, location.timeZone)}
            </div>
            <div className="text-[9px] text-theme-muted">Leave home</div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-sky-400 font-bold">2. Site Arrival</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {formatTimeHM(departureAnalysis.arrivalTime, location.timeZone)}
            </div>
            <div className="text-[9px] text-theme-muted">
              {departureAnalysis.travelMins}m driving
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-cyan-400 font-bold">3. Setup Complete</div>
            <div className="text-sm font-bold text-white mt-0.5">
              {formatTimeHM(departureAnalysis.setupFinishTime, location.timeZone)}
            </div>
            <div className="text-[9px] text-theme-muted">
              {setupBufferMinutes}m mount/polar
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/5 border border-theme glow-primary-subtle">
            <div className="text-[10px] text-theme-primary font-bold">4. Astro Night Start</div>
            <div className="text-sm font-bold text-theme-primary mt-0.5">
              {formatTimeHM(departureAnalysis.astroDusk, location.timeZone)}
            </div>
            <div className="text-[9px] text-theme-muted">Sun &lt; -18° imaging window!</div>
          </div>
        </div>
      </div>

      {/* Section 3: Saha Künyesi & Lojistik İstasyonu (Site Logistics Dossier) */}
      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-theme-primary" /> Site Logistics Dossier & Field Readiness
            </h2>
            <p className="text-[10px] text-theme-muted">
              Operational terrain attributes and utility availability for {location.name}
            </p>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-theme-primary/10 text-theme-primary border border-theme/40">
            Auto-saved for site
          </span>
        </div>

        {/* First-Visit Field Recon Banner */}
        <div className="p-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-cyan-300">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> First-Visit Field Recon (Auto-Calculated)
            </span>
            <span className="text-[10px] text-slate-400">Atmospheric & Topographic Physics</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-300">
            <div className="p-2 rounded-lg bg-black/40 border border-white/5">
              <span className="text-theme-muted block text-[10px]">Elevation Delta & Lapse Rate:</span>
              <span className="font-bold text-white">
                Elevation Delta: {elevDiffM >= 0 ? `+${elevDiffM}m` : `${elevDiffM}m`} vs Origin (Thermal Drop: {lapseRateDiffC > 0 ? `+${lapseRateDiffC}` : lapseRateDiffC}°C)
              </span>
            </div>
            <div className="p-2 rounded-lg bg-black/40 border border-white/5">
              <span className="text-theme-muted block text-[10px]">Topography & Darkness:</span>
              <span className="font-bold text-white">
                Topographic Horizon Dip: -{location.horizonDip.toFixed(2)}° • Bortle Class {location.bortleClass ?? 3}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={satelliteMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold text-xs transition-all cursor-pointer"
            >
              <Satellite className="w-3.5 h-3.5" />
              <span>Satellite Terrain Clearing View</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
            </a>
            <a
              href={fuelMarketMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-theme bg-black/60 hover:bg-white/10 text-xs font-mono text-amber-300 transition-all cursor-pointer"
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>Nearby Fuel Station & Market</span>
              <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
          {/* Road Condition Selector */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] uppercase text-theme-muted tracking-wider block">
              Road & Approach Condition
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {ROAD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateLogistics((prev) => ({ ...prev, roadCondition: opt.id }))}
                  className={`p-2 rounded-lg text-left transition-all cursor-pointer border text-[11px] ${
                    logistics.roadCondition === opt.id
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-400/50 font-bold'
                      : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* GSM Coverage Level */}
          <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2">
            <span className="text-[10px] uppercase text-theme-muted tracking-wider block flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-theme-primary" /> GSM & Cellular Network Coverage
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {GSM_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => updateLogistics((prev) => ({ ...prev, gsmCoverage: opt.id }))}
                  className={`p-2 rounded-lg text-left transition-all cursor-pointer border text-[11px] ${
                    logistics.gsmCoverage === opt.id
                      ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-400/50 font-bold'
                      : 'bg-white/5 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Facility Checklist Toggles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <button
            onClick={() => updateLogistics((prev) => ({ ...prev, hasMainsPower: !prev.hasMainsPower }))}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5 ${
              logistics.hasMainsPower
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-black/40 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <BatteryCharging className="w-4 h-4" />
              <span className="text-[10px] font-bold">
                {logistics.hasMainsPower ? 'YES' : 'NO'}
              </span>
            </div>
            <div>
              <div className="font-bold text-white text-[11px]">220V Mains Grid</div>
              <div className="text-[9px] text-theme-muted">
                {logistics.hasMainsPower ? 'Power available' : 'Power station needed'}
              </div>
            </div>
          </button>

          <button
            onClick={() => updateLogistics((prev) => ({ ...prev, hasWater: !prev.hasWater }))}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5 ${
              logistics.hasWater
                ? 'bg-sky-500/10 border-sky-500/40 text-sky-300'
                : 'bg-black/40 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <Droplets className="w-4 h-4" />
              <span className="text-[10px] font-bold">{logistics.hasWater ? 'YES' : 'NO'}</span>
            </div>
            <div>
              <div className="font-bold text-white text-[11px]">Water Source</div>
              <div className="text-[9px] text-theme-muted">
                {logistics.hasWater ? 'Tap / spring on site' : 'Carry drinking water'}
              </div>
            </div>
          </button>

          <button
            onClick={() => updateLogistics((prev) => ({ ...prev, hasRestroom: !prev.hasRestroom }))}
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5 ${
              logistics.hasRestroom
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-black/40 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px] font-bold">{logistics.hasRestroom ? 'YES' : 'NO'}</span>
            </div>
            <div>
              <div className="font-bold text-white text-[11px]">Restroom / WC</div>
              <div className="text-[9px] text-theme-muted">
                {logistics.hasRestroom ? 'Facility available' : 'Wilderness / None'}
              </div>
            </div>
          </button>

          <button
            onClick={() =>
              updateLogistics((prev) => ({
                ...prev,
                hasFlatCampArea: !prev.hasFlatCampArea,
                hasFlatCamping: !prev.hasFlatCampArea,
              }))
            }
            className={`p-3 rounded-xl border transition-all text-left cursor-pointer flex flex-col justify-between gap-1.5 ${
              logistics.hasFlatCampArea
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : 'bg-black/40 border-white/10 text-slate-400'
            }`}
          >
            <div className="flex items-center justify-between">
              <Tent className="w-4 h-4" />
              <span className="text-[10px] font-bold">
                {logistics.hasFlatCampArea ? 'YES' : 'NO'}
              </span>
            </div>
            <div>
              <div className="font-bold text-white text-[11px]">Flat Camping Pitch</div>
              <div className="text-[9px] text-theme-muted">
                {logistics.hasFlatCampArea ? 'Smooth ground for tent' : 'Steep / rocky terrain'}
              </div>
            </div>
          </button>
        </div>

        {/* Field & Road Notes Textarea */}
        <div className="space-y-1.5 pt-2 border-t border-white/10">
          <label className="text-[10px] font-mono text-theme-muted uppercase tracking-wider block">
            Field, Road & Access Notes:
          </label>
          <textarea
            rows={3}
            value={logistics.notes || ''}
            onChange={(e) => updateLogistics((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Enter approach notes, last gas station/market, gate lock codes, shepherd dogs, or ground condition..."
            className="w-full p-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
          />
        </div>
      </div>

      {/* Section 4: Çoklu Profilli Ekipman Kontrol Listesi (Multi-Profile Equipment Checklist) */}
      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-theme-primary" /> Multi-Profile Equipment Checklist
            </h2>
            <p className="text-[10px] text-theme-muted">
              Pre-departure verification across astrophotography and expedition configurations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-cyan-300">
              {checklistStats.packed} / {checklistStats.total} Packed ({checklistStats.percent}%)
            </span>
            <button
              onClick={handleExportChecklistJSON}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition-all cursor-pointer"
              title="Export Checklist to Device as JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export List</span>
            </button>
            <button
              onClick={() => checklistFileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition-all cursor-pointer"
              title="Import Checklist from JSON"
            >
              <Upload className="w-3.5 h-3.5 text-theme-accent" />
              <span className="hidden sm:inline">Import List</span>
            </button>
            <input
              type="file"
              ref={checklistFileInputRef}
              onChange={handleImportChecklistJSON}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={handleResetChecklist}
              className="p-1.5 text-xs font-mono text-theme-muted hover:text-white rounded-lg bg-white/5 border border-white/10 cursor-pointer"
              title="Reset Packed Status"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Profile Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
          {equipmentProfiles.map((prof) => (
            <button
              key={prof.id}
              onClick={() => setActiveProfileId(prof.id)}
              className={`px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap cursor-pointer ${
                activeProfileId === prof.id
                  ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border-cyan-400/50 font-bold shadow-md glow-primary-subtle'
                  : 'bg-black/40 text-slate-300 border-white/10 hover:bg-white/5'
              }`}
            >
              {prof.name}
            </button>
          ))}
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="w-full h-2 rounded-full bg-black/60 border border-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
              style={{ width: `${checklistStats.percent}%` }}
            />
          </div>
        </div>

        {/* Checklist Item Grid with Delete Button */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono max-h-80 overflow-y-auto pr-1">
          {activeEquipmentProfile.items.map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 select-none ${
                item.checked
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-white'
                  : 'bg-black/40 border-white/5 text-slate-400 hover:bg-white/5'
              }`}
            >
              <div
                onClick={() => toggleChecklistItem(item.id)}
                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
              >
                {item.checked ? (
                  <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600 shrink-0" />
                )}
                <span className={`truncate text-xs ${item.checked ? 'line-through opacity-80' : 'font-medium'}`}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-theme-muted border border-white/5">
                  {item.category}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChecklistItem(item.id);
                  }}
                  className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                  title="Remove item"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add custom item form */}
        <form onSubmit={handleAddChecklistItem} className="flex gap-2 pt-1 text-xs font-mono">
          <input
            type="text"
            placeholder="Add custom gear item..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 transition-all"
          />
          <input
            type="text"
            placeholder="Category"
            value={newItemCategory}
            onChange={(e) => setNewItemCategory(e.target.value)}
            className="w-24 px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 transition-all"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold transition-all cursor-pointer shrink-0"
          >
            Add
          </button>
        </form>
      </div>

      {/* Section 5: Observation Journal */}
      <div className="rounded-2xl border border-theme bg-[var(--theme-card)] p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider font-mono text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-theme-primary" /> Observation Journal
            </h2>
            <p className="text-[10px] text-theme-muted">
              Archive imaging sessions, targets, optical gear, and exposure telemetry
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingLog(!isAddingLog)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold text-xs transition-all glow-primary-subtle cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Entry</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition-all cursor-pointer"
              title="Export to Device as JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Export to Device</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-mono text-slate-300 transition-all cursor-pointer"
              title="Import from JSON"
            >
              <Upload className="w-3.5 h-3.5 text-theme-accent" />
              <span className="hidden sm:inline">Import</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportJSON}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>

        {isAddingLog && (
          <form
            onSubmit={handleCreateLog}
            className="p-3.5 rounded-xl border border-theme bg-black/60 space-y-3 glow-primary-subtle"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="text-xs font-bold text-cyan-300 font-mono flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> New Observation & Imaging Entry
              </span>
              <button
                type="button"
                onClick={() => setIsAddingLog(false)}
                className="text-xs text-theme-muted hover:text-white cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
              <div>
                <label className="text-[10px] text-theme-muted">Date:</label>
                <input
                  type="date"
                  value={newLogDate}
                  onChange={(e) => setNewLogDate(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-cyan-400/50"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Target Name:</label>
                <input
                  type="text"
                  placeholder="e.g. M31 Andromeda Galaxy"
                  value={newLogTarget}
                  onChange={(e) => setNewLogTarget(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                  required
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Telescope / Optics:</label>
                <input
                  type="text"
                  placeholder="e.g. Askar 200mm f/4"
                  value={newLogEquipment}
                  onChange={(e) => setNewLogEquipment(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Camera & Cooling:</label>
                <input
                  type="text"
                  placeholder="e.g. ASI533MC Pro (-10°C)"
                  value={newLogCamera}
                  onChange={(e) => setNewLogCamera(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Filter:</label>
                <input
                  type="text"
                  placeholder="e.g. Optolong L-eXtreme"
                  value={newLogFilter}
                  onChange={(e) => setNewLogFilter(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Sub Exposure (sec):</label>
                <input
                  type="number"
                  min={1}
                  value={newLogSubSeconds}
                  onChange={(e) => setNewLogSubSeconds(parseInt(e.target.value) || 1)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Sub Count (frames):</label>
                <input
                  type="number"
                  min={1}
                  value={newLogSubCount}
                  onChange={(e) => setNewLogSubCount(parseInt(e.target.value) || 1)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-cyan-400/50"
                />
              </div>
              <div>
                <label className="text-[10px] text-theme-muted">Quality Rating (1–5):</label>
                <select
                  value={newLogRating}
                  onChange={(e) => setNewLogRating(parseInt(e.target.value))}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white focus:outline-none focus:border-cyan-400/50"
                >
                  <option value={5}>⭐⭐⭐⭐⭐ (Flawless)</option>
                  <option value={4}>⭐⭐⭐⭐ (Great)</option>
                  <option value={3}>⭐⭐⭐ (Acceptable)</option>
                  <option value={2}>⭐⭐ (Poor Transparency)</option>
                  <option value={1}>⭐ (Ruined by Clouds)</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="text-[10px] text-theme-muted">Session Notes & Seeing:</label>
                <textarea
                  rows={2}
                  placeholder="Seeing conditions, wind, dew notes, polar alignment drift..."
                  value={newLogNotes}
                  onChange={(e) => setNewLogNotes(e.target.value)}
                  className="w-full mt-1 p-2 rounded-xl bg-black/40 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 text-xs"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 font-bold text-xs transition-all glow-primary-subtle cursor-pointer"
              >
                Save & Add to Journal
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {journalLogs.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-theme-muted">
              No observation journal entries recorded yet.
            </div>
          ) : (
            journalLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl border border-white/5 bg-black/40 hover:bg-white/5 transition-all space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">
                      {log.targetName}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 font-bold">
                      {log.totalIntegrationMinutes} min Total
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex text-amber-400">
                      {[...Array(log.rating)].map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-amber-400" />
                      ))}
                    </div>
                    <span className="text-[10px] text-theme-muted font-mono">{log.date}</span>
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                      title="Delete Entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-300">
                  <div className="truncate">
                    <span className="text-theme-muted">Site: </span>
                    {log.locationName.split(' ')[0]}
                  </div>
                  <div className="truncate">
                    <span className="text-theme-muted">Optics: </span>
                    {log.equipment}
                  </div>
                  <div className="truncate">
                    <span className="text-theme-muted">Exposure: </span>
                    {log.subCount} × {log.subSeconds}s
                  </div>
                  <div className="truncate">
                    <span className="text-theme-muted">Filter: </span>
                    {log.filter}
                  </div>
                </div>
                {log.notes && (
                  <p className="text-[11px] text-theme-muted font-mono italic bg-black/40 p-2 rounded-lg border border-white/5">
                    &quot;{log.notes}&quot;
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
