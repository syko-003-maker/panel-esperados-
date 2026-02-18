#!/bin/bash
# Setup Cloudflare tunnel configuration file

set -e

echo "🔧 Setting up Cloudflare Tunnel Configuration"
echo "============================================="

# Check if config file exists
if [ ! -f ".cloudflared-config.yml" ]; then
    echo "❌ .cloudflared-config.yml not found in current directory"
    exit 1
fi

# Create .cloudflared directory if it doesn't exist
cloudflared_dir="$HOME/.cloudflared"
if [ ! -d "$cloudflared_dir" ]; then
    echo "📁 Creating directory: $cloudflared_dir"
    mkdir -p "$cloudflared_dir"
fi

# Copy config file
source=".cloudflared-config.yml"
dest="$cloudflared_dir/config.yml"

echo "📋 Copying config file..."
echo "   From: $source"
echo "   To:   $dest"

cp "$source" "$dest"
echo "✅ Config file copied successfully"

# Verify
if [ -f "$dest" ]; then
    echo "✅ Verification: File exists at $dest"
    echo ""
    echo "📌 Next steps:"
    echo "   1. Run: cloudflared tunnel login"
    echo "   2. Run: npm run start:prod"
else
    echo "❌ Verification failed"
    exit 1
fi

echo ""
echo "✅ Setup complete!"
