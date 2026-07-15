> English: [README.md](README.md)

# Pixel Rush — Amazon GameLift 多人赛车 Workshop

一款俯视角像素赛车游戏（玩法致敬 FC 经典《公路格斗者 / Road Fighter》），
用浏览器客户端演示 **Amazon GameLift Servers** 托管与 **FlexMatch** 匹配的完整链路。
支持单人 NPC 练习赛和 2/3/4 人多人对战。

```
浏览器 (Phaser 3, CloudFront 分发)
 ├── /api/* ──► CloudFront ──► API Gateway + Lambda + DynamoDB   登录/车库/商店/赛道/排行榜
 ├── wss:// ──► API Gateway WebSocket API                        匹配结果推送 + 世界频道聊天
 └── wss:// + WebRTC(UDP) ──► GameLift fleet 上的 Go 游戏服务器   实时对战 @ 20Hz

FlexMatch ──► SNS ──► Lambda ──► WebSocket 推送给等待中的玩家（附 debug 播报）
游戏服务器 ──► POST /internal/results (共享密钥) ──► 金币/解锁/排行榜结算
```

**安全设计**：CloudFront 是唯一公开入口——S3 站点桶私有（OAC），HTTP API 拒绝
未携带 `x-origin-verify` 的请求，EC2 fleet 只开放两个游戏端口且使用 GameLift
生成的 TLS 证书（`wss://`）。

## 目录结构

| 目录 | 内容 |
|---|---|
| `server/` | Go 游戏服务器 — GameLift Server SDK v5、20Hz 权威模拟、WebSocket + WebRTC 传输 |
| `backend/` | TypeScript Lambda — 登录（8 个种子角色）、车库、商店、赛道、排行榜、FlexMatch 管道 |
| `frontend/` | Phaser 3 + Vite 浏览器客户端 — 大厅场景 + 比赛渲染（快照插值 + 本地预测） |
| `infra/` | CDK 三个 stack — Backend（API/DDB/SNS/WS）、Frontend（CloudFront+S3）、GameLift（fleet/queue/FlexMatch）、Docs（自托管教程站点） |
| `scripts/` | 构建/运行/测试脚本（`gen-track.mjs` 由种子确定性生成赛道 JSON） |
| `workshop/` | 教程内容源（Hugo，双语 `*.en.md` / `*.zh.md`）+ `static/`（图片、参与者 IAM 策略、Workshop Studio CFN 模板）；用 `scripts/convert-to-workshop-studio.py` 生成下面的目录 |
| `workshop-studio/` | 由 `workshop/` 转换生成的 **AWS Workshop Studio 原生格式**产物（`contentspec.yaml` + `content/<slug>/index.{en,zh-CN}.md`）；发布到 catalog.workshops.aws 用 |

## 玩法速览

- **操作**：左/右方向键（或 A/D）点按变道，**空格**使用道具；车辆自动前进
- **道具**：道具箱随机给**氮气**（提速 ×1.4 持续 10 秒）或**炸弹**（丢在身后，命中眩晕 1.2 秒），箱子 8 秒刷新
- **赛道**：4 条难度递增（滚动速度 300→570），完成前一条解锁下一条
- **模式**：⚡ Quick Start（纯前端本地模拟对战 1 个 NPC，秒开）；2P/3P/4P 多人（FlexMatch 匹配，45 秒凑不齐用 NPC 补位）
- **经济**：多人按名次得 200/120/80/50 金币，练习赛 40/25/…（服务端限流防刷）；金币购车（真实车型：卡罗拉→布加迪威龙，价格按真实比例 1:100）
- **登录**：统一密码 `gamelift`；用户名唯一，重名直接取回原角色；Cookie 记住会话
- **多 Arena**：登录页可选 ☁️ AWS ARENA（官方服务器）或 🔧 MY SERVER（粘贴学员自己 BackendStack 的 `ApiUrl`，前端通过 `/api/info` 自动发现其余配置）

## 网络优化（实战踩坑后的设计）

这部分是本 workshop 的独特价值——真实跨网络对战暴露的问题与解法：

1. **端口选择**：游戏端口用 **8443 + 2083**（HTTPS 类端口）。实测用户网络普遍封锁
   7777/1935 等"游戏味"端口（症状：一方永远卡在 connecting）；GameLift 禁止 ≤1025 端口，真 443 不可用。
2. **UDP 传输（WebRTC DataChannel）**：状态快照和输入走**不可靠 DataChannel**
   （`ordered:false, maxRetransmits:0`，本质是 UDP），彻底消除 TCP 队头阻塞造成的
   "冻-跳"卡顿；信令复用现有 WebSocket，UDP 被封时 8-12 秒自动回落 WS，游戏不中断。
3. **自适应插值 + 航位推算**：客户端按实测到达抖动动态调整回放延迟（100→500ms）；
   快照断供时沿速度外推最多 1.5 秒继续渲染，网络突发不冻屏。
4. **本地预测**：自己的车完全由本地渲染（按键即动，与服务器同曲线的变道动画），
   仅在撞车/眩晕等硬冲突时对齐服务器——多人手感与单机一致。
5. **无损输入协议**：左右键以**累积计数器**上报（每帧带总数，服务器消费增量），
   数学上不可能因丢帧/丢包丢失按键。
6. **断线重连**：比赛中掉线自动重连，服务器按 `playerId` 挂回原车位
   （GameLift PlayerSession 保持有效），30 秒宽限期。
7. **多区域就近放置**：fleet 同时部署 **us-east-1 / 东京 / 新加坡**；前端进大厅时
   后台并行探测三区延迟（缓存 10 分钟），随匹配请求上报 `LatencyInMs`，
   Queue 自动把每局放到对玩家整体延迟最优的区域。世界频道的 debug 消息
   （青色）会显示每次匹配的延迟数据和最终放置区域。

## 前置条件

- AWS 账号 + 凭证，区域支持 GameLift（默认 us-east-1；多区域 fleet 还会用到东京/新加坡）
- Node 20+、Go 1.26.2+、AWS CLI、CDK v2
- 依次 `npm i`：`infra/`、`backend/`、`frontend/`

## Part 1 — 后端 + 前端（暂不涉及 GameLift）

```bash
cd infra
npx cdk bootstrap          # 账号/区域首次使用 CDK 时
npx cdk deploy PixelRushBackendStack PixelRushFrontendStack
```

把输出的 `WsNotifyUrl` 写进 `frontend/public/config.json`：

```json
{ "wsNotifyUrl": "wss://XXXX.execute-api.REGION.amazonaws.com/prod" }
```

构建并发布站点，然后打开 `SiteUrl`：

```bash
cd frontend && npm run build
cd ../infra && npx cdk deploy PixelRushFrontendStack
```

现在可以登录（新名字随机分到 8 个种子角色之一——不同等级/金币/车辆）、逛车库、
买车；只有第一条赛道解锁。匹配功能还不可用。

## Part 2 — 本机跑 GameLift Anywhere

部署 GameLift 资源（仅 Anywhere fleet + FlexMatch，很快）：

```bash
cd infra && npx cdk deploy PixelRushGameLiftStack
```

把本机注册为 Anywhere compute 并启动游戏服务器：

```bash
./scripts/run-anywhere.sh    # 注册 compute、取 auth token、启动服务器
```

开**两个浏览器标签页**、两个不同名字登录，选第一条赛道 → 2P。FlexMatch 撮合两张
票据，WebSocket 推送游戏会话地址，两个标签页连到本机服务器开赛。赛果进排行榜，
完赛解锁下一条赛道。

## Part 3 — 托管 EC2 fleet（多区域）

构建 Linux 服务器并部署 fleet（三个区域全部激活约 15-20 分钟）。两个阶段：

```bash
./scripts/build-server-linux.sh

# 阶段一 stage=ec2：托管 fleet + 直接放置（无匹配规则）——同赛道就共享一局
cd infra && npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2

# 阶段二 stage=ec2-match：在同一 fleet 前加上 FlexMatch 规则匹配
npx cdk deploy PixelRushGameLiftStack PixelRushBackendStack -c stage=ec2-match
```

对战——浏览器通过 `wss://<DnsName>:8443` 连到 GameLift 托管实例（托管 fleet 有
GameLift 签发的可信 TLS 证书，无需手动信任）。`ec2-match` 阶段会话经 FlexMatch
放置在延迟最优的区域（看世界频道的青色 debug 消息确认）。控制台观察点：
*GameLift → Fleets → PixelRushFleet → Game sessions / Events*。

`stage` 三档：不带（Anywhere）/ `ec2`（直接放置）/ `ec2-match`（FlexMatch）。

## Part 4 — 清理

```bash
cd infra
npx cdk destroy PixelRushGameLiftStack PixelRushFrontendStack PixelRushBackendStack
```

注意：多区域 fleet 每区域常驻 1 台 c5.large（约 $0.085/小时 × 3），不用时务必销毁。

## 设计说明与刻意简化

- **无 JWT 鉴权** — 仅用 `playerId` 标识玩家 + 统一登录密码。生产模式参考 guidance
  仓库的 CustomIdentityComponent。
- **无 match backfill**（`backfillMode: MANUAL`）— 赛车局不接受中途加入，凑不齐由
  服务器用 NPC 补位。
- **一进程一局** — 每局结束进程退出，GameLift 拉起新进程。简单且崩溃隔离。
- **FlexMatch 通知**走 SNS → Lambda → WebSocket 推送，保留 `GET /api/matchmaking/status`
  轮询端点作为调试兜底。
- **Quick Start 纯本地** — 与服务端同构的模拟在浏览器里跑，不占用 fleet 资源，
  奖励通过限流的 `/api/race-reward` 端点发放。

## 故障排查

| 症状 | 可能原因 |
|---|---|
| EC2 上浏览器连不上游戏服务器 | `ec2InboundPermissions` 缺游戏端口。务必用 HTTPS 类端口（8443/2083 TCP+UDP）——用户网络普遍封锁 7777 等端口，症状是一方卡 connecting。GameLift 禁止 ≤1025 端口 |
| `wss://` 在 EC2 fleet 上失败 | fleet 需要 `certificateConfiguration: GENERATED`；客户端必须用 `DnsName` 而非 IP |
| fleet 上 `SERVER_PROCESS_CRASHED` 循环 | 拉实例日志排查（`aws gamelift get-compute-access` + SSM）。注意：托管 fleet 上 `GetComputeCertificate()` 返回的是证书**目录**，需拼接 `certificate.pem` |
| 匹配一直转圈 | 后端 Lambda 的 `MATCHMAKING_CONFIG_PREFIX` 指向了错误的配置（Anywhere vs Ec2） |
| Anywhere 服务器 60 秒后自动退出 | 等待超时无人加入游戏会话——设计如此 |
| `run-anywhere.sh` 约 15 分钟后报鉴权错误 | compute auth token 过期，重跑脚本即可 |
| 直接调 `execute-api` 返回 403 | 预期行为——需带 `x-origin-verify` 头（多 Arena 直连模式由前端自动携带） |
| 一方玩家画面卡顿"冻-跳" | 看 F12 控制台 `[net]` 日志：UDP 被封时走 WS 回落 + 自适应平滑；跨洋对局确认会话放置在了亚太区域 |
