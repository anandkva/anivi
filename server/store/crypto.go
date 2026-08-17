package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
)

// Message content is encrypted before it reaches MongoDB.
//
// The threat this addresses is a readable database: a leaked dump, a stolen
// backup, a support engineer with Atlas access. None of them should be able to
// read what two people said to each other.
//
// It is *encryption*, not hashing. Hashing is one way — it would keep the
// database unreadable, and the couple's own history with it. Anivi uses
// AES-256-GCM, which also authenticates: a row edited in the database fails to
// decrypt instead of silently changing what someone said.
//
// This is not end-to-end encryption. The server holds the key, because it also
// renders history for a client that has just installed the app on a new phone.
// Moving the key to the devices is the next step up, and it costs multi-device
// key exchange — a real feature, not a flag.

// encPrefix marks a stored value as ciphertext, so plaintext written before
// encryption existed is still readable.
const encPrefix = "enc.v1:"

// ErrNoKey is returned when encryption was requested without a key.
var ErrNoKey = errors.New("store: no message key configured")

// Cipher encrypts and decrypts message content.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher builds a cipher from a base64-encoded 32-byte key.
//
//	openssl rand -base64 32
func NewCipher(encodedKey string) (*Cipher, error) {
	encodedKey = strings.TrimSpace(encodedKey)
	if encodedKey == "" {
		return nil, ErrNoKey
	}

	key, err := decodeKey(encodedKey)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("store: message key must be 32 bytes, got %d", len(key))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("store: message key: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("store: message cipher: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// decodeKey accepts standard or URL-safe base64, with or without padding,
// because a key pasted out of a dashboard is rarely in the form you expect.
func decodeKey(encoded string) ([]byte, error) {
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if key, err := enc.DecodeString(encoded); err == nil {
			return key, nil
		}
	}
	return nil, errors.New("store: message key is not valid base64")
}

// Encrypt returns a self-describing token: the prefix, then base64 of the
// nonce followed by the sealed text. Empty input stays empty — there is
// nothing to hide about a message with no text, and it keeps image-only
// messages from growing a meaningless blob.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	if c == nil || plaintext == "" {
		return plaintext, nil
	}

	nonce := make([]byte, c.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("store: nonce: %w", err)
	}

	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return encPrefix + base64.RawStdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt. Anything without the prefix is returned as-is:
// that is a message stored before encryption was switched on, and refusing to
// show it would lose history that is already readable in the database anyway.
func (c *Cipher) Decrypt(stored string) (string, error) {
	if !strings.HasPrefix(stored, encPrefix) {
		return stored, nil
	}
	if c == nil {
		// The row is encrypted and this process has no key: say so rather than
		// showing the raw token as if it were the message.
		return "", ErrNoKey
	}

	raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(stored, encPrefix))
	if err != nil {
		return "", fmt.Errorf("store: decode ciphertext: %w", err)
	}
	if len(raw) < c.aead.NonceSize() {
		return "", errors.New("store: ciphertext is too short")
	}

	nonce, sealed := raw[:c.aead.NonceSize()], raw[c.aead.NonceSize():]
	plaintext, err := c.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		// Wrong key, or the row was tampered with.
		return "", fmt.Errorf("store: decrypt: %w", err)
	}
	return string(plaintext), nil
}

// Encrypted reports whether a stored value is ciphertext.
func Encrypted(stored string) bool { return strings.HasPrefix(stored, encPrefix) }
