#!/usr/bin/env node
import { parse, isValid, countGraphemes, EmojiSequenceError } from './sequences.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Splits raw stdin into lines the way most line-oriented tools do: a
 * trailing newline at the very end doesn't produce a spurious empty last
 * line, but an empty file still yields one (empty) line to check.
 */
function splitLines(raw: string): string[] {
  const lines = raw.split(/\r\n|\r|\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function printUsage(): void {
  console.error(`usage: emoji-seq <command> [--lenient] [text]

commands:
  parse   segment text into emoji sequences and print them as json
  check   exit 0 if text is well-formed, 1 otherwise; reads multiple lines
          from stdin and checks each one independently
  count   print the number of perceived characters, counting each emoji
          sequence as one regardless of how many code points it uses

options:
  --lenient   accept malformed sequences instead of rejecting them

if no text is given as an argument, it is read from stdin.`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const lenient = args.includes('--lenient');
  const positional = args.filter((a) => a !== '--lenient');
  const command = positional[0];
  const rest = positional.slice(1);

  if (command !== 'parse' && command !== 'check' && command !== 'count') {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === 'check') {
    const lines = rest.length > 0 ? [rest.join(' ')] : splitLines(await readStdin());
    const multiLine = lines.length > 1;
    let allValid = true;
    for (const [index, line] of lines.entries()) {
      const prefix = multiLine ? `${index + 1}: ` : '';
      if (isValid(line, { lenient })) {
        console.log(`${prefix}ok`);
      } else {
        console.error(`${prefix}invalid`);
        allValid = false;
      }
    }
    if (!allValid) process.exitCode = 1;
    return;
  }

  const text = rest.length > 0 ? rest.join(' ') : (await readStdin()).replace(/\n$/, '');

  if (command === 'parse') {
    try {
      const tokens = parse(text, { lenient });
      console.log(JSON.stringify(tokens, null, 2));
    } catch (err) {
      if (err instanceof EmojiSequenceError) {
        console.error(`invalid sequence at position ${err.index}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    return;
  }

  if (command === 'count') {
    try {
      console.log(String(countGraphemes(text, { lenient })));
    } catch (err) {
      if (err instanceof EmojiSequenceError) {
        console.error(`invalid sequence at position ${err.index}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
      throw err;
    }
    return;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
