# Amazon GameLift Workshop 设计方案 v3（Pixel Rush 版）

> 状态：待 review。确认后生成 Hugo 内容 + Workshop Studio CFN 模板。
>
> v3 变更：总时长压缩到 **~2 小时**；难度下调（全程复制粘贴命令、控制台观察优先、
> 只读代码不改代码）；原"Server SDK"独立模块并入 Anywhere 模块；明确 Mac 笔记本
> 注册 Anywhere 的可行性与双路径差异。

## 一、模板可行性

`aws-modernization-workshop-base` 适用：Hugo + hugo-theme-learn，内容全部是带
frontmatter 的 Markdown；自带侧边导航/搜索/notice 提示块/代码一键复制；`webspec.yml`
已配好 CodeBuild 构建发布管线。本仓库 `workshop/` 目录存放 `content/`、`static/`、
`config.toml`，发布时套入 base 模板构建。

## 二、Workshop 定位

| 项 | 内容 |
|---|---|
| 名称 | Amazon GameLift 实战：部署你的第一个多人在线游戏<br>Hands-on Amazon GameLift: Deploy Your First Multiplayer Game |
| 受众 | 对游戏后端感兴趣的开发者/架构师，**无 GameLift 经验要求** |
| 时长 | **约 2 小时**（125 分钟，含 15 分钟 fleet 激活等待的重叠利用）+ 可选附录 20 分钟 |
| 语言 | **双语**（English + 中文），Hugo 多语言模式，每页 `.en.md` / `.zh.md` |
| 难度 | 入门——所有命令可复制粘贴；读关键代码但**不改任何代码**；观察以控制台为主 |
| 教学焦点 | **GameLift 核心能力本身**：托管概念、Server SDK 生命周期、Anywhere、托管 fleet、FlexMatch。Pixel Rush 游戏只是让链路"看得见摸得着"的 demo 载体 |
| 终点体验 | 学员部署出自己的完整游戏栈并验证（MY SERVER），再全员进入官方 AWS ARENA 同场对战 |

## 三、双路径环境（关键差异点）

| | 路径 A：AWS 主办活动（Workshop Studio） | 路径 B：自己账号 |
|---|---|---|
| 账号 | Workshop Studio 临时账号 | 学员自己的账号（费用提醒 ~$0.20/小时） |
| 开发环境 | **CFN 预置的 EC2 开发机**（code-server 浏览器 IDE，预装全部工具+预克隆仓库） | 学员自己的笔记本（Mac/Windows/Linux 均可） |
| Anywhere 注册的"算力" | 预置的 EC2 开发机（安全组已开游戏端口，浏览器可直连） | **学员的笔记本本身**——`run-anywhere.sh` 直接把本机注册为 compute（本项目开发即全程用 Mac 验证过此路径），浏览器连 `127.0.0.1` |
| 工具准备 | 零安装 | Node 20+ / Go 1.22+ / AWS CLI / CDK（Setup 模块给安装链接） |

> Mac 注册可行性说明：GameLift Anywhere 的 compute 只是"一个能跑 Server SDK 进程、
> 能被客户端网络可达的机器"。`register-compute` 登记 IP，服务器进程通过 WebSocket
> 主动连 GameLift 服务端（出方向），无需公网入方向——本机自测时客户端与服务器同机，
> 用 127.0.0.1 即可。脚本 `scripts/run-anywhere.sh` 已封装全部步骤且实测可用。

## 四、模块结构（v3，~125 分钟）

```
content/
├── _index.md                      首页：一段话简介 + 架构总览图 + 时长表
│
├── 1_Introduction/  (10 min · 纯阅读)
│   ├── 11_WhyGameLift             为什么实时多人游戏需要托管游戏服务器
│   │                              （状态同步/tick 循环 vs 无状态 API，一页讲清）
│   └── 12_CoreConcepts            GameLift 组件一页图：Build → Fleet(托管/Anywhere) →
│                                  Game Session ← Queue ← FlexMatch；
│                                  Server SDK 生命周期概念图（InitSDK→ProcessReady→
│                                  OnStartGameSession→Accept PlayerSession→ProcessEnding）
│
├── 2_Setup/  (20 min)
│   ├── 21_AWSEvent                路径A：进入 Workshop Studio、打开预置 code-server
│   ├── 22_OwnAccount              路径B：工具安装清单 + 费用提醒
│   ├── 23_Bootstrap               克隆仓库、npm i、cdk bootstrap（可复制命令块）
│   └── 24_DeployGame              一条命令部署 Backend+Frontend stack；
│                                  写 config.json；打开自己的站点登录
│                                  ★检查点：进入大厅，逛商店（此时还不能比赛）
│
├── 3_GameLiftAnywhere/  (25 min · 本 workshop 的第一个"啊哈"时刻)
│   ├── 31_Concept                 (5m) Anywhere = 自带算力注册进 fleet，
│   │                              GameLift 只负责会话编排。开发迭代/混合部署场景
│   ├── 32_ServerLifecycle         (10m) 带读 server/gamelift/manager.go 四个回调：
│   │                              代码片段+注释讲解，不要求修改
│   ├── 33_RunAnywhere             (10m) 动手：部署 GameLiftStack（仅 Anywhere，很快）→
│   │                              一条命令 ./scripts/run-anywhere.sh（内部自动完成
│   │                              register-compute / get-compute-auth-token / 启动服务器，
│   │                              输出逐行讲解）→ 游戏里发起 Quick Start
│   └──                            ★检查点：GameLift 控制台 Fleets → Anywhere fleet →
│                                  看到自己算力上的 ACTIVE game session
│
├── 4_ManagedFleet/  (25 min，其中 ~15 min 为激活等待)
│   ├── 41_BuildAndDeploy          动手：./scripts/build-server-linux.sh +
│   │                              cdk deploy -c stage=ec2（两条命令）；
│   │                              讲解 Build 上传→fleet 创建在背后做了什么
│   ├── 42_FleetAnatomy            （等待期阅读）fleet 关键配置逐项讲：实例类型、
│   │                              运行时配置(进程数/启动参数)、端口开放、TLS 证书、
│   │                              Game Session Queue 的作用
│   └── 43_Verify                  控制台观察 fleet Events 时间线（DOWNLOADING→
│                                  VALIDATING→BUILDING→ACTIVATING→ACTIVE）
│                                  ★检查点：fleet ACTIVE
│
├── 5_FlexMatch/  (20 min · 聚焦 FlexMatch 本身)
│   ├── 51_RuleSets                规则集语法：teams / rules / expansions；
│   │                              逐行读我们的 2P 规则（SameTrack、SimilarLevel、
│   │                              45 秒 minPlayers 松弛），说明每行的作用
│   ├── 52_TicketLifecycle         匹配配置↔Queue 的关系；票据状态机
│   │                              （SEARCHING→PLACING→COMPLETED/TIMED_OUT）；
│   │                              SNS 事件通知集成模式（时序图）
│   └── 53_MatchExercise           动手：一条命令切到 EC2 匹配配置并重新部署后端 →
│                                  游戏里发起 2P 匹配 → 控制台 FlexMatch 页观察票据流转
│                                  ★检查点：票据 COMPLETED，浏览器进入比赛
│
├── 6_RaceDay/  (15 min · 终局体验)
│   ├── 61_VerifyMyServer          ①前端登录页选 MY SERVER，输入自己 BackendStack 的
│   │                              ApiUrl → 登录 → 匹配 → 在**自己的 fleet** 上完赛。
│   │                              这一步 = "我部署的全链路是通的"的最终验证
│   └── 62_AWSArena                ②切回 AWS ARENA（官方服务器）→ 全员 2P/3P/4P
│                                  同场对战（讲师组织分组）
│                                  ★检查点：两种 Arena 各完成一场比赛
│
├── 7_Cleanup/  (5 min)
│   └── 71_Destroy                 cdk destroy 三个 stack（一条命令）+
│                                  控制台确认 fleet 删除的检查清单
│
├── 8_Conclusion/  (5 min)
│   ├── 81_Recap                   知识点回顾表（模块 ↔ GameLift 能力 ↔ 你做了什么）
│   └── 82_NextSteps               进阶：可选多区域附录、match backfill、FleetIQ、
│                                  容器 fleet、玩家身份(JWT)；guidance repo 链接
│
└── 9_Appendix_MultiRegion/  (可选 · 20 min)
    └── 91_MultiRegionChallenge    挑战：给 fleet 增加东京/新加坡 location（改 CDK 一处
                                   数组，教程给出现成代码块）；LatencyInMs 上报与
                                   Queue 就近放置原理；验证会话被放到亚太区域
```

### v3 相对 v2 的压缩说明
- 原独立的"Server SDK 读代码 + 本地 --no-gamelift 对战"模块（25m）→ 并入 Anywhere
  模块的 32 小节（10m 读代码），删除本地直连练习（Anywhere 本身就能验证服务器运行）
- FlexMatch 30m → 20m：删 CLI `describe-matchmaking` 练习，改为控制台观察
- Introduction 15m → 10m：架构讲解合并为两页
- 多区域从正式模块降级为**可选附录**
- 净时长 10+20+25+25+20+15+5+5 = **125 分钟**

## 五、Workshop Studio CFN 预置模板（本期交付）

文件：`workshop/static/infrastructure/workshop-studio.yaml`

| 资源 | 说明 |
|---|---|
| EC2 开发机 (t3.large, AL2023) | code-server（浏览器 VS Code），学员零安装 |
| UserData 预置 | Node 20 / Go 1.22 / AWS CLI v2 / CDK；预克隆 workshop 仓库；预跑 npm i |
| 实例角色 | CDK bootstrap/deploy 所需权限（workshop 范围内放宽） |
| 安全组 | code-server 端口(8080, 限 Workshop Studio 访问方式) + **游戏端口 8443/2083 TCP**（Anywhere 模块中学员浏览器需直连这台机器上的游戏服务器；`run-anywhere.sh` 用 `COMPUTE_IP` 指定实例公网 IP 注册） |
| 输出 | code-server URL + 初始密码 |

## 六、素材清单

- 架构总览图（首页 + 12_CoreConcepts，draw.io 绘制）
- Server SDK 生命周期图（12/32 共用）
- FlexMatch 票据时序图（52）
- 控制台/游戏截图约 15 张（部分可复用 scripts/shots/ 现有截图）

## 七、本轮已确认事项（记录）

- ✅ 双语（en+zh）
- ✅ 多区域 = 可选附录
- ✅ Workshop Studio CFN 模板本期实现
- ✅ 读代码不改代码
- ✅ Mac 笔记本可注册 Anywhere（本项目实测路径）
- ✅ 删除游戏特定内容的教学篇幅（网络优化课、频道 debug 解读等），聚焦 GameLift 核心
- ✅ Race Day = 验证自己服务器(MY SERVER) + 官方 AWS ARENA 对战，不做学员互换 URL
