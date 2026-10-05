//go:build windows && amd64

package main

import "testing"

func TestFPSPresetAndEncoderQueue(t *testing.T) {
 s := StreamSettings{Bitrate:15,FPS:120,Preset:"720p120",Codec:"h264"}
 if err:=s.Validate();err!=nil {t.Fatal(err)}
 w,h,fps:=s.Dimensions();if w!=1280||h!=720||fps!=120 {t.Fatalf("unexpected FPS preset %d %d %d",w,h,fps)}
 args:=videoCommand(Config{Encoder:"nvenc",CaptureMode:"copy"},s)
 option:=func(key string)string {for i:=0;i+1<len(args);i++ {if args[i]==key{return args[i+1]}};return "missing"}
 for key,want:=range map[string]string{"-delay":"0","-bf":"0","-rc-lookahead":"0","-bufsize":"125000"} {if got:=option(key);got!=want {t.Errorf("%s: got %s want %s",key,got,want)}}
}
