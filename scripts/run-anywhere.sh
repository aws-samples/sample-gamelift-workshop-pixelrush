#!/usr/bin/env bash
# Registers this machine as a GameLift Anywhere compute and runs the game
# server against it. Workshop Part 2.
#
# Usage: ./run-anywhere.sh [port]
set -euo pipefail

PORT="${1:-1935}"
REGION="${AWS_REGION:-$(aws configure get region)}"
COMPUTE_NAME="${COMPUTE_NAME:-$(hostname -s)-dev}"
LOCATION="custom-pixelrush-dev"
IP="${COMPUTE_IP:-127.0.0.1}"

cd "$(dirname "$0")/.."

FLEET_ID=$(aws cloudformation describe-stacks --stack-name PixelRushGameLiftStack \
  --query "Stacks[0].Outputs[?OutputKey=='AnywhereFleetId'].OutputValue" --output text --region "$REGION")
API_URL=$(aws cloudformation describe-stacks --stack-name PixelRushBackendStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text --region "$REGION")

echo "fleet: $FLEET_ID  compute: $COMPUTE_NAME  ip: $IP  port: $PORT"

aws gamelift register-compute --region "$REGION" \
  --compute-name "$COMPUTE_NAME" --fleet-id "$FLEET_ID" \
  --ip-address "$IP" --location "$LOCATION" >/dev/null 2>&1 || echo "(compute already registered)"

WS_URL=$(aws gamelift describe-compute --region "$REGION" \
  --fleet-id "$FLEET_ID" --compute-name "$COMPUTE_NAME" \
  --query "Compute.GameLiftServiceSdkEndpoint" --output text)

AUTH_TOKEN=$(aws gamelift get-compute-auth-token --region "$REGION" \
  --fleet-id "$FLEET_ID" --compute-name "$COMPUTE_NAME" \
  --query "AuthToken" --output text)

# Anywhere is for validating the integration, not production play: the server
# runs plain ws:// and you confirm GameLift orchestration in the console # nosemgrep: detect-insecure-websocket
# (compute registered, session created). Real multiplayer racing is Module 4's
# managed fleet, which gets a trusted GameLift TLS cert for wss://.
echo "starting server (auth token valid ~15 min)..."
cd server
exec go run . \
  --anywhere \
  --websocket-url "$WS_URL" \
  --fleet-id "$FLEET_ID" \
  --host-id "$COMPUTE_NAME" \
  --auth-token "$AUTH_TOKEN" \
  --port "$PORT" \
  --api-url "$API_URL" \
  --results-secret "${RESULTS_SECRET:-pixelrush-workshop-secret}"
