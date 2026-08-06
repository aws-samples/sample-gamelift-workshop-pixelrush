---
title: "GameLift Integration Overview"
weight: 101
---

A concise cheat sheet for understanding *how the game integrates with GameLift* — methods, flow, deployment, and scripts. Best read after finishing Modules 1–5, to see the whole picture at once.

## 1. The Four Roles

| Role | What it is | Responsibility |
|---|---|---|
| **Frontend** (`frontend/`) | The game client in the player's browser | Capture input, render frames. **Not the game logic** |
| **Backend** (`backend/`) | Always-on business API (Lambda + API Gateway) | Login, start matchmaking, leaderboards, database I/O |
| **Game server** (`server/`) | A Go process running on GameLift compute | Authoritative physics sim, referee, state broadcast. **One process per match** |
| **GameLift service** | The AWS cloud control plane | Matchmaking (FlexMatch), create/place sessions, manage processes |

{{% notice note %}}
The game server is a studio-authored **compute node** that merely imports the GameLift SDK as a library. It **never touches a database**; it talks heavily and in real time to the frontend (WebSocket/UDP), and lightly one-way to the backend (one POST of results when a match ends).
{{% /notice %}}

## 2. The GameLift SDK Does Not Do Matchmaking

The matchmaking algorithm runs in the **AWS cloud** (triggered by the backend calling `StartMatchmaking`) — it has nothing to do with the game server process. The **Server SDK only manages the process lifecycle**: register & stand by, receive the match result, validate players, run the match, exit.

All SDK calls live in one file: `server/gamelift/manager.go` (the only place that touches the SDK, keeping the game logic SDK-agnostic).

## 3. SDK Lifecycle Methods

```
Process starts
  InitSDK          open a long-lived WebSocket to GameLift
  ProcessReady     register the process = "I'm idle, ready to host" (register callbacks)
      │
      │ (sits idle, possibly for a long time; heartbeat/health checks flow over this connection)
      ▼
  OnStartGameSession   ← pushed DOWN by GameLift when it places a session; callback fires. Build the Room
  ActivateGameSession  ← "the session is running, let players in"
      │
      │ (players connect one by one)
  AcceptPlayerSession  ← as each player sends join, validate their playerSessionId (RESERVED→ACTIVE)
      │
      ▼ (match ends)
  ProcessEnding + Destroy + os.Exit   process exits; GameLift relaunches a fresh one
```

**Callback vs. direct call**: `OnStartGameSession`, `OnHealthCheck`, `OnProcessTerminate` are all **registered with the SDK** (via `ProcessReady`) and **invoked by the SDK internally when a message arrives from GameLift** — your code never calls them directly.

| Method | Triggered by | Times | Meaning |
|---|---|---|---|
| `InitSDK` / `ProcessReady` | the process itself (at startup) | 1 | connect + stand by |
| `OnStartGameSession` | **GameLift** (placing a session) | once per match | match starts (no players yet) |
| `AcceptPlayerSession` | **the player** (connects, sends join) | once per player | validate & seat |
| `ProcessEnding` | the process itself (match ends) | 1 | go offline, exit |

## 4. Key Concepts

**Cardinality**

```
1 instance (c5.2xlarge)
  └─ 32 processes (one per port, SESSIONS_PER_INSTANCE=32)
       └─ each process : 1 game session (this project: exit after one, strictly 1:1)
            └─ 1 game.Room
                 └─ N player sessions (one per player)
```

**Two independent WebSockets** (don't conflate them)

| | SDK control connection | Game data connection |
|---|---|---|
| Who ↔ Who | process ↔ GameLift service | player ↔ process |
| Purpose | register, place, heartbeat, validate | join / input / state broadcast |
| Library | GameLift SDK | gorilla/websocket |

{{% notice warning %}}
A single player join **uses both connections**: join arrives over the "game connection" → the server asks GameLift to validate the ticket over the "SDK connection" → then replies `joined` over the "game connection".
{{% /notice %}}

**How GameLift knows which processes are idle**: via the SDK long connection plus the signals the process reports, with heartbeat/`OnHealthCheck` weeding out failed processes. Idle = has called ProcessReady + has no current session + healthy. Process state flow:

```
(process starts, InitSDK connects)
      │
 ProcessReady ─────────────▶  ★ ACTIVE / idle   ← eligible for a session
      │                            │
      │                    GameLift places a match
      │                            ▼
      │                       busy (hosting 1 session)
      │                            │
      │                     ProcessEnding + os.Exit
      │                            ▼
      └───────────────────▶  connection drops → GameLift removes the process
                                     │
                            Agent notices the port lost a process (concurrentExecutions:1)
                                     ▼
                            relaunch a fresh process → ProcessReady again → back to the "idle pool"
```

**Authoritative server**: players only upload input (cumulative tap counters + use-item); the server computes positions/collisions/standings and broadcasts them. This prevents cheating and guarantees everyone sees the same world.

## 5. End-to-End Match Flow

### Short version

```
Player clicks "Battle"
  → backend StartMatchmaking (FlexMatch)        [cloud matchmaking begins]
    → GameLift matches enough players, creates a game session
      → picks an idle process, pushes OnStartGameSession   [match starts, empty room]
        → ActivateGameSession
      → connection info (IP:port + playerSessionId) pushed back to the frontend
  → frontend connects to the game server, sends join
    → AcceptPlayerSession validates (per player)          [validate & seat]
  → roster complete / timeout → countdown → race (20Hz broadcast)
  → end → broadcast results + POST to backend → process exits
```

{{% notice tip %}}
When a player "enters the game" on the web page they connect to the **backend** (chat / waiting for a match) — there is no game server assigned to them yet. **Only after matchmaking succeeds does GameLift assign a server**; the frontend then connects to it and sends join — and that join is what triggers `AcceptPlayerSession`.
{{% /notice %}}

### Detailed: from match start to player seated (4 roles + 2 connections)

```
Player browser    Backend (Lambda)     GameLift service      Game server process
(frontend)        (API GW)             (AWS control plane)   (SDK + game.Room)
   │                 │                    │                     │
   │                 │                    │   [long ago: process starts and stands by]
   │                 │                    │◀─── InitSDK (wss) ───┤ open SDK control conn
   │                 │                    │◀─── ProcessReady ────┤ "I'm idle" → idle pool
   │                 │                    │····heartbeat/health (ongoing, over SDK conn)····│
   │                 │                    │                     │ (idle, waiting for work)
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ player clicks "Battle" ══
   │                 │                    │                     │
   ├──click Battle──▶│                    │                     │
   │                 ├─StartMatchmaking──▶│                     │
   │                 │                    │ (match enough: 2/4/8)│
   │                 │                    │ create game session  │
   │                 │                    │ pick an idle process │
   │                 │                    │                     │
   │                 │                    │── OnStartGameSession ▶│ ★once per match, no players yet
   │                 │                    │   (with MatchmakerData)│  ├ parse expected roster + track
   │                 │                    │                     │  ├ NewRoom (empty room)
   │                 │                    │                     │  ├ go room.Run()
   │                 │                    │◀── ActivateGameSession┤  └ "session is running"
   │                 │                    │                     │
   │                 │◀─match success event (IP:port+playerSessionId)│ (pushed GameLift→backend)
   │◀─push conn info─┤ process-matchmaking-events               │
   │  (worldChat WS) │                    │                     │
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ player connects to server ══
   │                 │                    │                     │
   ├──────open [game connection] WebSocket to IP:port─────────────▶│ (gorilla, a different conn)
   ├──────send join {playerSessionId,...}────────────────────────▶│ handleJoin
   │                 │                    │◀ AcceptPlayerSession(psid)  ★once per player
   │                 │                    │   (over SDK conn, ask GameLift to validate)
   │                 │                    │── OK: RESERVED→ACTIVE ─────▶│
   │◀─────joined {yourSlot, roster}──────────────────────────────┤ seated
   │                 │                    │                     │
   │  …other players repeat "connect + join + AcceptPlayerSession"…│
   │                 │                    │                     │ roster complete / timeout
   │◀─────countdown 3,2,1 → race_start ──────────────────────────┤ race starts (20Hz)
   │◀═════ state snapshots (UDP fast path preferred) ════════════│
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ match ends ══
   │◀─────results ───────────────────────────────────────────────┤ finishRace
   │                 │◀─ POST /internal/results (standings)───────┤ (plain HTTP)
   │                 │                    │◀── ProcessEnding ────┤
   │                 │                    │    (conn drops)      ┤ os.Exit(0)
   │                 │                    │ Agent relaunches a process on the same port → ProcessReady → idle pool
```

**5 things to take away from the diagram**

1. **Two connections, two jobs**: the left "SDK control connection" carries register/place/heartbeat/validate; the right "game connection" carries join/state/results.
2. **`ProcessReady` comes before everything**: the process stands by at startup, unrelated to players/matches (possibly long before any).
3. **`OnStartGameSession` first, `AcceptPlayerSession` after**: build the empty room first (GameLift, once), then players connect and validate (players, N times).
4. **A single join uses both connections**: join arrives on the game connection → server validates via the SDK connection → replies over the game connection.
5. **Closing the loop**: `ProcessEnding + os.Exit` → connection drops → GameLift notices → Agent relaunches a fresh process → `ProcessReady` back to the idle pool (use-once-and-discard + auto-refill).

## 6. Two Deployment Modes

| | **Anywhere** (Module 3) | **Managed EC2** (Modules 4/5) |
|---|---|---|
| Compute (the machine running the process) | **your own machine** | GameLift-managed EC2 |
| GameLift service (cloud) | ✅ used as usual | ✅ used as usual |
| Who registers the machine | you run `register-compute` | automatic |
| Who starts the go process | you (script `go run .`) | **GameLift Agent** auto-launches per runtimeConfiguration |
| Source of InitSDK params | command-line flags (from the script) | environment variables (injected by the Agent) |

{{% notice info %}}
Anywhere only lacks the **local Agent** (the script plays its role: register + launch) — **not the cloud GameLift service**. Its purpose is to unpack, by hand, what the Agent does automatically in managed mode, making the chain transparent. The fork in code: `manager.go` — `if m.Anywhere != nil` → use flags; `else` → use environment variables.
{{% /notice %}}

**CDK builds the "empty shell" vs. the script "fills in the compute"**: `gamelift-stack.ts` deploys the cloud logical resources (fleet + queue + matchmaking config). A deployed Anywhere fleet is just an **empty shell** (zero machines in it), because Anywhere's compute is your own machine, which CDK cannot reach — so `run-anywhere.sh` must, at runtime, `register-compute` your machine into it and start the process. Managed EC2 needs no script because its machines are GameLift-managed too.

## 7. Scripts (`scripts/`)

**Workflow shell scripts (the 3 important ones)**

| Script | What it does | Module |
|---|---|---|
| `run-anywhere.sh` | Register this machine as Anywhere compute + start the server | Module 3 |
| `build-server-linux.sh` | Cross-compile the Linux binary + emit install.sh, for CDK to package as a build | Modules 4/5 |
| `install-dev-tools.sh` | Called by the dev machine's UserData; installs Go/Node/CDK/code-server | Environment setup |

**Content generator**

- `gen-track.mjs`: seeded, deterministic track JSON generation (output in `server/game/tracksdata/`).

**Test scripts (the remaining `.mjs`, not used in production)**

- **Headless protocol tests** (connect to the server directly with `ws`): `smoke-client` / `input-isolation` / `rejoin` / `jitter` / `rtc-*`, validating server logic.
- **Browser E2E** (Playwright): `browser-flexmatch` / `browser-lobby` / `browser-login` / `browser-race`, validating the whole site.
- **Screenshot / visual**: `lobby-shot` / `icon-test` / `layout-test` / `track-cards-test`.

## In One Sentence

**The backend starts matchmaking → the cloud GameLift service matches players and places the session on an idle process (`OnStartGameSession`) → players connect and are validated (`AcceptPlayerSession`) → the process authoritatively runs one match → `ProcessEnding` exits and is auto-refilled.** The game server only "computes this one match correctly and fast"; matchmaking, persistence, and scaling are handled by the GameLift service and the backend.
