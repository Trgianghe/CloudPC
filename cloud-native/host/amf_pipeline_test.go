//go:build windows && amd64

package main

import (
	"strings"
	"testing"
)

func TestAMFPipelineStaysOnGPUAndLimitsEncoderQueue(t *testing.T) {
	args := videoRTPCommand(Config{Encoder: "amf", CaptureMode: "amf"}, StreamSettings{Bitrate: 15, FPS: 160, Preset: "2k60", Codec: "h264"}, 1234)
	joined := strings.Join(args, " ")
	for _, forbidden := range []string{"hwdownload", "scale_d3d11", "-fps_mode cfr", "-r 160"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("unexpected queue/copy: %s", forbidden)
		}
	}
	for _, required := range []string{"vsrc_amf=monitor_index=0:framerate=160", "vpp_amf=w=2560:h=1440", "force_original_aspect_ratio=decrease", "PREV_OUTPTS+1", "-async_depth 1", "-preanalysis false", "-preencode false", "-forced_idr 1", "-header_spacing 80", "-force_key_frames expr:gte(t,n_forced*0.5)", "-fps_mode passthrough"} {
		if !strings.Contains(joined, required) {
			t.Fatalf("missing low latency control: %s", required)
		}
	}
}
