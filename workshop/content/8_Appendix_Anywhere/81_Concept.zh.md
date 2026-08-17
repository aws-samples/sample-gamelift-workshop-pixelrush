---
title: "什么是 Anywhere？"
weight: 81
---

## 自带算力

Amazon GameLift Servers fleet 通常指 *AWS 托管的 EC2 实例*。**GameLift Anywhere** 反转了这一点：
**你**提供机器（笔记本、本地服务器、任意虚拟机），把它们注册为 fleet 的
*compute*，GameLift 提供其余一切——会话放置、匹配集成、玩家会话校验。

```
 托管 fleet:    GameLift 拥有机器 + 编排
 Anywhere fleet: 你拥有机器，GameLift 负责编排
```

## 为什么重要

| 场景 | Anywhere 的价值 |
|---|---|
| **开发迭代** | 改服务器代码 → 重启本地进程 → 秒级验证。无需上传 build，也无需像模块 3 那样等 15 分钟 fleet 激活。 |
| **混合托管** | 保留现有本地/裸金属算力，同时用 GameLift 统一做匹配和放置。 |
| **特殊硬件** | 在 GameLift 不提供的机型上托管。 |

## 注册握手

三个 API 调用把一台机器变成 fleet 算力：

1. `CreateLocation` — 自定义位置标签（如 `custom-pixelrush-dev`），
   我们的 CDK stack 已建好
2. `RegisterCompute` — “这个 IP 是 fleet 里的一台 compute”
3. `GetComputeAuthToken` — 短时效（约 15 分钟）凭证，**服务器进程**调用
   `InitSDK` 时使用

此后，这个进程的行为与托管 fleet 上的进程完全一致：同样的 `ProcessReady`、
同样的 `OnStartGameSession`、一切相同。这种对称性正是意义所在——你在模块 3
发布到托管 EC2 的那个二进制，在这里原封不动地跑起来。这也正是工作室
"在 Anywhere 上迭代、往托管 fleet 上发布"的原因。

{{% notice info %}}
GameLift 管理连接是主动出站连接：服务器进程连接 GameLift 服务 endpoint。
注册 compute 和上报健康状态不需要面向整个互联网开放入站规则。
{{% /notice %}}

{{% notice tip %}}
“你的机器”是哪台？**自己账号路径**：你的笔记本（本地测试可以使用
`127.0.0.1`）。**AWS 活动路径**：你的云上开发机。它的游戏端口默认关闭；
动手页面会只对你当前公网 IPv4 的 `/32` 临时开放，验证后立即删除规则。
{{% /notice %}}
