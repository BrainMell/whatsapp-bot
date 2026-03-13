# Go Image Service - Lightweight with ffmpeg + yt-dlp
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o image-service .

# =============================================================================
# Final Stage - Runtime with ffmpeg + yt-dlp
# =============================================================================
FROM alpine:latest

# Install runtime dependencies + ffmpeg + yt-dlp + python3
# Force update yt-dlp by using a build-time argument
ARG CACHEBUST=1
RUN apk add --no-cache \
    ca-certificates \
    ffmpeg \
    wget \
    python3 \
    py3-pip \
    && pip3 install --no-cache-dir --break-system-packages -U yt-dlp \
    && rm -rf /var/cache/apk/* /root/.cache

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/image-service .

# Copy assets
COPY assets ./assets

# Environment variables
ENV GIN_MODE=release

# Expose port
EXPOSE 7860

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:7860/health || exit 1

# Run the service
CMD ["./image-service"]
