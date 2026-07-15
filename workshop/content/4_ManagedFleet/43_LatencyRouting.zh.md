---
title: "延迟感知放置"
weight: 43
---

上一页看到的 queue 今天只有一个目的地，所以"会话放哪儿"还不是问题。但一旦
fleet 跨**多个区域**（多区域附录会加入东京和新加坡），queue 就要*做选择*——这时
我们希望它按玩家延迟来选，而这需要显式配置。

## 场景

设想两个玩家：一个在新加坡，一个在韩国。两人测得的最低延迟都指向
`ap-southeast-1`。我们希望这一局就近放在 `ap-southeast-1`，让两人都获得低延迟体验。

默认情况下，queue 按**目的地顺序**放置——把会话放到第一个有容量的目的地，也就是
部署区域 `us-east-1`。玩家测得的延迟会被收集、并被 FlexMatch 用于*匹配*相互兼容的
玩家；要让这些延迟同样参与*放置*决策，就需要给 queue 配置放置优先级。

## 配置 —— `PriorityConfiguration`

打开 **`infra/lib/gamelift-stack.ts`**，找到 `Ec2Queue`，注意这段放置策略：

```typescript
const ec2Queue = new gamelift.CfnGameSessionQueue(this, 'Ec2Queue', {
  name: 'PixelRushQueue',
  destinations: [ /* 本 fleet */ ],
  timeoutInSeconds: 60,

  // 把每一局放到"匹配玩家平均延迟最低"的 location。不配这个,queue 会用
  // 目的地顺序,永远落在部署区域。
  priorityConfiguration: {
    priorityOrder: ['LATENCY', 'LOCATION', 'DESTINATION'],
    // LOCATION 必须配一个明确的顺序(部署区域在前,附加区域在后)。
    locationOrder: [this.region, ...extraRegions],
  },

  // 护栏:任一玩家超过上限就拒绝这次放置。先严格,再放宽,保证每个玩家
  // 都能开上一局。
  playerLatencyPolicies: [
    { maximumIndividualPlayerLatencyMilliseconds: 100, policyDurationSeconds: 30 },
    { maximumIndividualPlayerLatencyMilliseconds: 200 },
  ],
});
```

### `priorityOrder` —— 从上往下读

GameLift 按这个顺序评估候选 location，用后一条规则去打破前一条规则的平局：

1. **`LATENCY`** —— 选**平均**玩家延迟最低的 location（对本局所有玩家取平均）。
   正是这一条把我们"新加坡 + 韩国"的组合放进 `ap-southeast-1`。
2. **`LOCATION`** —— 按你偏好的 location 顺序做平局裁决。只要 `priorityOrder` 里
   列了 `LOCATION`，GameLift 就**强制要求**一个非空的 `locationOrder`（部署区域在前，
   附加区域在后），否则 queue 更新会被 400 拒绝。
3. **`DESTINATION`** —— 最后按目的地列出的顺序裁决平局。

把 `LATENCY` 放在第一位，放置就跟着玩家体验走；不写它时的默认值是目的地顺序，这
正是我们"新加坡 + 韩国"的组合落在 `us-east-1` 的原因。

### `playerLatencyPolicies` —— 质量底线

延迟优先的放置配合一个*上限*会更好，让对战落在一个体验舒适的区域，而不是只取当前
可用里最低的那个。上面的策略表示：

- 前 **30 秒**内，只有当**每个**玩家都低于 **100ms** 时才放置——为一局真正好的
  对战多等一会儿。
- 之后把上限放宽到 **200ms**，让网络较慢的玩家也能尽快开上一局。

## 延迟数据从哪来

只有客户端*上报*延迟，放置才可能感知延迟。本 workshop 里有两块配合实现：

1. 浏览器探测每个 fleet 区域，并把测量值作为 `LatencyInMs` 附在 `StartMatchmaking`
   上（见 `frontend/src/latency.ts`）。
2. 匹配 Lambda 对客户端没能测到的区域做**回填**（backfill），填一个偏高但可用的
   默认值（`backend/src/request-matchmaking.ts`），这样一次失败的探测不会让某个区域
   缺席——缺席会导致它无法被放置。

:::alert{type=info}
延迟感知放置只有当 fleet 拥有**多于一个 location** 时才会改变行为。单区域默认下只有
一个地方可去。多区域附录会加入东京和新加坡——部署它之后，这条 queue 策略就会自动把
对战导向最近的区域，且无需改动任何游戏代码。
:::

## 验证（仅多区域）

在多区域 fleet 上完成一局后，被放置的 location 会体现在 game session ARN 和调试
频道的 trace 里：

```
FlexMatch ⇢ 会话放置于 ap-southeast-1｜1.2.3.4:8443｜2 名玩家
```

你也可以直接检查 queue：

```bash
aws gamelift describe-game-session-queues --names PixelRushQueue \
  --query "GameSessionQueues[0].{priority:PriorityConfiguration,latency:PlayerLatencyPolicies}"
```
