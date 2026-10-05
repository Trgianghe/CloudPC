package main

import (
	"bufio"
	"encoding/binary"
	"strings"
	"testing"
	"time"
)

type fakeSink struct {
	keys    map[uint16]bool
	buttons byte
	dx, dy  int16
	pad     PadReport
	calls   int
	ax, ay  uint16
	wheel   int16
}

func (s *fakeSink) Absolute(x, y uint16) error { s.ax = x; s.ay = y; s.calls++; return nil }
func (s *fakeSink) Wheel(d int16) error        { s.wheel = d; s.calls++; return nil }

func (s *fakeSink) Move(x, y int16) error { s.dx = x; s.dy = y; s.calls++; return nil }
func (s *fakeSink) Key(k uint16, d bool) error {
	if s.keys == nil {
		s.keys = map[uint16]bool{}
	}
	s.keys[k] = d
	s.calls++
	return nil
}
func (s *fakeSink) Mouse(k byte, d bool) error {
	if d {
		s.buttons |= 1 << k
	} else {
		s.buttons &= ^(1 << k)
	}
	s.calls++
	return nil
}
func (s *fakeSink) Pad(p PadReport) error { s.pad = p; s.calls++; return nil }
func TestBinaryInputAndSnapshotRecovery(t *testing.T) {
	sink := &fakeSink{}
	s := NewInput(sink, false)
	if err := s.Receive([]byte{1, 0x85, 0xff, 0xff, 0x7f}); err != nil || sink.dx != -123 || sink.dy != 32767 {
		t.Fatal("move decode", err)
	}
	_ = s.Receive([]byte{3, 1, 87, 0})
	_ = s.Receive([]byte{2, 3})
	if !sink.keys[87] || sink.buttons != 3 {
		t.Fatal("keys/buttons not held")
	}
	b := make([]byte, 13)
	b[0] = 4
	binary.LittleEndian.PutUint16(b[1:], 0x1000)
	binary.LittleEndian.PutUint16(b[3:], 0x8000)
	b[11] = 255
	_ = s.Receive(b)
	if sink.pad.LX != -32768 || sink.pad.LT != 255 {
		t.Fatal("gamepad decode")
	}
	// A lost key-up is repaired by the next full-state snapshot.
	state := make([]byte, 50)
	state[0] = 5
	binary.LittleEndian.PutUint32(state[1:], 10)
	_ = s.Receive(state)
	if sink.keys[87] || sink.buttons != 0 || sink.pad != (PadReport{}) {
		t.Fatal("snapshot failed to release lost events")
	}
	older := append([]byte(nil), state...)
	binary.LittleEndian.PutUint32(older[1:], 9)
	older[6+87/8] |= 1 << (87 % 8)
	_ = s.Receive(older)
	if sink.keys[87] {
		t.Fatal("old snapshot applied")
	}
	for _, invalid := range [][]byte{{}, {1}, {3, 2, 87, 0}, {3, 1, 255, 0}, {4, 0, 0}} {
		if s.Receive(invalid) == nil {
			t.Fatalf("accepted invalid input %v", invalid)
		}
	}
}
func TestSelfHostAndTimeout(t *testing.T) {
	sink := &fakeSink{}
	s := NewInput(sink, true)
	_ = s.Receive([]byte{3, 1, 87, 0})
	_ = s.Receive([]byte{1, 1, 0, 1, 0})
	if sink.calls != 0 {
		t.Fatal("self-host injected input")
	}
	s.viewOnly = false
	_ = s.Receive([]byte{3, 1, 87, 0})
	s.last = time.Now().Add(-time.Second)
	stop := make(chan struct{})
	go s.Watchdog(stop)
	time.Sleep(150 * time.Millisecond)
	close(stop)
	s.mu.Lock()
	held := s.held[87]
	s.mu.Unlock()
	if held {
		t.Fatal("watchdog did not release")
	}
}
func TestAnnexBReaderPreservesNALs(t *testing.T) {
	scan := bufio.NewScanner(strings.NewReader("\x00\x00\x00\x01\x09\xf0\x00\x00\x01\x67\x01\x02\x00\x00\x00\x01\x65\x55"))
	scan.Split(splitAnnexB)
	var nals [][]byte
	for scan.Scan() {
		nals = append(nals, append([]byte(nil), scan.Bytes()...))
	}
	if len(nals) != 3 || nals[0][0] != 9 || nals[1][0] != 0x67 || nals[2][0] != 0x65 {
		t.Fatal("NAL parsing", nals, scan.Err())
	}
}
