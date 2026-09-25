# emoji-sequence-kit

Most emoji you see are not one code point. The family emoji is four people
joined by zero-width joiners. A flag is two regional indicator letters. A
keycap like 1️⃣ is a digit, a variation selector, and a combining keycap
character stacked on top of each other. Code that slices strings by
`.length` or splits on `[...str]` without knowing this will happily cut a
sequence in half and produce something that renders as tofu or as two
unrelated emoji side by side.

This is a small library (plus a CLI) that segments a string into emoji
sequences and plain text, and checks whether each sequence is well-formed
according to the grammar in the Unicode emoji spec: basic emoji, emoji
modifier sequences (skin tones), flag sequences, keycap sequences, tag
sequences (used for the England/Scotland/Wales flags), and ZWJ sequences.

It is strict by default: a lone regional indicator, a ZWJ with nothing
after it, an unterminated tag sequence, or a skin tone modifier with no
base all throw. Pass `--lenient` (CLI) or `{ lenient: true }` (library) to
get best-effort segmentation instead of an error, which is useful when
you're cleaning up text from the wild rather than validating input you
control.

## What this does not do yet

The base-emoji classifier uses a curated set of Unicode block ranges
(emoticons, transport, dingbats, and so on), not the full `emoji-data.txt`
property table, so some valid emoji outside those blocks won't be
recognized as sequence starters. See the roadmap below.

Flag sequences, on the other hand, are checked against the real list of
ISO 3166-1 alpha-2 country codes: two regional indicators that don't spell
an assigned code (like the user-assigned `XX`) are rejected as malformed,
the same as a lone regional indicator.

## Library usage

```ts
import { parse, isValid, EmojiSequenceError } from './src/sequences.js';

// family: man + ZWJ + woman + ZWJ + girl + ZWJ + boy
const family = '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}';
parse(family);
// [{ kind: 'zwj', text: '👨‍👩‍👧‍👦', codePoints: [128104, 8205, 128105, ...] }]

// flag: two regional indicators spelling "GB"
parse('\u{1F1EC}\u{1F1E7}');
// [{ kind: 'flag', text: '🇬🇧', codePoints: [127468, 127463] }]

// keycap: '1' + VS16 + combining keycap
parse('1️⃣');
// [{ kind: 'keycap', text: '1️⃣', codePoints: [49, 65039, 8419] }]

// thumbs up with a skin tone modifier
parse('\u{1F44D}\u{1F3FD}');
// [{ kind: 'modifier', text: '👍🏽', codePoints: [128077, 127997] }]

// malformed: a ZWJ with nothing after it
isValid('\u{1F468}‍'); // false, strict by default
isValid('\u{1F468}‍', { lenient: true }); // true

// grapheme-aware counting: the family emoji is 7 code points but reads
// as one character
countGraphemes(family); // 1
countGraphemes(`hi ${family}`); // 4

try {
  parse('\u{1F468}‍');
} catch (err) {
  if (err instanceof EmojiSequenceError) {
    console.log(err.index, err.message);
    // 2 'zero width joiner not followed by an emoji'
  }
}
```

## CLI usage

```
$ node dist/cli.js parse "👨‍👩‍👧‍👦 hello 🇬🇧"
[
  { "kind": "zwj", "text": "👨‍👩‍👧‍👦", "codePoints": [128104, 8205, ...] },
  { "kind": "text", "text": " hello ", "codePoints": [32, 104, ...] },
  { "kind": "flag", "text": "🇬🇧", "codePoints": [127468, 127463] }
]

$ node dist/cli.js check "👍🏽"
ok

$ echo -n "👨‍" | node dist/cli.js check
invalid

$ echo -n "👨‍" | node dist/cli.js check --lenient
ok

$ node dist/cli.js count "👨‍👩‍👧‍👦 hi"
4
```

Text is taken from the trailing arguments if any are given, otherwise it
is read from stdin. `check` treats stdin specially when there is more than
one line: each line is validated on its own, printed as `N: ok` or
`N: invalid`, and the exit code is 1 if any line fails.

```
$ printf '👍🏽\n👨‍\n🇬🇧\n' | node dist/cli.js check
1: ok
2: invalid
3: ok
```

## Building

There are no runtime dependencies. Compile with the TypeScript compiler:

```
tsc -p .
```

## Testing

Tests use Node's built-in test runner, so there is nothing extra to
install:

```
npm test
```

This compiles to `dist` and runs `node --test` against it.

## Roadmap

See the commit history and issues for what's planned next; the short
version is filling out the emoji base classifier from the real Unicode
data tables instead of the curated block ranges above.

## License

MIT, see LICENSE.
