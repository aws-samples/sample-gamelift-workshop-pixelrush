package results

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/aws-samples/pixelrush/server/game"
)

// Reporter POSTs final race standings to the backend API.
// Empty APIURL disables reporting (pure local mode).
type Reporter struct {
	APIURL string
	Secret string
}

type payload struct {
	TrackID string          `json:"trackId"`
	Results []game.Standing `json:"results"`
}

func (r *Reporter) Report(trackID string, standings []game.Standing) {
	if r.APIURL == "" {
		log.Printf("results reporting disabled (no --api-url)")
		return
	}
	body, _ := json.Marshal(payload{TrackID: trackID, Results: standings})
	req, err := http.NewRequest(http.MethodPost, r.APIURL+"/internal/results", bytes.NewReader(body))
	if err != nil {
		log.Printf("results request build failed: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-results-secret", r.Secret)

	client := &http.Client{Timeout: 10 * time.Second}
	for attempt := 1; attempt <= 3; attempt++ {
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode < 300 {
			resp.Body.Close()
			log.Printf("results reported for %s (%d standings)", trackID, len(standings))
			return
		}
		if err != nil {
			log.Printf("results report attempt %d failed: %v", attempt, err)
		} else {
			log.Printf("results report attempt %d: HTTP %d", attempt, resp.StatusCode)
			resp.Body.Close()
		}
		time.Sleep(time.Duration(attempt) * time.Second)
		req.Body = http.NoBody
		req, _ = http.NewRequest(http.MethodPost, r.APIURL+"/internal/results", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-results-secret", r.Secret)
	}
	log.Printf("results report gave up after 3 attempts")
}
