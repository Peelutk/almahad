// Uji klik Upload CSV & email otomatis lewat Chrome DevTools Protocol. Butuh server di B (mis. setelah csv.mjs, NIS 3001 sudah ada).
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const B = process.env.B || 'http://localhost:8794';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFIL = path.resolve(fs.mkdtempSync('.wrangler/chrome-'));
const FILE = path.resolve('.wrangler/klik-anggota.csv');
const N = 700000 + Date.now() % 100000 * 2; // NIS unik tiap jalan
// Disimpan dalam ANSI (Windows-1252) seperti Excel: "é" = 0xE9.
fs.writeFileSync(FILE, Buffer.from(`sep=;\r\nNIS;Nama;Kelas\r\n${N};Andr\xe9 Tujuh;XI\r\n${N + 1};Budi Tujuh;X\r\n3001;Sudah Ada;X\r\n;Tanpa NIS;X\r\n`, 'latin1'));
const proses = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9557', `--user-data-dir=${PROFIL}`, '--window-size=1100,900', 'about:blank']);
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const tidur = ms => new Promise(r => setTimeout(r, ms));
let daftar;
for (let i = 0; i < 60; i++) { try { daftar = await (await fetch('http://127.0.0.1:9557/json')).json(); if (daftar.some(t => t.type === 'page')) break; } catch {} await tidur(500); }
const ws = new WebSocket(daftar.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let nomor = 0; const tunggu = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
const kirim = (method, params = {}) => new Promise(r => { const id = ++nomor; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async e => (await kirim('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sampai = async (e, ms = 6000) => { for (let t = 0; t < ms; t += 200) { if (await js(e)) return true; await tidur(200); } return false; };
const foto = async nama => { const r = await kirim('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`.wrangler/${nama}.png`, Buffer.from(r.result.data, 'base64')); };
await kirim('Page.enable'); await kirim('Runtime.enable'); await kirim('DOM.enable');

await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=216326@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
await js(`location.hash = 'anggota'`);
cek('tombol Upload CSV ada', await sampai(`[...document.querySelectorAll('button')].some(b => b.textContent === 'Upload CSV')`));

// Email otomatis di form manual
await js(`formAnggota()`);
await js(`(() => { const f = document.querySelector('#f-anggota'); f.nis.value = '8001'; f.nis.dispatchEvent(new Event('input')); })()`);
cek('form manual: email terisi dari NIS', await js(`document.querySelector('#f-anggota').email.value === '8001@daarululuumlido.com'`));
await js(`(() => { const f = document.querySelector('#f-anggota'); f.email.value = 'lain@daarululuumlido.com'; f.nis.value = '8002'; f.nis.dispatchEvent(new Event('input')); })()`);
cek('form manual: email yang diubah tidak ditimpa', await js(`document.querySelector('#f-anggota').email.value === 'lain@daarululuumlido.com'`));
await js(`document.querySelector('#dialog').close()`);

// Upload CSV → pratinjau → simpan
await js(`formCsv()`);
cek('dialog CSV lebar', await js(`document.querySelector('#dialog').offsetWidth > 600`), await js(`document.querySelector('#dialog').className + ' ' + document.querySelector('#dialog').offsetWidth + ' ' + getComputedStyle(document.querySelector('#dialog')).width`));
cek('dialog CSV: Simpan nonaktif sebelum file', await sampai(`!!document.querySelector('#c-simpan') && document.querySelector('#c-simpan').disabled`));
const { result: { root } } = await kirim('DOM.getDocument');
const { result: { nodeId } } = await kirim('DOM.querySelector', { nodeId: root.nodeId, selector: '#c-file' });
await kirim('DOM.setFileInputFiles', { nodeId, files: [FILE] });
await js(`document.querySelector('#c-file').dispatchEvent(new Event('change'))`);
cek('pratinjau muncul: 2 ditambahkan, 1 dilewati, 1 salah', await sampai(`document.querySelector('#c-hasil').textContent.includes('2 akan ditambahkan · 1 dilewati · 1 salah')`),
  await js(`document.querySelector('#c-hasil').textContent.slice(0, 200)`));
cek('file ANSI terbaca (é)', await js(`document.querySelector('#c-hasil').textContent.includes('André Tujuh')`));
cek('tombol Simpan 2 anggota', await js(`document.querySelector('#c-simpan').textContent === 'Simpan 2 anggota' && !document.querySelector('#c-simpan').disabled`));
await foto('klik-csv-pratinjau');
await js(`(() => { const s = document.querySelector('#c-peran'); s.value = 'editor'; s.dispatchEvent(new Event('change')); })()`);
await sampai(`!document.querySelector('#c-simpan').disabled`);
await js(`document.querySelector('#c-simpan').click()`);
cek('simpan → dialog tertutup, anggota tampil', await sampai(`!document.querySelector('#dialog').open && document.querySelector('#isi').textContent.includes('André Tujuh')`));
cek('peran editor & email otomatis tersimpan', await (async () => {
  const a = await js(`fetch('/api/anggota').then(r => r.json()).then(x => JSON.stringify(x.find(a => a.nis === '${N}')))`);
  const o = JSON.parse(a || '{}');
  return o.peran?.join() === 'editor' && o.email === `${N}@daarululuumlido.com`;
})());
await foto('klik-csv-selesai');
ws.close(); proses.kill();
console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
