import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandalone } from './standalone.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, 'dist');
const files = [
  'index.html',
  'src',
  'assets/Aeonik Pro TRIAL/AeonikProTRIAL-Regular.otf',
  'assets/Signifier/Signifier-Light.ttf',
  'assets/brand-palette.svg',
  'assets/phosphor-LICENSE',
  'assets/examples',
];

// Check inputs before replacing an existing successful build.
for (const file of files) await stat(resolve(root, file));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  await cp(resolve(root, file), target, {
    recursive: true,
    filter: source => !source.split('/').at(-1).startsWith('.'),
  });
}
await writeFile(resolve(output, '.nojekyll'), '');
await buildStandalone(root, output);
console.log('Built dist/ and portable dist/OI-KV-Studio.html. Ready to serve or open directly.');
