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
