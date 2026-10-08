package main

import (
	"github.com/pion/rtp"
	"testing"
	"time"
)

func TestFrameClockKeepsFragmentsAndActualCadence(t *testing.T) {
	var c frameClock
	origin := time.Now()
	first := &rtp.Packet{Header: rtp.Header{Timestamp: 999}}
	c.Stamp(first, origin)
	end := &rtp.Packet{Header: rtp.Header{Timestamp: 999, Marker: true}}
	c.Stamp(end, origin.Add(2*time.Millisecond))
	if first.Timestamp != end.Timestamp {
		t.Fatal("fragments must share frame timestamp")
	}
	next := &rtp.Packet{Header: rtp.Header{Timestamp: 999, Marker: true}}
	c.Stamp(next, origin.Add(10*time.Millisecond))
	if next.Timestamp-first.Timestamp != 900 {
		t.Fatal("duplicate source PTS must use real 10ms cadence", next.Timestamp)
	}
	later := &rtp.Packet{Header: rtp.Header{Timestamp: 1000, Marker: true}}
	c.Stamp(later, origin.Add(50*time.Millisecond))
	if later.Timestamp != 4500 {
		t.Fatal("a source pause must not manufacture extra frames")
	}
}
