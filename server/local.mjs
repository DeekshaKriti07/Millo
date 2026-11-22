import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {readFile, mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHandler} from './worker.js';

const dataDirectory = new URL('../.data/', import.meta.url);
const publicDirectory = new URL('../public/', import.meta.url);
await mkdir(dataDirectory, {recursive:true});
const sqlite = new DatabaseSync(new URL('millo.sqlite', dataDirectory));
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec(await readFile(new URL('../drizzle/0000_orders.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const prepared = sqlite.prepare(sql);
    return {
      bind(...values) {
        return {
          run: () => prepared.run(...values),
          first: () => prepared.get(...values) ?? null
        };
      },
      first: () => prepared.get() ?? null
    };
  }
};

const worker = createHandler(async path => {
  if (!/^\/(?:assets\/(?:products\/)?)?[a-z0-9-]+\.[a-z0-9]+$/.test(path)) return null;
  try { return await readFile(new URL(path.slice(1), publicDirectory)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = Number((portIndex >= 0 ? args[portIndex + 1] : process.env.PORT) || 3000);
const host = process.env.MILLO_HOST || '0.0.0.0';
createServer(async (incoming, outgoing) => {
  try {
    const method = incoming.method;
    const body = method === 'GET' || method === 'HEAD' ? undefined : Readable.toWeb(incoming);
    const url = new URL('http://' + (incoming.headers.host || 'localhost'));
    url.pathname = incoming.url.split('?')[0];
    const origin = incoming.headers.origin;
    if (origin && new URL(origin).host === url.host) url.protocol = new URL(origin).protocol;
    const request = new Request(url, {method, headers:incoming.headers, body, duplex:body ? 'half' : undefined});
    const response = await worker.fetch(request, {DB});
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500, {'Content-Type':'text/plain'});
    outgoing.end('Internal server error');
  }
}).listen(port, host, () => console.log('Millo listening at http://' + host + ':' + port));
