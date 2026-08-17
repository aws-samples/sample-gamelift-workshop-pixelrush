---
title: "The Challenge"
weight: 91
---

{{% notice warning %}}
Extra cost: the location you add runs its own c5.large, on top of your
us-east-1 instance — roughly **$0.11–0.14/hour** depending on the region. Check
[Amazon GameLift Servers instance pricing](https://aws.amazon.com/gamelift/pricing/instance-pricing/)
for the exact rate. Remember to destroy when done.
{{% /notice %}}

## The problem

Your fleet lives in us-east-1. A player in Asia connects across the Pacific:
**200–300 ms RTT** — playable, but noticeably behind a local player. Physical
distance can't be optimized away; the server must move closer.

## Part 1 — add a location to the fleet

A managed fleet can span multiple regions as **locations** — same build, same
runtime config, instances everywhere. Right now your fleet runs a single
location (your deploy region). Add one more from the console:

1. Console → **Amazon GameLift Servers → Fleets**, choose **PixelRushFleet**.
   It must be **ACTIVE** before you can edit it.
2. Open the **Locations** tab — today it lists only your deploy region.
3. Choose **Add**, then pick **one** remote location. Prefer the region closest
   to you: that makes the latency routing in Part 2 visible in your own game.
   The list only offers regions where this instance type is available.
4. Choose **Add** again to confirm. The new location appears with status `NEW`,
   and Amazon GameLift Servers starts provisioning one instance there.
5. **Don't wait for it.** Activation takes ~15 minutes. Read Part 2 now and come
   back to this tab — the status goes `NEW → ACTIVATING → ACTIVE`.

{{% notice info %}}
Doing this in the console instead of redeploying is deliberate: **Add** returns
immediately, so you can read on while the instance provisions. A `cdk deploy`
would block until the fleet returned to `ACTIVE`.

To see how the same thing is expressed as infrastructure-as-code, open
`infra/lib/gamelift-stack.ts` and look at the `extraRegions` variable and the
`locations:` array — that is the deploy-time equivalent of what you just clicked.
{{% /notice %}}

{{% notice warning %}}
A console change is CloudFormation **drift**: the new location isn't in the
template. Any later `cdk deploy PixelRushGameLiftStack` will remove it again, so
take this appendix last. Cleanup is unaffected — `cdk destroy` deletes the whole
fleet either way.
{{% /notice %}}

## Part 2 — how placement picks a region

Locations alone don't route anyone. The **queue** decides placement, and it
routes on latency only if tickets carry it:

1. The game client measures HTTPS round-trip to each region *in the background
   while the player browses the lobby* (see `frontend/src/latency.ts`)
2. `StartMatchmaking` attaches `LatencyInMs: {"us-east-1": 250, "ap-northeast-1": 80, ...}`
   per player (see `backend/src/request-matchmaking.ts`)
3. The queue places each session in the location with the **best overall
   latency for that match's players** — two players near your new location land
   there; a mixed pair lands wherever the worst case is smallest

This client → ticket → queue chain is the standard Amazon GameLift Servers latency-routing
pattern; our game already implements steps 1–2, so no code changes are needed.

{{% notice info %}}
The queue needs no change for this to work: its `priorityConfiguration` already
puts `LATENCY` first, and that applies to every location the fleet has — including
one added after the queue was created. Only the `locationOrder` list (the
tie-breaker used when latencies are equal) still names just the deploy region.
{{% /notice %}}

## Verify

1. Wait for both locations to show *Active*: console → fleet → **Locations** tab
2. Race a 2P match, then check **Game sessions** — the session's **Location**
   column shows where the queue placed you
3. If you (or a VPN) are closer to the location you added than to the deploy
   region, expect the session to land in the new one

## Checkpoint ★

Fleet shows 2 active locations, and a game session's Location matches the
lowest-latency region for its players.

{{% notice tip %}}
Cleanup reminder: `npx cdk destroy PixelRushGameLiftStack` removes instances in
**both** regions — verify no locations remain in the console.
{{% /notice %}}
