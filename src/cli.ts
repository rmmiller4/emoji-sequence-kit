#!/usr/bin/env node
import { parse, isValid, countGraphemes, EmojiSequenceError } from './sequences.js';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data.replace(/\n$/, '')));
    process.stdin.on('error', reject);
  });
}

function printUsage(): void {
  console.error(`usage: emoji-seq <command> [--lenient] [text]

commands:
  parse   segment text into emoji sequences and print them as json
  check   exit 0 if text is well-formed, 1 otherwise
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

  const text = rest.length > 0 ? rest.join(' ') : await readStdin();

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

  if (isValid(text, { lenient })) {
    console.log('ok');
  } else {
    console.error('invalid');
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
