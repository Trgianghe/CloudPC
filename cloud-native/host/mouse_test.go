package main

import (
	"strings"
	"testing"
)

func TestMouseProtocolV2(t *testing.T) {
	sink := &fakeSink{}
	s := NewInput(sink, false)
	if err := s.ReceiveMouse([]byte{1, 255, 255, 0, 128}); err != nil || sink.ax != 65535 || sink.ay != 32768 {
		t.Fatal("absolute", err)
	}
	_ = s.ReceiveMouse([]byte{2, 133, 255, 0, 128})
	if sink.dx != -123 || sink.dy != -32768 {
		t.Fatal("relative")
	}
	_ = s.ReceiveMouse([]byte{3, 1, 1})
	if sink.buttons != 4 {
		t.Fatal("middle mapping")
	}
	_ = s.ReceiveMouse([]byte{3, 2, 1})
	if sink.buttons != 6 {
		t.Fatal("right mapping")
	}
	_ = s.ReceiveMouse([]byte{3, 1, 0})
	if sink.buttons != 2 {
		t.Fatal("up")
	}
	_ = s.ReceiveMouse([]byte{4, 136, 255})
	if sink.wheel != -120 {
		t.Fatal("wheel sign")
	}
	s.Release()
	if sink.buttons != 0 {
		t.Fatal("stuck button")
	}
	for _, b := range [][]byte{{}, {1, 0}, {2, 0, 0}, {3, 3, 1}, {3, 0, 2}, {4, 0, 0, 0}} {
		if s.ReceiveMouse(b) == nil {
			t.Fatal("accepted malformed", b)
		}
	}
	v := NewInput(&fakeSink{}, true)
	if err := v.ReceiveMouse([]byte{1, 255, 255, 0, 128}); err != nil {
		t.Fatal(err)
	}
}
func TestMultiMonitorMappingAndCursorFreeCapture(t *testing.T) {
	output := DesktopRect{-1920, 0, 1920, 1080}
	desktop := DesktopRect{-1920, 0, 3840, 1080}
	x, y := normalizeDesktop(65535, 65535, output, desktop)
	if x >= 32768 || y < 65400 {
		t.Fatal("mapped outside selected output", x, y)
	}
	x, _ = normalizeDesktop(0, 0, DesktopRect{0, 0, 1920, 1080}, desktop)
	if x < 32768 || x > 32790 {
		t.Fatal("negative origin", x)
	}
	args := strings.Join(videoCommand(Config{CaptureMode: "copy", Encoder: "nvenc"}, StreamSettings{Bitrate: 20, Preset: "1080p120", Codec: "h264"}), " ")
	if !strings.Contains(args, "draw_mouse=0") || strings.Contains(args, "draw_mouse=1") {
		t.Fatal("cursor composited")
	}
}
