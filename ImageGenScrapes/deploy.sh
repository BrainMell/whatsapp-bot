#!/bin/bash

# Build script for local testing or manual deployment

echo "📦 Building Go Image Service..."

# Ensure we are in the right directory
cd "$(dirname "$0")"

# Tidy modules
go mod tidy

# Build binary
go build -o image-service .

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "🚀 Run with: ./image-service"
else
    echo "❌ Build failed."
    exit 1
fi
