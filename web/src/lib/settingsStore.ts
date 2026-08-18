export type ThemeMode = 'dark' | 'light' | 'system';
export type WallpaperPreset = 'doodle' | 'dark' | 'emerald' | 'beige' | 'midnight' | 'custom';
export type FontSize = 'small' | 'medium' | 'large';
export type PrivacyVisibility = 'everyone' | 'contacts' | 'nobody';

export interface AppSettings {
  theme: ThemeMode;
  wallpaper: WallpaperPreset;
  customWallpaperColor?: string;
  fontSize: FontSize;
  readReceipts: boolean;
  lastSeenVisibility: PrivacyVisibility;
  profilePhotoVisibility: PrivacyVisibility;
  soundEnabled: boolean;
  notificationsPreview: boolean;
  appLockEnabled: boolean;
  appLockPin: string;
  autoLockDuration: number; // in seconds (0 = immediate, 60 = 1m, 900 = 15m, 3600 = 1h)
  pinnedChats: string[];
  mutedChats: string[];
  archivedChats: string[];
  blockedUsers: string[];
  avatarUrl: string;
  aboutText: string;
}

const SETTINGS_STORAGE_KEY = 'anivi_whatsapp_settings';
const LOCK_STATE_KEY = 'anivi_app_locked';
const LAST_ACTIVE_KEY = 'anivi_last_active';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  wallpaper: 'doodle',
  customWallpaperColor: '#0b141a',
  fontSize: 'medium',
  readReceipts: true,
  lastSeenVisibility: 'everyone',
  profilePhotoVisibility: 'everyone',
  soundEnabled: true,
  notificationsPreview: true,
  appLockEnabled: false,
  appLockPin: '',
  autoLockDuration: 60,
  pinnedChats: [],
  mutedChats: [],
  archivedChats: [],
  blockedUsers: [],
  avatarUrl: '',
  aboutText: 'Hey there! I am using Anivi.',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const next = { ...current, ...settings };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota exceeded or private mode
  }
  return next;
}

export function isAppLocked(): boolean {
  const settings = loadSettings();
  if (!settings.appLockEnabled || !settings.appLockPin) {
    return false;
  }
  const lockedFlag = sessionStorage.getItem(LOCK_STATE_KEY);
  if (lockedFlag === 'true') return true;

  // Check auto lock timeout
  const lastActive = parseInt(sessionStorage.getItem(LAST_ACTIVE_KEY) || '0', 10);
  if (!lastActive) {
    // Brand new session with PIN enabled -> lock
    return true;
  }
  const now = Date.now();
  const elapsedSeconds = (now - lastActive) / 1000;
  if (elapsedSeconds >= settings.autoLockDuration) {
    setAppLocked(true);
    return true;
  }
  return false;
}

export function setAppLocked(locked: boolean): void {
  try {
    sessionStorage.setItem(LOCK_STATE_KEY, locked ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function recordAppActivity(): void {
  try {
    sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  } catch {
    // ignore
  }
}

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  let isDark = false;
  if (theme === 'dark') {
    isDark = true;
  } else if (theme === 'light') {
    isDark = false;
  } else {
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

export function applyFontSize(size: FontSize): void {
  const root = document.documentElement;
  root.classList.remove('font-size-small', 'font-size-medium', 'font-size-large');
  root.classList.add(`font-size-${size}`);
}
