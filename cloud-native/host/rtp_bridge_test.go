package main

import (
	"github.com/pion/rtp"
	"testing"
)

func TestRTPBridgeImmediateAndContinuous(t *testing.T) {
	bridge := &rtpBridge{}
	var output []rtp.Packet
	write := func(packet *rtp.Packet) error { output = append(output, *packet); return nil }
	first := bridge.stream(120, write)
	packet := rtp.Packet{Header: rtp.Header{Version: 2, SequenceNumber: 65535, Timestamp: 100, Marker: true}, Payload: []byte{1}}
	_ = first(&packet)
	if len(output) != 1 || !output[0].Marker {
		t.Fatal("packet was delayed or frame marker lost")
	}
	restarted := bridge.stream(120, write)
	_ = first(&packet)
	if len(output) != 1 {
		t.Fatal("cancelled stream reached the peer")
	}
	packet.SequenceNumber = 12
	packet.Timestamp = 4000
	_ = restarted(&packet)
	if output[1].SequenceNumber != 0 || output[1].Timestamp != 850 {
		t.Fatalf("restart discontinuity: %+v", output[1].Header)
	}
	packet.SequenceNumber = 14
	packet.Timestamp = 4750
	_ = restarted(&packet)
	if output[2].SequenceNumber != 2 || output[2].Timestamp != 1600 {
		t.Fatal("input gaps/timestamps not preserved")
	}
	if packet.SequenceNumber != 14 || packet.Timestamp != 4750 {
		t.Fatal("encoder packet mutated")
	}
}
