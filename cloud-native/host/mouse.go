package main

import (
	"encoding/binary"
	"errors"
	"time"
)

// ReceiveMouse consumes only mouse-v2, never the legacy keyboard/gamepad channel.
func (s *InputState) ReceiveMouse(b []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(b) == 0 {
		return errors.New("empty mouse packet")
	}
	lengths := map[byte]int{1: 5, 2: 5, 3: 3, 4: 3}
	if n, ok := lengths[b[0]]; !ok || n != len(b) {
		return errors.New("invalid mouse-v2 packet")
	}
	if b[0] == 3 && (b[1] > 2 || b[2] > 1) {
		return errors.New("invalid mouse action")
	}
	s.last = time.Now()
	if s.viewOnly {
		return nil
	}
	switch b[0] {
	case 1:
		return s.sink.Absolute(binary.LittleEndian.Uint16(b[1:]), binary.LittleEndian.Uint16(b[3:]))
	case 2:
		return s.sink.Move(int16(binary.LittleEndian.Uint16(b[1:])), int16(binary.LittleEndian.Uint16(b[3:])))
	case 3:
		button := [3]byte{0, 2, 1}[b[1]]
		mask := s.buttons
		if b[2] == 1 {
			mask |= 1 << button
		} else {
			mask &^= 1 << button
		}
		return s.mouseLocked(mask)
	case 4:
		return s.sink.Wheel(int16(binary.LittleEndian.Uint16(b[1:])))
	}
	return nil
}

type DesktopRect struct{ Left, Top, Width, Height int32 }

// Coordinates in the wire packet span the captured output, not all monitors.
func normalizeDesktop(x, y uint16, output, desktop DesktopRect) (uint16, uint16) {
	axis := func(n uint16, start, size, origin, total int32) uint16 {
		if total <= 1 || size <= 0 {
			return 0
		}
		pixel := int64(start-origin) + (int64(n)*int64(size-1)+32767)/65535
		value := (pixel*65536 + 32768) / int64(total)
		if value < 0 {
			value = 0
		}
		if value > 65535 {
			value = 65535
		}
		return uint16(value)
	}
	return axis(x, output.Left, output.Width, desktop.Left, desktop.Width), axis(y, output.Top, output.Height, desktop.Top, desktop.Height)
}
