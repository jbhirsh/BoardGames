# Word lists

The word checker answers from these first, so a verdict needs no network,
and asks the online dictionary only about words neither holds.

- `enable.txt` is ENABLE (Enhanced North American Benchmark Lexicon, 1997),
  a public-domain word list built for word games: 172,823 lowercase words,
  one per line. Source: https://github.com/dolph/dictionary (enable1.txt).
- `additions.txt` is a short, hand-picked list of words ENABLE predates, one
  per line, sorted, none of them already in ENABLE:
  - the two-letter words added to the North American word-game list since
    (fe, ki, oi, qi and za in 2006; da, gi, po and te in 2014; ok and ew in
    2018), with their plurals;
  - a few other well-known additions (frenemy, buzzkill, zen, yowza,
    facepalm, emoji, twerk);
  - everyday modern words a table would accept, with their usual forms
    (email, app, blog, spam, selfie, texted, website, online, ramen).

  It is written by hand, not copied from NWL or Collins, which are
  copyrighted. Add a word only if it is a real, common English word ENABLE
  lacks; `src/__tests__/wordList.test.ts` checks the file's format.
