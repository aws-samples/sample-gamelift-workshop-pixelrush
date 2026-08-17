---
title: "Hands-on: Run It"
weight: 82
---

## 1. Confirm the Anywhere fleet exists

Nothing to deploy: `PixelRushGameLiftStack` always creates an Anywhere fleet, a
custom location (`custom-pixelrush-dev`) and the matchmaking configurations that
go with them — the `-c stage=ec2` flag from Module 3 *added* the managed EC2
fleet alongside those. Look at `infra/lib/gamelift-stack.ts`: the `AnywhereFleet` block sits
outside the `if (props.deployEc2Fleet)` guard.

Read the fleet ID straight from the stack outputs:

```bash
aws cloudformation describe-stacks --stack-name PixelRushGameLiftStack \
  --query "Stacks[0].Outputs[?OutputKey=='AnywhereFleetId'].OutputValue" \
  --output text
```

Expected — a fleet ID, which means the fleet is ready for a compute:

```
fleet-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

{{% notice info %}}
Because this appendix deploys nothing, it leaves your managed EC2 fleet
untouched — you can take it at any point after Module 3 without disturbing the
main path.
{{% /notice %}}

## 2. AWS event only: temporarily allow your public IP

Skip this step on the own-account/laptop path.

The cloud development machine starts with TCP/UDP 1935 closed. On the device
where your **game browser** runs, open
[checkip.amazonaws.com](https://checkip.amazonaws.com/) (an AWS service that
displays your public IP address) in a separate browser tab and copy the IPv4
address. Do **not** run `curl` in the cloud VS Code terminal:
that would return the development machine's EC2 public IP, not the public IP of
the network your browser is on.

First confirm the development machine exported its security-group ID (it comes
from `~/.bashrc`, so a terminal opened before the instance finished setting up
may not have it):

```bash
echo "${DEV_SECURITY_GROUP_ID:?not set — open a new terminal, or re-source ~/.bashrc}"
```

Expected: a security-group ID such as `sg-0123456789abcdef0`.

Now enter your address when prompted:

```bash
read -rp "Your browser network public IPv4: " MY_IP

aws ec2 authorize-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol tcp --port 1935 --cidr "${MY_IP}/32"

aws ec2 authorize-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol udp --port 1935 --cidr "${MY_IP}/32"
```

Verify that exactly your `/32` was added:

```bash
aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`].[IpProtocol,IpRanges[0].CidrIp]' \
  --output table
```

Expected: one TCP and one UDP row, both showing `YOUR_IP/32` — never
`0.0.0.0/0`.

{{% notice warning %}}
If your VPN or network changes, your public IP might change. Revoke the old
rules and repeat this step with the new address. Never widen the rule to
`0.0.0.0/0`.
{{% /notice %}}

## 3. Register your machine as fleet compute

Run the script from the repository root:

```bash
cd ~/gamelift-workshop      # the repository root
./scripts/run-anywhere.sh
```

{{% notice info %}}
The `COMPUTE_IP` variable is the address the script registers as this compute's
IP. **Own-account path**: leave it unset — the script falls back to `127.0.0.1`,
which is what you want when the game browser and the server run on the same
laptop. Only if your browser is on a *different* device than the server, set it
first: `export COMPUTE_IP=<an address that device can reach>`.
**AWS-event path**: nothing to set — the development machine already exports
`COMPUTE_IP` (its own public IP) and `DEV_SECURITY_GROUP_ID` (only this
machine's security group) in `~/.bashrc`.
{{% /notice %}}

Watch the output:

```
fleet: fleet-xxxx  compute: your-host-dev  ip: 50.x.x.x  port: 1935
                         └─ RegisterCompute: this machine joins the fleet
starting server (auth token valid ~15 min)...
InitSDK (Anywhere): fleet=fleet-xxxx host=your-host-dev
Connected to GameLift API Gateway.        ◄─ outbound WebSocket to GameLift
ProcessReady on port 1935; waiting for game sessions
                         └─ idle & healthy — waiting to be chosen
```

Leave this terminal running while you check the compute. The `ip:` value in the
first line is what `COMPUTE_IP` resolved to — `127.0.0.1` on a laptop, the
development machine's public IP at an AWS event.

## 4. Checkpoint ★

Open the AWS console → **Amazon GameLift Servers → Fleets →
PixelRushAnywhereFleet → Computes** tab:

- Your machine is listed by its compute name, status **Active**
- Its IP and the GameLift SDK endpoint are shown

You've registered your own hardware as GameLift fleet compute: GameLift now
knows this machine exists and is healthy (`ProcessReady` + heartbeats). Same
Server SDK code, same lifecycle, your machine instead of an EC2 instance — that
is what Anywhere buys you: **change code, restart, test in seconds**, with no
fleet activation wait.

## 5. AWS event only: close the temporary game ports

After the checkpoint, remove both rules immediately. The server's outbound
GameLift connection and health reporting continue to work.

The server from step 3 is still running in your first terminal, so you are
probably in a second one — where `MY_IP` doesn't exist. Read the authorized
range back from the security group instead of relying on that variable:

```bash
MY_IP_CIDR=$(aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`]|[0].IpRanges[0].CidrIp' \
  --output text)
echo "revoking $MY_IP_CIDR"

aws ec2 revoke-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol tcp --port 1935 --cidr "$MY_IP_CIDR"

aws ec2 revoke-security-group-ingress \
  --group-id "$DEV_SECURITY_GROUP_ID" \
  --protocol udp --port 1935 --cidr "$MY_IP_CIDR"
```

If `echo` prints `None`, the rules are already gone — skip straight to the
verification below.

Verify no 1935 rule remains:

```bash
aws ec2 describe-security-groups \
  --group-ids "$DEV_SECURITY_GROUP_ID" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`1935`]' \
  --output json
```

Expected output:

```json
[]
```

{{% notice warning %}}
The auth token expires after ~15 minutes of idling. If the server exits later,
just re-run `./scripts/run-anywhere.sh`. Reopening inbound rules is not needed
for the Compute Active checkpoint because GameLift management traffic is
outbound.
{{% /notice %}}
