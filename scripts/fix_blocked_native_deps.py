"""Idempotent workaround for a real-world Windows issue, not a CareerBridge bug.

`langgraph` and `langsmith` import two compiled extensions at module load
time -- `xxhash` (internal, non-cryptographic task/trace IDs) and `ormsgpack`
(checkpoint serialization; unused here since none of our graphs configure a
checkpointer). On a Windows machine with an Application Control / WDAC
policy, those DLLs can be blocked outright, which breaks importing
`langgraph` entirely -- even in mock mode, since the import happens whether
or not the functions are ever called.

This script checks whether each import actually works; if not, it replaces
the package with a tiny pure-Python module providing only what langgraph/
langsmith call. Neither shim is bit-compatible with the real library -- fine
here since nothing in this stack checks that, only internal
uniqueness/determinism (xxhash) or round-tripping our own plain dict/list/str
state through pickle (ormsgpack; never actually exercised without a
checkpointer, but must still *import* cleanly).

Run once after `pip install -r requirements.txt`:
    python scripts/fix_blocked_native_deps.py
Safe to re-run; does nothing for a package that already imports fine.
"""

import importlib
import importlib.util
import sys

XXHASH_SHIM = '''\
"""Pure-Python stand-in for the `xxhash` package.

Installed by scripts/fix_blocked_native_deps.py because the real compiled
extension was blocked by a Windows Application Control policy on this
machine. Provides only what langgraph/langsmith actually call. Not
bit-compatible with real xxh3 -- only used here for internal, non-security
task/trace IDs, so that doesn't matter.
"""

import hashlib


class _Hash:
    def __init__(self, data: bytes = b""):
        self._h = hashlib.blake2b(data, digest_size=16)

    def update(self, data: bytes) -> None:
        self._h.update(data)

    def digest(self) -> bytes:
        return self._h.digest()

    def hexdigest(self) -> str:
        return self._h.hexdigest()

    def intdigest(self) -> int:
        return int.from_bytes(self._h.digest(), "big")


def xxh3_128(data: bytes = b"") -> _Hash:
    return _Hash(data)


def xxh3_128_hexdigest(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=16).hexdigest()


def xxh3_128_intdigest(data: bytes) -> int:
    return int.from_bytes(hashlib.blake2b(data, digest_size=16).digest(), "big")


def xxh64_hexdigest(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=8).hexdigest()


def xxh32_hexdigest(data: bytes) -> str:
    return hashlib.blake2b(data, digest_size=4).hexdigest()
'''

ORMSGPACK_SHIM = '''\
"""Pure-Python stand-in for the `ormsgpack` package.

Installed by scripts/fix_blocked_native_deps.py because the real compiled
extension was blocked by a Windows Application Control policy on this
machine. Backs packb/unpackb with pickle instead of real msgpack -- not
wire-compatible with real ormsgpack, but nothing here persists a checkpoint
to an external store (no checkpointer is configured on any graph in this
app), so only our own process ever reads back what it wrote, if anything
does at all.
"""

import pickle
from typing import Any

# Bitflags langgraph ORs together at import time; values only need to be
# distinct ints so the bitwise OR works, nothing checks them against real ormsgpack.
OPT_NON_STR_KEYS = 1 << 0
OPT_NAIVE_UTC = 1 << 1
OPT_PASSTHROUGH_DATACLASS = 1 << 2
OPT_PASSTHROUGH_DATETIME = 1 << 3
OPT_PASSTHROUGH_ENUM = 1 << 4
OPT_PASSTHROUGH_SUBCLASS = 1 << 5
OPT_PASSTHROUGH_TUPLE = 1 << 6
OPT_PASSTHROUGH_UUID = 1 << 7
OPT_REPLACE_SURROGATES = 1 << 8
OPT_SERIALIZE_NUMPY = 1 << 9
OPT_SORT_KEYS = 1 << 10
OPT_UTC_Z = 1 << 11


class MsgpackEncodeError(Exception):
    pass


class MsgpackDecodeError(Exception):
    pass


class Ext:
    """Minimal stand-in for ormsgpack.Ext: an (code, data) extension wrapper."""

    def __init__(self, code: int, data: bytes):
        self.code = code
        self.data = data


def packb(data: Any, default=None, option=None) -> bytes:
    try:
        return pickle.dumps(data)
    except Exception as exc:
        if default is not None:
            try:
                return pickle.dumps(default(data))
            except Exception as exc2:
                raise MsgpackEncodeError(str(exc2)) from exc2
        raise MsgpackEncodeError(str(exc)) from exc


def unpackb(data: bytes, ext_hook=None, option=None) -> Any:
    try:
        return pickle.loads(data)
    except Exception as exc:
        raise MsgpackDecodeError(str(exc)) from exc
'''

SHIMS = {"xxhash": XXHASH_SHIM, "ormsgpack": ORMSGPACK_SHIM}


def import_works(name: str) -> bool:
    try:
        importlib.import_module(name)
        return True
    except Exception:
        return False


def main() -> None:
    any_replaced = False
    for name, shim_source in SHIMS.items():
        if import_works(name):
            print(f"{name}: imports fine on this machine — nothing to do.")
            continue

        spec = importlib.util.find_spec(name)
        if spec is None or not spec.origin:
            print(f"{name}: not installed at all. Run: pip install -r requirements.txt", file=sys.stderr)
            raise SystemExit(1)

        target = spec.origin  # .../site-packages/<name>/__init__.py
        with open(target, "w", encoding="utf-8") as f:
            f.write(shim_source)

        importlib.invalidate_caches()
        sys.modules.pop(name, None)
        if not import_works(name):
            print(f"{name}: replaced but still won't import — see the error above.", file=sys.stderr)
            raise SystemExit(1)

        print(f"{name}: compiled extension was blocked; replaced {target} with a pure-Python shim.")
        any_replaced = True

    if not any_replaced:
        print("Nothing was blocked — no shims needed.")


if __name__ == "__main__":
    main()
