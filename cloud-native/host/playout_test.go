package main

import (
	"bytes"
	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"testing"
)

func TestPlayoutDelayOnlyUsesNegotiatedVideoExtension(t *testing.T) {
	for _, tc := range []struct {
		mime  string
		id    int
		delay int
		want  []byte
	}{
		{"video/H264", 7, 0, []byte{0, 0, 0}},
		{"video/H264", 7, 30, []byte{0, 0, 3}},
		{"video/H264", 0, 0, nil},
		{"audio/opus", 7, 0, nil},
	} {
		t.Run(tc.mime+string(rune('0'+tc.id))+string(rune('0'+tc.delay)), func(t *testing.T) {
			var got []byte
			sink := interceptor.RTPWriterFunc(func(h *rtp.Header, p []byte, a interceptor.Attributes) (int, error) {
				got = append([]byte(nil), h.GetExtension(7)...)
				return len(p), nil
			})
			pi := &playoutInterceptor{milliseconds: tc.delay}
			info := &interceptor.StreamInfo{MimeType: tc.mime}
			if tc.id != 0 {
				info.RTPHeaderExtensions = []interceptor.RTPHeaderExtension{{URI: playoutDelayURI, ID: tc.id}}
			}
			writer := pi.BindLocalStream(info, sink)
			original := &rtp.Header{Version: 2, SSRC: 123}
			if _, err := writer.Write(original, []byte{1}, nil); err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, tc.want) {
				t.Fatalf("got %v want %v", got, tc.want)
			}
			if original.Extension {
				t.Fatal("interceptor mutated caller header")
			}
		})
	}
}
