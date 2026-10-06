//go:build windows && amd64

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/ivfreader"
	"io"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

type StreamSettings struct {
	PlayoutDelay int    `json:"playoutDelay,omitempty"`
	Bitrate      int    `json:"bitrate"`
	FPS          int    `json:"fps,omitempty"`
	Preset       string `json:"preset"`
	Codec        string `json:"codec"`
}

func (s StreamSettings) Dimensions() (int, int, int) {
	fps := s.FPS
	if fps == 0 {
		if s.Preset == "1080p120" || s.Preset == "720p120" {
			fps = 120
		} else {
			fps = 60
		}
	}
	switch s.Preset {
	case "720p120":
		return 1280, 720, fps
	case "2k60":
		return 2560, 1440, fps
	case "4k60":
		return 3840, 2160, fps
	default:
		return 1920, 1080, fps
	}
}
func (s StreamSettings) Validate() error {
	if s.PlayoutDelay != 0 && s.PlayoutDelay != 30 {
		return fmt.Errorf("invalid playout delay")
	}
	if s.FPS != 0 && s.FPS != 60 && s.FPS != 120 && s.FPS != 144 && s.FPS != 160 {
		return fmt.Errorf("FPS must be 60, 120, 144 or 160")
	}
	if s.Bitrate < 5 || s.Bitrate > 100 {
		return fmt.Errorf("bitrate must be 5..100 Mbps")
	}
	if s.Preset != "720p120" && s.Preset != "1080p120" && s.Preset != "2k60" && s.Preset != "4k60" {
		return fmt.Errorf("invalid resolution/FPS preset")
	}
	if s.Codec != "h264" && s.Codec != "av1" && s.Codec != "hevc" {
		return fmt.Errorf("invalid codec")
	}
	return nil
}
func hiddenCommand(ctx context.Context, file string, args ...string) *exec.Cmd {
	c := exec.CommandContext(ctx, file, args...)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return c
}
func videoCommand(config Config, s StreamSettings) []string {
	w, h, fps := s.Dimensions()
	bitrate := s.Bitrate * 1000000
	args := []string{"-hide_banner", "-loglevel", "error", "-nostdin", "-filter_threads", "4"}
	if config.CaptureMode == "gpu" {
		args = append(args, "-init_hw_device", fmt.Sprintf("d3d11va=display:%d", config.Adapter), "-filter_hw_device", "display")
	}
	// DXGI pointer metadata is not composited into the encoder surface.
	args = append(args, "-f", "lavfi", "-i", fmt.Sprintf("ddagrab=output_idx=%d:framerate=%d:draw_mouse=0", config.Output, fps))
	if config.CaptureMode == "gpu" {
		args = append(args, "-vf", fmt.Sprintf("scale_d3d11=width=%d:height=%d:format=nv12", w, h))
	} else {
		args = append(args, "-vf", fmt.Sprintf("hwdownload,format=bgra,scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,format=yuv420p", w, h, w, h))
	}
	codec := map[string]string{"h264": "h264", "hevc": "hevc", "av1": "av1"}[s.Codec] + "_" + config.Encoder
	args = append(args, "-an", "-c:v", codec)
	if config.Encoder == "nvenc" {
		args = append(args, "-preset", "p1", "-tune", "ull", "-rc", "cbr", "-zerolatency", "1", "-rc-lookahead", "0", "-delay", "0")
	} else {
		args = append(args, "-usage", "ultralowlatency", "-quality", "speed", "-rc", "cbr")
	}
	args = append(args, "-b:v", fmt.Sprint(bitrate), "-maxrate", fmt.Sprint(bitrate), "-bufsize", fmt.Sprint(bitrate/fps), "-bf", "0", "-g", fmt.Sprint(fps/2), "-r", fmt.Sprint(fps), "-fps_mode", "cfr", "-flush_packets", "1")
	// Without global_header, NVENC emits SPS/PPS (VPS for HEVC) on IDRs.
	if s.Codec == "h264" {
		args = append(args, "-profile:v", "baseline", "-aud", "1", "-f", "h264")
	} else if s.Codec == "hevc" {
		args = append(args, "-aud", "1", "-f", "hevc")
	} else {
		args = append(args, "-f", "ivf")
	}
	return append(args, "pipe:1")
}

type tailWriter struct {
	mu sync.Mutex
	b  []byte
}

func (w *tailWriter) Write(b []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.b = append(w.b, b...)
	if len(w.b) > 4096 {
		w.b = w.b[len(w.b)-4096:]
	}
	return len(b), nil
}
func (w *tailWriter) String() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return strings.TrimSpace(string(w.b))
}
func VideoStream(ctx context.Context, config Config, s StreamSettings, track *webrtc.TrackLocalStaticSample) error {
	cmd := hiddenCommand(ctx, config.FFmpeg, videoCommand(config, s)...)
	pipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	var stderr tailWriter
	cmd.Stderr = &stderr
	if err = cmd.Start(); err != nil {
		return err
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
		_ = cmd.Wait()
	}()
	_, _, fps := s.Dimensions()
	duration := time.Second / time.Duration(fps)
	if s.Codec == "av1" {
		reader, _, err := ivfreader.NewWith(pipe)
		if err != nil {
			return fmt.Errorf("AV1 stream: %v %s", err, stderr.String())
		}
		for {
			frame, _, err := reader.ParseNextFrame()
			if err != nil {
				if ctx.Err() != nil {
					return nil
				}
				return fmt.Errorf("AV1 capture: %v %s", err, stderr.String())
			}
			if err = track.WriteSample(media.Sample{Data: frame, Duration: duration}); err != nil {
				return err
			}
		}
	}
	scan := bufio.NewScanner(pipe)
	scan.Buffer(make([]byte, 65536), 32*1024*1024)
	scan.Split(splitAnnexB)
	var accessUnit []byte
	for scan.Scan() {
		nal := scan.Bytes()
		if len(nal) == 0 {
			continue
		}
		aud := nal[0]&31 == 9
		if s.Codec == "hevc" {
			aud = (nal[0]>>1)&63 == 35
		}
		if aud && len(accessUnit) > 0 {
			if err = track.WriteSample(media.Sample{Data: accessUnit, Duration: duration}); err != nil {
				return err
			}
			accessUnit = nil
		}
		accessUnit = append(accessUnit, 0, 0, 0, 1)
		accessUnit = append(accessUnit, nal...)
		if len(accessUnit) > 32*1024*1024 {
			return fmt.Errorf("oversized encoded frame")
		}
	}
	if ctx.Err() != nil {
		return nil
	}
	return fmt.Errorf("capture/encoder stopped: %v %s", scan.Err(), stderr.String())
}
func startCode(b []byte, offset int) (int, int) {
	for i := offset; i+2 < len(b); i++ {
		if b[i] == 0 && b[i+1] == 0 {
			if b[i+2] == 1 {
				return i, 3
			}
			if i+3 < len(b) && b[i+2] == 0 && b[i+3] == 1 {
				return i, 4
			}
		}
	}
	return -1, 0
}
func splitAnnexB(data []byte, atEOF bool) (int, []byte, error) {
	start, size := startCode(data, 0)
	if start < 0 {
		if atEOF {
			return len(data), nil, nil
		}
		return 0, nil, nil
	}
	next, _ := startCode(data, start+size)
	if next >= 0 {
		return next, data[start+size : next], nil
	}
	if atEOF {
		return len(data), data[start+size:], nil
	}
	return 0, nil, nil
}

// Ogg lacing is parsed explicitly: a page may contain several Opus packets.
func readOggPackets(r io.Reader, consume func([]byte) error) error {
	var packet []byte
	for {
		header := make([]byte, 27)
		if _, err := io.ReadFull(r, header); err != nil {
			return err
		}
		if !bytes.Equal(header[:4], []byte("OggS")) || header[4] != 0 {
			return fmt.Errorf("invalid Ogg page")
		}
		lacing := make([]byte, int(header[26]))
		if _, err := io.ReadFull(r, lacing); err != nil {
			return err
		}
		for _, length := range lacing {
			segment := make([]byte, int(length))
			if _, err := io.ReadFull(r, segment); err != nil {
				return err
			}
			packet = append(packet, segment...)
			if len(packet) > 65536 {
				return fmt.Errorf("oversized Opus packet")
			}
			if length < 255 {
				if !bytes.HasPrefix(packet, []byte("OpusHead")) && !bytes.HasPrefix(packet, []byte("OpusTags")) {
					if err := consume(packet); err != nil {
						return err
					}
				}
				packet = nil
			}
		}
	}
}
func AudioStream(ctx context.Context, config Config, track *webrtc.TrackLocalStaticSample) error {
	var command *exec.Cmd
	var stderr tailWriter
	var receiveDone chan error
	err := CaptureLoopback(ctx, config.AudioEndpoint, func(format AudioFormat) (io.WriteCloser, error) {
		command = hiddenCommand(ctx, config.FFmpeg, "-hide_banner", "-loglevel", "error", "-nostdin", "-f", format.SampleFormat, "-ar", fmt.Sprint(format.Rate), "-ac", fmt.Sprint(format.Channels), "-i", "pipe:0", "-ar", "48000", "-ac", "2", "-c:a", "libopus", "-b:a", "128k", "-application", "lowdelay", "-frame_duration", "10", "-page_duration", "10000", "-flush_packets", "1", "-f", "opus", "pipe:1")
		input, err := command.StdinPipe()
		if err != nil {
			return nil, err
		}
		output, err := command.StdoutPipe()
		if err != nil {
			input.Close()
			return nil, err
		}
		command.Stderr = &stderr
		if err = command.Start(); err != nil {
			input.Close()
			return nil, err
		}
		receiveDone = make(chan error, 1)
		go func() {
			receiveDone <- readOggPackets(output, func(packet []byte) error {
				return track.WriteSample(media.Sample{Data: append([]byte(nil), packet...), Duration: 10 * time.Millisecond})
			})
		}()
		return input, nil
	})
	if command != nil {
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		_ = command.Wait()
		if receiveDone != nil {
			select {
			case packetErr := <-receiveDone:
				if err == nil && ctx.Err() == nil {
					err = packetErr
				}
			case <-time.After(time.Second):
			}
		}
	}
	if ctx.Err() != nil {
		return nil
	}
	if err != nil {
		return fmt.Errorf("WASAPI/Opus: %v %s", err, stderr.String())
	}
	return nil
}
func availableCodecs(config Config) []string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := hiddenCommand(ctx, config.FFmpeg, "-hide_banner", "-encoders").Output()
	if err != nil {
		return nil
	}
	var result []string
	for _, codec := range []string{"h264", "av1", "hevc"} {
		if bytes.Contains(out, []byte(codec+"_"+config.Encoder)) {
			result = append(result, codec)
		}
	}
	return result
}
func oggGranule(header []byte) uint64 { return binary.LittleEndian.Uint64(header[6:14]) }
