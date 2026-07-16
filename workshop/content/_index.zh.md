---
title: "Amazon GameLift Servers 实战"
chapter: true
weight: 1

---

### 部署你的第一个多人在线游戏

<br>

欢迎！在大约 **2 小时**内，你将在 AWS 上部署并运营一个完整的多人在线游戏——
复古像素风赛车游戏 **Pixel Rush**——并借助它学习 **Amazon GameLift Servers**
的核心能力：

- 什么是专用**游戏服务器**，实时多人游戏为什么需要它
- 每个托管游戏都要实现的 GameLift **Server SDK 生命周期**
- **GameLift Anywhere**——把自己的机器注册为 fleet 算力，快速迭代
- **托管 EC2 fleet**——生产级托管：build、运行时配置、会话队列
- **FlexMatch**——基于规则的匹配、票据与事件通知

![Pixel Rush 游戏画面](/images/gl-ws-game.png)
最后，你会和其他学员在共享竞技场同场对战——而匹配、会话放置、实时状态同步的
每一环，都跑在**你亲手部署**的基础设施上。

```
                    ┌─────────────────┐
                    │  API Gateway +  │
          ┌─ REST ──►    Lambda +     │   Login / Garage /
          │         │    DynamoDB     │   Leaderboard
          │         └─────────────────┘
          │
          │         ┌─────────────────┐
┌─────────┴───┐     │  API Gateway    │
│  Browser    │     │  WebSocket API  │   Match Result
│ (Phaser 3)  ├─ WS ┼─────────────────┤   Notifications
│             │     │      │Lambda    │
│Web Client   │     └──────┼──────────┘
│             │            ▲
└─────────┬───┘            │
          │         ┌──────┼──────────┐
          │         │      │          │
          └─ WS ────► GameLift Go Server  Real-time Combat
                    │                 │   @ 20Hz
                    └─────────────────┘


┌────────────┐      ┌───────┐      ┌──────────┐
│ FlexMatch  │ ───► │  SNS  │ ───► │  Lambda  │ ───► Push to waiting players
└────────────┘      └───────┘      └──────────┘
```

{{% notice info %}}
游戏代码（Go 服务器、TypeScript 后端、Phaser 前端）已备好、开箱即部署——
你会**带读关键代码，但全程无需修改任何代码**。每一步要么是可复制粘贴的命令，
要么是 AWS 控制台上的观察。
{{% /notice %}}

## 适合谁

想动手入门在 AWS 上托管实时多人游戏的开发者、解决方案架构师和技术型游戏构建者。
你**不需要**有游戏开发或 GameLift 经验——游戏已经为你写好了。

## 前置条件

- 熟悉 **AWS 控制台**和**命令行 / 终端**基本操作
- 能大致读懂 **TypeScript / Go**（你只读代码，不写代码）
- 二选一：
  - **AWS 活动现场**：无需安装——已提供浏览器 IDE
  - **自己的 AWS 账号**：具备管理员权限的账号，外加 Node 20+、Go 1.26.2+、
    AWS CLI v2、AWS CDK v2（见 *2. 环境准备 → 自己账号*）

## 费用

在自己账号里运行本 workshop 大约 **$0.20–0.50/小时**（主要是一两台 `c5.large`
GameLift 实例），**只要完成清理模块**，2 小时总花费远低于 **$1**。详见
[Amazon GameLift Servers 定价](https://aws.amazon.com/gamelift/pricing/)和
[EC2 定价](https://aws.amazon.com/ec2/pricing/)。AWS 活动现场使用提供的临时账号，
对你免费。

## 日程

| 模块                                 | 时长    |
| ---------------------------------- | ----- |
| 1. 引言——为什么需要游戏服务器、GameLift 概念      | 10 分钟 |
| 2. 环境准备——部署游戏后端                    | 20 分钟 |
| 3. GameLift Anywhere——你的机器变成 fleet | 25 分钟 |
| 4. 托管 Fleet——EC2 上的生产托管            | 25 分钟 |
| 5. FlexMatch——基于规则的匹配              | 20 分钟 |
| 6. 决赛日——验证自己的服务器，然后全员对战            | 15 分钟 |
| 7. 资源清理                            | 5 分钟  |
| 8. 总结与进阶                           | 5 分钟  |
| 附录：多区域 fleet（可选挑战）                 | 20 分钟 |

{{% notice warning %}}
本 workshop 的示例代码是教学内容，并非生产级软件。它演示 GameLift 集成模式，
并做了刻意简化（无玩家身份系统、共享的 workshop 密码、宽松的 IAM 权限）。
{{% /notice %}}
