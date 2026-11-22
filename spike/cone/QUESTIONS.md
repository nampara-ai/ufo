# Finding things in a universe you have never seen

A universe of documents is behind the tool `./cone`. You cannot read its
files; you can only ask the tool. Everything it prints is one record per
line. Anchors look like `u:6b17b8fc/o:b9f7c62a` or, for part of a text,
`u:6b17b8fc/o:b9f7c62a[120,480]`; pass them back exactly as printed.

    ./cone <question number> overview            what the universe is, and its root
    ./cone <question number> expand <anchor>     the parts of that thing (children, sections, blocks, rows)
    ./cone <question number> text <anchor>       the actual content of that thing or region
    ./cone <question number> why <anchor>        who or what wrote it, and the evidence recorded for it

`chars=` on a line says how many characters reading that part with `text`
would return. Reading costs; listing parts is cheap. Answer each question
while reading as little content as you can, but do not guess: an answer
must quote the text it rests on and give its anchor. Always pass the number
of the question you are working on as the first argument.

1. The report concludes that a bypass valve should be replaced. What
   evidence does the report cite for that? Quote each supporting sentence
   and give its anchor.
2. One of the people interviewed for the water works study described a
   pump tripping in March. Which interview was it, and what did they say
   caused it? Quote the sentence and give its anchor.
3. In the water works study's measurements, which row has the highest
   nitrate reading, and what are its site and date?
