---
title: "规则集"
weight: 51
---

**规则集（rule set）**是一份 JSON 文档，描述"什么样算一场有效的比赛"。
FlexMatch 用它评估每一张搜索中的票据。来读我们自己的规则集——定义在
`infra/lib/gamelift-stack.ts`（`ruleSetBody`），下面是 2 人赛的版本：

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

逐块解读：

| 块 | 在我们游戏中的含义 |
|---|---|
| `playerAttributes` | 每张票据携带玩家的 `level` 和所选 `trackId`——在此声明，由我们的 Lambda 调用 `StartMatchmaking` 时填入 |
| `teams` | 一个叫 *racers* 的队伍，恰好 2 人。（团队对战射击游戏会在这里定义两支队伍。） |
| `SimilarLevel` 规则 | 玩家等级与组内平均值差距不超过 3——保证公平 |
| `SameTrack` 规则 | 所有人必须选了同一条赛道 |
| `expansions` | **防饿死机制**：10 秒后放宽等级限制；45 秒后连 `minPlayers` 都降为 1，孤身玩家也能开局（我们的服务器会用 NPC 车手补满） |

{{% notice tip %}}
Expansion 是"匹配**质量**换等待**时间**"的旋钮。所有生产级匹配系统都会用它——
没人愿意为完美匹配等 10 分钟，而放弃 20 秒内的够好匹配。
{{% /notice %}}

Workshop 部署了四套规则集（1/2/3/4 人）——除队伍人数外完全相同。
1 人规则集就是"单人 vs NPC"秒开服务器比赛的动力来源。
