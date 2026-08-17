package pairing

import (
	"regexp"
	"strings"
	"testing"
)

var aniviShape = regexp.MustCompile(`^ANV-[ACDEFGHJKMNPQRTUVWXYZ2346789]{5}$`)

func TestAniviCodeShape(t *testing.T) {
	for i := 0; i < 200; i++ {
		got := AniviCode()
		if !aniviShape.MatchString(got) {
			t.Fatalf("AniviCode() = %q, want ANV- plus 5 unambiguous characters", got)
		}
	}
}

// The alphabet exists so a code read off a screenshot cannot be mistyped into
// a different valid code.
func TestCodeAlphabetHasNoLookAlikes(t *testing.T) {
	for _, r := range "OIL SB01" {
		if r == ' ' {
			continue
		}
		if strings.ContainsRune(codeAlphabet, r) {
			t.Errorf("alphabet contains look-alike %q", r)
		}
	}
}

func TestNormalizeAniviCodeAcceptsWhatPeopleActuallyType(t *testing.T) {
	// Not the ANV-8K29P from the design sketch: 8 is a look-alike the alphabet
	// deliberately omits, so a real code cannot contain it.
	want := "ANV-9K29P"
	for _, in := range []string{
		"ANV-9K29P",
		"anv-9k29p",
		"9K29P",
		"9k29p",
		" ANV 9K29P ",
		"ANV_9K29P",
	} {
		if got := NormalizeAniviCode(in); got != want {
			t.Errorf("NormalizeAniviCode(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeAniviCodeRejectsJunk(t *testing.T) {
	for _, in := range []string{
		"",
		"ANV-",
		"ANV-9K29",   // too short
		"ANV-9K29PQ", // too long
		"ANV-9K29O",  // O is not in the alphabet
		"ANV-9K29L",  // L is not in the alphabet
		"LOVE-9K29P", // a room code, not a person
		"!!!!!",      // nothing survives the filter
	} {
		if got := NormalizeAniviCode(in); got != "" {
			t.Errorf("NormalizeAniviCode(%q) = %q, want \"\"", in, got)
		}
	}
}

// A LOVE- code must not normalize into an ANV- code or the old room links
// would silently resolve to a person.
func TestCodeNamespacesDoNotCross(t *testing.T) {
	love := LoveCode()
	if got := NormalizeAniviCode(love); got != "" {
		t.Errorf("NormalizeAniviCode(%q) = %q, want \"\"", love, got)
	}
	anivi := AniviCode()
	if got := NormalizeLoveCode(anivi); got != "" {
		t.Errorf("NormalizeLoveCode(%q) = %q, want \"\"", anivi, got)
	}
}

func TestIdentifiersAreDistinctAndPrefixed(t *testing.T) {
	cases := []struct {
		name   string
		gen    func() string
		prefix string
	}{
		{"RoomID", RoomID, "room_"},
		{"UserID", UserID, "user_"},
		{"ConnectionID", ConnectionID, "conn_"},
		{"StrokeID", StrokeID, "stroke_"},
	}
	for _, tc := range cases {
		seen := make(map[string]bool, 500)
		for i := 0; i < 500; i++ {
			got := tc.gen()
			if !strings.HasPrefix(got, tc.prefix) {
				t.Fatalf("%s() = %q, want prefix %q", tc.name, got, tc.prefix)
			}
			if seen[got] {
				t.Fatalf("%s() returned %q twice in 500 draws", tc.name, got)
			}
			seen[got] = true
		}
	}
}
