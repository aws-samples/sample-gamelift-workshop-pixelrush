#!/usr/bin/env bash
# Cross-compiles the game server for GameLift managed EC2 (Amazon Linux 2023,
# x86_64) and stages the build directory that CDK uploads as a CfnBuild asset.
set -euo pipefail

cd "$(dirname "$0")/../server"
OUT=dist/linux
rm -rf "$OUT"
mkdir -p "$OUT"

echo "building linux/amd64 binary..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$OUT/pixelrush-server" .

# install.sh runs once when GameLift deploys the build to an instance.
cat > "$OUT/install.sh" << 'EOF'
#!/bin/bash
# Runs as root at deploy time; the server process runs as a non-root user,
# so the logs dir must be writable by everyone.
chmod +x /local/game/pixelrush-server
mkdir -p /local/game/logs
chmod 777 /local/game/logs
EOF
chmod +x "$OUT/install.sh" "$OUT/pixelrush-server"

echo "staged $(du -sh "$OUT" | cut -f1) in server/$OUT:"
ls -la "$OUT"
