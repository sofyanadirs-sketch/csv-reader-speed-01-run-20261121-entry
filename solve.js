// csv-reader-speed: a fast drop-in for make.fun's csv-reader 1.0.0.
//
// Written from the published semantics (competition.yaml / RULES.txt): one
// left-to-right pass, the same broken-row policy, the same answer shape
// {columns, rows, errors}. No code is copied from the reference; the parser
// below is my own.
//
// Speed comes from native scans instead of per-character loops:
//   - one regex finds the next quote, CR or LF, which settles whether the
//     record is clean; a clean record is split(',') in one go;
//   - unquoted fields jump to the next delimiter with one regex test;
//   - quoted fields jump to the next quote with indexOf, and a quoted
//     segment is sliced once and checked for line breaks inside that slice
//     (never an unbounded scan for a CR that may sit far away);
//   - regexes are driven with test(), whose match position is read back from
//     lastIndex, so no match array is allocated per step;
//   - field readers report through shared out-variables instead of a fresh
//     result object per field.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Next comma / LF / CR (unquoted-field delimiter). */
const reDelim = /[,\r\n]/g;
/** Next double quote / CR / LF (record boundary or dirt). */
const reRec = /["\r\n]/g;
/** A line break inside a quoted segment: CRLF, lone CR, or LF. */
const reBreak = /\r\n?|\n/g;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read, reported through these instead of a fresh object.
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  // The content of text[a..b), every CRLF or lone CR read as LF, counting the
  // line breaks it holds into `line`. The slice is taken first, so the checks
  // for a line break never scan past the segment.
  function segment(a, b) {
    const seg = text.slice(a, b);
    if (seg.indexOf('\r') === -1) {
      let n = seg.indexOf('\n');
      while (n !== -1) {
        line += 1;
        n = seg.indexOf('\n', n + 1);
      }
      return seg;
    }
    return seg.replace(reBreak, () => {
      line += 1;
      return '\n';
    });
  }

  // Reads unquoted characters onto `prefix` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Reports through fValue,
  // fEnded and fAdded (how many characters were kept).
  function readUnquoted(prefix) {
    fAdded = 0;
    let parts = null;
    let start = pos;
    reDelim.lastIndex = pos;
    for (;;) {
      if (!reDelim.test(text)) {
        const tail = text.slice(start);
        fAdded += tail.length;
        pos = len;
        fValue = parts === null ? (prefix === '' ? tail : prefix + tail) : prefix + parts.join('') + tail;
        fEnded = END;
        return;
      }
      const i = reDelim.lastIndex - 1;
      const c = text.charCodeAt(i);
      if (c === 44) {
        // ','
        const seg = text.slice(start, i);
        fAdded += seg.length;
        pos = i + 1;
        fValue = parts === null ? (prefix === '' ? seg : prefix + seg) : prefix + parts.join('') + seg;
        fEnded = COMMA;
        return;
      }
      if (c === 10) {
        // '\n'
        const seg = text.slice(start, i);
        fAdded += seg.length;
        pos = i + 1;
        line += 1;
        fValue = parts === null ? (prefix === '' ? seg : prefix + seg) : prefix + parts.join('') + seg;
        fEnded = LINE_BREAK;
        return;
      }
      // '\r'
      if (text.charCodeAt(i + 1) === 10) {
        const seg = text.slice(start, i);
        fAdded += seg.length;
        pos = i + 2;
        line += 1;
        fValue = parts === null ? (prefix === '' ? seg : prefix + seg) : prefix + parts.join('') + seg;
        fEnded = LINE_BREAK;
        return;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      const seg = text.slice(start, i);
      fAdded += seg.length;
      if (parts === null) parts = [seg];
      else parts.push(seg);
      start = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Reports through
  // fValue, fEnded and fAdded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let start = pos + 1;
    let parts = null;
    for (;;) {
      const q = text.indexOf('"', start);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // Doubled quote inside: one literal quote.
        if (parts === null) parts = [];
        parts.push(segment(start, q));
        parts.push('"');
        start = q + 2;
        continue;
      }
      const last = segment(start, q);
      const value = parts === null ? last : parts.join('') + last;
      const after = q + 1;
      if (after >= len) {
        pos = len;
        fValue = value;
        fEnded = END;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(after);
      if (c === 44) {
        pos = after + 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos = after + 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(after + 1) === 10) {
        pos = after + 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next
      // comma or line break.
      pos = after;
      readUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  // Applies a finished record to columns/rows, padding or cutting it to the
  // first record's width. Returns false when the record is no record at all.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return false;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return true;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
    return true;
  }

  for (;;) {
    // Lines left with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // One scan for the next quote, CR or LF settles the record: an LF, or a CR
    // followed by LF, ends a clean record (no quote and no stray CR in it),
    // which is one line split on commas. Anything else means the record is
    // dirty and is parsed field by field.
    reRec.lastIndex = pos;
    if (!reRec.test(text)) {
      // Nothing but plain text is left: one last clean record.
      finishRecord(text.slice(pos).split(','), false);
      break;
    }
    const i = reRec.lastIndex - 1;
    const c = text.charCodeAt(i);
    if (c === 10) {
      finishRecord(text.slice(pos, i).split(','), false);
      pos = i + 1;
      line += 1;
      continue;
    }
    if (c === 13 && text.charCodeAt(i + 1) === 10) {
      finishRecord(text.slice(pos, i).split(','), false);
      pos = i + 2;
      line += 1;
      continue;
    }

    // Slow path: parse the record field by field.
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
      ended = fEnded;
    } while (ended === COMMA);
    finishRecord(fields, quoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
