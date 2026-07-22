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

## 3. Checkpoint ★

No console needed — check it straight from the AWS CLI. First grab the Anywhere
fleet ID from the GameLift stack's outputs:

```bash
FLEET_ID=$(aws cloudformation describe-stacks --stack-name PixelRushGameLiftStack \
  --query "Stacks[0].Outputs[?OutputKey=='AnywhereFleetId'].OutputValue" --output text)
echo "fleet: $FLEET_ID"
```

List the computes registered on that fleet (your just-registered machine):

```bash
aws gamelift list-compute --fleet-id "$FLEET_ID" \
  --query "ComputeList[].{Name:ComputeName,Status:ComputeStatus,IP:IpAddress,Location:Location}" \
  --output table
```

Then query one compute by name (the `compute:` value the script printed in step 2,
default `$(hostname -s)-dev`) for full detail incl. the GameLift SDK endpoint:

```bash
aws gamelift describe-compute --fleet-id "$FLEET_ID" \
  --compute-name "$(hostname -s)-dev" \
  --query "Compute.{Name:ComputeName,Status:ComputeStatus,IP:IpAddress,Location:Location,Endpoint:GameLiftServiceSdkEndpoint}" \
  --output table
```

Expected — your machine is listed, status **Active**, showing its IP, location
and GameLift SDK endpoint:

```
--------------------------------------------------------
|                    DescribeCompute                   |
+----------+-------------------------------------------+
|  Endpoint|  wss://us-east-1.api.amazongamelift.com   |
|  IP      |  127.0.0.1                                |
|  Location|  custom-pixelrush-dev                     |
|  Name    |  your-host-dev                            |
|  Status  |  Active                                   |
+----------+-------------------------------------------+
```

You've registered your own hardware as GameLift fleet compute: GameLift now
knows this machine exists, is healthy (`ProcessReady` + heartbeats), and can be
handed game sessions. Anywhere is for **fast local iteration and validating the
SDK integration** — real multiplayer racing comes in Module 4, on a managed
fleet.

{{% notice warning %}}
The auth token expires after ~15 minutes of idling. If the server exits later,
just re-run `./scripts/run-anywhere.sh`.
{{% /notice %}}
