---
title: "Fleet 配置详解（等待时阅读）"
weight: 42
---

趁 fleet 激活的时间，读一读正在生效的配置。打开
**`infra/lib/gamelift-stack.ts`**，找到 `Ec2Fleet` 的定义。

## 运行时配置——每台实例上跑什么

```typescript
runtimeConfiguration: {
  serverProcesses: [
    { launchPath: '/local/game/pixelrush-server', parameters: '--port 8443 ...', concurrentExecutions: 1 },
    { launchPath: '/local/game/pixelrush-server', parameters: '--port 2083 ...', concurrentExecutions: 1 },
  ],
},
```

每台实例在不同端口运行**两个服务器进程** → 每实例可同时承载两局比赛。
进程密度是成本杠杆：大型工作室每台机器跑几十个进程。`launchPath` 一律以
`/local/game/` 开头——那是 GameLift 解压你 build 的位置。

## 端口——玩家怎么进来

```typescript
ec2InboundPermissions: [
  { fromPort: 8443, toPort: 8443, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  { fromPort: 2083, toPort: 2083, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  // + 同样两个端口的 UDP
],
```

游戏客户端**直连实例**（这是 GameLift 低延迟设计的核心）——所以游戏端口必须
显式开放。只有列出的端口可达，其余全部关闭。

## TLS——对浏览器友好的连接

```typescript
certificateConfiguration: { certificateType: 'GENERATED' },
```

GameLift 可为每个 fleet 签发 TLS 证书。我们的网页客户端跑在 HTTPS 页面上，
浏览器只允许它建立**安全** WebSocket（`wss://`）——生成的证书加上会话的 DNS
名称，让这一切零证书运维地工作。

## Queue——谁决定会话放在哪

```typescript
const ec2Queue = new gamelift.CfnGameSessionQueue(this, 'Ec2Queue', {
  name: 'PixelRushQueue',
  destinations: [ /* 本 fleet */ ],
});
```

**queue** 扫描目的地列表（fleet/别名，可跨区域）并把会话放到最合适的那个。
今天队列只有一个目的地；可选附录会加入东京和新加坡——*完全不用改游戏代码*。

本模块后端**直接**在这个 fleet 上放置会话（`CreateGameSession` /
`CreatePlayerSession`），没有任何规则——这是让两个玩家进入同一局最简单的方式。
到模块 5，FlexMatch 会挡在这同一个 queue 前面，决定*谁*和*谁*共享一局。

## Fleet 生命周期状态

你的部署此刻正在经历：

```
NEW → DOWNLOADING → VALIDATING → BUILDING → ACTIVATING → ACTIVE
       (下载 build)  (install.sh)  (运行时)    (进程健康检查)  (可接会话)
```

回到终端——`cdk deploy` 返回后，继续下一页。
