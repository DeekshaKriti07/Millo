import {readFile,writeFile,access} from 'node:fs/promises';
import {scoreProduct} from '../public/scoring.js';
import {aisles} from '../public/catalog.js';

const sources = process.argv.slice(2);
if (!sources.length) throw new Error('Pass the reviewed catalogue snapshots.');
const snapshots = await Promise.all(sources.map(async path=>JSON.parse(await readFile(path,'utf8'))));
const prices = {snacks:119,protein:189,breakfast:229,nuts:179,dairy:125,drinks:99,fruit:95,vegetables:65,staples:139,spreads:239};
const featured = ['snacks','fruit','protein','vegetables','breakfast','drinks','staples','spreads','nuts','dairy'];
const items = snapshots.flat().map(item=>{
  const score=scoreProduct(item);
  const price=prices[item.aisle];
  if (!Number.isFinite(price)) throw new Error('Missing demo price for '+item.aisle);
  return {...item,price,priceType:'demo',availability:score.qualified ? 'demo' : null,score};
});
if (new Set(items.map(item=>item.id)).size !== items.length) throw new Error('Duplicate product identifier');
for (const item of items) {
  if (item.image) await access('public' + item.image);
}
const buckets=featured.map(aisle=>items.filter(item=>item.aisle===aisle)
  .sort((a,b)=>Number(b.score.qualified===true)-Number(a.score.qualified===true)));
const sorted=[];
for(let i=0;i<Math.max(...buckets.map(list=>list.length));i++){
  for(const list of buckets) if(list[i]) sorted.push(list[i]);
}
await writeFile('public/catalog-data.js','export const catalog = '+JSON.stringify(sorted)+';\n');
console.log(aisles.map(a=>a.id+' '+sorted.filter(x=>x.aisle===a.id).length+'/'+a.target).join(', '));
console.log(sorted.length+' products, '+sorted.filter(x=>x.score.qualified).length+' qualify for demo checkout');
