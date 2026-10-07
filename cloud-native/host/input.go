package main

import (
	"encoding/binary"
	"errors"
	"sync"
	"time"
)

type PadReport struct {
	Buttons        uint16
	LX, LY, RX, RY int16
	LT, RT         byte
}
type InputSink interface {
	Move(int16, int16) error
	Absolute(uint16, uint16) error
	Wheel(int16) error
	Key(uint16, bool) error
	Mouse(byte, bool) error
	Pad(PadReport) error
}
type InputState struct {
	mu           sync.Mutex
	sink         InputSink
	held         [256]bool
	buttons      byte
	last         time.Time
	snapshot     uint32
	haveSnapshot bool
	viewOnly     bool
	lastPad      PadReport
	havePad      bool
}

func NewInput(sink InputSink, viewOnly bool) *InputState {
	return &InputState{sink: sink, viewOnly: viewOnly, last: time.Now()}
}
func padFrom(b []byte) PadReport {
	return PadReport{binary.LittleEndian.Uint16(b), int16(binary.LittleEndian.Uint16(b[2:])), int16(binary.LittleEndian.Uint16(b[4:])), int16(binary.LittleEndian.Uint16(b[6:])), int16(binary.LittleEndian.Uint16(b[8:])), b[10], b[11]}
}
func (s *InputState) mouseLocked(mask byte) error {
	if mask&^byte(7) != 0 {
		return errors.New("invalid button mask")
	}
	for button := byte(0); button < 3; button++ {
		bit := byte(1) << button
		if (s.buttons & bit) != (mask & bit) {
			if err := s.sink.Mouse(button, mask&bit != 0); err != nil {
				return err
			}
		}
	}
	s.buttons = mask
	return nil
}
func (s *InputState) keyLocked(vk uint16, down bool) error {
	if vk < 1 || vk > 254 {
		return errors.New("invalid virtual-key")
	}
	if s.held[vk] == down {
		return nil
	}
	if err := s.sink.Key(vk, down); err != nil {
		return err
	}
	s.held[vk] = down
	return nil
}
func (s *InputState) releaseLocked() {
	for vk, held := range s.held {
		if held {
			_ = s.sink.Key(uint16(vk), false)
			s.held[vk] = false
		}
	}
	_ = s.mouseLocked(0)
	_ = s.sink.Pad(PadReport{})
	s.lastPad = PadReport{}
	s.havePad = false
}
func (s *InputState) Release() { s.mu.Lock(); defer s.mu.Unlock(); s.releaseLocked() }
func (s *InputState) Receive(b []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(b) == 0 {
		return errors.New("empty packet")
	}
	expected := map[byte]int{1: 5, 2: 2, 3: 4, 4: 13, 5: 50, 6: 1, 7: 9, 8: 58}
	size, ok := expected[b[0]]
	if !ok || len(b) != size {
		return errors.New("wrong binary packet size")
	}
	s.last = time.Now()
	if b[0] == 6 {
		s.releaseLocked()
		return nil
	}
	if s.viewOnly || b[0] == 7 {
		return nil
	}
	switch b[0] {
	case 1:
		return s.sink.Move(int16(binary.LittleEndian.Uint16(b[1:])), int16(binary.LittleEndian.Uint16(b[3:])))
	case 2:
		return s.mouseLocked(b[1])
	case 3:
		if b[1] > 1 {
			return errors.New("invalid keyboard action")
		}
		return s.keyLocked(binary.LittleEndian.Uint16(b[2:]), b[1] == 1)
	case 4:
		report := padFrom(b[1:])
		if err := s.sink.Pad(report); err != nil {
			return err
		}
		s.lastPad, s.havePad = report, true
		return nil
	case 5, 8:
		seq := binary.LittleEndian.Uint32(b[1:])
		if s.haveSnapshot && int32(seq-s.snapshot) <= 0 {
			return nil
		}
		s.snapshot = seq
		s.haveSnapshot = true
		if err := s.mouseLocked(b[5]); err != nil {
			return err
		}
		for vk := uint16(1); vk <= 254; vk++ {
			down := b[6+vk/8]&(1<<(vk%8)) != 0
			if err := s.keyLocked(vk, down); err != nil {
				return err
			}
		}
		report := padFrom(b[38:50])
		if !s.havePad || report != s.lastPad {
			if err := s.sink.Pad(report); err != nil {
				return err
			}
			s.lastPad, s.havePad = report, true
		}
		return nil
	}
	return nil
}
func (s *InputState) Watchdog(stop <-chan struct{}) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			s.Release()
			return
		case <-ticker.C:
			s.mu.Lock()
			if time.Since(s.last) > 750*time.Millisecond {
				s.releaseLocked()
			}
			s.mu.Unlock()
		}
	}
}
