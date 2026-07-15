package game

import (
	"hash/fnv"
	"log"
	"sync"
	"time"
)

type RaceState string

const (
	StateWaiting   RaceState = "waiting"
	StateCountdown RaceState = "countdown"
	StateRacing    RaceState = "racing"
	StateFinished  RaceState = "finished"
)

const (
	countdownSecs = 3
	raceTimeout   = 5 * time.Minute
	resultsLinger = 15 * time.Second // results screen is client-side; recycle fast
)

// WaitTimeout is how long the room waits for the matched roster before starting
// with whoever connected. Overridable via --wait-secs for local dev.
var WaitTimeout = 60 * time.Second

// ExpectedPlayer is a player from MatchmakerData (or ad-hoc in local mode).
type ExpectedPlayer struct {
	PlayerID string
	Name     string
}

// Player is a connected participant.
type Player struct {
	Slot            int
	PlayerID        string
	PlayerSessionID string
	Name            string
	CarID           string
	Send            chan []byte // outbound queue, owned by the ws layer
	Connected       bool

	fastPath   func([]byte) bool // UDP datachannel send; nil = WS only
	fastPathMu sync.Mutex
}

// AttachFastPath installs (or clears, with nil) the unreliable UDP sender.
func (p *Player) AttachFastPath(f func([]byte) bool) {
	p.fastPathMu.Lock()
	p.fastPath = f
	p.fastPathMu.Unlock()
}

// sendFast tries the UDP path; returns false if unavailable or failed.
func (p *Player) sendFast(b []byte) bool {
	p.fastPathMu.Lock()
	f := p.fastPath
	p.fastPathMu.Unlock()
	return f != nil && f(b)
}

// RoomCallbacks let the room talk to the outside (GameLift SDK, results reporting)
// without importing those packages.
type RoomCallbacks struct {
	// AcceptPlayer validates a player session id; returns error to reject.
	AcceptPlayer func(playerSessionID string) error
	// RemovePlayer notifies GameLift that a player left.
	RemovePlayer func(playerSessionID string)
	// OnRaceEnd receives the final standings for reporting.
	OnRaceEnd func(trackID string, standings []Standing)
	// OnRoomDone signals that the room lingered after results and should shut down the process.
	OnRoomDone func()
}

// Command is a message from a ws connection into the room goroutine.
type Command struct {
	Kind   string // "join", "input", "leave", "ping"
	Player *Player
	Join   *JoinMsg
	Input  *InputMsg
	Ping   *PingMsg
}

// Room owns all game state; a single goroutine processes commands and ticks.
type Room struct {
	TrackID  string
	sim      *Sim
	state    RaceState
	players  map[int]*Player // by slot
	expected []ExpectedPlayer
	cb       RoomCallbacks
	Cmd      chan Command

	openForJoins   bool // local mode: allow joins beyond expected roster
	gridTarget     int  // fill with AI cars up to this grid size at countdown
	waitDeadline   time.Time
	countdownLeft  int
	countdownTimer float64
	raceStartTick  int64
	raceDeadline   time.Time
	lingerDeadline time.Time
	emptySince     time.Time // racing with zero connected players since
	stopped        bool
}

// NewRoom creates a room for a track and expected roster. openForJoins=true is
// used in --no-gamelift local mode where anyone may join until the race starts.
func NewRoom(trackID string, expected []ExpectedPlayer, openForJoins bool, cb RoomCallbacks) (*Room, error) {
	track, err := LoadTrack(trackID)
	if err != nil {
		return nil, err
	}
	h := fnv.New64a()
	h.Write([]byte(trackID))
	r := &Room{
		TrackID:      trackID,
		sim:          NewSim(track, int64(h.Sum64())),
		state:        StateWaiting,
		players:      map[int]*Player{},
		expected:     expected,
		cb:           cb,
		Cmd:          make(chan Command, 256),
		openForJoins: openForJoins,
		waitDeadline: time.Now().Add(WaitTimeout),
	}
	return r, nil
}

// SetGridTarget makes the room top up the grid with AI drivers at countdown:
// Quick Start races vs NPCs, and under-filled multiplayer matches, both get a
// full field. 0 disables bot filling.
func (r *Room) SetGridTarget(n int) {
	if n > 8 {
		n = 8
	}
	r.gridTarget = n
}

// Run is the room's single goroutine: processes commands and ticks at 20 Hz.
func (r *Room) Run() {
	ticker := time.NewTicker(time.Second / TickRate)
	defer ticker.Stop()
	for !r.stopped {
		select {
		case cmd := <-r.Cmd:
			r.handle(cmd)
		case <-ticker.C:
			r.tick()
		}
	}
}

func (r *Room) handle(cmd Command) {
	switch cmd.Kind {
	case "join":
		r.handleJoin(cmd.Player, cmd.Join)
	case "input":
		if c, ok := r.sim.Cars[cmd.Player.Slot]; ok && cmd.Player.Connected {
			// UseItem is sticky until the tick consumes it; tap counters are
			// monotonic per connection so keep the max (an old frame arriving
			// late must not roll them back).
			use := c.Input.UseItem || cmd.Input.UseItem
			lt := max(c.Input.LeftTaps, cmd.Input.LeftTaps)
			rt := max(c.Input.RightTaps, cmd.Input.RightTaps)
			c.Input = *cmd.Input
			c.Input.UseItem = use
			c.Input.LeftTaps = lt
			c.Input.RightTaps = rt
		}
	case "ping":
		r.send(cmd.Player, Marshal(PongMsg{T: "pong", TS: cmd.Ping.TS}))
	case "leave":
		r.handleLeave(cmd.Player)
	case "terminate":
		// GameLift is reclaiming the process (spot interruption, scale-in...)
		r.shutdown("server terminated by GameLift")
	}
}

func (r *Room) handleJoin(p *Player, j *JoinMsg) {
	// Rejoin: a player whose connection dropped (flaky network, proxy killing
	// idle websockets) reattaches to their existing slot — even mid-race.
	if old := r.findByPlayerID(j.PlayerID); old != nil {
		if old.Connected {
			// stale ghost connection: replace it (the network already died)
			log.Printf("player %s rejoining over a live connection; replacing", j.PlayerID)
			close(old.Send)
		}
		p.Slot = old.Slot
		p.PlayerID = old.PlayerID
		p.PlayerSessionID = old.PlayerSessionID // already accepted with GameLift
		p.Name = old.Name
		p.CarID = old.CarID
		p.Connected = true
		r.players[old.Slot] = p
		// fresh connection = fresh tap counters; reset the consumed marks
		if c, ok := r.sim.Cars[old.Slot]; ok {
			c.ResetInput()
		}
		r.send(p, Marshal(JoinedMsg{
			T: "joined", YourSlot: old.Slot, TrackID: r.TrackID,
			Players: r.roster(), RaceState: string(r.state),
		}))
		r.broadcast(Marshal(RosterMsg{T: "roster", Players: r.roster()}))
		log.Printf("player %s (%s) REJOINED slot %d during %s", p.Name, p.PlayerID, p.Slot, r.state)
		return
	}

	// Validate against GameLift (or accept everything in local mode).
	if r.cb.AcceptPlayer != nil {
		if err := r.cb.AcceptPlayer(j.PlayerSessionID); err != nil {
			log.Printf("reject join %s: %v", j.PlayerSessionID, err)
			r.send(p, Marshal(ErrorMsg{T: "error", Reason: "invalid player session"}))
			close(p.Send)
			return
		}
	}
	if r.state != StateWaiting && r.state != StateCountdown {
		r.send(p, Marshal(ErrorMsg{T: "error", Reason: "race already started"}))
		close(p.Send)
		return
	}

	slot := r.assignSlot(j.PlayerID)
	if slot < 0 {
		r.send(p, Marshal(ErrorMsg{T: "error", Reason: "room full"}))
		close(p.Send)
		return
	}
	p.Slot = slot
	p.PlayerID = j.PlayerID
	p.PlayerSessionID = j.PlayerSessionID
	p.Name = j.Name
	p.CarID = j.CarID
	p.Connected = true
	r.players[slot] = p
	r.sim.AddCar(slot, j.CarID)

	r.send(p, Marshal(JoinedMsg{
		T: "joined", YourSlot: slot, TrackID: r.TrackID,
		Players: r.roster(), RaceState: string(r.state),
	}))
	r.broadcast(Marshal(RosterMsg{T: "roster", Players: r.roster()}))
	log.Printf("player %s (%s) joined slot %d [%d/%d expected]", j.Name, j.PlayerID, slot, r.connectedCount(), len(r.expected))

	// Start as soon as the roster is complete. FlexMatch: all expected players
	// connected. Open placement (no expected roster): the grid target is full
	// of humans — no point waiting out the timer for bots.
	full := r.allExpectedConnected() ||
		(len(r.expected) == 0 && r.gridTarget > 0 && r.connectedCount() >= r.gridTarget)
	if r.state == StateWaiting && full {
		r.startCountdown()
	}
}

func (r *Room) findByPlayerID(playerID string) *Player {
	if playerID == "" {
		return nil
	}
	for _, p := range r.players {
		if p.PlayerID == playerID {
			return p
		}
	}
	return nil
}

// assignSlot returns the slot for this player: matched players get a stable slot
// from the expected roster; local mode assigns first free.
func (r *Room) assignSlot(playerID string) int {
	for i, e := range r.expected {
		if e.PlayerID == playerID {
			if existing, ok := r.players[i]; ok && existing.Connected {
				return -1 // already connected
			}
			return i
		}
	}
	if !r.openForJoins {
		return -1
	}
	for i := 0; i < 8; i++ {
		if _, ok := r.players[i]; !ok {
			return i
		}
	}
	return -1
}

func (r *Room) handleLeave(p *Player) {
	if !p.Connected {
		return
	}
	// A replaced ghost connection closing must not touch the slot's new owner
	// or invalidate the shared PlayerSessionID.
	if current, ok := r.players[p.Slot]; !ok || current != p {
		log.Printf("stale connection for slot %d closed; ignoring", p.Slot)
		return
	}
	p.Connected = false
	if r.state == StateWaiting || r.state == StateCountdown {
		// pre-race: free the slot fully (a fresh join re-runs AcceptPlayerSession)
		if r.cb.RemovePlayer != nil && p.PlayerSessionID != "" {
			r.cb.RemovePlayer(p.PlayerSessionID)
		}
		delete(r.players, p.Slot)
		r.sim.RemoveCar(p.Slot)
	}
	// During racing: keep the player entry AND the GameLift player session so
	// a flaky-network client can rejoin; the car keeps driving straight.
	r.broadcast(Marshal(RosterMsg{T: "roster", Players: r.roster()}))
	log.Printf("player %s disconnected from slot %d (state=%s)", p.Name, p.Slot, r.state)
}

func (r *Room) tick() {
	switch r.state {
	case StateWaiting:
		if time.Now().After(r.waitDeadline) {
			if r.connectedCount() > 0 {
				r.startCountdown()
			} else {
				log.Printf("no players connected after wait timeout; shutting down")
				r.shutdown("no players connected")
			}
		}
	case StateCountdown:
		r.countdownTimer -= Dt
		if r.countdownTimer <= 0 {
			r.countdownLeft--
			r.countdownTimer = 1.0
			if r.countdownLeft <= 0 {
				r.state = StateRacing
				r.raceStartTick = r.sim.Tick
				r.raceDeadline = time.Now().Add(raceTimeout)
				r.broadcast(Marshal(RaceStartMsg{T: "race_start", ServerTick: r.sim.Tick}))
				log.Printf("race started with %d players", r.connectedCount())
			} else {
				r.broadcast(Marshal(CountdownMsg{T: "countdown", SecondsLeft: r.countdownLeft}))
			}
		}
	case StateRacing:
		r.sim.Step(true)
		for _, ev := range r.sim.DrainEvents() {
			r.broadcast(Marshal(ev))
		}
		r.broadcastState(Marshal(r.sim.Snapshot()))
		// grace window on empty room: disconnected players may rejoin
		if r.connectedCount() == 0 {
			if r.emptySince.IsZero() {
				r.emptySince = time.Now()
			}
		} else {
			r.emptySince = time.Time{}
		}
		emptyTooLong := !r.emptySince.IsZero() && time.Since(r.emptySince) > 30*time.Second
		if r.sim.AllFinished() || time.Now().After(r.raceDeadline) || emptyTooLong {
			r.finishRace()
		}
	case StateFinished:
		if time.Now().After(r.lingerDeadline) {
			r.shutdown("session complete")
		}
	}
	if r.state == StateWaiting || r.state == StateCountdown {
		// pre-race: still stream state (grid view) at a lower cost — every tick is fine
		r.sim.Step(false)
		r.broadcastState(Marshal(r.sim.Snapshot()))
	}
}

func (r *Room) startCountdown() {
	// Fill the grid up to gridTarget with AI drivers.
	botCars := []string{"sedan-white", "compact-blue", "coupe-navy", "sports-red", "roadster-silver", "supercar-red", "supercar-green"}
	added := 0
	for slot := 0; slot < 8 && len(r.sim.Cars) < r.gridTarget; slot++ {
		if _, taken := r.sim.Cars[slot]; taken {
			continue
		}
		r.sim.AddBot(slot, botCars[added%len(botCars)])
		added++
	}
	if added > 0 {
		r.broadcast(Marshal(RosterMsg{T: "roster", Players: r.roster()}))
	}
	r.state = StateCountdown
	r.countdownLeft = countdownSecs
	r.countdownTimer = 1.0
	r.broadcast(Marshal(CountdownMsg{T: "countdown", SecondsLeft: countdownSecs}))
	log.Printf("countdown started (%d bots)", added)
}

func (r *Room) finishRace() {
	r.state = StateFinished
	r.lingerDeadline = time.Now().Add(resultsLinger)

	standings := r.computeStandings()
	r.broadcast(Marshal(ResultsMsg{T: "results", TrackID: r.TrackID, Standings: standings}))
	if r.cb.OnRaceEnd != nil {
		r.cb.OnRaceEnd(r.TrackID, standings)
	}
	log.Printf("race finished: %d standings", len(standings))
}

func (r *Room) computeStandings() []Standing {
	type entry struct {
		playerID, name string
		isBot          bool
		c              *Car
	}
	var finished, dnf []entry
	for slot, c := range r.sim.Cars {
		e := entry{c: c}
		if p, ok := r.players[slot]; ok {
			e.playerID, e.name = p.PlayerID, p.Name
		} else if c.IsBot {
			e.playerID, e.name, e.isBot = "", botName(slot), true
		} else {
			continue
		}
		if c.Finished {
			finished = append(finished, e)
		} else {
			dnf = append(dnf, e)
		}
	}
	// finished by finish tick asc
	for i := 1; i < len(finished); i++ {
		for j := i; j > 0 && finished[j].c.FinishTick < finished[j-1].c.FinishTick; j-- {
			finished[j], finished[j-1] = finished[j-1], finished[j]
		}
	}
	// DNF by distance travelled desc
	for i := 1; i < len(dnf); i++ {
		for j := i; j > 0 && dnf[j].c.D > dnf[j-1].c.D; j-- {
			dnf[j], dnf[j-1] = dnf[j-1], dnf[j]
		}
	}
	var out []Standing
	pos := 1
	for _, e := range finished {
		ms := (e.c.FinishTick - r.raceStartTick) * (1000 / TickRate)
		out = append(out, Standing{
			Slot: e.c.Slot, PlayerID: e.playerID, Name: e.name, IsBot: e.isBot,
			Position: pos, TimeMs: ms, Finished: true,
		})
		pos++
	}
	for _, e := range dnf {
		out = append(out, Standing{
			Slot: e.c.Slot, PlayerID: e.playerID, Name: e.name, IsBot: e.isBot,
			Position: pos, TimeMs: 0, Finished: false,
		})
		pos++
	}
	return out
}

var botNames = []string{"Turbo-Bot", "Drift-Bot", "Nitro-Bot", "Speedy-Bot", "Racer-Bot", "Zoom-Bot", "Dash-Bot"}

func botName(slot int) string {
	return botNames[slot%len(botNames)]
}

func (r *Room) shutdown(reason string) {
	r.broadcast(Marshal(ShutdownMsg{T: "server_shutdown", Reason: reason}))
	r.stopped = true
	if r.cb.OnRoomDone != nil {
		r.cb.OnRoomDone()
	}
}

func (r *Room) allExpectedConnected() bool {
	if len(r.expected) == 0 {
		return false // local mode: rely on wait timeout or manual start
	}
	for i := range r.expected {
		p, ok := r.players[i]
		if !ok || !p.Connected {
			return false
		}
	}
	return true
}

func (r *Room) connectedCount() int {
	n := 0
	for _, p := range r.players {
		if p.Connected {
			n++
		}
	}
	return n
}

func (r *Room) roster() []PlayerInfo {
	var out []PlayerInfo
	for _, p := range r.players {
		out = append(out, PlayerInfo{Slot: p.Slot, PlayerID: p.PlayerID, Name: p.Name, CarID: p.CarID, Connected: p.Connected})
	}
	for slot, c := range r.sim.Cars {
		if c.IsBot {
			out = append(out, PlayerInfo{Slot: slot, Name: botName(slot), CarID: "sedan-white", Connected: true, IsBot: true})
		}
	}
	return out
}

func (r *Room) send(p *Player, b []byte) {
	select {
	case p.Send <- b:
	default: // slow client: drop
	}
}

func (r *Room) broadcast(b []byte) {
	for _, p := range r.players {
		if p.Connected {
			r.send(p, b)
		}
	}
}

// broadcastState ships the 20Hz snapshot: UDP datachannel when the player has
// one (losing a frame is fine, the next replaces it), WS otherwise.
func (r *Room) broadcastState(b []byte) {
	for _, p := range r.players {
		if !p.Connected {
			continue
		}
		if !p.sendFast(b) {
			r.send(p, b)
		}
	}
}
