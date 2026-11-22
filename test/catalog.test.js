import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import {test} from 'node:test';
import {aisles,products} from '../public/catalog.js';
import {scoreProduct} from '../public/scoring.js';
import {createHandler} from '../server/worker.js';

test('catalogue meets each aisle target and every displayed image has a source',async()=>{
  assert.equal(products.length,170);
  assert.equal(new Set(products.map(item=>item.id)).size,170);
  for (const aisle of aisles) {
    assert.equal(products.filter(item=>item.aisle===aisle.id).length,aisle.target,aisle.name);
  }
  for(const item of products){
    if (item.image) {
      await access(new URL('../public'+item.image,import.meta.url));
      assert.match(item.image,/^\/assets\/products\/.*-photo\.webp$/);
      assert.match(item.frontSource,/^https:\/\//);
      assert.match(item.photoAssetSource,/^https:\/\//);
    } else {
      assert.equal(item.frontSource,null);
    }
    assert.match(item.source,/^https:\/\//);
    assert.deepEqual(item.score,scoreProduct(item));
    assert.ok(Number.isFinite(item.price) && item.price > 0);
    assert.equal(item.priceType,'demo');
    assert.equal(item.availability==='demo',item.score.qualified===true);
  }
});

test('score weights react to aisle while missing added sugar remains unknown',()=>{
  const item={basis:'100 ml',ingredients:'Water',nova:1,nutrition:{protein:5,fibre:2,addedSugar:0,saturatedFat:0,sodium:0}};
  assert.equal(scoreProduct({...item,aisle:'drinks'}).value,100);
  assert.ok(scoreProduct({...item,aisle:'snacks'}).value<100);
  const missing=scoreProduct({...item,aisle:'drinks',nutrition:{...item.nutrition,addedSugar:null,totalSugar:0}});
  assert.equal(missing.value,null);
  assert.equal(missing.qualified,null);
  assert.equal(missing.evidence,80);
});

test('intro can be read with media range requests',async()=>{
  const worker=createHandler(()=>new Uint8Array([1,2,3,4,5]));
  const url='https://millo.example/assets/millo-cartoon.mp4';
  const response=await worker.fetch(new Request(url,{headers:{Range:'bytes=1-3'}}));
  assert.equal(response.status,206);
  assert.equal(response.headers.get('Content-Range'),'bytes 1-3/5');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[2,3,4]);
});
