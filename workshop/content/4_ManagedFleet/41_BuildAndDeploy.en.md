---
title: "Hands-on: Build & Deploy"
weight: 41
---

## 1. Cross-compile the server for the fleet

Fleet instances run Amazon Linux 2023 on x86_64. From the repository root, Go
cross-compiles in one command:

```bash
cd ~/gamelift-workshop
./scripts/build-server-linux.sh
```

The script produces `server/dist/linux/` containing:

- `pixelrush-server` — the Linux binary (statically linked, ~8 MB)
- `install.sh` — runs once per instance at deploy time (permissions, log dir)

Confirm the binary was produced before deploying:

```bash
ls -lh server/dist/linux/
```

Expected — both files present:

```
install.sh
pixelrush-server
```

## 2. Deploy the fleet

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2 --require-approval never
```

Both stacks are deployed together: `PixelRushGameLiftStack` creates the managed
EC2 fleet, and `PixelRushBackendStack` is re-deployed so the matchmaking Lambda
switches to **direct placement** (`PLACEMENT_MODE=open`) — in this module players
are seated directly onto the fleet with **no matchmaking rules** (FlexMatch rules
come in Module 5). Deploying only the GameLift stack would leave the backend in
its previous mode.

Expected output — both stacks finish and the fleet ID / queue name are shown:

```
✅  PixelRushGameLiftStack
✅  PixelRushBackendStack

Outputs:
PixelRushGameLiftStack.Ec2FleetId = fleet-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PixelRushGameLiftStack.Ec2QueueName = PixelRushQueue
Stack ARN: arn:aws:cloudformation:us-east-1:123456789012:stack/PixelRushGameLiftStack/...
```

The `-c stage=ec2` flag extends the stacks you already have:

| Resource | What happens |
|---|---|
| **Build** | `server/dist/linux/` is zipped, uploaded to S3, registered with GameLift |
| **Fleet** | GameLift provisions a c5.large, downloads the build, runs `install.sh`, launches your server processes |
| **Queue** | `PixelRushQueue` — the placement target for sessions (direct in this module, via FlexMatch in Module 5) |
| **Backend** | matchmaking Lambda switches to direct placement (no rules) — this is why the backend stack is re-deployed here |

{{% notice info %}}
This takes **~15 minutes** (instance provisioning + build install + process
health checks). Don't wait idle — move to the next page and read how the fleet
is configured. Come back when the deploy command returns.
{{% /notice %}}
