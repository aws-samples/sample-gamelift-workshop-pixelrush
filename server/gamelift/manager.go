// Package gamelift wraps the Amazon GameLift Server SDK lifecycle so the game
// code (game.Room) stays SDK-agnostic.
package gamelift

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/amazon-gamelift/amazon-gamelift-servers-go-server-sdk/v5/model"
	"github.com/amazon-gamelift/amazon-gamelift-servers-go-server-sdk/v5/server"

	"github.com/aws-samples/pixelrush/server/game"
)

// AnywhereParams are the explicit connection params required on an Anywhere
// fleet. Empty struct = managed EC2 (SDK reads them from the environment).
type AnywhereParams struct {
	WebSocketURL string
	FleetID      string
	HostID       string
	AuthToken    string
	ProcessID    string
}

// Manager owns SDK lifecycle and hands an active Room to the caller.
type Manager struct {
	Port     int
	LogPath  string
	Anywhere *AnywhereParams // nil on managed EC2

	// NewRoomCallbacks supplies the room callbacks (results reporting etc.);
	// Accept/Remove player are filled in by the manager.
	NewRoomCallbacks func() game.RoomCallbacks

	mu   sync.Mutex
	room *game.Room
	// RoomCh delivers the room created by OnStartGameSession to the HTTP layer.
	RoomCh chan *game.Room
}

// Start initializes the SDK and calls ProcessReady. Blocks until terminated.
func (m *Manager) Start() error {
	m.RoomCh = make(chan *game.Room, 1)

	var params server.ServerParameters
	if m.Anywhere != nil {
		pid := m.Anywhere.ProcessID
		if pid == "" {
			pid = fmt.Sprintf("pixelrush-%d-%d", m.Port, time.Now().Unix())
		}
		params = server.ServerParameters{
			WebSocketURL: m.Anywhere.WebSocketURL,
			FleetID:      m.Anywhere.FleetID,
			HostID:       m.Anywhere.HostID,
			AuthToken:    m.Anywhere.AuthToken,
			ProcessID:    pid,
		}
		log.Printf("InitSDK (Anywhere): fleet=%s host=%s process=%s", m.Anywhere.FleetID, m.Anywhere.HostID, pid)
	} else {
		log.Printf("InitSDK (managed EC2, params from environment)")
	}
	if err := server.InitSDK(params); err != nil {
		return fmt.Errorf("InitSDK: %w", err)
	}

	processParams := server.ProcessParameters{
		OnStartGameSession:  m.onStartGameSession,
		OnUpdateGameSession: func(u model.UpdateGameSession) { log.Printf("OnUpdateGameSession: %v", u.UpdateReason) },
		OnProcessTerminate:  m.onProcessTerminate,
		OnHealthCheck:       func() bool { return true },
		Port:                m.Port,
		LogParameters:       server.LogParameters{LogPaths: logPaths(m.LogPath)},
	}
	if err := server.ProcessReady(processParams); err != nil {
		return fmt.Errorf("ProcessReady: %w", err)
	}
	log.Printf("ProcessReady on port %d; waiting for game sessions", m.Port)
	return nil
}

func logPaths(p string) []string {
	if p == "" {
		return nil
	}
	return []string{p}
}

func (m *Manager) onStartGameSession(gs model.GameSession) {
	log.Printf("OnStartGameSession: %s", gs.GameSessionID)

	trackID, expected := parseMatchmakerData(gs.MatchmakerData)
	if trackID == "" {
		trackID = gs.GameProperties["trackId"]
	}
	if trackID == "" {
		trackID = "track-1"
	}
	// No matchmaker data => this session was created by direct placement
	// (Module 4 "open" mode), so there is no pre-agreed roster. Accept any
	// player whose PlayerSession validates, assigning free slots on arrival.
	// FlexMatch sessions keep the fixed expected roster (openForJoins=false).
	openForJoins := len(expected) == 0

	cb := m.NewRoomCallbacks()
	cb.AcceptPlayer = func(psid string) error { return server.AcceptPlayerSession(psid) }
	cb.RemovePlayer = func(psid string) {
		if err := server.RemovePlayerSession(psid); err != nil {
			log.Printf("RemovePlayerSession: %v", err)
		}
	}
	userDone := cb.OnRoomDone
	cb.OnRoomDone = func() {
		if userDone != nil {
			userDone()
		}
		log.Printf("room done -> ProcessEnding + exit")
		if err := server.ProcessEnding(); err != nil {
			log.Printf("ProcessEnding: %v", err)
		}
		server.Destroy()
		os.Exit(0)
	}

	room, err := game.NewRoom(trackID, expected, openForJoins, cb)
	if err != nil {
		log.Printf("create room failed: %v", err)
		_ = server.ProcessEnding()
		os.Exit(1)
	}
	// Fill the grid to the REQUESTED match size, not the matched player count:
	// an under-filled 3P/4P match (minPlayers relaxed to 1 after 45s) must
	// still race a full field of NPCs. The requested size is the trailing
	// digit of the matchmaking config name (PixelRushMatchEc2{1|2|3|4}).
	requested := requestedSizeFromMatchmaker(gs.MatchmakerData)
	target := len(expected)
	if requested > target {
		target = requested
	}
	if target <= 1 {
		target = 2 // solo quick-match still gets one NPC rival
	}
	room.SetGridTarget(target)
	log.Printf("grid target %d (matched=%d requested=%d)", target, len(expected), requested)

	m.mu.Lock()
	m.room = room
	m.mu.Unlock()

	go room.Run()

	if err := server.ActivateGameSession(); err != nil {
		log.Printf("ActivateGameSession failed: %v", err)
		_ = server.ProcessEnding()
		os.Exit(1)
	}
	log.Printf("game session active: track=%s expected players=%d", trackID, len(expected))
	m.RoomCh <- room
}

func (m *Manager) onProcessTerminate() {
	log.Printf("OnProcessTerminate from GameLift")
	m.mu.Lock()
	room := m.room
	m.mu.Unlock()
	if room != nil {
		room.Cmd <- game.Command{Kind: "terminate"}
		// room's shutdown path calls OnRoomDone -> ProcessEnding -> exit
		return
	}
	_ = server.ProcessEnding()
	server.Destroy()
	os.Exit(0)
}

// ComputeCertificate returns the TLS cert/key paths provisioned by GameLift
// on fleets with CertificateConfiguration: GENERATED. ok=false when absent
// (e.g. Anywhere fleet or certs disabled).
func ComputeCertificate() (certPath, keyPath string, ok bool) {
	res, err := server.GetComputeCertificate()
	if err != nil || res.CertificatePath == "" {
		return "", "", false
	}
	certPath = res.CertificatePath
	// On managed fleets the SDK returns the certificates DIRECTORY
	// (/local/gamemetadata/certificates/), not the pem file itself.
	if st, err := os.Stat(certPath); err == nil && st.IsDir() {
		certPath = filepath.Join(certPath, "certificate.pem")
	}
	if _, err := os.Stat(certPath); err != nil {
		return "", "", false
	}
	// The generated bundle places privateKey.pem alongside certificate.pem.
	keyPath = filepath.Join(filepath.Dir(certPath), "privateKey.pem")
	if _, err := os.Stat(keyPath); err != nil {
		return "", "", false
	}
	return certPath, keyPath, true
}

// requestedSizeFromMatchmaker reads the intended match size from the
// matchmaking configuration ARN embedded in MatchmakerData — the config name
// ends with the size digit (PixelRushMatch{Anywhere|Ec2}{1|2|3|4}).
func requestedSizeFromMatchmaker(raw string) int {
	if raw == "" {
		return 0
	}
	var md model.MatchmakerData
	if err := json.Unmarshal([]byte(raw), &md); err != nil {
		return 0
	}
	arn := md.MatchmakingConfigurationArn
	if n := len(arn); n > 0 {
		if d := arn[n-1]; d >= '1' && d <= '8' {
			return int(d - '0')
		}
	}
	return 0
}

// parseMatchmakerData extracts the expected roster and the agreed trackId
// player attribute from FlexMatch MatchmakerData JSON.
func parseMatchmakerData(raw string) (trackID string, expected []game.ExpectedPlayer) {
	if raw == "" {
		return "", nil
	}
	var md model.MatchmakerData
	if err := json.Unmarshal([]byte(raw), &md); err != nil {
		log.Printf("parse MatchmakerData: %v", err)
		return "", nil
	}
	for _, p := range md.Players {
		expected = append(expected, game.ExpectedPlayer{PlayerID: p.PlayerID})
		if trackID == "" {
			if attr, ok := p.PlayerAttributes["trackId"]; ok {
				trackID = attr.S
			}
		}
	}
	return trackID, expected
}
