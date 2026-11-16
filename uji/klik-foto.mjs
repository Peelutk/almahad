// Uji klik Upload foto (Drive tiruan) lewat Chrome DevTools Protocol.
// Butuh server di B yang sudah menjalankan foto.mjs (akun Google + izin Drive terhubung, reporter rep1, rubrik berita ada).
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const B = process.env.B || 'http://localhost:8793';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFIL = path.resolve(fs.mkdtempSync('.wrangler/chrome-'));
const F1 = path.resolve('.wrangler/klik-foto-1.jpg'), F2 = path.resolve('.wrangler/klik-foto-2.png'), F3 = path.resolve('.wrangler/klik-dokumen.txt'), F4 = path.resolve('.wrangler/klik-besar.jpg');
fs.writeFileSync(F1, crypto.randomBytes(2 * 1024 * 1024));
fs.writeFileSync(F2, crypto.randomBytes(1000));
fs.writeFileSync(F3, 'bukan foto');
fs.writeFileSync(F4, Buffer.alloc(20 * 1024 * 1024 + 1));
const proses = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9558', `--user-data-dir=${PROFIL}`, '--window-size=1100,1000', 'about:blank']);
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const tidur = ms => new Promise(r => setTimeout(r, ms));
let daftar;
for (let i = 0; i < 60; i++) { try { daftar = await (await fetch('http://127.0.0.1:9558/json')).json(); if (daftar.some(t => t.type === 'page')) break; } catch {} await tidur(500); }
const ws = new WebSocket(daftar.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let nomor = 0; const tunggu = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
const kirim = (method, params = {}) => new Promise(r => { const id = ++nomor; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async e => (await kirim('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sampai = async (e, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(e)) return true; await tidur(200); } return false; };
const foto = async nama => { const r = await kirim('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`.wrangler/${nama}.png`, Buffer.from(r.result.data, 'base64')); };
const pilihFile = async files => {
  const { result: { root } } = await kirim('DOM.getDocument');
  const { result: { nodeId } } = await kirim('DOM.querySelector', { nodeId: root.nodeId, selector: '#foto-file' });
  await kirim('DOM.setFileInputFiles', { nodeId, files });
  await js(`document.querySelector('#foto-file').dispatchEvent(new Event('change'))`);
};
await kirim('Page.enable'); await kirim('Runtime.enable'); await kirim('DOM.enable');

await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=rep1@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
await js(`location.hash = 'naskah/baru'`);
cek('form naskah: tombol Upload foto + kolom tautan', await sampai(`!!document.querySelector('#foto-file') && !!document.querySelector('#foto-tautan')`));
await js(`document.querySelector('#f-naskah').judul.value = 'Uji foto klik'`);
await pilihFile([F1, F2, F3, F4]);
cek('2 foto terupload & tampil di daftar', await sampai(`document.querySelectorAll('#daftar-foto .foto-item').length === 2`), await js(`document.querySelector('#foto-progres').textContent`));
cek('pratinjau dimuat dari /api/foto', await sampai(`[...document.querySelectorAll('#daftar-foto img')].every(i => i.complete && i.naturalWidth > 0 && /\\/api\\/foto\\/\\d+$/.test(i.getAttribute('src')))`));
cek('file bukan foto ditolak dengan keterangan', await js(`document.querySelector('#foto-progres').textContent.includes('bukan foto')`));
cek('file > 20 MB ditolak di browser', await js(`document.querySelector('#foto-progres').textContent.includes('lebih dari 20 MB')`));
await js(`(() => { const i = document.querySelector('#daftar-foto .foto-item input'); i.value = 'Juara lomba'; i.dispatchEvent(new Event('input')); })()`);
// tambah juga satu tautan
await js(`(() => { document.querySelector('#foto-tautan').value = 'https://drive.google.com/file/d/abcdefghijk/view'; tambahFoto(); })()`);
cek('keterangan tetap setelah daftar digambar ulang', await js(`document.querySelector('#daftar-foto .foto-item input').value === 'Juara lomba'`));
await foto('klik-foto-form');
await js(`simpanNaskah()`);
cek('naskah tersimpan → halaman naskah', await sampai(`/^#naskah\\/\\d+$/.test(location.hash) && !!document.querySelector('#f-naskah')`));
const id = await js(`location.hash.split('/')[1]`);
const n = JSON.parse(await js(`fetch('/api/naskah/${id}').then(r => r.text())`));
cek('foto upload + tautan + keterangan tersimpan', n.foto.length === 3 && /^\/api\/foto\/\d+$/.test(n.foto[0].tautan) && n.foto[0].keterangan === 'Juara lomba', JSON.stringify(n.foto));
await js(`location.hash = 'cetak-naskah/${id}'`);
cek('halaman cetak: foto upload tampil sebagai gambar', await sampai(`[...document.querySelectorAll('img')].some(i => /\\/api\\/foto\\//.test(i.getAttribute('src')) && i.naturalWidth > 0)`));
await foto('klik-foto-cetak');
const unduh = await js(`fetch('${n.foto[0].tautan}?asli=1').then(r => r.headers.get('content-disposition') + ' ' + r.headers.get('content-length'))`);
cek('Unduh asli: file penuh 2 MB', /attachment/.test(unduh) && unduh.endsWith(String(2 * 1024 * 1024)), unduh);
// Halaman Pengaturan → Google (Admin)
await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=216326@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
cek('menu "Google" ada', await js(`[...document.querySelectorAll('nav a')].some(a => a.textContent.trim() === 'Google')`));
await js(`location.hash = 'email'`);
cek('halaman Google: status Drive aktif + tautan folder', await sampai(`document.querySelector('#isi').textContent.includes("Aktif — foto naskah disimpan di folder Al-Ma'had – Foto") && !!document.querySelector('a[href*="drive.google.com/drive/folders/"]')`),
  await js(`document.querySelector('#isi').textContent.slice(0, 300)`));
await js(`location.hash = 'email/ok_tanpa_drive'`);
cek('pesan bila izin Drive tidak dicentang', await sampai(`document.querySelector('#isi').textContent.includes('izin Google Drive tidak dicentang')`));
await foto('klik-foto-pengaturan');
ws.close(); proses.kill();
console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
