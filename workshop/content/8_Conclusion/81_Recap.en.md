---
title: "What You Learned"
weight: 81
---

## Module ↔ capability ↔ what you did

| Module | GameLift capability | What you actually did |
|---|---|---|
| 1 | Dedicated game servers, component model | Built the mental map |
| 2 | — (game backend on serverless) | Deployed API + web client with CDK |
| 3 | **GameLift Anywhere**, **Server SDK lifecycle** | Registered your machine as fleet compute; read `InitSDK → ProcessReady → OnStartGameSession → AcceptPlayerSession → ProcessEnding` in real Go code; hosted a session locally |
| 4 | **Builds, managed fleets, queues** | Uploaded a build; deployed an EC2 fleet; read runtime config / ports / TLS; watched fleet events go ACTIVE |
| 5 | **FlexMatch** | Read a rule set line by line (teams, rules, expansions); traced the ticket lifecycle; saw SNS event push; matched onto your own fleet |
| 6 | The full pipeline | Verified your stack via the arena selector; raced everyone on the shared arena |

## The one-diagram takeaway

```
Build ──► Fleet (managed EC2 / Anywhere) ──► server process (Server SDK)
                                                     ▲
Player ──► StartMatchmaking ──► FlexMatch ──► Queue ─┘ (places game session)
   ▲                               │
   └──── SNS ► Lambda ► WebSocket ─┘ (connection info + PlayerSessionId)
```

If you can redraw this from memory, you understand GameLift.
