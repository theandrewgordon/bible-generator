#!/usr/bin/env python3
"""Verify and import a standalone Scroll Quest browser release; no game build required."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def import_release(archive_path):
    archive_path = Path(archive_path)
    with zipfile.ZipFile(archive_path) as archive:
        manifests = [n for n in archive.namelist() if n.endswith('/release-manifest.json') or n == 'release-manifest.json']
        if len(manifests) != 1:
            raise ValueError('Choose a browser ZIP with exactly one release manifest.')
        prefix = manifests[0][:-len('release-manifest.json')]
        manifest = json.loads(archive.read(manifests[0]))
        if manifest.get('edition') != 'full' or manifest.get('levels') != 54:
            raise ValueError('Expected a full, 54-chapter browser release.')
        files = manifest['files']
        names = [entry['file'] for entry in files]
        if len(names) != len(set(names)):
            raise ValueError('Duplicate release entries.')
        for name in names:
            parts = PurePosixPath(name)
            if parts.is_absolute() or '..' in parts.parts or '\\' in name:
                raise ValueError('Unsafe release path.')
            if parts.parts[0] in {'desktop', 'tests', 'node_modules'}:
                raise ValueError('This is not a browser-only release.')
        expected = {prefix + name for name in names} | {manifests[0]}
        actual = [info.filename for info in archive.infolist() if not info.is_dir()]
        if set(actual) != expected or len(actual) != len(expected):
            raise ValueError('ZIP contents differ from the release manifest.')
        parent = ROOT / 'faithsparks/content'
        with tempfile.TemporaryDirectory(prefix='scroll-quest-import-', dir=parent) as temp:
            stage = Path(temp) / 'bundle'
            for entry in files:
                data = archive.read(prefix + entry['file'])
                if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                    raise ValueError('Release verification failed: ' + entry['file'])
                target = stage / entry['file']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
            if hashlib.sha256((stage / 'engine.js').read_bytes()).hexdigest() != manifest['engineSha256']:
                raise ValueError('Engine fingerprint mismatch.')
            (stage / 'release-manifest.json').write_bytes(archive.read(manifests[0]))
            destination = parent / 'scroll_quest'
            if destination.exists():
                shutil.rmtree(destination)
            shutil.move(str(stage), destination)
    provenance = {key: manifest[key] for key in ('version', 'edition', 'levels', 'builtAt', 'sourceSha256', 'engineSha256')}
    provenance.update(browserArchiveSha256=hashlib.sha256(archive_path.read_bytes()).hexdigest(), filesVerified=len(files))
    (ROOT / 'docs/scroll-quest-release.json').write_text(json.dumps(provenance, indent=2) + '\n', encoding='utf-8')
    return provenance


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('browser_zip', type=Path)
    print(json.dumps(import_release(parser.parse_args().browser_zip), indent=2))
