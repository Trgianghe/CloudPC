"""Low latency H.264 encoder and latest-frame Windows capture.

The aiortc sender adapter in server.py is pinned to aiortc 1.15.0.
"""
import fractions
import logging
import threading
import time
import av
import mss
import numpy as np
from aiortc.codecs.h264 import H264Encoder

log = logging.getLogger(__name__)


def make_codec(name, width, height, fps, bitrate):
    codec = av.CodecContext.create(name, 'w')
    codec.width, codec.height = width, height
    codec.pix_fmt = 'yuv420p'
    codec.bit_rate = bitrate
    codec.time_base = fractions.Fraction(1, 90000)
    codec.framerate = fractions.Fraction(fps, 1)
    codec.gop_size = fps * 2
    codec.max_b_frames = 0
    codec.profile = 'Baseline'
    if name == 'h264_nvenc':
        codec.options = {'preset':'p1','tune':'ull','rc':'cbr','zerolatency':'1','rc-lookahead':'0','delay':'0','profile':'baseline'}
    elif name == 'h264_amf':
        codec.options = {'usage':'ultralowlatency','quality':'speed','rc':'cbr'}
    elif name == 'h264_qsv':
        codec.options = {'preset':'veryfast','look_ahead':'0','async_depth':'1'}
    else:
        codec.options = {'preset':'ultrafast','tune':'zerolatency','profile':'baseline','x264-params':f'scenecut=0:bframes=0:vbv-maxrate={bitrate//1000}:vbv-bufsize={max(100,bitrate//fps//1000)}'}
        codec.thread_count = 4
    codec.open()
    return codec


def choose_encoder(preferred='auto'):
    names = ['h264_nvenc','h264_amf','h264_qsv','libx264'] if preferred == 'auto' else [preferred,'libx264']
    # NVENC requires larger dimensions than 128x128 on some GPU generations.
    frame = av.VideoFrame.from_ndarray(np.zeros((720,1280,3),dtype=np.uint8), format='rgb24').reformat(format='yuv420p')
    frame.pts, frame.time_base = 0, fractions.Fraction(1,90000)
    for name in dict.fromkeys(names):
        try:
            codec = make_codec(name,1280,720,60,4_000_000)
            if list(codec.encode(frame)):
                return name
        except Exception as error:
            log.info('Encoder %s unavailable: %s',name,type(error).__name__)
    raise RuntimeError('No usable H.264 encoder')


class GamingH264Encoder(H264Encoder):
    def __init__(self, name, fps, bitrate):
        super().__init__()
        self.name, self.fps = name, fps
        self.limit = bitrate
        self.rate = bitrate

    @property
    def target_bitrate(self):
        return self.rate

    @target_bitrate.setter
    def target_bitrate(self, value):
        # REMB can reduce the requested quality when the network cannot sustain it.
        self.rate = max(500_000,min(int(value),self.limit))

    def _encode_frame(self, frame, force_keyframe):
        if self.codec and (frame.width!=self.codec.width or frame.height!=self.codec.height or abs(self.rate-self.codec.bit_rate)/self.codec.bit_rate>0.25):
            self.codec = None
        if self.codec is None:
            try:
                self.codec=make_codec(self.name,frame.width,frame.height,self.fps,self.rate)
            except Exception:
                if self.name=='libx264':raise
                log.exception('Hardware encoder failed; switching to CPU')
                self.name='libx264'
                self.codec=make_codec(self.name,frame.width,frame.height,self.fps,self.rate)
        frame.pict_type=av.video.frame.PictureType.I if force_keyframe else av.video.frame.PictureType.NONE
        data=b''.join(bytes(packet) for packet in self.codec.encode(frame))
        if data:yield from self._split_bitstream(data)


class LatestCapture:
    """One producer, one latest frame. No stale frame queue or event-loop GDI calls."""
    def __init__(self, monitor, fps, backend='auto', device=0, output=0):
        self.fps, self.monitor_index, self.backend= fps,monitor,backend
        self.device,self.output=device,output
        self.ready=threading.Event()
        self.closed=threading.Event()
        self.frame=None
        self.error=None
        self.monitor=None
        self.name='starting'
        self.thread=threading.Thread(target=self._run,daemon=True,name='pccloud-capture')
        self.thread.start()

    def _run(self):
        camera=None
        try:
            with mss.MSS() as capture:
                if not 1<=self.monitor_index<len(capture.monitors):raise ValueError('Monitor does not exist')
                self.monitor=capture.monitors[self.monitor_index]
                if self.backend in ('auto','dxgi'):
                    try:
                        import dxcam
                        # Hybrid laptops can temporarily fail DuplicateOutput during initialization.
                        for attempt in range(3):
                            try:
                                camera=dxcam.create(device_idx=self.device,output_idx=self.output,output_color='BGRA',max_buffer_len=2)
                                break
                            except Exception:
                                if attempt==2:raise
                                time.sleep(0.2)
                        # Do not use another adapter/output accidentally: size must match the selected monitor.
                        if camera.width!=self.monitor['width'] or camera.height!=self.monitor['height']:
                            raise ValueError('DXGI output differs from selected monitor; using MSS')
                        camera.start(target_fps=self.fps,video_mode=True)
                        self.name='DXGI'
                    except Exception:
                        if camera:
                            camera.release()
                            camera=None
                        log.info('DXGI capture unavailable; using MSS')
                if not camera:self.name='MSS'
                self.ready.set()
                while not self.closed.is_set():
                    start=time.perf_counter()
                    pixels=camera.get_latest_frame() if camera else np.asarray(capture.grab(self.monitor))
                    if pixels is not None:self.frame=pixels
                    self.closed.wait(max(0,1/self.fps-(time.perf_counter()-start)))
        except Exception as error:
            self.error=error
            self.ready.set()
            log.exception('Screen capture failed')
        finally:
            if camera:camera.release()

    def stop(self):
        self.closed.set()
