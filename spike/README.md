# Spike

`FINDINGS.md` is the record of the measurement spike of version 0.7, and
is kept as evidence.

`kernel/` and `binding/` are the spike's throwaway kernel, restored at the
owner's direction to generate the **provisional** test vectors of version
0.8: it runs on the packs in `vectors/` and its answers are written to
`vectors/provisional/`. It is not the beginning of the implementation,
nothing may depend on it, and a vector it produced stays provisional until
an implementation written independently, from the specification alone,
reproduces it.

Build and run:

    cd spike/kernel && cargo build --release --target wasm32-unknown-unknown
    node spike/vectors.mjs

Composition (SPEC-PRESENTATION §7.7): the kernel breaks lines itself (UAX #14,
`kernel/src/linebreak.rs`) and orders them (UAX #9, `kernel/src/bidi.rs`), and asks its
host only to `measure`. `node spike/compose-vectors.mjs` writes
`vectors/provisional/composition.json` with a synthetic measure function.
`COMPOSITION-NOTES.md` lists every place where §7.7 and §8.3 did not decide what the
kernel should do, and what the two algorithms cost in size.

The Unicode tables are generated, and the two algorithms checked against the Unicode
16.0 conformance files, by the scripts in `tools/` (see the head of each):

    cd spike/tools && npm install && node gen_linebreak.mjs && node gen_bidi.mjs
    cd ../kernel && cargo build --release --target wasm32-unknown-unknown --features conformance --target-dir ../tools/target
    cd ../tools && node conformance.mjs
