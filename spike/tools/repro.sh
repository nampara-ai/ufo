#!/bin/bash
# Is the kernel's build reproducible? Builds the default release wasm from scratch three times:
# twice from this source into two fresh target directories, and once from a copy of the source at
# another path; runs wasm-opt on each; prints the SHA-256 of each file and says whether they agree.
# Usage: spike/tools/repro.sh [work directory, emptied first; default a new temporary one]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
kernel=$here/../kernel
export PATH="$HOME/.cargo/bin:$PATH"
work=${1:-$(mktemp -d)}
rm -rf "$work"; mkdir -p "$work"
OPT="-Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals"
echo "rustc:    $(rustc -V)"
echo "cargo:    $(cargo -V)"
echo "wasm-opt: $("$here/node_modules/.bin/wasm-opt" --version)"
echo "flags:    cargo build --release --locked --target wasm32-unknown-unknown ; wasm-opt $OPT"
echo "RUSTFLAGS: '${RUSTFLAGS:-}'"
mkdir -p "$work/elsewhere/copy"
cp -r "$kernel/Cargo.toml" "$kernel/Cargo.lock" "$kernel/src" "$work/elsewhere/copy/"
build() { # name, source directory
  (cd "$2" && cargo build --release --locked --target wasm32-unknown-unknown --target-dir "$work/$1" 2>/dev/null)
  cp "$work/$1/wasm32-unknown-unknown/release/ufo_spike_kernel.wasm" "$work/$1.wasm"
  "$here/node_modules/.bin/wasm-opt" $OPT "$work/$1.wasm" -o "$work/$1.opt.wasm"
}
build a "$kernel"
build b "$kernel"
build c "$work/elsewhere/copy"
(cd "$work" && sha256sum a.wasm b.wasm c.wasm a.opt.wasm b.opt.wasm c.opt.wasm && wc -c a.wasm a.opt.wasm)
if cmp -s "$work/a.wasm" "$work/b.wasm" && cmp -s "$work/a.wasm" "$work/c.wasm" && cmp -s "$work/a.opt.wasm" "$work/b.opt.wasm" && cmp -s "$work/a.opt.wasm" "$work/c.opt.wasm"; then
  echo "REPRODUCIBLE: the three builds are byte-identical, before and after wasm-opt"
else
  echo "NOT REPRODUCIBLE: the builds differ"; exit 1
fi
