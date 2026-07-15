---
title: "票据与事件"
weight: 52
---

## 三个协作部件

```
 匹配配置 (CONFIGURATION)  =  规则集  +  队列  +  通知目标
        │
        │  StartMatchmaking(配置名, 玩家[属性])
        ▼
      票据 (TICKET) ─────────────────────────► 游戏会话 (GAME SESSION)
        每次请求一张；携带玩家、状态、             成局后经由 Queue 放置
        以及（完成时的）连接信息
```

**匹配配置**把一切绑在一起——我们的 stack 为每种人数各建一个
（`PixelRushMatchEc22` = EC2 队列上的 2 人赛）。

## 票据生命周期

每次调用 `StartMatchmaking` 都返回一张**票据**，它经历：

```
 QUEUED → SEARCHING → POTENTIAL_MATCH_CREATED → PLACING → COMPLETED
                          │                                   └─ 连接信息：
                          │ （若启用接受确认流程）                 IP/DNS + 端口 +
                          └─ REQUIRES_ACCEPTANCE                  PlayerSessionId
 失败路径：TIMED_OUT · CANCELLED · FAILED
```

`COMPLETED` 是回报时刻：票据此时包含**去哪连**（游戏会话地址）和每个玩家的
**PlayerSessionId**——也就是服务器在模块 3 里用 `AcceptPlayerSession`
验的那张"入场券"。

## 玩家怎么知道结果？

轮询 `DescribeMatchmaking` 可行但不可扩展。生产模式——我们的游戏就是这么
实现的——是**事件推送**：

```
FlexMatch ──事件──► SNS 主题 ──► Lambda ──► WebSocket 推送 ──► 浏览器
   （每次状态变化）              (process-matchmaking-events.ts)
```

匹配配置的 `notificationTarget` 指向一个 SNS 主题；票据每次状态变化都会发布
事件。我们的 Lambda 把 `MatchmakingSucceeded`（含连接信息）经 API Gateway
WebSocket 转发给等待中的玩家。端到端延迟：不到一秒。

:::alert{type=info}
这套基于 SNS 的模式是 AWS 官方推荐的 FlexMatch 集成方式——同一条管道
从我们的 2 人 workshop 扩展到百万级票据规模。
:::
