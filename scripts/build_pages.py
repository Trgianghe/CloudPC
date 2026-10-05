"""Build a static player from an explicit public-file allowlist."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'pages-dist'

def build():
    OUT.mkdir(exist_ok=True)
    html = (ROOT / 'cloud-native/index.html').read_text(encoding='utf-8-sig')
    html = html.replace('/assets/native-reference.css', './native-reference.css')
    html = html.replace('</head>', '<meta name="referrer" content="no-referrer"></head>')
    html = html.replace('Chưa kết nối PC. Cuộn xuống để nhập config.', 'Kéo thanh trắng sang trái. Nhập config client có địa chỉ WSS để kết nối PC.')
    (OUT / 'index.html').write_text(html, encoding='utf-8')
    for name in ('mouse_controller.js', 'connection.js'):
        shutil.copyfile(ROOT / 'cloud-native' / name, OUT / name)
    shutil.copyfile(ROOT / 'web/native-reference.css', OUT / 'native-reference.css')
    (OUT / '.nojekyll').write_text('')
    print('Built public player: pages-dist (no credentials or host configs).')

if __name__ == '__main__':
    build()
