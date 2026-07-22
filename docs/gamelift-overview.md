# Pixel Rush × GameLift 集成概览

一份帮助理解「游戏如何接入 GameLift」的简明说明,聚焦方法、流程与脚本。

---

## 1. 四个角色

| 角色 | 是什么 | 职责 |
|---|---|---|
| **前端** (`frontend/`) | 玩家浏览器里的游戏客户端 | 采集按键、渲染画面。**不算游戏逻辑** |
| **后端** (`backend/`) | 常驻业务 API(Lambda + API Gateway) | 登录、发起匹配、存排行榜、读写数据库 |
| **游戏服务器** (`server/`) | 跑在 GameLift 算力上的 Go 进程 | 权威物理仿真、裁判、广播状态。**一局一进程** |
| **GameLift 服务** | AWS 云端控制面 | 匹配(FlexMatch)、创建/放置对局、管理进程 |

> **关键**:游戏服务器是工作室自研的**计算节点**,只 import 了 GameLift SDK 这个库。它**不碰数据库**;重度实时对接前端(WebSocket/UDP),轻度单向对接后端(对局结束 POST 一次成绩)。

---

## 2. GameLift SDK 不做匹配

匹配算法运行在 **AWS 云端**(由后端调 `StartMatchmaking` 触发),和游戏服务器进程无关。
游戏服务器用的 **Server SDK 只管进程生命周期**:注册待命、接收匹配结果、验证玩家、跑对局、退出。

所有 SDK 调用都集中在一个文件:`server/gamelift/manager.go`(唯一碰 SDK 的地方,让游戏逻辑保持 SDK 无关)。

---

## 3. SDK 生命周期方法

```
进程启动
  InitSDK          建立到 GameLift 的 WebSocket 长连接
  ProcessReady     注册进程 = "我空闲待命,可接对局"(注册回调)
      │
      │ (空闲挂着,可能很久;心跳/健康检查持续走这条连接)
      ▼
  OnStartGameSession   ← GameLift 放置对局时【推下来】,回调触发。建 Room
  ActivateGameSession  ← "对局我跑起来了,可以放玩家进来"
      │
      │ (玩家陆续连入)
  AcceptPlayerSession  ← 每个玩家发 join 时,核验其 playerSessionId(RESERVED→ACTIVE)
      │
      ▼ (对局结束)
  ProcessEnding + Destroy + os.Exit   进程退出;GameLift 重拉新进程补位
```

**回调 vs 主动调用**:`OnStartGameSession`、`OnHealthCheck`、`OnProcessTerminate` 都是**注册给 SDK**(经 `ProcessReady`),由 **SDK 内部收到 GameLift 消息时回调**——你的代码从不主动调它们。

| 方法 | 触发者 | 次数 | 含义 |
|---|---|---|---|
| `InitSDK` / `ProcessReady` | 进程自己(启动时) | 1 | 连接 + 待命 |
| `OnStartGameSession` | **GameLift**(放置对局) | 一局 1 次 | 开局(玩家还没连) |
| `AcceptPlayerSession` | **玩家**(连上发 join) | 每玩家 1 次 | 验票入座 |
| `ProcessEnding` | 进程自己(对局结束) | 1 | 下线,进程退出 |

---

## 4. 关键概念

**数量关系**
```
1 台实例 (c5.2xlarge)
  └─ 32 个进程 (一端口一个,SESSIONS_PER_INSTANCE=32)
       └─ 每个进程 : 1 个 game session (本项目跑完即弃,严格 1:1)
            └─ 1 个 game.Room
                 └─ N 个 player session (每个玩家一个)
```

**两条独立的 WebSocket**(别混淆)
| | SDK 控制连接 | 游戏数据连接 |
|---|---|---|
| 谁↔谁 | 进程 ↔ GameLift 服务 | 玩家 ↔ 进程 |
| 用途 | 注册、派活、心跳、验票 | join / input / 状态广播 |
| 库 | GameLift SDK | gorilla/websocket |

**GameLift 怎么知道哪些进程空闲**:靠 SDK 长连接 + 进程上报的信号,配合心跳/`OnHealthCheck` 剔除故障进程。判定空闲 = ProcessReady 过 + 当前无 session + 健康。一个进程在 GameLift 眼里的状态流转:

```
(进程启动, InitSDK 连上)
      │
 ProcessReady ─────────────▶  ★ ACTIVE / 空闲   ← 可被派 session
      │                            │
      │                    GameLift 放置一局
      │                            ▼
      │                       忙碌 (hosting 1 session)
      │                            │
      │                     ProcessEnding + os.Exit
      │                            ▼
      └───────────────────▶  连接断开 → GameLift 移除该进程
                                     │
                            Agent 发现该端口少了一个进程 (concurrentExecutions:1)
                                     ▼
                            重拉新进程 → 又 ProcessReady → 回到"空闲池"
```

**权威服务器**:玩家只上传输入(累计 tap 计数 + 用道具),服务器算出位置/碰撞/名次并广播。防作弊、保证所有人看到同一个世界。

---

## 5. 完整对战流程

### 简版

```
玩家点"对战"
  → 后端 StartMatchmaking(FlexMatch)         [云端匹配开始]
    → GameLift 撮合够人,创建 game session
      → 挑一个空闲进程,推 OnStartGameSession   [开局,建空房间]
        → ActivateGameSession
      → 连接信息(IP:port + playerSessionId)推回前端
  → 前端连游戏服务器,发 join
    → AcceptPlayerSession 核验(每玩家)         [验票入座]
  → 名单到齐/超时 → 倒计时 → 开赛(20Hz 广播)
  → 结束 → 广播成绩 + POST 后端存档 → 进程退出
```

**注意**:玩家在网页"进入游戏"时连的是**后端**(聊天/等匹配),那时还没有属于他的游戏服务器。**匹配成功后 GameLift 才分配一台服务器**,前端再连过去发 join——这条 join 才触发 `AcceptPlayerSession`。

### 详版:开局到玩家入座(4 角色 + 2 连接时序)

```
玩家浏览器        后端(Lambda)        GameLift 服务         游戏服务器进程
(前端)          (API GW)            (AWS 控制面)          (SDK + game.Room)
   │                 │                    │                     │
   │                 │                    │   【很早以前:进程启动即待命】
   │                 │                    │◀─── InitSDK(连 wss)──┤ 建 SDK 控制连接
   │                 │                    │◀─── ProcessReady ────┤ "我空闲" → 进空闲池
   │                 │                    │····心跳/健康检查(持续,走 SDK 连接)····│
   │                 │                    │                     │ (空闲挂着,等派活)
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ 玩家点"对战" ══
   │                 │                    │                     │
   ├──点对战─────────▶│                    │                     │
   │                 ├─StartMatchmaking──▶│                     │
   │                 │                    │ (撮合够人:2/4/8)     │
   │                 │                    │ 创建 game session     │
   │                 │                    │ 挑一个空闲进程放置      │
   │                 │                    │                     │
   │                 │                    │── OnStartGameSession ▶│ ★一局1次,玩家还没连
   │                 │                    │   (带 MatchmakerData) │  ├ 解析预期名单+赛道
   │                 │                    │                     │  ├ NewRoom(建空房间)
   │                 │                    │                     │  ├ go room.Run()
   │                 │                    │◀── ActivateGameSession┤  └ "会话我跑起来了"
   │                 │                    │                     │
   │                 │◀─匹配成功事件(含 IP:port+playerSessionId)  │ (推给 GameLift→后端)
   │◀─推送连接信息────┤ process-matchmaking-events               │
   │  (worldChat WS) │                    │                     │
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ 玩家连游戏服务器 ══
   │                 │                    │                     │
   ├──────建【游戏连接】WebSocket 到 IP:port───────────────────────▶│ (gorilla,另一条连接)
   ├──────发 join {playerSessionId,...}──────────────────────────▶│ handleJoin
   │                 │                    │◀ AcceptPlayerSession(psid)  ★每玩家1次
   │                 │                    │   (经 SDK 连接问 GameLift 核验票)
   │                 │                    │── 验证OK: RESERVED→ACTIVE ─▶│
   │◀─────joined {yourSlot, roster}──────────────────────────────┤ 入座成功
   │                 │                    │                     │
   │  ……其余玩家重复上面"连接+join+AcceptPlayerSession"……          │
   │                 │                    │                     │ 名单到齐/超时
   │◀─────countdown 3,2,1 → race_start ──────────────────────────┤ 开赛(20Hz)
   │◀═════ state 快照(优先 UDP 快通道)═══════════════════════════│
   │                 │                    │                     │
═══╪═════════════════╪════════════════════╪═════════════════════╪══ 对局结束 ══
   │◀─────results ───────────────────────────────────────────────┤ finishRace
   │                 │◀─ POST /internal/results(成绩)────────────┤ (走普通 HTTP)
   │                 │                    │◀── ProcessEnding ────┤
   │                 │                    │    (连接断)          ┤ os.Exit(0)
   │                 │                    │ Agent 同端口重拉新进程 → 又 ProcessReady → 回空闲池
```

**图里要抓的 5 个点**
1. **两条连接分工**:左侧「SDK 控制连接」跑注册/派活/心跳/验票;右侧「游戏连接」跑 join/state/results。
2. **`ProcessReady` 早于一切**:进程启动就待命,和玩家/对战无关(可能发生在很久以前)。
3. **`OnStartGameSession` 先、`AcceptPlayerSession` 后**:先建空房间(GameLift 触发,1 次),玩家再陆续连上验票(玩家触发,N 次)。
4. **一次玩家加入用到两条连接**:join 从游戏连接进来 → 服务器用 SDK 连接问 GameLift 核验 → 再从游戏连接回 joined。
5. **结尾闭环**:`ProcessEnding + os.Exit` → 连接断 → GameLift 感知 → Agent 重拉新进程 → `ProcessReady` 回空闲池(用完即弃 + 自动补位)。

---

## 6. 两种部署模式

| | **Anywhere**(Module 3) | **Managed EC2**(Module 4/5) |
|---|---|---|
| 算力(跑进程的机器) | **你自己的机器** | GameLift 托管的 EC2 |
| GameLift 服务(云端) | ✅ 照常使用 | ✅ 照常使用 |
| 谁注册机器 | 你跑 `register-compute` | 自动 |
| 谁启动 go 进程 | 你(脚本 `go run .`) | **GameLift Agent** 按 runtimeConfiguration 自动拉起 |
| InitSDK 参数来源 | 命令行 flag(脚本传) | 环境变量(Agent 注入) |

> Anywhere 缺的只是**本地 Agent**(脚本代劳注册+启动),**不是云端 GameLift 服务**。
> 意义:把 Managed 模式下 Agent 自动做的事拆开手动走一遍,让链路透明可见。

代码里的分叉:`manager.go` 中 `if m.Anywhere != nil` → 走 flag;`else` → 走环境变量。

---

## 7. 脚本说明(`scripts/`)

**工作流 shell 脚本(3 个,重点)**

| 脚本 | 作用 | 对应 |
|---|---|---|
| `run-anywhere.sh` | 注册本机为 Anywhere 算力 + 启动服务器 | Module 3 |
| `build-server-linux.sh` | 交叉编译 Linux 二进制 + 生成 install.sh,供 CDK 打包成 build | Module 4/5 |
| `install-dev-tools.sh` | 开发机 UserData 调用,装 Go/Node/CDK/code-server | 环境准备 |

**内容生成器**
- `gen-track.mjs`:种子化生成赛道 JSON(产物在 `server/game/tracksdata/`)。

**测试脚本(其余 `.mjs`,线上不参与)**
- **无头协议测试**(用 `ws` 直连服务器):`smoke-client` / `input-isolation` / `rejoin` / `jitter` / `rtc-*` 等,验证服务器逻辑。
- **浏览器 E2E**(Playwright):`browser-flexmatch` / `browser-lobby` / `browser-login` / `browser-race` 等,验证整站。
- **截图/视觉**:`lobby-shot` / `icon-test` / `layout-test` / `track-cards-test`。

---

## 一句话总览

**后端发起匹配 → 云端 GameLift 撮合并放置对局到一个空闲进程(`OnStartGameSession`)→ 玩家连上验票入座(`AcceptPlayerSession`)→ 进程权威跑完一局 → `ProcessEnding` 退出、自动补位。** 游戏服务器只负责「把这一局算对算快」,匹配、存档、扩容由 GameLift 服务和后端分担。
