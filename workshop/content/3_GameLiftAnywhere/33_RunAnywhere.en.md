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

## 2. Open the game port to your IP

Players connect their browser **directly** to this machine on port **1935**
(TCP + UDP). The dev machine's security group does **not** pre-open that port to
the internet — you grant access to just your own IP, so the machine is never
exposed to the whole world.

1. Find your public IP: open [checkip.amazonaws.com](https://checkip.amazonaws.com)
   (or run `curl -s https://checkip.amazonaws.com`).
2. In the AWS console go to **EC2 → Security Groups**, and open the group from
   the **DevSecurityGroupId** event output.
3. **Edit inbound rules → Add rule**, twice:
   - Type **Custom TCP**, Port **1935**, Source **My IP** (or `<your-ip>/32`)
   - Type **Custom UDP**, Port **1935**, Source **My IP**
4. **Save rules.**

:::alert{type=info}
Only your IP needs access — each participant opens the port for their own
machine. If your IP changes (VPN, network switch), re-add the rule for the new
address.
:::

## 3. Register your machine as fleet compute

Step 1 left you in `infra/`. Return to the repository root first, then run the
script (its path is relative to the repo root):

```bash
cd ..          # back to the repository root (from infra/)
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

{{% notice note %}}
AWS-event path: the script auto-detects the dev machine's public IP via the
`COMPUTE_IP` environment variable (pre-set on the machine).
{{% /notice %}}

## 4. Checkpoint ★

Open the AWS console → **Amazon GameLift Servers → Fleets →
PixelRushAnywhereFleet → Computes** tab:

- Your machine is listed by its compute name, status **Active**
- Its IP and the GameLift SDK endpoint are shown

You've registered your own hardware as GameLift fleet compute: GameLift now
knows this machine exists, is healthy (`ProcessReady` + heartbeats), and can be
handed game sessions. Anywhere is for **fast local iteration and validating the
SDK integration** — real multiplayer racing comes in Module 4, on a managed
fleet.

{{% notice warning %}}
The auth token expires after ~15 minutes of idling. If the server exits later,
just re-run `./scripts/run-anywhere.sh`.
{{% /notice %}}
