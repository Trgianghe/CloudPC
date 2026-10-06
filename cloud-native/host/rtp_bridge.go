package main

import (
	"github.com/pion/rtp"
	"sync"
)

// Preserve timestamp/sequence continuity when FFmpeg restarts on a settings change.
// A stream generation prevents packets from a cancelled capture reaching the peer.
type rtpBridge struct {
	mu          sync.Mutex
	generation  uint64
	initialized bool
	sequence    uint16
	timestamp   uint32
}

func (b *rtpBridge) stream(fps int, write func(*rtp.Packet) error) func(*rtp.Packet) error {
	b.mu.Lock()
	b.generation++
	generation := b.generation
	sequence, timestamp, initialized := b.sequence, b.timestamp, b.initialized
	b.mu.Unlock()
	first := true
	var inputSequence uint16
	var inputTimestamp uint32
	var baseSequence uint16
	var baseTimestamp uint32
	return func(packet *rtp.Packet) error {
		b.mu.Lock()
		defer b.mu.Unlock()
		if generation != b.generation {
			return nil
		}
		if first {
			inputSequence, inputTimestamp = packet.SequenceNumber, packet.Timestamp
			baseSequence, baseTimestamp = inputSequence, inputTimestamp
			if initialized {
				baseSequence = sequence + 1
				baseTimestamp = timestamp + uint32(90000/fps)
			}
			first = false
		}
		outgoing := *packet
		outgoing.Header = packet.Header.Clone()
		outgoing.SequenceNumber = baseSequence + (packet.SequenceNumber - inputSequence)
		outgoing.Timestamp = baseTimestamp + (packet.Timestamp - inputTimestamp)
		if err := write(&outgoing); err != nil {
			return err
		}
		b.sequence, b.timestamp, b.initialized = outgoing.SequenceNumber, outgoing.Timestamp, true
		return nil
	}
}
