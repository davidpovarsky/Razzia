"""Hash two exact documented public source MP3s in memory; never save/play remote audio."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import urllib.request
import urllib.parse

OUT = Path(__file__).resolve().parent
REPORT = OUT / 'public-source-bytes.json'
assert not REPORT.exists()
class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != 'https' or parsed.hostname != 'sfxmint.com':
            raise ValueError('Source redirect outside exact HTTPS origin')
        return super().redirect_request(request, response, code, message, headers, newurl)

opener = urllib.request.build_opener(SameOriginRedirect())
sources = [
    {'url': 'https://sfxmint.com/dl/transition-swoosh-49.mp3', 'sourcePage': 'https://sfxmint.com/sounds/transition-swoosh-49', 'notice': 'docs/extensions/TADAZZ_AUDIO_REFRESH_LICENSE.md', 'expectedSourceSha256': '702b837540b02bb7c6e4ec544f465a7da9d0f56cec1aaebc31b0925e88c78bdb'},
    {'url': 'https://sfxmint.com/dl/ui-chime-46.mp3', 'sourcePage': 'https://sfxmint.com/sounds/ui-chime-46', 'notice': 'docs/extensions/TADAZZ_REVEAL_SFX_LICENSE.md', 'expectedSourceSha256': '0b72fb267433cd114d24dadbe661c731fa4d5c94d99c7d2dd3c63e6c8dcc5e3d'},
]
records = []
for source in sources:
    result = {**source, 'attemptedUtc': datetime.now(timezone.utc).isoformat()}
    try:
        request = urllib.request.Request(source['url'], headers={'Accept': 'audio/mpeg'})
        with opener.open(request, timeout=20) as response:
            body = response.read(1048577)
            assert len(body) <= 1048576, 'Source exceeds bounded 1MiB read'
            result.update({'status': response.status, 'contentType': response.headers.get('Content-Type'), 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(), 'etag': response.headers.get('ETag'), 'lastModified': response.headers.get('Last-Modified')})
            result['matchesDocumentedSourceSha256'] = result['sha256'] == source['expectedSourceSha256']
            result['looksLikeMp3'] = body.startswith(b'ID3') or (len(body) >= 2 and body[0] == 255 and (body[1] & 224) == 224)
    except Exception as error:
        result.update({'errorType': type(error).__name__, 'error': str(error), 'matchesDocumentedSourceSha256': False})
    records.append(result)
report = {'capturedUtc': datetime.now(timezone.utc).isoformat(), 'method': 'Bounded anonymous HTTPS GET, hash in memory only', 'sources': records, 'remoteMediaFilesSaved': 0, 'audioPlayed': False, 'credentialsUsed': False, 'runtimeOrExportAuthorityInstalled': False, 'adaptationTransformationReproduced': False}
REPORT.write_bytes((json.dumps(report, indent=2) + '\n').encode())
print(json.dumps(report))
