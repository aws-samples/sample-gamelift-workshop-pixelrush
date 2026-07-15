---
title: "动手：在你的 fleet 上匹配"
weight: 53
---

## 1. 打开 FlexMatch

一次重新部署，加上匹配配置，并把后端从直接放置切换到基于规则的匹配——针对的是
你在模块 4 建好的*同一个* fleet：

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2-match --require-approval never
```

约 2 分钟（fleet 已存在——这次只是加匹配配置、更新 Lambda）。`stage=ec2-match`
这个标志会：

- 创建 `PixelRushMatchEc2{1,2,3,4}` 匹配配置 + 规则集
- 把后端的 `PLACEMENT_MODE` 从 `open` 切到 `flexmatch`

:::alert{type=info}
不用重新构建前端——客户端调用的是同一个 API。变的是后端如何把请求变成会话：
用 `StartMatchmaking` 取代 `CreateGameSession`。
:::

## 2. 开赛——顺便观察机器运转

2P 比赛需要第二名玩家：请开**第二个浏览器标签页**换个车手名，或与邻座结对、
**两人都用你的站点 URL**。

1. 两名玩家：**RACE → 同一条赛道 → 2P**
2. 转圈等待时打开控制台：
   **GameLift → Matchmaking → PixelRushMatchEc22**——在 **Matchmaking
   activity** 下能看到票据计数跳动
3. 几秒内两个浏览器同时进入倒计时——和模块 4 一样放在你的 EC2 fleet 上，
   但这次是*经过匹配器*的

## 3. 看规则起作用

和模块 4 的区别，正在于玩家*匹配不上*时会发生什么：

- 两个标签选**不同赛道** → 它们**不会**被匹配到一起（`SameTrack` 规则）；
  各自等待后与 NPC 单独比赛。模块 4 里赛道根本不作数。
- 世界频道会为每张票据打印 debug：谁申请了什么人数、赛道，以及测得的区域延迟。

控制台 → **GameLift → Fleets → PixelRushFleet → Game sessions**：你的会话
在列，状态 `ACTIVE`，挂着两个 player session。点进去能看到浏览器实际连接的
IP:端口，以及每个 PlayerSessionId。

## 检查点 ★

一场比赛**经由 FlexMatch**在 PixelRushFleet 上完成，且两个选不同赛道的标签
*没有*被匹配到一起。模块 1 那张图里的每一格现在都亮了：

```
Build ✓ → Fleet ✓ → Queue ✓ → FlexMatch ✓ → Game Session ✓ → Players ✓
```
