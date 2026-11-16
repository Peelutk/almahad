// Uji modul redaksi Al-Ma'had (tugas, naskah, antrean, edisi) — DB bersih
const B = process.env.B || 'http://localhost:8796';
let lulus = 0, gagal = 0;
const cek = (nama, ok, info = '') => { ok ? lulus++ : gagal++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${nama}${ok ? '' : ' :: ' + info}`); };
async function masuk(email) {
  const r = await fetch(`${B}/api/uji/masuk?email=${encodeURIComponent(email)}&nama=Hong%20Khai`);
  const m = (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/);
  if (!m) throw new Error('gagal masuk ' + email + ' ' + r.status);
  return klien(`am_sesi=${m[1]}`);
}
function klien(kuki) {
  return async (jalur, cara = 'GET', data) => {
    const h = { cookie: kuki, 'x-almahad': '1' };
    if (data !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(B + jalur, { method: cara, headers: h, body: data === undefined ? undefined : JSON.stringify(data) });
    let b = null; try { b = await r.json(); } catch {}
    return { s: r.status, b };
  };
}
const wib = d => new Date(Date.now() + 7 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const D = 'daarululuumlido.com';

const pemred = await masuk(`216326@${D}`);
const tambah = async (u, peran) => (await pemred('/api/anggota', 'POST', { email: `${u}@${D}`, nama: u, peran })).b.id;
const idEd = await tambah('editor1', ['editor']);
const idR1 = await tambah('rep1', ['reporter']);
const idR2 = await tambah('rep2', ['reporter']);
await tambah('adm', ['admin']);
const editor = await masuk(`editor1@${D}`), r1 = await masuk(`rep1@${D}`), r2 = await masuk(`rep2@${D}`), adm = await masuk(`adm@${D}`);
const rub = async (k, n) => (await pemred('/api/pilihan', 'POST', { kelompok: k, nilai: n })).b.id;
const rbKeg = await rub('rubrik_berita', 'Kegiatan'), rbLama = await rub('rubrik_berita', 'Lama');
const rmOpini = await rub('rubrik_majalah', 'Opini'), rmSosok = await rub('rubrik_majalah', 'Sosok');
await pemred(`/api/pilihan/${rbLama}`, 'PUT', { aktif: 0 });

cek('admin murni tidak bisa akses tugas', (await adm('/api/tugas')).s === 403);
cek('admin murni tidak bisa akses ringkasan', (await adm('/api/ringkasan')).s === 403);

// --- tugas
const tgsBaru = { judul: 'Liputan lomba', keterangan: 'Wawancara juara', jenis: 'berita', rubrik_id: rbKeg, reporter_id: idR1, tenggat: wib(3) };
cek('reporter tidak bisa beri tugas', (await r1('/api/tugas', 'POST', tgsBaru)).s === 403);
cek('reporter tidak bisa lihat daftar reporter', (await r1('/api/reporter')).s === 403);
cek('editor lihat daftar reporter', (await editor('/api/reporter')).b?.length === 2);
cek('tenggat kosong ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, tenggat: '' })).s === 400);
cek('tenggat masa lalu ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, tenggat: wib(-1) })).s === 400);
cek('tenggat tanggal ngawur ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, tenggat: '2026-13-45' })).s === 400);
cek('rubrik tak sesuai jenis ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, rubrik_id: rmOpini })).s === 400);
cek('rubrik nonaktif ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, rubrik_id: rbLama })).s === 400);
cek('penerima bukan reporter ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, reporter_id: idEd })).s === 400);
let t = await editor('/api/tugas', 'POST', tgsBaru);
cek('editor beri tugas', t.s === 201, JSON.stringify(t.b));
const tgs1 = t.b.id;
const tgs2 = (await pemred('/api/tugas', 'POST', { ...tgsBaru, judul: 'Tugas kedua', reporter_id: idR2 })).b.id;
const tgs3 = (await pemred('/api/tugas', 'POST', { ...tgsBaru, judul: 'Tugas dibatalkan' })).b.id;
let lr1 = (await r1('/api/tugas')).b;
cek('reporter hanya lihat tugasnya', lr1.length === 2 && lr1.every(x => x.reporter_id === idR1));
cek('editor lihat semua tugas', (await editor('/api/tugas')).b.length === 3);
cek('tugas baru tidak terlambat', lr1.every(x => !x.terlambat));
cek('ubah tenggat ke masa lalu → terlambat', (await editor(`/api/tugas/${tgs3}`, 'PUT', { tenggat: wib(-2) })).s === 200 &&
  (await r1('/api/tugas')).b.find(x => x.id === tgs3).terlambat === true);
cek('ringkasan: tugas terlambat terhitung', (await r1('/api/ringkasan')).b.tugas_terlambat === 1);
cek('reporter tidak bisa ubah tugas', (await r1(`/api/tugas/${tgs1}`, 'PUT', { judul: 'x' })).s === 403);
cek('status tugas tak bisa diubah langsung', (await editor(`/api/tugas/${tgs1}`, 'PUT', { status: 'selesai' })).s === 400);
cek('batalkan tugas tanpa naskah', (await editor(`/api/tugas/${tgs3}`, 'PUT', { status: 'batal' })).s === 200);
cek('tugas batal tidak bisa diubah', (await editor(`/api/tugas/${tgs3}`, 'PUT', { judul: 'y' })).s === 400);

// --- naskah dari tugas
const nsk = { jenis: 'berita', judul: 'Juara Lomba', rubrik_id: rbKeg, isi: '', tugas_id: tgs1 };
cek('naskah: jenis beda dengan tugas ditolak', (await r1('/api/naskah', 'POST', { ...nsk, jenis: 'majalah', rubrik_id: rmOpini })).s === 400);
cek('naskah: tugas orang lain ditolak', (await r2('/api/naskah', 'POST', nsk)).s === 400);
cek('naskah: tugas batal ditolak', (await r1('/api/naskah', 'POST', { ...nsk, tugas_id: tgs3 })).s === 400);
cek('naskah: foto javascript: ditolak', (await r1('/api/naskah', 'POST', { ...nsk, foto: [{ tautan: 'javascript:alert(1)' }] })).s === 400);
cek('naskah: foto bukan URL ditolak', (await r1('/api/naskah', 'POST', { ...nsk, foto: [{ tautan: 'foto saya' }] })).s === 400);
cek('naskah: admin murni tidak bisa menulis', (await adm('/api/naskah', 'POST', nsk)).s === 403);
let n = await r1('/api/naskah', 'POST', { ...nsk, foto: [{ tautan: 'https://drive.google.com/x', keterangan: 'Juara' }] });
cek('reporter buat naskah dari tugas', n.s === 201, JSON.stringify(n.b));
const n1 = n.b.id;
cek('tugas jadi dikerjakan', (await r1('/api/tugas')).b.find(x => x.id === tgs1).status === 'dikerjakan');
cek('tugas yang sama tak bisa dipakai lagi', (await r1('/api/naskah', 'POST', nsk)).s === 409);
cek('draf tak terlihat reporter lain', (await r2(`/api/naskah/${n1}`)).s === 404);
cek('draf tak terlihat editor', (await editor(`/api/naskah/${n1}`)).s === 404);
cek('draf tak ada di daftar editor', !(await editor('/api/naskah')).b.some(x => x.id === n1));
let d = (await r1(`/api/naskah/${n1}`)).b;
cek('detail: foto, riwayat, tugas, aksi', d.foto.length === 1 && d.riwayat[0].catatan === 'Dibuat dari tugas' && d.tugas.id === tgs1 && d.aksi.join() === 'ajukan' && d.boleh_ubah, JSON.stringify(d));
cek('ajukan isi kosong ditolak', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'ajukan' })).s === 400);
cek('penulis ubah isi', (await r1(`/api/naskah/${n1}`, 'PUT', { isi: 'Paragraf satu.\n\nParagraf dua.' })).s === 200);
cek('aksi tak dikenal ditolak', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'hapus' })).s === 400);
cek('aksi __proto__ ditolak', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: '__proto__' })).s === 400);
cek('reporter tak bisa setujui', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'setujui' })).s === 400);
cek('ajukan', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'ajukan' })).b?.status === 'diajukan');
cek('tugas jadi selesai saat diajukan', (await r1('/api/tugas')).b.find(x => x.id === tgs1).status === 'selesai');
cek('tugas selesai tak bisa diubah', (await editor(`/api/tugas/${tgs1}`, 'PUT', { judul: 'z' })).s === 400);
cek('penulis tak bisa ubah saat diajukan', (await r1(`/api/naskah/${n1}`, 'PUT', { isi: 'ubah' })).s === 403);
cek('draf tak bisa dihapus setelah diajukan', (await r1(`/api/naskah/${n1}`, 'DELETE')).s === 400);
cek('ringkasan editor: 1 perlu sunting', (await editor('/api/ringkasan')).b.perlu_sunting === 1);
cek('editor sunting naskah', (await editor(`/api/naskah/${n1}`, 'PUT', { isi: 'Paragraf satu (disunting).\n\nParagraf dua.' })).s === 200);
await editor(`/api/naskah/${n1}`, 'PUT', { judul: 'Juara Lomba Pidato' });
d = (await editor(`/api/naskah/${n1}`)).b;
cek('riwayat mencatat Disunting sekali saja', d.riwayat.filter(h => h.catatan === 'Disunting').length === 1);
cek('aksi editor: revisi, setujui, tolak', d.aksi.sort().join() === 'revisi,setujui,tolak', d.aksi.join());
cek('revisi tanpa catatan ditolak', (await editor(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'revisi' })).s === 400);
cek('editor minta revisi', (await editor(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'revisi', catatan: 'Tambah skor' })).s === 200);
cek('ringkasan reporter: 1 perlu revisi', (await r1('/api/ringkasan')).b.naskah_revisi === 1);
cek('penulis ubah saat revisi', (await r1(`/api/naskah/${n1}`, 'PUT', { isi: 'Skor 3-1.\n\nParagraf dua.' })).s === 200);
cek('editor tak bisa ubah saat revisi', (await editor(`/api/naskah/${n1}`, 'PUT', { isi: 'x' })).s === 403);
cek('ajukan ulang', (await r1(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'ajukan' })).s === 200);
cek('editor setujui → lolos', (await editor(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'setujui' })).b?.status === 'lolos');
cek('editor tak bisa terbitkan', (await editor(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'terbitkan' })).s === 403);
cek('editor tak bisa ubah saat lolos', (await editor(`/api/naskah/${n1}`, 'PUT', { isi: 'x' })).s === 403);
cek('setujui dua kali ditolak', (await editor(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'setujui' })).s === 400);
cek('ringkasan pemred: 1 menunggu', (await pemred('/api/ringkasan')).b.perlu_setuju === 1);
cek('pemred terbitkan', (await pemred(`/api/naskah/${n1}/aksi`, 'POST', { aksi: 'terbitkan' })).b?.status === 'terbit');
cek('naskah terbit terlihat reporter lain', (await r2(`/api/naskah/${n1}`)).s === 200);
cek('naskah terbit tak bisa diubah siapa pun', (await pemred(`/api/naskah/${n1}`, 'PUT', { isi: 'x' })).s === 403);
cek('naskah terbit tanpa aksi', (await pemred(`/api/naskah/${n1}`)).b.aksi.length === 0);
d = (await r1(`/api/naskah/${n1}`)).b;
cek('riwayat lengkap (7 entri)', d.riwayat.length === 7, d.riwayat.map(h => h.ke_status).join());

// --- naskah tanpa tugas, tolak, hapus
n = await r2('/api/naskah', 'POST', { jenis: 'berita', judul: 'Inisiatif', rubrik_id: rbKeg, isi: 'Isi' });
cek('naskah tanpa tugas boleh (A-17)', n.s === 201);
const n2 = n.b.id;
cek('rubrik nonaktif ditolak saat ubah', (await r2(`/api/naskah/${n2}`, 'PUT', { rubrik_id: rbLama })).s === 400);
cek('hapus draf orang lain → 404', (await r1(`/api/naskah/${n2}`, 'DELETE')).s === 404);
await r2(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'ajukan' });
cek('tolak tanpa catatan ditolak', (await editor(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'tolak' })).s === 400);
cek('editor tolak', (await editor(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'tolak', catatan: 'Tidak layak' })).b?.status === 'ditolak');
cek('ditolak tak bisa diajukan lagi', (await r2(`/api/naskah/${n2}/aksi`, 'POST', { aksi: 'ajukan' })).s === 400);
n = await r2('/api/naskah', 'POST', { jenis: 'berita', judul: 'Dari tugas lalu dihapus', rubrik_id: rbKeg, tugas_id: tgs2 });
cek('naskah dari tugas2', n.s === 201);
cek('tugas punya naskah tak bisa dibatalkan', (await editor(`/api/tugas/${tgs2}`, 'PUT', { status: 'batal' })).s === 400);
cek('reporter tak bisa diganti setelah ada naskah', (await editor(`/api/tugas/${tgs2}`, 'PUT', { reporter_id: idR1 })).s === 400);
cek('hapus draf sendiri', (await r2(`/api/naskah/${n.b.id}`, 'DELETE')).s === 200);
cek('tugas kembali baru setelah draf dihapus', (await r2('/api/tugas')).b.find(x => x.id === tgs2).status === 'baru');
cek('naskah terhapus → 404', (await r2(`/api/naskah/${n.b.id}`)).s === 404);

// --- pemred menyetujui naskah sendiri (A-15) — naskah majalah
const majalah = [];
for (const [judul, rb] of [['Opini A', rmOpini], ['Sosok B', rmSosok], ['Opini C', rmOpini]]) {
  const id = (await pemred('/api/naskah', 'POST', { jenis: 'majalah', judul, rubrik_id: rb, isi: 'Isi ' + judul, foto: [{ tautan: 'https://contoh.id/f.jpg' }] })).b.id;
  for (const aksi of ['ajukan', 'setujui', 'terbitkan']) await pemred(`/api/naskah/${id}/aksi`, 'POST', { aksi });
  majalah.push(id);
}
cek('pemred bisa menyetujui & menerbitkan naskah sendiri', (await pemred(`/api/naskah/${majalah[0]}`)).b.status === 'terbit');
const mDraf = (await r1('/api/naskah', 'POST', { jenis: 'majalah', judul: 'Belum terbit', rubrik_id: rmOpini, isi: 'x' })).b.id;

// --- edisi
cek('editor tidak bisa akses edisi', (await editor('/api/edisi')).s === 403);
cek('reporter tidak bisa akses edisi', (await r1('/api/edisi')).s === 403);
cek('edisi tanpa nomor ditolak', (await pemred('/api/edisi', 'POST', { nomor: '' })).s === 400);
let e = await pemred('/api/edisi', 'POST', { nomor: 'No. 1', tema: 'Bahasa', bulan_terbit: 'Desember 2026' });
cek('buat edisi', e.s === 201);
const e1 = e.b.id;
cek('nomor edisi ganda ditolak', (await pemred('/api/edisi', 'POST', { nomor: 'No. 1' })).s === 409);
let ed = (await pemred(`/api/edisi/${e1}`)).b;
cek('calon = naskah majalah terbit saja', ed.calon.map(x => x.id).sort().join() === [...majalah].sort().join(), JSON.stringify(ed.calon.map(x => x.id)));
cek('kunci edisi kosong ditolak', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'dikunci' })).s === 400);
cek('masukkan naskah berita ditolak', (await pemred(`/api/edisi/${e1}/naskah`, 'POST', { naskah_id: n1 })).s === 400);
cek('masukkan naskah majalah belum terbit ditolak', (await pemred(`/api/edisi/${e1}/naskah`, 'POST', { naskah_id: mDraf })).s === 400);
for (const id of majalah) await pemred(`/api/edisi/${e1}/naskah`, 'POST', { naskah_id: id });
cek('masukkan naskah yang sama dua kali ditolak', (await pemred(`/api/edisi/${e1}/naskah`, 'POST', { naskah_id: majalah[0] })).s === 409);
const e2 = (await pemred('/api/edisi', 'POST', { nomor: 'No. 2' })).b.id;
cek('naskah tak bisa masuk dua edisi', (await pemred(`/api/edisi/${e2}/naskah`, 'POST', { naskah_id: majalah[0] })).s === 409);
await pemred(`/api/edisi/${e1}/urutan`, 'POST', { ids: [majalah[2], majalah[0], majalah[1]] });
ed = (await pemred(`/api/edisi/${e1}`)).b;
cek('urutan edisi berubah', ed.naskah.map(x => x.id).join() === [majalah[2], majalah[0], majalah[1]].join());
cek('detail edisi membawa isi & foto untuk cetak', ed.naskah[0].isi.startsWith('Isi') && ed.naskah[0].foto.length === 1);
cek('keluarkan naskah', (await pemred(`/api/edisi/${e1}/naskah/${majalah[1]}`, 'DELETE')).s === 200);
cek('naskah keluar kembali jadi calon', (await pemred(`/api/edisi/${e1}`)).b.calon.some(x => x.id === majalah[1]));
cek('daftar naskah menampilkan edisi', (await pemred('/api/naskah')).b.find(x => x.id === majalah[0]).edisi === 'No. 1');
cek('kunci edisi', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'dikunci' })).s === 200);
cek('masukkan saat dikunci ditolak', (await pemred(`/api/edisi/${e1}/naskah`, 'POST', { naskah_id: majalah[1] })).s === 400);
cek('urutan saat dikunci ditolak', (await pemred(`/api/edisi/${e1}/urutan`, 'POST', { ids: [majalah[0]] })).s === 400);
cek('buka kunci', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'disusun' })).s === 200);
cek('dari disusun langsung terbit ditolak', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'terbit' })).s === 400);
await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'dikunci' });
cek('tandai terbit', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'terbit' })).s === 200);
cek('edisi terbit tak bisa diubah', (await pemred(`/api/edisi/${e1}`, 'PUT', { tema: 'x' })).s === 400);
cek('edisi terbit tak bisa dibuka kunci', (await pemred(`/api/edisi/${e1}/status`, 'POST', { status: 'disusun' })).s === 400);
cek('ubah edisi lain (nomor bentrok) ditolak', (await pemred(`/api/edisi/${e2}`, 'PUT', { nomor: 'No. 1' })).s === 409);
cek('ubah edisi lain', (await pemred(`/api/edisi/${e2}`, 'PUT', { tema: 'Tema 2' })).s === 200);
cek('daftar edisi + jumlah', (await pemred('/api/edisi')).b.find(x => x.id === e1).jumlah === 2);

// --- arsip penulis: naskahnya tetap ada
await pemred(`/api/anggota/${idR1}`, 'PUT', { status: 'arsip' });
cek('naskah penulis terarsip tetap tampil', (await pemred(`/api/naskah/${n1}`)).b.penulis === 'rep1');
cek('reporter arsip tidak muncul di daftar reporter', !(await editor('/api/reporter')).b.some(x => x.id === idR1));
cek('tugas ke reporter arsip ditolak', (await editor('/api/tugas', 'POST', { ...tgsBaru, reporter_id: idR1 })).s === 400);
cek('rute tak dikenal tetap 404', (await pemred('/api/naskah/abc')).s === 404);

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
