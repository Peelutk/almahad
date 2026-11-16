// Uji login NIS + password Al-Ma'had (DB bersih)
const B = process.env.B || 'http://localhost:8797', D = 'daarululuumlido.com';
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const kukiDari = r => { const m = (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/); return m ? `am_sesi=${m[1]}` : null; };
function klien(k) {
  return async (p, m = 'GET', d, tanpaHeader) => {
    const r = await fetch(B + p, { method: m, redirect: 'manual', headers: { cookie: k || '', ...(tanpaHeader ? {} : { 'x-almahad': '1' }), ...(d !== undefined ? { 'content-type': 'application/json' } : {}) }, body: d === undefined ? undefined : JSON.stringify(d) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b, k: kukiDari(r) };
  };
}
const anon = klien(null);
const masuk = (nis, sandi) => anon('/api/masuk', 'POST', { nis, sandi });
let gagalIp = 0; // hitung percobaan gagal dari "IP" uji (batas 20 / 15 menit)
async function masukSalah(nis, sandi) { gagalIp++; return masuk(nis, sandi); }

const kA = kukiDari(await fetch(`${B}/api/uji/masuk?email=216326@${D}&nama=Admin`));
const admin = klien(kA);
const wib = d => new Date(Date.now() + 7 * 3600e3 + d * 864e5).toISOString().slice(0, 10);

// --- tambah anggota
cek('tanpa NIS dan email ditolak', (await admin('/api/anggota', 'POST', { nama: 'X', peran: ['reporter'] })).s === 400);
cek('NIS tidak valid ditolak', (await admin('/api/anggota', 'POST', { nis: 'ab cd!', nama: 'X', peran: ['reporter'] })).s === 400);
cek('NIS terlalu pendek ditolak', (await admin('/api/anggota', 'POST', { nis: '12', nama: 'X', peran: ['reporter'] })).s === 400);
cek('email luar domain tetap ditolak', (await admin('/api/anggota', 'POST', { nis: '1001', email: 'a@gmail.com', nama: 'X', peran: ['reporter'] })).s === 400);
let t = await admin('/api/anggota', 'POST', { nis: '1001', nama: 'Rep NIS', kelas: 'X', peran: ['reporter'] });
cek('tambah anggota hanya NIS (tanpa email)', t.s === 201, JSON.stringify(t.b));
const idR = t.b.id;
cek('NIS ganda ditolak', (await admin('/api/anggota', 'POST', { nis: '1001', nama: 'Y', peran: ['reporter'] })).s === 409);
cek('NIS ganda (beda huruf besar) ditolak', (await admin('/api/anggota', 'POST', { nis: 'AB77', nama: 'Y', peran: ['reporter'] })).s === 201 &&
  (await admin('/api/anggota', 'POST', { nis: 'ab77', nama: 'Z', peran: ['reporter'] })).s === 409);
const idE = (await admin('/api/anggota', 'POST', { nis: '2002', email: `ed@${D}`, nama: 'Editor Dua Cara', peran: ['editor'] })).b.id;
let ang = (await admin('/api/anggota')).b;
let r1 = ang.find(a => a.id === idR);
cek('daftar: NIS tampil, email kosong, password awal', r1.nis === '1001' && r1.email === null && r1.sandi_awal === true && r1.terkunci === false, JSON.stringify(r1));

// --- masuk NIS
let m = await masukSalah('1001', 'salah');
cek('password salah → pesan umum', m.s === 400 && m.b.galat === 'NIS atau password salah.');
m = await masukSalah('9999', 'apa');
cek('NIS tak dikenal → pesan sama (tidak membocorkan)', m.s === 400 && m.b.galat === 'NIS atau password salah.');
cek('masuk tanpa header CSRF ditolak', (await anon('/api/masuk', 'POST', { nis: '1001', sandi: '1001' }, true)).s === 403);
cek('NIS/password kosong ditolak', (await masuk('', '')).s === 400);
m = await masuk('1001', '1001');
cek('masuk dengan password awal (= NIS)', m.s === 200 && !!m.k, JSON.stringify(m.b));
const rep1 = klien(m.k);
let s = (await rep1('/api/saya')).b;
cek('saya: wajib ganti password', s.wajib_ganti_sandi === true && s.nis === '1001' && s.punya_sandi === true, JSON.stringify(s));
cek('API lain ditolak sebelum ganti password', (await rep1('/api/tugas')).s === 403 && (await rep1('/api/naskah')).s === 403);
cek('ringkasan juga ditolak', (await rep1('/api/ringkasan')).s === 403);
const sesiLain = klien((await masuk('1001', '1001')).k);
cek('ganti: password lama salah ditolak', (await rep1('/api/sandi', 'POST', { lama: 'x', baru: 'rahasia-baru-1' })).s === 400);
cek('ganti: password baru < 8 ditolak', (await rep1('/api/sandi', 'POST', { lama: '1001', baru: 'pendek' })).s === 400);
cek('ganti: password baru = NIS ditolak', (await rep1('/api/sandi', 'POST', { lama: '1001', baru: '1001' })).s === 400);
cek('ganti password berhasil', (await rep1('/api/sandi', 'POST', { lama: '1001', baru: 'rahasia-baru-1' })).s === 200);
s = (await rep1('/api/saya')).b;
cek('setelah ganti: tidak wajib lagi, sesi tetap', s.wajib_ganti_sandi === false);
cek('setelah ganti: akses normal', (await rep1('/api/tugas')).s === 200);
cek('sesi lain milik anggota ini diakhiri', (await sesiLain('/api/saya')).s === 401);
cek('password lama (NIS) tidak berlaku lagi', (await masukSalah('1001', '1001')).s === 400);
m = await masuk('1001', 'rahasia-baru-1');
cek('masuk dengan password baru, tanpa wajib ganti', m.s === 200 && (await klien(m.k)('/api/saya')).b.wajib_ganti_sandi === false);
cek('daftar admin: password sudah diganti', (await admin('/api/anggota')).b.find(a => a.id === idR).sandi_awal === false);

// --- anggota dengan email + NIS: lewat Google tidak dipaksa ganti
const kE = kukiDari(await fetch(`${B}/api/uji/masuk?email=ed@${D}`));
s = (await klien(kE)('/api/saya')).b;
cek('masuk via Google tidak dipaksa ganti password', s.wajib_ganti_sandi === false && s.nis === '2002');
m = await masuk('2002', '2002');
cek('anggota yang sama via NIS dipaksa ganti', m.s === 200 && (await klien(m.k)('/api/saya')).b.wajib_ganti_sandi === true);
cek('admin tanpa NIS tidak bisa set password', (await admin('/api/sandi', 'POST', { lama: '', baru: 'apa-saja-123' })).s === 400);

// --- ubah NIS saat masih password awal → password awal ikut NIS baru
cek('ubah NIS', (await admin(`/api/anggota/${idE}`, 'PUT', { nis: '2003' })).s === 200);
cek('NIS lama tak bisa dipakai', (await masukSalah('2002', '2002')).s === 400);
cek('password awal = NIS baru', (await masuk('2003', '2003')).s === 200);
cek('ubah: hapus email & NIS sekaligus ditolak', (await admin(`/api/anggota/${idE}`, 'PUT', { nis: '', email: '' })).s === 400);
cek('ubah: NIS milik orang lain ditolak', (await admin(`/api/anggota/${idE}`, 'PUT', { nis: '1001' })).s === 409);
cek('ubah: hapus email (NIS tetap) boleh', (await admin(`/api/anggota/${idE}`, 'PUT', { email: '' })).s === 200 &&
  (await admin('/api/anggota')).b.find(a => a.id === idE).email === null);
cek('setelah email dihapus, Google tak bisa lagi', (await fetch(`${B}/api/uji/masuk?email=ed@${D}`)).status === 403);
cek('tambah email lagi', (await admin(`/api/anggota/${idE}`, 'PUT', { email: `ed@${D}` })).s === 200);

// --- penguncian akun
for (let i = 0; i < 5; i++) await masukSalah('1001', 'salah-' + i);
m = await masuk('1001', 'rahasia-baru-1');
cek('setelah 5x salah: akun dikunci walau password benar', m.s === 429 && /dikunci/.test(m.b.galat), JSON.stringify(m.b));
cek('daftar admin: terkunci', (await admin('/api/anggota')).b.find(a => a.id === idR).terkunci === true);
cek('reporter bukan admin tidak bisa reset', (await rep1(`/api/anggota/${idR}/reset-sandi`, 'POST')).s === 403);
cek('admin reset password', (await admin(`/api/anggota/${idR}/reset-sandi`, 'POST')).s === 200);
cek('reset mengakhiri sesi anggota', (await rep1('/api/saya')).s === 401);
m = await masuk('1001', '1001');
cek('setelah reset: masuk dengan NIS & wajib ganti lagi', m.s === 200 && (await klien(m.k)('/api/saya')).b.wajib_ganti_sandi === true);
const idTanpaNis = (await admin('/api/anggota', 'POST', { email: `tanpanis@${D}`, nama: 'Tanpa NIS', peran: ['reporter'] })).b.id;
cek('reset anggota tanpa NIS ditolak', (await admin(`/api/anggota/${idTanpaNis}/reset-sandi`, 'POST')).s === 400);

// --- arsip
await admin(`/api/anggota/${idR}`, 'PUT', { status: 'arsip' });
m = await masuk('1001', '1001');
cek('anggota arsip ditolak walau password benar', m.s === 403 && /diarsipkan/.test(m.b.galat));
await admin(`/api/anggota/${idR}`, 'PUT', { status: 'aktif' });

// --- anggota tanpa email ikut alur redaksi tanpa galat
const rb = (await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: 'Kegiatan' })).b.id;
const kR = (await masuk('1001', '1001')).k; const rep2 = klien(kR);
await rep2('/api/sandi', 'POST', { lama: '1001', baru: 'rahasia-baru-2' });
const tg = await admin('/api/tugas', 'POST', { judul: 'Untuk reporter tanpa email', jenis: 'berita', rubrik_id: rb, reporter_id: idR, tenggat: wib(1) });
cek('tugas ke anggota tanpa email', tg.s === 201);
const n = await rep2('/api/naskah', 'POST', { jenis: 'berita', judul: 'Naskah NIS', rubrik_id: rb, isi: 'isi', tugas_id: tg.b.id });
cek('anggota NIS menulis & mengajukan naskah', n.s === 201 && (await rep2(`/api/naskah/${n.b.id}/aksi`, 'POST', { aksi: 'ajukan' })).s === 200);

// --- batas per perangkat (IP): 20 gagal / 15 menit
while (gagalIp < 20) await masukSalah('8888', 'x');
m = await masuk('1001', 'rahasia-baru-2');
cek('setelah 20 gagal dari perangkat yang sama: ditahan', m.s === 429 && /perangkat/.test(m.b.galat), JSON.stringify(m.b));
cek('login Google tidak terpengaruh batas perangkat', (await fetch(`${B}/api/uji/masuk?email=216326@${D}`)).status === 200);

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
