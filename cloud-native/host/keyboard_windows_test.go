//go:build windows && amd64

package main

import (
	"encoding/binary"
	"testing"
)

func TestKeypadEnterHasSeparateExtendedScanCode(t *testing.T) {
	for _, down := range []bool{true, false} {
		main := keyboardInput(13, 0x1c, down)
		pad := keyboardInput(254, 0, down)
		if binary.LittleEndian.Uint16(pad[2:]) != 0x1c || binary.LittleEndian.Uint32(pad[4:])&1 == 0 {
			t.Fatal("keypad Enter must have E0 flag and Enter scan code")
		}
		if binary.LittleEndian.Uint32(main[4:])&1 != 0 {
			t.Fatal("main Enter is not extended")
		}
		if (binary.LittleEndian.Uint32(pad[4:])&2 != 0) == down {
			t.Fatal("incorrect press/release flag")
		}
	}
}
