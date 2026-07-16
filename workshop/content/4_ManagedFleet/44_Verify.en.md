---
title: "Verify & Race"
weight: 44
---

## Read the fleet's own story

Console → **Amazon GameLift Servers → Fleets → PixelRushFleet** → **Events** tab.
You can replay the whole activation as a timeline:

```
FLEET_CREATED
FLEET_STATE_DOWNLOADING          ← pulling your build from S3
FLEET_CREATION_RUNNING_INSTALLER ← install.sh executed
FLEET_STATE_VALIDATING
FLEET_CREATION_VALIDATING_RUNTIME_CONFIG
FLEET_STATE_BUILDING
FLEET_STATE_ACTIVATING           ← processes launched, health checks passing
FLEET_STATE_ACTIVE               ← ready to host
```

{{% notice tip %}}
This Events tab is your first stop whenever a fleet misbehaves — a crashing
server binary shows up here as `SERVER_PROCESS_CRASHED` or
`SERVER_PROCESS_SDK_INITIALIZATION_TIMEOUT` with a per-event explanation.
{{% /notice %}}

## Explore the other tabs

- **Compute**: one c5.large instance, its public IP and location
- **Metrics**: available/active game sessions, healthy processes — the numbers
  autoscaling policies act on
- **Game sessions**: empty right now — no one has raced yet.

## Point the frontend at the managed fleet

The `-c stage=ec2` deploy also reconfigured the backend to **place players
directly on this fleet** (no matchmaking rules yet). Redeploy the frontend so
it picks up the updated backend:

```bash
(cd ../frontend && npm run build)
npx cdk deploy PixelRushFrontendStack --require-approval never
```

Expected output — the deploy ends with the stack's outputs:

```
✅  PixelRushFrontendStack

Outputs:
PixelRushFrontendStack.SiteUrl = https://dxxxxxxxxxxxxx.cloudfront.net
Stack ARN: arn:aws:cloudformation:us-east-1:123456789012:stack/PixelRushFrontendStack/...
```

{{% notice info %}}
This redeploy updates a CloudFront distribution, so the change takes **5–10
minutes** to propagate to all edge locations. Right after the command returns
you may still be served the old cached page — wait a few minutes and hard-refresh
before racing.
{{% /notice %}}

The unified frontend itself needs no change — it still calls your same API,
which now routes races to the managed fleet instead of Anywhere.

## Race for real ★

This is the moment the game becomes truly multiplayer:

1. Open your **SiteUrl** and log in (racer name + `gamelift`)
2. **RACE** → pick a track → **2P**
3. Open a **second browser tab**, log in with a *different* racer name, and
   pick **the same track → 2P**
4. Both tabs land in the **same race** on your managed fleet — countdown, then
   go. No certificate warnings this time: the fleet has a GameLift-issued TLS
   cert, so the client's `wss://` connection is trusted automatically.

Behind the scenes for each request the backend calls `SearchGameSessions` on
your fleet: the first player's track has no open session, so it
`CreateGameSession`; the second player matches that session and joins it. No
rules — just "same track, share a session".

## Checkpoint ★

- Fleet status **ACTIVE**, Compute tab lists one active instance
- Two browser tabs completed a race against each other
- Console → **Game sessions** tab shows an `ACTIVE` (or recently `TERMINATED`)
  session with 2 player sessions

{{% notice info %}}
Notice what's *missing*: there are no rules about who you race. Pick different
tracks in the two tabs and they won't meet; there's no level balancing, no
team sizing, no latency-based region choice. Adding all of that — cleanly, in
front of this same fleet — is Module 5.
{{% /notice %}}
