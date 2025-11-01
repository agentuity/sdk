#!/bin/bash

set -e

echo "🔧 Setting up Go-Common crypto interoperability tests..."

# Pull dependencies
go mod tidy

# Build the Go test tool
echo "🔨 Building Go crypto test tool..."
go build -o go-crypto-tool main.go

echo "✅ Setup complete!"
echo ""
echo "Run tests with:"
echo "  bun run test.ts"
