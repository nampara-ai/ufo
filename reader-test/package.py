#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Builds ufo-reader-test.zip: the core document, the brief and the packs. No expected values."""
import glob, os, zipfile
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "ufo-reader-test.zip")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(root, "SPEC.md"), "ufo-reader-test/SPEC.md")
    z.write(os.path.join(root, "reader-test", "INSTRUCTIONS.md"), "ufo-reader-test/INSTRUCTIONS.md")
    for f in sorted(glob.glob(os.path.join(root, "vectors", "*.ufx"))):
        z.write(f, "ufo-reader-test/packs/" + os.path.basename(f))
print(out, os.path.getsize(out), "bytes;", len(zipfile.ZipFile(out).namelist()), "files")
