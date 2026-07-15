---
title: "Tickets & Events"
weight: 52
---

## The three moving parts

```
 Matchmaking CONFIGURATION  =  rule set  +  queue  +  notification target
        │
        │  StartMatchmaking(configName, players[attributes])
        ▼
      TICKET  ──────────────────────────────► GAME SESSION
        one per request; carries players,        placed via the queue once
        status, and (when done) connection       the match is formed
        info
```

A **matchmaking configuration** ties everything together — our stack creates
one per match size (`PixelRushMatchEc22` = 2-player races on the EC2 queue).

## Ticket lifecycle

Every `StartMatchmaking` call returns a **ticket**. It moves through:

```
 QUEUED → SEARCHING → POTENTIAL_MATCH_CREATED → PLACING → COMPLETED
                          │                                   └─ connection info:
                          │ (acceptance flow, if enabled)         IP/DNS + port +
                          └─ REQUIRES_ACCEPTANCE                  PlayerSessionId
 failure paths: TIMED_OUT · CANCELLED · FAILED
```

`COMPLETED` is the payoff: the ticket now contains **where to connect** (the
game session's address) and a **PlayerSessionId** per player — the entry pass
the server validates via `AcceptPlayerSession` (Module 3).

## How does the player learn the result?

Polling `DescribeMatchmaking` works but doesn't scale. The production pattern —
which our game implements — is **event push**:

```
FlexMatch ──event──► SNS topic ──► Lambda ──► WebSocket push ──► browser
   (every status change)                (process-matchmaking-events.ts)
```

The matchmaking configuration's `notificationTarget` points at an SNS topic;
every ticket status change publishes an event. Our Lambda forwards
`MatchmakingSucceeded` (with connection info) to the waiting player over the
API Gateway WebSocket. Total latency: under a second.

:::alert{type=info}
This SNS-based pattern is AWS's recommended integration for FlexMatch — the
same pipeline scales from our 2-player workshop to millions of tickets.
:::
