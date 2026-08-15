// Package pairing generates the private identifiers Anivi hands to a couple.
//
// There are no accounts in Anivi: a room is reachable only by its Love Code,
// so the code has to be short enough to read out loud but random enough that
// it cannot be guessed.
package pairing

import (
	"crypto/rand"
	"math/big"
	"strings"
)

// codeAlphabet omits characters that are easy to misread when a partner types
// the code from a screenshot: 0/O, 1/I/L, 5/S, 8/B.
const codeAlphabet = "ACDEFGHJKMNPQRTUVWXYZ2346789"

const codeLength = 5

// LoveCode returns a code in the form LOVE-XXXXX.
func LoveCode() string {
	var sb strings.Builder
	sb.WriteString("LOVE-")
	for i := 0; i < codeLength; i++ {
		sb.WriteByte(codeAlphabet[randIndex(len(codeAlphabet))])
	}
	return sb.String()
}

// NormalizeLoveCode makes user input comparable: it uppercases, strips spaces
// and separators, and re-adds the LOVE- prefix if the partner typed only the
// five significant characters.
func NormalizeLoveCode(in string) string {
	s := strings.ToUpper(in)
	s = strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return -1
	}, s)
	s = strings.TrimPrefix(s, "LOVE")
	if len(s) != codeLength {
		return ""
	}
	return "LOVE-" + s
}

// RoomID returns an unguessable room identifier.
func RoomID() string { return "room_" + token(16) }

// UserID returns an unguessable per-device identifier.
func UserID() string { return "user_" + token(12) }

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
		// predictable Love Code.
		panic("anivi: secure randomness unavailable: " + err.Error())
	}
	return int(v.Int64())
}
