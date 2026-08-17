// Package pairing generates the identifiers Anivi hands out.
//
// Two of them are public and meant to be read aloud or pasted into a message:
// an Anivi Code names a person, a Love Code named the old two-person room. Both
// have to be short enough to type from a screenshot and random enough that they
// cannot be guessed, because holding one is what lets you reach someone.
//
// The rest — user, room, connection, stroke ids — are internal. A user id in
// particular is the bearer token for that account, so it is never shown to
// anyone but its owner.
package pairing

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// codeAlphabet omits characters that are easy to misread when someone types the
// code from a screenshot: 0/O, 1/I/L, 5/S, 8/B.
const codeAlphabet = "ACDEFGHJKMNPQRTUVWXYZ2346789"

const codeLength = 5

// Code prefixes. ANV- names a person; LOVE- named a room in the pairing-only
// model that came before accounts.
const (
	aniviPrefix = "ANV"
	lovePrefix  = "LOVE"
)

// AniviCode returns a personal code in the form ANV-XXXXX. It is the only
// identifier a user shares, and it is what everyone else connects to them with.
func AniviCode() string { return code(aniviPrefix) }

// LoveCode returns a code in the form LOVE-XXXXX.
func LoveCode() string { return code(lovePrefix) }

// NormalizeAniviCode makes typed input comparable: it uppercases, strips spaces
// and separators, and re-adds the ANV- prefix if only the five significant
// characters were typed. It returns "" when the input cannot be a code.
func NormalizeAniviCode(in string) string { return normalize(in, aniviPrefix) }

// NormalizeLoveCode is NormalizeAniviCode for the older LOVE- codes.
func NormalizeLoveCode(in string) string { return normalize(in, lovePrefix) }

func code(prefix string) string {
	var sb strings.Builder
	sb.WriteString(prefix)
	sb.WriteByte('-')
	for i := 0; i < codeLength; i++ {
		sb.WriteByte(codeAlphabet[randIndex(len(codeAlphabet))])
	}
	return sb.String()
}

func normalize(in, prefix string) string {
	s := strings.ToUpper(in)
	s = strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, s)
	s = strings.TrimPrefix(s, prefix)
	if len(s) != codeLength {
		return ""
	}
	// Reject characters the generator never emits, so a typo lands on "that
	// code doesn't look right" instead of a lookup that can only miss.
	for i := 0; i < len(s); i++ {
		if !strings.ContainsRune(codeAlphabet, rune(s[i])) {
			return ""
		}
	}
	return prefix + "-" + s
}

// RoomID returns an unguessable room identifier.
func RoomID() string { return "room_" + token(16) }

// UserID returns an unguessable account identifier. It doubles as that
// account's bearer token, so it is never handed to anyone else.
func UserID() string { return "user_" + token(16) }

// ConnectionID returns an identifier for one relationship between two people.
func ConnectionID() string { return "conn_" + token(16) }

// StrokeID returns an identifier for a single drawing stroke.
func StrokeID() string { return "stroke_" + token(10) }

const tokenAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789"

func token(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = tokenAlphabet[randIndex(len(tokenAlphabet))]
	}
	return string(b)
}

func randIndex(n int) int {
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		// crypto/rand failing is unrecoverable; panicking beats handing out a
		// predictable code.
		panic("anivi: secure randomness unavailable: " + err.Error())
	}
	return int(v.Int64())
}

// SignInPin returns the private half of signing in on a new device.
//
// Six characters from the same unambiguous alphabet as the codes: long enough
// that guessing it is hopeless next to the rate limit, short enough to write
// down once and type on a phone.
func SignInPin() string {
	var sb strings.Builder
	for i := 0; i < 6; i++ {
		sb.WriteByte(codeAlphabet[randIndex(len(codeAlphabet))])
	}
	return sb.String()
}
