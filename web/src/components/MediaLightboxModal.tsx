import React, { useEffect } from 'react';
import { X, Download } from 'lucide-react';

interface MediaLightboxModalProps {
  src: string;
  caption?: string;
  senderName?: string;
  timestamp?: number;
  onClose: () => void;
}

export const MediaLightboxModal: React.FC<MediaLightboxModalProps> = ({
  src,
  caption,
  senderName,
  timestamp,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = `anivi_media_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="wa-lightbox" onClick={onClose}>
      <div className="wa-lightbox-header" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 600, fontSize: '15px' }}>{senderName || 'Photo'}</span>
          {timestamp && (
            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={handleDownload}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px'
            }}
            title="Download"
          >
            <Download size={20} />
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px'
            }}
            title="Close"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div
        style={{
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={caption || 'Preview'}
          style={{
            maxWidth: '100%',
            maxHeight: '75vh',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.8)'
          }}
        />
        {caption && (
          <div style={{
            marginTop: '12px',
            color: '#ffffff',
            fontSize: '14.5px',
            backgroundColor: 'rgba(0,0,0,0.6)',
            padding: '6px 16px',
            borderRadius: '16px',
            textAlign: 'center'
          }}>
            {caption}
          </div>
        )}
      </div>
    </div>
  );
};
