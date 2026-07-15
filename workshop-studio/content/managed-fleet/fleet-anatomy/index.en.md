---
title: "Fleet Anatomy (read while waiting)"
weight: 42
---

While the fleet activates, let's read the configuration that's being applied.
Open **`infra/lib/gamelift-stack.ts`** and find the `Ec2Fleet` definition.

## Runtime configuration — what runs on each instance

```typescript
runtimeConfiguration: {
  serverProcesses: [
    { launchPath: '/local/game/pixelrush-server', parameters: '--port 8443 ...', concurrentExecutions: 1 },
    { launchPath: '/local/game/pixelrush-server', parameters: '--port 2083 ...', concurrentExecutions: 1 },
  ],
},
```

Each instance runs **two server processes** on different ports → two concurrent
game sessions per instance. Density is a cost lever: big studios run dozens of
processes per box. `launchPath` always starts with `/local/game/` — that's where
GameLift unpacks your build.

## Ports — how players get in

```typescript
ec2InboundPermissions: [
  { fromPort: 8443, toPort: 8443, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  { fromPort: 2083, toPort: 2083, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  // + the same two ports over UDP
],
```

Game clients connect **directly to the instance** (that's the low-latency
design of GameLift) — so the game ports must be opened explicitly. Only listed
ports are reachable; everything else is closed.

## TLS — browser-friendly connections

```typescript
certificateConfiguration: { certificateType: 'GENERATED' },
```

GameLift can issue a TLS certificate per fleet. Our web client runs on an HTTPS
page, which browsers only allow to open **secure** WebSockets (`wss://`) — the
generated certificate plus the session's DNS name makes that work with zero
certificate management.

## The Queue — who decides where a session goes

```typescript
const ec2Queue = new gamelift.CfnGameSessionQueue(this, 'Ec2Queue', {
  name: 'PixelRushQueue',
  destinations: [ /* this fleet */ ],
});
```

A **queue** scans its destinations (fleets/aliases, possibly across regions)
and places the session on the best one. Today the queue has one destination;
the optional appendix adds Tokyo and Singapore — *without touching the game
code*.

In this module the backend places sessions **directly** on this fleet
(`CreateGameSession` / `CreatePlayerSession`) with no rules — the simplest way
to get two players into the same race. In Module 5, FlexMatch will sit in front
of this same queue and decide *who* shares a session.

## Fleet lifecycle states

Your deploy is walking through these right now:

```
NEW → DOWNLOADING → VALIDATING → BUILDING → ACTIVATING → ACTIVE
       (build)      (install.sh)  (runtime)   (processes    (ready for
                                               health-check)  sessions)
```

Head back to the terminal — once `cdk deploy` returns, continue to the next page.
