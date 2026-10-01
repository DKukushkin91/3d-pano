import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_LIST_PATH = 'scripts/clean-room.local.json';
const SOURCE_ROOTS = ['src', 'examples/playground/src'];
const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs|js|jsx|css|html)$/;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);
const ENGINE_FILE_EXTENSIONS = '(?:js|swf|xml)';

const escapeForPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readLocalList = () => {
  if (!existsSync(LOCAL_LIST_PATH)) {
    process.stdout.write(`check:clean-room: ${LOCAL_LIST_PATH} not found, skipped\n`);
    process.exit(0);
  }

  const { foreignApiNames = [], engineFilePrefixes = [] } = JSON.parse(readFileSync(LOCAL_LIST_PATH, 'utf8'));

  return { foreignApiNames, engineFilePrefixes };
};

const collectSourceFiles = (directory) => {
  let entries;

  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : collectSourceFiles(entryPath);
    }

    return SOURCE_FILE.test(entry.name) ? [entryPath] : [];
  });
};

const findTrackedEngineFiles = (engineFilePrefixes) => {
  if (engineFilePrefixes.length === 0) {
    return [];
  }

  const prefixes = engineFilePrefixes.map(escapeForPattern).join('|');
  const engineFile = new RegExp(`(?:^|/)(?:${prefixes})[^/]*\\.${ENGINE_FILE_EXTENSIONS}$`, 'i');
  const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');

  return trackedFiles
    .filter((filePath) => engineFile.test(filePath))
    .map((filePath) => `${filePath} — a proprietary engine file must never be committed`);
};

const findForeignApiNames = (foreignApiNames) => {
  if (foreignApiNames.length === 0) {
    return () => [];
  }

  const foreignApiPattern = new RegExp(`\\b(?:${foreignApiNames.map(escapeForPattern).join('|')})\\b`, 'i');

  return (filePath) =>
    readFileSync(filePath, 'utf8')
      .split('\n')
      .flatMap((line, index) => {
        const match = foreignApiPattern.exec(line);

        return match === null
          ? []
          : [`${filePath}:${String(index + 1)} — "${match[0]}" belongs to a foreign API, use our own naming`];
      });
};

const { foreignApiNames, engineFilePrefixes } = readLocalList();
const violations = [
  ...findTrackedEngineFiles(engineFilePrefixes),
  ...SOURCE_ROOTS.flatMap(collectSourceFiles).flatMap(findForeignApiNames(foreignApiNames)),
];

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exit(1);
}
