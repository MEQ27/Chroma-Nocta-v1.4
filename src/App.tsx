import React, { useState, useEffect } from 'react';
import { ActiveTab, LocationData, ResolvedSite, ThemeId } from './types';
import { getStoredTheme, saveTheme } from './lib/theme';
import { getStoredLocation, saveStoredLocation } from './lib/coordinateParser';
import { resolveSite, initialNightKeyForSite } from './lib/siteTime';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LocationModal } from './components/LocationModal';
import { SettingsModal } from './components/SettingsModal';
import { NeedsTimeZone } from './components/NeedsTimeZone';
import { NightCalendarTab } from './components/tabs/NightCalendarTab';
import { FieldWeatherTab } from './components/tabs/FieldWeatherTab';
import { RouteTab } from './components/tabs/RouteTab';
import { TargetOpsTab } from './components/tabs/TargetOpsTab';
import { SkyVizorTab } from './components/tabs/SkyVizorTab';

function isLocationData(val: unknown): val is LocationData {
  if (typeof val !== 'object' || val === null) return false;
  if (!('id' in val) || typeof val.id !== 'string') return false;
  if (!('name' in val) || typeof val.name !== 'string') return false;
  if (!('latitude' in val) || typeof val.latitude !== 'number') return false;
  if (!('longitude' in val) || typeof val.longitude !== 'number') return false;
  if (!('elevation' in val) || typeof val.elevation !== 'number') return false;
  if (!('horizonDip' in val) || typeof val.horizonDip !== 'number') return false;
  return true;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeId>(() => {
    const initialTheme = getStoredTheme();
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', initialTheme);
    }
    return initialTheme;
  });
  const [location, setLocation] = useState<LocationData>(() => getStoredLocation());
  const [selectedNightKey, setSelectedNightKey] = useState<string>(() =>
    initialNightKeyForSite(location, Date.now()) || ''
  );
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const hash = window.location.hash;
    if (hash === '#tabWeather') return 'weather';
    if (hash === '#tabRoute') return 'route';
    if (hash === '#tabTargets') return 'targets';
    if (hash === '#tabSky') return 'sky';
    return 'calendar';
  });
  const [skySelectedDate, setSkySelectedDate] = useState<Date | undefined>(undefined);
  const [inspectedWeatherSite, setInspectedWeatherSite] = useState<LocationData | null>(null);

  const resolvedSite = resolveSite(location);

  useEffect(() => {
    if (resolvedSite?.timeZone) {
      setSelectedNightKey(initialNightKeyForSite(resolvedSite, Date.now()) || '');
    }
  }, [resolvedSite?.timeZone]);

  useEffect(() => {
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#tabCalendar') setActiveTab('calendar');
      else if (hash === '#tabWeather') setActiveTab('weather');
      else if (hash === '#tabRoute') setActiveTab('route');
      else if (hash === '#tabTargets') setActiveTab('targets');
      else if (hash === '#tabSky') setActiveTab('sky');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectLocation = (newLoc: LocationData) => {
    setLocation(newLoc);
    saveStoredLocation(newLoc);
  };

  useEffect(() => {
    const handleLocationChanged = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const detail: unknown = e.detail;
      if (isLocationData(detail)) {
        setLocation(detail);
      }
    };
    const handleWeatherNav = (e: Event) => {
      if (!(e instanceof CustomEvent)) return;
      const detail: unknown = e.detail;
      if (typeof detail !== 'object' || detail === null) return;

      if ('site' in detail && isLocationData(detail.site)) {
        setInspectedWeatherSite(detail.site);
      }
      if ('dateKey' in detail && typeof detail.dateKey === 'string') {
        setSelectedNightKey(detail.dateKey);
      }
      setActiveTab('weather');
      window.location.hash = '#tabWeather';
      let targetId = 'section-temperature';
      if ('targetSection' in detail && typeof detail.targetSection === 'string' && detail.targetSection.length > 0) {
        targetId = detail.targetSection;
      }
      setTimeout(() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 120);
    };

    window.addEventListener('chroma_location_changed', handleLocationChanged);
    window.addEventListener('chroma_navigate_weather_section', handleWeatherNav);
    return () => {
      window.removeEventListener('chroma_location_changed', handleLocationChanged);
      window.removeEventListener('chroma_navigate_weather_section', handleWeatherNav);
    };
  }, []);

  const handleNavigateToWeatherFromCalendar = (
    site: LocationData,
    targetSection: string = 'section-temperature',
    dateKey?: string
  ) => {
    setInspectedWeatherSite(site);
    if (dateKey) {
      setSelectedNightKey(dateKey);
    }
    setActiveTab('weather');
    window.location.hash = '#tabWeather';
    setTimeout(() => {
      document.getElementById(targetSection)?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  const handleNavigateToSkyFromCalendar = (date: Date) => {
    setSkySelectedDate(date);
    setActiveTab('sky');
    window.location.hash = '#tabSky';
  };

  return (
    <div
      className="min-h-screen flex flex-col bg-[var(--theme-bg)] text-[var(--theme-text)] transition-colors duration-200"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Header
        location={location}
        onOpenLocationModal={() => setIsLocationModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
      />
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 pt-3.5 sm:pt-5 overflow-y-auto">
        {!resolvedSite ? (
          <NeedsTimeZone
            site={location}
            onResolved={setLocation}
          />
        ) : (
          <>
            <div style={{ display: activeTab === 'calendar' ? 'block' : 'none' }}>
              <NightCalendarTab
                location={resolvedSite}
                selectedNightKey={selectedNightKey}
                onSelectNightKey={setSelectedNightKey}
                onNavigateToSky={handleNavigateToSkyFromCalendar}
                onNavigateToWeather={handleNavigateToWeatherFromCalendar}
              />
            </div>
            <div style={{ display: (activeTab === 'weather' || activeTab === 'fieldWeather') ? 'block' : 'none' }}>
              <FieldWeatherTab
                location={resolvedSite}
                originFavoriteSite={resolveSite(inspectedWeatherSite)}
                selectedNightKey={selectedNightKey}
                onSelectNightKey={setSelectedNightKey}
              />
            </div>
            <div style={{ display: activeTab === 'route' ? 'block' : 'none' }}>
              <RouteTab
                location={resolvedSite}
                selectedNightKey={selectedNightKey}
                onOpenLocationModal={() => setIsLocationModalOpen(true)}
              />
            </div>
            <div style={{ display: activeTab === 'targets' ? 'block' : 'none' }}>
              <TargetOpsTab
                location={resolvedSite}
                selectedNightKey={selectedNightKey}
              />
            </div>
            <div style={{ display: activeTab === 'sky' ? 'block' : 'none' }}>
              <SkyVizorTab location={resolvedSite} initialDate={skySelectedDate} />
            </div>
          </>
        )}
      </main>
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        activeLocation={location}
        onSelectLocation={handleSelectLocation}
      />
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentTheme={theme}
        onSelectTheme={setTheme}
      />
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'weather') {
            setInspectedWeatherSite(null);
          }
        }}
      />
    </div>
  );
}
