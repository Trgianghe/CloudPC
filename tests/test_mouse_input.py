import unittest
from mouse_input import decode_mouse, normalize_absolute

class MouseInputTests(unittest.TestCase):
    def test_binary_mouse(self):
        self.assertEqual(decode_mouse(bytes([1,255,255,0,0])), {'type':'absolute','x':1.0,'y':0.0})
        self.assertEqual(decode_mouse(bytes([2,133,255,0,128])), {'type':'move','dx':-123,'dy':-32768})
        self.assertEqual(decode_mouse(bytes([3,1,1])), {'type':'button','button':'middle','down':True})
        self.assertEqual(decode_mouse(bytes([4,136,255])), {'type':'wheel','delta':-120})
        self.assertEqual(decode_mouse(bytes([5,1,0,0,0,7])), {'type':'buttons','seq':1,'mask':7})
    def test_invalid_packets(self):
        for packet in (b'', b'\x01', bytes([3,3,1]), bytes([3,0,2]), bytes([5,1,0,0,0,8]), 'json'):
            with self.assertRaises(ValueError): decode_mouse(packet)
    def test_monitor_with_negative_origin(self):
        monitor={'left':-1920,'top':0,'width':1920,'height':1080}
        x,y=normalize_absolute(1,1,monitor,(-1920,0,3840,1080))
        self.assertLess(x,32768); self.assertGreater(y,65400)
        x,_=normalize_absolute(0,0,{'left':0,'top':0,'width':1920,'height':1080},(-1920,0,3840,1080))
        self.assertGreaterEqual(x,32768)

if __name__=='__main__': unittest.main()
