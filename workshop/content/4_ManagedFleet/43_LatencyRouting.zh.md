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

## 会话放置

一局匹配就绪后，queue 要决定在*哪个 location* 创建游戏会话。queue 的
`PriorityConfiguration` 会对四种放置策略排序，GameLift 按你列出的先后依次应用，
后一条用来打破前一条的平局：

1. **`LATENCY`** —— 优先选玩家平均延迟最低的 location。延迟敏感型游戏的首选。
2. **`COST`** —— 优先选最便宜的 location（按实例类型价格）。当预算比几毫秒更重要时使用。
3. **`LOCATION`** —— 按你显式定义的顺序（`locationOrder`）优先，例如先把流量留在主区域。
4. **`DESTINATION`** —— 按目的地在 queue 上列出的先后优先。

实时竞速游戏成败系于延迟，所以我们把 **`LATENCY`** 放在第一位，其余仅作平局裁决。

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
  --query "GameSessionQueues[0].PriorityConfiguration"
```
