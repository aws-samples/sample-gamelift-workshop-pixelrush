package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/aws-samples/pixelrush/server/game"
	"github.com/aws-samples/pixelrush/server/gamelift"
	"github.com/aws-samples/pixelrush/server/results"
	"github.com/aws-samples/pixelrush/server/ws"
)

func main() {
	var (
		port       = flag.Int("port", 1935, "game port (WebSocket)")
		noGamelift = flag.Bool("no-gamelift", false, "local dev mode: no GameLift SDK, room opens immediately")
		trackID    = flag.String("track", "track-1", "track id for --no-gamelift mode")
		gridSize   = flag.Int("grid", 4, "fill grid with AI drivers up to this size (0 = no bots)")
		apiURL     = flag.String("api-url", "", "backend API base URL for results reporting (empty = disabled)")
		secret     = flag.String("results-secret", "", "shared secret for results reporting")
		logPath    = flag.String("log", "", "log file path (default stderr)")
		waitSecs   = flag.Int("wait-secs", 60, "seconds to wait for players before starting")
		tlsCert    = flag.String("tls-cert", "", "TLS certificate file; serves wss:// when set (on managed fleets, resolved via GetComputeCertificate)")
		tlsKey     = flag.String("tls-key", "", "TLS private key file")

		// GameLift Anywhere parameters (Phase 3)
		anywhere     = flag.Bool("anywhere", false, "run against a GameLift Anywhere fleet")
		wsURL        = flag.String("websocket-url", "", "GameLift Anywhere WebSocketUrl")
		fleetID      = flag.String("fleet-id", "", "GameLift Anywhere fleet id")
		hostID       = flag.String("host-id", "", "GameLift Anywhere compute name")
		authToken    = flag.String("auth-token", "", "GameLift Anywhere compute auth token")
		processID    = flag.String("process-id", "", "GameLift Anywhere process id")
	)
	flag.Parse()

	if *logPath != "" {
		// Never die over logging: on the fleet, stderr still reaches the
		// GameLift agent logs, which beats crashing before InitSDK.
		if err := os.MkdirAll(filepath.Dir(*logPath), 0o755); err != nil {
			log.Printf("create log dir: %v (logging to stderr)", err)
		} else if f, err := os.OpenFile(*logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err != nil {
			log.Printf("open log file: %v (logging to stderr)", err)
		} else {
			defer f.Close()
			log.SetOutput(f)
		}
	}

	game.WaitTimeout = time.Duration(*waitSecs) * time.Second
	reporter := &results.Reporter{APIURL: *apiURL, Secret: *secret}

	if *noGamelift {
		runLocal(*port, *trackID, *gridSize, reporter, *tlsCert, *tlsKey)
		return
	}

	// GameLift mode (managed EC2 or Anywhere).
	var ap *gamelift.AnywhereParams
	if *anywhere {
		if *wsURL == "" || *fleetID == "" || *hostID == "" || *authToken == "" {
			log.Fatal("--anywhere requires --websocket-url, --fleet-id, --host-id, --auth-token")
		}
		ap = &gamelift.AnywhereParams{
			WebSocketURL: *wsURL, FleetID: *fleetID, HostID: *hostID,
			AuthToken: *authToken, ProcessID: *processID,
		}
	}
	runGameLift(*port, ap, reporter, *tlsCert, *tlsKey)
}

// runGameLift initializes the SDK, then serves WebSocket for the room that
// OnStartGameSession creates. On managed fleets with GENERATED certificates,
// TLS cert paths come from GetComputeCertificate unless overridden by flags.
func runGameLift(port int, ap *gamelift.AnywhereParams, reporter *results.Reporter, tlsCert, tlsKey string) {
	mgr := &gamelift.Manager{
		Port:     port,
		LogPath:  fmt.Sprintf("/local/game/logs/server-%d.log", port),
		Anywhere: ap,
		NewRoomCallbacks: func() game.RoomCallbacks {
			return game.RoomCallbacks{OnRaceEnd: reporter.Report}
		},
	}
	if err := mgr.Start(); err != nil {
		log.Fatalf("gamelift start: %v", err)
	}
	if tlsCert == "" {
		if cert, key, ok := gamelift.ComputeCertificate(); ok {
			tlsCert, tlsKey = cert, key
			log.Printf("using GameLift compute certificate: %s", cert)
		}
	}

	// The HTTP server starts immediately; connections that arrive in the small
	// window between FlexMatch success (client got the address) and
	// ActivateGameSession completing wait briefly for the room instead of
	// getting rejected.
	var roomHolder struct {
		mu   sync.Mutex
		room *game.Room
	}
	go func() {
		r := <-mgr.RoomCh
		roomHolder.mu.Lock()
		roomHolder.room = r
		roomHolder.mu.Unlock()
	}()
	getRoom := func() *game.Room {
		roomHolder.mu.Lock()
		defer roomHolder.mu.Unlock()
		return roomHolder.room
	}

	// UDP transport on the same port number as the TCP game port (the fleet
	// opens both protocols); public IP comes from instance metadata on EC2.
	rtc := ws.NewRTC(port, ws.PublicIPFromMetadata())

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		room := getRoom()
		for i := 0; room == nil && i < 100; i++ { // wait up to ~10s
			time.Sleep(100 * time.Millisecond)
			room = getRoom()
		}
		if room == nil {
			http.Error(w, "no game session yet", http.StatusServiceUnavailable)
			return
		}
		ws.Handler(room, rtc)(w, r)
	})

	srv := &http.Server{Addr: fmt.Sprintf(":%d", port), Handler: mux}
	if err := serve(srv, tlsCert, tlsKey, "gamelift"); err != nil {
		log.Fatal(err)
	}
}

// runLocal starts a single open room without GameLift — two browser tabs can
// connect straight to ws://localhost:<port>/ and race.
func runLocal(port int, trackID string, gridSize int, reporter *results.Reporter, tlsCert, tlsKey string) {
	done := make(chan struct{})
	room, err := game.NewRoom(trackID, nil, true, game.RoomCallbacks{
		OnRaceEnd: reporter.Report,
		OnRoomDone: func() { close(done) },
	})
	if err != nil {
		log.Fatalf("create room: %v", err)
	}
	room.SetGridTarget(gridSize)
	go room.Run()

	mux := http.NewServeMux()
	mux.HandleFunc("/", ws.Handler(room, ws.NewRTC(port, "")))
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "ok")
	})

	addr := fmt.Sprintf(":%d", port)
	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		<-done
		log.Printf("room done; exiting")
		os.Exit(0)
	}()
	if err := serve(srv, tlsCert, tlsKey, trackID); err != nil {
		log.Fatal(err)
	}
}

// serve listens with TLS (wss://) when cert+key are provided, plain ws:// otherwise. // nosemgrep: detect-insecure-websocket
func serve(srv *http.Server, tlsCert, tlsKey, trackID string) error {
	if tlsCert != "" && tlsKey != "" {
		log.Printf("track=%s listening on wss://0.0.0.0%s/ (TLS)", trackID, srv.Addr)
		return srv.ListenAndServeTLS(tlsCert, tlsKey)
	}
	// only used for local GameLift Anywhere validation (Module 3); managed fleets get a TLS cert and use wss://. // nosemgrep: detect-insecure-websocket
	log.Printf("track=%s listening on ws://0.0.0.0%s/", trackID, srv.Addr) // nosemgrep: detect-insecure-websocket
	return srv.ListenAndServe()
}
