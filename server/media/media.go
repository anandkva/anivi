// Package media stores chat attachments in S3.
//
// The bucket stays private. Uploads go through this server so the credentials
// never reach a browser and every file is validated before it lands; reads go
// through a short-lived presigned URL that the server mints on demand, which
// is why a photo shared months ago still opens.
package media

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// ErrUnsupportedType is returned for anything that is not an allowed image.
var ErrUnsupportedType = errors.New("media: only JPEG, PNG, WebP and GIF images are supported")

// MaxUploadBytes caps a single attachment. Phone photos are routinely 3-6 MB.
const MaxUploadBytes = 10 << 20 // 10 MB

// presignTTL is how long a generated read link stays valid. Short, because a
// fresh one is minted every time a message is opened.
const presignTTL = 6 * time.Hour

// allowedTypes maps the sniffed content type to a file extension. Only images
// are accepted for now — the format is deliberately narrow.
var allowedTypes = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/gif":  ".gif",
}

// Store uploads and serves attachments.
type Store struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
	// publicBaseURL, when set, is used instead of presigning — for a bucket
	// fronted by CloudFront or made public on purpose.
	publicBaseURL string
}

// Config describes the bucket to use.
type Config struct {
	Region        string
	Bucket        string
	AccessKey     string
	SecretKey     string
	PublicBaseURL string
}

// New builds a media store from static credentials.
func New(ctx context.Context, cfg Config) (*Store, error) {
	if cfg.Bucket == "" || cfg.Region == "" {
		return nil, errors.New("media: bucket and region are required")
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("media: aws config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg)
	return &Store{
		client:        client,
		presigner:     s3.NewPresignClient(client),
		bucket:        cfg.Bucket,
		publicBaseURL: strings.TrimRight(cfg.PublicBaseURL, "/"),
	}, nil
}

// Upload validates and stores one image, returning its object key.
//
// The declared content type is not trusted: the bytes are sniffed, because a
// client can claim anything.
func (s *Store) Upload(ctx context.Context, roomID, filename string, r io.Reader) (key, mime string, size int64, err error) {
	// Read one byte past the limit so an oversized file is caught rather than
	// silently truncated.
	buf, err := io.ReadAll(io.LimitReader(r, MaxUploadBytes+1))
	if err != nil {
		return "", "", 0, fmt.Errorf("media: read upload: %w", err)
	}

	mime, ext, err := inspect(buf)
	if err != nil {
		return "", "", 0, err
	}

	key = path.Join("rooms", roomID, fmt.Sprintf("%d-%s%s", time.Now().UnixMilli(), safeName(filename), ext))
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(buf),
		ContentType: aws.String(mime),
		// Attachments are private to the couple; reads happen through
		// presigned links.
		CacheControl: aws.String("private, max-age=31536000"),
	})
	if err != nil {
		return "", "", 0, fmt.Errorf("media: put object: %w", err)
	}
	return key, mime, int64(len(buf)), nil
}

// URL returns a link a browser can load for this key.
func (s *Store) URL(ctx context.Context, key string) (string, error) {
	if s.publicBaseURL != "" {
		return s.publicBaseURL + "/" + key, nil
	}
	req, err := s.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(presignTTL))
	if err != nil {
		return "", fmt.Errorf("media: presign: %w", err)
	}
	return req.URL, nil
}

// inspect decides whether these bytes may be stored, and as what.
//
// The client's declared content type is ignored entirely: it can claim
// anything, so the bytes themselves are sniffed.
func inspect(buf []byte) (mime, ext string, err error) {
	if len(buf) == 0 {
		return "", "", errors.New("media: empty upload")
	}
	if len(buf) > MaxUploadBytes {
		return "", "", fmt.Errorf("media: image is larger than %d MB", MaxUploadBytes>>20)
	}
	mime = http.DetectContentType(buf)
	ext, ok := allowedTypes[mime]
	if !ok {
		return "", "", ErrUnsupportedType
	}
	return mime, ext, nil
}

// safeName reduces a client-supplied filename to something harmless: the key
// is built by the server, and this only survives as a readable hint.
func safeName(name string) string {
	name = path.Base(strings.TrimSpace(name))
	name = strings.TrimSuffix(name, path.Ext(name))
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r >= 'A' && r <= 'Z':
			b.WriteRune(r + 32)
		case r == '-' || r == '_':
			b.WriteRune(r)
		}
		if b.Len() >= 32 {
			break
		}
	}
	if b.Len() == 0 {
		return "image"
	}
	return b.String()
}
