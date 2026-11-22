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
