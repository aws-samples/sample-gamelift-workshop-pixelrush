package game

import (
	"math"
	"math/rand"
)

const (
	TickRate = 20
	Dt       = 1.0 / TickRate

	laneChangeTime = 0.16 // seconds to slide one lane
	// Collision half-lengths tuned to the sprite sizes (car ~24px tall in
	// 80-unit lanes): overlap requires |Δd| < carHalfLen+obstacleHalfLen.
	carHalfLen      = 14.0
	obstacleHalfLen = 16.0
	itemHalfLen     = 28.0
	// A car only counts as "in" a lane when mostly there (mid-slide is safe).
	laneTolerance = 0.45
	crashSlowdown = 0.35 // speed multiplier after hitting an obstacle
	crashRecovery = 1.8  // seconds to recover to full speed
	// Items: nitro (long speed boost) or bomb (drop behind, stuns a chaser).
	nitroDuration = 3.0
	nitroFactor   = 1.4
	stunDuration  = 1.2
	bombArmDelay  = 0.4
	bombLifetime  = 8.0
	// item boxes respawn a few seconds after being taken
	itemRespawnTicks = 15 * TickRate
)

// CarSpec: per-car performance. SpeedBonus scales the shared track speed a
// little so better cars finish faster; Handling shortens lane-change time.
type CarSpec struct {
	SpeedBonus float64 // multiplier on track base speed (1.0 - 1.15)
	Handling   float64 // lane change time multiplier (lower = snappier)
}

var defaultCarSpec = CarSpec{SpeedBonus: 1.0, Handling: 1.0}

// carSpecs kept in sync with the shop catalog seed (infra/seed/cars.json).
var carSpecs = map[string]CarSpec{
	"compact-blue":   {SpeedBonus: 0.98, Handling: 1.05},
	"sedan-white":  {SpeedBonus: 1.00, Handling: 1.00},
	"coupe-navy":   {SpeedBonus: 1.04, Handling: 0.92},
	"roadster-silver":  {SpeedBonus: 1.05, Handling: 0.95},
	"sports-red":  {SpeedBonus: 1.08, Handling: 0.85},
	"supercar-red":  {SpeedBonus: 1.11, Handling: 0.82},
	"supercar-green":    {SpeedBonus: 1.13, Handling: 0.84},
	"hypercar-darkblue":   {SpeedBonus: 1.15, Handling: 0.88},
}

// Car is one player's racer in the lane-dodger sim.
type Car struct {
	Slot   int
	Spec   CarSpec
	D      float64 // distance travelled along the track
	Lane   int     // target lane
	LaneF  float64 // rendered/collision lane position (slides toward Lane)
	Input  InputMsg
	Item   string // "", "nitro" or "bomb"
	NitroT float64
	StunT  float64
	SlowT  float64 // crash recovery timer
	Finished   bool
	FinishTick int64
	position   int
	// consumed tap counters (matched against Input.LeftTaps/RightTaps)
	seenLeft, seenRight int
	// IsBot marks server-driven cars for Quick Start races.
	IsBot  bool
	botRng *rand.Rand
}

// Bomb dropped behind a car; stuns the next car through that lane.
type Bomb struct {
	ID    int
	D     float64
	Lane  int
	Age   float64
	Owner int
}

type Sim struct {
	Track   *Track
	Cars    map[int]*Car
	Bombs   []*Bomb
	Tick    int64
	rng     *rand.Rand
	bombSeq int
	takenAt map[int]int64 // item spawn id -> tick it was taken (respawns later)
	Events  []EventMsg
}

func NewSim(track *Track, seed int64) *Sim {
	return &Sim{
		Track: track,
		Cars:  map[int]*Car{},
		rng:     rand.New(rand.NewSource(seed)),
		takenAt: map[int]int64{},
	}
}

func (s *Sim) AddCar(slot int, carID string) *Car {
	spec, ok := carSpecs[carID]
	if !ok {
		spec = defaultCarSpec
	}
	// slot 0 spawns center lane; later slots alternate outward (mid±1, mid±2)
	mid := s.Track.Lanes / 2
	offset := (slot + 1) / 2
	if slot%2 == 1 {
		offset = -offset
	}
	lane := clampInt(mid+offset, 0, s.Track.Lanes-1)
	c := &Car{Slot: slot, Spec: spec, D: 0, Lane: lane, LaneF: float64(lane)}
	s.Cars[slot] = c
	return c
}

// AddBot adds a server-driven car (Quick Start mode).
func (s *Sim) AddBot(slot int, carID string) *Car {
	c := s.AddCar(slot, carID)
	c.IsBot = true
	c.botRng = rand.New(rand.NewSource(s.rng.Int63()))
	return c
}

func (s *Sim) RemoveCar(slot int) { delete(s.Cars, slot) }

// ResetInput clears input state and consumed tap counters — required when a
// player reconnects (their new connection counts taps from zero again).
func (c *Car) ResetInput() {
	c.Input = InputMsg{}
	c.seenLeft, c.seenRight = 0, 0
}

func (s *Sim) Step(racing bool) {
	s.Tick++
	if !racing {
		return
	}
	for _, c := range s.Cars {
		if c.IsBot {
			s.driveBot(c)
		}
		s.stepCar(c)
	}
	s.carCollisions()
	s.stepBombs()
	s.rankCars()
}

// carCollisions bumps cars that overlap in the same lane: the trailing car
// (smaller D) crashes and is pushed back to just behind the leader, so racers
// can't drive through each other. Runs after every car has moved this tick.
func (s *Sim) carCollisions() {
	cars := make([]*Car, 0, len(s.Cars))
	for _, c := range s.Cars {
		if !c.Finished {
			cars = append(cars, c)
		}
	}
	for i := 0; i < len(cars); i++ {
		for j := i + 1; j < len(cars); j++ {
			a, b := cars[i], cars[j]
			if math.Abs(a.LaneF-b.LaneF) > laneTolerance {
				continue
			}
			if math.Abs(a.D-b.D) >= 2*carHalfLen {
				continue
			}
			// rear car (smaller D) is the one that "hit"; leader is unaffected
			rear, lead := a, b
			if a.D > b.D {
				rear, lead = b, a
			}
			if rear.SlowT > 0 {
				continue // already recovering from a hit
			}
			rear.SlowT = crashRecovery
			rear.D = lead.D - 2*carHalfLen // sit right behind the leader
			s.Events = append(s.Events, EventMsg{T: "event", Kind: "crash", Slot: rear.Slot, Data: "car"})
		}
	}
}

func (s *Sim) stepCar(c *Car) {
	if c.Finished {
		c.D += s.Track.BaseSpeed * 0.5 * Dt // coast past the line
		return
	}
	if c.StunT > 0 {
		c.StunT -= Dt
		return // stunned: frozen for a moment
	}
	if c.NitroT > 0 {
		c.NitroT -= Dt
	}
	if c.SlowT > 0 {
		c.SlowT -= Dt
	}

	// --- steering: consume tap-counter deltas (one lane per tap, none lost) ---
	net := 0
	if d := c.Input.LeftTaps - c.seenLeft; d > 0 {
		net -= d
		c.seenLeft = c.Input.LeftTaps
	}
	if d := c.Input.RightTaps - c.seenRight; d > 0 {
		net += d
		c.seenRight = c.Input.RightTaps
	}
	if net != 0 {
		c.Lane = clampInt(c.Lane+net, 0, s.Track.Lanes-1)
	}

	// slide LaneF toward Lane
	slide := Dt / (laneChangeTime * c.Spec.Handling)
	diff := float64(c.Lane) - c.LaneF
	if math.Abs(diff) <= slide {
		c.LaneF = float64(c.Lane)
	} else {
		c.LaneF += math.Copysign(slide, diff)
	}

	// --- forward speed ---
	speed := s.Track.BaseSpeed * c.Spec.SpeedBonus
	if c.NitroT > 0 {
		speed *= nitroFactor
	}
	if c.SlowT > 0 {
		// crashed: recover linearly back to full speed
		frac := 1 - c.SlowT/crashRecovery
		speed *= crashSlowdown + (1-crashSlowdown)*frac
	}
	oldD := c.D
	c.D += speed * Dt

	// --- item use ---
	if c.Input.UseItem && c.Item != "" {
		s.useItem(c)
	}
	c.Input.UseItem = false

	// --- obstacle collision: lane overlap (with slide tolerance) + swept
	// distance overlap so fast cars can't tunnel through a thin obstacle ---
	if c.SlowT <= 0 {
		for i := range s.Track.Obstacles {
			o := &s.Track.Obstacles[i]
			if math.Abs(c.LaneF-float64(o.Lane)) > laneTolerance {
				continue
			}
			od := s.obstacleD(o)
			if c.D+carHalfLen > od-obstacleHalfLen && oldD-carHalfLen < od+obstacleHalfLen {
				c.SlowT = crashRecovery
				c.D = od - obstacleHalfLen - carHalfLen // stop right behind it
				s.Events = append(s.Events, EventMsg{T: "event", Kind: "crash", Slot: c.Slot, Data: o.Type})
				break
			}
		}
	}

	// --- item pickup: boxes respawn after a few seconds; picking up while
	// already holding an item replaces it (so boxes never feel "dead") ---
	for i := range s.Track.Items {
		it := &s.Track.Items[i]
		if it.Lane != int(math.Round(c.LaneF)) {
			continue
		}
		if t, taken := s.takenAt[it.ID]; taken && s.Tick-t < itemRespawnTicks {
			continue
		}
		if math.Abs(c.D-it.D) < itemHalfLen+carHalfLen {
			s.takenAt[it.ID] = s.Tick
			if s.rng.Intn(2) == 0 {
				c.Item = "nitro"
			} else {
				c.Item = "bomb"
			}
			s.Events = append(s.Events, EventMsg{T: "event", Kind: "item_pickup", Slot: c.Slot, Data: c.Item})
			break
		}
	}

	// --- finish ---
	if c.D >= s.Track.Length {
		c.Finished = true
		c.FinishTick = s.Tick
		s.Events = append(s.Events, EventMsg{T: "event", Kind: "player_finish", Slot: c.Slot})
	}
}

// obstacleD returns the current distance of an obstacle (traffic rolls forward).
func (s *Sim) obstacleD(o *Obstacle) float64 {
	if o.Speed <= 0 {
		return o.D
	}
	travelled := o.Speed * float64(s.Tick) * Dt
	// traffic loops over the course so density stays constant
	return math.Mod(o.D+travelled, s.Track.Length)
}

// driveBot: simple AI — if an obstacle is ahead in my lane, pick a free
// adjacent lane; occasionally use items. Bots steer by setting Lane directly
// (players use tap counters).
func (s *Sim) driveBot(c *Car) {
	if c.Finished || c.StunT > 0 {
		return
	}
	lookahead := s.Track.BaseSpeed * 1.1 // ~1.1s ahead
	myLane := int(math.Round(c.LaneF))
	if s.laneBlocked(myLane, c.D, lookahead) && c.LaneF == float64(c.Lane) {
		// prefer the free neighbor; bots have slight reaction randomness
		if c.botRng.Float64() < 0.9 {
			left, right := myLane-1, myLane+1
			leftOK := left >= 0 && !s.laneBlocked(left, c.D, lookahead)
			rightOK := right < s.Track.Lanes && !s.laneBlocked(right, c.D, lookahead)
			switch {
			case leftOK && rightOK:
				if c.botRng.Intn(2) == 0 {
					c.Lane = left
				} else {
					c.Lane = right
				}
			case leftOK:
				c.Lane = left
			case rightOK:
				c.Lane = right
			}
		}
	}
	if c.Item != "" && c.botRng.Float64() < 0.02 {
		c.Input.UseItem = true
	}
}

func (s *Sim) laneBlocked(lane int, from, dist float64) bool {
	for i := range s.Track.Obstacles {
		o := &s.Track.Obstacles[i]
		if o.Lane != lane {
			continue
		}
		od := s.obstacleD(o)
		if od > from-carHalfLen && od < from+dist {
			return true
		}
	}
	return false
}

func (s *Sim) useItem(c *Car) {
	switch c.Item {
	case "nitro":
		c.NitroT = nitroDuration
	case "bomb":
		s.bombSeq++
		s.Bombs = append(s.Bombs, &Bomb{
			ID: s.bombSeq, D: c.D - carHalfLen*3, Lane: int(math.Round(c.LaneF)), Owner: c.Slot,
		})
	}
	s.Events = append(s.Events, EventMsg{T: "event", Kind: "item_use", Slot: c.Slot, Data: c.Item})
	c.Item = ""
}

func (s *Sim) stepBombs() {
	alive := s.Bombs[:0]
	for _, b := range s.Bombs {
		b.Age += Dt
		exploded := false
		if b.Age >= bombArmDelay {
			for _, c := range s.Cars {
				if c.Slot == b.Owner || c.Finished || c.StunT > 0 {
					continue
				}
				if int(math.Round(c.LaneF)) == b.Lane && math.Abs(c.D-b.D) < carHalfLen*2.5 {
					c.StunT = stunDuration
					s.Events = append(s.Events, EventMsg{T: "event", Kind: "bomb_hit", Slot: c.Slot})
					exploded = true
				}
			}
		}
		if !exploded && b.Age < bombLifetime {
			alive = append(alive, b)
		}
	}
	s.Bombs = alive
}

func (s *Sim) rankCars() {
	type entry struct {
		c   *Car
		key float64
	}
	var es []entry
	for _, c := range s.Cars {
		k := c.D
		if c.Finished {
			k = 1e12 - float64(c.FinishTick)
		}
		es = append(es, entry{c, k})
	}
	for i := 1; i < len(es); i++ {
		for j := i; j > 0 && es[j].key > es[j-1].key; j-- {
			es[j], es[j-1] = es[j-1], es[j]
		}
	}
	for i, e := range es {
		e.c.position = i + 1
	}
}

// Snapshot: cars in track coordinates (d + lane), plus live obstacle
// positions for moving traffic and active bombs. Static obstacles/items ship
// once via the track JSON; the client renders taken items from events.
func (s *Sim) Snapshot() StateMsg {
	msg := StateMsg{T: "state", Tick: s.Tick}
	for _, c := range s.Cars {
		msg.Cars = append(msg.Cars, CarState{
			Slot: c.Slot, D: round1(c.D), Lane: round3(c.LaneF),
			Position: c.position, Item: c.Item,
			NitroActive: c.NitroT > 0, Stunned: c.StunT > 0, Crashed: c.SlowT > 0,
			Finished: c.Finished, IsBot: c.IsBot,
		})
	}
	// Only ship traffic near a car: full-track traffic at 20Hz is dead weight
	// (and bloated frames trip aggressive middleboxes on player networks).
	minD, maxD := 1e18, -1e18
	for _, c := range s.Cars {
		if c.D < minD {
			minD = c.D
		}
		if c.D > maxD {
			maxD = c.D
		}
	}
	for i := range s.Track.Obstacles {
		o := &s.Track.Obstacles[i]
		if o.Speed > 0 {
			od := s.obstacleD(o)
			if od > minD-800 && od < maxD+2500 {
				msg.Traffic = append(msg.Traffic, TrafficState{ID: o.ID, D: round1(od), Lane: o.Lane})
			}
		}
	}
	for _, b := range s.Bombs {
		msg.Bombs = append(msg.Bombs, BombState{ID: b.ID, D: round1(b.D), Lane: b.Lane, Armed: b.Age >= bombArmDelay})
	}
	for id, t := range s.takenAt {
		if s.Tick-t < itemRespawnTicks {
			msg.TakenItems = append(msg.TakenItems, id)
		}
	}
	return msg
}

func (s *Sim) DrainEvents() []EventMsg {
	ev := s.Events
	s.Events = nil
	return ev
}

// AllFinished: every non-bot player done (bots never hold a race open).
func (s *Sim) AllFinished() bool {
	humans := 0
	for _, c := range s.Cars {
		if c.IsBot {
			continue
		}
		humans++
		if !c.Finished {
			return false
		}
	}
	return humans > 0
}

func clamp(v, lo, hi float64) float64 { return math.Max(lo, math.Min(hi, v)) }

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
func round1(v float64) float64        { return math.Round(v*10) / 10 }
func round3(v float64) float64        { return math.Round(v*1000) / 1000 }
