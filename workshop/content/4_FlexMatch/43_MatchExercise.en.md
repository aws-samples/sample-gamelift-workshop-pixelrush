---
title: "Hands-on: Match on Your Fleet"
weight: 43
---

## 1. Turn on FlexMatch

One redeploy adds the matchmaking configurations and flips the backend from
direct placement to rule-based matchmaking — against the *same* fleet you built
in Module 3:

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2-match --require-approval never
```

Expected output — both stacks report `UPDATE_COMPLETE` and the matchmaking
config name is shown:

```
✅  PixelRushGameLiftStack
✅  PixelRushBackendStack

Outputs:
PixelRushGameLiftStack.Ec2MatchmakingConfig = PixelRushMatchEc2{1|2|3|4}
```

~2 minutes (the fleet already exists — this only adds matchmaking configs and
updates the Lambda). The `stage=ec2-match` flag:

- creates the `PixelRushMatchEc2{1,2,3,4}` matchmaking configurations + rule sets
- switches the backend's `PLACEMENT_MODE` from `open` to `flexmatch`

{{% notice info %}}
No frontend rebuild needed — the client calls the same API. What changed is how
the backend turns a request into a session: `StartMatchmaking` instead of
`CreateGameSession`.
{{% /notice %}}

## 2. Race — and watch the machinery

You'll need a second player for a 2P match: use **a second browser tab** with a
different racer name, or pair up with your neighbor **both using your site URL**.

Your **site URL** is `PixelRushFrontendStack.SiteUrl` from Module 2. If you need
to look it up again:

```bash
aws cloudformation describe-stacks --stack-name PixelRushFrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text
```

1. Both players: **RACE → same track → 2P**
2. While the spinner runs, open the console:
   **Amazon GameLift Servers → Matchmaking → PixelRushMatchEc22** — ticket counts tick up under
   **Matchmaking activity**
3. Within seconds both browsers jump into the countdown — placed on your EC2
   fleet, just like Module 3, but this time *through a matchmaker*

## 3. See the rules do their job

The difference from Module 3 is what happens when players *don't* match:

- Two tabs on **different tracks** → they will **not** be matched (the
  `SameTrack` rule); each waits, then races NPCs alone. In Module 3 the track
  didn't gate anything.
- The world chat prints a debug trace for every ticket: who requested what
  size, track, and their measured region latencies.

Console → **GameLift → Fleets → PixelRushFleet → Game sessions**: your session
is `ACTIVE` with two player sessions. Click in to see the exact IP and port, and
each PlayerSessionId.

## Checkpoint ★

A match completed **through FlexMatch** on PixelRushFleet, and two tabs on
different tracks did *not* get matched. Every box from the Module 1 diagram is
now live:

```
Build ✓ → Fleet ✓ → Queue ✓ → FlexMatch ✓ → Game Session ✓ → Players ✓
```
