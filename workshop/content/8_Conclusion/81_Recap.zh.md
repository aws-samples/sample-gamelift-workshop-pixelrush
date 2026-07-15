---
title: "你学到了什么"
weight: 81
---

## 模块 ↔ 能力 ↔ 你做了什么

| 模块 | GameLift 能力 | 你实际做的事 |
|---|---|---|
| 1 | 专用游戏服务器、组件模型 | 建立心智地图 |
| 2 | —（Serverless 游戏后端） | 用 CDK 部署 API + 网页客户端 |
| 3 | **GameLift Anywhere**、**Server SDK 生命周期** | 把自己的机器注册为 fleet 算力；在真实 Go 代码中读 `InitSDK → ProcessReady → OnStartGameSession → AcceptPlayerSession → ProcessEnding`；本机托管一局会话 |
| 4 | **Build、托管 fleet、Queue** | 上传 build；部署 EC2 fleet；读运行时配置/端口/TLS；看 fleet 事件走到 ACTIVE |
| 5 | **FlexMatch** | 逐行读规则集（teams、rules、expansions）；追踪票据生命周期；见识 SNS 事件推送；在自己的 fleet 上匹配成局 |
| 6 | 完整管道 | 通过 arena 选择器验证自己的技术栈；在共享竞技场全员对战 |

## 一张图带走

```
Build ──► Fleet（托管 EC2 / Anywhere）──► 服务器进程（Server SDK）
                                                ▲
玩家 ──► StartMatchmaking ──► FlexMatch ──► Queue ┘（放置游戏会话）
  ▲                              │
  └──── SNS ► Lambda ► WebSocket ┘（连接信息 + PlayerSessionId）
```

如果你能凭记忆重画这张图，你就理解了 GameLift。
