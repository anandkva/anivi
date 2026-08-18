import React, { useState } from 'react';
import { 
  X, 
  Bell, 
  BellOff, 
  FileText, 
  ShieldAlert, 
  Ban, 
  Trash2, 
  Lock
} from 'lucide-react';
import type { Connection } from '../lib/account';
import type { ChatMessage } from '../lib/protocol';

interface ContactInfoDrawerProps {
  isOpen: boolean;
  connection: Connection;
  messages: ChatMessage[];
  isMuted: boolean;
  onClose: () => void;
  onToggleMute: () => void;
  onOpenAvatar: (url: string) => void;
  onClearChat: () => void;
  onBlockContact: () => void;
}

export const ContactInfoDrawer: React.FC<ContactInfoDrawerProps> = ({
  isOpen,
  connection,
  messages,
  isMuted,
  onClose,
  onToggleMute,
  onOpenAvatar,
  onClearChat,
  onBlockContact,
}) => {
  const [activeMediaTab, setActiveMediaTab] = useState<'media' | 'docs'>('media');

  const mediaMessages = messages.filter((m) => m.kind === 'image' && m.attachment?.url);
  const docMessages = messages.filter((m) => m.kind === 'document');

  const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${connection.peerName || connection.connectionId}`;
  const avatarUrl = connection.peerName ? defaultAvatar : defaultAvatar;

  return (
    <div className={`wa-drawer ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="wa-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="wa-icon-btn" onClick={onClose} title="Close contact info">
            <X size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '16px' }}>Contact Info</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-app)' }}>
        {/* Contact Avatar & Basic Info Card */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          marginBottom: '10px'
        }}>
          <div
            style={{ position: 'relative', cursor: 'pointer', marginBottom: '14px' }}
            onClick={() => onOpenAvatar(avatarUrl)}
            title="View photo"
          >
            <img
              src={avatarUrl}
              alt={connection.peerName}
              style={{ width: '130px', height: '130px', borderRadius: '50%', objectFit: 'cover' }}
            />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
            {connection.peerName}
          </h2>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {connection.relationship ? `Relationship: ${connection.relationship}` : 'Anivi Contact'}
          </div>
        </div>

        {/* About / Status Card */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          padding: '16px',
          marginBottom: '10px'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }}>
            ABOUT & STATUS
          </div>
          <div style={{ fontSize: '14.5px', color: 'var(--text-primary)' }}>
            Available for chat on Anivi ❤️
          </div>
        </div>

        {/* Media, Links and Docs Gallery */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          padding: '16px',
          marginBottom: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              MEDIA, LINKS AND DOCS
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {mediaMessages.length + docMessages.length}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => setActiveMediaTab('media')}
              className={`wa-filter-pill ${activeMediaTab === 'media' ? 'active' : ''}`}
            >
              Media ({mediaMessages.length})
            </button>
            <button
              onClick={() => setActiveMediaTab('docs')}
              className={`wa-filter-pill ${activeMediaTab === 'docs' ? 'active' : ''}`}
            >
              Docs ({docMessages.length})
            </button>
          </div>

          {activeMediaTab === 'media' ? (
            mediaMessages.length === 0 ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                No shared photos
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {mediaMessages.slice(0, 9).map((m) => (
                  <img
                    key={m.id}
                    src={m.attachment?.url}
                    alt="Media"
                    style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }}
                    onClick={() => onOpenAvatar(m.attachment!.url)}
                  />
                ))}
              </div>
            )
          ) : docMessages.length === 0 ? (
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
              No documents
            </div>
          ) : (
            <div>
              {docMessages.slice(0, 5).map((m) => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                  <FileText size={18} color="var(--accent-green)" />
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{m.fileName || 'Document'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mute & Encryption Options */}
        <div style={{
          backgroundColor: 'var(--bg-panel)',
          marginBottom: '10px'
        }}>
          <div
            onClick={onToggleMute}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--border-color)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {isMuted ? <BellOff size={20} color="var(--text-secondary)" /> : <Bell size={20} color="var(--text-secondary)" />}
              <div>
                <div style={{ fontSize: '14.5px', color: 'var(--text-primary)' }}>Mute notifications</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{isMuted ? 'Muted' : 'Unmuted'}</div>
              </div>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)'
          }}>
            <Lock size={20} color="var(--accent-green)" />
            <div>
              <div style={{ fontSize: '14.5px', color: 'var(--text-primary)' }}>Encryption</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Messages are end-to-end encrypted</div>
            </div>
          </div>
        </div>

        {/* Actions (Clear, Block, Report) */}
        <div style={{ backgroundColor: 'var(--bg-panel)', marginBottom: '20px' }}>
          <button
            onClick={onClearChat}
            style={{
              width: '100%',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              border: 'none',
              background: 'transparent',
              color: 'var(--danger-color)',
              fontSize: '14.5px',
              cursor: 'pointer',
              textAlign: 'left',
              borderBottom: '1px solid var(--border-color)'
            }}
          >
            <Trash2 size={18} />
            <span>Clear chat history</span>
          </button>

          <button
            onClick={onBlockContact}
            style={{
              width: '100%',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              border: 'none',
              background: 'transparent',
              color: 'var(--danger-color)',
              fontSize: '14.5px',
              cursor: 'pointer',
              textAlign: 'left',
              borderBottom: '1px solid var(--border-color)'
            }}
          >
            <Ban size={18} />
            <span>Block {connection.peerName}</span>
          </button>

          <button
            onClick={() => alert('Contact reported')}
            style={{
              width: '100%',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              border: 'none',
              background: 'transparent',
              color: 'var(--danger-color)',
              fontSize: '14.5px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <ShieldAlert size={18} />
            <span>Report {connection.peerName}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
