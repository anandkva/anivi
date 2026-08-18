import React, { useState } from 'react';
import { X, Search, Calendar } from 'lucide-react';
import type { ChatMessage } from '../lib/protocol';

interface MessageSearchDrawerProps {
  isOpen: boolean;
  messages: ChatMessage[];
  onClose: () => void;
  onSelectMessage: (messageId: string) => void;
}

export const MessageSearchDrawer: React.FC<MessageSearchDrawerProps> = ({
  isOpen,
  messages,
  onClose,
  onSelectMessage,
}) => {
  const [query, setQuery] = useState('');

  const matches = query.trim()
    ? messages.filter((m) => m.text?.toLowerCase().includes(query.toLowerCase().trim()))
    : [];

  return (
    <div className={`wa-drawer ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="wa-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="wa-icon-btn" onClick={onClose} title="Close search">
            <X size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: '16px' }}>Search Messages</span>
        </div>
      </div>

      {/* Search Input Box */}
      <div className="wa-search-box">
        <div className="wa-search-input-wrapper">
          <Search size={18} color="var(--text-secondary)" />
          <input
            type="text"
            className="wa-search-input"
            placeholder="Search in chat..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {query.trim() === '' ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px', fontSize: '14px' }}>
            <Calendar size={36} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
            <div>Search for messages with this contact</div>
          </div>
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '40px', fontSize: '14px' }}>
            No messages found for "{query}"
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600 }}>
              {matches.length} {matches.length === 1 ? 'MESSAGE' : 'MESSAGES'} FOUND
            </div>
            {matches.map((msg) => (
              <div
                key={msg.id}
                onClick={() => onSelectMessage(msg.id)}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-header)',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  border: '1px solid var(--border-color)',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-header)')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {new Date(msg.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
