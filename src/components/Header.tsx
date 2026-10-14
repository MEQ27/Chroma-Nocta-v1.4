import React, { useState, useEffect } from 'react';
import { Sparkles, Navigation, Settings } from 'lucide-react';
import { LocationData } from '../types';

interface HeaderProps {
  location: LocationData;
  onOpenLocationModal: () => void;
  onOpenSettingsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  location,
  onOpenLocationModal,
  onOpenSettingsModal,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md border-b border-theme bg-[var(--theme-card)]/90 px-3 py-2.5 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-theme shadow-sm glow-primary-subtle bg-[var(--theme-primary)]/15">
            <Sparkles className="w-4 h-4 text-theme-primary animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`font-extrabold tracking-wider text-base md:text-lg uppercase font-mono transition-colors ${
                  isOnline
                    ? 'text-theme-primary'
                    : 'text-slate-400 drop-shadow-none'
                }`}
              >
                CHROMA NOCTA
              </span>
              <span
                className={`hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider transition-colors ${
                  isOnline
                    ? 'border border-theme text-theme-muted'
                    : 'text-amber-300 border border-amber-500/40 bg-amber-950/40'
                }`}
              >
                {isOnline ? 'V1.4 OPS' : 'OFFLINE'}
              </span>
            </div>
            <p className="text-[10px] text-theme-muted truncate hidden xs:block">
              Astrophotography Field Station & Ephemeris
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Location Icon Button */}
          <button
            onClick={onOpenLocationModal}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-cyan-500/40 text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.7)] hover:bg-white/15 active:scale-95 transition-all cursor-pointer relative group"
            title={`📍 Observation Site: ${location.name} (Click to change)`}
            aria-label="Observation Site Selection"
          >
            <Navigation className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] group-hover:scale-110 transition-transform" />
          </button>

          {/* Settings Icon Button */}
          <button
            onClick={onOpenSettingsModal}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 active:scale-95 text-theme-primary transition-all cursor-pointer"
            title="Station Settings & Themes"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4 text-theme-primary hover:rotate-45 transition-transform" />
          </button>
        </div>
      </div>
    </header>
  );
};
