---
title: "Why Game Servers"
weight: 11
---

## Why not just an API: a match needs a long-lived, stateful, authoritative process

A typical web backend is **stateless request/response**: the client asks, Lambda
answers, nobody remembers anything between calls. That model powers most of Pixel
Rush — login, the car shop, leaderboards are all API Gateway + Lambda + DynamoDB.

A **race in progress** is different in three fundamental ways:

| Requirement | Web API model | Game server model |
|---|---|---|
| State | stateless per request | 8 cars' positions, items, collisions held **in memory** |
| Cadence | client-initiated | server-driven **tick loop** (20 updates/sec, every ~50 ms) |
| Authority | validation per call | one process is the **referee** — it simulates physics and decides who wins, so nobody can cheat |

All three point to the same conclusion: a multiplayer session needs one process that
is **long-lived** (it spans the whole match, not a single request), **stateful** (the
live world lives in its memory), and **authoritative** (the single referee whose word
is final) — with every player connected to it at once. That process is the *dedicated
game server*, and deploying and operating it is what this workshop is about.

## The operational problem

Running one game server process is easy. Running a game is not:

- A game session lives minutes, then the process should be recycled — **who starts
  and stops thousands of processes?**
- Players arrive in waves — **who scales the machines?**
- Players are worldwide — **who places each match on the right machine, in the right
  region?**
- Matchmaking needs to find opponents *and* reserve server capacity **atomically**.

This orchestration layer is exactly what **Amazon GameLift Servers** provides. You
bring the game server binary; GameLift runs the machinery around it.

:::alert{type=success}
Analogy: GameLift is to game servers what a container orchestrator is to
containers — but purpose-built for the session-based, latency-sensitive,
bursty lifecycle of multiplayer games.
:::
