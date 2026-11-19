// Uji klik Transkrip foto lewat Chrome DevTools Protocol.
// Butuh server di B yang sudah menjalankan transkrip.mjs (akun Google + Drive terhubung, dokumen "Catatan Baru", reporter rep2).
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const B = process.env.B || 'http://localhost:8792', T = 'http://127.0.0.1:8791';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFIL = path.resolve(fs.mkdtempSync('.wrangler/chrome-'));
const proses = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9559', `--user-data-dir=${PROFIL}`, '--window-size=1100,1000', 'about:blank']);
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const tidur = ms => new Promise(r => setTimeout(r, ms));
let daftar;
for (let i = 0; i < 60; i++) { try { daftar = await (await fetch('http://127.0.0.1:9559/json')).json(); if (daftar.some(t => t.type === 'page')) break; } catch {} await tidur(500); }
const ws = new WebSocket(daftar.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let nomor = 0; const tunggu = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
const kirim = (method, params = {}) => new Promise(r => { const id = ++nomor; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async e => (await kirim('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sampai = async (e, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(e)) return true; await tidur(200); } return false; };
const foto = async nama => { const r = await kirim('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`.wrangler/${nama}.png`, Buffer.from(r.result.data, 'base64')); };
// Buat foto di browser (canvas) lalu masukkan ke input file lewat DataTransfer.
const pilih = (wadah, spesifikasi) => js(`(async () => {
  const dt = new DataTransfer();
  for (const s of ${JSON.stringify(spesifikasi)}) {
    if (s.rusak) { dt.items.add(new File(['bukan gambar'], s.nama, { type: 'image/heic' })); continue; }
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, s.w, s.h); g.fillStyle = '#000'; g.font = '80px serif'; g.fillText('Catatan liputan', 50, 200);
    const b = await new Promise(r => c.toBlob(r, s.jenis || 'image/png'));
    dt.items.add(new File([b], s.nama, { type: b.type }));
  }
  const i = document.querySelector('${wadah} .t-file'); i.files = dt.files; i.dispatchEvent(new Event('change'));
})()`);
await kirim('Page.enable'); await kirim('Runtime.enable');

await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=rep2@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
cek('menu "Transkrip Foto" untuk reporter', await js(`[...document.querySelectorAll('nav a')].some(a => a.textContent.trim() === 'Transkrip Foto')`));
await js(`location.hash = 'transkrip'`);
cek('halaman transkrip: tombol Pilih foto, Baca nonaktif', await sampai(`!!document.querySelector('#w-transkrip .t-file') && document.querySelector('#w-transkrip .t-baca').disabled`));
const sebelum = (await (await fetch(T + '/gemini/keadaan')).json()).unggah.length;
await pilih('#w-transkrip', [{ nama: 'hal1.png', w: 4000, h: 3000 }, { nama: 'hal2.jpg', w: 1200, h: 1600, jenis: 'image/jpeg' }]);
cek('2 foto tampil sebagai pratinjau kecil', await sampai(`document.querySelectorAll('#w-transkrip .t-foto img').length === 2 && !document.querySelector('#w-transkrip .t-baca').disabled`));
await js(`document.querySelector('#w-transkrip .t-baca').click()`);
cek('hasil baca muncul di pratinjau yang bisa diedit', await sampai(`!document.querySelector('#w-transkrip .t-hasil').hidden && document.querySelector('#w-transkrip .t-teks').value.startsWith('Hasil transkrip dari 2 foto.')`),
  await js(`document.querySelector('#w-transkrip .t-galat').textContent + ' | ' + document.querySelector('#w-transkrip .t-status').textContent`));
const g = await (await fetch(T + '/gemini/keadaan')).json();
const baru = g.unggah.slice(sebelum);
cek('foto dikirim sebagai JPEG', baru.length === 2 && baru.every(u => u.mime === 'image/jpeg' && u.hasil?.jpeg), JSON.stringify(baru));
cek('4000×3000 dikecilkan ke 3000×2250; 1200×1600 tetap', baru[0].hasil.lebar === 3000 && baru[0].hasil.tinggi === 2250 && baru[1].hasil.lebar === 1200 && baru[1].hasil.tinggi === 1600, JSON.stringify(baru.map(u => u.hasil)));
await foto('klik-transkrip-pratinjau');
await js(`(() => { const w = document.querySelector('#w-transkrip'); w.querySelector('.t-teks').value += '\\nDiedit manusia.'; w.querySelector('.t-judul').value = 'Uji klik';
  const s = w.querySelector('.t-docs'); s.value = s.options[1].value; w.querySelector('.t-kirim').click(); })()`);
cek('kirim → pesan terkirim + tautan dokumen', await sampai(`document.querySelector('#w-transkrip .t-ok a[href*="docs.google.com/document"]')`));
const docs = await (await fetch(T + '/docs/keadaan')).json();
cek('teks yang diedit masuk ke Google Docs', Object.values(docs).some(d => d.teks.includes('Uji klik · ') && d.teks.includes('Rep Dua\nHasil transkrip dari 2 foto.') && d.teks.includes('Diedit manusia.')));
await pilih('#w-transkrip', [{ nama: 'foto.heic', rusak: true }]);
await js(`document.querySelector('#w-transkrip .t-foto [data-hapus="0"]').click(); document.querySelector('#w-transkrip .t-foto [data-hapus="0"]').click()`);
await sampai(`document.querySelectorAll('#w-transkrip .t-foto img').length === 1`);
await js(`document.querySelector('#w-transkrip .t-baca').click()`);
cek('file yang tidak bisa dibuka (HEIC) → pesan jelas', await sampai(`document.querySelector('#w-transkrip .t-galat').textContent.includes('HEIC')`));

// Dari form naskah: Salin ke isi naskah
await js(`location.hash = 'naskah/baru'`);
await sampai(`!!document.querySelector('#f-naskah')`);
await js(`document.querySelector('#f-naskah').isi.value = 'Paragraf awal.'; dialogTranskrip()`);
cek('form naskah: dialog transkrip terbuka', await sampai(`document.querySelector('#dialog').open && !!document.querySelector('#dialog .t-naskah')`));
await pilih('#dialog', [{ nama: 'catatan.png', w: 800, h: 600 }]);
await sampai(`!document.querySelector('#dialog .t-baca').disabled`);
await js(`document.querySelector('#dialog .t-baca').click()`);
await sampai(`!document.querySelector('#dialog .t-hasil').hidden`);
await foto('klik-transkrip-naskah');
await js(`document.querySelector('#dialog .t-naskah').click()`);
cek('Salin ke isi naskah → ditambahkan setelah isi lama, dialog tertutup', await sampai(`!document.querySelector('#dialog').open && document.querySelector('#f-naskah').isi.value.startsWith('Paragraf awal.\\n\\nHasil transkrip dari 1 foto.')`),
  await js(`document.querySelector('#f-naskah').isi.value`));

// Pengaturan → Google (Admin): dokumen tujuan
await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=216326@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
await js(`location.hash = 'email'`);
cek('pengaturan: status Gemini aktif + daftar dokumen', await sampai(`document.querySelector('#isi').textContent.includes('Pembaca foto (Gemini) aktif.') && document.querySelector('#isi').textContent.includes('Catatan Baru')`));
await js(`(() => { const f = document.querySelector('form[onsubmit^="buatDocTujuan"]'); f.nama.value = 'Arsip Klik'; f.requestSubmit(); })()`);
cek('buat dokumen dari pengaturan → muncul di daftar', await sampai(`[...document.querySelectorAll('#isi a[href*="docs.google.com/document"]')].some(a => a.textContent.includes('Arsip Klik'))`));
await foto('klik-transkrip-pengaturan');
ws.close(); proses.kill();
console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
