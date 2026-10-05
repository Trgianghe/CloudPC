//go:build windows && amd64

package main

import (
	"encoding/binary"
	"fmt"
	"golang.org/x/sys/windows"
	"path/filepath"
	"syscall"
	"unsafe"
)

var user32 = windows.NewLazySystemDLL("user32.dll")
var sendInput = user32.NewProc("SendInput")
var mapKey = user32.NewProc("MapVirtualKeyW")
var dpiAware = user32.NewProc("SetProcessDpiAwarenessContext")

type WindowsSink struct {
	gamepad                       *ViGEm
	captureAdapter, captureOutput int
	captureRect, desktopRect      DesktopRect
	captureUpdated                int64
}

func emitInput(kind uint32, data []byte) error {
	// INPUT has an 8-byte aligned union on Windows x64: sizeof(INPUT)=40.
	var input [40]byte
	binary.LittleEndian.PutUint32(input[:], kind)
	copy(input[8:], data)
	count, _, err := sendInput.Call(1, uintptr(unsafe.Pointer(&input[0])), 40)
	if count != 1 {
		return fmt.Errorf("SendInput blocked (UIPI/secure desktop?): %v", err)
	}
	return nil
}
func (s *WindowsSink) Move(dx, dy int16) error {
	var b [32]byte
	binary.LittleEndian.PutUint32(b[:], uint32(int32(dx)))
	binary.LittleEndian.PutUint32(b[4:], uint32(int32(dy)))
	binary.LittleEndian.PutUint32(b[12:], 1)
	return emitInput(0, b[:])
}
func (s *WindowsSink) Mouse(button byte, down bool) error {
	flags := [3][2]uint32{{2, 4}, {8, 16}, {32, 64}}
	if button > 2 {
		return fmt.Errorf("unknown mouse button")
	}
	index := 1
	if down {
		index = 0
	}
	var b [32]byte
	binary.LittleEndian.PutUint32(b[12:], flags[button][index])
	return emitInput(0, b[:])
}
func (s *WindowsSink) Key(vk uint16, down bool) error {
	scan, _, _ := mapKey.Call(uintptr(vk), 4)
	flags := uint32(8)
	if !down {
		flags |= 2
	}
	if scan&0xff00 != 0 {
		flags |= 1
	}
	// Pause has no ordinary scan code; use its VK representation.
	var b [24]byte
	if scan == 0 || vk == 19 {
		binary.LittleEndian.PutUint16(b[:], vk)
		flags &= ^uint32(8)
	} else {
		binary.LittleEndian.PutUint16(b[2:], uint16(scan&255))
	}
	binary.LittleEndian.PutUint32(b[4:], flags)
	return emitInput(1, b[:])
}
func (s *WindowsSink) Pad(report PadReport) error {
	if s.gamepad == nil {
		return nil
	}
	return s.gamepad.Update(report)
}

type ViGEm struct {
	dll                                                *windows.DLL
	client, target                                     uintptr
	update, remove, freeTarget, disconnect, freeClient *windows.Proc
}

func OpenViGEm(file string) (*ViGEm, error) {
	absolute, err := filepath.Abs(file)
	if err != nil {
		return nil, err
	}
	dll, err := windows.LoadDLL(absolute)
	if err != nil {
		return nil, err
	}
	names := []string{"vigem_alloc", "vigem_connect", "vigem_target_x360_alloc", "vigem_target_add", "vigem_target_x360_update", "vigem_target_remove", "vigem_target_free", "vigem_disconnect", "vigem_free"}
	p := make([]*windows.Proc, len(names))
	for i, name := range names {
		p[i], err = dll.FindProc(name)
		if err != nil {
			dll.Release()
			return nil, err
		}
	}
	v := &ViGEm{dll: dll, update: p[4], remove: p[5], freeTarget: p[6], disconnect: p[7], freeClient: p[8]}
	v.client, _, _ = p[0].Call()
	if v.client == 0 {
		v.Close()
		return nil, fmt.Errorf("vigem_alloc failed")
	}
	code, _, _ := p[1].Call(v.client)
	if uint32(code) != 0x20000000 {
		v.Close()
		return nil, fmt.Errorf("ViGEmBus connect: 0x%08x", code)
	}
	v.target, _, _ = p[2].Call()
	if v.target == 0 {
		v.Close()
		return nil, fmt.Errorf("target allocation failed")
	}
	code, _, _ = p[3].Call(v.client, v.target)
	if uint32(code) != 0x20000000 {
		v.Close()
		return nil, fmt.Errorf("ViGEm target add: 0x%08x", code)
	}
	return v, nil
}
func (v *ViGEm) Update(p PadReport) error {
	// XUSB_REPORT ABI: buttons, LT, RT, signed LX/LY/RX/RY. 12-byte struct
	// is passed by reference under the Windows x64 aggregate calling convention.
	var b [12]byte
	binary.LittleEndian.PutUint16(b[:], p.Buttons)
	b[2] = p.LT
	b[3] = p.RT
	for i, x := range []int16{p.LX, p.LY, p.RX, p.RY} {
		binary.LittleEndian.PutUint16(b[4+i*2:], uint16(x))
	}
	code, _, _ := v.update.Call(v.client, v.target, uintptr(unsafe.Pointer(&b[0])))
	if uint32(code) != 0x20000000 {
		return fmt.Errorf("ViGEm update: 0x%08x", code)
	}
	return nil
}
func (v *ViGEm) Close() {
	if v == nil {
		return
	}
	if v.target != 0 {
		v.remove.Call(v.client, v.target)
		v.freeTarget.Call(v.target)
		v.target = 0
	}
	if v.client != 0 {
		v.disconnect.Call(v.client)
		v.freeClient.Call(v.client)
		v.client = 0
	}
	if v.dll != nil {
		v.dll.Release()
		v.dll = nil
	}
}
func init() {
	if dpiAware.Find() == nil {
		dpiAware.Call(^uintptr(3))
	}
	_ = syscall.Errno(0)
}
