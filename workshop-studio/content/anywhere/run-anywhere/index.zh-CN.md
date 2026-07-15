---
title: "动手：跑起来"
weight: 33
---

## 1. 部署 GameLift stack

创建 Anywhere fleet + 自定义 location + FlexMatch 匹配配置（不含 EC2，很快）：

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack --require-approval never
```

约 2 分钟。输出包含 `AnywhereFleetId` 和 `AnywhereMatchmakingConfig`。

## 2. 把你的机器注册为 fleet 算力

一个脚本完成全部注册流程：

```bash
cd ..
./scripts/run-anywhere.sh
```

观察输出——每一行都对应前面讲过的概念：

```
fleet: fleet-xxxx  compute: your-host-dev  ip: 50.x.x.x  port: 1935
                         └─ RegisterCompute：这台机器加入 fleet
starting server (auth token valid ~15 min)...
InitSDK (Anywhere): fleet=fleet-xxxx host=your-host-dev
Connected to GameLift API Gateway.        ◄─ 主动连出到 GameLift 的 WebSocket
ProcessReady on port 1935; waiting for game sessions
                         └─ 空闲且健康——等待被选中
```

让这个终端保持运行。

:::alert{type=info}
AWS 活动路径：脚本会通过预设的 `COMPUTE_IP` 环境变量自动使用开发机的公网 IP 注册。
:::

## 3. 检查点 ★

打开 AWS 控制台 → **Amazon GameLift Servers → Fleets →
PixelRushAnywhereFleet → Computes** 页签：

- 你的机器以 compute 名称在列，状态 **Active**
- 显示它的 IP 和 GameLift SDK endpoint

你已经把自己的硬件注册成了 GameLift fleet 算力：GameLift 现在知道这台机器
存在、健康（`ProcessReady` + 心跳），可以向它派发游戏会话。Anywhere 用于
**快速本地迭代、验证 SDK 集成**——真正的多人比赛在模块 4，托管 fleet 上。

:::alert{type=warning}
auth token 空闲约 15 分钟后过期。如果后面服务器退出了，重新运行
`./scripts/run-anywhere.sh` 即可。
:::
