---
title: "挑战内容"
weight: 91
---

{{% notice warning %}}
额外费用：每个新增 location 各跑一台 c5.large（各约 $0.085/小时）。
完成后记得销毁。
{{% /notice %}}

## 问题

你的 fleet 在 us-east-1。亚洲玩家要跨太平洋连接：**200–300ms RTT**——能玩，
但明显落后于本地玩家。物理距离无法被优化掉；只能让服务器靠近玩家。

## 第 1 步——给 fleet 添加 location

托管 fleet 可以以 **location** 的形式跨多个区域——同一 build、同一运行时配置，
实例遍布各地。默认 fleet 只运行单个 location（你的部署区域）；用 `extraRegions`
context 参数添加更多，无需改代码。可以看看 `infra/lib/gamelift-stack.ts` 里
fleet 如何消费它（`extraRegions` 变量和 `locations:` 数组），然后部署时加上
东京 + 新加坡：

```bash
cd infra
npx cdk deploy PixelRushGameLiftStack -c stage=ec2-match \
  -c extraRegions=ap-northeast-1,ap-southeast-1 --require-approval never
```

远程 location 激活约需 15 分钟。每个额外 location 各自运行一台 c5.large。

## 第 2 步——放置如何选区域

只加 location 不会自动路由。放置由 **queue** 决定，而它只有在票据携带延迟
数据时才按延迟路由：

1. 游戏客户端在玩家逛大厅时*后台*测量到各区域的 HTTPS 往返时延
   （见 `frontend/src/latency.ts`）
2. `StartMatchmaking` 为每个玩家附上
   `LatencyInMs: {"us-east-1": 250, "ap-northeast-1": 80, ...}`
   （见 `backend/src/request-matchmaking.ts`）
3. Queue 把每局放到**对该局玩家整体延迟最优**的 location——东京的两个人
   放东京，美亚混编的一对放在"最坏情况最小"的区域

客户端 → 票据 → Queue 这条链就是 GameLift 标准的延迟路由模式；
我们的游戏已实现第 1–2 步，因此**无需改任何代码**。

## 验证

1. 等三个 location 全部就绪：控制台 → fleet → **Locations** 页签，全部 *Active*
2. 跑一场 2P，再看 **Game sessions**——会话的 **Location** 列显示 Queue
   把你放在了哪里
3. 如果你在亚洲（或挂了 VPN）：应看到 `ap-northeast-1` 或 `ap-southeast-1`

## 检查点 ★

Fleet 显示 3 个活跃 location，且游戏会话的 Location 与该局玩家的最低延迟
区域一致。

{{% notice tip %}}
清理提醒：现在 `npx cdk destroy PixelRushGameLiftStack` 会删除**三个**区域的
实例——请在控制台确认所有 location 都已消失。
{{% /notice %}}
