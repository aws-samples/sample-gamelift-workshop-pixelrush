---
title: "What is Anywhere?"
weight: 31
---

## Bring your own compute

A GameLift fleet normally means *AWS-managed EC2 instances*. **GameLift Anywhere**
flips that: **you** provide the machines (laptop, on-prem server, any VM), register
them as fleet *computes*, and GameLift provides everything else — session placement,
matchmaking integration, player session validation.

```
 Managed fleet:   GameLift owns machines + orchestration
 Anywhere fleet:  YOU own machines,  GameLift owns orchestration
```

## Why it matters

| Use case | How Anywhere helps |
|---|---|
| **Development iteration** | Change server code → restart the local process → test in seconds. No build upload, no 15-minute fleet activation. *(This is what we do today.)* |
| **Hybrid hosting** | Keep existing on-prem/bare-metal capacity while using GameLift's matchmaking and placement across both. |
| **Special hardware** | Host on machines GameLift doesn't offer. |

## The registration handshake

Three API calls turn a machine into fleet compute:

1. `CreateLocation` — a custom location label (e.g. `custom-pixelrush-dev`),
   done once by our CDK stack
2. `RegisterCompute` — "this IP is a compute in the fleet"
3. `GetComputeAuthToken` — a short-lived (~15 min) credential the **server
   process** uses when calling `InitSDK`

After that, the process behaves identically to one on a managed fleet: same
`ProcessReady`, same `OnStartGameSession`, same everything. That symmetry is
the point — code you verify on Anywhere today ships unchanged to managed EC2
in Module 4.

:::alert{type=success}
Which machine is "yours" today? **Own-account path**: your laptop (the game
client connects to `127.0.0.1`). **AWS-event path**: your cloud development
machine (its security group already allows the game port).
:::
