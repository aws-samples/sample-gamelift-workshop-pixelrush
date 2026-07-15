---
title: "Code Walkthrough: the Server SDK"
weight: 32
---

*Read-only — open the file, follow along, change nothing.*

Open **`server/gamelift/manager.go`** in your editor. This one file contains the
entire GameLift integration of our Go game server. Let's trace the four lifecycle
moments from Module 1 in real code.

## 1. InitSDK — introduce yourself

```go
// Anywhere fleets pass explicit connection parameters;
// on managed EC2 the same call reads them from the environment.
params = server.ServerParameters{
    WebSocketURL: m.Anywhere.WebSocketURL,
    FleetID:      m.Anywhere.FleetID,
    HostID:       m.Anywhere.HostID,     // = the compute name you registered
    AuthToken:    m.Anywhere.AuthToken,  // = GetComputeAuthToken result
    ProcessID:    pid,
}
server.InitSDK(params)
```

:::alert{type=info}
Note the direction: the server process **dials out** to GameLift over a
WebSocket. GameLift never connects *in* to manage it — which is why a laptop
behind NAT works fine as Anywhere compute.
:::

## 2. ProcessReady — declare yourself hostable

```go
server.ProcessReady(server.ProcessParameters{
    OnStartGameSession:  m.onStartGameSession,   // callback ↓
    OnProcessTerminate:  m.onProcessTerminate,
    OnHealthCheck:       func() bool { return true },  // polled every 60s
    Port:                m.Port,                 // where players will connect
})
```

From this moment the process sits idle, healthy, waiting to be chosen.

## 3. OnStartGameSession — a match arrives

```go
func (m *Manager) onStartGameSession(gs model.GameSession) {
    trackID, expected := parseMatchmakerData(gs.MatchmakerData) // who's coming
    room, _ := game.NewRoom(trackID, expected, false, cb)       // build game state
    go room.Run()                                               // start the 20Hz tick loop
    server.ActivateGameSession()                                // "I'm ready for players"
}
```

`MatchmakerData` is FlexMatch's dossier: the matched players and their attributes.
The server uses it to know **who is allowed in**.

## 4. Player connects — AcceptPlayerSession

```go
cb.AcceptPlayer = func(psid string) error {
    return server.AcceptPlayerSession(psid)  // GameLift validates the ticket
}
```

Every connecting client presents a `PlayerSessionId` issued by matchmaking.
The server hands it to GameLift for validation — an unmatched player cannot
sneak into the session.

## 5. ProcessEnding — clean exit

```go
server.ProcessEnding()  // "this session is done"
os.Exit(0)              // GameLift immediately starts a fresh process
```

One session per process — simple, crash-isolated, and GameLift recycles it.

:::alert{type=success}
That's the entire contract. Unreal, Unity and C++ servers implement exactly the
same five moments with the same SDK calls.
:::
