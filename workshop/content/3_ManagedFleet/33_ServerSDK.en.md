---
title: "Code Walkthrough: the Server SDK"
weight: 33
---

*Read-only — open the file, follow along, change nothing. The fleet is still
activating; this is the binary it is installing right now.*

Open **`server/gamelift/manager.go`** in your editor. This one file contains the
entire Amazon GameLift Servers integration of our Go game server. Let's trace the five lifecycle
moments from Module 1 in real code.

## 1. InitSDK — introduce yourself

```go
var params server.ServerParameters
if m.Anywhere != nil {
    // Anywhere only: the process supplies what the environment can't.
    params = server.ServerParameters{
        WebSocketURL: m.Anywhere.WebSocketURL,
        FleetID:      m.Anywhere.FleetID,
        HostID:       m.Anywhere.HostID,    // = the registered compute name
        AuthToken:    m.Anywhere.AuthToken, // = GetComputeAuthToken result
        ProcessID:    pid,
    }
} else {
    log.Printf("InitSDK (managed EC2, params from environment)")
}
server.InitSDK(params)
```

On the fleet you just deployed, `m.Anywhere` is `nil`, so `params` stays the
**zero value** — GameLift puts the fleet, compute and auth details in the
instance environment and the SDK reads them itself. This is the whole difference
between hosting models: the populated struct is only needed when the compute
isn't an AWS-managed instance (optional Appendix A). Everything below this line
is identical either way.

{{% notice info %}}
Note the direction: the server process **dials out** to GameLift over a
WebSocket. GameLift never connects *in* to manage it — the same reason a laptop
behind NAT can serve as Anywhere compute.
{{% /notice %}}

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

{{% notice tip %}}
That's the entire contract. Unreal, Unity and C++ servers implement exactly the
same five moments with the same SDK calls.
{{% /notice %}}
