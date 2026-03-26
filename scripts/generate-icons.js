import sharp from 'sharp';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(__dirname, '../public/favicon.svg');
const outDir = resolve(__dirname, '../public');

const svg = readFileSync(svgPath);

// Add padding and dark background for app icon appearance
function createIconSvg(size) {
  const padding = Math.round(size * 0.15);
  const innerSize = size - padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="#1e1e2e"/>
    <g transform="translate(${padding}, ${padding})">
      <svg width="${innerSize}" height="${innerSize}" viewBox="0 0 48 46">${svg.toString().replace(/<\?xml[^?]*\?>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}</svg>
    </g>
  </svg>`;
}

const sizes = [
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'apple-touch-icon-180x180.png', size: 180 },
];

for (const { name, size } of sizes) {
  const iconSvg = createIconSvg(size);
  await sharp(Buffer.from(iconSvg))
    .resize(size, size)
    .png()
    .toFile(resolve(outDir, name));
  console.log(`Generated ${name}`);
}

console.log('Done!');
