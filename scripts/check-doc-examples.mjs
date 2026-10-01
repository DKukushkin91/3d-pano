import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const DOCUMENTS = [
  'README.md',
  ...readdirSync('docs')
    .filter((name) => name.endsWith('.md'))
    .map((name) => join('docs', name)),
];
const SNIPPETS_FOLDER = 'examples/doc-snippets/snippets';
const CODE_BLOCK = /^```(ts|tsx|typescript)\n([\s\S]*?)^```/gm;
const MODULE_SYNTAX = /^\s*(?:import|export)\s/m;

const lineOf = (text, offset) => text.slice(0, offset).split('\n').length;

const snippetName = (documentPath, line) =>
  `${basename(documentPath, '.md').toLowerCase()}-line-${String(line)}.tsx`;

const extractSnippets = (documentPath) => {
  const text = readFileSync(documentPath, 'utf8');

  return [...text.matchAll(CODE_BLOCK)].map((match) => ({
    name: snippetName(documentPath, lineOf(text, match.index ?? 0) + 1),
    code: match[2] ?? '',
  }));
};

const asModule = (code) => (MODULE_SYNTAX.test(code) ? code : `${code}\nexport {};\n`);

rmSync(SNIPPETS_FOLDER, { recursive: true, force: true });
mkdirSync(SNIPPETS_FOLDER, { recursive: true });

const snippets = DOCUMENTS.flatMap(extractSnippets);

for (const { name, code } of snippets) {
  writeFileSync(join(SNIPPETS_FOLDER, name), asModule(code));
}

try {
  execFileSync('pnpm', ['--filter', './examples/doc-snippets', 'typecheck'], { stdio: 'inherit' });
} catch {
  process.stderr.write(
    `Documentation examples do not compile. The file name points to the document and the line where the example starts (${SNIPPETS_FOLDER}).\n`,
  );
  process.exit(1);
}

process.stdout.write(`${String(snippets.length)} documentation examples compile\n`);
