# Chroma Nocta v1.3-PRO

> **Mobile-first scientific astrophotography field station and ephemeris engine.**

Chroma Nocta is a production-grade, offline-capable Progressive Web Application (PWA) designed for field astrophotographers and astronomical observatories. It delivers high-precision deterministic ephemeris computations, 3-tier atmospheric telemetry, mount stability modeling, and multi-night framing assistance without relying on device clocks.

---

## 🏛️ Core Engineering Pillars

1. **Zero Device Clock Invariant (`BASELINE_CLOCK_VIOLATIONS = 0`)**
   - The entire application is decoupled from the operating system's hardware clock.
   - All temporal computations, diurnal cycles, and ephemeris timelines are calculated strictly using UTC epoch timestamps and site IANA timezones via `siteTime.ts` (`siteParts`, `siteHour`, `zonedTimeToInstant`).
   - Static analysis gate (`scripts/no-device-clock-check.ts`) guarantees zero device clock calls (`new Date().getHours()`, `getDate()`, `getFullYear()`, etc.) across all components and libraries.

2. **Deterministic & Memoized Ephemeris Engine**
   - Uses high-precision bisection algorithms to locate celestial events with sub-5-second root convergence.
   - Multi-site dark window intersections (`[astroDusk, astroDawn]`) calculated with epoch precision.

3. **Field Weather & Mount Stability Telemetry**
   - 72-hour hourly forecasts with multi-tier cloud coverage (High / Mid / Low altitude layers).
   - Relative humidity, dew point depression ($\Delta T$), and condensation risk modeling.
   - Wind speed and peak gust velocity analysis mapped directly to telescope mount stability thresholds (<10 km/h: Ideal, 10–25 km/h: Acceptable, >25 km/h: Vibration Risk).

4. **Multi-Night Astrophotography Suite**
   - **Sky Viewfinder & Planetarium**: 2D planetarium with 360° Dome, 120° Panorama, and Target View projections, RA/Dec equatorial grids, and 30 popular deep-sky targets.
   - **Meridian Flip Counter**: Real-time Hour Angle (HA) calculation and time-to-transit prediction to prevent tripod/pier collisions.
   - **Module H (Framing Matcher)**: Ghost Overlay, Blink comparator (450ms cycle), and Swipe Split tools for exact composition alignment across multiple imaging nights.
   - **Polar Scope Alignment Assistant**: Micrometric reticle engine supporting both NCP (Polaris) and SCP ($\sigma$ Octantis / Octans trapezium) with inverted optical scope and true-sky modes.
   - **Observation Journal**: Localized, persistent session telemetry logging with JSON import and export bridges.

---

## 📂 Project Structure

```
src/
├── components/
│   ├── tabs/
│   │   ├── NightCalendarTab.tsx   # Diurnal ephemeris, moon phase & dark window calendar
│   │   ├── FieldWeatherTab.tsx    # 2x2 telemetry cards & 72-hour interactive canvases
│   │   ├── RouteTab.tsx           # OSRM route engine, departure scheduler & journal
│   │   └── SkyVizorTab.tsx        # 2D sky planetarium, meridian flip & Module H framing
│   ├── Header.tsx                 # Site beacon, station status & quick settings
│   ├── BottomNav.tsx              # Mobile navigation bar
│   ├── LocationModal.tsx          # Smart coordinate parser (DMS, decimal, Maps URL)
│   ├── HorizonMaskModal.tsx       # 8-direction topographic obstacle profiler
│   ├── PolarScopeModal.tsx        # NCP & SCP optical reticle engine & compass offset
│   └── SettingsModal.tsx          # Dark-adapted scientific themes (Red, Amber, Cyan, OLED)
├── lib/
│   ├── ephemeris.ts               # Sun, Moon, twilight & lunar phase algorithms
│   ├── siteTime.ts                # Deterministic site timezone engine
│   ├── nightWindow.ts             # Multi-site dark window intersection math
│   ├── weatherService.ts          # Meteorological aggregation & mount stability KPIs
│   ├── routeService.ts            # OSRM driving matrix and route calculations
│   ├── coordinateParser.ts        # Robust coordinate and topographic parser
│   ├── deviceStorage.ts           # FileSystem bridge for Android and PWA storage
│   └── navigationBridge.ts        # Cross-platform map link bridge (Apple Maps, geo:, web)
├── docs/
│   └── projectState.ts            # Audit ledger, milestone tracking & markdown generator
└── types.ts                       # Shared TypeScript definitions and data interfaces
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Development Server
```bash
npm run dev
```

### Build & Production Bundle
```bash
npm run build
```

### Android Native Synchronization (Capacitor)
```bash
npx cap sync android
```

---

## 🧪 Verification & Audit Suites

Chroma Nocta adheres to strict continuous verification standards. Every release must pass 100% of all audit checks:

```bash
# 1. TypeScript compilation & 64-case golden regression test
npm run check

# 2. Static analysis enforcement for zero device clock violations
npx tsx scripts/no-device-clock-check.ts

# 3. Complete 7-suite invariant audit (Ephemeris, NOAA, Moon Bisection, etc.)
npm run audit
```

### Test Coverage Highlights:
- **64 Golden Regression Cases (`selfCheck.ts`)**: Validated against independent NOAA reference points.
- **Root Accuracy**: Moonrise and moonset roots bounded to $< 0.05^\circ$ with $< 5\text{s}$ interval narrowing.
- **Atmospheric Isolation**: Twilight thresholds ($-18^\circ$ Astronomical Dusk/Dawn) strictly isolated from topographic dip variations.
- **Zero Clock Violations**: Strict `0` device clock calls across the entire codebase.

---

## 📄 License
MIT License. Built for precision astrophotography and scientific night planning.
