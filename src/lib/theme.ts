import { ThemeConfig, ThemeId } from '../types';

export const THEMES: ThemeConfig[] = [
  {
    id: 'o3-turquoise',
    name: 'O-III Turkuaz',
    wavelength: '500.7 nm',
    bg: '#020617',
    card: '#070f26',
    primary: '#06b6d4',
    accent: '#38bdf8',
    description: 'Çift iyonize oksijen emisyon hattı, gezegenimsi bulutsu & şok dalgaları',
  },
  {
    id: 'h-alpha',
    name: 'H-Alpha Crimson',
    wavelength: '656.3 nm',
    bg: '#090204',
    card: '#17060b',
    primary: '#f43f5e',
    accent: '#fb7185',
    description: 'İyonize hidrojen Balmer hattı, parlak yıldız oluşum nebulaları',
  },
  {
    id: 'oxygen-airglow',
    name: 'Oxygen Airglow',
    wavelength: '557.7 nm',
    bg: '#010a05',
    card: '#05180d',
    primary: '#10b981',
    accent: '#34d399',
    description: 'Üst atmosfer yeşil gece ışıması, karanlık auroral izleri',
  },
  {
    id: 'oled-black',
    name: 'OLED Siyah',
    wavelength: 'Saf Siyah',
    bg: '#000000',
    card: '#050505',
    primary: '#ffffff',
    accent: '#a1a1aa',
    description: 'Maksimum kontrast, piksel düzeyinde enerji tasarrufu ve derin uzay siyahı',
  },
  {
    id: 'prussian-blue',
    name: 'Gece Mavisi',
    wavelength: 'Prusya & Gök Mavisi',
    bg: '#020b18',
    card: '#06152d',
    primary: '#38bdf8',
    accent: '#7dd3fc',
    description: 'Prusya mavisi gök ve derin gece ufku kontrastı',
  },
  {
    id: 'cosmic-violet',
    name: 'Kozmik Mor',
    wavelength: 'Derin Mor',
    bg: '#090314',
    card: '#15072b',
    primary: '#a855f7',
    accent: '#c084fc',
    description: 'Kozmik toz ve ultraviyole uyarılı mor nebulalar',
  },
  {
    id: 'zodiacal-amber',
    name: 'Zodiacal Amber',
    wavelength: 'Kehribar',
    bg: '#0a0601',
    card: '#191004',
    primary: '#f59e0b',
    accent: '#fbbf24',
    description: 'Gezegenler arası toz bulutu saçılması ve sıcak düşük mavi ışık filtresi',
  },
  {
    id: 'stellar-silver',
    name: 'Stellar Silver',
    wavelength: 'Platin Gümüş',
    bg: '#06080a',
    card: '#0e1116',
    primary: '#e2e8f0',
    accent: '#94a3b8',
    description: 'Titanyum & platin gövde, monokrom CCD kontrastı',
  },
];

const THEME_STORAGE_KEY = 'chroma_nocta_theme_id';

export function getStoredTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    const match = THEMES.find((t) => t.id === saved);
    if (match) return match.id;
  } catch (e) {
    console.warn('Could not read theme from storage', e);
  }
  return 'h-alpha';
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
    document.documentElement.setAttribute('data-theme', id);
  } catch (e) {
    console.warn('Could not save theme to storage', e);
  }
}
