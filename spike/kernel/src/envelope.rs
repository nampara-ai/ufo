// The web envelope (SPEC-TRAVEL 13.2) as a pure function of its parts: nothing here reads a page.
//
// Parts, each a text: title, date, static, style, script, kernel, kernel-hash, tools, pack, skeleton.
// The envelope is the skeleton with each gap `{{name}}` replaced, in one pass from the start; what
// is put in is never looked at for gaps. A gap's name runs to the next `}}`.
//   {{title}} {{date}} {{static}}       the part, with & < > " written &amp; &lt; &gt; &quot;
//   {{style}} {{script}} {{kernel}} {{kernel-hash}} {{tools}} {{pack}} {{skeleton}}   the part, unchanged
//   {{csp:script}} {{csp:style}}        sha256- and the standard base64 of the SHA-256 of the part's UTF-8 bytes
//   {{<}}                               the character <
// Refused: a gap that is not closed, a name not listed here, a part that is absent or not a text,
// and a part to be put in unchanged that holds `</script` or `<!--` (ASCII letters in either case),
// or for style also `</style`. `{{<}}` is there because a skeleton has to write `<!--` and
// `</script` and, being itself a part put in unchanged, may not hold them.
use crate::value::*;
use crate::write::base64;
use alloc::string::String;

/// Where `w` first is in `p`, by bytes (the library's search of a text for a text is far larger).
fn find(p: &str, w: &str) -> Option<usize> {
    p.as_bytes().windows(w.len()).position(|x| x == w.as_bytes())
}
pub fn envelope(parts: &V) -> Result<String, &'static str> {
    let part = |n: &str| parts.get(n).and_then(|p| p.s()).ok_or("a part the skeleton asks for is absent, or is not a text");
    let holds = |p: &str, w: &str| p.as_bytes().windows(w.len()).any(|x| x.eq_ignore_ascii_case(w.as_bytes()));
    let (mut rest, mut out) = (part("skeleton")?, String::new());
    while let Some(a) = find(rest, "{{") {
        out.push_str(&rest[..a]);
        let b = a + 2 + find(&rest[a + 2..], "}}").ok_or("a gap in the skeleton is not closed")?;
        let name = &rest[a + 2..b];
        rest = &rest[b + 2..];
        match name {
            "<" => out.push('<'),
            "title" | "date" | "static" => {
                for c in part(name)?.chars() {
                    match c {
                        '&' => out.push_str("&amp;"),
                        '<' => out.push_str("&lt;"),
                        '>' => out.push_str("&gt;"),
                        '"' => out.push_str("&quot;"),
                        c => out.push(c),
                    }
                }
            }
            "style" | "script" | "kernel" | "kernel-hash" | "tools" | "pack" | "skeleton" => {
                let p = part(name)?;
                if holds(p, "</script") || holds(p, "<!--") || (name == "style" && holds(p, "</style")) {
                    return Err("a part to be put in unchanged holds text that would end or escape its element");
                }
                out.push_str(p);
            }
            "csp:script" | "csp:style" => {
                out.push_str("sha256-");
                out.push_str(&base64(&sha256(&[part(&name[4..])?.as_bytes()])));
            }
            _ => return Err("the skeleton has a gap of a name that is not known"),
        }
    }
    out.push_str(rest);
    Ok(out)
}
