//go:build windows && amd64

package main

import (
	"context"
	"github.com/pion/webrtc/v4"
)

func (s *Session) streamVideo(ctx context.Context, settings StreamSettings) error {
	// Wait for the previous capture/encoder to exit before opening another.
	// Superseded settings are cancelled while waiting and never start capture.
	s.videoMu.Lock()
	defer s.videoMu.Unlock()
	if ctx.Err() != nil {
		return nil
	}
	releasePower := keepDisplayForStream()
	defer releasePower()
	if track, ok := s.video.(*webrtc.TrackLocalStaticRTP); ok {
		metrics := make(chan float64, 1)
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case fps := <-metrics:
					_ = s.writer.Send(map[string]any{"type": "status", "status": map[string]any{"encodedFPS": fps}})
				}
			}
		}()
		err := VideoRTPStream(ctx, s.config, settings, track, &s.rtpBridge, metrics)
		if err != nil && ctx.Err() == nil && s.config.CaptureMode == "amf" {
			fallback := s.config
			fallback.CaptureMode = "copy"
			fallback.Adapter = 0
			if s.config.FallbackEncoder == "nvenc" || s.config.FallbackEncoder == "amf" {
				fallback.Encoder = s.config.FallbackEncoder
			}
			_ = s.writer.Send(map[string]any{"type": "status", "status": map[string]any{"capture": "DXGI → CPU scaling → " + fallback.Encoder + " (fallback)", "mouseGeometry": streamGeometry(fallback, settings), "message": "AMF capture chưa sẵn sàng; đang dùng DXGI dự phòng."}})
			return VideoRTPStream(ctx, fallback, settings, track, &s.rtpBridge, metrics)
		}
		return err
	}
	return VideoStream(ctx, s.config, settings, s.video.(*webrtc.TrackLocalStaticSample))
}
