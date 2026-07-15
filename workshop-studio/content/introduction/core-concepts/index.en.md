---
title: "GameLift Core Concepts"
weight: 12
---

## The component map

Everything you deploy today fits on one diagram. Keep it handy — each module of
this workshop lights up one box.

![Amazon GameLift component map](/static/images/gamelift-arch.png)

*(Diagram labels: BUILD ← your binary · FLEET managed-EC2 / Anywhere ← your
laptop · GAME SESSION ← players connect directly · QUEUE places sessions ·
FLEXMATCH = matchmaking configuration + rule set · events flow via SNS to your
Lambda and back to players)*

| Component | One-liner | You'll touch it in |
|---|---|---|
| **Build** | Your uploaded server binary + install script | Module 4 |
| **Fleet (managed EC2)** | AWS-managed instances that run your server processes | Module 4 |
| **Fleet (Anywhere)** | *Your own* hardware registered as fleet compute | Module 3 |
| **Game Session** | One running match on one server process | Modules 3–6 |
| **Game Session Queue** | Picks which fleet/location hosts each new session | Module 4 |
| **FlexMatch** | Groups players by rules, then asks the queue for a session | Module 5 |

## The Server SDK lifecycle

For GameLift to manage your server process, the process must speak the **Server
SDK protocol**. Four callbacks are the whole story:

```
 process start
      │
      ▼
  InitSDK()            "Hello GameLift, I exist"        (connects to the service)
      │
      ▼
  ProcessReady(port)   "I'm healthy and can host on this port"
      │
      ▼   ...waits, possibly for hours...
      │
  OnStartGameSession   "A match was placed on you — activate!"
      │                   └── server calls ActivateGameSession()
      ▼
  players connect ──► AcceptPlayerSession(id)   validates each connecting player
      │
      ▼   ...the race runs...
      │
  ProcessEnding()      "This session is done, recycle me"
      └── process exits; GameLift starts a fresh one
```

You will see these exact calls in the Go code in Module 3 — and the same contract
applies to any engine (Unreal, Unity, custom C++/C#/Go).

:::alert{type=info}
Key insight: GameLift never launches "a game" — it launches **your process** and
communicates through these callbacks. The game logic (racing, physics, items)
is 100% yours; the lifecycle is 100% GameLift's.
:::
