import { useState, useCallback, useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockApiLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function isWakeLockApiLike(value: unknown): value is WakeLockApiLike {
  if (typeof value !== 'object' || value === null) return false;
  if (!('request' in value)) return false;
  return typeof value.request === 'function';
}

function getNavigatorWakeLock(): WakeLockApiLike | null {
  if (typeof navigator === 'undefined') return null;
  const navUnknown: unknown = navigator;
  if (typeof navUnknown !== 'object' || navUnknown === null) return null;
  if (!('wakeLock' in navUnknown)) return null;
  const candidate: unknown = navUnknown.wakeLock;
  return isWakeLockApiLike(candidate) ? candidate : null;
}

export function useWakeLock() {
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [sentinel, setSentinel] = useState<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (getNavigatorWakeLock() !== null) {
      setIsSupported(true);
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    const api = getNavigatorWakeLock();
    if (api === null) {
      setIsActive(false);
      return;
    }
    try {
      const lock = await api.request('screen');
      setSentinel(lock);
      setIsActive(true);
      lock.addEventListener('release', () => {
        setIsActive(false);
        setSentinel(null);
      });
    } catch {
      setIsActive(false);
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      if (sentinel !== null) {
        await sentinel.release();
        setSentinel(null);
        setIsActive(false);
      }
    } catch {
      setIsActive(false);
    }
  }, [sentinel]);

  const toggleWakeLock = useCallback(async () => {
    if (isActive) {
      await releaseWakeLock();
    } else {
      await requestWakeLock();
    }
  }, [isActive, releaseWakeLock, requestWakeLock]);

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock,
    toggleWakeLock,
  };
}
