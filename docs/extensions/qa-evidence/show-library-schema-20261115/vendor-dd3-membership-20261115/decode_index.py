"""Narrow, fail-closed decoder for the retained pnpm msgpackr record blobs.

Evidence utility only; never imported by product code. Unknown extensions fail.
"""
import base64
import json
import struct
from pathlib import Path


class RecordDecoder:
    def __init__(self, data):
        self.data, self.pos, self.records = data, 0, {}

    def take(self, size):
        assert 0 <= size <= len(self.data) - self.pos, "truncated"
        value = self.data[self.pos:self.pos + size]
        self.pos += size
        return value

    def number(self, fmt):
        return struct.unpack(">" + fmt, self.take(struct.calcsize(fmt)))[0]

    def record(self, keys):
        assert isinstance(keys, list) and all(isinstance(k, str) for k in keys)
        assert len(set(keys)) == len(keys)
        return {k: self.read() for k in keys}

    def read(self):
        tag = self.take(1)[0]
        if tag in self.records:
            return self.record(self.records[tag])
        if tag < 0x80:
            return tag
        if tag >= 0xe0:
            return tag - 256
        if 0xa0 <= tag <= 0xbf:
            return self.take(tag & 31).decode("utf8")
        if 0x90 <= tag <= 0x9f:
            return [self.read() for _ in range(tag & 15)]
        if 0x80 <= tag <= 0x8f:
            return self.mapping(tag & 15)
        if tag in (0xc0, 0xc2, 0xc3):
            return {0xc0: None, 0xc2: False, 0xc3: True}[tag]
        if tag in (0xcc, 0xcd, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xca, 0xcb):
            return self.number({0xcc:'B', 0xcd:'H', 0xce:'I', 0xcf:'Q',
                                0xd0:'b', 0xd1:'h', 0xd2:'i', 0xd3:'q',
                                0xca:'f', 0xcb:'d'}[tag])
        if tag in (0xd9, 0xda, 0xdb):
            return self.take(self.number({0xd9:'B',0xda:'H',0xdb:'I'}[tag])).decode('utf8')
        if tag in (0xdc, 0xdd):
            return [self.read() for _ in range(self.number('H' if tag == 0xdc else 'I'))]
        if tag in (0xde, 0xdf):
            return self.mapping(self.number('H' if tag == 0xde else 'I'))
        if tag == 0xd4:
            extension, record_id = self.take(2)
            assert extension == 0x72 and 0x40 <= record_id <= 0x7f
            keys = self.read()
            self.records[record_id] = keys
            return self.record(keys)
        raise ValueError(f'unsupported tag {tag:02x} at {self.pos - 1}')

    def mapping(self, size):
        out = {}
        for _ in range(size):
            key = self.read()
            assert isinstance(key, str) and key not in out
            out[key] = self.read()
        return out

    def decode(self):
        result = self.read()
        assert self.pos == len(self.data), (self.pos, len(self.data))
        return result


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    data = json.loads((root / 'exact-index-rows.json').read_text(encoding='utf-8-sig'))
    result = []
    for package in data['packages']:
        assert len(package['rows']) == 1
        key, encoded = package['rows'][0]
        decoded = RecordDecoder(base64.b64decode(encoded, validate=True)).decode()
        result.append({'package': package['package'], 'indexKey': key,
                       'aliases': package['aliases'], 'data': decoded})
    (root / 'decoded-index-rows.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf8')
    for row in result:
        print(json.dumps({'package': row['package'], 'fields': list(row['data']),
                          'fileCount': len(row['data']['files']),
                          'metadataAndLicensePaths': [p for p in row['data']['files']
                            if p == 'package.json' or 'license' in p.lower() or 'notice' in p.lower()]}))
