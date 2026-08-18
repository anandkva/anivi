import React, { useState } from 'react';
import { Search, Smile, Heart, Coffee, Activity, Sparkles } from 'lucide-react';
import { STICKERS } from '../lib/stickers';

interface EmojiPickerModalProps {
  onSelectEmoji: (emoji: string) => void;
  onSelectSticker?: (stickerId: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
      '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
      '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥',
      '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤥', '😶', '😐'
    ],
  },
  {
    id: 'gestures',
    name: 'People & Gestures',
    icon: Sparkles,
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜',
      '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳',
      '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀'
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Love',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '✨', '⭐', '🌟'
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    icon: Coffee,
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥑', '🍆',
      '🥦', '🌽', '🌶️', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯',
      '🍿', '🍜', '🍣', '🍦', '🍧', '🎂', '🍰', '🧁', '🍫', '☕'
    ],
  },
  {
    id: 'symbols',
    name: 'Activities & Symbols',
    icon: Activity,
    emojis: [
      '🔥', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '⚽', '🏀', '🏈',
      '🎾', '🏐', '🎮', '🎯', '🎲', '🎨', '🎬', '🎤', '🎧', '🎸',
      '💡', '⏰', '🚀', '✈️', '🏝️', '🏖️', '💯', '✅', '❌', '⚠️'
    ],
  },
];

export const EmojiPickerModal: React.FC<EmojiPickerModalProps> = ({
  onSelectEmoji,
  onSelectSticker,
}) => {
  const [activeTab, setActiveTab] = useState<'emojis' | 'stickers'>('emojis');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('smileys');

  const filteredCategories = EMOJI_CATEGORIES.map((cat) => ({
    ...cat,
    emojis: searchQuery
      ? cat.emojis.filter(() => true)
      : cat.emojis,
  }));

  return (
    <div style={{
      position: 'absolute',
      bottom: '70px',
      left: '16px',
      width: '340px',
      height: '380px',
      backgroundColor: 'var(--bg-header)',
      borderRadius: '12px',
      boxShadow: 'var(--shadow-lg)',
      border: '1px solid var(--border-color)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px 0',
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-panel)'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setActiveTab('emojis')}
            style={{
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'emojis' ? '2.5px solid var(--accent-green)' : '2.5px solid transparent',
              color: activeTab === 'emojis' ? 'var(--accent-green)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Emojis
          </button>
          {onSelectSticker && (
            <button
              onClick={() => setActiveTab('stickers')}
              style={{
                padding: '8px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'stickers' ? '2.5px solid var(--accent-green)' : '2.5px solid transparent',
                color: activeTab === 'stickers' ? 'var(--accent-green)' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Stickers
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'var(--bg-input)',
          borderRadius: '8px',
          padding: '6px 10px'
        }}>
          <Search size={16} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder={activeTab === 'emojis' ? 'Search emoji...' : 'Search sticker...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '13px',
              width: '100%'
            }}
          />
        </div>
      </div>

      {/* Content Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {activeTab === 'emojis' ? (
          <div>
            {filteredCategories.map((cat) => (
              <div key={cat.id} style={{ marginBottom: '16px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                  marginBottom: '8px'
                }}>
                  {cat.name}
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '4px'
                }}>
                  {cat.emojis.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => onSelectEmoji(emoji)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontSize: '22px',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.1s, background-color 0.1s'
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {STICKERS.map((sticker) => (
              <button
                key={sticker.id}
                onClick={() => onSelectSticker?.(sticker.id)}
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  transition: 'transform 0.1s, border-color 0.1s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = 'var(--accent-green)')}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = 'var(--border-color)')}
              >
                <div style={{ fontSize: '32px' }}>{sticker.art}</div>
                <div>{sticker.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Category Icons Bottom Bar */}
      {activeTab === 'emojis' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '6px',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-panel)'
        }}>
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: activeCategory === cat.id ? 'var(--accent-green)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px'
                }}
                title={cat.name}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
