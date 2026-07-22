---
title: "验证并对战"
weight: 44
---

## 读 fleet 自己讲述的故事

控制台 → **Amazon GameLift Servers → Fleets → PixelRushFleet** → **Events** 页签。
整个激活过程可以像时间线一样回放：

```
FLEET_CREATED
FLEET_STATE_DOWNLOADING          ← 从 S3 拉取你的 build
FLEET_CREATION_RUNNING_INSTALLER ← 执行了 install.sh
FLEET_STATE_VALIDATING
FLEET_CREATION_VALIDATING_RUNTIME_CONFIG
FLEET_STATE_BUILDING
FLEET_STATE_ACTIVATING           ← 进程已拉起，健康检查通过
FLEET_STATE_ACTIVE               ← 可以接客了
```

{{% notice tip %}}
以后 fleet 一旦异常，Events 页签永远是第一站——服务器二进制崩溃会以
`SERVER_PROCESS_CRASHED` 或 `SERVER_PROCESS_SDK_INITIALIZATION_TIMEOUT`
的形式出现，每条事件都带解释。
{{% /notice %}}

## 逛逛其他页签

- **Compute**：一台 c5.large 实例、公网 IP 和所在位置
- **Metrics**：可用/活跃会话数、健康进程数——自动伸缩策略依据的就是这些指标
- **Game sessions**：现在是空的——还没人比赛。

## 把前端指向托管 fleet

`-c stage=ec2` 这次部署也把后端重新配置成**直接在这个 fleet 上放置玩家**
（暂时没有匹配规则）。重新部署前端，让它用上更新后的后端：

```bash
(cd ../frontend && npm run build)
npx cdk deploy PixelRushFrontendStack -c stage=ec2 --require-approval never
```

预期输出——部署结尾会打印该 stack 的输出：

```
✅  PixelRushFrontendStack

Outputs:
PixelRushFrontendStack.SiteUrl = https://dxxxxxxxxxxxxx.cloudfront.net
Stack ARN: arn:aws:cloudformation:us-east-1:123456789012:stack/PixelRushFrontendStack/...
```

{{% notice info %}}
这次重新部署更新的是 CloudFront 分发，改动需 **5–10 分钟**才能传播到所有边缘节点。
命令刚返回时你可能仍被送到旧的缓存页面——对战前请等几分钟并强制刷新。
{{% /notice %}}

统一前端本身不用改——它仍然调用你同一个 API，只是现在比赛被路由到托管 fleet
而不是 Anywhere。

## 真正对战 ★

{{% notice warning %}}
fleet 需 **~5 分钟**就绪，过早发起对战可能会失败（显示 "Matchmaking unavailable"），
可在控制台查看 fleet 状态后再试。
{{% /notice %}}

这是游戏第一次成为真正的多人游戏：

1. 打开你的 **SiteUrl** 并登录（车手名 + `gamelift`）
2. **RACE** → 选一条赛道 → **2P**
3. 再开一个**浏览器标签**，用*不同*的车手名登录，选**同一条赛道 → 2P**
4. 两个标签会进入托管 fleet 上的**同一局**——倒计时，然后开赛。这次没有任何
   证书告警：fleet 有 GameLift 签发的 TLS 证书，客户端的 `wss://` 连接自动受信任。

每个请求背后：后端在你的 fleet 上调 `SearchGameSessions`——第一个玩家的赛道还
没有开放会话，于是 `CreateGameSession`；第二个玩家匹配到这个会话并加入。没有规则，
只是"同赛道、共享一局"。

## 检查点 ★

- Fleet 状态 **ACTIVE**，Compute 页签有一台活跃实例
- 两个浏览器标签互相完成了一场比赛
- 控制台 → **Game sessions** 页签出现一个 `ACTIVE`（或刚 `TERMINATED`）的会话，
  含 2 个 player session

{{% notice info %}}
注意*缺了*什么：没有任何规则约束你和谁比。两个标签选不同赛道就碰不到一起；
没有等级平衡、没有队伍人数、没有基于延迟的区域选择。把这些都加上——而且干净地
挡在同一个 fleet 前面——就是模块 5。
{{% /notice %}}
