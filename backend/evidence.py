"""Canonical evidence is UTF-8 JSON, sorted ASCII keys, integers only, no whitespace."""
import hashlib
import json


def canonical(value):
    def check(x):
        if x is None or isinstance(x, (str, bool, int)):
            return
        if isinstance(x, list):
            for item in x:
                check(item)
        elif isinstance(x, dict) and all(isinstance(k, str) and k.isascii() for k in x):
            for item in x.values():
                check(item)
        else:
            raise ValueError("Evidence requires ASCII keys and integer units; floats are forbidden")
    check(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()
