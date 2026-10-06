//go:build windows && amd64

package main

import (
	"strings"
	"testing"
)

func TestRTPOutputAvoidsElementaryFrameWait(t *testing.T) {
	args := videoRTPCommand(Config{Encoder: "nvenc", CaptureMode: "copy"}, StreamSettings{Bitrate: 15, FPS: 120, Preset: "720p120", Codec: "h264"}, 12345)
	text := strings.Join(args, " ")
	if !strings.Contains(text, "-f rtp rtp://127.0.0.1:12345?pkt_size=1200") || strings.Contains(text, "pipe:1") {
		t.Fatal(text)
	}
	if !strings.Contains(text, "-delay 0") || !strings.Contains(text, "-bufsize 125000") {
		t.Fatal("encoder latency settings lost")
	}
	if strings.Contains(text, "-r ") || strings.Contains(text, "-fps_mode cfr") || !strings.Contains(text, "-enc_time_base 1:90000 -fps_mode passthrough") {
		t.Fatal("capture timestamps must not manufacture duplicate frames: " + text)
	}
}

func Test2K160Settings(t *testing.T) {
	s := StreamSettings{Bitrate: 40, FPS: 160, Preset: "2k60", Codec: "h264"}
	if err := s.Validate(); err != nil {
		t.Fatal(err)
	}
	w, h, fps := s.Dimensions()
	if w != 2560 || h != 1440 || fps != 160 {
		t.Fatal(w, h, fps)
	}
	s.FPS = 161
	if s.Validate() == nil {
		t.Fatal("unsupported FPS accepted")
	}
}
