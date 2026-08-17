---
title: "What is Anywhere?"
weight: 81
---

## Bring your own compute

An Amazon GameLift Servers fleet normally means *AWS-managed EC2 instances*. **GameLift Anywhere**
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
| **Development iteration** | Change server code → restart the local process → test in seconds. No build upload, no 15-minute fleet activation like the one you waited through in Module 3. |
| **Hybrid hosting** | Keep existing on-prem/bare-metal capacity while using GameLift's matchmaking and placement across both. |
| **Special hardware** | Host on machines GameLift doesn't offer. |

## The registration handshake

Three API calls turn a machine into fleet compute:

1. `CreateLocation` — a custom location label (for example,
   `custom-pixelrush-dev`), done once by our CDK stack
2. `RegisterCompute` — “this IP is a compute in the fleet”
3. `GetComputeAuthToken` — a short-lived (~15 min) credential the **server
   process** uses when calling `InitSDK`

After that, the process behaves identically to one on a managed fleet: same
`ProcessReady`, same `OnStartGameSession`, same everything. That symmetry is the
point — the binary you shipped to managed EC2 in Module 3 runs here unchanged,
which is why studios iterate on Anywhere and deploy to managed fleets.

{{% notice info %}}
The GameLift management connection is outbound: the server process connects to
the GameLift service endpoint. GameLift does not need an internet-wide inbound
rule to register the compute or report health.
{{% /notice %}}

{{% notice tip %}}
Which machine is "yours"? **Own-account path**: your laptop (local tests
can use `127.0.0.1`). **AWS-event path**: your cloud development machine. Its
game port is closed by default; the hands-on page temporarily allows only your
current public IPv4 `/32`, then removes the rules after verification.
{{% /notice %}}
