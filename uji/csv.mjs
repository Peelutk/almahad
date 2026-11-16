// Uji upload CSV anggota + password awal tanpa hash (A-51..A-54), DB bersih.
const B = process.env.B || 'http://localhost:8794', D = 'daarululuumlido.com';
let lulus = 0, gagal = 0;
const cek = (n, ok, i = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const kukiDari = r => { const m = (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/); return m ? `am_sesi=${m[1]}` : null; };
function klien(k) {
  return async (p, m = 'GET', d) => {
    const r = await fetch(B + p, { method: m, redirect: 'manual', headers: { cookie: k || '', 'x-almahad': '1', ...(d !== undefined ? { 'content-type': 'application/json' } : {}) }, body: d === undefined ? undefined : JSON.stringify(d) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b, k: kukiDari(r) };
  };
}
const anon = klien(null);
const admin = klien(kukiDari(await fetch(`${B}/api/uji/masuk?email=216326@${D}&nama=Admin`)));
const csv = (teks, peran = 'reporter', simpan = false) => admin('/api/anggota/csv', 'POST', { teks, peran, simpan });
const s = r => JSON.stringify(r.b).slice(0, 300);

// --- akses & validasi dasar
cek('/api/saya memuat domain', (await admin('/api/saya')).b.domain === D);
const t0 = await admin('/api/anggota', 'POST', { nis: '3001', nama: 'Reporter Biasa', peran: ['reporter'] });
const kR = (await anon('/api/masuk', 'POST', { nis: '3001', sandi: '3001' })).k;
cek('bukan Admin ditolak', (await klien(kR)('/api/anggota/csv', 'POST', { teks: '1;a', peran: 'reporter' })).s === 403);
cek('tanpa login ditolak', (await anon('/api/anggota/csv', 'POST', { teks: '1;a', peran: 'reporter' })).s === 401);
cek('peran Admin ditolak', (await csv('4001;A;X', 'admin')).s === 400);
cek('peran tidak dikenal ditolak', (await csv('4001;A;X', 'ketua')).s === 400);
cek('teks kosong ditolak', (await csv('   ')).s === 400);
cek('hanya baris judul → ditolak', (await csv('NIS;Nama;Kelas\n')).s === 400);
const banyak = Array.from({ length: 501 }, (_, i) => `${50000 + i};Nama ${i};X`).join('\n');
cek('lebih dari 500 baris ditolak', (await csv(banyak)).s === 400);

// --- pratinjau
const teks = '﻿sep=;\r\nNIS;Nama;Kelas\r\n4001;Ahmad Satu;XI-A\r\n4002;"Budi; Dua";X-B\r\n\r\n4001;Ganda Di File;X\r\n3001;Sudah Ada;X\r\n;Tanpa NIS;X\r\nab cd;NIS Aneh;X\r\n4003;;X\r\n4004;Tanpa Kelas\r\n';
let p = await csv(teks, 'editor');
cek('pratinjau 200', p.s === 200, s(p));
const b = p.b.baris;
cek('jumlah: 3 baru, 2 dilewati, 3 salah', p.b.jumlah.baru === 3 && p.b.jumlah.dilewati === 2 && p.b.jumlah.salah === 3, JSON.stringify(p.b.jumlah));
cek('baris judul & sep= & baris kosong dilewati diam-diam', b.length === 8 && b[0].nis === '4001', JSON.stringify(b.map(x => x.nis)));
cek('nomor baris sesuai file', b[0].no === 3 && b[2].no === 6, JSON.stringify(b.map(x => x.no)));
cek('kutip dengan titik koma di dalamnya', b[1].nama === 'Budi; Dua' && b[1].status === 'baru');
cek('email otomatis NIS@domain', b[0].email === `4001@${D}`);
cek('NIS ganda di file dilewati', b[2].status === 'dilewati' && /ganda/.test(b[2].alasan));
cek('NIS terdaftar dilewati', b[3].status === 'dilewati' && /terdaftar/.test(b[3].alasan));
cek('NIS kosong salah', b[4].status === 'salah' && /kosong/.test(b[4].alasan));
cek('NIS aneh salah', b[5].status === 'salah');
cek('nama kosong salah', b[6].status === 'salah' && /Nama/.test(b[6].alasan));
cek('kolom kelas kosong boleh', b[7].status === 'baru' && b[7].kelas === '');
cek('pratinjau tidak menyimpan', !(await admin('/api/anggota')).b.some(a => a.nis === '4001'));

// --- simpan
p = await csv(teks, 'editor', true);
cek('simpan → 3 disimpan', p.s === 200 && p.b.disimpan === 3, s(p));
let ang = (await admin('/api/anggota')).b;
const a1 = ang.find(a => a.nis === '4001');
cek('anggota tersimpan: email, kelas, peran editor, periode aktif', a1 && a1.email === `4001@${D}` && a1.kelas === 'XI-A' && a1.peran.join() === 'editor' && a1.periode && a1.sandi_awal === true, JSON.stringify(a1));
cek('data lama tidak berubah', ang.find(a => a.nis === '3001').nama === 'Reporter Biasa');
p = await csv(teks, 'editor', true);
cek('simpan ulang file sama → tidak ada yang baru (400)', p.s === 400);
p = await csv('4001;X;X');
cek('ulang: NIS sudah ada dilewati', p.b.baris[0].status === 'dilewati');

// --- pemisah koma, email sudah dipakai, huruf besar/kecil
await admin('/api/anggota', 'POST', { nis: '9999', email: `4010@${D}`, nama: 'Pemilik Email', peran: ['reporter'] });
p = await csv('NIS,Nama,Kelas\n4010,Bentrok Email,X\nab4011,Huruf,X\nAB4011,Huruf Besar,X\n4012,"Kutip ""dalam""",X', 'pemred');
cek('pemisah koma terbaca', p.s === 200 && p.b.baris.length === 4, s(p));
cek('email sudah dipakai dilewati', p.b.baris[0].status === 'dilewati' && /Email/.test(p.b.baris[0].alasan));
cek('NIS ganda beda huruf dilewati', p.b.baris[2].status === 'dilewati');
cek('kutip ganda di dalam kutip', p.b.baris[3].nama === 'Kutip "dalam"');
p = await csv('NIS,Nama,Kelas\n4010,Bentrok Email,X\nab4011,Huruf,X\nAB4011,Huruf Besar,X\n4012,"Kutip ""dalam""",X', 'pemred', true);
cek('simpan pemred', p.b.disimpan === 2 && (await admin('/api/anggota')).b.find(a => a.nis === 'ab4011').peran.join() === 'pemred');
cek('email NIS huruf → huruf kecil', (await admin('/api/anggota')).b.find(a => a.nis === 'ab4011').email === `ab4011@${D}`);

// --- 500 baris sekaligus (batas CPU/kueri)
const lima = Array.from({ length: 500 }, (_, i) => `${60000 + i};Santri ${i};X`).join('\n');
p = await csv(lima, 'reporter', true);
cek('500 baris tersimpan sekaligus', p.s === 200 && p.b.disimpan === 500, s(p));

// --- password awal tanpa hash (A-54)
let m = await anon('/api/masuk', 'POST', { nis: '4001', sandi: 'salah' });
cek('anggota CSV: password salah ditolak', m.s === 400);
m = await anon('/api/masuk', 'POST', { nis: '4001', sandi: '4001' });
cek('anggota CSV: masuk dengan password awal = NIS', m.s === 200 && m.k);
const c1 = klien(m.k);
let saya = (await c1('/api/saya')).b;
cek('wajib ganti password + punya_sandi', saya.wajib_ganti_sandi === true && saya.punya_sandi === true, JSON.stringify(saya));
cek('fitur lain terkunci', (await c1('/api/naskah')).s === 403);
cek('ganti: password lama salah ditolak', (await c1('/api/sandi', 'POST', { lama: 'bukan', baru: 'sandi-baru-1' })).s === 400);
cek('ganti: lama = NIS diterima', (await c1('/api/sandi', 'POST', { lama: '4001', baru: 'sandi-baru-1' })).s === 200);
cek('NIS tidak lagi bisa dipakai', (await anon('/api/masuk', 'POST', { nis: '4001', sandi: '4001' })).s === 400);
cek('password baru bisa', (await anon('/api/masuk', 'POST', { nis: '4001', sandi: 'sandi-baru-1' })).s === 200);
m = await anon('/api/masuk', 'POST', { nis: 'AB4011', sandi: 'ab4011' });
cek('NIS huruf: login beda huruf besar/kecil', m.s === 200, s(m));
const idAB = (await admin('/api/anggota')).b.find(a => a.nis === 'ab4011').id;
await klien(m.k)('/api/sandi', 'POST', { lama: 'AB4011', baru: 'sandi-baru-2' });

// reset → kembali ke password awal tanpa hash
const id1 = (await admin('/api/anggota')).b.find(a => a.nis === '4001').id;
cek('reset password', (await admin(`/api/anggota/${id1}/reset-sandi`, 'POST')).s === 200);
cek('setelah reset: password lama ditolak', (await anon('/api/masuk', 'POST', { nis: '4001', sandi: 'sandi-baru-1' })).s === 400);
m = await anon('/api/masuk', 'POST', { nis: '4001', sandi: '4001' });
cek('setelah reset: NIS bisa + wajib ganti', m.s === 200 && (await klien(m.k)('/api/saya')).b.wajib_ganti_sandi === true);

// ubah NIS saat password masih awal → password awal ikut NIS baru
const id2 = (await admin('/api/anggota')).b.find(a => a.nis === '4002').id;
cek('ubah NIS', (await admin(`/api/anggota/${id2}`, 'PUT', { nis: '4020' })).s === 200);
cek('NIS lama tidak bisa', (await anon('/api/masuk', 'POST', { nis: '4002', sandi: '4002' })).s === 400);
cek('NIS baru = password awal', (await anon('/api/masuk', 'POST', { nis: '4020', sandi: '4020' })).s === 200);
// ubah NIS setelah password diganti → password tetap
cek('ubah NIS setelah ganti password', (await admin(`/api/anggota/${idAB}`, 'PUT', { nis: 'ab4099' })).s === 200);
cek('password pilihan sendiri tetap berlaku', (await anon('/api/masuk', 'POST', { nis: 'ab4099', sandi: 'sandi-baru-2' })).s === 200);
cek('NIS baru bukan password', (await anon('/api/masuk', 'POST', { nis: 'ab4099', sandi: 'ab4099' })).s === 400);

// tambah manual juga tanpa hash, tetap bisa masuk
await admin('/api/anggota', 'POST', { nis: '4100', nama: 'Manual', peran: ['reporter'] });
cek('tambah manual: password awal = NIS', (await anon('/api/masuk', 'POST', { nis: '4100', sandi: '4100' })).s === 200);

// penguncian tetap berlaku untuk password awal tanpa hash
for (let i = 0; i < 5; i++) await anon('/api/masuk', 'POST', { nis: '60001', sandi: 'salah' });
cek('5× salah → terkunci walau password benar', (await anon('/api/masuk', 'POST', { nis: '60001', sandi: '60001' })).s === 429);

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
