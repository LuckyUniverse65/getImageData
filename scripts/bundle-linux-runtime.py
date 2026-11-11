"""Collect the addon's non-glibc runtime closure and fallback fonts for npm."""
import hashlib
import pathlib
import re
import shutil
import subprocess
import urllib.request

CORE = {'libc.so.6', 'libm.so.6', 'libdl.so.2', 'libpthread.so.0', 'librt.so.1', 'ld-linux-x86-64.so.2'}
FONT_RELEASE = 'Sans2.004'

def linked(binary):
    output = subprocess.check_output(['ldd', str(binary)], text=True)
    if 'not found' in output:
        raise RuntimeError(output)
    return [(m[0], pathlib.Path(m[1])) for m in re.findall(r'^\s*(\S+) => (/\S+) \(', output, re.M)], output

def bundle(output, cache):
    libs = output / 'linux-libs'
    fonts = output / 'fonts'
    libs.mkdir(exist_ok=True)
    fonts.mkdir(exist_ok=True)
    binary = output / 'canvas.node'
    dependencies, _ = linked(binary)
    notices = []
    files = []
    for soname, source in dependencies:
        if soname in CORE:
            continue
        dynamic = subprocess.check_output(['readelf', '-d', str(source)], text=True)
        if '(RUNPATH)' in dynamic or '(RPATH)' in dynamic:
            raise RuntimeError('Unexpected library search path: ' + str(source))
        destination = libs / soname
        if source.resolve() != destination.resolve():
            shutil.copyfile(source, destination)
        files.append(destination)
        # Debian/Ubuntu runtime packages retain exact upstream notices here.
        found = None
        for candidate in [str(source), str(source.resolve()), str(source).replace('/lib/', '/usr/lib/', 1)]:
            result = subprocess.run(['dpkg-query', '-S', candidate], text=True, capture_output=True)
            if result.returncode == 0:
                package = result.stdout.split(': ', 1)[0].split(':', 1)[0]
                copyright_file = pathlib.Path('/usr/share/doc') / package / 'copyright'
                if copyright_file.exists():
                    found = copyright_file.read_text()
                    break
        if found is None:
            # A repeated build may resolve the copied library. Look up its SONAME.
            result = subprocess.check_output(['dpkg-query', '-S', '*/' + soname], text=True)
            package = result.split(': ', 1)[0].split(':', 1)[0]
            found = (pathlib.Path('/usr/share/doc') / package / 'copyright').read_text()
        notices.append(soname + '\n\n' + found)
    for filename in ['DejaVuSans.ttf', 'DejaVuSerif.ttf', 'DejaVuSansMono.ttf']:
        shutil.copyfile(pathlib.Path('/usr/share/fonts/truetype/dejavu') / filename, fonts / filename)
        files.append(fonts / filename)
    notices.append('DejaVu fonts\n\n' + pathlib.Path('/usr/share/doc/fonts-dejavu-core/copyright').read_text())
    cache.mkdir(parents=True, exist_ok=True)
    for filename, relative in [('NotoSansCJKsc-Regular.otf', 'Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf'), ('Noto-OFL.txt', 'Sans/LICENSE')]:
        target = cache / filename
        if not target.exists():
            url = 'https://raw.githubusercontent.com/notofonts/noto-cjk/' + FONT_RELEASE + '/' + relative
            with urllib.request.urlopen(url, timeout=120) as response:
                content = response.read()
            target.write_bytes(content)
        if filename.endswith('.otf'):
            if target.read_bytes()[:4] != b'OTTO':
                raise RuntimeError('Invalid Noto font download')
            shutil.copyfile(target, fonts / filename)
            files.append(fonts / filename)
        else:
            notices.append('Noto CJK ' + FONT_RELEASE + '\n\n' + target.read_text())
    for name in ['GPL-2', 'GPL-3', 'LGPL-2', 'LGPL-2.1', 'LGPL-3']:
        p = pathlib.Path('/usr/share/common-licenses') / name
        if p.exists():
            notices.append(name + '\n\n' + p.read_text())
    resolved, dependencies = linked(binary)
    for soname, location in resolved:
        if soname not in CORE and location.resolve().parent != libs.resolve():
            raise RuntimeError('Dependency was not resolved from the package: ' + soname + ': ' + str(location))
    manifest = {p.relative_to(output).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    return manifest, dependencies, '\n\n'.join(notices)
