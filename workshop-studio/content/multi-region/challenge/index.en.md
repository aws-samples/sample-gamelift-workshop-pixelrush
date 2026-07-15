---
title: "The Challenge"
weight: 91
---

:::alert{type=warning}
Extra cost: each additional location runs its own c5.large (~$0.085/hour each).
Remember to destroy when done.
:::

## The problem

Your fleet lives in us-east-1. A player in Asia connects across the Pacific:
**200–300 ms RTT** — playable, but noticeably behind a local player. Physical
distance can't be optimized away; the server must move closer.

## Part 1 — add locations to the fleet

A managed fleet can span multiple regions as **locations** — same build, same
runtime config, instances everywhere. By default the fleet runs a single
location (your deploy region); add more with the `extraRegions` context flag —
no code change. Look at how the fleet consumes it in
`infra/lib/gamelift-stack.ts` (the `extraRegions` variable and the
`locations:` array), then deploy with Tokyo + Singapore added:

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack -c stage=ec2-match \
  -c extraRegions=ap-northeast-1,ap-southeast-1 --require-approval never
```

Activating the remote locations takes ~15 minutes. Each extra location runs its
own c5.large.

## Part 2 — how placement picks a region

Locations alone don't route anyone. The **queue** decides placement, and it
routes on latency only if tickets carry it:

1. The game client measures HTTPS round-trip to each region *in the background
   while the player browses the lobby* (see `frontend/src/latency.ts`)
2. `StartMatchmaking` attaches `LatencyInMs: {"us-east-1": 250, "ap-northeast-1": 80, ...}`
   per player (see `backend/src/request-matchmaking.ts`)
3. The queue places each session in the location with the **best overall
   latency for that match's players** — a Tokyo pair lands in Tokyo, a mixed
   US/Asia pair lands wherever the worst-case is smallest

This client → ticket → queue chain is the standard GameLift latency-routing
pattern; our game already implements steps 1–2, so no code changes are needed.

## Verify

1. Wait for all three locations: console → fleet → **Locations** tab, all *Active*
2. Race a 2P match, then check **Game sessions** — the session's **Location**
   column shows where the queue placed you
3. If you're in Asia (or on VPN): expect `ap-northeast-1` or `ap-southeast-1`

## Checkpoint ★

Fleet shows 3 active locations, and a game session's Location matches the
lowest-latency region for its players.

:::alert{type=success}
Cleanup reminder: `npx cdk destroy PixelRushGameLiftStack` now removes
instances in **three** regions — verify all locations are gone in the console.
:::
