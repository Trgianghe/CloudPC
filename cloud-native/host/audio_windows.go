//go:build windows && amd64

package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"golang.org/x/sys/windows"
	"io"
	"runtime"
	"syscall"
	"time"
	"unsafe"
)

var ole32 = windows.NewLazySystemDLL("ole32.dll")
var coInit, coUninit, coCreate, coFree = ole32.NewProc("CoInitializeEx"), ole32.NewProc("CoUninitialize"), ole32.NewProc("CoCreateInstance"), ole32.NewProc("CoTaskMemFree")

func guid(s string) windows.GUID {
	g, e := windows.GUIDFromString(s)
	if e != nil {
		panic(e)
	}
	return g
}

var clsidEnumerator = guid("{BCDE0395-E52F-467C-8E3D-C4579291692E}")
var iidEnumerator = guid("{A95664D2-9614-4F35-A746-DE8DB63617E6}")
var iidAudioClient = guid("{1CB9AD4C-DBFA-4C32-B178-C2F568A703B2}")
var iidCaptureClient = guid("{C8ADBD64-E71E-48A0-A4DE-185C395CD317}")

func comCall(object uintptr, slot int, args ...uintptr) (uintptr, error) {
	table := *(*uintptr)(unsafe.Pointer(object))
	proc := *(*uintptr)(unsafe.Pointer(table + uintptr(slot)*unsafe.Sizeof(uintptr(0))))
	all := append([]uintptr{object}, args...)
	result, _, _ := syscall.SyscallN(proc, all...)
	if int32(result) < 0 {
		return result, fmt.Errorf("COM HRESULT 0x%08x at method %d", uint32(result), slot)
	}
	return result, nil
}
func comRelease(object uintptr) {
	if object != 0 {
		_, _ = comCall(object, 2)
	}
}

type AudioFormat struct {
	Rate, Channels, Bits, BlockAlign int
	SampleFormat                     string
}

// CaptureLoopback runs COM on one OS thread, capturing the render endpoint's mix.
// The format callback creates the Opus pipeline before samples are written.
func CaptureLoopback(ctx context.Context, endpoint string, format func(AudioFormat) (io.WriteCloser, error)) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	hr, _, _ := coInit.Call(0, 0)
	if int32(hr) < 0 {
		return fmt.Errorf("CoInitializeEx 0x%x", hr)
	}
	defer coUninit.Call()
	var enumerator, device, client, capture uintptr
	hr, _, _ = coCreate.Call(uintptr(unsafe.Pointer(&clsidEnumerator)), 0, 23, uintptr(unsafe.Pointer(&iidEnumerator)), uintptr(unsafe.Pointer(&enumerator)))
	if int32(hr) < 0 {
		return fmt.Errorf("MMDeviceEnumerator 0x%x", hr)
	}
	defer comRelease(enumerator)
	if endpoint == "" {
		_, err := comCall(enumerator, 4, 0, 1, uintptr(unsafe.Pointer(&device)))
		if err != nil {
			return err
		}
	} else {
		name, err := windows.UTF16PtrFromString(endpoint)
		if err != nil {
			return err
		}
		if _, err = comCall(enumerator, 5, uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&device))); err != nil {
			return err
		}
	}
	defer comRelease(device)
	if _, err := comCall(device, 3, uintptr(unsafe.Pointer(&iidAudioClient)), 23, 0, uintptr(unsafe.Pointer(&client))); err != nil {
		return err
	}
	defer comRelease(client)
	var mix uintptr
	if _, err := comCall(client, 8, uintptr(unsafe.Pointer(&mix))); err != nil {
		return err
	}
	defer coFree.Call(mix)
	bytes := unsafe.Slice((*byte)(unsafe.Pointer(mix)), 18)
	tag := binary.LittleEndian.Uint16(bytes)
	channels := int(binary.LittleEndian.Uint16(bytes[2:]))
	rate := int(binary.LittleEndian.Uint32(bytes[4:]))
	block := int(binary.LittleEndian.Uint16(bytes[12:]))
	bits := int(binary.LittleEndian.Uint16(bytes[14:]))
	if tag == 0xfffe {
		extra := int(binary.LittleEndian.Uint16(bytes[16:]))
		if extra < 22 {
			return fmt.Errorf("invalid extensible mix format")
		}
		full := unsafe.Slice((*byte)(unsafe.Pointer(mix)), 18+extra)
		tag = uint16(binary.LittleEndian.Uint32(full[24:]))
	}
	sample := ""
	if tag == 3 && bits == 32 {
		sample = "f32le"
	} else if tag == 1 {
		sample = map[int]string{8: "u8", 16: "s16le", 24: "s24le", 32: "s32le"}[bits]
	}
	if sample == "" || channels < 1 || channels > 8 || rate < 8000 || rate > 192000 {
		return fmt.Errorf("unsupported endpoint mix: format=%d bits=%d channels=%d rate=%d", tag, bits, channels, rate)
	}
	// AUDCLNT_STREAMFLAGS_LOOPBACK, shared mode, 10 ms requested buffer.
	if _, err := comCall(client, 3, 0, 0x20000, 100000, 0, mix, 0); err != nil {
		return err
	}
	if _, err := comCall(client, 14, uintptr(unsafe.Pointer(&iidCaptureClient)), uintptr(unsafe.Pointer(&capture))); err != nil {
		return err
	}
	defer comRelease(capture)
	writer, err := format(AudioFormat{rate, channels, bits, block, sample})
	if err != nil {
		return err
	}
	defer writer.Close()
	if _, err = comCall(client, 10); err != nil {
		return err
	}
	defer comCall(client, 11)
	tick := time.NewTicker(3 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-tick.C:
			for {
				var count uint32
				if _, err = comCall(capture, 5, uintptr(unsafe.Pointer(&count))); err != nil {
					return err
				}
				if count == 0 {
					break
				}
				var data uintptr
				var frames, flags uint32
				var devicePos, qpc uint64
				_, err = comCall(capture, 3, uintptr(unsafe.Pointer(&data)), uintptr(unsafe.Pointer(&frames)), uintptr(unsafe.Pointer(&flags)), uintptr(unsafe.Pointer(&devicePos)), uintptr(unsafe.Pointer(&qpc)))
				if err != nil {
					return err
				}
				size := int(frames) * block
				var pcm []byte
				if flags&2 != 0 {
					pcm = make([]byte, size)
					if sample == "u8" {
						for i := range pcm {
							pcm[i] = 128
						}
					}
				} else {
					pcm = append([]byte(nil), unsafe.Slice((*byte)(unsafe.Pointer(data)), size)...)
				}
				_, releaseErr := comCall(capture, 4, uintptr(frames))
				if releaseErr != nil {
					return releaseErr
				}
				if _, err = writer.Write(pcm); err != nil {
					return err
				}
			}
		}
	}
}
