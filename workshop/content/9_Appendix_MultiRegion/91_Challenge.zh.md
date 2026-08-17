---
title: "挑战内容"
weight: 91
---

{{% notice warning %}}
额外费用：你新增的那个 location 会各跑一台 c5.large，这是在 us-east-1 那台之外的
开销——按区域不同大约 **$0.11–0.14/小时**。准确价格请查阅
[Amazon GameLift Servers 实例定价](https://aws.amazon.com/gamelift/pricing/instance-pricing/)。
完成后记得销毁。
{{% /notice %}}

## 问题

你的 fleet 在 us-east-1。亚洲玩家要跨太平洋连接：**200–300ms RTT**——能玩，
但明显落后于本地玩家。物理距离无法被优化掉；只能让服务器靠近玩家。

## 第 1 步——给 fleet 添加一个 location

托管 fleet 可以以 **location** 的形式跨多个区域——同一 build、同一运行时配置，
实例遍布各地。你的 fleet 现在只有一个 location（部署区域）。在控制台再加一个：

1. 控制台 → **Amazon GameLift Servers → Fleets**，选择 **PixelRushFleet**。
   它必须处于 **ACTIVE** 状态才能编辑。
2. 打开 **Locations** 页签——现在只列出你的部署区域。
3. 点 **Add**，选**一个**远程 location。建议选离你最近的区域：这样第 2 步的
   延迟路由才能在你自己的游戏里看出效果。列表只会给出该实例类型可用的区域。
4. 再点 **Add** 确认。新 location 会以 `NEW` 状态出现，Amazon GameLift Servers
   随即开始在那里开一台实例。
5. **不用在这儿等。** 激活约需 15 分钟。现在就往下读第 2 步，回来刷新这个页签，
   状态会依次变成 `NEW → ACTIVATING → ACTIVE`。

{{% notice info %}}
这里刻意用控制台而不是重新部署：**Add** 会立刻返回，你可以边等实例开通边继续阅读；
而 `cdk deploy` 会一直阻塞到 fleet 重新回到 `ACTIVE` 才结束。

想看同一件事在基础设施即代码里怎么表达，可以打开 `infra/lib/gamelift-stack.ts`，
看 `extraRegions` 变量和 `locations:` 数组——那就是你刚才这几下点击的部署期等价物。
{{% /notice %}}

{{% notice warning %}}
控制台上的改动属于 CloudFormation **drift**：新 location 并不在模板里。之后任何一次
`cdk deploy PixelRushGameLiftStack` 都会把它删掉，所以建议把本附录放在最后做。
清理不受影响——`cdk destroy` 两种情况下都会删掉整个 fleet。
{{% /notice %}}

## 第 2 步——放置如何选区域

只加 location 不会自动路由。放置由 **queue** 决定，而它只有在票据携带延迟
数据时才按延迟路由：

1. 游戏客户端在玩家逛大厅时*后台*测量到各区域的 HTTPS 往返时延
   （见 `frontend/src/latency.ts`）
2. `StartMatchmaking` 为每个玩家附上
   `LatencyInMs: {"us-east-1": 250, "ap-northeast-1": 80, ...}`
   （见 `backend/src/request-matchmaking.ts`）
3. Queue 把每局放到**对该局玩家整体延迟最优**的 location——两个都靠近你新增
   location 的玩家会被放到那里；混编的一对则放在"最坏情况最小"的区域

客户端 → 票据 → Queue 这条链就是 Amazon GameLift Servers 标准的延迟路由模式；
我们的游戏已实现第 1–2 步，因此**无需改任何代码**。

{{% notice info %}}
Queue 本身不需要改动就能生效：它的 `priorityConfiguration` 已经把 `LATENCY` 排在
第一位，而这对 fleet 拥有的**每一个** location 都适用——包括在 queue 创建之后才
添加的。只有 `locationOrder`（延迟相同时的次级排序依据）里仍然只写着部署区域。
{{% /notice %}}

## 验证

1. 等两个 location 都变成 *Active*：控制台 → fleet → **Locations** 页签
2. 跑一场 2P，再看 **Game sessions**——会话的 **Location** 列显示 Queue
   把你放在了哪里
3. 如果你（或你的 VPN）离新增的那个 location 比离部署区域更近，会话就应该被
   放到新的那个区域

## 检查点 ★

Fleet 显示 2 个活跃 location，且游戏会话的 Location 与该局玩家的最低延迟
区域一致。

{{% notice tip %}}
清理提醒：`npx cdk destroy PixelRushGameLiftStack` 会删除**两个**区域的实例——
请在控制台确认已没有残留的 location。
{{% /notice %}}
