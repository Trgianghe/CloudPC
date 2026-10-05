"""Binary mouse-v2 decoder used by the existing aiohttp/aiortc host."""
import struct

def decode_mouse(packet):
    if not isinstance(packet, (bytes, bytearray)) or not packet:
        raise ValueError('Invalid mouse packet')
    size = {1: 5, 2: 5, 3: 3, 4: 3, 5: 6}.get(packet[0])
    if len(packet) != size:
        raise ValueError('Invalid mouse packet length')
    if packet[0] == 5:
        if packet[5] & ~7:
            raise ValueError('Invalid mouse state')
        return {'type':'buttons', 'mask':packet[5], 'seq':struct.unpack_from('<I',packet,1)[0]}
    if packet[0] == 1:
        x, y = struct.unpack_from('<HH', packet, 1)
        return {'type': 'absolute', 'x': x / 65535, 'y': y / 65535}
    if packet[0] == 2:
        x, y = struct.unpack_from('<hh', packet, 1)
        return {'type': 'move', 'dx': x, 'dy': y}
    if packet[0] == 3:
        if packet[1] > 2 or packet[2] > 1:
            raise ValueError('Invalid mouse button')
        return {'type': 'button', 'button': ('left', 'middle', 'right')[packet[1]], 'down': bool(packet[2])}
    return {'type': 'wheel', 'delta': struct.unpack_from('<h', packet, 1)[0]}

def normalize_absolute(x, y, monitor, virtual):
    def axis(value, origin, span, desktop_origin, desktop_span):
        if span <= 0 or desktop_span <= 0:
            raise ValueError('Desktop dimensions unavailable')
        pixel = origin - desktop_origin + round(max(0, min(1, value)) * (span - 1))
        return max(0, min(65535, (pixel * 65536 + 32768) // desktop_span))
    return (axis(x, monitor['left'], monitor['width'], virtual[0], virtual[2]),
            axis(y, monitor['top'], monitor['height'], virtual[1], virtual[3]))
