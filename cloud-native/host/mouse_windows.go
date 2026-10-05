//go:build windows && amd64

package main

import (
	"encoding/binary"
	"fmt"
	"golang.org/x/sys/windows"
	"time"
	"unsafe"
)

func captureBounds(adapterIndex, outputIndex int) (DesktopRect, error) {
	var factory, adapter, output uintptr
	iid := guid("{770AAE78-F26F-4DBA-A829-253C83D1B387}")
	create := windows.NewLazySystemDLL("dxgi.dll").NewProc("CreateDXGIFactory1")
	hr, _, _ := create.Call(uintptr(unsafe.Pointer(&iid)), uintptr(unsafe.Pointer(&factory)))
	if int32(hr) < 0 {
		return DesktopRect{}, fmt.Errorf("CreateDXGIFactory1: %08x", hr)
	}
	defer comRelease(factory)
	if _, err := comCall(factory, 12, uintptr(adapterIndex), uintptr(unsafe.Pointer(&adapter))); err != nil {
		return DesktopRect{}, err
	}
	defer comRelease(adapter)
	if _, err := comCall(adapter, 7, uintptr(outputIndex), uintptr(unsafe.Pointer(&output))); err != nil {
		return DesktopRect{}, err
	}
	defer comRelease(output)
	var desc [96]byte
	if _, err := comCall(output, 7, uintptr(unsafe.Pointer(&desc[0]))); err != nil {
		return DesktopRect{}, err
	}
	left := int32(binary.LittleEndian.Uint32(desc[64:]))
	top := int32(binary.LittleEndian.Uint32(desc[68:]))
	right := int32(binary.LittleEndian.Uint32(desc[72:]))
	bottom := int32(binary.LittleEndian.Uint32(desc[76:]))
	if right <= left || bottom <= top {
		return DesktopRect{}, fmt.Errorf("captured output not attached")
	}
	return DesktopRect{left, top, right - left, bottom - top}, nil
}
func virtualDesktop() DesktopRect {
	metric := user32.NewProc("GetSystemMetrics")
	value := func(i uintptr) int32 { v, _, _ := metric.Call(i); return int32(v) }
	return DesktopRect{value(76), value(77), value(78), value(79)}
}
func (s *WindowsSink) Absolute(x, y uint16) error {
	if time.Now().UnixNano()-s.captureUpdated > int64(time.Second) {
		output, err := captureBounds(s.captureAdapter, s.captureOutput)
		if err != nil {
			return err
		}
		s.captureRect = output
		s.desktopRect = virtualDesktop()
		s.captureUpdated = time.Now().UnixNano()
	}
	if s.desktopRect.Width <= 0 || s.desktopRect.Height <= 0 {
		return fmt.Errorf("virtual desktop unavailable")
	}
	x, y = normalizeDesktop(x, y, s.captureRect, s.desktopRect)
	var b [32]byte
	binary.LittleEndian.PutUint32(b[:], uint32(x))
	binary.LittleEndian.PutUint32(b[4:], uint32(y))
	binary.LittleEndian.PutUint32(b[12:], 0x8000|0x4000|1)
	return emitInput(0, b[:])
}
func (s *WindowsSink) Wheel(delta int16) error {
	var b [32]byte
	binary.LittleEndian.PutUint32(b[8:], uint32(int32(delta)))
	binary.LittleEndian.PutUint32(b[12:], 0x0800)
	return emitInput(0, b[:])
}
func streamGeometry(c Config, s StreamSettings) map[string]any {
	adapter := c.Adapter
	if c.CaptureMode == "copy" {
		adapter = 0
	}
	r, err := captureBounds(adapter, c.Output)
	if err != nil {
		return nil
	}
	w, h, _ := s.Dimensions()
	x, y, cw, ch := 0.0, 0.0, 1.0, 1.0
	if c.CaptureMode == "copy" {
		if float64(r.Width)/float64(r.Height) > float64(w)/float64(h) {
			ch = (float64(w) * float64(r.Height) / float64(r.Width)) / float64(h)
			y = (1 - ch) / 2
		} else {
			cw = (float64(h) * float64(r.Width) / float64(r.Height)) / float64(w)
			x = (1 - cw) / 2
		}
	}
	return map[string]any{"sourceWidth": r.Width, "sourceHeight": r.Height, "content": map[string]float64{"x": x, "y": y, "width": cw, "height": ch}}
}
