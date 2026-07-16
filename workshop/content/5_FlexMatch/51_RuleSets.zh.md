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

## 常见对战规则集模板

我们的是一个简单的自由对战（FFA）竞速规则集，但 FlexMatch 规则集能覆盖差异很大的
游戏形态。下面是最常用的几种模式——把它们当作起步模板，而非固定清单：

| 模板 | 匹配方式 | 典型品类 |
|---|---|---|
| **自由对战（FFA）** | 单队伍、N 名玩家、按名次排位，无阵营。本 workshop 的竞速就是这种。 | 竞速、大逃杀、FFA 竞技场 |
| **团队对战（均衡）** | 两支（或多支）人数相等的队伍；让技术在队伍*之间*均衡，保证公平。 | MOBA、团队射击、体育 |
| **技术匹配（SBMM）** | 对技术/MMR 属性用 `distance` 规则，把玩家控制在同一评分区间；expansion 随时间放宽。 | 排位 / 竞技天梯 |
| **延迟感知** | 用 `latency` 规则限制每名玩家的区域延迟，只在共享同一快速区域的玩家间成局。 | 任何实时联机游戏 |
| **角色 / 阵容** | 玩家声明角色（坦克/治疗/输出）；规则要求合法的队伍阵容，而不只是人数。 | 职业制射击、RPG |
| **组队 / 预组队** | 让预先组好的小队保持在一起，与规模、技术相当的另一队匹配。 | 合作、小队制游戏 |

每种模板都只是上面那些相同积木的不同组合——`teams`、`playerAttributes`、
`rules`（`distance` / `comparison` / `latency`）和 `expansions`。我们的竞速用的是
自由对战 + 一条轻量技术规则（`SimilarLevel`）；加一条延迟规则或第二支队伍，都只是
在同一份 JSON 上的增量修改，而非重写。

{{% notice tip %}}
从最贴合你游戏的最简模板起步，只有当真正出现公平性或体验问题时再加规则。每加一条
规则都是一个新约束，都可能拖慢匹配速度。
{{% /notice %}}
