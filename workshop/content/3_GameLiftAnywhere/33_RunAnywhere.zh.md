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

第 1 步结束时你在 `infra/`。先回到仓库根目录，再运行脚本（脚本路径相对仓库根目录）：

```bash
cd ..          # 从 infra/ 回到仓库根目录
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

{{% notice note %}}
AWS 活动路径：脚本会通过预设的 `COMPUTE_IP` 环境变量自动使用开发机的公网 IP 注册。
{{% /notice %}}

## 3. 检查点 ★

不用开控制台——用 AWS CLI 直接查。先从 GameLift stack 的输出拿到 Anywhere fleet ID：

```bash
FLEET_ID=$(aws cloudformation describe-stacks --stack-name PixelRushGameLiftStack \
  --query "Stacks[0].Outputs[?OutputKey=='AnywhereFleetId'].OutputValue" --output text)
echo "fleet: $FLEET_ID"
```

列出这个 fleet 下已注册的 compute（就是你刚注册的机器）：

```bash
aws gamelift list-compute --fleet-id "$FLEET_ID" \
  --query "ComputeList[].{Name:ComputeName,Status:ComputeStatus,IP:IpAddress,Location:Location}" \
  --output table
```

再用 compute 名（第 2 步脚本输出里 `compute:` 那个，默认 `$(hostname -s)-dev`）查单台详情，
能额外看到 GameLift SDK endpoint：

```bash
aws gamelift describe-compute --fleet-id "$FLEET_ID" \
  --compute-name "$(hostname -s)-dev" \
  --query "Compute.{Name:ComputeName,Status:ComputeStatus,IP:IpAddress,Location:Location,Endpoint:GameLiftServiceSdkEndpoint}" \
  --output table
```

预期——你的机器在列，状态 **Active**，并显示它的 IP、location 和 GameLift SDK endpoint：

```
--------------------------------------------------------
|                    DescribeCompute                   |
+----------+-------------------------------------------+
|  Endpoint|  wss://us-east-1.api.amazongamelift.com   |
|  IP      |  127.0.0.1                                |
|  Location|  custom-pixelrush-dev                     |
|  Name    |  your-host-dev                            |
|  Status  |  Active                                   |
+----------+-------------------------------------------+
```

你已经把自己的硬件注册成了 GameLift fleet 算力：GameLift 现在知道这台机器
存在、健康（`ProcessReady` + 心跳），可以向它派发游戏会话。Anywhere 用于
**快速本地迭代、验证 SDK 集成**——真正的多人比赛在模块 4，托管 fleet 上。

{{% notice warning %}}
auth token 空闲约 15 分钟后过期。如果后面服务器退出了，重新运行
`./scripts/run-anywhere.sh` 即可。
{{% /notice %}}
