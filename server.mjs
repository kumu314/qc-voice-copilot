// 边测边报 · 跨设备联动服务器（零依赖）
// 用法：node server.mjs        （可选 PORT=9000 node server.mjs）
// 电脑打开 http://localhost:8080/screen.html ，手机连同一 Wi-Fi / 热点打开终端里打印的地址 /phone.html
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.wav':'audio/wav', '.mp3':'audio/mpeg' };
const clients = new Set();
let log = [];   // 命令日志：新打开的页面会先收到它，状态和其他页面一致

const send = (res, m) => res.write(`data: ${JSON.stringify(m)}\n\n`);

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://local');
  if (u.pathname === '/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', 'Connection':'keep-alive' });
    send(res, { t:'sync', to:'*', log });
    clients.add(res);
    const ka = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => { clients.delete(res); clearInterval(ka); });
    return;
  }
  if (u.pathname === '/emit' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      try {
        const m = JSON.parse(body);
        if (m.t === 'reset') log = [];
        else if (!['hello','ping','sync'].includes(m.t)) log.push(m);
        for (const c of clients) send(c, m);
      } catch {}
      res.writeHead(204); res.end();
    });
    return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  const f = path.join(dir, path.normalize(p));
  if (!f.startsWith(dir + path.sep)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(f);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  边测边报 · 联动服务器已启动\n');
  console.log(`  大屏（本机）  http://localhost:${PORT}/screen.html`);
  for (const ip of ips) console.log(`  手机端        http://${ip}:${PORT}/phone.html`);
  console.log('\n  手机和电脑需在同一 Wi-Fi / 热点下。Ctrl+C 退出。\n');
});
