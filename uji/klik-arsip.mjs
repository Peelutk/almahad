// Uji klik folder arsip edisi lewat Chrome DevTools Protocol.
// Butuh server di B yang sudah menjalankan arsip.mjs (akun Google + Drive terhubung, rubrik majalah "Cerpen", reporter rep1).
// Jendela Google Picker sendiri tidak bisa diuji di sini (butuh Google asli) — folder induk dipasang lewat API.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
const B = process.env.B || 'http://localhost:8790', T = 'http://127.0.0.1:8791';
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFIL = path.resolve(fs.mkdtempSync('.wrangler/chrome-'));
const proses = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9560', `--user-data-dir=${PROFIL}`, '--window-size=1100,1000', 'about:blank']);
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const tidur = ms => new Promise(r => setTimeout(r, ms));
let daftar;
for (let i = 0; i < 60; i++) { try { daftar = await (await fetch('http://127.0.0.1:9560/json')).json(); if (daftar.some(t => t.type === 'page')) break; } catch {} await tidur(500); }
const ws = new WebSocket(daftar.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let nomor = 0; const tunggu = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && tunggu.has(m.id)) { tunggu.get(m.id)(m); tunggu.delete(m.id); } };
const kirim = (method, params = {}) => new Promise(r => { const id = ++nomor; tunggu.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async e => (await kirim('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sampai = async (e, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await js(e)) return true; await tidur(200); } return false; };
const foto = async nama => { const r = await kirim('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`.wrangler/${nama}.png`, Buffer.from(r.result.data, 'base64')); };
await kirim('Page.enable'); await kirim('Runtime.enable');

// --- Admin: pengaturan + edisi
await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=216326@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
await js(`location.hash = 'email'`);
cek('pengaturan: kartu folder arsip + tombol Pilih folder', await sampai(`document.querySelector('#isi').textContent.includes('Folder arsip edisi (Google Drive)') && [...document.querySelectorAll('#isi button')].some(b => b.textContent.includes('Pilih folder arsip edisi'))`),
  await js(`document.querySelector('#isi').textContent.slice(0, 400)`));
const luar = (await (await fetch(T + '/drive/folder-luar?nama=' + encodeURIComponent('EDISI AL MAHAD'))).json()).id;
await js(`api('/api/arsip/akar', 'POST', { id: '${luar}' }).then(() => tampil())`);
cek('pengaturan: folder induk tampil + tombol berubah "Ganti folder arsip"', await sampai(`!!document.querySelector('#isi a[href$="${luar}"]') && [...document.querySelectorAll('#isi button')].some(b => b.textContent === 'Ganti folder arsip')`));
await foto('klik-arsip-pengaturan');
await js(`location.hash = 'edisi'`);
await sampai(`[...document.querySelectorAll('button')].some(b => b.textContent.includes('Edisi baru'))`);
await js(`formEdisi(); (() => { const f = document.querySelector('#f-edisi'); f.nomor.value = '73'; f.tema.value = 'Uji Klik'; f.requestSubmit(document.querySelector('#f-edisi [value=simpan]')); })()`);
cek('edisi baru → halaman edisi dengan tautan "Buka folder di Drive"', await sampai(`/^#edisi\\/\\d+$/.test(location.hash) && !!document.querySelector('#isi a[href*="drive.google.com/drive/folders/"]')`),
  await js(`document.querySelector('#isi').textContent.slice(0, 300)`));
const dv = await (await fetch(T + '/drive/keadaan')).json();
cek('folder "EDISI KE 73-(UJI KLIK)" dibuat di folder induk', dv.folder.some(f => f.name === 'EDISI KE 73-(UJI KLIK)' && f.parents[0] === luar));
await foto('klik-arsip-edisi');

// --- Reporter: transkrip dari form naskah → folder edisi
await kirim('Page.navigate', { url: `${B}/api/uji/masuk?email=rep1@daarululuumlido.com&lanjut=1` });
await sampai(`!!document.querySelector('nav')`);
const idN = await js(`(async () => { const p = await api('/api/pilihan'); const r = p.rubrik_majalah.isi.find(x => x.nilai === 'Cerpen');
  return (await api('/api/naskah', 'POST', { jenis: 'majalah', judul: 'Rahasia Kristal Biru', rubrik_id: r.id, isi: '' })).id; })()`);
await js(`location.hash = 'naskah/${idN}'`);
await sampai(`!!document.querySelector('#f-naskah')`);
await js(`dialogTranskrip()`);
await sampai(`!!document.querySelector('#dialog .t-file')`);
await js(`(async () => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const b = await new Promise(r => c.toBlob(r));
  const dt = new DataTransfer(); dt.items.add(new File([b], 'hal.png', { type: 'image/png' })); const i = document.querySelector('#dialog .t-file'); i.files = dt.files; i.dispatchEvent(new Event('change')); })()`);
await sampai(`!document.querySelector('#dialog .t-baca').disabled`);
await js(`document.querySelector('#dialog .t-baca').click()`);
await sampai(`!document.querySelector('#dialog .t-hasil').hidden`);
cek('bagian "Simpan ke folder edisi" muncul', await js(`!!document.querySelector('#dialog .t-arsip')`));
cek('terisi otomatis: judul naskah, rubrik Cerpen, nama penulis', await js(`(() => { const w = document.querySelector('#dialog');
  return w.querySelector('.a-judul').value === 'Rahasia Kristal Biru' && w.querySelector('.a-rubrik').selectedOptions[0].textContent === 'Cerpen' && w.querySelector('.a-penulis').value === 'Rep Satu'; })()`),
  await js(`(() => { const w = document.querySelector('#dialog'); return [w.querySelector('.a-judul').value, w.querySelector('.a-rubrik').selectedOptions[0]?.textContent, w.querySelector('.a-penulis').value].join(' | '); })()`));
await foto('klik-arsip-transkrip');
await js(`(() => { const s = document.querySelector('#dialog .a-edisi'); s.value = [...s.options].find(o => o.textContent.startsWith('73')).value; document.querySelector('#dialog .a-simpan').click(); })()`);
cek('simpan → pesan "Dokumen dibuat" + tautan dokumen & folder', await sampai(`document.querySelector('#dialog .a-ok')?.textContent.includes('Dokumen dibuat') && document.querySelectorAll('#dialog .a-ok a').length === 2`),
  await js(`document.querySelector('#dialog .t-galat').textContent`));
const dk = await (await fetch(T + '/docs/keadaan')).json();
cek('dokumen "Rahasia Kristal Biru" berisi hasil transkrip', Object.values(dk).some(d => d.name === 'Rahasia Kristal Biru' && d.teks.includes('Hasil transkrip dari 1 foto.')));
await js(`document.querySelector('#dialog .a-simpan').click()`);
cek('simpan kedua untuk naskah yang sama → "Ditambahkan ke dokumen naskah ini"', await sampai(`document.querySelector('#dialog .a-ok')?.textContent.includes('Ditambahkan ke dokumen naskah ini')`));
ws.close(); proses.kill();
console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
