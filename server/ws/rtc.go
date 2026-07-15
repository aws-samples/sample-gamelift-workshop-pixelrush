package ws

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/pion/webrtc/v4"

	"github.com/aws-samples/pixelrush/server/game"
)

// RTC upgrades players to a WebRTC unreliable DataChannel: SCTP over
// DTLS/UDP, unordered, no retransmits. This kills TCP head-of-line blocking
// (the freeze-jump stutter on lossy links). Signaling rides the existing
// WebSocket; if the DataChannel never opens the game keeps running over WS.
type RTC struct {
	api      *webrtc.API
	settings webrtc.SettingEngine
	enabled  bool
}

// NewRTC listens for ICE/DTLS/SCTP on udpPort. publicIP (may be "") is the
// address advertised in ICE candidates — on a fleet instance this must be the
// public IP (from instance metadata), locally it's determined automatically.
func NewRTC(udpPort int, publicIP string) *RTC {
	se := webrtc.SettingEngine{}

	udpListener, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: udpPort})
	if err != nil {
		log.Printf("rtc: UDP listen on %d failed (%v) — UDP transport disabled, WS only", udpPort, err)
		return &RTC{enabled: false}
	}
	udpMux := webrtc.NewICEUDPMux(nil, udpListener)
	se.SetICEUDPMux(udpMux)
	if publicIP != "" {
		se.SetNAT1To1IPs([]string{publicIP}, webrtc.ICECandidateTypeHost)
	}
	se.SetIncludeLoopbackCandidate(true) // local dev: 127.0.0.1 candidates

	api := webrtc.NewAPI(webrtc.WithSettingEngine(se))
	log.Printf("rtc: UDP transport listening on :%d (publicIP=%q)", udpPort, publicIP)
	return &RTC{api: api, settings: se, enabled: true}
}

// Negotiate handles a client's SDP offer and returns the answer. When the
// DataChannel opens it is wired into the player's room command path and the
// player's Send queue switches to the channel for state frames.
func (r *RTC) Negotiate(room *game.Room, p *game.Player, offerSDP string) (string, error) {
	if !r.enabled {
		return "", fmt.Errorf("rtc disabled")
	}
	pc, err := r.api.NewPeerConnection(webrtc.Configuration{})
	if err != nil {
		return "", err
	}

	pc.OnDataChannel(func(dc *webrtc.DataChannel) {
		if dc.Label() != "game" {
			return
		}
		dc.OnOpen(func() {
			log.Printf("rtc: datachannel open for %s (slot %d)", p.Name, p.Slot)
			p.AttachFastPath(func(b []byte) bool {
				// SendText: the browser client JSON-parses ev.data as a string
				// (binary Send would arrive as ArrayBuffer and be dropped)
				return dc.SendText(string(b)) == nil
			})
		})
		dc.OnMessage(func(msg webrtc.DataChannelMessage) {
			var env game.Envelope
			if json.Unmarshal(msg.Data, &env) != nil {
				return
			}
			if env.T == "input" {
				var m game.InputMsg
				if json.Unmarshal(msg.Data, &m) == nil {
					room.Cmd <- game.Command{Kind: "input", Player: p, Input: &m}
				}
			}
		})
		dc.OnClose(func() {
			p.AttachFastPath(nil)
		})
	})
	pc.OnConnectionStateChange(func(s webrtc.PeerConnectionState) {
		if s == webrtc.PeerConnectionStateFailed || s == webrtc.PeerConnectionStateClosed {
			p.AttachFastPath(nil)
			pc.Close()
		}
	})

	if err := pc.SetRemoteDescription(webrtc.SessionDescription{
		Type: webrtc.SDPTypeOffer, SDP: offerSDP,
	}); err != nil {
		pc.Close()
		return "", err
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		pc.Close()
		return "", err
	}
	gathered := webrtc.GatheringCompletePromise(pc)
	if err := pc.SetLocalDescription(answer); err != nil {
		pc.Close()
		return "", err
	}
	select {
	case <-gathered:
	case <-time.After(3 * time.Second):
	}
	return pc.LocalDescription().SDP, nil
}

// PublicIPFromMetadata fetches the instance public IPv4 via IMDSv2 (empty on
// non-EC2 hosts, e.g. local dev / Anywhere on a laptop).
func PublicIPFromMetadata() string {
	c := &http.Client{Timeout: 700 * time.Millisecond}
	req, _ := http.NewRequest(http.MethodPut, "http://169.254.169.254/latest/api/token", nil)
	req.Header.Set("X-aws-ec2-metadata-token-ttl-seconds", "60")
	tres, err := c.Do(req)
	if err != nil {
		return ""
	}
	tok, _ := io.ReadAll(tres.Body)
	tres.Body.Close()
	req2, _ := http.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data/public-ipv4", nil)
	req2.Header.Set("X-aws-ec2-metadata-token", string(tok))
	res, err := c.Do(req2)
	if err != nil || res.StatusCode != 200 {
		return ""
	}
	ip, _ := io.ReadAll(res.Body)
	res.Body.Close()
	return strings.TrimSpace(string(ip))
}
