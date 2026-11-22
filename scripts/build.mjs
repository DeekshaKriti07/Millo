import {cp, mkdir, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const metadata = '.openai/hosting.json';
await rm('dist', {recursive:true, force:true});
await mkdir('dist/server', {recursive:true});
await mkdir('dist/.openai', {recursive:true});
await cp(metadata, 'dist/' + metadata);
const assetEntries = [];
for (const file of (await readdir('public', {recursive:true, withFileTypes:true})).filter(item => item.isFile())) {
  const path = join(file.parentPath, file.name);
  assetEntries.push(['/' + path.slice('public/'.length), (await readFile(path)).toString('base64')]);
}
const files = Object.fromEntries(assetEntries.sort(([a],[b]) => a.localeCompare(b)));
const catalog = (await readFile('public/catalog.js', 'utf8')).replace(/^import .*;\n/gm, '').replaceAll('export const ', 'const ');
const catalogData = (await readFile('public/catalog-data.js', 'utf8')).replace('export const catalog', 'const catalog');
const commerce = (await readFile('public/commerce.js', 'utf8')).replaceAll('export ', '');
const worker = (await readFile('server/worker.js', 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export function createHandler', 'function createHandler');
const handler = 'const assets = ' + JSON.stringify(files) +
  ';\nexport default createHandler(path => Object.hasOwn(assets,path) ? (Uint8Array.fromBase64 ? Uint8Array.fromBase64(assets[path]) : Uint8Array.from(atob(assets[path]), value => value.charCodeAt(0))) : null);\n';
await writeFile('dist/server/index.js', [catalogData, catalog, commerce, worker, handler].join('\n'));
console.log('Built Millo Worker with ' + assetEntries.length + ' storefront assets.');
