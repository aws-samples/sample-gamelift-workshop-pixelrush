---
title: "Fleet Anatomy (read while waiting)"
weight: 32
---

While the fleet activates, let's read the configuration that's being applied.
Open **`infra/lib/gamelift-stack.ts`** and find the `Ec2Fleet` definition.

## Runtime configuration — what runs on each instance

```typescript
const SESSIONS_PER_INSTANCE = 2;
const GAME_PORT_BASE = 8443;      // 8443, 8444 — one port per process
runtimeConfiguration: {
  gameSessionActivationTimeoutSeconds: 300,
  serverProcesses: gamePorts.map((port) => ({
    launchPath: '/local/game/pixelrush-server',
    parameters: launchParams(port),   // --port <port> --api-url ... --log ...
    concurrentExecutions: 1,
  })),
},
```

Our server hosts **one game session per process**, so each instance runs two
processes on two ports → two concurrent races per instance. Density is the main
cost lever in production: the more sessions you pack onto one instance, the
fewer instances you pay for — big studios run dozens of processes on a single
instance. We keep it at two here because 8443/8444 are among the few high ports
that reliably survive egress-filtered corporate networks. `launchPath` always starts with
`/local/game/` — that's where Amazon GameLift Servers unpacks your build.

## Ports — how players get in

```typescript
ec2InboundPermissions: [
  { fromPort: 8443, toPort: 8444, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  { fromPort: 8443, toPort: 8444, ipRange: '0.0.0.0/0', protocol: 'UDP' },
],
```

TCP carries the browser WebSocket; UDP carries the WebRTC unreliable data
channel on the same port numbers.

Game clients connect **directly to the instance** (that's the low-latency
design of GameLift) — so the game ports must be opened explicitly. Only listed
ports are reachable; everything else is closed.

{{% notice warning %}}
`0.0.0.0/0` means any host on the internet can reach those two ports. That is
inherent to the direct-connect model: each player is handed a per-session IP and
port and connects straight to the instance, so the source addresses cannot be
known in advance — and `ec2InboundPermissions` accepts CIDR ranges only, not
prefix lists or security-group references.

What actually guards a session is **authorization, not the network ACL**: every
connecting client must present a `PlayerSessionId` that the server hands to
GameLift via `AcceptPlayerSession` (the code you read on the previous page), so
an unmatched player is rejected even though the port is open.

For production, add network-layer DDoS protection (AWS Shield Advanced) for the
game ports, keep the port range no wider than your process density needs, and
restrict to known CIDRs only where your player population makes that feasible.
See the [Well-Architected Security Pillar guidance on protecting networks](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-networks.html).
{{% /notice %}}

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
optional Appendix B adds a remote location — *without touching the game
code*.

In this module the backend places sessions **directly** on this fleet
(`CreateGameSession` / `CreatePlayerSession`) with no rules — the simplest way
to get two players into the same race. In Module 4, FlexMatch will sit in front
of this same queue and decide *who* shares a session.

## Fleet lifecycle states

Your deploy is walking through these right now:

```
NEW → DOWNLOADING → VALIDATING → BUILDING → ACTIVATING → ACTIVE
       (build)      (install.sh)  (runtime)   (processes    (ready for
                                               health-check)  sessions)
```

Head back to the terminal — once `cdk deploy` returns, continue to the next page.
