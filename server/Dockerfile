# Anivi realtime server.
#
# Two stages so the deployed image is a few MB: build with the Go toolchain,
# ship a static binary on a minimal base.

FROM golang:1.24-alpine AS build
WORKDIR /src

# Dependencies first, so a code-only change reuses the module cache.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/anivi-server .

FROM alpine:3.20
# WebSocket over TLS terminates at the platform's proxy, but outbound TLS and
# correct time still need these.
RUN apk add --no-cache ca-certificates tzdata && adduser -D -u 10001 anivi
USER anivi
COPY --from=build /out/anivi-server /usr/local/bin/anivi-server

ENV PORT=8080
EXPOSE 8080
CMD ["anivi-server"]
