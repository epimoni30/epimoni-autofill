// Static server for the fixtures, on a fixed port so a browser session can be pointed at a
// stable URL. Used for manual and CDP-driven verification, not by the automated suites.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
createServer(async (req, res) => {
  try {
    const body = await readFile(
      join(HERE, 'fixtures', (req.url.split('?')[0] || '/').replace(/^\//, '') || 'france-travail.html'),
    );
    res.writeHead(200, { 'content-type': MIME[extname(req.url.split('?')[0])] || 'text/plain' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(8787, () => console.log('fixtures on http://127.0.0.1:8787'));
