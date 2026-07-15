package game

import "encoding/json"

// Gameplay is modeled on the NES classic Road Fighter: a vertically scrolling
// straight highway, the car auto-drives forward at track speed, and the player
// only steers left/right to dodge traffic and grab pickups.

// Envelope is used to peek at the message type before full decoding.
type Envelope struct {
	T string `json:"t"`
}

// ---- Client -> Server ----

type JoinMsg struct {
	T               string `json:"t"`
	PlayerSessionID string `json:"playerSessionId"`
	PlayerID        string `json:"playerId"`
	Name            string `json:"name"`
	CarID           string `json:"carId"`
}

// InputMsg carries CUMULATIVE tap counters: each left/right key tap
// increments its counter for the life of the connection. The server applies
// the delta since the last frame it processed, so taps can never be lost to
// frame bunching (press+release overwritten within one 50ms tick) or to a
// dropped frame — the next keep-alive frame re-delivers the totals.
type InputMsg struct {
	T         string `json:"t"`
	Seq       int    `json:"seq"`
	LeftTaps  int    `json:"lt"`
	RightTaps int    `json:"rt"`
	UseItem   bool   `json:"useItem"`
}

type PingMsg struct {
	T  string `json:"t"`
	TS int64  `json:"ts"`
}

// ---- Server -> Client ----

type PlayerInfo struct {
	Slot      int    `json:"slot"`
	PlayerID  string `json:"playerId"`
	Name      string `json:"name"`
	CarID     string `json:"carId"`
	Connected bool   `json:"connected"`
	IsBot     bool   `json:"isBot"`
}

type JoinedMsg struct {
	T         string       `json:"t"` // "joined"
	YourSlot  int          `json:"yourSlot"`
	TrackID   string       `json:"trackId"`
	Players   []PlayerInfo `json:"players"`
	RaceState string       `json:"raceState"`
}

type RosterMsg struct {
	T       string       `json:"t"` // "roster"
	Players []PlayerInfo `json:"players"`
}

type CountdownMsg struct {
	T           string `json:"t"` // "countdown"
	SecondsLeft int    `json:"secondsLeft"`
}

type RaceStartMsg struct {
	T          string `json:"t"` // "race_start"
	ServerTick int64  `json:"serverTick"`
}

// CarState in track coordinates: d = distance along the road, lane = lateral
// position in lane units (fractional while sliding between lanes).
type CarState struct {
	Slot        int     `json:"slot"`
	D           float64 `json:"d"`
	Lane        float64 `json:"lane"`
	Position    int     `json:"pos"`
	Item        string  `json:"item"` // "", "nitro", "bomb"
	NitroActive bool    `json:"nitroActive"`
	Stunned     bool    `json:"stunned"`
	Crashed     bool    `json:"crashed"`
	Finished    bool    `json:"finished"`
	IsBot       bool    `json:"isBot"`
}

// TrafficState: moving obstacles only (static ones ship in the track JSON).
type TrafficState struct {
	ID   int     `json:"id"`
	D    float64 `json:"d"`
	Lane int     `json:"lane"`
}

type BombState struct {
	ID    int     `json:"id"`
	D     float64 `json:"d"`
	Lane  int     `json:"lane"`
	Armed bool    `json:"armed"`
}

type StateMsg struct {
	T          string         `json:"t"` // "state"
	Tick       int64          `json:"tick"`
	Cars       []CarState     `json:"cars"`
	Traffic    []TrafficState `json:"traffic,omitempty"`
	Bombs      []BombState    `json:"bombs,omitempty"`
	TakenItems []int          `json:"takenItems,omitempty"`
}

type EventMsg struct {
	T    string `json:"t"`    // "event"
	Kind string `json:"kind"` // crash | item_pickup | item_use | bomb_hit | player_finish
	Slot int    `json:"slot"`
	Data string `json:"data,omitempty"`
	Lap  int    `json:"lap,omitempty"`
}

type Standing struct {
	Slot     int    `json:"slot"`
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	Position int    `json:"position"`
	TimeMs   int64  `json:"timeMs"` // 0 if DNF
	Finished bool   `json:"finished"`
	IsBot    bool   `json:"isBot"`
}

type ResultsMsg struct {
	T         string     `json:"t"` // "results"
	TrackID   string     `json:"trackId"`
	Standings []Standing `json:"standings"`
}

type PongMsg struct {
	T  string `json:"t"` // "pong"
	TS int64  `json:"ts"`
}

type ShutdownMsg struct {
	T      string `json:"t"` // "server_shutdown"
	Reason string `json:"reason"`
}

type ErrorMsg struct {
	T      string `json:"t"` // "error"
	Reason string `json:"reason"`
}

func Marshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
