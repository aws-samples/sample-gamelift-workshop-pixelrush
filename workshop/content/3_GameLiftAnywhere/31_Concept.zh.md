---
title: "什么是 Anywhere？"
weight: 31
---

## 自带算力

GameLift fleet 通常指 *AWS 托管的 EC2 实例*。**GameLift Anywhere** 反转了这一点：
**你**提供机器（笔记本、本地服务器、任意虚拟机），把它们注册为 fleet 的
*compute*，GameLift 提供其余一切——会话放置、匹配集成、玩家会话校验。

```
 托管 fleet:    GameLift 拥有机器 + 编排
 Anywhere fleet: 你拥有机器，GameLift 负责编排
```

## 为什么重要

| 场景 | Anywhere 的价值 |
|---|---|
| **开发迭代** | 改服务器代码 → 重启本地进程 → 秒级验证。无需上传 build，无需等 15 分钟 fleet 激活。*（今天我们就这么干。）* |
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
同样的 `OnStartGameSession`、一切相同。这种对称性正是意义所在——今天在
Anywhere 上验证过的代码，模块 4 中原封不动地部署到托管 EC2。

{{% notice tip %}}
今天"你的机器"是哪台？**自己账号路径**：你的笔记本（游戏客户端连
`127.0.0.1`）。**AWS 活动路径**：你的云上开发机（安全组已放行游戏端口）。
{{% /notice %}}
