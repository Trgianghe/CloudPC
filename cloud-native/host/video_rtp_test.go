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
}
