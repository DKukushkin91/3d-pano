import { mkdir } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { CUBE_FACES, directionFromCubeFace, equirectFromDirection } from '../../../dist/internal.js';

const LOCAL_FOLDER = new URL('../public/local/', import.meta.url);
const DEFAULT_FACE_SIZE = 2048;
const PREVIEW_WIDTH = 1024;
const JPEG_QUALITY = 85;
const CHANNELS = 3;
const NEOMETRIA_FACE_NAMES = { front: 'f', right: 'r', back: 'b', left: 'l', up: 'u', down: 'd' };
const TILES_FLAG = '--tiles';
const TILE_SIZE = 512;
const TILE_LEVELS = [512, 1024, 2048, 4096];

const readEquirect = async (path) => {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  return { pixels: data, width: info.width, height: info.height };
};

const pixelOffset = (image, column, row) => (row * image.width + column) * CHANNELS;

const wrapColumn = (image, column) => ((column % image.width) + image.width) % image.width;

const clampRow = (image, row) => Math.min(Math.max(row, 0), image.height - 1);

const sampleBilinear = (image, horizontal, vertical, target, targetOffset) => {
  const imageX = horizontal * image.width - 0.5;
  const imageY = vertical * image.height - 0.5;
  const left = Math.floor(imageX);
  const top = Math.floor(imageY);
  const weightX = imageX - left;
  const weightY = imageY - top;
  const corners = [
    [pixelOffset(image, wrapColumn(image, left), clampRow(image, top)), (1 - weightX) * (1 - weightY)],
    [pixelOffset(image, wrapColumn(image, left + 1), clampRow(image, top)), weightX * (1 - weightY)],
    [pixelOffset(image, wrapColumn(image, left), clampRow(image, top + 1)), (1 - weightX) * weightY],
    [pixelOffset(image, wrapColumn(image, left + 1), clampRow(image, top + 1)), weightX * weightY],
  ];

  for (let channel = 0; channel < CHANNELS; channel += 1) {
    const value = corners.reduce((sum, [offset, weight]) => sum + image.pixels[offset + channel] * weight, 0);

    target[targetOffset + channel] = Math.round(value);
  }
};

const renderFace = (image, face, faceSize) => {
  const pixels = Buffer.alloc(faceSize * faceSize * CHANNELS);

  for (let row = 0; row < faceSize; row += 1) {
    for (let column = 0; column < faceSize; column += 1) {
      const across = (2 * (column + 0.5)) / faceSize - 1;
      const down = (2 * (row + 0.5)) / faceSize - 1;
      const point = equirectFromDirection(directionFromCubeFace({ face, s: across, t: down }));

      sampleBilinear(image, point.u, point.v, pixels, (row * faceSize + column) * CHANNELS);
    }
  }

  return pixels;
};

const writeJpeg = (pixels, width, height, path) =>
  sharp(pixels, { raw: { width, height, channels: CHANNELS } })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(path);

const makeCubeFaces = async (fileName, faceSize) => {
  const sourcePath = fileURLToPath(new URL(fileName, LOCAL_FOLDER));
  const name = basename(fileName, extname(fileName));
  const cubeFolder = new URL(`cube/${name}/`, LOCAL_FOLDER);
  const image = await readEquirect(sourcePath);

  await mkdir(cubeFolder, { recursive: true });
  await Promise.all(
    CUBE_FACES.map((face) =>
      writeJpeg(
        renderFace(image, face, faceSize),
        faceSize,
        faceSize,
        fileURLToPath(new URL(`${NEOMETRIA_FACE_NAMES[face]}.jpg`, cubeFolder)),
      ),
    ),
  );
  await sharp(sourcePath)
    .resize(PREVIEW_WIDTH, PREVIEW_WIDTH / 2)
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(fileURLToPath(new URL(`${name}-preview.jpg`, LOCAL_FOLDER)));

  process.stdout.write(
    `cube faces ${String(faceSize)}px → public/local/cube/${name}/, preview → public/local/${name}-preview.jpg\n`,
  );
};

const rawImage = (pixels, size) => sharp(pixels, { raw: { width: size, height: size, channels: CHANNELS } });

const tilePositions = (tilesPerSide) =>
  Array.from({ length: tilesPerSide * tilesPerSide }, (_unused, index) => ({
    row: Math.floor(index / tilesPerSide),
    column: index % tilesPerSide,
  }));

const writeLevelTiles = async (levelPixels, levelSize, folder) => {
  const tileSize = Math.min(levelSize, TILE_SIZE);

  await mkdir(folder, { recursive: true });
  await Promise.all(
    tilePositions(levelSize / tileSize).map(({ row, column }) =>
      rawImage(levelPixels, levelSize)
        .extract({ left: column * tileSize, top: row * tileSize, width: tileSize, height: tileSize })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(fileURLToPath(new URL(`${String(row)}_${String(column)}.jpg`, folder))),
    ),
  );
};

const makeFaceTiles = async (image, face, tilesFolder) => {
  const largestSize = TILE_LEVELS.at(-1);
  const facePixels = renderFace(image, face, largestSize);

  await Promise.all(
    TILE_LEVELS.map(async (levelSize, level) => {
      const levelPixels = await rawImage(facePixels, largestSize)
        .resize(levelSize, levelSize, { kernel: 'lanczos3' })
        .raw()
        .toBuffer();

      await writeLevelTiles(
        levelPixels,
        levelSize,
        new URL(`${String(level)}/${NEOMETRIA_FACE_NAMES[face]}/`, tilesFolder),
      );
    }),
  );
  process.stdout.write(`face ${face} done\n`);
};

/**
 * Тайловый куб в формате библиотеки: грань считается один раз в самом подробном размере, уровни — её
 * уменьшения, нарезанные квадратами `TILE_SIZE` в папки `{level}/{face}/{row}_{col}.jpg`. Грани идут по
 * очереди, чтобы в памяти была одна большая грань.
 */
const makeCubeTiles = async (fileName) => {
  const sourcePath = fileURLToPath(new URL(fileName, LOCAL_FOLDER));
  const name = basename(fileName, extname(fileName));
  const tilesFolder = new URL(`tiles/${name}/`, LOCAL_FOLDER);
  const image = await readEquirect(sourcePath);

  await CUBE_FACES.reduce(
    (previous, face) => previous.then(() => makeFaceTiles(image, face, tilesFolder)),
    Promise.resolve(),
  );
  process.stdout.write(
    `tiles ${TILE_LEVELS.join(', ')} by ${String(TILE_SIZE)}px → public/local/tiles/${name}/\n`,
  );
};

const [fileName, modeArgument] = process.argv.slice(2);

if (fileName === undefined) {
  process.stderr.write(
    `usage: node scripts/make-cube-faces.mjs <equirect file in public/local> [face size | ${TILES_FLAG}]\n`,
  );
  process.exit(1);
}

if (modeArgument === TILES_FLAG) {
  await makeCubeTiles(fileName);
} else {
  await makeCubeFaces(fileName, Number(modeArgument ?? DEFAULT_FACE_SIZE));
}
