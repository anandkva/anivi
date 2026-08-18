import React, { useState } from 'react';
import { ArrowLeft, Camera, Check, Edit2 } from 'lucide-react';
import type { Account } from '../lib/account';
import { loadSettings, saveSettings } from '../lib/settingsStore';

interface ProfileDrawerProps {
  isOpen: boolean;
  account: Account;
  onClose: () => void;
  onUpdateAccount: (name: string, avatarUrl: string, about: string) => void;
}

const AVATAR_PRESETS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=Felix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Luna',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Milo',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Zoe',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Nova',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Leo',
];

const ABOUT_PRESETS = [
  'Available',
  'Busy',
  'At work',
  'In a meeting',
  'Battery about to die',
  'Urgent calls only',
  'Sleeping',
  'Hey there! I am using Anivi ❤️'
];

export const ProfileDrawer: React.FC<ProfileDrawerProps> = ({
  isOpen,
  account,
  onClose,
  onUpdateAccount,
}) => {
  const settings = loadSettings();
  const [name, setName] = useState(account.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [about, setAbout] = useState(settings.aboutText || 'Available');
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(settings.avatarUrl || AVATAR_PRESETS[0]);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const handleSaveName = () => {
    if (name.trim()) {
      setIsEditingName(false);
      onUpdateAccount(name.trim(), avatarUrl, about);
    }
  };

  const handleSaveAbout = () => {
    if (about.trim()) {
      setIsEditingAbout(false);
      saveSettings({ aboutText: about.trim() });
      onUpdateAccount(name, avatarUrl, about.trim());
    }
  };

  const handleSelectAvatar = (url: string) => {
    setAvatarUrl(url);
    saveSettings({ avatarUrl: url });
    onUpdateAccount(name, url, about);
    setShowAvatarPicker(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        handleSelectAvatar(result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className={`wa-left-drawer ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="wa-header" style={{ height: '108px', alignItems: 'flex-end', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <button className="wa-icon-btn" onClick={onClose} title="Back to chats">
            <ArrowLeft size={22} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '19px' }}>Profile</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)' }}>
        {/* Avatar Section */}
        <div style={{
          padding: '28px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          backgroundColor: 'var(--bg-panel)',
          marginBottom: '14px'
        }}>
          <div
            style={{
              position: 'relative',
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              overflow: 'hidden',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-md)'
            }}
            onClick={() => setShowAvatarPicker(!showAvatarPicker)}
            title="Change profile picture"
          >
            <img
              src={avatarUrl}
              alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.45)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              opacity: 0,
              transition: 'opacity 0.2s'
            }}
            onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseOut={(e) => (e.currentTarget.style.opacity = '0')}
            >
              <Camera size={28} />
              <span style={{ fontSize: '11px', textTransform: 'uppercase', marginTop: '6px', fontWeight: 600 }}>
                Change Photo
              </span>
            </div>
          </div>

          {/* Avatar Presets or Upload */}
          {showAvatarPicker && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              backgroundColor: 'var(--bg-header)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              maxWidth: '320px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                CHOOSE AN AVATAR OR UPLOAD
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {AVATAR_PRESETS.map((preset, idx) => (
                  <img
                    key={idx}
                    src={preset}
                    alt="Preset"
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      border: avatarUrl === preset ? '2px solid var(--accent-green)' : '2px solid transparent'
                    }}
                    onClick={() => handleSelectAvatar(preset)}
                  />
                ))}
              </div>
              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                backgroundColor: 'var(--accent-green)',
                color: '#fff',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer'
              }}>
                <Camera size={14} />
                <span>Upload Custom Photo</span>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </div>

        {/* Display Name Editor */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          padding: '14px 24px',
          marginBottom: '14px'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '8px' }}>
            YOUR NAME
          </div>
          {isEditingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid var(--accent-green)',
                  color: 'var(--text-primary)',
                  fontSize: '16px',
                  outline: 'none',
                  padding: '4px 0'
                }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              />
              <button className="wa-icon-btn active" onClick={handleSaveName}>
                <Check size={18} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '16px', color: 'var(--text-primary)' }}>{name}</span>
              <button className="wa-icon-btn" onClick={() => setIsEditingName(true)}>
                <Edit2 size={16} />
              </button>
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            This is your username visible to your Anivi contacts.
          </div>
        </div>

        {/* About / Status Editor */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          padding: '14px 24px',
          marginBottom: '14px'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', fontWeight: 600, marginBottom: '8px' }}>
            ABOUT
          </div>
          {isEditingAbout ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="text"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                maxLength={100}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '2px solid var(--accent-green)',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  outline: 'none',
                  padding: '4px 0'
                }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleSaveAbout()}
              />
              <button className="wa-icon-btn active" onClick={handleSaveAbout}>
                <Check size={18} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{about}</span>
              <button className="wa-icon-btn" onClick={() => setIsEditingAbout(true)}>
                <Edit2 size={16} />
              </button>
            </div>
          )}

          {/* Quick presets */}
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {ABOUT_PRESETS.slice(0, 5).map((preset, i) => (
              <button
                key={i}
                onClick={() => {
                  setAbout(preset);
                  saveSettings({ aboutText: preset });
                  onUpdateAccount(name, avatarUrl, preset);
                }}
                style={{
                  fontSize: '11px',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
