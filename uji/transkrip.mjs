// Uji transkrip foto → Google Docs (A-61..A-66) — DB bersih, tiruan-google.mjs (Gemini & Docs tiruan) di :8791.
import crypto from 'crypto';
const B = process.env.B || 'http://localhost:8792', T = 'http://127.0.0.1:8791';
const CID = '272243653251-t44feo34jks8603qa3sb0e9l9qthun3b.apps.googleusercontent.com', D = 'daarululuumlido.com';
const S_GMAIL = 'https://www.googleapis.com/auth/gmail.send', S_DRIVE = 'https://www.googleapis.com/auth/drive.file';
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const kuki = r => (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/)?.[1];
async function masuk(email) { const r = await fetch(`${B}/api/uji/masuk?email=${email}&nama=${encodeURIComponent(email.split('@')[0])}`); return `am_sesi=${kuki(r)}`; }
function klien(k) {
  return async (p, m = 'GET', d) => {
    const r = await fetch(B + p, { method: m, redirect: 'manual', headers: { cookie: k || '', 'x-almahad': '1', ...(d !== undefined ? { 'content-type': 'application/json' } : {}) }, body: d === undefined ? undefined : JSON.stringify(d) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b };
  };
}
const klaim = email => ({ aud: CID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, hd: D, email, name: 'X' });
const kode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function hubungkan(k, isi) {
  const m = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual', headers: { cookie: k } });
  const st = (m.headers.get('set-cookie') || '').match(/am_state=([^;]+)/)?.[1];
  const r = await fetch(`${B}/api/google/kembali?state=${st}&code=${kode(isi)}`, { redirect: 'manual', headers: { cookie: `${k}; am_state=${st}` } });
  return r.headers.get('location');
}
const jpeg = (n = 5000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n)]);
async function foto(k, data = jpeg(), jenis = 'image/jpeg', tanpaHeader) {
  const r = await fetch(`${B}/api/transkrip/foto`, { method: 'POST', headers: { cookie: k || '', ...(tanpaHeader ? {} : { 'x-almahad': '1' }), 'content-type': jenis, 'x-nama-file': 'catatan.jpg' }, body: data });
  let b = null; try { b = await r.json(); } catch {}
  return { s: r.status, b };
}
const gk = () => fetch(T + '/gemini/keadaan').then(r => r.json());
const docsK = () => fetch(T + '/docs/keadaan').then(r => r.json());
const driveK = () => fetch(T + '/drive/keadaan').then(r => r.json());
await fetch(T + '/gemini/mode?gagal=0&kosong=0'); await fetch(T + '/docs/mode?gagal=0');

const kA = await masuk(`216326@${D}`), admin = klien(kA);
await admin('/api/anggota', 'POST', { email: `rep1@${D}`, nama: 'Rep Satu', peran: ['reporter'] });
await admin('/api/anggota', 'POST', { email: `rep2@${D}`, nama: 'Rep Dua', peran: ['reporter'] });
await admin('/api/anggota', 'POST', { email: `adm2@${D}`, nama: 'Admin Saja', peran: ['admin'] });
const kR = await masuk(`rep1@${D}`), rep = klien(kR), kR2 = await masuk(`rep2@${D}`);

// --- akses & status
let t = await rep('/api/transkrip');
cek('GET /api/transkrip: aktif, belum ada dokumen', t.s === 200 && t.b.aktif === true && t.b.docs.length === 0, JSON.stringify(t.b));
cek('Admin tanpa peran redaksi boleh melihat status', (await klien(await masuk(`adm2@${D}`))('/api/transkrip')).s === 200);
cek('tanpa login → 401', (await klien(null)('/api/transkrip')).s === 401);
cek('/api/email memuat status gemini', (await admin('/api/email')).b.gemini === true);

// --- kirim foto ke Gemini Files API
cek('foto tanpa login → 401', (await foto(null)).s === 401);
cek('foto tanpa header CSRF → 403', (await foto(kR, jpeg(), 'image/jpeg', true)).s === 403);
cek('Admin tanpa peran redaksi → 403', (await foto(await masuk(`adm2@${D}`))).s === 403);
cek('GIF/HEIC ditolak (415)', (await foto(kR, jpeg(), 'image/gif')).s === 415 && (await foto(kR, jpeg(), 'image/heic')).s === 415);
cek('> 10 MB ditolak (413)', (await foto(kR, Buffer.alloc(10 * 1024 * 1024 + 1))).s === 413);
const data1 = jpeg(800 * 1024);
let f1 = await foto(kR, data1);
cek('foto → 201 + nama berkas Gemini', f1.s === 201 && /^files\/[a-z0-9-]+$/.test(f1.b.berkas) && f1.b.mime === 'image/jpeg', JSON.stringify(f1));
let g = await gk();
const u1 = g.unggah.at(-1);
cek('upload resumable: protokol & perintah benar', u1.protokol === 'resumable' && u1.perintah === 'start' && u1.mime === 'image/jpeg');
cek('isi foto utuh, Content-Length (bukan chunked)', g.berkas[f1.b.berkas].ukuran === data1.length && !g.berkas[f1.b.berkas].chunked && g.berkas[f1.b.berkas].jpeg);

// --- baca
cek('baca tanpa berkas → 400', (await rep('/api/transkrip/baca', 'POST', { berkas: [] })).s === 400);
cek('baca > 5 foto → 400', (await rep('/api/transkrip/baca', 'POST', { berkas: Array(6).fill({ berkas: 'files/a', mime: 'image/jpeg' }) })).s === 400);
cek('nama berkas aneh ditolak', (await rep('/api/transkrip/baca', 'POST', { berkas: [{ berkas: '../models/x', mime: 'image/jpeg' }] })).s === 400 &&
  (await rep('/api/transkrip/baca', 'POST', { berkas: [{ berkas: 'files/abc', mime: 'text/html' }] })).s === 400);
const f2 = await foto(kR);
let b = await rep('/api/transkrip/baca', 'POST', { berkas: [f1.b, f2.b] });
cek('baca 2 foto → teks (paragraf dirapikan)', b.s === 200 && b.b.teks === 'Hasil transkrip dari 2 foto.\n\nParagraf kedua [?] tulisan tangan.', JSON.stringify(b.b));
g = await gk();
cek('Gemini: model dari GEMINI_MODEL, suhu 0, perintah transkrip', g.terakhir.model === 'gemini-2.5-flash' && g.terakhir.suhu === 0 && g.terakhir.perintah.includes('TIDAK_ADA_TEKS') && g.terakhir.perintah.includes('[?]'), JSON.stringify(g.terakhir));
cek('Gemini: dua foto dirujuk berurutan', g.terakhir.uri.length === 2 && g.terakhir.uri[0].endsWith(f1.b.berkas) && g.terakhir.uri[1].endsWith(f2.b.berkas));
cek('berkas dihapus dari Gemini setelah dibaca', g.dihapus.includes(f1.b.berkas) && g.dihapus.includes(f2.b.berkas) && !g.berkas[f1.b.berkas]);
await fetch(T + '/gemini/mode?kosong=1');
let f3 = await foto(kR);
b = await rep('/api/transkrip/baca', 'POST', { berkas: [f3.b] });
cek('tidak ada tulisan → 422 dengan pesan', b.s === 422 && /Tidak ada tulisan/.test(b.b.galat));
cek('berkas tetap dihapus saat tidak ada teks', (await gk()).dihapus.includes(f3.b.berkas));
await fetch(T + '/gemini/mode?kosong=0');
f3 = await foto(kR);
await fetch(T + '/gemini/mode?gagal=429');
b = await rep('/api/transkrip/baca', 'POST', { berkas: [f3.b] });
cek('kuota Gemini habis → 429 "coba lagi"', b.s === 429 && /Kuota/.test(b.b.galat), JSON.stringify(b));
cek('berkas dihapus walau Gemini gagal', (await gk()).dihapus.includes(f3.b.berkas));
cek('kuota habis saat kirim foto → 429', (await foto(kR)).s === 429);
await fetch(T + '/gemini/mode?gagal=0');

// batas 30 baca per jam per anggota (sudah 2 tercatat: baca sukses + tanpa teks)
let n = 2, terakhir;
while (n < 30) { const f = await foto(kR); terakhir = await rep('/api/transkrip/baca', 'POST', { berkas: [f.b] }); n++; }
cek('baca ke-30 masih boleh', terakhir.s === 200, JSON.stringify(terakhir));
const f31 = await foto(kR);
b = await rep('/api/transkrip/baca', 'POST', { berkas: [f31.b] });
cek('baca ke-31 dalam sejam → 429 batas', b.s === 429 && /30 kali/.test(b.b.galat), JSON.stringify(b));
cek('berkas ditolak batas tetap dihapus', (await gk()).dihapus.includes(f31.b.berkas));
const f4 = await foto(kR2);
cek('batas per anggota (anggota lain tetap bisa)', (await klien(kR2)('/api/transkrip/baca', 'POST', { berkas: [f4.b] })).s === 200);

// --- dokumen tujuan
cek('buat dokumen sebelum Drive terhubung → 503', (await admin('/api/docs-tujuan', 'POST', { nama: 'X' })).s === 503);
cek('hubungkan akun Google (Email & Drive)', (await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-1', scope: `openid email ${S_GMAIL} ${S_DRIVE}` })) === '/#email/ok');
cek('reporter tidak bisa membuat dokumen tujuan', (await rep('/api/docs-tujuan', 'POST', { nama: 'X' })).s === 403);
cek('nama dokumen wajib', (await admin('/api/docs-tujuan', 'POST', { nama: ' ' })).s === 400);
let d1 = await admin('/api/docs-tujuan', 'POST', { nama: 'Catatan Liputan' });
cek('buat dokumen → 201 + tautan Google Docs', d1.s === 201 && /^https:\/\/docs\.google\.com\/document\/d\/doc\d+X+\/edit$/.test(d1.b.tautan), JSON.stringify(d1));
const d2 = await admin('/api/docs-tujuan', 'POST', { nama: 'Arsip Wawancara' });
let dk = await docsK(), dv = await driveK();
const fT = dv.folder.find(f => f.name === "Al-Ma'had – Transkrip");
const idDoc1 = d1.b.tautan.split('/')[5];
cek('folder "Al-Ma\'had – Transkrip" dibuat sekali, dokumen di dalamnya', fT && dv.folder.filter(f => f.name === "Al-Ma'had – Transkrip").length === 1 && dk[idDoc1].parents[0] === fT.id);
t = await rep('/api/transkrip');
cek('reporter melihat 2 dokumen tujuan', t.b.docs.length === 2 && t.b.docs.every(d => !d.doc_id || d.tautan));
cek('ganti nama → nama di Google Docs ikut berubah', (await admin(`/api/docs-tujuan/${d2.b.id}`, 'PUT', { nama: 'Arsip Wawancara 2026' })).s === 200 && (await docsK())[d2.b.tautan.split('/')[5]].name === 'Arsip Wawancara 2026');
cek('sembunyikan dokumen', (await admin(`/api/docs-tujuan/${d2.b.id}`, 'PUT', { aktif: false })).s === 200);
cek('reporter tidak melihat dokumen tersembunyi; Admin tetap melihat', (await rep('/api/transkrip')).b.docs.length === 1 && (await admin('/api/docs-tujuan')).b.length === 2);
cek('aktif bukan boolean ditolak', (await admin(`/api/docs-tujuan/${d2.b.id}`, 'PUT', { aktif: 'ya' })).s === 400);

// --- kirim ke Google Docs
cek('kirim tanpa dokumen → 400', (await rep('/api/transkrip/kirim', 'POST', { teks: 'x' })).s === 400);
cek('kirim ke dokumen tersembunyi → 400', (await rep('/api/transkrip/kirim', 'POST', { docs_id: d2.b.id, teks: 'x' })).s === 400);
cek('teks kosong → 400', (await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: '  ' })).s === 400);
cek('teks > 50.000 → 400', (await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: 'a'.repeat(50001) })).s === 400);
let k = await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, judul: 'Wawancara Ustadz', teks: 'Baris satu\r\n\r\nBaris dua 😀 selesai', jumlah_foto: 2 });
cek('kirim → 200 + nama & tautan dokumen', k.s === 200 && k.b.nama === 'Catatan Liputan' && k.b.tautan === d1.b.tautan, JSON.stringify(k));
k = await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: 'Transkrip kedua' });
dk = (await docsK())[idDoc1];
const tgl = /\d\d-\d\d-\d{4} \d\d\.\d\d WIB/;
const [b1, b2] = dk.teks.split('────────────\n');
cek('transkrip pertama: kepala (judul · waktu · nama) + isi', /^Wawancara Ustadz · \d\d-\d\d-\d{4} \d\d\.\d\d WIB · Rep Satu\nBaris satu\n\nBaris dua 😀 selesai\n$/.test(b1), JSON.stringify(dk.teks));
cek('transkrip kedua ditambahkan di bawah (tanpa judul)', new RegExp('^\\d\\d-\\d\\d-\\d{4} \\d\\d\\.\\d\\d WIB · Rep Satu\\nTranskrip kedua\\n$').test(b2), JSON.stringify(b2));
cek('dokumen diakhiri baris kosong bawaan', dk.teks.endsWith('────────────\n\n'));
cek('gaya: kepala Judul 3, isi teks biasa (indeks UTF-16 tepat, termasuk emoji)', dk.gaya[0].gaya === 'HEADING_3' && /^Wawancara Ustadz · .* · Rep Satu\n$/.test(dk.gaya[0].teks) &&
  dk.gaya[1].gaya === 'NORMAL_TEXT' && dk.gaya[1].teks === 'Baris satu\n\nBaris dua 😀 selesai\n────────────\n' && tgl.test(dk.gaya[2].teks), JSON.stringify(dk.gaya));
await fetch(T + '/docs/mode?gagal=1');
cek('Docs gagal → 502', (await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: 'x' })).s === 502);
await fetch(T + '/docs/mode?gagal=0');
await fetch(T + '/docs/hapus/' + idDoc1);
k = await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: 'x' });
cek('dokumen dihapus di Google Docs → 410 dengan pesan', k.s === 410 && /sudah tidak ada/.test(k.b.galat));

// --- riwayat (tanpa isi teks)
const rr = (await rep('/api/transkrip')).b.riwayat;
cek('riwayat reporter: hanya miliknya', rr.length > 0 && rr.every(r => r.oleh === 'Rep Satu'));
cek('riwayat mencatat kirim (dokumen, judul, foto, panjang)', rr.some(r => r.jenis === 'kirim' && r.dokumen === 'Catatan Liputan' && r.judul === 'Wawancara Ustadz' && r.jumlah_foto === 2 && r.panjang === 'Baris satu\n\nBaris dua 😀 selesai'.length));
cek('riwayat tidak menyimpan isi teks', rr.every(r => !('teks' in r) && !('isi' in r)));
const ra = (await admin('/api/transkrip')).b.riwayat;
cek('riwayat Admin/Pemred: semua anggota', ra.some(r => r.oleh === 'Rep Dua') && ra.some(r => r.oleh === 'Rep Satu'));

// --- ganti akun Google → dokumen akun lama tidak muncul
await admin('/api/email/putus', 'POST');
cek('akun diputus → kirim 503', (await rep('/api/transkrip/kirim', 'POST', { docs_id: d1.b.id, teks: 'x' })).s >= 400);
await hubungkan(kA, { klaim: klaim(`lain@${D}`), refresh_token: 'rt-9', scope: `openid email ${S_GMAIL} ${S_DRIVE}` });
cek('ganti akun → daftar dokumen kosong', (await rep('/api/transkrip')).b.docs.length === 0 && (await admin('/api/docs-tujuan')).b.length === 0);
const d3 = await admin('/api/docs-tujuan', 'POST', { nama: 'Catatan Baru' });
dv = await driveK();
cek('dokumen baru di folder transkrip milik akun baru', d3.s === 201 && dv.folder.filter(f => f.name === "Al-Ma'had – Transkrip").length === 2 && dv.folder.at(-1).token === 'Bearer at-rt-9');

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
