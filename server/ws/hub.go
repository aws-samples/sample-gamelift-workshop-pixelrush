package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/aws-samples/pixelrush/server/game"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Browser clients connect from any origin (workshop; no cookies involved).
	CheckOrigin: func(r *http.Request) bool { return true },
}

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 45 * time.Second
)

// Handler upgrades HTTP to WebSocket and bridges the connection to the room.
// rtc may be nil (UDP transport disabled).
func Handler(room *game.Room, rtc *RTC) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws upgrade failed: %v", err)
			return
		}
		p := &game.Player{Send: make(chan []byte, 64)}
		go writePump(conn, p)
		readPump(conn, room, rtc, p)
	}
}

type rtcOfferMsg struct {
	T   string `json:"t"`
	SDP string `json:"sdp"`
}

func readPump(conn *websocket.Conn, room *game.Room, rtc *RTC, p *game.Player) {
	defer func() {
		room.Cmd <- game.Command{Kind: "leave", Player: p}
		conn.Close()
	}()
	conn.SetReadLimit(4096)
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			// Close reason matters for diagnosing player-network issues
			// (abnormal closure = connection killed by network, not client).
			log.Printf("ws read ended for %s (slot %d): %v", conn.RemoteAddr(), p.Slot, err)
			return
		}
		conn.SetReadDeadline(time.Now().Add(pongWait))
		var env game.Envelope
		if err := json.Unmarshal(data, &env); err != nil {
			continue
		}
		switch env.T {
		case "join":
			var m game.JoinMsg
			if json.Unmarshal(data, &m) == nil {
				room.Cmd <- game.Command{Kind: "join", Player: p, Join: &m}
			}
		case "input":
			var m game.InputMsg
			if json.Unmarshal(data, &m) == nil {
				room.Cmd <- game.Command{Kind: "input", Player: p, Input: &m}
			}
		case "ping":
			var m game.PingMsg
			if json.Unmarshal(data, &m) == nil {
				room.Cmd <- game.Command{Kind: "ping", Player: p, Ping: &m}
			}
		case "rtc_offer":
			var m rtcOfferMsg
			if json.Unmarshal(data, &m) == nil && rtc != nil {
				answer, err := rtc.Negotiate(room, p, m.SDP)
				resp := map[string]string{"t": "rtc_answer", "sdp": answer}
				if err != nil {
					log.Printf("rtc negotiate failed: %v", err)
					resp = map[string]string{"t": "rtc_answer", "sdp": ""}
				}
				b, _ := json.Marshal(resp)
				select {
				case p.Send <- b:
				default:
				}
			}
		}
	}
}

func writePump(conn *websocket.Conn, p *game.Player) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()
	for {
		select {
		case msg, ok := <-p.Send:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
