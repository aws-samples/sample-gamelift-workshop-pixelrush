---
title: "Hands-on: Run It"
weight: 33
---

## 1. Deploy the GameLift stack

This creates the Anywhere fleet + custom location + FlexMatch configurations
(no EC2 — it's fast):

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack --require-approval never
```

~2 minutes. Output includes `AnywhereFleetId` and `AnywhereMatchmakingConfig`.

## 2. Register your machine as fleet compute

One script does the whole registration dance:

```bash
cd ..
./scripts/run-anywhere.sh
```

Watch the output — each line maps to a concept from the previous pages:

```
fleet: fleet-xxxx  compute: your-host-dev  ip: 50.x.x.x  port: 1935
                         └─ RegisterCompute: this machine joins the fleet
starting server (auth token valid ~15 min)...
InitSDK (Anywhere): fleet=fleet-xxxx host=your-host-dev
Connected to GameLift API Gateway.        ◄─ outbound WebSocket to GameLift
ProcessReady on port 1935; waiting for game sessions
                         └─ idle & healthy — waiting to be chosen
```

Leave this terminal running.

:::alert{type=info}
AWS-event path: the script auto-detects the dev machine's public IP via the
`COMPUTE_IP` environment variable (pre-set on the machine).
:::

## 3. Checkpoint ★

Open the AWS console → **Amazon GameLift Servers → Fleets →
PixelRushAnywhereFleet → Computes** tab:

- Your machine is listed by its compute name, status **Active**
- Its IP and the GameLift SDK endpoint are shown

You've registered your own hardware as GameLift fleet compute: GameLift now
knows this machine exists, is healthy (`ProcessReady` + heartbeats), and can be
handed game sessions. Anywhere is for **fast local iteration and validating the
SDK integration** — real multiplayer racing comes in Module 4, on a managed
fleet.

:::alert{type=warning}
The auth token expires after ~15 minutes of idling. If the server exits later,
just re-run `./scripts/run-anywhere.sh`.
:::
