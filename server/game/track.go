package game

import (
	"embed"
	"encoding/json"
	"fmt"
)

//go:embed tracksdata/*.json
var trackFS embed.FS

// Obstacle is a static barrier or slow-moving traffic car in a lane.
type Obstacle struct {
	ID    int     `json:"id"`
	D     float64 `json:"d"`     // distance from start
	Lane  int     `json:"lane"`
	Speed float64 `json:"speed"` // 0 = parked/barrier, >0 = slow traffic
	Type  string  `json:"type"`  // "barrier" | "traffic"
}

// ItemSpawn is a pickup at a distance/lane.
type ItemSpawn struct {
	ID   int     `json:"id"`
	D    float64 `json:"d"`
	Lane int     `json:"lane"`
}

// Track is a straight lane-dodger course. Difficulty = BaseSpeed (scroll
// speed) and obstacle density. Same JSON is consumed by the frontend.
type Track struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	Length    float64     `json:"length"`    // finish distance
	BaseSpeed float64     `json:"baseSpeed"` // forward units/s all cars share
	Lanes     int         `json:"lanes"`
	LaneWidth float64     `json:"laneWidth"`
	Obstacles []Obstacle  `json:"obstacles"`
	Items     []ItemSpawn `json:"items"`
}

// LoadTrack loads a track by id from the embedded data.
func LoadTrack(id string) (*Track, error) {
	b, err := trackFS.ReadFile("tracksdata/" + id + ".json")
	if err != nil {
		return nil, fmt.Errorf("track %q not found: %w", id, err)
	}
	var t Track
	if err := json.Unmarshal(b, &t); err != nil {
		return nil, fmt.Errorf("track %q parse error: %w", id, err)
	}
	if t.Lanes <= 0 {
		t.Lanes = 5
	}
	if t.LaneWidth <= 0 {
		t.LaneWidth = 80
	}
	return &t, nil
}
