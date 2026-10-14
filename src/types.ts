export type ActiveTab = 'calendar' | 'weather' | 'fieldWeather' | 'route' | 'targets' | 'sky';

export type UnitSystem = 'metric' | 'imperial';

export type ThemeId =
  | 'o3-turquoise'
  | 'h-alpha'
  | 'oxygen-airglow'
  | 'oled-black'
  | 'prussian-blue'
  | 'cosmic-violet'
  | 'zodiacal-amber'
  | 'stellar-silver'
  | string;

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  wavelength: string;
  bg: string;
  card: string;
  primary: string;
  accent: string;
  description: string;
}

export interface LocationData {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  horizonDip: number;
  bortleClass?: number;
  timeZone?: string | null;
  timeZoneSource?: 'preset' | 'gps' | 'manual' | 'detected' | string;
  horizonProfile?: number[];
  favorite?: boolean;
  isCustom?: boolean;
  elevationKnown?: boolean;
}

export interface ResolvedSite extends LocationData {
  timeZone: string;
}

export interface DeepSkyTarget {
  id: string;
  name: string;
  catalog: string;
  type: string;
  ra: number;
  dec: number;
  magnitude: number;
  sizeArcmin: number;
  constellation: string;
  description: string;
}

export interface TimelineSegment {
  time: Date;
  hourFraction: number;
  sunAltitude: number;
  moonAltitude: number;
  isSunDown: boolean;
  twilightState: 'day' | 'civil' | 'nautical' | 'astro' | 'dark';
  isMoonUp: boolean;
  isZifiriDark: boolean;
}

export interface SolarEphemerisDay {
  date: Date;
  dateKey: string;
  dayLabel: string;
  sunset: Date | null;
  civilDusk: Date | null;
  nauticalDusk: Date | null;
  astroDusk: Date | null;
  astroDawn: Date | null;
  nauticalDawn: Date | null;
  civilDawn: Date | null;
  sunrise: Date | null;
  darkDurationMinutes: number;
  moonlessDarkMinutes: number;
  efficiencyPercent: number;
  moonrise: Date | null;
  moonset: Date | null;
  moonPhase: number;
  moonPhaseName: string;
  moonIllumination: number;
  timeline: TimelineSegment[];
  hasZifiriWindow: boolean;
  bestWindowStart?: Date | null;
  bestWindowEnd?: Date | null;
  sunriseAzimuthDeg?: number;
  sunriseCardinal?: string;
  sunsetAzimuthDeg?: number;
  sunsetCardinal?: string;
  moonriseAzimuthDeg?: number;
  moonriseCardinal?: string;
  moonsetAzimuthDeg?: number;
  moonsetCardinal?: string;
  hasActiveTerrainMask?: boolean;
}

export interface EphemerisKPIs {
  totalDarkHours: number;
  dailyAverageHours: number;
  bestNightLabel: string;
  bestNightHours: number;
  efficiencyPercent: number;
}

export type MissingField =
  | 'temp'
  | 'dewPoint'
  | 'humidity'
  | 'cloud'
  | 'wind'
  | 'precipitation'
  | 'cloudCover';

export interface HourlyWeatherPoint {
  time: Date;
  temp: number;
  dewPoint: number;
  dewGap: number;
  humidity: number;
  cloudCover: number | null;
  cloudCoverLow?: number | null;
  cloudCoverMid?: number | null;
  cloudCoverHigh?: number | null;
  windSpeed: number;
  windDirectionDeg: number;
  windDirectionCompass: string;
  isAstroDark: boolean;
  isDangerDew: boolean;
  sunAltitude: number;
  precipitationProb?: number;
  precipitationAmount?: number;
  windGust?: number;
  missing?: MissingField[];
}

export interface WeatherKPIs {
  dewRiskLevel: 'safe' | 'medium' | 'high';
  minDewGap: number;
  avgNightCloud: number;
  cloudCategory: 'low' | 'mid' | 'high';
  tempMin: number;
  tempMax: number;
  humidityMin: number;
  humidityMax: number;
  windAvg: number;
  windMax: number;
  windStatus: 'Ideal (<10 km/h)' | 'Acceptable (10-25 km/h)' | 'Vibration Risk (>25 km/h)';
}

export interface OriginCity {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  isGps?: boolean;
}

export type RoadConditionType = 'asphalt' | 'stabilized' | 'offroad-4x4' | 'winter-risk';
export type GsmCoverageLevel = 'full' | 'weak' | 'none' | 'unknown';

export interface SiteLogisticsProfile {
  siteId: string;
  roadCondition: RoadConditionType;
  hasMainsPower: boolean;
  hasWater: boolean;
  hasRestroom: boolean;
  hasFlatCampArea: boolean;
  hasFlatCamping?: boolean;
  hasFlatCampground?: boolean;
  gsmCoverage: GsmCoverageLevel;
  notes?: string;
  winterTireRequired?: boolean;
}

export interface EquipmentChecklistItem {
  id: string;
  name: string;
  category: string;
  checked: boolean;
}

export type EquipmentItem = EquipmentChecklistItem;

export interface EquipmentProfile {
  id: string;
  name: string;
  description?: string;
  items: EquipmentChecklistItem[];
}

export interface ObservationLog {
  id: string;
  date: string;
  targetName: string;
  locationName: string;
  equipment: string;
  camera: string;
  filter: string;
  subSeconds: number;
  subCount: number;
  totalIntegrationMinutes: number;
  rating: number;
  notes: string;
  createdAt: number;
}
