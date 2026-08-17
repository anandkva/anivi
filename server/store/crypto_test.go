package store

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func testCipher(t *testing.T) *Cipher {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("key: %v", err)
	}
	c, err := NewCipher(base64.StdEncoding.EncodeToString(key))
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	return c
}

func TestEncryptRoundTrip(t *testing.T) {
	c := testCipher(t)

	for _, plaintext := range []string{
		"miss you da ❤️",
		"a longer note, with punctuation — and emoji 🤗🙏",
		strings.Repeat("x", 2000),
	} {
		sealed, err := c.Encrypt(plaintext)
		if err != nil {
			t.Fatalf("Encrypt: %v", err)
		}
		// The whole point: what lands in the database must not read as the message.
		if strings.Contains(sealed, plaintext) {
			t.Fatalf("stored value still contains the message: %q", sealed)
		}
		if !Encrypted(sealed) {
			t.Fatalf("stored value is not marked as ciphertext: %q", sealed)
		}

		back, err := c.Decrypt(sealed)
		if err != nil {
			t.Fatalf("Decrypt: %v", err)
		}
		if back != plaintext {
			t.Fatalf("round trip = %q, want %q", back, plaintext)
		}
	}
}

// Two identical messages must not produce identical rows, or the database
// leaks which messages repeat.
func TestEncryptIsNotDeterministic(t *testing.T) {
	c := testCipher(t)
	a, _ := c.Encrypt("good night 🌙")
	b, _ := c.Encrypt("good night 🌙")
	if a == b {
		t.Fatal("the same message encrypted twice produced the same ciphertext")
	}
}

func TestEmptyTextStaysEmpty(t *testing.T) {
	c := testCipher(t)
	sealed, err := c.Encrypt("")
	if err != nil || sealed != "" {
		t.Fatalf("Encrypt(\"\") = %q, %v; want an empty string", sealed, err)
	}
}

// Messages written before encryption was switched on are still readable.
func TestPlaintextIsPassedThrough(t *testing.T) {
	c := testCipher(t)
	got, err := c.Decrypt("an old message, stored in the clear")
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if got != "an old message, stored in the clear" {
		t.Fatalf("got %q, want the original plaintext", got)
	}
}

// GCM authenticates: a row edited in the database must fail rather than
// silently change what someone said.
func TestTamperedCiphertextIsRejected(t *testing.T) {
	c := testCipher(t)
	sealed, _ := c.Encrypt("see you at 8")

	raw := []byte(strings.TrimPrefix(sealed, encPrefix))
	raw[len(raw)-1] ^= 0x01 // flip a bit in the base64 payload
	if _, err := c.Decrypt(encPrefix + string(raw)); err == nil {
		t.Fatal("a tampered row decrypted successfully")
	}
}

func TestWrongKeyCannotRead(t *testing.T) {
	sealed, _ := testCipher(t).Encrypt("private")
	if _, err := testCipher(t).Decrypt(sealed); err == nil {
		t.Fatal("a different key decrypted the message")
	}
}

// A server with no key must not present ciphertext as if it were the message.
func TestMissingKeyReportsRatherThanShowingCiphertext(t *testing.T) {
	sealed, _ := testCipher(t).Encrypt("private")
	var none *Cipher
	if _, err := none.Decrypt(sealed); err == nil {
		t.Fatal("a server without a key claimed to read an encrypted message")
	}
	// And it still passes plaintext through, so an unencrypted deployment works.
	if got, err := none.Decrypt("hello"); err != nil || got != "hello" {
		t.Fatalf("plaintext through a nil cipher = %q, %v", got, err)
	}
}

func TestKeyValidation(t *testing.T) {
	if _, err := NewCipher(""); err != ErrNoKey {
		t.Fatalf("empty key error = %v, want ErrNoKey", err)
	}
	if _, err := NewCipher("not base64!!"); err == nil {
		t.Fatal("a non-base64 key should be rejected")
	}
	if _, err := NewCipher(base64.StdEncoding.EncodeToString(make([]byte, 16))); err == nil {
		t.Fatal("a 16-byte key should be rejected: AES-256 needs 32")
	}
	// A key pasted without padding is still a key.
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("key: %v", err)
	}
	if _, err := NewCipher(base64.RawURLEncoding.EncodeToString(key)); err != nil {
		t.Fatalf("url-safe unpadded key rejected: %v", err)
	}
}
