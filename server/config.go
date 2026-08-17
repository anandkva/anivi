package main

import (
	"bufio"
	"log"
	"os"
	"strings"
)

// Config is everything the server reads from the environment.
//
// Nothing here has a production default: credentials come from the process
// environment (Render's dashboard) or from a local, git-ignored .env file.
type Config struct {
	Port           string
	AllowedOrigins []string

	// MongoURI enables chat history and room persistence. Empty means the
	// server runs exactly as before, in memory only.
	MongoURI string
	MongoDB  string

	// MessageKey (base64, 32 bytes) encrypts message content at rest, so a
	// database dump does not read as a transcript. Empty stores plaintext.
	MessageKey string

	// VAPID keys enable Web Push. Without them the app still works; it just
	// cannot reach a phone whose app is closed.
	VAPIDPublic  string
	VAPIDPrivate string
	VAPIDSubject string

	// S3 enables image attachments. Empty means attachments are refused with a
	// clear message rather than failing halfway through an upload.
	AWSRegion    string
	AWSBucket    string
	AWSAccessKey string
	AWSSecretKey string
	// AWSPublicBaseURL is optional: set it if the bucket is served through
	// CloudFront or a public URL. Otherwise attachments are served through
	// this server with short-lived presigned links.
	AWSPublicBaseURL string
}

func loadConfig() Config {
	loadDotEnv(".env")

	c := Config{
		Port:             env("PORT", "8080"),
		AllowedOrigins:   parseOrigins(env("ANIVI_ALLOWED_ORIGINS", "*")),
		MongoURI:         os.Getenv("MONGODB_URI"),
		MessageKey:       os.Getenv("ANIVI_MESSAGE_KEY"),
		VAPIDPublic:      os.Getenv("ANIVI_VAPID_PUBLIC_KEY"),
		VAPIDPrivate:     os.Getenv("ANIVI_VAPID_PRIVATE_KEY"),
		VAPIDSubject:     os.Getenv("ANIVI_VAPID_SUBJECT"),
		MongoDB:          env("MONGODB_DATABASE", "anivi"),
		AWSRegion:        os.Getenv("AWS_REGION"),
		AWSBucket:        os.Getenv("AWS_BUCKET_NAME"),
		AWSAccessKey:     os.Getenv("AWS_ACCESS_KEY_ID"),
		AWSSecretKey:     os.Getenv("AWS_SECRET_ACCESS_KEY"),
		AWSPublicBaseURL: strings.TrimRight(os.Getenv("AWS_PUBLIC_BASE_URL"), "/"),
	}
	return c
}

// StorageEnabled reports whether chat history can be persisted.
func (c Config) StorageEnabled() bool { return c.MongoURI != "" }

// PushEnabled reports whether notifications can be delivered.
func (c Config) PushEnabled() bool { return c.VAPIDPublic != "" && c.VAPIDPrivate != "" }

// MediaEnabled reports whether image attachments can be accepted.
func (c Config) MediaEnabled() bool {
	return c.AWSBucket != "" && c.AWSRegion != "" && c.AWSAccessKey != "" && c.AWSSecretKey != ""
}

// loadDotEnv reads KEY=VALUE lines from a local file for development.
// Values already present in the environment win, so a deployed server is
// never overridden by a stray file.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // no .env is the normal case in production
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		// Strip optional surrounding quotes.
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("anivi: reading %s: %v", path, err)
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		out = append(out, "*")
	}
	return out
}
