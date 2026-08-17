---
title: "Fleet 配置详解（等待时阅读）"
weight: 32
---

趁 fleet 激活的时间，读一读正在生效的配置。打开
**`infra/lib/gamelift-stack.ts`**，找到 `Ec2Fleet` 的定义。

## 运行时配置——每台实例上跑什么

```typescript
const SESSIONS_PER_INSTANCE = 2;
const GAME_PORT_BASE = 8443;      // 8443、8444——每个进程一个端口
runtimeConfiguration: {
  gameSessionActivationTimeoutSeconds: 300,
  serverProcesses: gamePorts.map((port) => ({
    launchPath: '/local/game/pixelrush-server',
    parameters: launchParams(port),   // --port <port> --api-url ... --log ...
    concurrentExecutions: 1,
  })),
},
```

我们的服务器**一个进程承载一局会话**，所以每台实例在两个端口上跑两个进程 →
每实例可同时承载两局比赛。进程密度是生产环境最主要的成本杠杆：单实例塞的会话
越多，需要付费的实例就越少——大型工作室每台机器跑几十个进程。这里只开两个，
是因为 8443/8444 属于少数能可靠穿过企业出口防火墙的高位端口。`launchPath`
一律以 `/local/game/` 开头——那是 Amazon GameLift Servers 解压你 build 的位置。

## 端口——玩家怎么进来

```typescript
ec2InboundPermissions: [
  { fromPort: 8443, toPort: 8444, ipRange: '0.0.0.0/0', protocol: 'TCP' },
  { fromPort: 8443, toPort: 8444, ipRange: '0.0.0.0/0', protocol: 'UDP' },
],
```

TCP 承载浏览器 WebSocket，UDP 在相同端口号上承载 WebRTC 的不可靠数据通道。

游戏客户端**直连实例**（这是 GameLift 低延迟设计的核心）——所以游戏端口必须
显式开放。只有列出的端口可达，其余全部关闭。

{{% notice warning %}}
`0.0.0.0/0` 意味着互联网上的任何主机都能访问这两个端口。这是直连模型的固有特性：
每个玩家拿到的是本次会话专属的 IP 和端口，直接连到实例上，因此来源地址无法事先
确定——而且 `ec2InboundPermissions` 只接受 CIDR 网段，不支持前缀列表或安全组引用。

真正保护会话的是**鉴权，而不是网络 ACL**：每个连入的客户端都必须出示
`PlayerSessionId`，由服务器交给 GameLift 通过 `AcceptPlayerSession` 校验（就是你
上一页读过的那段代码），所以即使端口开放，未匹配的玩家依然进不来。

生产环境请补上：为游戏端口启用网络层 DDoS 防护（AWS Shield Advanced）、把端口
范围控制在进程密度真正需要的宽度、并在玩家分布允许的情况下才收窄到已知 CIDR。
参见
[Well-Architected 安全支柱中的网络防护指南](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/protecting-networks.html)。
{{% /notice %}}

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
今天队列只有一个目的地；可选的附录 B 会加入一个远端 location——*完全不用改游戏代码*。

本模块后端**直接**在这个 fleet 上放置会话（`CreateGameSession` /
`CreatePlayerSession`），没有任何规则——这是让两个玩家进入同一局最简单的方式。
到模块 4，FlexMatch 会挡在这同一个 queue 前面，决定*谁*和*谁*共享一局。

## Fleet 生命周期状态

你的部署此刻正在经历：

```
NEW → DOWNLOADING → VALIDATING → BUILDING → ACTIVATING → ACTIVE
       (下载 build)  (install.sh)  (运行时)    (进程健康检查)  (可接会话)
```

回到终端——`cdk deploy` 返回后，继续下一页。
