// Packs web/dist/ into one self-contained page (web/artifact/index.html) for sharing as a single link.
// JS and CSS are inlined; PWA links are dropped because a shared page cannot install itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('web/dist/index.html', 'utf8');
const read = p => readFileSync('web/dist/' + p.replace(/^\.\//, ''), 'utf8');

const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+\.css)"[^>]*>/g)].map(m => read(m[1]));
const js = [...html.matchAll(/<script type="module"[^>]*src="(\.\/assets\/[^"]+\.js)"[^>]*><\/script>/g)].map(m => read(m[1]));
if (!css.length || !js.length) throw new Error('Could not find built assets in web/dist/index.html');

const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
const title = html.match(/<title>[^<]*<\/title>/)[0];
const desc = html.match(/<meta name="description"[^>]*>/)[0];

const page = [
  title,
  desc,
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  fonts,
  `<style>${css.join('\n')}</style>`,
  '<div id="root"></div>',
  `<script type="module">${js.join('\n').replace(/<\/script/gi, '<\\/script')}</script>`,
].join('\n');

mkdirSync('web/artifact', { recursive: true });
writeFileSync('web/artifact/index.html', page);
console.log(`web/artifact/index.html written (${(page.length / 1024).toFixed(0)} KB)`);
