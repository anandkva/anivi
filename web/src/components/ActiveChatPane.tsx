import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  MoreVertical, 
  Paperclip, 
  Smile, 
  Mic, 
  Send, 
  X, 
  Image as ImageIcon, 
  FileText, 
  Phone, 
  Video,
  ArrowLeft
} from 'lucide-react';
import type { Connection } from '../lib/account';
import type { ChatMessage, ChatReply } from '../lib/protocol';
import { MessageBubble } from './MessageBubble';
import { EmojiPickerModal } from './EmojiPickerModal';
import { VoiceRecorder } from '../lib/audioRecorder';
import { soundEffects } from '../lib/chatStore';

interface ActiveChatPaneProps {
  connection: Connection;
  myUserId: string;
  messages: ChatMessage[];
  peerOnline: boolean;
  peerTyping: boolean;
  readReceiptsEnabled: boolean;
  wallpaperPreset: string;
  onSendMessage: (text: string, kind?: ChatMessage['kind'], attachment?: ChatMessage['attachment'], replyTo?: ChatReply, voiceMeta?: { duration: number; waveform: number[] }) => void;
  onSendTyping: (isTyping: boolean) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onEditMessage: (messageId: string, text: string) => void;
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onOpenContactInfo: () => void;
  onOpenSearch: () => void;
  onOpenImage: (url: string, caption?: string) => void;
  onBackMobile?: () => void;
}

export const ActiveChatPane: React.FC<ActiveChatPaneProps> = ({
  connection,
  myUserId,
  messages,
  peerOnline,
  peerTyping,
  readReceiptsEnabled,
  wallpaperPreset,
  onSendMessage,
  onSendTyping,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
  onOpenContactInfo,
  onOpenSearch,
  onOpenImage,
  onBackMobile,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Voice note recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const typingDebounceRef = useRef<number | null>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.status]);

  // Handle typing debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (typingDebounceRef.current) window.clearTimeout(typingDebounceRef.current);
    onSendTyping(true);
    typingDebounceRef.current = window.setTimeout(() => {
      onSendTyping(false);
    }, 2000);
  };

  const handleSend = () => {
    if (editingMessage) {
      if (inputText.trim()) {
        onEditMessage(editingMessage.id, inputText.trim());
        setEditingMessage(null);
        setInputText('');
      }
      return;
    }

    if (!inputText.trim()) return;

    const replyContext: ChatReply | undefined = replyingTo
      ? {
          id: replyingTo.id,
          userId: replyingTo.userId,
          senderName: replyingTo.userId === myUserId ? 'You' : connection.peerName,
          text: replyingTo.text || (replyingTo.kind === 'image' ? '📷 Photo' : 'Voice note'),
          kind: replyingTo.kind,
        }
      : undefined;

    soundEffects.playSend();
    onSendMessage(inputText.trim(), 'text', undefined, replyContext);
    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    onSendTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Start Voice Recording
  const startRecording = async () => {
    const recorder = new VoiceRecorder();
    voiceRecorderRef.current = recorder;
    const ok = await recorder.start(() => {});

    if (ok) {
      setIsRecording(true);
      setRecordingDuration(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  // Stop & Send Voice Note
  const stopAndSendRecording = async () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }

    if (voiceRecorderRef.current) {
      const result = await voiceRecorderRef.current.stop();
      setIsRecording(false);
      if (result && result.duration >= 1) {
        soundEffects.playSend();
        onSendMessage('', 'audio', {
          key: `rooms/${connection.roomId}/voice_${Date.now()}.webm`,
          url: result.dataUrl,
          mime: result.blob.type,
          size: result.blob.size,
          duration: result.duration,
        }, undefined, {
          duration: result.duration,
          waveform: result.waveform,
        });
      }
    }
  };

  const cancelRecording = () => {
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    voiceRecorderRef.current?.cancel();
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Image Upload handler
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const url = reader.result as string;
        soundEffects.playSend();
        onSendMessage(inputText.trim(), 'image', {
          key: `rooms/${connection.roomId}/img_${Date.now()}`,
          url,
          mime: file.type,
          size: file.size,
        });
        setInputText('');
        setShowAttachMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Document Upload handler
  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      soundEffects.playSend();
      onSendMessage(file.name, 'document', {
        key: `rooms/${connection.roomId}/doc_${Date.now()}_${file.name}`,
        url: '',
        mime: file.type,
        size: file.size,
        fileName: file.name,
      });
      setShowAttachMenu(false);
    }
  };

  // Group messages by date
  const renderMessageList = () => {
    let lastDate = '';

    return messages.map((msg) => {
      const msgDate = new Date(msg.createdAt).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const showDateHeader = msgDate !== lastDate;
      if (showDateHeader) lastDate = msgDate;

      const isToday = new Date().toLocaleDateString() === new Date(msg.createdAt).toLocaleDateString();

      return (
        <React.Fragment key={msg.id}>
          {showDateHeader && (
            <div className="wa-date-separator">
              {isToday ? 'Today' : msgDate}
            </div>
          )}
          <MessageBubble
            message={msg}
            isMine={msg.userId === myUserId}
            readReceiptsEnabled={readReceiptsEnabled}
            onReply={(m) => setReplyingTo(m)}
            onReact={onReactMessage}
            onEdit={(m) => {
              setEditingMessage(m);
              setInputText(m.text || '');
              textareaRef.current?.focus();
            }}
            onDelete={onDeleteMessage}
            onOpenImage={onOpenImage}
          />
        </React.Fragment>
      );
    });
  };

  const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${connection.peerName || connection.connectionId}`;

  return (
    <div className={`wa-conversation chat-wallpaper-${wallpaperPreset || 'doodle'}`}>
      {/* Sticky Header */}
      <div className="wa-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={onOpenContactInfo}>
          {onBackMobile && (
            <button
              className="wa-icon-btn"
              onClick={(e) => {
                e.stopPropagation();
                onBackMobile();
              }}
              title="Back to chat list"
            >
              <ArrowLeft size={20} />
            </button>
          )}

          <div style={{ position: 'relative' }}>
            <img
              src={defaultAvatar}
              alt={connection.peerName}
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
            />
            {peerOnline && <div className="wa-online-dot" />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)' }}>
              {connection.peerName}
            </span>
            <span style={{ fontSize: '12px', color: peerTyping ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
              {peerTyping ? 'typing...' : peerOnline ? 'online' : 'last seen recently'}
            </span>
          </div>
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="wa-icon-btn" onClick={() => alert('Starting voice call...')} title="Audio Call">
            <Phone size={19} />
          </button>
          <button className="wa-icon-btn" onClick={() => alert('Starting video call...')} title="Video Call">
            <Video size={20} />
          </button>
          <button className="wa-icon-btn" onClick={onOpenSearch} title="Search in chat">
            <Search size={19} />
          </button>
          <button className="wa-icon-btn" onClick={() => setShowMenu(!showMenu)} title="Menu">
            <MoreVertical size={19} />
          </button>

          {/* Menu Dropdown */}
          {showMenu && (
            <div style={{
              position: 'absolute',
              top: '56px',
              right: '16px',
              backgroundColor: 'var(--bg-header)',
              borderRadius: '8px',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border-color)',
              zIndex: 70,
              minWidth: '180px',
              padding: '6px 0'
            }}>
              <div
                onClick={() => { onOpenContactInfo(); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Contact info
              </div>
              <div
                onClick={() => { onOpenSearch(); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Search messages
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="wa-message-scroll">
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            backgroundColor: 'var(--bg-header)',
            padding: '16px 24px',
            borderRadius: '12px',
            maxWidth: '340px',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔒</div>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
              End-to-End Encrypted
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.
            </div>
          </div>
        ) : (
          renderMessageList()
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply or Edit Context Banner */}
      {(replyingTo || editingMessage) && (
        <div style={{
          backgroundColor: 'var(--bg-header)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border-color)',
          borderLeft: '4px solid var(--accent-green)',
          position: 'relative',
          zIndex: 7
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-green)' }}>
              {editingMessage ? 'Editing message' : `Replying to ${replyingTo?.userId === myUserId ? 'yourself' : connection.peerName}`}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80vw' }}>
              {editingMessage?.text || replyingTo?.text || 'Attachment'}
            </div>
          </div>
          <button
            className="wa-icon-btn"
            onClick={() => {
              setReplyingTo(null);
              setEditingMessage(null);
              setInputText('');
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <EmojiPickerModal
          onSelectEmoji={(emoji) => setInputText((prev) => prev + emoji)}
          onSelectSticker={() => {
            soundEffects.playSend();
            onSendMessage('', 'sticker', undefined, undefined);
            setShowEmojiPicker(false);
          }}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Attachment Menu Popover */}
      {showAttachMenu && (
        <div style={{
          position: 'absolute',
          bottom: '72px',
          left: '52px',
          backgroundColor: 'var(--bg-header)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          padding: '12px',
          display: 'flex',
          gap: '16px',
          zIndex: 80
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#ac44cf', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <ImageIcon size={22} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Photos</span>
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageSelect} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#5f66cd', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <FileText size={22} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>Document</span>
            <input type="file" style={{ display: 'none' }} onChange={handleDocumentSelect} />
          </label>
        </div>
      )}

      {/* Bottom Input Bar */}
      <div className="wa-input-bar">
        {isRecording ? (
          /* Live Voice Recording UI */
          <div className="wa-recording-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="wa-recording-pulse-dot" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--danger-color)' }}>
                {Math.floor(recordingDuration / 60)}:{recordingDuration % 60 < 10 ? '0' : ''}{recordingDuration % 60}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Recording audio...</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={cancelRecording}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--danger-color)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '6px 12px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={stopAndSendRecording}
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent-green)',
                  color: '#fff',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="Send voice note"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar */
          <>
            <button
              className={`wa-icon-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Emojis"
            >
              <Smile size={24} />
            </button>

            <button
              className={`wa-icon-btn ${showAttachMenu ? 'active' : ''}`}
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              title="Attach"
            >
              <Paperclip size={24} />
            </button>

            <div className="wa-input-textarea-wrapper">
              <textarea
                ref={textareaRef}
                className="wa-input-textarea"
                rows={1}
                placeholder="Type a message"
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
            </div>

            {inputText.trim() ? (
              <button
                className="wa-icon-btn active"
                onClick={handleSend}
                title="Send message"
                style={{ backgroundColor: 'var(--accent-green)', color: '#ffffff', width: '40px', height: '40px' }}
              >
                <Send size={19} />
              </button>
            ) : (
              <button
                className="wa-icon-btn"
                onClick={startRecording}
                title="Hold or click to record voice note"
                style={{ width: '40px', height: '40px' }}
              >
                <Mic size={24} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
