// Uji upload foto ke Google Drive (A-55..A-60) — DB bersih, tiruan-google.mjs (Drive tiruan) di :8791.
import crypto from 'crypto';
const B = process.env.B || 'http://localhost:8793', T = 'http://127.0.0.1:8791';
const CID = '272243653251-t44feo34jks8603qa3sb0e9l9qthun3b.apps.googleusercontent.com', D = 'daarululuumlido.com';
const S_GMAIL = 'https://www.googleapis.com/auth/gmail.send', S_DRIVE = 'https://www.googleapis.com/auth/drive.file';
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const kuki = r => (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/)?.[1];
async function masuk(email) { const r = await fetch(`${B}/api/uji/masuk?email=${email}&nama=${email.split('@')[0]}`); return `am_sesi=${kuki(r)}`; }
function klien(k) {
  return async (p, m = 'GET', d) => {
    const r = await fetch(B + p, { method: m, redirect: 'manual', headers: { cookie: k, 'x-almahad': '1', ...(d !== undefined ? { 'content-type': 'application/json' } : {}) }, body: d === undefined ? undefined : JSON.stringify(d) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b, h: r.headers };
  };
}
const klaim = email => ({ aud: CID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, hd: D, email, name: 'X' });
const kode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function hubungkan(k, isi) {
  const m = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual', headers: { cookie: k } });
  const st = (m.headers.get('set-cookie') || '').match(/am_state=([^;]+)/)?.[1];
  const r = await fetch(`${B}/api/google/kembali?state=${st}&code=${kode(isi)}`, { redirect: 'manual', headers: { cookie: `${k}; am_state=${st}` } });
  return { mulai: m, loc: r.headers.get('location') };
}
async function unggah(k, data, jenis = 'image/jpeg', nama = 'Foto Lomba.jpg', tanpaHeader) {
  const r = await fetch(`${B}/api/foto`, { method: 'POST', headers: { cookie: k || '', ...(tanpaHeader ? {} : { 'x-almahad': '1' }), 'content-type': jenis, 'x-nama-file': encodeURIComponent(nama) }, body: data });
  let b = null; try { b = await r.json(); } catch {}
  return { s: r.status, b };
}
const ambil = (k, p) => fetch(B + p, { headers: { cookie: k || '' } });
const drive = () => fetch(T + '/drive/keadaan').then(r => r.json());
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
await fetch(T + '/mode?drive_gagal=0&tanpa_thumb=0');
const awal = await drive();

const kA = await masuk(`216326@${D}`); const admin = klien(kA);
await admin('/api/anggota', 'POST', { email: `rep1@${D}`, nama: 'Rep Satu', peran: ['reporter'] });
await admin('/api/anggota', 'POST', { email: `ed1@${D}`, nama: 'Ed Satu', peran: ['editor'] });
await admin('/api/anggota', 'POST', { nis: '5101', nama: 'Rep NIS', peran: ['reporter'] });
const kR = await masuk(`rep1@${D}`), kE = await masuk(`ed1@${D}`);
const kecil = crypto.randomBytes(3000);

// --- sebelum terhubung
let u = await unggah(kR, kecil);
cek('upload sebelum akun Google terhubung → 503', u.s === 503 && /Drive/.test(u.b.galat), JSON.stringify(u));
let h = await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-1', scope: `openid email ${S_GMAIL}` });
cek('hubungkan tanpa izin Drive → ok_tanpa_drive', h.loc === '/#email/ok_tanpa_drive', h.loc);
cek('redirect meminta izin drive.file', (h.mulai.headers.get('location') || '').includes(encodeURIComponent(S_DRIVE)));
let e = (await admin('/api/email')).b;
cek('status: email terhubung, drive belum', e.status === 'terhubung' && e.drive === false);
cek('upload tanpa izin Drive → 503', (await unggah(kR, kecil)).s === 503);
h = await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-1', scope: `openid email ${S_GMAIL} ${S_DRIVE}` });
cek('hubungkan dengan izin Drive → ok', h.loc === '/#email/ok', h.loc);
cek('status: drive aktif', (await admin('/api/email')).b.drive === true);

// --- validasi upload
cek('tanpa login → 401', (await unggah(null, kecil)).s === 401);
cek('tanpa header CSRF → 403', (await unggah(kR, kecil, 'image/jpeg', 'a.jpg', true)).s === 403);
await admin('/api/anggota', 'POST', { email: `adm2@${D}`, nama: 'Admin Saja', peran: ['admin'] });
cek('Admin tanpa peran redaksi → 403', (await unggah(await masuk(`adm2@${D}`), kecil)).s === 403);
cek('SVG ditolak (415)', (await unggah(kR, Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg')).s === 415);
cek('HTML ditolak (415)', (await unggah(kR, Buffer.from('<h1>'), 'text/html', 'x.html')).s === 415);
cek('file kosong ditolak', (await unggah(kR, Buffer.alloc(0))).s === 411);

// --- upload berhasil
u = await unggah(kR, kecil);
cek('upload foto → 201 + tautan /api/foto/<id>', u.s === 201 && /^\/api\/foto\/\d+$/.test(u.b.tautan), JSON.stringify(u));
const tautan1 = u.b.tautan;
let d = await drive();
const folderBaru = d.folder.slice(awal.folder.length), fileBaru = d.file.slice(awal.file.length);
const akar = folderBaru.find(f => f.name === "Al-Ma'had – Foto"), bulan = folderBaru.find(f => /^\d{4}-\d\d$/.test(f.name));
cek('folder "Al-Ma\'had – Foto" dibuat di akar', akar && akar.parents.length === 0, JSON.stringify(folderBaru));
cek('subfolder bulan (WIB) di dalamnya', bulan && bulan.parents[0] === akar.id && bulan.name === new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 7));
cek('file masuk subfolder bulan', fileBaru[0].parents[0] === bulan.id);
cek('nama file: tanggal-jam_nama-asli', /^\d{4}-\d\d-\d\d_\d\d\.\d\d\.\d\d_Foto Lomba\.jpg$/.test(fileBaru[0].name), fileBaru[0].name);
cek('isi file utuh (sha256)', fileBaru[0].sha === sha(kecil));
cek('dikirim dengan Content-Length (bukan chunked)', fileBaru[0].content_length === String(kecil.length) && !fileBaru[0].chunked, JSON.stringify(fileBaru[0]));
cek('jenis file tersimpan', fileBaru[0].mime === 'image/jpeg');
u = await unggah(kE, crypto.randomBytes(500), 'image/png', 'a/b:c é?.png');
d = await drive();
cek('upload kedua memakai folder yang sama', d.folder.length === awal.folder.length + 2);
cek('nama file dibersihkan', /_a_b_c é_\.png$/.test(d.file.at(-1).name), d.file.at(-1).name);
u = await unggah(kR, crypto.randomBytes(400), 'image/heic', 'IMG_0001');
cek('HEIC tanpa ekstensi → .heic ditambahkan', u.s === 201 && u.b.nama === 'IMG_0001.heic', JSON.stringify(u.b));

// --- ukuran
const besar = crypto.randomBytes(20 * 1024 * 1024);
let t0 = Date.now();
u = await unggah(kR, besar, 'image/jpeg', 'besar.jpg');
cek('20 MB tepat → berhasil', u.s === 201, JSON.stringify(u));
d = await drive();
cek('20 MB utuh di Drive', d.file.at(-1).ukuran === besar.length && d.file.at(-1).sha === sha(besar));
console.log(`     (upload 20 MB lokal: ${Date.now() - t0} ms)`);
const tautanBesar = u.b.tautan;
cek('20 MB + 1 byte → 413', (await unggah(kR, Buffer.concat([besar, Buffer.alloc(1)]))).s === 413);

// --- tampil
let r = await ambil(kR, tautan1);
let isi = Buffer.from(await r.arrayBuffer());
cek('tampil: pratinjau Google (PNG) untuk anggota', r.status === 200 && r.headers.get('content-type') === 'image/png' && isi[1] === 0x50);
cek('pratinjau diminta ukuran 1600', (await drive()).ukuranThumb.at(-1) === 1600);
cek('header aman: nosniff + cache privat', r.headers.get('x-content-type-options') === 'nosniff' && /private/.test(r.headers.get('cache-control')));
cek('cookie Drive tidak bocor', !r.headers.get('set-cookie'));
r = await ambil(kR, tautan1 + '?asli=1'); isi = Buffer.from(await r.arrayBuffer());
cek('unduh asli: isi sama + jenis jpeg', r.status === 200 && sha(isi) === sha(kecil) && r.headers.get('content-type') === 'image/jpeg');
cek('unduh asli: content-disposition attachment', /attachment; filename\*=UTF-8''Foto%20Lomba\.jpg/.test(r.headers.get('content-disposition') || ''), r.headers.get('content-disposition'));
r = await ambil(kR, tautanBesar + '?asli=1'); isi = Buffer.from(await r.arrayBuffer());
cek('unduh asli 20 MB utuh', sha(isi) === sha(besar));
cek('tampil tanpa login → 401', (await ambil(null, tautan1)).status === 401);
cek('editor bisa melihat', (await ambil(kE, tautan1)).status === 200);
// anggota login NIS (setelah ganti password awal)
let m = await fetch(`${B}/api/masuk`, { method: 'POST', headers: { 'x-almahad': '1', 'content-type': 'application/json' }, body: JSON.stringify({ nis: '5101', sandi: '5101' }) });
const kN = `am_sesi=${kuki(m)}`;
cek('login NIS (password awal) → foto terkunci sampai ganti', (await ambil(kN, tautan1)).status === 403);
await klien(kN)('/api/sandi', 'POST', { lama: '5101', baru: 'sandi-baru-9' });
m = await fetch(`${B}/api/masuk`, { method: 'POST', headers: { 'x-almahad': '1', 'content-type': 'application/json' }, body: JSON.stringify({ nis: '5101', sandi: 'sandi-baru-9' }) });
cek('anggota login NIS bisa melihat foto', (await ambil(`am_sesi=${kuki(m)}`, tautan1)).status === 200);
cek('id tidak dikenal → 404', (await ambil(kR, '/api/foto/99999')).status === 404);
await fetch(T + '/mode?tanpa_thumb=1');
r = await ambil(kR, tautan1); isi = Buffer.from(await r.arrayBuffer());
cek('pratinjau belum siap → file asli', r.status === 200 && sha(isi) === sha(kecil) && r.headers.get('content-type') === 'image/jpeg');
await fetch(T + '/mode?tanpa_thumb=0');

// --- naskah memakai foto upload
const rub = (await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: 'Kegiatan' })).b.id;
const rep = klien(kR);
let n = await rep('/api/naskah', 'POST', { jenis: 'berita', judul: 'Lomba', rubrik_id: rub, isi: 'Isi', foto: [{ tautan: tautan1, keterangan: 'Juara 1' }, { tautan: 'https://drive.google.com/file/d/abcdefghijk/view', keterangan: '' }] });
cek('naskah dengan foto upload + tautan tersimpan', n.s === 201, JSON.stringify(n.b));
const det = (await rep(`/api/naskah/${n.b.id}`)).b;
cek('foto naskah terbaca kembali', det.foto[0].tautan === tautan1 && det.foto[0].keterangan === 'Juara 1' && det.foto.length === 2);
cek('tautan /api/foto/abc ditolak', (await rep('/api/naskah', 'POST', { jenis: 'berita', judul: 'X', rubrik_id: rub, isi: '', foto: [{ tautan: '/api/foto/abc' }] })).s === 400);
cek('tautan javascript: ditolak', (await rep('/api/naskah', 'POST', { jenis: 'berita', judul: 'X', rubrik_id: rub, isi: '', foto: [{ tautan: 'javascript:alert(1)' }] })).s === 400);
cek('tautan /api/foto/1/../x ditolak', (await rep('/api/naskah', 'POST', { jenis: 'berita', judul: 'X', rubrik_id: rub, isi: '', foto: [{ tautan: '/api/foto/1/../x' }] })).s === 400);
cek('menghapus foto dari naskah tidak menghapus file Drive', (await rep(`/api/naskah/${n.b.id}`, 'PUT', { foto: [] })).s === 200 && (await drive()).file.length === d.file.length);

// --- gangguan Drive
await fetch(T + '/mode?drive_gagal=1');
cek('Drive gagal saat upload → 502', (await unggah(kR, kecil)).s === 502);
await fetch(T + '/mode?drive_gagal=0');
await fetch(T + '/drive/hapus/' + fileBaru[0].id);
cek('file dihapus di Drive → 404', (await ambil(kR, tautan1)).status === 404);

// --- putus & ganti akun
await admin('/api/email/putus', 'POST');
cek('setelah diputus: upload 503', (await unggah(kR, kecil)).s === 503);
cek('setelah diputus: tampil 503', (await ambil(kR, tautanBesar)).status === 503);
h = await hubungkan(kA, { klaim: klaim(`lain@${D}`), refresh_token: 'rt-9', scope: `openid email ${S_GMAIL} ${S_DRIVE}` });
const sebelum = (await drive()).folder.length;
u = await unggah(kR, kecil);
d = await drive();
cek('ganti akun → folder baru dibuat di akun baru', u.s === 201 && d.folder.length === sebelum + 2 && d.folder.at(-1).token === 'Bearer at-rt-9', JSON.stringify({ u, sebelum, n: d.folder.length }));

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
