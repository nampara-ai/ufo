#!/bin/bash
# Is the script a web envelope ships reproducible from its source? Minifies spike/envelope/host.mjs twice where it lies and once
# from a copy at another path, with the pinned terser and the fixed options of spike/envelope/parts.mjs; says whether the three
# agree; and, given an envelope made by make.mjs, whether the script it carries is exactly those bytes.
# Usage: spike/tools/repro-host.sh [an envelope, .ufx.html]
set -eu
here=$(cd "$(dirname "$0")" && pwd)
src=$here/../envelope/host.mjs
terser=$here/node_modules/.bin/terser
OPT="--module --ecma 2020 --compress --mangle"
work=$(mktemp -d)
mkdir -p "$work/elsewhere/deeper"; cp "$src" "$work/elsewhere/deeper/another-name.mjs"
echo "terser: $("$terser" --version)   options: $OPT"
min() { "$terser" "$1" $OPT | node -e 'process.stdout.write(require("fs").readFileSync(0,"utf8").trim())' > "$2"; }
min "$src" "$work/a.js"; min "$src" "$work/b.js"; min "$work/elsewhere/deeper/another-name.mjs" "$work/c.js"
for f in a b c; do echo "$(sha256sum < "$work/$f.js" | cut -d' ' -f1)  $(wc -c < "$work/$f.js") bytes  ($f)"; done
echo "source: $(wc -c < "$src") bytes, $(grep -cvE '^\s*(//.*)?$' "$src") lines that are not blank or comment"
cmp -s "$work/a.js" "$work/b.js" && cmp -s "$work/a.js" "$work/c.js" || { echo "NOT REPRODUCIBLE"; exit 1; }
if [ $# -ge 1 ]; then
  node -e 'const fs=require("fs"),h=fs.readFileSync(process.argv[1],"utf8"),a=h.lastIndexOf("<script type=\"module\">")+22,s=h.slice(a,h.lastIndexOf("</script>"));process.exit(s===fs.readFileSync(process.argv[2],"utf8")?0:1)' "$1" "$work/a.js" \
    && echo "the script carried by $1 is exactly these bytes" || { echo "the script carried by $1 DIFFERS"; exit 1; }
fi
echo "reproducible"
