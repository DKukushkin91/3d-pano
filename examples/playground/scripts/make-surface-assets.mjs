import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const SURFACES_FOLDER = new URL('../public/surfaces/', import.meta.url);
const SPOT_SIZE_PIXELS = 128;
const SPOT_RADIUS_PIXELS = 56;
const SPOT_BORDER_PIXELS = 10;
const CENTER = SPOT_SIZE_PIXELS / 2;

const FLOOR_SPOT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${SPOT_SIZE_PIXELS}" height="${SPOT_SIZE_PIXELS}">
  <circle cx="${CENTER}" cy="${CENTER}" r="${SPOT_RADIUS_PIXELS}" fill="#ffffff" stroke="#000000" stroke-width="${SPOT_BORDER_PIXELS}"/>
</svg>`;

const outputPath = fileURLToPath(new URL('floor-spot.png', SURFACES_FOLDER));

await mkdir(SURFACES_FOLDER, { recursive: true });
await sharp(Buffer.from(FLOOR_SPOT_SVG)).png({ compressionLevel: 9 }).toFile(outputPath);
process.stdout.write(`floor spot: ${outputPath}\n`);
