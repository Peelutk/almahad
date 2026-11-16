// Uji notifikasi email Al-Ma'had (DB bersih, tiruan-google.mjs di :8791, wrangler dev --test-scheduled)
const B = process.env.B || 'http://localhost:8798', T = 'http://127.0.0.1:8791';
const CID = '272243653251-t44feo34jks8603qa3sb0e9l9qthun3b.apps.googleusercontent.com', D = 'daarululuumlido.com';
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const tidur = ms => new Promise(r => setTimeout(r, ms));
const kotak = () => fetch(T + '/kotak').then(r => r.json());
const reset = () => fetch(T + '/reset');
const cron = () => fetch(`${B}/__scheduled?cron=${encodeURIComponent('*/15 * * * *')}`).then(r => r.text());
async function tungguKotak(n, ms = 4000) { for (let t = 0; t < ms; t += 200) { const k = await kotak(); if (k.length >= n) return k; await tidur(200); } return kotak(); }
const kuki = r => (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/)?.[1];
async function masuk(email) { const r = await fetch(`${B}/api/uji/masuk?email=${email}&nama=${email.split('@')[0]}`); return `am_sesi=${kuki(r)}`; }
function klien(k) {
  return async (p, m = 'GET', d) => {
    const r = await fetch(B + p, { method: m, redirect: 'manual', headers: { cookie: k, 'x-almahad': '1', ...(d !== undefined ? { 'content-type': 'application/json' } : {}) }, body: d === undefined ? undefined : JSON.stringify(d) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b, h: r.headers };
  };
}
const wib = d => new Date(Date.now() + 7 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const jamWib = new Date(Date.now() + 7 * 3600e3).getUTCHours();
const klaim = email => ({ aud: CID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, hd: D, email, name: 'X' });
const kode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function hubungkan(k, isi) {
  const m = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual', headers: { cookie: k } });
  const st = (m.headers.get('set-cookie') || '').match(/am_state=([^;]+)/)?.[1];
  const r = await fetch(`${B}/api/google/kembali?state=${st}&code=${kode(isi)}`, { redirect: 'manual', headers: { cookie: `${k}; am_state=${st}` } });
  return { mulai: m, loc: r.headers.get('location') };
}

await reset(); await fetch(T + '/mode?gagal=0');
const kA = await masuk(`216326@${D}`); const admin = klien(kA);
const tambah = async (u, peran) => (await admin('/api/anggota', 'POST', { email: `${u}@${D}`, nama: u, peran })).b.id;
const idEd = await tambah('ed1', ['editor']), idEd2 = await tambah('ed2', ['editor']), idR = await tambah('rep1', ['reporter']);
await tambah('pem2', ['pemred']);
// Anggota tanpa email (hanya NIS) tidak boleh mengganggu pengiriman.
await admin('/api/anggota', 'POST', { nis: 'ed3nis', nama: 'ed3 tanpa email', peran: ['editor'] });
const idRNis = (await admin('/api/anggota', 'POST', { nis: 'rep9nis', nama: 'rep tanpa email', peran: ['reporter'] })).b.id;
const kEd = await masuk(`ed1@${D}`), kR = await masuk(`rep1@${D}`);
const ed = klien(kEd), rep = klien(kR);
const rb = (await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: 'Kegiatan' })).b.id;

// --- status awal & akses
let e = (await admin('/api/email')).b;
cek('status awal: belum, nonaktif, kunci ada', e.status === 'belum' && e.aktif === false && e.kunci_ada === true, JSON.stringify(e));
cek('reporter tidak bisa akses pengaturan email', (await rep('/api/email')).s === 403);
cek('editor tidak bisa akses pengaturan email', (await ed('/api/email')).s === 403);
cek('aktifkan sebelum terhubung ditolak', (await admin('/api/email', 'PUT', { aktif: true })).s === 400);
cek('email uji sebelum terhubung ditolak', (await admin('/api/email/uji', 'POST')).s === 400);
cek('aktif bukan boolean ditolak', (await admin('/api/email', 'PUT', { aktif: 'ya' })).s === 400);
await admin('/api/tugas', 'POST', { judul: 'Sebelum aktif', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) });
cek('sebelum aktif: tidak ada antrean', Object.keys((await admin('/api/email')).b.jumlah).length === 0);

// --- menghubungkan akun pengirim
let r = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual' });
cek('hubungkan tanpa login → bukan_admin', r.headers.get('location') === '/#email/bukan_admin');
r = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual', headers: { cookie: kR } });
cek('hubungkan oleh reporter → bukan_admin', r.headers.get('location') === '/#email/bukan_admin');
const SCOPE = 'openid email https://www.googleapis.com/auth/gmail.send';
let h = await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-1', scope: SCOPE });
const lok = h.mulai.headers.get('location') || '';
cek('redirect Google: izin gmail.send, offline, consent, login_hint', lok.includes(encodeURIComponent('https://www.googleapis.com/auth/gmail.send')) && lok.includes('access_type=offline') && lok.includes('prompt=consent') && lok.includes('login_hint=216326') && /state=g\./.test(lok), lok);
cek('hubungkan berhasil → /#email/ok', h.loc === '/#email/ok', h.loc);
e = (await admin('/api/email')).b;
cek('status terhubung, pengirim 216326', e.status === 'terhubung' && e.pengirim === `216326@${D}`, JSON.stringify(e));
cek('masih nonaktif setelah terhubung', e.aktif === false);
cek('izin tanpa gmail.send → izin_kurang', (await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-x', scope: 'openid email' })).loc === '/#email/izin_kurang');
cek('tanpa refresh token → tanpa_token', (await hubungkan(kA, { klaim: klaim(`216326@${D}`), scope: SCOPE })).loc === '/#email/tanpa_token');
cek('akun luar domain → domain', (await hubungkan(kA, { klaim: { ...klaim('x@gmail.com'), hd: undefined }, refresh_token: 'rt-x', scope: SCOPE })).loc === '/#email/domain');
cek('status tetap terhubung dengan token lama', (await admin('/api/email')).b.status === 'terhubung');
r = await fetch(`${B}/api/google/kembali?state=g.palsu&code=x`, { redirect: 'manual', headers: { cookie: kA } });
cek('state palsu (mode gmail) → sesi_masuk', r.headers.get('location') === '/#email/sesi_masuk');
r = await fetch(`${B}/api/google/kembali?state=g.abc&error=access_denied`, { redirect: 'manual', headers: { cookie: kA } });
cek('pengguna membatalkan izin → dibatalkan', r.headers.get('location') === '/#email/dibatalkan');

// --- email uji
r = await admin('/api/email/uji', 'POST');
let k = await tungguKotak(1);
cek('email uji terkirim ke admin', r.s === 200 && k[0]?.to === `216326@${D}`, JSON.stringify(r.b));
cek('subjek & pengirim UTF-8 benar', k[0]?.subject === "Email uji Al-Ma'had" && k[0]?.from.includes("Al-Ma'had") && k[0]?.from.includes(`<216326@${D}>`), JSON.stringify(k[0]));
cek('memakai token akses dari refresh token', k[0]?.token === 'Bearer at-rt-1');
cek('email uji tidak masuk antrean', Object.keys((await admin('/api/email')).b.jumlah).length === 0);

// --- aktifkan & kejadian
cek('aktifkan', (await admin('/api/email', 'PUT', { aktif: true })).s === 200);
await reset();
let t = await ed('/api/tugas', 'POST', { judul: 'Liputan <script>alert(1)</script>', keterangan: 'Wawancara', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) });
k = await tungguKotak(1);
cek('tugas baru → email ke reporter', k.length === 1 && k[0].to === `rep1@${D}` && k[0].subject.startsWith('Tugas liputan baru'), JSON.stringify(k.map(x => [x.to, x.subject])));
cek('isi email ter-escape & ada tenggat + tautan', k[0]?.html.includes('&lt;script&gt;') && !k[0]?.html.includes('<script>') && k[0]?.html.includes(wib(5).split('-').reverse().join('-')) && k[0]?.html.includes('https://almahad.jaohongk.workers.dev/#tugas'));
const tgs = t.b.id;
await reset();
cek('tugas ke reporter tanpa email: berhasil tanpa email', (await ed('/api/tugas', 'POST', { judul: 'Untuk tanpa email', jenis: 'berita', rubrik_id: rb, reporter_id: idRNis, tenggat: wib(5) })).s === 201);
await tidur(800);
cek('tidak ada email untuk anggota tanpa email', (await kotak()).length === 0);
const n = (await rep('/api/naskah', 'POST', { jenis: 'berita', judul: 'Berita Uji', rubrik_id: rb, isi: 'Isi', tugas_id: tgs })).b.id;
await rep(`/api/naskah/${n}/aksi`, 'POST', { aksi: 'ajukan' });
k = await tungguKotak(2);
cek('diajukan → email ke semua editor yang punya email', k.map(x => x.to).sort().join() === [`ed1@${D}`, `ed2@${D}`].join(), JSON.stringify(k.map(x => x.to)));
await reset();
await ed(`/api/naskah/${n}/aksi`, 'POST', { aksi: 'revisi', catatan: 'Tambah <b>foto</b>' });
k = await tungguKotak(1);
cek('revisi → email ke penulis dengan catatan', k.length === 1 && k[0].to === `rep1@${D}` && k[0].subject.includes('perlu revisi') && k[0].html.includes('Tambah &lt;b&gt;foto'), JSON.stringify(k.map(x => [x.to, x.subject])));
await rep(`/api/naskah/${n}/aksi`, 'POST', { aksi: 'ajukan' });
await tungguKotak(3); await reset();
await ed(`/api/naskah/${n}/aksi`, 'POST', { aksi: 'setujui' });
k = await tungguKotak(2);
cek('lolos editor → email ke semua Pemred (bukan editor)', k.map(x => x.to).sort().join() === [`216326@${D}`, `pem2@${D}`].join(), JSON.stringify(k.map(x => x.to)));
await reset();
await admin(`/api/naskah/${n}/aksi`, 'POST', { aksi: 'terbitkan' });
k = await tungguKotak(1);
cek('terbit → email ke penulis', k.length === 1 && k[0].to === `rep1@${D}` && k[0].subject.includes('terbit'));
await reset();
const n2 = (await admin('/api/naskah', 'POST', { jenis: 'berita', judul: 'Milik Pemred', rubrik_id: rb, isi: 'x' })).b.id;
await admin(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'ajukan' });
await admin(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'setujui' });
await admin(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'terbitkan' });
await tidur(1500); k = await kotak();
cek('pelaku tidak menerima email atas aksinya sendiri', !k.some(x => x.to === `216326@${D}`), JSON.stringify(k.map(x => [x.to, x.subject])));
cek('ajukan oleh pemred tetap memberi tahu editor', k.filter(x => x.subject.startsWith('Naskah perlu disunting')).length === 2);
cek('lolos oleh pemred → hanya pemred lain', k.filter(x => x.subject.startsWith('Menunggu persetujuan')).map(x => x.to).join() === `pem2@${D}`);
await reset();
const idR2 = await tambah('rep2', ['reporter']);
const tgs2 = (await ed('/api/tugas', 'POST', { judul: 'Pindah', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) })).b.id;
await tungguKotak(1); await reset();
await ed(`/api/tugas/${tgs2}`, 'PUT', { reporter_id: idR2 });
k = await tungguKotak(1);
cek('ganti reporter → reporter baru diberi tahu', k.length === 1 && k[0].to === `rep2@${D}`);

// --- pengingat tenggat (Cron)
await reset();
await ed('/api/tugas', 'POST', { judul: 'Besok tanpa email', jenis: 'berita', rubrik_id: rb, reporter_id: idRNis, tenggat: wib(1) });
const tB = (await ed('/api/tugas', 'POST', { judul: 'Tenggat besok', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(1) })).b.id;
await tungguKotak(1); await reset();
await cron(); await tidur(800); k = await kotak();
if (jamWib >= 6) cek('cron: pengingat H-1 terkirim (anggota tanpa email dilewati)', k.some(x => x.subject.startsWith('Pengingat: tenggat besok') && x.to === `rep1@${D}`) && k.every(x => x.to), JSON.stringify(k.map(x => x.subject)));
else cek('cron sebelum 06.00 WIB: belum ada pengingat', !k.some(x => x.subject.startsWith('Pengingat')));
await ed(`/api/tugas/${tB}`, 'PUT', { tenggat: wib(-1) });
await reset(); await cron(); await tidur(800); k = await kotak();
if (jamWib >= 6) {
  cek('cron: pemberitahuan terlambat', k.some(x => x.subject.startsWith('Tugas terlambat: Tenggat besok')), JSON.stringify(k.map(x => x.subject)));
  await reset(); await cron(); await tidur(800);
  cek('cron kedua: tidak dikirim dua kali', !(await kotak()).some(x => x.subject.startsWith('Tugas terlambat: Tenggat besok')));
  await ed(`/api/tugas/${tB}`, 'PUT', { tenggat: wib(-3) });
  await reset(); await cron(); await tidur(800);
  cek('tenggat diubah → pengingat dikirim lagi', (await kotak()).some(x => x.subject.startsWith('Tugas terlambat: Tenggat besok')));
}

// --- gagal kirim & coba ulang
await fetch(T + '/mode?gagal=1'); await reset();
await ed('/api/tugas', 'POST', { judul: 'Saat Gmail error', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) });
await tidur(1500);
e = (await admin('/api/email')).b;
let baris = e.terbaru.find(x => x.subjek.includes('Saat Gmail error'));
cek('Gmail error → tetap di antrean (menunggu, percobaan 1, galat tercatat)', baris?.status === 'menunggu' && baris?.percobaan === 1 && /500/.test(baris?.galat || ''), JSON.stringify(baris));
for (let i = 0; i < 4; i++) { await cron(); await tidur(500); }
baris = (await admin('/api/email')).b.terbaru.find(x => x.subjek.includes('Saat Gmail error'));
cek('setelah 5 percobaan → gagal permanen', baris?.status === 'gagal' && baris?.percobaan === 5, JSON.stringify(baris));
await fetch(T + '/mode?gagal=0');
r = await admin('/api/email/ulang', 'POST');
cek('kirim ulang yang gagal', r.b?.jumlah >= 1);
await cron(); await tidur(800);
cek('terkirim setelah Gmail pulih', (await kotak()).some(x => x.subject.includes('Saat Gmail error')));

// --- izin dicabut (invalid_grant)
await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-cabut', scope: SCOPE });
r = await admin('/api/email/uji', 'POST');
e = (await admin('/api/email')).b;
cek('izin dicabut → uji gagal & status putus + pesan', r.s === 502 && e.status === 'putus' && /Hubungkan ulang/.test(e.galat || ''), JSON.stringify({ s: r.s, st: e.status, g: e.galat }));
await reset();
await ed('/api/tugas', 'POST', { judul: 'Saat putus', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) });
await tidur(1000);
cek('saat putus: tidak ada yang dikirim/diantrekan', !(await kotak()).length && !(await admin('/api/email')).b.terbaru.some(x => x.subjek.includes('Saat putus')));
cek('hubungkan ulang memulihkan', (await hubungkan(kA, { klaim: klaim(`216326@${D}`), refresh_token: 'rt-2', scope: SCOPE })).loc === '/#email/ok' && (await admin('/api/email')).b.status === 'terhubung');
cek('putuskan', (await admin('/api/email/putus', 'POST')).s === 200);
e = (await admin('/api/email')).b;
cek('setelah putus: belum & nonaktif', e.status === 'belum' && e.aktif === false && !e.pengirim);
cek('aksi utama tetap jalan walau email nonaktif', (await ed('/api/tugas', 'POST', { judul: 'Normal', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(5) })).s === 201);

console.log(`\nLulus ${lulus}, gagal ${gagal} (jam WIB ${jamWib})`);
process.exit(gagal ? 1 : 0);
