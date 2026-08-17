package media

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

// The smallest valid PNG: enough for content sniffing to recognise it.
var pngBytes = []byte{
	0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a,
	0, 0, 0, 13, 'I', 'H', 'D', 'R',
	0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
}

func TestInspectAcceptsImagesOnly(t *testing.T) {
	tests := []struct {
		name     string
		body     []byte
		wantMime string
		wantErr  error
	}{
		{name: "png", body: pngBytes, wantMime: "image/png"},
		{name: "jpeg", body: []byte{0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'J', 'F', 'I', 'F'}, wantMime: "image/jpeg"},
		{name: "gif", body: []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00"), wantMime: "image/gif"},
		// A script renamed photo.png must not be stored as an image.
		{name: "html disguised as image", body: []byte("<html><script>alert(1)</script></html>"), wantErr: ErrUnsupportedType},
		{name: "pdf", body: []byte("%PDF-1.7\n%âãÏÓ"), wantErr: ErrUnsupportedType},
		{name: "empty", body: nil, wantErr: errors.New("empty")},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mime, ext, err := inspect(tc.body)
			if tc.wantErr != nil {
				if err == nil {
					t.Fatalf("inspect(%s) = %q, want an error", tc.name, mime)
				}
				return
			}
			if err != nil {
				t.Fatalf("inspect(%s) failed: %v", tc.name, err)
			}
			if mime != tc.wantMime {
				t.Fatalf("mime = %q, want %q", mime, tc.wantMime)
			}
			if ext == "" || !strings.HasPrefix(ext, ".") {
				t.Fatalf("ext = %q, want a dotted extension", ext)
			}
		})
	}
}

func TestInspectRejectsOversizedImages(t *testing.T) {
	huge := append(bytes.Clone(pngBytes), make([]byte, MaxUploadBytes)...)
	if _, _, err := inspect(huge); err == nil {
		t.Fatalf("an image over %d MB should be rejected", MaxUploadBytes>>20)
	}
}

// The object key is built by the server, but the client's filename survives as
// a readable hint — so it must not be able to smuggle path segments into it.
func TestSafeNameCannotEscapeItsFolder(t *testing.T) {
	tests := map[string]string{
		"holiday.jpg":            "holiday",
		"../../../etc/passwd":    "passwd",
		"a/b/c/photo.png":        "photo",
		"  Spaced Name .jpeg":    "spacedname",
		"emoji❤️only.png":        "emojionly",
		"":                       "image",
		"❤️❤️❤️":                 "image",
		strings.Repeat("x", 200): strings.Repeat("x", 32),
	}

	for in, want := range tests {
		got := safeName(in)
		if got != want {
			t.Errorf("safeName(%q) = %q, want %q", in, got, want)
		}
		if strings.ContainsAny(got, "/\\.") {
			t.Errorf("safeName(%q) = %q, which still contains path characters", in, got)
		}
	}
}
