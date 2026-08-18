import React, { useState } from 'react';
import { 
  Search, 
  MoreVertical, 
  MessageSquarePlus, 
  Pin, 
  BellOff, 
  Check, 
  CheckCheck, 
  Settings, 
  Lock, 
  LogOut, 
  UserPlus
} from 'lucide-react';
import type { Account, Connection } from '../lib/account';
import type { ChatMessage } from '../lib/protocol';
import { setAppLocked } from '../lib/settingsStore';

interface ChatListSidebarProps {
  account: Account;
  connections: Connection[];
  activeConnectionId: string | null;
  latestMessages: Record<string, ChatMessage | undefined>;
  typingUsers: Record<string, boolean>;
  onlineUsers: Record<string, boolean>;
  pinnedChatIds: string[];
  mutedChatIds: string[];
  archivedChatIds: string[];
  readReceiptsEnabled: boolean;
  avatarUrl?: string;
  onSelectChat: (connection: Connection) => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onOpenNewChat: () => void;
  onTogglePin: (connectionId: string) => void;
  onToggleMute: (connectionId: string) => void;
  onSignOut: () => void;
}

export const ChatListSidebar: React.FC<ChatListSidebarProps> = ({
  account,
  connections,
  activeConnectionId,
  latestMessages,
  typingUsers,
  onlineUsers,
  pinnedChatIds,
  mutedChatIds,
  archivedChatIds,
  readReceiptsEnabled,
  avatarUrl,
  onSelectChat,
  onOpenProfile,
  onOpenSettings,
  onOpenNewChat,
  onTogglePin,
  onToggleMute,
  onSignOut,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'pinned'>('all');
  const [showMenu, setShowMenu] = useState(false);
  const [contextMenuConnectionId, setContextMenuConnectionId] = useState<string | null>(null);

  const defaultUserAvatar = avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${account.name}`;

  // Filter and sort connections
  const filteredConnections = connections
    .filter((c) => {
      // Exclude archived by default
      if (archivedChatIds.includes(c.connectionId)) return false;

      // Filter by query
      if (searchQuery.trim()) {
        const matchesName = c.peerName.toLowerCase().includes(searchQuery.toLowerCase().trim());
        const lastMsg = latestMessages[c.roomId]?.text?.toLowerCase() || '';
        const matchesMsg = lastMsg.includes(searchQuery.toLowerCase().trim());
        if (!matchesName && !matchesMsg) return false;
      }

      // Filter by tab
      if (filterTab === 'pinned') {
        return pinnedChatIds.includes(c.connectionId);
      }
      if (filterTab === 'unread') {
        return (c.unreadCount || 0) > 0;
      }
      return true;
    })
    .sort((a, b) => {
      const aPinned = pinnedChatIds.includes(a.connectionId);
      const bPinned = pinnedChatIds.includes(b.connectionId);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aTime = latestMessages[a.roomId]?.createdAt || a.lastActivityAt || a.createdAt;
      const bTime = latestMessages[b.roomId]?.createdAt || b.lastActivityAt || b.createdAt;
      return bTime - aTime;
    });

  const formatLastTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const renderTickIcon = (msg?: ChatMessage) => {
    if (!msg || msg.userId !== account.userId) return null;
    if (msg.status === 'read' && readReceiptsEnabled) {
      return <CheckCheck size={15} color="var(--tick-blue)" />;
    }
    if (msg.status === 'delivered' || msg.status === 'read') {
      return <CheckCheck size={15} color="var(--tick-gray)" />;
    }
    return <Check size={14} color="var(--tick-gray)" />;
  };

  return (
    <div className="wa-sidebar" onClick={() => setContextMenuConnectionId(null)}>
      {/* Sidebar Header */}
      <div className="wa-header">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={onOpenProfile}
          title="Open Profile"
        >
          <img
            src={defaultUserAvatar}
            alt={account.name}
            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '14.5px', color: 'var(--text-primary)' }}>
              {account.name}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {account.aniviCode}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="wa-icon-btn" onClick={onOpenNewChat} title="New Chat / Pair Code">
            <UserPlus size={20} />
          </button>
          <button className="wa-icon-btn" onClick={() => setShowMenu(!showMenu)} title="Menu">
            <MoreVertical size={20} />
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
                onClick={() => { onOpenNewChat(); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <MessageSquarePlus size={16} />
                <span>New chat</span>
              </div>

              <div
                onClick={() => { onOpenSettings(); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Settings size={16} />
                <span>Settings</span>
              </div>

              <div
                onClick={() => { setAppLocked(true); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <Lock size={16} />
                <span>Lock Screen</span>
              </div>

              <div
                onClick={() => { onSignOut(); setShowMenu(false); }}
                style={{ padding: '10px 16px', fontSize: '14px', color: 'var(--danger-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--border-color)' }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger-bg)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={16} />
                <span>Log out</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Input Box */}
      <div className="wa-search-box">
        <div className="wa-search-input-wrapper">
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            className="wa-search-input"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="wa-filter-tabs">
        <button
          className={`wa-filter-pill ${filterTab === 'all' ? 'active' : ''}`}
          onClick={() => setFilterTab('all')}
        >
          All
        </button>
        <button
          className={`wa-filter-pill ${filterTab === 'unread' ? 'active' : ''}`}
          onClick={() => setFilterTab('unread')}
        >
          Unread
        </button>
        <button
          className={`wa-filter-pill ${filterTab === 'pinned' ? 'active' : ''}`}
          onClick={() => setFilterTab('pinned')}
        >
          Pinned
        </button>
      </div>

      {/* Conversation List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredConnections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '14px', marginBottom: '8px' }}>No chats found</div>
            <button
              onClick={onOpenNewChat}
              style={{
                backgroundColor: 'var(--accent-green)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '8px'
              }}
            >
              Start a new chat
            </button>
          </div>
        ) : (
          filteredConnections.map((conn) => {
            const isActive = conn.connectionId === activeConnectionId;
            const lastMsg = latestMessages[conn.roomId];
            const isTyping = typingUsers[conn.roomId];
            const isOnline = onlineUsers[conn.roomId];
            const isPinned = pinnedChatIds.includes(conn.connectionId);
            const isMuted = mutedChatIds.includes(conn.connectionId);

            const lastTimestamp = lastMsg?.createdAt || conn.lastActivityAt || conn.createdAt;
            const peerAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${conn.peerName || conn.connectionId}`;

            return (
              <div
                key={conn.connectionId}
                className={`wa-chat-item ${isActive ? 'active' : ''}`}
                onClick={() => onSelectChat(conn)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenuConnectionId(conn.connectionId);
                }}
              >
                {/* Avatar with Online dot */}
                <div className="wa-chat-avatar-wrapper">
                  <img
                    src={peerAvatar}
                    alt={conn.peerName}
                    className="wa-avatar"
                  />
                  {isOnline && <div className="wa-online-dot" />}
                </div>

                {/* Metadata */}
                <div className="wa-chat-meta">
                  <div className="wa-chat-meta-top">
                    <span className="wa-chat-name">{conn.peerName}</span>
                    <span className={`wa-chat-time ${(conn.unreadCount || 0) > 0 ? 'unread' : ''}`}>
                      {formatLastTime(lastTimestamp)}
                    </span>
                  </div>

                  <div className="wa-chat-meta-bottom">
                    <div className="wa-chat-snippet">
                      {isTyping ? (
                        <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>
                          typing...
                        </span>
                      ) : (
                        <>
                          {renderTickIcon(lastMsg)}
                          <span>
                            {lastMsg?.text || (lastMsg?.kind === 'image' ? '📷 Photo' : lastMsg?.kind === 'audio' ? '🎤 Voice note' : 'Chat connected')}
                          </span>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {isMuted && <BellOff size={14} color="var(--text-secondary)" />}
                      {isPinned && <Pin size={14} color="var(--text-secondary)" />}
                      {(conn.unreadCount || 0) > 0 ? (
                        <div className="wa-unread-badge">{conn.unreadCount}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Context Menu for item */}
                {contextMenuConnectionId === conn.connectionId && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '36px',
                      right: '16px',
                      backgroundColor: 'var(--bg-header)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-md)',
                      border: '1px solid var(--border-color)',
                      zIndex: 75,
                      minWidth: '150px',
                      padding: '4px 0'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      onClick={() => { onTogglePin(conn.connectionId); setContextMenuConnectionId(null); }}
                      style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {isPinned ? 'Unpin chat' : 'Pin chat'}
                    </div>

                    <div
                      onClick={() => { onToggleMute(conn.connectionId); setContextMenuConnectionId(null); }}
                      style={{ padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {isMuted ? 'Unmute notifications' : 'Mute notifications'}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
