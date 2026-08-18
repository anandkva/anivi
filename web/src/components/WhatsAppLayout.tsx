import React, { useState, useEffect, useRef } from 'react';
import type { Account, Connection } from '../lib/account';
import type { ChatMessage, ChatReply, Envelope } from '../lib/protocol';
import { AniviSocket } from '../lib/socket';
import { 
  loadSettings, 
  saveSettings, 
  applyTheme, 
  applyFontSize, 
  recordAppActivity,
  type AppSettings 
} from '../lib/settingsStore';
import { loadCachedMessages, saveCachedMessages, soundEffects } from '../lib/chatStore';

import { ChatListSidebar } from './ChatListSidebar';
import { ActiveChatPane } from './ActiveChatPane';
import { ProfileDrawer } from './ProfileDrawer';
import { SettingsDrawer } from './SettingsDrawer';
import { ContactInfoDrawer } from './ContactInfoDrawer';
import { MessageSearchDrawer } from './MessageSearchDrawer';
import { MediaLightboxModal } from './MediaLightboxModal';
import { ConnectSheet } from './ConnectSheet';
import { MessageSquare } from 'lucide-react';

interface WhatsAppLayoutProps {
  account: Account;
  connections: Connection[];
  initialConnectionId?: string;
  onRefreshConnections: () => void;
  onSignOut: () => void;
  onUpdateAccount: (name: string, aniviCode: string) => void;
}

export const WhatsAppLayout: React.FC<WhatsAppLayoutProps> = ({
  account,
  connections,
  initialConnectionId,
  onRefreshConnections,
  onSignOut,
  onUpdateAccount,
}) => {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [activeConnId, setActiveConnId] = useState<string | null>(initialConnectionId || connections[0]?.connectionId || null);

  // Drawers
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isConnectSheetOpen, setIsConnectSheetOpen] = useState(false);

  // Full-screen media lightbox
  const [lightboxData, setLightboxData] = useState<{ src: string; caption?: string } | null>(null);

  // Chat message state per room
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [latestMessages, setLatestMessages] = useState<Record<string, ChatMessage | undefined>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});

  const socketRef = useRef<AniviSocket | null>(null);

  // Active Connection
  const activeConnection = connections.find((c) => c.connectionId === activeConnId) || null;

  // Apply theme & font size on mount
  useEffect(() => {
    applyTheme(settings.theme);
    applyFontSize(settings.fontSize);
  }, [settings.theme, settings.fontSize]);

  // Load cached messages for rooms
  useEffect(() => {
    connections.forEach((c) => {
      const cached = loadCachedMessages(c.roomId);
      if (cached.length > 0) {
        setMessagesByRoom((prev) => ({ ...prev, [c.roomId]: cached }));
        setLatestMessages((prev) => ({ ...prev, [c.roomId]: cached[cached.length - 1] }));
      }
    });
  }, [connections]);

  // Connect active room socket
  useEffect(() => {
    if (!activeConnection) return;

    const roomId = activeConnection.roomId;
    const socket = new AniviSocket();
    socketRef.current = socket;

    socket.connect({ roomId, userId: account.userId });

    // Request chat history
    socket.send({ type: 'chat_history', roomId, userId: account.userId, limit: 100 });

    // On chat message
    const unsubChat = socket.on('chat', (env: Envelope) => {
      if (env.chat) {
        const incoming = env.chat;
        setMessagesByRoom((prev) => {
          const current = prev[roomId] || [];
          // Deduplicate
          const exists = current.some((m) => m.id === incoming.id);
          const next = exists ? current.map((m) => (m.id === incoming.id ? incoming : m)) : [...current, incoming];
          saveCachedMessages(roomId, next);
          return { ...prev, [roomId]: next };
        });

        setLatestMessages((prev) => ({ ...prev, [roomId]: incoming }));

        if (incoming.userId !== account.userId) {
          soundEffects.playReceive();
          // Send delivery receipt
          socket.send({
            type: 'chat_delivery',
            roomId,
            userId: account.userId,
            messageId: incoming.id,
          });

          // Send read receipt if in active window
          if (document.visibilityState === 'visible') {
            socket.send({
              type: 'chat_read',
              roomId,
              userId: account.userId,
              messageId: incoming.id,
              readAt: Date.now(),
              readReceiptsDisabled: !settings.readReceipts,
            });
          }
        }
      }
    });

    // On chat history
    const unsubHistory = socket.on('chat_history', (env: Envelope) => {
      if (env.messages) {
        setMessagesByRoom((prev) => {
          const next = env.messages || [];
          saveCachedMessages(roomId, next);
          return { ...prev, [roomId]: next };
        });
        if (env.messages.length > 0) {
          setLatestMessages((prev) => ({ ...prev, [roomId]: env.messages![env.messages!.length - 1] }));
        }
      }
    });

    // On delivery receipt
    const unsubDelivery = socket.on('chat_delivery', (env: Envelope) => {
      if (env.messageId) {
        setMessagesByRoom((prev) => {
          const list = prev[roomId] || [];
          const updated = list.map((m) =>
            m.id === env.messageId && m.status !== 'read' ? { ...m, status: 'delivered' as const } : m
          );
          saveCachedMessages(roomId, updated);
          return { ...prev, [roomId]: updated };
        });
      }
    });

    // On read receipt
    const unsubRead = socket.on('chat_read', (env: Envelope) => {
      setMessagesByRoom((prev) => {
        const list = prev[roomId] || [];
        const updated = list.map((m) => {
          if (m.userId === account.userId) {
            // If read receipts disabled by sender or recipient, tick remains delivered status
            const newStatus: ChatMessage['status'] = env.readReceiptsDisabled || !settings.readReceipts ? 'delivered' : 'read';
            return { ...m, status: newStatus };
          }
          return m;
        });
        saveCachedMessages(roomId, updated);
        return { ...prev, [roomId]: updated };
      });
    });

    // On message reaction
    const unsubReaction = socket.on('chat_reaction', (env: Envelope) => {
      if (env.messageId && env.reaction && env.userId) {
        setMessagesByRoom((prev) => {
          const list = prev[roomId] || [];
          const updated = list.map((m) => {
            if (m.id === env.messageId) {
              const reactions = { ...(m.reactions || {}) };
              const currentUsers = reactions[env.reaction!] || [];
              if (currentUsers.includes(env.userId!)) {
                reactions[env.reaction!] = currentUsers.filter((u) => u !== env.userId);
                if (reactions[env.reaction!].length === 0) delete reactions[env.reaction!];
              } else {
                reactions[env.reaction!] = [...currentUsers, env.userId!];
              }
              return { ...m, reactions };
            }
            return m;
          });
          saveCachedMessages(roomId, updated);
          return { ...prev, [roomId]: updated };
        });
      }
    });

    // On message edit
    const unsubEdit = socket.on('chat_edit', (env: Envelope) => {
      if (env.messageId && env.message) {
        setMessagesByRoom((prev) => {
          const list = prev[roomId] || [];
          const updated = list.map((m) =>
            m.id === env.messageId ? { ...m, text: env.message, editedAt: env.timestamp || Date.now() } : m
          );
          saveCachedMessages(roomId, updated);
          return { ...prev, [roomId]: updated };
        });
      }
    });

    // On message delete
    const unsubDelete = socket.on('chat_delete', (env: Envelope) => {
      if (env.messageId) {
        setMessagesByRoom((prev) => {
          const list = prev[roomId] || [];
          const updated = list.map((m) =>
            m.id === env.messageId ? { ...m, deletedForEveryone: true } : m
          );
          saveCachedMessages(roomId, updated);
          return { ...prev, [roomId]: updated };
        });
      }
    });

    // On typing
    const unsubTyping = socket.on('typing', (env: Envelope) => {
      if (env.userId !== account.userId) {
        setTypingUsers((prev) => ({ ...prev, [roomId]: !!env.typing }));
      }
    });

    // On presence
    const unsubPresence = socket.on('presence', (env: Envelope) => {
      setOnlineUsers((prev) => ({ ...prev, [roomId]: (env.online || 0) > 1 }));
    });

    return () => {
      unsubChat();
      unsubHistory();
      unsubDelivery();
      unsubRead();
      unsubReaction();
      unsubEdit();
      unsubDelete();
      unsubTyping();
      unsubPresence();
      socket.disconnect();
    };
  }, [activeConnection?.roomId, account.userId, settings.readReceipts]);

  // Send Message Handler
  const handleSendMessage = (
    text: string,
    kind: ChatMessage['kind'] = 'text',
    attachment?: ChatMessage['attachment'],
    replyTo?: ChatReply,
    voiceMeta?: { duration: number; waveform: number[] }
  ) => {
    if (!activeConnection) return;
    recordAppActivity();

    const roomId = activeConnection.roomId;
    const now = Date.now();
    const tempId = `msg_${now}_${Math.random().toString(36).slice(2, 7)}`;

    const optimisticMessage: ChatMessage = {
      id: tempId,
      roomId,
      userId: account.userId,
      senderName: account.name,
      kind,
      text,
      attachment,
      replyTo,
      audioDuration: voiceMeta?.duration,
      waveform: voiceMeta?.waveform,
      status: 'pending',
      createdAt: now,
      pending: true,
    };

    // Optimistic state update
    setMessagesByRoom((prev) => {
      const current = prev[roomId] || [];
      const next = [...current, optimisticMessage];
      saveCachedMessages(roomId, next);
      return { ...prev, [roomId]: next };
    });
    setLatestMessages((prev) => ({ ...prev, [roomId]: optimisticMessage }));

    // Send over socket
    socketRef.current?.send({
      type: 'chat',
      roomId,
      userId: account.userId,
      chat: optimisticMessage,
    });
  };

  const handleSendTyping = (isTyping: boolean) => {
    if (!activeConnection) return;
    socketRef.current?.send({
      type: 'typing',
      roomId: activeConnection.roomId,
      userId: account.userId,
      typing: isTyping,
    });
  };

  const handleReactMessage = (messageId: string, emoji: string) => {
    if (!activeConnection) return;
    socketRef.current?.send({
      type: 'chat_reaction',
      roomId: activeConnection.roomId,
      userId: account.userId,
      messageId,
      reaction: emoji,
    });
  };

  const handleEditMessage = (messageId: string, text: string) => {
    if (!activeConnection) return;
    socketRef.current?.send({
      type: 'chat_edit',
      roomId: activeConnection.roomId,
      userId: account.userId,
      messageId,
      message: text,
    });
  };

  const handleDeleteMessage = (messageId: string, forEveryone: boolean) => {
    if (!activeConnection) return;
    if (forEveryone) {
      socketRef.current?.send({
        type: 'chat_delete',
        roomId: activeConnection.roomId,
        userId: account.userId,
        messageId,
      });
    } else {
      // Local delete for me
      setMessagesByRoom((prev) => {
        const roomId = activeConnection.roomId;
        const current = prev[roomId] || [];
        const next = current.filter((m) => m.id !== messageId);
        saveCachedMessages(roomId, next);
        return { ...prev, [roomId]: next };
      });
    }
  };

  const handleClearChat = () => {
    if (!activeConnection) return;
    if (window.confirm(`Clear chat history with ${activeConnection.peerName}?`)) {
      const roomId = activeConnection.roomId;
      setMessagesByRoom((prev) => ({ ...prev, [roomId]: [] }));
      setLatestMessages((prev) => ({ ...prev, [roomId]: undefined }));
      saveCachedMessages(roomId, []);
      setIsContactInfoOpen(false);
    }
  };

  const handleClearAllChats = () => {
    if (window.confirm('Clear all local chat history across all contacts?')) {
      setMessagesByRoom({});
      setLatestMessages({});
      connections.forEach((c) => saveCachedMessages(c.roomId, []));
      alert('All chat history cleared.');
    }
  };

  const handleTogglePin = (connId: string) => {
    const isPinned = settings.pinnedChats.includes(connId);
    const updated = isPinned
      ? settings.pinnedChats.filter((id) => id !== connId)
      : [...settings.pinnedChats, connId];
    const newSettings = saveSettings({ pinnedChats: updated });
    setSettings(newSettings);
  };

  const handleToggleMute = (connId: string) => {
    const isMuted = settings.mutedChats.includes(connId);
    const updated = isMuted
      ? settings.mutedChats.filter((id) => id !== connId)
      : [...settings.mutedChats, connId];
    const newSettings = saveSettings({ mutedChats: updated });
    setSettings(newSettings);
  };

  return (
    <div className="wa-container">
      {/* Left Sidebar */}
      <ChatListSidebar
        account={account}
        connections={connections}
        activeConnectionId={activeConnId}
        latestMessages={latestMessages}
        typingUsers={typingUsers}
        onlineUsers={onlineUsers}
        pinnedChatIds={settings.pinnedChats}
        mutedChatIds={settings.mutedChats}
        archivedChatIds={settings.archivedChats}
        readReceiptsEnabled={settings.readReceipts}
        avatarUrl={settings.avatarUrl}
        onSelectChat={(conn) => {
          setActiveConnId(conn.connectionId);
          setIsContactInfoOpen(false);
          setIsSearchOpen(false);
        }}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenNewChat={() => setIsConnectSheetOpen(true)}
        onTogglePin={handleTogglePin}
        onToggleMute={handleToggleMute}
        onSignOut={onSignOut}
      />

      {/* Main Conversation Pane or Blank WhatsApp Welcome */}
      {activeConnection ? (
        <ActiveChatPane
          connection={activeConnection}
          myUserId={account.userId}
          messages={messagesByRoom[activeConnection.roomId] || []}
          peerOnline={!!onlineUsers[activeConnection.roomId]}
          peerTyping={!!typingUsers[activeConnection.roomId]}
          readReceiptsEnabled={settings.readReceipts}
          wallpaperPreset={settings.wallpaper}
          onSendMessage={handleSendMessage}
          onSendTyping={handleSendTyping}
          onReactMessage={handleReactMessage}
          onEditMessage={handleEditMessage}
          onDeleteMessage={handleDeleteMessage}
          onOpenContactInfo={() => setIsContactInfoOpen(true)}
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenImage={(src, caption) => setLightboxData({ src, caption })}
          onBackMobile={() => setActiveConnId(null)}
        />
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-app)',
          textAlign: 'center',
          padding: '40px',
          borderBottom: '6px solid var(--accent-green)'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: 'rgba(0, 168, 132, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-green)',
            marginBottom: '20px'
          }}>
            <MessageSquare size={44} />
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 300, color: 'var(--text-primary)', marginBottom: '12px' }}>
            Anivi Web
          </h2>
          <p style={{ fontSize: '14.5px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5, marginBottom: '24px' }}>
            Send and receive messages in real time with end-to-end encryption, delivery ticks, voice notes, and customizable settings.
          </p>
          <button
            onClick={() => setIsConnectSheetOpen(true)}
            style={{
              backgroundColor: 'var(--accent-green)',
              color: '#ffffff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Start a new conversation
          </button>
        </div>
      )}

      {/* Left Slide-in Profile Drawer */}
      <ProfileDrawer
        isOpen={isProfileOpen}
        account={account}
        onClose={() => setIsProfileOpen(false)}
        onUpdateAccount={(name) => {
          onUpdateAccount(name, account.aniviCode);
          setSettings(loadSettings());
        }}
      />

      {/* Left Slide-in Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        account={account}
        onClose={() => setIsSettingsOpen(false)}
        onOpenProfile={() => {
          setIsSettingsOpen(false);
          setIsProfileOpen(true);
        }}
        onSignOut={onSignOut}
        onClearAllChats={handleClearAllChats}
      />

      {/* Right Slide-in Contact Info Drawer */}
      {activeConnection && (
        <ContactInfoDrawer
          isOpen={isContactInfoOpen}
          connection={activeConnection}
          messages={messagesByRoom[activeConnection.roomId] || []}
          isMuted={settings.mutedChats.includes(activeConnection.connectionId)}
          onClose={() => setIsContactInfoOpen(false)}
          onToggleMute={() => handleToggleMute(activeConnection.connectionId)}
          onOpenAvatar={(url) => setLightboxData({ src: url, caption: activeConnection.peerName })}
          onClearChat={handleClearChat}
          onBlockContact={() => alert(`Blocked ${activeConnection.peerName}`)}
        />
      )}

      {/* Right Slide-in Message Search Drawer */}
      {activeConnection && (
        <MessageSearchDrawer
          isOpen={isSearchOpen}
          messages={messagesByRoom[activeConnection.roomId] || []}
          onClose={() => setIsSearchOpen(false)}
          onSelectMessage={() => {
            setIsSearchOpen(false);
          }}
        />
      )}

      {/* Connect / New Chat Sheet Modal */}
      {isConnectSheetOpen && (
        <ConnectSheet
          userId={account.userId}
          myCode={account.aniviCode}
          onConnected={(conn) => {
            setIsConnectSheetOpen(false);
            onRefreshConnections();
            setActiveConnId(conn.connectionId);
          }}
          onClose={() => setIsConnectSheetOpen(false)}
        />
      )}

      {/* Media Lightbox Modal */}
      {lightboxData && (
        <MediaLightboxModal
          src={lightboxData.src}
          caption={lightboxData.caption}
          onClose={() => setLightboxData(null)}
        />
      )}
    </div>
  );
};
