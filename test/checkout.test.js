import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {products} from '../public/catalog.js';
import {createHandler} from '../server/worker.js';

test('checkout recomputes prices and records each checkout key once', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(await readFile(new URL('../drizzle/0000_orders.sql', import.meta.url), 'utf8'));
    const DB = {prepare: sql => ({bind: (...args) => ({
      run: () => database.prepare(sql).run(...args),
      first: () => database.prepare(sql).get(...args)
    })})};
    const worker = createHandler(() => null);
    const key = crypto.randomUUID();
    const draft = {
      name:'Millo Demo', phone:'9000000000', address:'12 Market Lane', pin:'560001',
      payment:'demo-cod', items:[{id:'fresh-broccoli', quantity:2, price:1}]
    };
    const submit = (payload, idempotencyKey = key) => worker.fetch(new Request('https://millo.example/api/orders', {
      method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':idempotencyKey}, body:JSON.stringify(payload)
    }), {DB});

    const [first, replay] = await Promise.all([submit(draft), submit(draft)]);
    assert.deepEqual([first.status, replay.status].sort(), [200, 201]);
    const {order} = await first.json();
    assert.equal(order.total, 165);
    assert.deepEqual(await replay.json(), {order});
    assert.equal((await submit({...draft, items:[{id:'fresh-avocado', quantity:1}]})).status, 409);
    assert.equal((await submit({...draft, items:[{id:'fresh-broccoli', quantity:16}]}, crypto.randomUUID())).status, 400);
    const browseOnly = products.find(item=>item.score.qualified !== true);
    assert.equal((await submit({...draft,items:[{id:browseOnly.id,quantity:1}]},crypto.randomUUID())).status,400);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM orders').get().count, 1);
  } finally {
    database.close();
  }
});
