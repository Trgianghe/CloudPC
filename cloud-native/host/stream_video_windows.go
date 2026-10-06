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
	if track, ok := s.video.(*webrtc.TrackLocalStaticRTP); ok {
		return VideoRTPStream(ctx, s.config, settings, track, &s.rtpBridge)
	}
	return VideoStream(ctx, s.config, settings, s.video.(*webrtc.TrackLocalStaticSample))
}
