---
title: "带读代码：Server SDK"
weight: 32
---

*只读——打开文件对照阅读，不需要修改。*

在编辑器中打开 **`server/gamelift/manager.go`**。这一个文件包含了我们 Go
游戏服务器的全部 GameLift 集成。对照模块 1 的生命周期图，逐一看真实代码。

## 1. InitSDK——自我介绍

```go
// Anywhere fleet 显式传连接参数；
// 托管 EC2 上同一调用会从环境变量读取。
params = server.ServerParameters{
    WebSocketURL: m.Anywhere.WebSocketURL,
    FleetID:      m.Anywhere.FleetID,
    HostID:       m.Anywhere.HostID,     // = 你注册的 compute 名
    AuthToken:    m.Anywhere.AuthToken,  // = GetComputeAuthToken 的结果
    ProcessID:    pid,
}
server.InitSDK(params)
```

:::alert{type=info}
注意方向：服务器进程通过 WebSocket **主动连出**到 GameLift。GameLift 从不
*连入*来管理它——这正是 NAT 后面的笔记本也能当 Anywhere compute 的原因。
:::

## 2. ProcessReady——宣告可开局

```go
server.ProcessReady(server.ProcessParameters{
    OnStartGameSession:  m.onStartGameSession,   // 回调 ↓
    OnProcessTerminate:  m.onProcessTerminate,
    OnHealthCheck:       func() bool { return true },  // 每 60 秒轮询
    Port:                m.Port,                 // 玩家将连接的端口
})
```

从这一刻起，进程空闲、健康、等待被选中。

## 3. OnStartGameSession——比赛来了

```go
func (m *Manager) onStartGameSession(gs model.GameSession) {
    trackID, expected := parseMatchmakerData(gs.MatchmakerData) // 谁要来
    room, _ := game.NewRoom(trackID, expected, false, cb)       // 构建游戏状态
    go room.Run()                                               // 启动 20Hz tick 循环
    server.ActivateGameSession()                                // “可以放玩家进来了”
}
```

`MatchmakerData` 是 FlexMatch 的档案：匹配到的玩家及其属性。
服务器据此知道**谁有资格进来**。

## 4. 玩家连入——AcceptPlayerSession

```go
cb.AcceptPlayer = func(psid string) error {
    return server.AcceptPlayerSession(psid)  // 交给 GameLift 验票
}
```

每个连入的客户端都要出示匹配系统签发的 `PlayerSessionId`。服务器把它交给
GameLift 校验——未经匹配的玩家无法混入会话。

## 5. ProcessEnding——干净退出

```go
server.ProcessEnding()  // “这局结束了”
os.Exit(0)              // GameLift 立即拉起新进程
```

一进程一局——简单、崩溃隔离，回收交给 GameLift。

:::alert{type=success}
这就是完整契约。Unreal、Unity、C++ 服务器实现的是一模一样的五个时刻、
同一套 SDK 调用。
:::
