package main

import (
	"github.com/pion/interceptor"
	"github.com/pion/rtp"
	"log"
	"strings"
)

const playoutDelayURI = "http://www.webrtc.org/experiments/rtp-hdrext/playout-delay"

type playoutFactory struct{ milliseconds int }

func (f *playoutFactory) NewInterceptor(string) (interceptor.Interceptor, error) {
	return &playoutInterceptor{milliseconds: f.milliseconds}, nil
}

type playoutInterceptor struct {
	interceptor.NoOp
	milliseconds int
}

func (p *playoutInterceptor) BindLocalStream(info *interceptor.StreamInfo, writer interceptor.RTPWriter) interceptor.RTPWriter {
	if !strings.HasPrefix(strings.ToLower(info.MimeType), "video/") {
		return writer
	}
	var id uint8
	for _, ext := range info.RTPHeaderExtensions {
		if ext.URI == playoutDelayURI && ext.ID > 0 && ext.ID < 256 {
			id = uint8(ext.ID)
		}
	}
	if id == 0 {
		log.Print("Browser did not negotiate RTP playout-delay; using receiver hint only")
		return writer
	}
	log.Printf("RTP playout-delay negotiated: 0..%d ms", p.milliseconds)
	// Both bounds are 12-bit integers in units of 10ms. Supported maxima are 0/30ms.
	delay := []byte{0, 0, byte(p.milliseconds / 10)}
	return interceptor.RTPWriterFunc(func(header *rtp.Header, payload []byte, attributes interceptor.Attributes) (int, error) {
		copyHeader := header.Clone()
		if err := copyHeader.SetExtension(id, delay); err != nil {
			return 0, err
		}
		return writer.Write(&copyHeader, payload, attributes)
	})
}
