/**
 * ASCII-ONLY JSON — the one writer every emitter in this pass goes through.
 *
 * A PORTABILITY FIX, NOT A STYLE CHOICE, and it was measured rather than anticipated. The Python
 * composers downstream open their inputs with `open(path)` and no explicit encoding, which on
 * Windows resolves to cp1252. A single non-ASCII character anywhere in the document — an em-dash in
 * a story title, the `✓` in a verdict glyph — then raises
 *
 *     UnicodeDecodeError: 'charmap' codec can't decode byte 0x90 in position 3244
 *
 * from a line that has nothing to do with encoding, in a file whose name does not appear in the
 * traceback. Escaping to `\uXXXX` keeps the document valid JSON and identical in meaning (Python's
 * `json.load` decodes the escapes straight back to the same characters), and makes it readable under
 * any platform default.
 *
 * IT LIVES IN ITS OWN MODULE BECAUSE THIS PASS'S WHOLE COMPLAINT IS ABOUT SECOND COPIES. Three
 * emitters need it; three copies of a six-line helper is the same class of thing as the three copies
 * of the 700-line compositor this arc's research directories have accumulated, only smaller and
 * therefore easier to let happen.
 */
export const asciiJson = (v: unknown): string =>
  JSON.stringify(v, null, 1).replace(
    /[^\x00-\x7F]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
