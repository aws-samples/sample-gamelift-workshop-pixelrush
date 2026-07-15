---
title: "GameLift 核心概念"
weight: 12
---

## 组件全景图

今天要部署的一切都在这一张图上。请记住它——workshop 的每个模块会点亮其中一块。

![Amazon GameLift 组件全景图](/images/gamelift-arch.png)

| 组件 | 一句话 | 在哪个模块动手 |
|---|---|---|
| **Build** | 你上传的服务器二进制 + 安装脚本 | 模块 4 |
| **Fleet（托管 EC2）** | AWS 托管的实例，运行你的服务器进程 | 模块 4 |
| **Fleet（Anywhere）** | *你自己的*硬件注册为 fleet 算力 | 模块 3 |
| **Game Session** | 某个服务器进程上正在运行的一局比赛 | 模块 3–6 |
| **Game Session Queue** | 决定每一局新会话放到哪个 fleet/位置 | 模块 4 |
| **FlexMatch** | 按规则把玩家分组，然后请 Queue 开局 | 模块 5 |

## Server SDK 生命周期

要让 GameLift 管理你的服务器进程，进程必须实现 **Server SDK 协议**。
四个回调就是全部：

```
 进程启动
      │
      ▼
  InitSDK()            “GameLift 你好，我存在了”      （连接到服务）
      │
      ▼
  ProcessReady(port)   “我健康，可以在这个端口开局”
      │
      ▼   ……等待，可能长达数小时……
      │
  OnStartGameSession   “一局比赛放到你身上了——激活！”
      │                   └── 服务器调用 ActivateGameSession()
      ▼
  玩家连入 ──► AcceptPlayerSession(id)   逐个校验连入的玩家
      │
      ▼   ……比赛进行中……
      │
  ProcessEnding()      “这局结束了，回收我”
      └── 进程退出；GameLift 拉起新进程
```

模块 3 中你会在 Go 代码里看到这些调用的原样实现——同一契约适用于任何引擎
（Unreal、Unity、自研 C++/C#/Go）。

{{% notice info %}}
关键认知：GameLift 从不"启动一个游戏"——它启动的是**你的进程**，并通过这些回调
与之通信。游戏逻辑（赛车、物理、道具）100% 是你的；生命周期 100% 是 GameLift 的。
{{% /notice %}}
