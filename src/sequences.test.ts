import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, isValid, countGraphemes, EmojiSequenceError, type EmojiToken } from './sequences.js';

function cp(...points: number[]): string {
  return String.fromCodePoint(...points);
}

function kinds(tokens: EmojiToken[]): string[] {
  return tokens.map((t) => t.kind);
}

test('basic emoji with no adornment', () => {
  const grinning = cp(0x1f600);
  const tokens = parse(grinning);
  assert.deepEqual(kinds(tokens), ['basic']);
  assert.equal(tokens[0]?.text, grinning);
});

test('emoji modifier sequence (skin tone)', () => {
  const thumbsUpMedium = cp(0x1f44d, 0x1f3fd);
  const tokens = parse(thumbsUpMedium);
  assert.deepEqual(kinds(tokens), ['modifier']);
  assert.deepEqual(tokens[0]?.codePoints, [0x1f44d, 0x1f3fd]);
});

test('flag sequence from two regional indicators', () => {
  const gb = cp(0x1f1ec, 0x1f1e7); // G, B
  const tokens = parse(gb);
  assert.deepEqual(kinds(tokens), ['flag']);
  assert.equal(tokens[0]?.text, gb);
});

test('keycap sequence with variation selector', () => {
  const one = cp(0x31, 0xfe0f, 0x20e3);
  const tokens = parse(one);
  assert.deepEqual(kinds(tokens), ['keycap']);
  assert.deepEqual(tokens[0]?.codePoints, [0x31, 0xfe0f, 0x20e3]);
});

test('keycap sequence without variation selector', () => {
  const hash = cp(0x23, 0x20e3);
  const tokens = parse(hash);
  assert.deepEqual(kinds(tokens), ['keycap']);
});

test('bare digit with no keycap terminator is plain text', () => {
  const tokens = parse('7');
  assert.deepEqual(kinds(tokens), ['text']);
  assert.equal(tokens[0]?.text, '7');
});

test('tag sequence for a subdivision flag', () => {
  // black flag + tag letters for "gbeng" + tag terminator
  const englandFlag = cp(0x1f3f4, 0xe0067, 0xe0062, 0xe0065, 0xe006e, 0xe0067, 0xe007f);
  const tokens = parse(englandFlag);
  assert.deepEqual(kinds(tokens), ['tag']);
  assert.equal(tokens[0]?.text, englandFlag);
});

test('zwj sequence joining multiple emoji', () => {
  const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466);
  const tokens = parse(family);
  assert.deepEqual(kinds(tokens), ['zwj']);
  assert.equal(tokens[0]?.text, family);
});

test('zwj sequence with a modifier on one of the joined members', () => {
  const holdingHands = cp(0x1f9d1, 0x1f3fb, 0x200d, 0x1f91d, 0x200d, 0x1f9d1, 0x1f3fd);
  const tokens = parse(holdingHands);
  assert.deepEqual(kinds(tokens), ['zwj']);
});

test('plain text runs are merged across gaps', () => {
  const tokens = parse('hi there');
  assert.deepEqual(kinds(tokens), ['text']);
  assert.equal(tokens[0]?.text, 'hi there');
});

test('text and emoji interleave into separate tokens', () => {
  const input = `hello ${cp(0x1f600)} world`;
  const tokens = parse(input);
  assert.deepEqual(kinds(tokens), ['text', 'basic', 'text']);
});

test('regional indicator pair spelling a non-country code throws by default', () => {
  // X and X: XX is in the user-assigned range, not a real ISO code.
  assert.throws(() => parse(cp(0x1f1fd, 0x1f1fd)), EmojiSequenceError);
});

test('regional indicator pair spelling a non-country code is malformed in lenient mode', () => {
  const tokens = parse(cp(0x1f1fd, 0x1f1fd), { lenient: true });
  assert.deepEqual(kinds(tokens), ['malformed']);
});

test('lone regional indicator throws by default', () => {
  assert.throws(() => parse(cp(0x1f1ec)), EmojiSequenceError);
});

test('lone regional indicator is malformed in lenient mode', () => {
  const tokens = parse(cp(0x1f1ec), { lenient: true });
  assert.deepEqual(kinds(tokens), ['malformed']);
});

test('dangling zwj throws by default', () => {
  assert.throws(() => parse(cp(0x1f468, 0x200d)), EmojiSequenceError);
});

test('dangling zwj yields the base token in lenient mode', () => {
  const tokens = parse(cp(0x1f468, 0x200d), { lenient: true });
  assert.deepEqual(kinds(tokens), ['basic']);
  assert.equal(tokens[0]?.text, cp(0x1f468));
});

test('unterminated tag sequence throws by default', () => {
  assert.throws(() => parse(cp(0x1f3f4, 0xe0067, 0xe0062)), EmojiSequenceError);
});

test('unterminated tag sequence is malformed in lenient mode', () => {
  const tokens = parse(cp(0x1f3f4, 0xe0067, 0xe0062), { lenient: true });
  assert.deepEqual(kinds(tokens), ['malformed']);
});

test('skin tone modifier with no base throws by default', () => {
  assert.throws(() => parse(cp(0x1f3fb)), EmojiSequenceError);
});

test('skin tone modifier with no base is malformed in lenient mode', () => {
  const tokens = parse(cp(0x1f3fb), { lenient: true });
  assert.deepEqual(kinds(tokens), ['malformed']);
});

test('isValid mirrors parse without throwing', () => {
  assert.equal(isValid(cp(0x1f600)), true);
  assert.equal(isValid(cp(0x1f1ec)), false);
  assert.equal(isValid(cp(0x1f1ec), { lenient: true }), true);
});

test('countGraphemes counts a ZWJ family sequence as one character', () => {
  const family = cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466);
  assert.equal(countGraphemes(family), 1);
});

test('countGraphemes counts a flag sequence as one character', () => {
  assert.equal(countGraphemes(cp(0x1f1ec, 0x1f1e7)), 1);
});

test('countGraphemes counts a keycap sequence as one character', () => {
  assert.equal(countGraphemes(cp(0x31, 0xfe0f, 0x20e3)), 1);
});

test('countGraphemes counts plain text by code point', () => {
  assert.equal(countGraphemes('hi'), 2);
});

test('countGraphemes mixes text and emoji correctly', () => {
  const input = `hi ${cp(0x1f600)}`;
  assert.equal(countGraphemes(input), 4);
});

test('countGraphemes counts malformed sequences as one character in lenient mode', () => {
  assert.equal(countGraphemes(cp(0x1f1ec), { lenient: true }), 1);
});

test('countGraphemes throws by default on malformed input', () => {
  assert.throws(() => countGraphemes(cp(0x1f1ec)), EmojiSequenceError);
});

test('EmojiSequenceError reports the index of the failure', () => {
  try {
    parse(`ok ${cp(0x1f468, 0x200d)}`);
    assert.fail('expected parse to throw');
  } catch (err) {
    assert.ok(err instanceof EmojiSequenceError);
    assert.equal(err.index, 4);
  }
});
