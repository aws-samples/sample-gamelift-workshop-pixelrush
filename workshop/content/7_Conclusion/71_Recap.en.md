---
title: "What You Learned"
weight: 71
---

## Module ↔ capability ↔ what you did

| Module | Amazon GameLift Servers capability | What you actually did |
|---|---|---|
| 1 | Dedicated game servers, component model | Built the mental map |
| 2 | — (game backend on serverless) | Deployed API + web client with CDK |
| 3 | **Builds, managed fleets, queues**, **Server SDK lifecycle** | Uploaded a build; deployed an EC2 fleet; read `InitSDK → ProcessReady → OnStartGameSession → AcceptPlayerSession → ProcessEnding` in real Go code; read runtime config / ports / TLS; watched fleet events go ACTIVE, then raced another player |
| 4 | **FlexMatch** | Read a rule set line by line (teams, rules, expansions); traced the ticket lifecycle; saw SNS event push; matched onto your own fleet |
| 5 | The full pipeline | Verified your stack via the arena selector; raced everyone on the shared arena |
| A *(optional)* | **GameLift Anywhere** | Registered your own machine as fleet compute and hosted a session on it |
| B *(optional)* | **Multi-region fleets** | Added remote locations and latency-based placement to the same queue |

## The one-diagram takeaway

```
Build ──► Fleet (managed EC2 / Anywhere) ──► server process (Server SDK)
                                                     ▲
Player ──► StartMatchmaking ──► FlexMatch ──► Queue ─┘ (places game session)
   ▲                               │
   └──── SNS ► Lambda ► WebSocket ─┘ (connection info + PlayerSessionId)
```

If you can redraw this from memory, you understand GameLift.
