// Structural parser for emoji sequences: ZWJ sequences, flag sequences,
// keycap sequences and tag sequences (RGI-style grammar from the Unicode
// emoji spec), without depending on the full Unicode emoji-data tables.
// The set of recognized "emoji base" code points below is a curated
// subset of the common pictograph blocks, not the complete property --
// see README for what that means in practice.

const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const KEYCAP_TERMINATOR = 0x20e3;
const REGIONAL_INDICATOR_START = 0x1f1e6;
const REGIONAL_INDICATOR_END = 0x1f1ff;
const SKIN_TONE_START = 0x1f3fb;
const SKIN_TONE_END = 0x1f3ff;
const TAG_BASE = 0x1f3f4; // waving black flag, also the base of tag sequences
const TAG_CHAR_START = 0xe0020;
const TAG_CHAR_END = 0xe007a;
const TAG_TERMINATOR = 0xe007f;

const KEYCAP_BASES = new Set<number>([
  0x23, // #
  0x2a, // *
  0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, // 0-9
]);

// ISO 3166-1 alpha-2 country codes currently assigned. A flag sequence is
// two regional indicators spelling one of these; anything else (XX, ZZ,
// user-assigned ranges like AA/QM-QZ/XA-XZ/ZZ) renders as tofu or two
// boxed letters in real fonts, so it's treated as malformed rather than a
// valid flag.
const VALID_REGION_CODES = new Set<string>(
  (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
    'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
    'DE DJ DK DM DO DZ ' +
    'EC EE EG EH ER ES ET ' +
    'FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
    'HK HM HN HR HT HU ' +
    'ID IE IL IM IN IO IQ IR IS IT ' +
    'JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ ' +
    'LA LB LC LI LK LR LS LT LU LV LY ' +
    'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ ' +
    'OM ' +
    'PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
    'QA ' +
    'RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
    'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
    'UA UG UM US UY UZ ' +
    'VA VC VE VG VI VN VU ' +
    'WF WS ' +
    'YE YT ' +
    'ZA ZM ZW'
  ).split(' '),
);

function regionalIndicatorLetter(cp: number): string {
  return String.fromCharCode(cp - REGIONAL_INDICATOR_START + 0x41);
}

function isValidRegionPair(first: number, second: number): boolean {
  return VALID_REGION_CODES.has(regionalIndicatorLetter(first) + regionalIndicatorLetter(second));
}

const EMOJI_BASE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x2600, 0x27bf], // misc symbols and dingbats
  [0x1f300, 0x1f5ff], // misc symbols and pictographs
  [0x1f600, 0x1f64f], // emoticons
  [0x1f680, 0x1f6ff], // transport and map symbols
  [0x1f900, 0x1f9ff], // supplemental symbols and pictographs
  [0x1fa70, 0x1faff], // symbols and pictographs extended-a
];

function isRegionalIndicator(cp: number): boolean {
  return cp >= REGIONAL_INDICATOR_START && cp <= REGIONAL_INDICATOR_END;
}

function isSkinToneModifier(cp: number): boolean {
  return cp >= SKIN_TONE_START && cp <= SKIN_TONE_END;
}

function isKeycapBase(cp: number): boolean {
  return KEYCAP_BASES.has(cp);
}

function isTagChar(cp: number): boolean {
  return cp >= TAG_CHAR_START && cp <= TAG_CHAR_END;
}

function isEmojiBase(cp: number): boolean {
  if (cp === TAG_BASE) return true;
  for (const [start, end] of EMOJI_BASE_RANGES) {
    if (cp >= start && cp <= end) return true;
  }
  return false;
}

function isSequenceStarter(cp: number): boolean {
  return (
    isEmojiBase(cp) ||
    isRegionalIndicator(cp) ||
    isKeycapBase(cp) ||
    cp === ZWJ ||
    cp === VS16 ||
    isSkinToneModifier(cp)
  );
}

export type TokenKind =
  | 'text'
  | 'basic'
  | 'modifier'
  | 'flag'
  | 'keycap'
  | 'tag'
  | 'zwj'
  | 'malformed';

export interface EmojiToken {
  kind: TokenKind;
  text: string;
  codePoints: number[];
}

export interface ParseOptions {
  /**
   * When false (the default), any malformed sequence -- a lone regional
   * indicator, a dangling ZWJ, an unterminated tag sequence, a modifier
   * with no base -- throws EmojiSequenceError. When true, such sequences
   * are emitted as 'malformed' tokens instead of aborting the parse.
   */
  lenient?: boolean;
}

export class EmojiSequenceError extends Error {
  readonly index: number;

  constructor(message: string, index: number) {
    super(message);
    this.name = 'EmojiSequenceError';
    this.index = index;
  }
}

function makeToken(kind: TokenKind, chars: string[], start: number, end: number): EmojiToken {
  const slice = chars.slice(start, end);
  return {
    kind,
    text: slice.join(''),
    codePoints: slice.map((c) => c.codePointAt(0) as number),
  };
}

function mergeAdjacentText(tokens: EmojiToken[]): EmojiToken[] {
  const merged: EmojiToken[] = [];
  for (const token of tokens) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && prev.kind === 'text' && token.kind === 'text') {
      prev.text += token.text;
      prev.codePoints.push(...token.codePoints);
    } else {
      merged.push({ kind: token.kind, text: token.text, codePoints: [...token.codePoints] });
    }
  }
  return merged;
}

/**
 * Segments a string into emoji sequences and plain-text runs.
 * Splitting on code points (not UTF-16 code units) so surrogate pairs
 * stay intact; Array.from(string) already does this for us.
 */
export function parse(input: string, options: ParseOptions = {}): EmojiToken[] {
  const lenient = options.lenient ?? false;
  const chars = Array.from(input);
  const codePoints = chars.map((c) => c.codePointAt(0) as number);
  const n = codePoints.length;
  const tokens: EmojiToken[] = [];

  const fail = (message: string, index: number): never => {
    throw new EmojiSequenceError(message, index);
  };

  let i = 0;
  while (i < n) {
    const cp = codePoints[i] as number;

    // Tag sequence: black flag + one or more tag chars + terminator.
    if (cp === TAG_BASE && i + 1 < n && isTagChar(codePoints[i + 1] as number)) {
      let j = i + 1;
      while (j < n && isTagChar(codePoints[j] as number)) j++;
      if (j < n && codePoints[j] === TAG_TERMINATOR) {
        const end = j + 1;
        tokens.push(makeToken('tag', chars, i, end));
        i = end;
        continue;
      }
      if (!lenient) fail('emoji tag sequence is missing its terminator', i);
      tokens.push(makeToken('malformed', chars, i, j));
      i = j;
      continue;
    }

    // Flag sequence: exactly two regional indicators spelling a real
    // ISO 3166-1 region code.
    if (isRegionalIndicator(cp)) {
      const next = codePoints[i + 1];
      if (i + 1 < n && isRegionalIndicator(next as number)) {
        if (isValidRegionPair(cp, next as number)) {
          tokens.push(makeToken('flag', chars, i, i + 2));
          i += 2;
          continue;
        }
        const code = regionalIndicatorLetter(cp) + regionalIndicatorLetter(next as number);
        if (!lenient) fail(`"${code}" is not a real ISO region code`, i);
        tokens.push(makeToken('malformed', chars, i, i + 2));
        i += 2;
        continue;
      }
      if (!lenient) fail('lone regional indicator (incomplete flag sequence)', i);
      tokens.push(makeToken('malformed', chars, i, i + 1));
      i += 1;
      continue;
    }

    // Keycap sequence: digit/#/* + optional VS16 + combining keycap.
    if (isKeycapBase(cp)) {
      let j = i + 1;
      if (j < n && codePoints[j] === VS16) j++;
      if (j < n && codePoints[j] === KEYCAP_TERMINATOR) {
        const end = j + 1;
        tokens.push(makeToken('keycap', chars, i, end));
        i = end;
        continue;
      }
      // A bare digit, '#' or '*' with no keycap terminator is just text.
      tokens.push(makeToken('text', chars, i, i + 1));
      i += 1;
      continue;
    }

    // Basic emoji, possibly with a skin tone modifier and/or ZWJ joins.
    if (isEmojiBase(cp)) {
      const start = i;
      let j = i + 1;
      let hasZwj = false;
      let hasModifier = false;

      const consumeAdornment = () => {
        if (j < n && codePoints[j] === VS16) {
          j++;
        } else if (j < n && isSkinToneModifier(codePoints[j] as number)) {
          j++;
          hasModifier = true;
        }
      };
      consumeAdornment();

      while (j < n && codePoints[j] === ZWJ) {
        const zwjIndex = j;
        if (j + 1 < n && isEmojiBase(codePoints[j + 1] as number)) {
          hasZwj = true;
          j += 2;
          consumeAdornment();
        } else {
          if (!lenient) fail('zero width joiner not followed by an emoji', zwjIndex);
          break; // lenient: stop before the dangling joiner
        }
      }

      const kind: TokenKind = hasZwj ? 'zwj' : hasModifier ? 'modifier' : 'basic';
      tokens.push(makeToken(kind, chars, start, j));
      i = j;
      continue;
    }

    // A joiner, variation selector or skin tone modifier with no base.
    if (cp === ZWJ || cp === VS16 || isSkinToneModifier(cp)) {
      if (!lenient) fail('modifier or joiner with no preceding emoji', i);
      tokens.push(makeToken('malformed', chars, i, i + 1));
      i += 1;
      continue;
    }

    // Plain text run, up to the next code point that could start a sequence.
    let j = i + 1;
    while (j < n && !isSequenceStarter(codePoints[j] as number)) j++;
    tokens.push(makeToken('text', chars, i, j));
    i = j;
  }

  return mergeAdjacentText(tokens);
}

/** True if `input` parses without throwing under the given options. */
export function isValid(input: string, options: ParseOptions = {}): boolean {
  try {
    parse(input, options);
    return true;
  } catch (err) {
    if (err instanceof EmojiSequenceError) return false;
    throw err;
  }
}
