//go:build windows && amd64

package main

import (
	"golang.org/x/sys/windows"
	"log"
	"runtime"
)

// A streaming session needs a live desktop surface even without local input.
// This request lasts only for this session; it does not change the power plan,
// prevent screen locking, or override an explicit sleep/lid-close action.
func keepDisplayForStream() func() {
	runtime.LockOSThread()
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("SetThreadExecutionState")
	previous, _, err := proc.Call(0x80000003)
	if previous == 0 {
		log.Printf("Display power request unavailable: %v", err)
	}
	return func() {
		if previous != 0 {
			_, _, _ = proc.Call(previous | 0x80000000)
		}
		runtime.UnlockOSThread()
	}
}
