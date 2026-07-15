---
title: "Latency-Aware Placement"
weight: 43
---

The queue you saw on the previous page has one destination today, so "where
does the session go?" isn't a question yet. But the moment a fleet spans
**multiple regions** (the Multi-Region appendix adds Tokyo and Singapore), the
queue gets to *choose* — and we want it to choose by player latency, which takes
an explicit configuration.

## The scenario

Picture two players: one in Singapore, one in Korea. Both measure the lowest
latency to `ap-southeast-1`. We'd like the match to be placed there, so both
players get a low-latency race.

By default the queue places by **destination order** — the first destination
with capacity, which is the deploy region `us-east-1`. The players' measured
latencies are collected and used by FlexMatch to *match* compatible players; to
have those same latencies drive the *placement* decision too, we give the queue
a priority configuration.

## The configuration — `PriorityConfiguration`

Open **`infra/lib/gamelift-stack.ts`**, find `Ec2Queue`, and note the placement
policy:

```typescript
const ec2Queue = new gamelift.CfnGameSessionQueue(this, 'Ec2Queue', {
  name: 'PixelRushQueue',
  destinations: [ /* this fleet */ ],
  timeoutInSeconds: 60,

  // Place each match in the location with the lowest AVERAGE latency across
  // the matched players. Without this the queue uses destination order and
  // always lands in the deploy region.
  priorityConfiguration: {
    priorityOrder: ['LATENCY', 'LOCATION', 'DESTINATION'],
    // LOCATION requires an explicit order (deploy region first, then extras).
    locationOrder: [this.region, ...extraRegions],
  },

  // Guardrail: reject a placement where any player would exceed the cap.
  // Start strict, then relax so every player still gets a race.
  playerLatencyPolicies: [
    { maximumIndividualPlayerLatencyMilliseconds: 100, policyDurationSeconds: 30 },
    { maximumIndividualPlayerLatencyMilliseconds: 200 },
  ],
});
```

### `priorityOrder` — read it top to bottom

GameLift evaluates candidate locations in this order, using each rule to break
the previous rule's ties:

1. **`LATENCY`** — pick the location with the lowest **average** player latency
   (averaged across everyone in the match). This is what puts our Singapore +
   Korea pair in `ap-southeast-1`.
2. **`LOCATION`** — tie-break by your preferred location order. If you list
   `LOCATION` in `priorityOrder`, GameLift **requires** a non-empty
   `locationOrder` (deploy region first, then extras) — otherwise the queue
   update is rejected with a 400.
3. **`DESTINATION`** — final tie-break by the order destinations are listed.

With `LATENCY` first, placement follows player experience; the default without it
is destination order, which is why our Singapore + Korea pair landed in
`us-east-1`.

### `playerLatencyPolicies` — a quality floor

Latency-first placement pairs well with a *limit*, so a match is placed somewhere
comfortable rather than simply the lowest of whatever is available. The policies
above say:

- For the first **30 seconds**, only place if **every** player is under
  **100 ms** — hold out for a genuinely good session.
- After that, relax the cap to **200 ms** so a player on a slower network still
  gets a race promptly.

## Where the latency numbers come from

Placement can only be latency-aware if the client *reports* latency. Two pieces
make that work in this workshop:

1. The browser probes each fleet region and sends the measurements as
   `LatencyInMs` on `StartMatchmaking` (see `frontend/src/latency.ts`).
2. The matchmaking Lambda **backfills** any region the client couldn't measure
   with a high-but-usable default (`backend/src/request-matchmaking.ts`), so a
   failed probe never leaves a region absent — which would make it unplaceable.

:::alert{type=info}
Latency-aware placement only changes behavior once the fleet has **more than
one location**. With the single-region default there's just one place to go. The
Multi-Region appendix adds Tokyo and Singapore — deploy it and this queue policy
starts steering matches to the closest region automatically, no game-code
changes.
:::

## Verify it (multi-region only)

After a match on a multi-region fleet, the placed location is visible in the
game session ARN and in the debug chat trace:

```
FlexMatch ⇢ session placed in ap-southeast-1 | 1.2.3.4:8443 | 2 players
```

You can also inspect the queue directly:

```bash
aws gamelift describe-game-session-queues --names PixelRushQueue \
  --query "GameSessionQueues[0].{priority:PriorityConfiguration,latency:PlayerLatencyPolicies}"
```
