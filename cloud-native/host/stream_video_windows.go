//go:build windows && amd64

package main

import (
	"context"
	"github.com/pion/webrtc/v4"
)

func (s *Session) streamVideo(ctx context.Context, settings StreamSettings) error {
	if track, ok := s.video.(*webrtc.TrackLocalStaticRTP); ok {
		return VideoRTPStream(ctx, s.config, settings, track, &s.rtpBridge)
	}
	return VideoStream(ctx, s.config, settings, s.video.(*webrtc.TrackLocalStaticSample))
}
