//go:build windows && amd64

package main

import (
	"context"
	"fmt"
	"github.com/pion/rtp"
	"github.com/pion/webrtc/v4"
	"io"
	"log"
	"net"
	"time"
)

func videoRTPCommand(config Config, settings StreamSettings, port int) []string {
	args := videoCommand(config, settings)
	// Replace only the elementary-stream muxer. Encoder/capture settings stay identical.
	args = args[:len(args)-3]
	// DXGI timestamps can begin after encoder initialization. CFR would fill
	// that gap with duplicate frames and queue stale pictures. Forward capture
	// timestamps at RTP's 90 kHz precision instead of manufacturing target FPS.
	var realtime []string
	for i := 0; i < len(args); i++ {
		if args[i] == "-r" || args[i] == "-fps_mode" {
			i++
			continue
		}
		realtime = append(realtime, args[i])
	}
	args = append(realtime, "-enc_time_base", "1:90000", "-fps_mode", "passthrough")
	return append(args, "-payload_type", "96", "-f", "rtp", fmt.Sprintf("rtp://127.0.0.1:%d?pkt_size=1200", port))
}

func VideoRTPStream(ctx context.Context, config Config, settings StreamSettings, track *webrtc.TrackLocalStaticRTP, bridge *rtpBridge, metrics chan<- float64) error {
	socket, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		return err
	}
	defer socket.Close()
	// Local encoder socket only; never buffers multiple whole frames in userspace.
	_ = socket.SetReadBuffer(1024 * 1024)
	args := videoRTPCommand(config, settings, socket.LocalAddr().(*net.UDPAddr).Port)
	commandContext := ctx
	if config.CaptureMode == "amf" {
		commandContext = context.Background()
		filtered := args[:0]
		for _, arg := range args {
			if arg != "-nostdin" {
				filtered = append(filtered, arg)
			}
		}
		args = filtered
	}
	command := hiddenCommand(commandContext, config.FFmpeg, args...)
	var control io.WriteCloser
	if config.CaptureMode == "amf" {
		control, err = command.StdinPipe()
		if err != nil {
			return err
		}
	}
	var stderr tailWriter
	command.Stderr = &stderr
	if err = command.Start(); err != nil {
		return err
	}
	log.Print("H264 pipeline: encoder RTP -> WebRTC immediately, no Annex-B next-frame wait")
	done := make(chan error, 1)
	go func() { done <- command.Wait(); close(done) }()
	defer func() {
		if control != nil {
			_, _ = io.WriteString(control, "q\n")
			_ = control.Close()
			select {
			case <-done:
				return
			case <-time.After(2 * time.Second):
			}
		}
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		<-done
	}()
	_, _, fps := settings.Dimensions()
	forward := bridge.stream(fps, track.WriteRTP)
	bytes := make([]byte, 2048)
	metricStart := time.Now()
	frames := 0
	for {
		if ctx.Err() != nil {
			return nil
		}
		select {
		case exit := <-done:
			return fmt.Errorf("RTP encoder stopped: %v %s", exit, stderr.String())
		default:
		}
		_ = socket.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
		count, _, readErr := socket.ReadFromUDP(bytes)
		if readErr != nil {
			if timeout, ok := readErr.(net.Error); ok && timeout.Timeout() {
				continue
			}
			return readErr
		}
		if ctx.Err() != nil {
			return nil
		}
		var packet rtp.Packet
		if err = packet.Unmarshal(bytes[:count]); err != nil {
			return fmt.Errorf("invalid encoder RTP: %w", err)
		}
		if packet.Marker {
			frames++
		}
		if elapsed := time.Since(metricStart); elapsed >= time.Second {
			select {
			case metrics <- float64(frames) / elapsed.Seconds():
			default:
			}
			frames, metricStart = 0, time.Now()
		}
		if err = forward(&packet); err != nil {
			return err
		}
	}
}
