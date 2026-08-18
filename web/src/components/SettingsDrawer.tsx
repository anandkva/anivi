import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Moon, 
  Image, 
  Lock, 
  ShieldCheck, 
  Bell, 
  LogOut, 
  Trash2, 
  Check,
  ChevronRight,
  Eye
} from 'lucide-react';
import type { Account } from '../lib/account';
import { 
  loadSettings, 
  saveSettings, 
  applyTheme, 
  applyFontSize, 
  setAppLocked,
  type ThemeMode, 
  type WallpaperPreset, 
  type FontSize, 
  type PrivacyVisibility 
} from '../lib/settingsStore';

interface SettingsDrawerProps {
  isOpen: boolean;
  account: Account;
  onClose: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
  onClearAllChats: () => void;
}

export const SettingsDrawer: React.FC<SettingsDrawerProps> = ({
  isOpen,
  account,
  onClose,
  onOpenProfile,
  onSignOut,
  onClearAllChats,
}) => {
  const [settings, setSettings] = useState(() => loadSettings());
  const [subView, setSubView] = useState<'main' | 'theme' | 'wallpaper' | 'privacy' | 'security' | 'notifications'>('main');
  const [newPin, setNewPin] = useState('');
  const [pinSavedSuccess, setPinSavedSuccess] = useState(false);

  const updateSetting = (partial: Parameters<typeof saveSettings>[0]) => {
    const updated = saveSettings(partial);
    setSettings(updated);
    if (partial.theme) applyTheme(partial.theme);
    if (partial.fontSize) applyFontSize(partial.fontSize);
  };

  const handleSavePin = () => {
    if (newPin.length >= 4 && newPin.length <= 6) {
      updateSetting({ appLockPin: newPin, appLockEnabled: true });
      setPinSavedSuccess(true);
      setTimeout(() => setPinSavedSuccess(false), 2000);
      setNewPin('');
    }
  };

  const renderMainSettings = () => (
    <div>
      {/* Profile Tile */}
      <div
        onClick={onOpenProfile}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '16px 20px',
          backgroundColor: 'var(--bg-panel)',
          cursor: 'pointer',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: '10px'
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-panel)')}
      >
        <img
          src={settings.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${account.name}`}
          alt={account.name}
          style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover' }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)' }}>{account.name}</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {settings.aboutText || 'Available'}
          </div>
        </div>
        <ChevronRight size={18} color="var(--text-secondary)" />
      </div>

      {/* Settings Navigation List */}
      <div style={{ backgroundColor: 'var(--bg-panel)', marginBottom: '10px' }}>
        {/* Theme */}
        <div
          onClick={() => setSubView('theme')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Moon size={20} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Theme</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {settings.theme} mode
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>

        {/* Chat Wallpaper */}
        <div
          onClick={() => setSubView('wallpaper')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Image size={20} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Chat Wallpaper</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {settings.wallpaper}
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>

        {/* Privacy */}
        <div
          onClick={() => setSubView('privacy')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Eye size={20} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Privacy & Read Receipts</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Read receipts {settings.readReceipts ? 'ON' : 'OFF'}
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>

        {/* Security / Screen Lock */}
        <div
          onClick={() => setSubView('security')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <ShieldCheck size={20} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)' }}>App Lock & Security</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {settings.appLockEnabled ? 'PIN Lock Enabled' : 'Disabled'}
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>

        {/* Notifications */}
        <div
          onClick={() => setSubView('notifications')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Bell size={20} color="var(--text-secondary)" />
            <div>
              <div style={{ fontSize: '15px', color: 'var(--text-primary)' }}>Notifications & Sounds</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                {settings.soundEnabled ? 'Sounds ON' : 'Muted'}
              </div>
            </div>
          </div>
          <ChevronRight size={18} color="var(--text-secondary)" />
        </div>
      </div>

      {/* Account Actions */}
      <div style={{ backgroundColor: 'var(--bg-panel)', marginBottom: '20px' }}>
        <button
          onClick={onClearAllChats}
          style={{
            width: '100%',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: '15px',
            cursor: 'pointer',
            textAlign: 'left',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <Trash2 size={18} color="var(--text-secondary)" />
          <span>Clear All Messages</span>
        </button>

        {settings.appLockEnabled && (
          <button
            onClick={() => setAppLocked(true)}
            style={{
              width: '100%',
              padding: '14px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              border: 'none',
              background: 'transparent',
              color: 'var(--accent-green)',
              fontSize: '15px',
              cursor: 'pointer',
              textAlign: 'left',
              borderBottom: '1px solid var(--border-color)'
            }}
          >
            <Lock size={18} />
            <span>Lock App Screen Now</span>
          </button>
        )}

        <button
          onClick={onSignOut}
          style={{
            width: '100%',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            border: 'none',
            background: 'transparent',
            color: 'var(--danger-color)',
            fontSize: '15px',
            cursor: 'pointer',
            textAlign: 'left'
          }}
        >
          <LogOut size={18} />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );

  const renderThemeView = () => (
    <div style={{ padding: '20px' }}>
      <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '12px' }}>
        SELECT THEME
      </div>
      {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
        <label
          key={mode}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: settings.theme === mode ? '1.5px solid var(--accent-green)' : '1px solid var(--border-color)'
          }}
          onClick={() => updateSetting({ theme: mode })}
        >
          <span style={{ fontSize: '15px', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
            {mode === 'system' ? 'System Default' : `${mode} Mode`}
          </span>
          {settings.theme === mode && <Check size={18} color="var(--accent-green)" />}
        </label>
      ))}

      {/* Font Size Scaling */}
      <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginTop: '24px', marginBottom: '12px' }}>
        FONT SIZE
      </div>
      {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
        <label
          key={size}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: settings.fontSize === size ? '1.5px solid var(--accent-green)' : '1px solid var(--border-color)'
          }}
          onClick={() => updateSetting({ fontSize: size })}
        >
          <span style={{ fontSize: '15px', textTransform: 'capitalize', color: 'var(--text-primary)' }}>
            {size}
          </span>
          {settings.fontSize === size && <Check size={18} color="var(--accent-green)" />}
        </label>
      ))}
    </div>
  );

  const renderWallpaperView = () => (
    <div style={{ padding: '20px' }}>
      <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '12px' }}>
        CHAT WALLPAPER PRESETS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
        {[
          { id: 'doodle', name: 'WhatsApp Doodle', bg: '#0b141a' },
          { id: 'dark', name: 'Solid Dark', bg: '#111b21' },
          { id: 'emerald', name: 'Emerald', bg: '#0d2822' },
          { id: 'beige', name: 'Warm Beige', bg: '#27221d' },
          { id: 'midnight', name: 'Midnight', bg: '#090e17' },
        ].map((item) => (
          <div
            key={item.id}
            onClick={() => updateSetting({ wallpaper: item.id as WallpaperPreset })}
            style={{
              height: '110px',
              borderRadius: '8px',
              backgroundColor: item.bg,
              border: settings.wallpaper === item.id ? '2.5px solid var(--accent-green)' : '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              padding: '10px',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)'
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderPrivacyView = () => (
    <div style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid var(--border-color)'
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Read Receipts</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '240px' }}>
            If turned off, you won't send or receive blue tick read receipts.
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.readReceipts}
          onChange={(e) => updateSetting({ readReceipts: e.target.checked })}
          style={{ width: '20px', height: '20px', accentColor: 'var(--accent-green)', cursor: 'pointer' }}
        />
      </div>

      <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '10px' }}>
        LAST SEEN VISIBILITY
      </div>
      {(['everyone', 'contacts', 'nobody'] as PrivacyVisibility[]).map((v) => (
        <label
          key={v}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
            marginBottom: '8px',
            cursor: 'pointer',
            border: settings.lastSeenVisibility === v ? '1.5px solid var(--accent-green)' : '1px solid var(--border-color)'
          }}
          onClick={() => updateSetting({ lastSeenVisibility: v })}
        >
          <span style={{ fontSize: '14.5px', textTransform: 'capitalize', color: 'var(--text-primary)' }}>{v}</span>
          {settings.lastSeenVisibility === v && <Check size={18} color="var(--accent-green)" />}
        </label>
      ))}
    </div>
  );

  const renderSecurityView = () => (
    <div style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid var(--border-color)'
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>App Screen Lock</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Require PIN to unlock WhatsApp Anivi
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.appLockEnabled}
          onChange={(e) => updateSetting({ appLockEnabled: e.target.checked })}
          style={{ width: '20px', height: '20px', accentColor: 'var(--accent-green)', cursor: 'pointer' }}
        />
      </div>

      {settings.appLockEnabled && (
        <div style={{ backgroundColor: 'var(--bg-panel)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '8px' }}>
            {settings.appLockPin ? 'CHANGE PIN' : 'SET 4-6 DIGIT PIN'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder="Enter new PIN"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
              style={{
                flex: 1,
                padding: '8px 12px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                outline: 'none'
              }}
            />
            <button
              onClick={handleSavePin}
              disabled={newPin.length < 4}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--accent-green)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: newPin.length >= 4 ? 'pointer' : 'not-allowed',
                opacity: newPin.length >= 4 ? 1 : 0.5
              }}
            >
              Save
            </button>
          </div>
          {pinSavedSuccess && (
            <div style={{ color: 'var(--accent-green)', fontSize: '12px', marginTop: '6px' }}>
              ✓ PIN updated successfully
            </div>
          )}
        </div>
      )}

      {settings.appLockEnabled && (
        <div>
          <div style={{ fontSize: '13px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '10px' }}>
            AUTO-LOCK TIMEOUT
          </div>
          {[
            { secs: 0, label: 'Immediately' },
            { secs: 60, label: 'After 1 minute' },
            { secs: 900, label: 'After 15 minutes' },
            { secs: 3600, label: 'After 1 hour' },
          ].map((timer) => (
            <label
              key={timer.secs}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--bg-panel)',
                borderRadius: '8px',
                marginBottom: '8px',
                cursor: 'pointer',
                border: settings.autoLockDuration === timer.secs ? '1.5px solid var(--accent-green)' : '1px solid var(--border-color)'
              }}
              onClick={() => updateSetting({ autoLockDuration: timer.secs })}
            >
              <span style={{ fontSize: '14.5px', color: 'var(--text-primary)' }}>{timer.label}</span>
              {settings.autoLockDuration === timer.secs && <Check size={18} color="var(--accent-green)" />}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const renderNotificationsView = () => (
    <div style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '1px solid var(--border-color)'
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Message Audio Sounds</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Play audio chime when sending and receiving messages
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.soundEnabled}
          onChange={(e) => updateSetting({ soundEnabled: e.target.checked })}
          style={{ width: '20px', height: '20px', accentColor: 'var(--accent-green)', cursor: 'pointer' }}
        />
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        backgroundColor: 'var(--bg-panel)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)'
      }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Message Preview</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Show message preview in chat list snippet
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.notificationsPreview}
          onChange={(e) => updateSetting({ notificationsPreview: e.target.checked })}
          style={{ width: '20px', height: '20px', accentColor: 'var(--accent-green)', cursor: 'pointer' }}
        />
      </div>
    </div>
  );

  return (
    <div className={`wa-left-drawer ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="wa-header" style={{ height: '108px', alignItems: 'flex-end', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <button
            className="wa-icon-btn"
            onClick={() => {
              if (subView !== 'main') setSubView('main');
              else onClose();
            }}
            title="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '19px', textTransform: 'capitalize' }}>
            {subView === 'main' ? 'Settings' : subView}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)' }}>
        {subView === 'main' && renderMainSettings()}
        {subView === 'theme' && renderThemeView()}
        {subView === 'wallpaper' && renderWallpaperView()}
        {subView === 'privacy' && renderPrivacyView()}
        {subView === 'security' && renderSecurityView()}
        {subView === 'notifications' && renderNotificationsView()}
      </div>
    </div>
  );
};
