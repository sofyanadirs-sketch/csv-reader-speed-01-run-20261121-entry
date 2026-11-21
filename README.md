# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sofyanadirs-sketch/csv-reader-speed-01-run-20261121-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sofyanadirs-sketch/csv-reader-speed-01-run-20261121-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own `csv-reader` 1.0.0: it answers exactly as
`csv-reader` does on every case, and does it in about a third of the CPU time
(~3.3x faster than the house baseline on the practice set and on freshly
drawn generator cases).

## Files

- `solve.js` — the entry: an ES module whose `run(input)` returns
  `csv-reader`'s answer `{columns, rows, errors}` for one case's input
  `{text, header}`.
- `main.ts` — the program the harness runs: reads every case from
  `/input/cases.json`, answers each one alone with `run`, and writes
  `/output/answers.json`.

## Semantics (as published for the bounty)

The text is read once, left to right, with commas and double quotes. A
U+FEFF at its very start is dropped. A record ends at LF or CRLF, and a line
left with no characters is no record. Outside quotes a CR not followed by LF
is dropped (`stray_cr`). A field that opens with a quote runs to the next
quote that is not doubled, `""` inside it one quote and each CRLF or lone CR
inside it read as LF; what follows its closing quote, up to the next comma or
line break, is appended as it stands (`quote_junk`, when the field ends); a
quote that never closes is a literal character, and the text after it is read
again as unquoted (`unterminated_quote`). A quote inside an unquoted field is
a literal character. Fields stay strings, never trimmed or converted.
`columns` is the first record when `header` is true, else null; `rows` holds
the records after it (every record when `header` is false), each padded with
empty strings (`short_row`, with `fields`: its field count) or cut (`long_row`,
with `extra`: the cut fields) to the first record's width. Each error is
`{code, line, row}`, in the order met; a record's `short_row`/`long_row` when
it ends, with `line` the 1-based line its record starts on and `row` its
record's index in `rows` (null for the header).

## How it is fast

No per-character loop: one regex finds the next quote, CR or LF, which
settles whether a record is clean — a clean record is `split(',')` in one
go. Unquoted fields jump to the next delimiter with one regex test; quoted
fields jump to the next quote with `indexOf`, and a quoted segment is sliced
once and checked for line breaks inside that slice. Regexes are driven with
`test()` (the match position is read back from `lastIndex`), so no match
array is allocated per step, and field readers report through shared
out-variables instead of a fresh result object per field. Peak memory is not
scored; CPU time alone is.

## Verification

- Practice set: 6/6 answers identical to the reference, ~118 ms total vs
  ~530 ms for the house baseline (medians in fresh processes).
- 25,126 targeted + random differential cases vs the reference: 0 mismatches.
- 132 freshly drawn generator cases (new seeds): 0 mismatches, ~3.3x faster
  than the baseline.

Written from the published semantics; no code is copied from the reference
or from any other entry.

Play make.fun with my referral code: [h9b99srf](https://make.fun/r/h9b99srf).
