// Benchmark frame renderer: serves this directory, opens scene.html in headless
// Chrome (software WebGL via SwiftShader by default), steps deterministic time,
// and pipes each canvas frame as PNG into ffmpeg.
//   node render.mjs --video [--from=0 --to=1.25] [--fps=24] [--n=1] [--out=out/bench.mp4]
//   node render.mjs --stills=0.5,2 [--n=1] [--out=stills]
// --n = sub-frame renders per output frame (matches the measured kit's quality knob).
// CHROME_PATH selects the browser binary; GPU_FLAGS overrides the software-WebGL flags.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const ROOT = path.resolve('.');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const angle = process.env.GPU_FLAGS ? process.env.GPU_FLAGS.split(' ') : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--use-gl=angle'];
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--ignore-gpu-blocklist', ...angle] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('response', (r) => { if (r.status() >= 400) console.log('[missing]', r.url()); });
await page.goto(`http://127.0.0.1:${port}/scene.html`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true', { timeout: 120000 });
const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
console.log('GPU:', gpu);

const grab = async (t, n) => Buffer.from(await page.evaluate((tt, nn) => { window.renderAt(tt, nn); return document.getElementById('stage').toDataURL('image/png').split(',')[1]; }, t, n), 'base64');

if (args.stills) {
  const out = args.out || 'stills'; fs.mkdirSync(out, { recursive: true });
  for (const s of String(args.stills).split(',')) { const t = parseFloat(s), t0 = Date.now(); const f = `${out}/t${t.toFixed(3)}.png`; fs.writeFileSync(f, await grab(t, +(args.n || 1))); console.log('still ->', f, `${((Date.now() - t0) / 1000).toFixed(1)} s`); }
} else if (args.video) {
  const fps = +(args.fps || 24), from = +(args.from || 0), to = +(args.to || 1.25), n = +(args.n || 1);
  const count = Math.round((to - from) * fps);
  const outFile = args.out || 'out/bench.mp4'; fs.mkdirSync(path.dirname(outFile) || '.', { recursive: true });
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const buf = await grab(from + i / fps, n);
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  console.log(`video -> ${outFile} ${count} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s (${((Date.now() - t0) / 1000 / count).toFixed(2)} s/frame at n=${n})`);
} else console.log('Nothing to do. Use --stills=1,2 or --video');
server.closeAllConnections?.(); server.close();
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 8000))]);
try { browser.process()?.kill('SIGKILL'); } catch {}
process.exit(0);
