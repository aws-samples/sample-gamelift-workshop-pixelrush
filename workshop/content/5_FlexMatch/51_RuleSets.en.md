---
title: "Rule Sets"
weight: 51
---

A **rule set** is a JSON document describing what a valid match looks like.
FlexMatch evaluates every searching ticket against it. Let's read ours — it's
defined in `infra/lib/gamelift-stack.ts` (`ruleSetBody`), shown here for a
2-player race:

```json
{
  "name": "PixelRushRaceRules2",
  "playerAttributes": [
    { "name": "level",   "type": "number", "default": 1 },
    { "name": "trackId", "type": "string", "default": "track-1" }
  ],
  "teams": [{ "name": "racers", "minPlayers": 2, "maxPlayers": 2 }],
  "rules": [
    {
      "name": "SimilarLevel",
      "type": "distance",
      "measurements": ["teams[racers].players.attributes[level]"],
      "referenceValue": "avg(teams[racers].players.attributes[level])",
      "maxDistance": 3
    },
    {
      "name": "SameTrack",
      "type": "comparison",
      "operation": "=",
      "measurements": ["flatten(teams[*].players.attributes[trackId])"]
    }
  ],
  "expansions": [
    { "target": "rules[SimilarLevel].maxDistance",
      "steps": [{ "waitTimeSeconds": 10, "value": 100 }] },
    { "target": "teams[racers].minPlayers",
      "steps": [{ "waitTimeSeconds": 45, "value": 1 }] }
  ]
}
```

Reading it line by line:

| Block | Meaning in our game |
|---|---|
| `playerAttributes` | Each ticket carries the player's `level` and chosen `trackId` — declared here, supplied by our Lambda when it calls `StartMatchmaking` |
| `teams` | One team called *racers*, exactly 2 players. (A team-vs-team shooter would define two teams here.) |
| `SimilarLevel` rule | Players' levels must be within 3 of the group average — fair matches |
| `SameTrack` rule | Everyone must have picked the same track |
| `expansions` | **Anti-starvation**: after 10 s the level restriction relaxes; after 45 s even `minPlayers` drops to 1 so a lone player still gets a session (our server fills the grid with NPC drivers) |

{{% notice tip %}}
Expansions are the knob that trades match **quality** against **wait time**.
Every production matchmaker uses them — nobody wants a perfect match in 10
minutes over a decent match in 20 seconds.
{{% /notice %}}

The workshop deploys four rule sets (sizes 1/2/3/4) — identical except for the
team size. Size 1 is what powers the instant "solo vs NPC" server match.

## Common rule set templates

Ours is a simple free-for-all racer, but FlexMatch rule sets scale to very
different game shapes. These are the patterns you'll reach for most often — think
of them as starting templates rather than a fixed catalog:

| Template | What it matches | Typical genre |
|---|---|---|
| **Free-for-all** | One team, N players, ranked by finish — no sides. This workshop's racer. | Racing, battle royale, FFA arena |
| **Team vs team (balanced)** | Two (or more) equal teams; balance skill *across* teams so the match is fair. | MOBA, team shooter, sports |
| **Skill-based (SBMM)** | `distance` rules on a skill/MMR attribute keep players within a rating band; expansions widen it over time. | Ranked / competitive ladders |
| **Latency-aware** | A `latency` rule caps region latency per player so a match only forms among players who share a fast region. | Any real-time online game |
| **Role / composition** | Players declare a role (tank/healer/DPS); rules require a valid team composition, not just a head count. | Class-based shooters, RPGs |
| **Party / pre-made** | Keep a pre-formed group together and match it against a group of comparable size and skill. | Co-op, squad-based games |

Each template is just a different combination of the same building blocks you
saw above — `teams`, `playerAttributes`, `rules` (`distance` / `comparison` /
`latency`), and `expansions`. Our racer uses free-for-all + a light skill rule
(`SimilarLevel`); adding a latency rule or a second team is an incremental edit
to the same JSON, not a rewrite.

{{% notice tip %}}
Start from the simplest template that fits your game and add rules only when a
real fairness or experience problem shows up. Every rule you add is another
constraint that can slow down matchmaking.
{{% /notice %}}
