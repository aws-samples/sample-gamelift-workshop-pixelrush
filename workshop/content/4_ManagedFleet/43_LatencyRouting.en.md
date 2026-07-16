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

## Session placement

When a match is ready, the queue decides *which location* to create the game
session in. A queue's `PriorityConfiguration` orders four placement strategies;
GameLift applies them in the order you list, each breaking the previous one's
ties:

1. **`LATENCY`** — prefer the location with the lowest average player latency.
   Best for player experience in a latency-sensitive game.
2. **`COST`** — prefer the cheapest location (by the instance type's price).
   Useful when budget matters more than a few milliseconds.
3. **`LOCATION`** — prefer locations in an explicit order you define
   (`locationOrder`), e.g. keep traffic in a home region first.
4. **`DESTINATION`** — prefer destinations in the order they're listed on the
   queue.

A real-time racer lives and dies by latency, so we put **`LATENCY`** first and
use the others only as tie-breakers.

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
  --query "GameSessionQueues[0].PriorityConfiguration"
```
