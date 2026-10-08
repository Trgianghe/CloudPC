package main

import (
	"github.com/pion/rtp"
	"time"
)

// AMF capture may repeat source PTS. One-tick repairs give the receiver bursts
// of near-identical presentation times. Use the local monotonic frame clock,
// once per complete RTP access unit; never timestamp individual fragments.
type frameClock struct {
	started   bool
	origin    time.Time
	next      bool
	timestamp uint32
}

func (c *frameClock) Stamp(packet *rtp.Packet, now time.Time) {
	if !c.started {
		c.started = true
		c.origin = now
		c.next = true
	}
	if c.next {
		ticks := uint32(now.Sub(c.origin).Nanoseconds() * 90000 / int64(time.Second))
		if ticks == c.timestamp && !now.Equal(c.origin) {
			ticks++
		}
		c.timestamp = ticks
		c.next = false
	}
	packet.Timestamp = c.timestamp
	if packet.Marker {
		c.next = true
	}
}
