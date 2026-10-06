//go:build windows && amd64

package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"github.com/gorilla/websocket"
	"github.com/pion/interceptor"
	"github.com/pion/webrtc/v4"
	"io"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"time"
)

type Config struct {
	Signaling     string `json:"signaling"`
	Room          string `json:"room"`
	HostToken     string `json:"host_token"`
	FFmpeg        string `json:"ffmpeg"`
	Encoder       string `json:"encoder"`
	CaptureMode   string `json:"capture_mode"`
	Adapter       int    `json:"adapter"`
	Output        int    `json:"output"`
	AudioEndpoint string `json:"audio_endpoint"`
	Audio         bool   `json:"audio"`
	ViGEmDLL      string `json:"vigem_dll"`
	AllowReboot   bool   `json:"allow_reboot"`
	ViewOnly      bool   `json:"view_only"`
}
type Message struct {
	Type       string                   `json:"type"`
	SDP        string                   `json:"sdp"`
	SelfHost   bool                     `json:"selfHost"`
	LocalInput bool                     `json:"localInput"`
	Candidate  *webrtc.ICECandidateInit `json:"candidate"`
	Settings   StreamSettings           `json:"settings"`
	Action     string                   `json:"action"`
	Confirmed  bool                     `json:"confirmed"`
	ICEServers []webrtc.ICEServer       `json:"iceServers"`
}
type SignalWriter struct {
	socket *websocket.Conn
	mu     sync.Mutex
}

func (w *SignalWriter) Send(v any) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	_ = w.socket.SetWriteDeadline(time.Now().Add(5 * time.Second))
	return w.socket.WriteJSON(v)
}
func (w *SignalWriter) Error(err error) {
	log.Print(err)
	_ = w.Send(map[string]any{"type": "error", "message": err.Error()})
}

type Session struct {
	mu             sync.Mutex
	videoMu        sync.Mutex
	pc             *webrtc.PeerConnection
	input          *InputState
	ctx            context.Context
	cancel         context.CancelFunc
	videoCancel    context.CancelFunc
	video          webrtc.TrackLocal
	rtpBridge      rtpBridge
	audio          *webrtc.TrackLocalStaticSample
	settings       StreamSettings
	config         Config
	writer         *SignalWriter
	connected      bool
	closeOnce      sync.Once
	lastVideoStart time.Time
}

func (s *Session) Close() { s.closeOnce.Do(func() { s.cancel(); s.input.Release(); _ = s.pc.Close() }) }
func (s *Session) RestartVideo(settings StreamSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if settings.Codec != s.settings.Codec {
		return fmt.Errorf("codec change needs a new SDP offer")
	}
	if s.connected && s.videoCancel != nil && settings == s.settings {
		return nil
	}
	s.settings = settings
	if !s.connected {
		return nil
	}
	if s.videoCancel != nil {
		s.videoCancel()
	}
	ctx, cancel := context.WithCancel(s.ctx)
	s.videoCancel = cancel
	s.lastVideoStart = time.Now()
	capture := "DXGI → GPU texture → " + s.config.Encoder + " (no CPU frame download)"
	if s.config.CaptureMode == "copy" {
		capture = "DXGI → CPU scaling → " + s.config.Encoder + " (copy mode)"
	}
	_ = s.writer.Send(map[string]any{"type": "status", "status": map[string]any{"capture": capture, "mouseGeometry": streamGeometry(s.config, settings), "message": fmt.Sprintf("%s · %s · %d Mbps", settings.Preset, settings.Codec, settings.Bitrate)}})
	go func() {
		if err := s.streamVideo(ctx, settings); err != nil && ctx.Err() == nil {
			s.writer.Error(err)
			s.Close()
		}
	}()
	return nil
}
func newSession(config Config, writer *SignalWriter, offer Message, ice []webrtc.ICEServer, sink InputSink) (*Session, error) {
	if err := offer.Settings.Validate(); err != nil {
		return nil, err
	}
	// Pion 4.1.6 defaults include H.264, AV1 and H.265. The offer negotiates one.
	engine := &webrtc.MediaEngine{}
	if err := engine.RegisterDefaultCodecs(); err != nil {
		return nil, err
	}
	if err := engine.RegisterHeaderExtension(webrtc.RTPHeaderExtensionCapability{URI: playoutDelayURI}, webrtc.RTPCodecTypeVideo); err != nil {
		return nil, err
	}
	registry := &interceptor.Registry{}
	registry.Add(&playoutFactory{milliseconds: offer.Settings.PlayoutDelay})
	if err := webrtc.RegisterDefaultInterceptors(engine, registry); err != nil {
		return nil, err
	}
	api := webrtc.NewAPI(webrtc.WithMediaEngine(engine), webrtc.WithInterceptorRegistry(registry))
	pc, err := api.NewPeerConnection(webrtc.Configuration{ICEServers: ice})
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{pc: pc, ctx: ctx, cancel: cancel, input: NewInput(sink, (offer.SelfHost && !offer.LocalInput) || config.ViewOnly), settings: offer.Settings, config: config, writer: writer}
	fail := func(err error) (*Session, error) { s.Close(); return nil, err }
	mime := map[string]string{"h264": webrtc.MimeTypeH264, "av1": webrtc.MimeTypeAV1, "hevc": "video/H265"}[offer.Settings.Codec]
	capability := webrtc.RTPCodecCapability{MimeType: mime, ClockRate: 90000}
	if offer.Settings.Codec == "h264" {
		capability.SDPFmtpLine = "level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f"
	}
	if offer.Settings.Codec == "h264" {
		s.video, err = webrtc.NewTrackLocalStaticRTP(capability, "desktop", "pccloud")
	} else {
		s.video, err = webrtc.NewTrackLocalStaticSample(capability, "desktop", "pccloud")
	}
	if err != nil {
		return fail(err)
	}
	videoSender, err := pc.AddTrack(s.video)
	if err != nil {
		return fail(err)
	}
	// Drain feedback so NACK retransmission remains active. The encoder sends
	// an IDR every half-second; restarting it on PLI can prevent first-frame
	// delivery entirely when startup takes longer than the feedback interval.
	go func() {
		for {
			if _, _, err := videoSender.ReadRTCP(); err != nil {
				return
			}
		}
	}()

	if config.Audio {
		s.audio, err = webrtc.NewTrackLocalStaticSample(webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2, SDPFmtpLine: "minptime=10;useinbandfec=1;stereo=1"}, "loopback", "pccloud")
		if err != nil {
			return fail(err)
		}
		sender, err := pc.AddTrack(s.audio)
		if err != nil {
			return fail(err)
		}
		go func() {
			buf := make([]byte, 1500)
			for {
				if _, _, err := sender.Read(buf); err != nil {
					return
				}
			}
		}()
	}
	pc.OnICECandidate(func(candidate *webrtc.ICECandidate) {
		if candidate != nil {
			_ = writer.Send(map[string]any{"type": "ice", "candidate": candidate.ToJSON()})
		}
	})
	pc.OnDataChannel(func(channel *webrtc.DataChannel) {
		if channel.Label() == "mouse-v2" {
			channel.OnMessage(func(m webrtc.DataChannelMessage) {
				if !m.IsString {
					_ = s.input.ReceiveMouse(m.Data)
				}
			})
			channel.OnClose(s.input.Release)
			return
		}
		if channel.Label() != "input" {
			_ = channel.Close()
			return
		}
		channel.OnMessage(func(message webrtc.DataChannelMessage) {
			if message.IsString {
				return
			}
			if err := s.input.Receive(message.Data); err != nil {
				return
			}
			if len(message.Data) == 9 && message.Data[0] == 7 {
				_ = channel.Send(message.Data)
			}
		})
		channel.OnClose(s.input.Release)
	})
	pc.OnConnectionStateChange(func(state webrtc.PeerConnectionState) {
		switch state {
		case webrtc.PeerConnectionStateConnected:
			s.mu.Lock()
			first := !s.connected
			s.connected = true
			settings := s.settings
			s.mu.Unlock()
			if first {
				_ = s.RestartVideo(settings)
				go s.input.Watchdog(ctx.Done())
				if s.audio != nil {
					go func() {
						if err := AudioStream(ctx, config, s.audio); err != nil && ctx.Err() == nil {
							writer.Error(err)
						}
					}()
				}
			}
		case webrtc.PeerConnectionStateFailed, webrtc.PeerConnectionStateClosed:
			s.cancel()
			s.input.Release()
		case webrtc.PeerConnectionStateDisconnected:
			s.input.Release()
		}
	})
	if err = pc.SetRemoteDescription(webrtc.SessionDescription{Type: webrtc.SDPTypeOffer, SDP: offer.SDP}); err != nil {
		return fail(err)
	}
	answer, err := pc.CreateAnswer(nil)
	if err != nil {
		return fail(err)
	}
	if err = pc.SetLocalDescription(answer); err != nil {
		return fail(err)
	}
	if err = writer.Send(map[string]any{"type": "answer", "sdp": pc.LocalDescription().SDP}); err != nil {
		return fail(err)
	}
	return s, nil
}
func runSignaling(ctx context.Context, config Config, sink *WindowsSink) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	connection, _, err := websocket.DefaultDialer.DialContext(ctx, config.Signaling, nil)
	if err != nil {
		return err
	}
	defer connection.Close()
	connection.SetReadLimit(256 * 1024)
	writer := &SignalWriter{socket: connection}
	if err = writer.Send(map[string]any{"type": "join", "role": "host", "room": config.Room, "token": config.HostToken}); err != nil {
		return err
	}
	var current *Session
	var ice []webrtc.ICEServer
	var pending []webrtc.ICECandidateInit
	defer func() {
		if current != nil {
			current.Close()
		}
	}()
	go func() { <-ctx.Done(); connection.Close() }()
	codecs := availableCodecs(config)
	capabilities := func() {
		_ = writer.Send(map[string]any{"type": "capabilities", "capabilities": map[string]any{"codecs": codecs, "gamepad": sink.gamepad != nil, "allowReboot": config.AllowReboot && !config.ViewOnly, "audio": config.Audio, "captureMode": config.CaptureMode}})
	}
	for {
		var message Message
		if err = connection.ReadJSON(&message); err != nil {
			return err
		}
		switch message.Type {
		case "joined":
			ice = message.ICEServers
		case "client-online":
			capabilities()
		case "offer":
			if current != nil {
				current.Close()
				current = nil
			}
			current, err = newSession(config, writer, message, ice, sink)
			if err != nil {
				writer.Error(err)
				continue
			}
			for _, candidate := range pending {
				_ = current.pc.AddICECandidate(candidate)
			}
			pending = nil
		case "ice":
			if message.Candidate != nil {
				if current == nil {
					pending = append(pending, *message.Candidate)
					if len(pending) > 128 {
						pending = pending[len(pending)-128:]
					}
				} else {
					if err = current.pc.AddICECandidate(*message.Candidate); err != nil {
						writer.Error(err)
					}
				}
			}
		case "settings":
			if current != nil {
				if err = current.RestartVideo(message.Settings); err != nil {
					writer.Error(err)
				}
			}
		case "command":
			if message.Action == "reboot" && message.Confirmed && config.AllowReboot && !config.ViewOnly && current != nil && !current.input.viewOnly {
				current.input.Release()
				command := hiddenCommand(ctx, "shutdown.exe", "/r", "/t", "10", "/c", "PC Cloud: authenticated user requested reboot")
				if err = command.Run(); err != nil {
					writer.Error(err)
				} else {
					_ = writer.Send(map[string]any{"type": "status", "status": map[string]any{"message": "Host sẽ khởi động lại sau 10 giây."}})
				}
			}
		case "peer-left":
			if current != nil {
				current.Close()
				current = nil
			}
			pending = nil
		case "error":
			log.Print("Signaling rejected operation")
		}
	}
}
func main() {
	file := flag.String("config", "host.config.json", "Host config file")
	diagnose := flag.Bool("diagnose", false, "Report capabilities without sending input")
	flag.Parse()
	raw, err := os.ReadFile(*file)
	if err != nil {
		log.Fatal(err)
	}
	var config Config
	if err = json.Unmarshal([]byte(strings.TrimPrefix(string(raw), "\uFEFF")), &config); err != nil {
		log.Fatal(err)
	}
	if config.FFmpeg == "" {
		config.FFmpeg = "ffmpeg.exe"
	}
	if config.Encoder == "" {
		config.Encoder = "nvenc"
	}
	if config.CaptureMode == "" {
		config.CaptureMode = "gpu"
	}
	if config.CaptureMode != "gpu" && config.CaptureMode != "copy" {
		log.Fatal("capture_mode must be gpu or copy")
	}
	if config.Encoder != "nvenc" && config.Encoder != "amf" {
		log.Fatal("encoder must be nvenc or amf")
	}
	captureAdapter := config.Adapter
	if config.CaptureMode == "copy" {
		captureAdapter = 0
	}
	sink := &WindowsSink{captureAdapter: captureAdapter, captureOutput: config.Output}
	if config.ViGEmDLL != "" {
		pad, err := OpenViGEm(config.ViGEmDLL)
		if err != nil {
			log.Print("Gamepad unavailable: ", err)
		} else {
			sink.gamepad = pad
			defer pad.Close()
		}
	}
	if *diagnose {
		fmt.Printf("Mouse capture geometry: %v\n", streamGeometry(config, StreamSettings{Bitrate: 20, Preset: "1080p120", Codec: "h264"}))
		fmt.Printf("Codecs: %v; capture: %s; gamepad: %v\n", availableCodecs(config), config.CaptureMode, sink.gamepad != nil)
		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		if config.Audio {
			err = CaptureLoopback(ctx, config.AudioEndpoint, func(format AudioFormat) (io.WriteCloser, error) {
				fmt.Printf("WASAPI mix: %+v\n", format)
				return discardWriter{}, nil
			})
			if err != nil {
				log.Print(err)
			}
		}
		return
	}
	if len(config.HostToken) < 32 || strings.HasPrefix(config.HostToken, "REPLACE-") {
		log.Fatal("Set the private host token first")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	for ctx.Err() == nil {
		if err = runSignaling(ctx, config, sink); err != nil && ctx.Err() == nil {
			log.Print("Signaling connection closed; retrying in 3 seconds")
		}
		select {
		case <-ctx.Done():
		case <-time.After(3 * time.Second):
		}
	}
}

type discardWriter struct{}

func (discardWriter) Write(b []byte) (int, error) { return len(b), nil }
func (discardWriter) Close() error                { return nil }
