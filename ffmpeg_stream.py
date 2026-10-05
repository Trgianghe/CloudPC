"""Optional native capture/encode path; Python only packetizes H.264 for WebRTC."""
import asyncio
import fractions
import queue
import shutil
import subprocess
import threading
import time
import av
import mss
from aiortc import VideoStreamTrack
from aiortc.mediastreams import MediaStreamError
from aiortc.codecs.h264 import H264Encoder


class NativeDesktopTrack(VideoStreamTrack):
    def __init__(self, fps, width, bitrate, monitor, output, executable=None):
        super().__init__()
        self.executable=executable or shutil.which('ffmpeg')
        if not self.executable:raise RuntimeError('FFmpeg unavailable')
        with mss.MSS() as screen:self.monitor=screen.monitors[monitor]
        self.width=min(width,self.monitor['width'])//2*2
        self.height=int(self.monitor['height']*self.width/self.monitor['width'])//2*2
        self.fps,self.bitrate,self.output=fps,bitrate,output
        self.capture=self
        self.name='FFmpeg DXGI'
        self.ready=threading.Event()
        self.closed=threading.Event()
        self.error=None
        self.process=None
        self.packets=queue.Queue(maxsize=3)
        self.started=time.monotonic()
        self.pending_rate=bitrate
        self.last_restart=self.started
        threading.Thread(target=self._run,daemon=True,name='native-h264').start()

    def command(self):
        return [self.executable,'-hide_banner','-loglevel','error','-nostdin',
            '-filter_threads','4','-f','lavfi','-i',f'ddagrab=framerate={self.fps}:output_idx={self.output}:draw_mouse=0',
            '-vf',f'hwdownload,format=bgra,scale={self.width}:{self.height}:flags=bilinear,format=yuv420p',
            '-an','-c:v','h264_nvenc','-preset','p1','-tune','ull','-profile:v','baseline',
            '-rc','cbr','-b:v',str(self.bitrate),'-maxrate',str(self.bitrate),'-bufsize',str(max(100000,self.bitrate//self.fps*2)),
            '-bf','0','-g',str(max(15,self.fps//2)),'-zerolatency','1','-rc-lookahead','0',
            '-r',str(self.fps),'-fps_mode','cfr','-flush_packets','1','-f','h264','pipe:1']

    def _run(self):
        try:
            while not self.closed.is_set():
                self.process=subprocess.Popen(self.command(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,
                    bufsize=0,creationflags=subprocess.CREATE_NO_WINDOW)
                parser=av.CodecContext.create('h264','r')
                restart=False
                need_keyframe=False
                while not self.closed.is_set():
                    data=self.process.stdout.read(16384)
                    if not data:break
                    for packet in parser.parse(data):
                        keyframe=any((nal[0]&31)==5 for nal in H264Encoder._split_bitstream(bytes(packet)) if nal)
                        if need_keyframe and not keyframe:continue
                        need_keyframe=False
                        packet.pts=int((time.monotonic()-self.started)*90000)
                        packet.time_base=fractions.Fraction(1,90000)
                        self.ready.set()
                        try:self.packets.put_nowait(packet)
                        except queue.Full:
                            # Never queue old frames. Resume on IDR so discarded reference frames
                            # cannot corrupt subsequent decoding.
                            while True:
                                try:self.packets.get_nowait()
                                except queue.Empty:break
                            need_keyframe=not keyframe
                            if keyframe:self.packets.put_nowait(packet)
                    if abs(self.pending_rate-self.bitrate)/self.bitrate>.3 and time.monotonic()-self.last_restart>4:
                        self.bitrate=self.pending_rate
                        self.last_restart=time.monotonic()
                        restart=True
                        break
                self.process.terminate() if self.process.poll() is None else None
                self.process.wait(timeout=3)
                self.process.stdout.close()
                while True:
                    try:self.packets.get_nowait()
                    except queue.Empty:break
                if not restart and not self.closed.is_set():raise RuntimeError('FFmpeg capture exited')
        except Exception as error:
            if not self.closed.is_set():self.error=error
        finally:
            if self.process:
                try:
                    if self.process.poll() is None:self.process.terminate()
                    self.process.wait(timeout=3)
                except (OSError,subprocess.TimeoutExpired):
                    self.process.kill()
                if self.process.stdout:self.process.stdout.close()
            self.ready.set()

    def next_packet(self):
        while not self.closed.is_set():
            if self.error:raise self.error
            try:return self.packets.get(timeout=.1)
            except queue.Empty:pass
        raise MediaStreamError

    async def recv(self):
        return await asyncio.to_thread(self.next_packet)

    def stop(self):
        super().stop()
        self.closed.set()
        if self.process and self.process.poll() is None:
            try:self.process.terminate()
            except OSError:pass


class NativePacketEncoder(H264Encoder):
    def __init__(self,track):
        super().__init__()
        self.track=track
        self.name='NVENC native'
        self.limit=track.bitrate

    @property
    def target_bitrate(self):return self.track.bitrate

    @target_bitrate.setter
    def target_bitrate(self,value):
        # REMB reduces rate on slower networks. Restart with a fresh IDR, at most once / 4 s.
        if hasattr(self,'track'):self.track.pending_rate=max(2000000,min(int(value),self.limit))
