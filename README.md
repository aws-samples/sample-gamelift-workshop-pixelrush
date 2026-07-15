> 中文版：[README_CN.md](README_CN.md)

# Pixel Rush — Amazon GameLift Multiplayer Racing Workshop

A top-down pixel racing game (gameplay inspired by the FC classic *Road Fighter*)
that demonstrates the full pipeline of **Amazon GameLift Servers** hosting and
**FlexMatch** matchmaking through a browser client. Supports solo practice
against NPCs and 2/3/4-player multiplayer races.

```
Browser (Phaser 3, served by CloudFront)
 ├── /api/* ──► CloudFront ──► API Gateway + Lambda + DynamoDB   login / garage / shop / tracks / leaderboard
 ├── wss:// ──► API Gateway WebSocket API                        match-result push + world chat
 └── wss:// + WebRTC(UDP) ──► Go game server on a GameLift fleet  real-time racing @ 20Hz

FlexMatch ──► SNS ──► Lambda ──► WebSocket push to waiting players (with debug traces)
Game server ──► POST /internal/results (shared secret) ──► coins / unlocks / leaderboard settlement
```

**Security by design**: CloudFront is the only public entry point — the S3 site
bucket is private (OAC), the HTTP API rejects requests without the
`x-origin-verify` header, and the EC2 fleet opens only two game ports and uses a
GameLift-generated TLS certificate (`wss://`).

## Directory structure

| Directory | Contents |
|---|---|
| `server/` | Go game server — GameLift Server SDK v5, 20Hz authoritative simulation, WebSocket + WebRTC transport |
| `backend/` | TypeScript Lambda — login (8 seeded personas), garage, shop, tracks, leaderboard, FlexMatch pipeline |
| `frontend/` | Phaser 3 + Vite browser client — lobby scenes + race rendering (snapshot interpolation + local prediction) |
| `infra/` | CDK stacks — Backend (API/DDB/SNS/WS), Frontend (CloudFront+S3), GameLift (fleet/queue/FlexMatch), Docs (self-hosted tutorial site) |
| `scripts/` | Build / run / test scripts (`gen-track.mjs` deterministically generates track JSON from a seed) |
| `workshop/` | Tutorial content source (Hugo, bilingual `*.en.md` / `*.zh.md`) + `static/` (images, participant IAM policy, Workshop Studio CFN template); generates the directory below via `scripts/convert-to-workshop-studio.py` |
| `workshop-studio/` | **AWS Workshop Studio native format** generated from `workshop/` (`contentspec.yaml` + `content/<slug>/index.{en,zh-CN}.md`); this is what gets published to catalog.workshops.aws |

## Gameplay at a glance

- **Controls**: left/right arrows (or A/D) to tap-change lanes, **space** to use an item; the car auto-advances
- **Items**: item boxes randomly grant **nitro** (×1.4 speed for 3 s) or a **bomb** (dropped behind you, stuns on hit for 1.2 s); boxes respawn after a few seconds
- **Tracks**: 4 tracks of increasing difficulty (scroll speed 300→570); completing one unlocks the next
- **Modes**: ⚡ Quick Start (pure front-end local sim vs. 1 NPC, instant); 2P/3P/4P multiplayer (FlexMatch; NPCs top up the grid if the field isn't full after 45 s)
- **Economy**: multiplayer awards 200/120/80/50 coins by finishing position, practice 40/25/… (server-side rate-limited to prevent farming); coins buy cars (8 tiers from The Beige Legend to The Money Furnace, priced on a rising scale)
- **Login**: shared password `gamelift`; usernames are unique — the same name reclaims the same persona; a cookie remembers the session
- **Multi-arena**: the login page offers ☁️ AWS ARENA (the official server) or 🔧 MY SERVER (paste your own BackendStack `ApiUrl`; the front end auto-discovers the rest via `/api/info`)

## Network optimizations (designed from real-world pain)

This is the workshop's unique value — the problems real cross-network play exposes, and the fixes:

1. **Port choice**: game ports use **8443 + 2083** (HTTPS-family ports). In practice, user
   networks widely block "gamey" ports like 7777/1935 (symptom: one side stuck forever on
   connecting); GameLift forbids ports ≤1025, so real 443 is unavailable.
2. **UDP transport (WebRTC DataChannel)**: state snapshots and input travel over an
   **unreliable DataChannel** (`ordered:false, maxRetransmits:0` — effectively UDP),
   eliminating the "freeze-jump" stutter caused by TCP head-of-line blocking. Signaling
   reuses the existing WebSocket; when UDP is blocked, it falls back to WS after 8–12 s
   without interrupting the game.
3. **Adaptive interpolation + dead reckoning**: the client dynamically tunes replay delay
   (100→500 ms) by measured jitter; when snapshots stop arriving it extrapolates along the
   last velocity for up to 1.5 s, so bursts don't freeze the screen.
4. **Local prediction**: your own car is rendered entirely locally (moves on keypress, with
   the same lane-change animation curve as the server) and only realigns to the server on
   hard conflicts like a crash or stun — multiplayer feels the same as single-player.
5. **Lossless input protocol**: left/right are reported as **cumulative counters** (each frame
   carries the total; the server consumes the delta), so a dropped frame/packet can never
   mathematically lose a keypress.
6. **Reconnect**: dropping mid-race auto-reconnects; the server reattaches you to your slot by
   `playerId` (the GameLift PlayerSession stays valid), with a 30 s grace period.
7. **Latency-based placement**: the fleet deploys to **us-east-1 / Tokyo / Singapore**
   simultaneously; on entering the lobby the front end probes all regions in parallel in the
   background (cached 10 min) and reports `LatencyInMs` with the match request, so the queue
   places each game in the region with the best overall latency for its players. The world
   chat's cyan debug messages show the latency data and final placement region for each match.

## Prerequisites

- An AWS account + credentials, in a GameLift-supported region (default us-east-1; the
  multi-region fleet also uses Tokyo/Singapore)
- Node 20+, Go 1.26.2+, AWS CLI, CDK v2
- Run `npm i` in each of: `infra/`, `backend/`, `frontend/`

## Part 1 — Backend + Frontend (no GameLift yet)

```bash
cd infra
npx cdk bootstrap          # first CDK use in this account/region
npx cdk deploy PixelRushBackendStack PixelRushFrontendStack
```

Write the output `WsNotifyUrl` into `frontend/public/config.json`:

```json
{ "wsNotifyUrl": "wss://XXXX.execute-api.REGION.amazonaws.com/prod" }
```

Build and publish the site, then open the `SiteUrl`:

```bash
cd frontend && npm run build
cd ../infra && npx cdk deploy PixelRushFrontendStack
```

You can now log in (a new name is randomly assigned one of 8 seeded personas — differing
car and coins), browse the garage, and buy cars; only the first track is unlocked.
Matchmaking is not yet available.

## Part 2 — Run GameLift Anywhere locally

Deploy the GameLift resources (Anywhere fleet + FlexMatch only — fast):

```bash
cd infra && npx cdk deploy PixelRushGameLiftStack
```

Register this machine as Anywhere compute and start the game server:

```bash
./scripts/run-anywhere.sh    # register compute, get auth token, start the server
```

Open **two browser tabs**, log in with two different names, pick the first track → 2P.
FlexMatch pairs the two tickets, WebSocket pushes the game-session address, and both tabs
connect to the server on this machine to race. Results go to the leaderboard; finishing
unlocks the next track.

## Part 3 — Managed EC2 fleet (multi-region)

Build the Linux server and deploy the fleet (all regions active in ~15–20 min). Two stages:

```bash
./scripts/build-server-linux.sh

# Stage 1 — stage=ec2: managed fleet + direct placement (no matchmaking rules): same track shares a session
cd infra && npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2

# Stage 2 — stage=ec2-match: add FlexMatch rule-based matchmaking in front of the same fleet
npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2-match
```

Race — the browser connects to the GameLift-managed instance via `wss://<DnsName>:8443`
(the managed fleet has a trusted GameLift-issued TLS cert, no manual trust needed). In the
`ec2-match` stage, FlexMatch places the session in the lowest-latency region (confirm via
the cyan debug messages in world chat). Console observation points:
*GameLift → Fleets → PixelRushFleet → Game sessions / Events*.

Three `stage` values: unset (Anywhere) / `ec2` (direct placement) / `ec2-match` (FlexMatch).

To add regions beyond the deploy region, pass `-c extraRegions=ap-northeast-1,ap-southeast-1`.

## Part 4 — Cleanup

```bash
cd infra
npx cdk destroy PixelRushGameLiftStack PixelRushFrontendStack PixelRushBackendStack
```

Note: a multi-region fleet keeps one c5.large per region running (~$0.085/hr each), so
destroy it when you're done.

## Design notes and deliberate simplifications

- **No JWT auth** — players are identified by `playerId` + a shared login password. For a
  production pattern, see the CustomIdentityComponent in the guidance repo.
- **No match backfill** (`backfillMode: MANUAL`) — races don't accept late joiners; the
  server tops up an unfilled grid with NPCs.
- **One process per game** — each game's process exits when the race ends and GameLift
  launches a fresh one. Simple, with crash isolation.
- **FlexMatch notifications** go SNS → Lambda → WebSocket push, with a
  `GET /api/matchmaking/status` polling endpoint retained as a debugging fallback.
- **Quick Start is purely local** — a sim isomorphic to the server runs in the browser,
  consuming no fleet resources; rewards are granted via the rate-limited `/api/race-reward`
  endpoint.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Browser can't reach the game server on EC2 | `ec2InboundPermissions` is missing the game ports. Use HTTPS-family ports (8443/2083 TCP+UDP) — user networks widely block ports like 7777; the symptom is one side stuck on connecting. GameLift forbids ports ≤1025 |
| `wss://` fails on the EC2 fleet | The fleet needs `certificateConfiguration: GENERATED`; the client must use `DnsName`, not an IP |
| `SERVER_PROCESS_CRASHED` loop on the fleet | Pull instance logs to debug (`aws gamelift get-compute-access` + SSM). Note: on a managed fleet, `GetComputeCertificate()` returns the certificate **directory** — append `certificate.pem` |
| Matchmaking spins forever | The backend Lambda's `MATCHMAKING_CONFIG_PREFIX` points at the wrong config (Anywhere vs Ec2) |
| Anywhere server exits after ~60 s | Wait timeout with no one joining the game session — by design |
| `run-anywhere.sh` throws an auth error after ~15 min | The compute auth token expired; just re-run the script |
| Calling `execute-api` directly returns 403 | Expected — it needs the `x-origin-verify` header (the front end adds it automatically in multi-arena direct mode) |
| One player's view stutters ("freeze-jump") | Check the F12 console `[net]` logs: WS fallback + adaptive smoothing kick in when UDP is blocked; for cross-ocean games, confirm the session was placed in the Asia-Pacific region |
