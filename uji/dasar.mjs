// Uji API dasar Al-Ma'had: masuk, anggota, peran, periode, daftar pilihan (DB bersih)
const B = process.env.B || 'http://localhost:8795';
let lulus = 0, gagal = 0;
const cek = (nama, ok, info = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${nama}${ok ? '' : ' :: ' + info}`); };

async function masuk(email, nama) {
  const r = await fetch(`${B}/api/uji/masuk?email=${encodeURIComponent(email)}&nama=${encodeURIComponent(nama || '')}`);
  const m = (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/);
  return { status: r.status, kuki: m ? `am_sesi=${m[1]}` : null, body: await r.json() };
}
function klien(kuki) {
  return async (jalur, cara = 'GET', data, tanpaHeader) => {
    const h = { cookie: kuki || '' };
    if (!tanpaHeader) h['x-almahad'] = '1';
    if (data !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(B + jalur, { method: cara, headers: h, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
    let body = null; try { body = await r.json(); } catch {}
    return { s: r.status, b: body, h: r.headers };
  };
}

// --- statis & tanpa login
let r = await fetch(B + '/');
cek('halaman utama tersaji', r.status === 200 && (await r.text()).includes('app.js'));
const anon = klien(null);
cek('saya tanpa login = 401', (await anon('/api/saya')).s === 401);
cek('anggota tanpa login = 401', (await anon('/api/anggota')).s === 401);
cek('rute api tak dikenal = 404', (await anon('/api/xyz')).s === 404);

// --- Google mulai
r = await fetch(B + '/api/google/mulai', { redirect: 'manual' });
const loc = r.headers.get('location') || '';
cek('google mulai → redirect ke Google', r.status === 302 && loc.startsWith('https://accounts.google.com/') && loc.includes('hd=daarululuumlido.com') && loc.includes(encodeURIComponent('/api/google/kembali')), loc);
cek('google mulai set cookie state', /am_state=.+HttpOnly; Secure; SameSite=Lax/.test(r.headers.get('set-cookie') || ''));
r = await fetch(B + '/api/google/kembali?code=x&state=salah', { redirect: 'manual' });
cek('google kembali state salah → galat', r.status === 302 && r.headers.get('location') === '/?galat=sesi_masuk', r.headers.get('location'));
r = await fetch(B + '/api/google/kembali?code=x&state=abc', { redirect: 'manual', headers: { cookie: 'am_state=abc' } });
cek('google kembali kode palsu → galat', ['/?galat=belum_diatur', '/?galat=google'].includes(r.headers.get('location')), r.headers.get('location'));

// --- admin awal
let m = await masuk('orang@daarululuumlido.com');
cek('email tak terdaftar ditolak', m.status === 403 && m.body.galat === 'belum_terdaftar');
m = await masuk('216326@daarululuumlido.com', 'Hong Khai');
cek('admin awal bisa masuk', m.status === 200 && !!m.kuki);
const admin = klien(m.kuki);
let s = await admin('/api/saya');
cek('admin awal = admin + pemred', s.s === 200 && s.b.peran.includes('admin') && s.b.peran.includes('pemred') && s.b.nama === 'Hong Khai', JSON.stringify(s.b));
cek('periode aktif bawaan 2026/2027', s.b.periode_aktif?.nama === '2026/2027');
const adminId = s.b.id;

// --- CSRF
cek('POST tanpa header x-almahad ditolak', (await admin('/api/anggota', 'POST', { email: 'a@daarululuumlido.com', nama: 'A', peran: ['reporter'] }, true)).s === 403);

// --- anggota
cek('tambah: email luar domain ditolak', (await admin('/api/anggota', 'POST', { email: 'x@gmail.com', nama: 'X', peran: ['reporter'] })).s === 400);
cek('tambah: peran kosong ditolak', (await admin('/api/anggota', 'POST', { email: 'x@daarululuumlido.com', nama: 'X', peran: [] })).s === 400);
cek('tambah: peran asing ditolak', (await admin('/api/anggota', 'POST', { email: 'x@daarululuumlido.com', nama: 'X', peran: ['raja'] })).s === 400);
cek('tambah: nama kosong ditolak', (await admin('/api/anggota', 'POST', { email: 'x@daarululuumlido.com', nama: '  ', peran: ['reporter'] })).s === 400);
let t = await admin('/api/anggota', 'POST', { email: 'Salman@daarululuumlido.com', nama: 'Salman', kelas: 'X', peran: ['reporter'] });
cek('tambah reporter', t.s === 201, JSON.stringify(t.b));
const salmanId = t.b.id;
cek('email ganda (beda huruf besar) ditolak', (await admin('/api/anggota', 'POST', { email: 'salman@daarululuumlido.com', nama: 'S', peran: ['reporter'] })).s === 409);
t = await admin('/api/anggota', 'POST', { email: 'rizki@daarululuumlido.com', nama: 'Rizki', peran: ['editor', 'admin'] });
cek('tambah anggota peran ganda', t.s === 201);
const rizkiId = t.b.id;
let daftar = (await admin('/api/anggota')).b;
cek('daftar anggota 3 orang', daftar.length === 3, daftar.length);
cek('peran ganda tersimpan', daftar.find(a => a.id === rizkiId).peran.sort().join() === 'admin,editor');
cek('anggota baru masuk periode aktif', daftar.find(a => a.id === salmanId).periode === '2026/2027');

m = await masuk('salman@daarululuumlido.com');
cek('reporter bisa masuk', m.status === 200);
const reporter = klien(m.kuki);
cek('reporter tidak bisa lihat anggota', (await reporter('/api/anggota')).s === 403);
cek('reporter tidak bisa ubah anggota', (await reporter(`/api/anggota/${salmanId}`, 'PUT', { peran: ['admin'] })).s === 403);
cek('reporter bisa baca daftar pilihan', (await reporter('/api/pilihan')).s === 200);
cek('reporter tidak bisa tambah pilihan', (await reporter('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: 'X' })).s === 403);
cek('reporter tidak bisa lihat periode', (await reporter('/api/periode')).s === 403);

cek('ubah nama & kelas', (await admin(`/api/anggota/${salmanId}`, 'PUT', { nama: 'Salman Hakim', kelas: 'XI' })).s === 200);
cek('ubah anggota tak ada → 404', (await admin('/api/anggota/999', 'PUT', { nama: 'Z' })).s === 404);
cek('admin awal boleh lepas admin (masih ada Rizki)', (await admin(`/api/anggota/${adminId}`, 'PUT', { peran: ['pemred'] })).s === 200);
const rizki = klien((await masuk('rizki@daarululuumlido.com')).kuki);
cek('admin terakhir (Rizki) tak bisa lepas admin', (await rizki(`/api/anggota/${rizkiId}`, 'PUT', { peran: ['editor'] })).s === 400);
cek('admin terakhir tak bisa diarsipkan', (await rizki(`/api/anggota/${rizkiId}`, 'PUT', { status: 'arsip' })).s === 400);
cek('Hong Khai (kini pemred saja) tak bisa kelola anggota', (await admin('/api/anggota')).s === 403);
cek('kembalikan admin ke Hong Khai', (await rizki(`/api/anggota/${adminId}`, 'PUT', { peran: ['admin', 'pemred'] })).s === 200);
cek('akses admin kembali (peran dibaca tiap permintaan)', (await admin('/api/anggota')).s === 200);
cek('admin awal tetap bisa masuk (akun sudah ada)', (await masuk('216326@daarululuumlido.com')).status === 200);

cek('arsipkan reporter', (await admin(`/api/anggota/${salmanId}`, 'PUT', { status: 'arsip' })).s === 200);
cek('sesi reporter terarsip langsung mati', (await reporter('/api/saya')).s === 401);
m = await masuk('salman@daarululuumlido.com');
cek('anggota arsip tak bisa masuk', m.status === 403 && m.body.galat === 'arsip');
cek('aktifkan kembali reporter', (await admin(`/api/anggota/${salmanId}`, 'PUT', { status: 'aktif' })).s === 200);
cek('reporter aktif lagi bisa masuk', (await masuk('salman@daarululuumlido.com')).status === 200);
cek('status tak valid ditolak', (await admin(`/api/anggota/${salmanId}`, 'PUT', { status: 'hapus' })).s === 400);

// --- daftar pilihan
let p = (await admin('/api/pilihan')).b;
cek('kelompok pilihan ada 2 dan kosong', Object.keys(p).join() === 'rubrik_berita,rubrik_majalah' && p.rubrik_berita.isi.length === 0);
for (const n of ['Kegiatan', 'Prestasi', 'Olahraga']) await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: n });
cek('pilihan ganda ditolak', (await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_berita', nilai: 'Prestasi' })).s === 409);
cek('kelompok asing ditolak', (await admin('/api/pilihan', 'POST', { kelompok: 'kelas', nilai: 'X' })).s === 400);
cek('kelompok __proto__ ditolak', (await admin('/api/pilihan', 'POST', { kelompok: '__proto__', nilai: 'X' })).s === 400);
cek('nilai sama di kelompok lain boleh', (await admin('/api/pilihan', 'POST', { kelompok: 'rubrik_majalah', nilai: 'Prestasi' })).s === 201);
p = (await admin('/api/pilihan')).b.rubrik_berita.isi;
cek('urutan awal sesuai tambah', p.map(x => x.nilai).join() === 'Kegiatan,Prestasi,Olahraga');
await admin('/api/pilihan/urutan', 'POST', { kelompok: 'rubrik_berita', ids: [p[2].id, p[0].id, p[1].id] });
let p2 = (await admin('/api/pilihan')).b.rubrik_berita.isi;
cek('urutan berubah', p2.map(x => x.nilai).join() === 'Olahraga,Kegiatan,Prestasi', p2.map(x => x.nilai).join());
cek('nonaktifkan pilihan', (await admin(`/api/pilihan/${p[0].id}`, 'PUT', { aktif: 0 })).s === 200);
cek('ganti nama ke nilai yang ada ditolak', (await admin(`/api/pilihan/${p[0].id}`, 'PUT', { nilai: 'Prestasi' })).s === 409);
cek('ganti nama pilihan', (await admin(`/api/pilihan/${p[0].id}`, 'PUT', { nilai: 'Kegiatan Pondok' })).s === 200);
p2 = (await admin('/api/pilihan')).b.rubrik_berita.isi.find(x => x.id === p[0].id);
cek('pilihan nonaktif & ganti nama tersimpan', p2.aktif === 0 && p2.nilai === 'Kegiatan Pondok');
cek('tidak ada DELETE pilihan', (await admin(`/api/pilihan/${p[0].id}`, 'DELETE')).s === 404);
await admin('/api/anggota', 'POST', { email: 'ahmad@daarululuumlido.com', nama: 'Ahmad', peran: ['pemred'] });
const pemred = klien((await masuk('ahmad@daarululuumlido.com')).kuki);
cek('pemred bisa tambah pilihan', (await pemred('/api/pilihan', 'POST', { kelompok: 'rubrik_majalah', nilai: 'Opini' })).s === 201);
cek('pemred tidak bisa kelola anggota', (await pemred('/api/anggota')).s === 403);

// --- periode
cek('tambah periode', (await admin('/api/periode', 'POST', { nama: '2027/2028' })).s === 201);
cek('periode ganda ditolak', (await admin('/api/periode', 'POST', { nama: '2027/2028' })).s === 409);
let per = (await admin('/api/periode')).b;
const baru = per.find(x => x.nama === '2027/2028');
cek('periode baru belum aktif', baru && baru.aktif === 0);
cek('ganti nama periode', (await admin(`/api/periode/${baru.id}`, 'PUT', { nama: '2027-2028' })).s === 200);
cek('aktifkan periode baru', (await admin(`/api/periode/${baru.id}/aktifkan`, 'POST', { lanjut: [rizkiId] })).s === 200);
daftar = (await admin('/api/anggota')).b;
const st = n => daftar.find(a => a.nama.startsWith(n));
cek('yang lanjut pindah periode', st('Rizki').status === 'aktif' && st('Rizki').periode === '2027-2028' && st('Hong').periode === '2027-2028');
cek('yang tidak lanjut diarsip', st('Salman').status === 'arsip' && st('Ahmad').status === 'arsip');
cek('sesi pemred terarsip mati', (await pemred('/api/saya')).s === 401);
per = (await admin('/api/periode')).b;
cek('hanya satu periode aktif', per.filter(x => x.aktif).length === 1 && per.find(x => x.aktif).id === baru.id);
cek('aktifkan periode yang sudah aktif ditolak', (await admin(`/api/periode/${baru.id}/aktifkan`, 'POST', { lanjut: [] })).s === 400);
cek('aktifkan kembali arsip → periode aktif', (await admin(`/api/anggota/${salmanId}`, 'PUT', { status: 'aktif' })).s === 200 &&
  (await admin('/api/anggota')).b.find(a => a.id === salmanId).periode === '2027-2028');

cek('keluar', (await admin('/api/keluar', 'POST')).s === 200);
cek('sesi setelah keluar mati', (await admin('/api/saya')).s === 401);
cek('JSON rusak → 400', (await rizki('/api/periode', 'POST', undefined)).s === 400);

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
