import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] || fallback;
}

const host = option('--host', '127.0.0.1');
const port = Number(option('--port', process.env.PORT || '5173'));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Choose a port between 1 and 65535.');
}
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const root = await realpath(resolve(projectRoot, option('--dir', '.')));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if (pathname.endsWith('/')) pathname += 'index.html';
    const resolved = resolve(root, '.' + pathname);
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const file = await realpath(resolved);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    const status = error instanceof URIError ? 400 : 404;
    response.writeHead(status).end(status === 400 ? 'Bad request' : 'Not found');
  }
});

server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is busy. Try npm run dev -- --port 5174.`
    : error.message);
  process.exitCode = 1;
});
server.listen(port, host, () => {
  console.log(`One Innovation KV Studio: http://${host}:${port}`);
});
