"""Publish the existing website, with its player embedded in PC sessions."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'pages-dist'

def build():
    OUT.mkdir(exist_ok=True)
    html = (ROOT / 'web/index.html').read_text(encoding='utf-8-sig')
    html = html.replace('/assets/', './assets/').replace('href="/"', 'href="./"')
    html = html.replace('</head>', '<script>window.PCCloudDeployment={static:true,player:"./session/"};</script><meta name="referrer" content="no-referrer"></head>')
    (OUT / 'index.html').write_text(html, encoding='utf-8')
    assets=OUT/'assets'
    assets.mkdir(exist_ok=True)
    for p in (ROOT/'web').iterdir():
        if p.is_file() and p.suffix in {'.js','.css','.svg'}:
            shutil.copyfile(p,assets/p.name)
    session=OUT/'session'
    session.mkdir(exist_ok=True)
    player=(ROOT/'cloud-native/index.html').read_text(encoding='utf-8-sig').replace('/assets/','../assets/')
    (session/'index.html').write_text(player,encoding='utf-8')
    for name in ('mouse_controller.js', 'connection.js'):
        shutil.copyfile(ROOT / 'cloud-native' / name, session / name)
    (OUT / '.nojekyll').write_text('')
    print('Built main website with integrated session: pages-dist (no host credentials).')

if __name__ == '__main__':
    build()
