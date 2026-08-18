import React, { useState } from 'react';
import { 
  Check, 
  CheckCheck, 
  Clock, 
  ChevronDown, 
  CornerUpLeft, 
  Smile, 
  Trash2, 
  Edit3, 
  Copy, 
  FileText,
  Ban
} from 'lucide-react';
import type { ChatMessage } from '../lib/protocol';
import { VoicePlayer } from './VoicePlayer';
import { STICKERS } from '../lib/stickers';

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  readReceiptsEnabled: boolean;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit?: (message: ChatMessage) => void;
  onDelete?: (messageId: string, forEveryone: boolean) => void;
  onOpenImage?: (src: string, caption?: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMine,
  readReceiptsEnabled,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onOpenImage,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactions, setShowReactions] = useState(false);

  const formatTimestamp = (ms: number) => {
    const date = new Date(ms);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderStatusTick = () => {
    if (!isMine) return null;

    if (message.pending || message.status === 'pending') {
      return <Clock size={12} className="wa-tick-icon" color="var(--tick-gray)" />;
    }

    if (message.status === 'read' && readReceiptsEnabled) {
      return <CheckCheck size={16} className="wa-tick-icon wa-tick-blue" />;
    }

    if (message.status === 'delivered' || message.status === 'read') {
      return <CheckCheck size={16} className="wa-tick-icon wa-tick-gray" />;
    }

    // Default sent status
    return <Check size={14} className="wa-tick-icon wa-tick-gray" />;
  };

  if (message.deletedForEveryone) {
    return (
      <div className={`wa-bubble-row ${isMine ? 'sent' : 'recv'}`}>
        <div className="wa-bubble" style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Ban size={14} />
            <span>This message was deleted</span>
          </div>
          <div className="wa-bubble-meta">
            <span>{formatTimestamp(message.createdAt)}</span>
          </div>
        </div>
      </div>
    );
  }

  const stickerInfo = message.sticker ? STICKERS.find((s) => s.id === message.sticker) : null;

  return (
    <div 
      className={`wa-bubble-row ${isMine ? 'sent' : 'recv'}`}
      onMouseLeave={() => {
        setShowMenu(false);
        setShowReactions(false);
      }}
    >
      {/* Reaction Popover Bar */}
      {showReactions && (
        <div className="wa-reaction-popover" style={{ [isMine ? 'right' : 'left']: '10px' }}>
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              className="wa-reaction-btn"
              onClick={() => {
                onReact(message.id, emoji);
                setShowReactions(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="wa-bubble">
        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div className="wa-bubble-quote">
            <span className="wa-quote-sender">{message.replyTo.senderName}</span>
            <span className="wa-quote-text">{message.replyTo.text}</span>
          </div>
        )}

        {/* Message Content by Kind */}
        {message.kind === 'image' && message.attachment?.url && (
          <div style={{ marginBottom: '6px', cursor: 'pointer' }} onClick={() => onOpenImage?.(message.attachment!.url, message.text)}>
            <img
              src={message.attachment.url}
              alt={message.text || 'Photo'}
              style={{
                maxWidth: '100%',
                maxHeight: '280px',
                borderRadius: '6px',
                objectFit: 'cover',
                display: 'block'
              }}
              loading="lazy"
            />
          </div>
        )}

        {message.kind === 'audio' && (
          <VoicePlayer
            src={message.attachment?.url}
            duration={message.audioDuration || message.attachment?.duration}
            waveform={message.waveform}
            isSent={isMine}
          />
        )}

        {message.kind === 'document' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'rgba(0,0,0,0.1)',
            padding: '8px 12px',
            borderRadius: '6px',
            marginBottom: '6px'
          }}>
            <FileText size={28} color="var(--accent-green)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {message.fileName || 'Document'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {message.fileSize ? `${(message.fileSize / 1024).toFixed(1)} KB` : 'PDF/Doc'}
              </div>
            </div>
          </div>
        )}

        {message.kind === 'sticker' && stickerInfo && (
          <div style={{ padding: '8px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', lineHeight: 1 }}>{stickerInfo.art}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{stickerInfo.label}</div>
          </div>
        )}

        {message.text && (
          <div className="wa-bubble-text">
            {message.text}
          </div>
        )}

        {/* Bubble Meta (Time, Edited tag, Ticks) */}
        <div className="wa-bubble-meta">
          {message.editedAt && <span className="wa-edited-label">edited</span>}
          <span>{formatTimestamp(message.createdAt)}</span>
          {renderStatusTick()}
        </div>

        {/* Hover Action Menu Trigger */}
        <div 
          className="wa-bubble-actions"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <ChevronDown size={14} color="var(--text-secondary)" />
        </div>

        {/* Action Dropdown Menu */}
        {showMenu && (
          <div style={{
            position: 'absolute',
            top: '24px',
            right: isMine ? '6px' : 'auto',
            left: !isMine ? '6px' : 'auto',
            backgroundColor: 'var(--bg-header)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--border-color)',
            zIndex: 60,
            minWidth: '150px',
            padding: '4px 0',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => {
                setShowReactions(true);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Smile size={15} />
              <span>React</span>
            </button>

            <button
              onClick={() => {
                onReply(message);
                setShowMenu(false);
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left'
              }}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <CornerUpLeft size={15} />
              <span>Reply</span>
            </button>

            {message.text && (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(message.text || '');
                  setShowMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Copy size={15} />
                <span>Copy</span>
              </button>
            )}

            {isMine && onEdit && message.kind === 'text' && (
              <button
                onClick={() => {
                  onEdit(message);
                  setShowMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Edit3 size={15} />
                <span>Edit</span>
              </button>
            )}

            {onDelete && (
              <button
                onClick={() => {
                  onDelete(message.id, isMine);
                  setShowMenu(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger-color)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger-bg)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            )}
          </div>
        )}

        {/* Reaction Pill Badge */}
        {message.reactions && Object.keys(message.reactions).length > 0 && (
          <div className="wa-reaction-pill">
            {Object.entries(message.reactions).map(([emoji, users]) => (
              <span key={emoji} title={`${users.length} reaction(s)`}>
                {emoji} {users.length > 1 ? users.length : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
