// Uji folder arsip edisi di Google Drive (A-67..A-70) — DB bersih, tiruan-google.mjs di :8791.
const B = process.env.B || 'http://localhost:8790', T = 'http://127.0.0.1:8791';
const CID = '272243653251-t44feo34jks8603qa3sb0e9l9qthun3b.apps.googleusercontent.com', D = 'daarululuumlido.com';
const S = 'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/drive.file';
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
async function hubungkan(k, email, rt) {
  const m = await fetch(`${B}/api/email/hubungkan`, { redirect: 'manual', headers: { cookie: k } });
  const st = (m.headers.get('set-cookie') || '').match(/am_state=([^;]+)/)?.[1];
  const r = await fetch(`${B}/api/google/kembali?state=${st}&code=${kode({ klaim: klaim(email), refresh_token: rt, scope: S })}`, { redirect: 'manual', headers: { cookie: `${k}; am_state=${st}` } });
  return r.headers.get('location');
}
const drive = () => fetch(T + '/drive/keadaan').then(r => r.json());
const docs = () => fetch(T + '/docs/keadaan').then(r => r.json());
const anak = (dv, induk) => dv.folder.filter(f => f.parents[0] === induk);
const idDari = t => t.split('/')[5]; // https://docs.google.com/document/d/<ID>/edit
await fetch(T + '/docs/mode?gagal=0');

const kA = await masuk(`216326@${D}`), admin = klien(kA);  // Admin + Pemred
await admin('/api/anggota', 'POST', { email: `rep1@${D}`, nama: 'Rep Satu', peran: ['reporter'] });
await admin('/api/anggota', 'POST', { email: `rep2@${D}`, nama: 'Rep Dua', peran: ['reporter'] });
await admin('/api/anggota', 'POST', { email: `ed1@${D}`, nama: 'Ed Satu', peran: ['editor'] });
const rep = klien(await masuk(`rep1@${D}`)), rep2 = klien(await masuk(`rep2@${D}`)), ed = klien(await masuk(`ed1@${D}`));
const rub = async (k, n) => (await admin('/api/pilihan', 'POST', { kelompok: k, nilai: n })).b.id;
const rCerpen = await rub('rubrik_majalah', 'Cerpen'), rIftitah = await rub('rubrik_majalah', 'Iftitah'), rFokus = await rub('rubrik_majalah', 'Fokus Utama'), rLama = await rub('rubrik_majalah', 'Lama');
const rBerita = await rub('rubrik_berita', 'Kegiatan');
await admin('/api/pilihan/urutan', 'POST', { kelompok: 'rubrik_majalah', ids: [rIftitah, rLama, rFokus, rCerpen] });
await admin(`/api/pilihan/${rLama}`, 'PUT', { aktif: 0 });

// --- sebelum diatur
let e1 = await admin('/api/edisi', 'POST', { nomor: '70', tema: '3 Dasawarsa' });
cek('edisi tetap dibuat walau Drive belum diatur (+ pesan folder)', e1.s === 201 && typeof e1.b.folder_galat === 'string' && e1.b.folder_galat.length > 0, JSON.stringify(e1.b));
let det = (await admin(`/api/edisi/${e1.b.id}`)).b;
cek('detail edisi: folder belum ada, belum siap', det.folder && det.folder.tautan === null && det.folder.siap === false, JSON.stringify(det.folder));
let ar = await admin('/api/arsip');
cek('GET /api/arsip: belum ada folder induk, app_id dari Client ID, kunci Picker', ar.s === 200 && ar.b.akar === null && ar.b.app_id === '272243653251' && ar.b.picker_key === 'kunci-picker-uji' && ar.b.client_id === CID, JSON.stringify(ar.b));
cek('/api/arsip hanya Admin', (await rep('/api/arsip')).s === 403 && (await rep('/api/arsip/akar', 'POST', { id: 'x' })).s === 403);
cek('buat folder edisi oleh non-Pemred ditolak', (await ed(`/api/arsip/edisi/${e1.b.id}`, 'POST')).s === 403);
let pl = await rep('/api/arsip/pilihan');
cek('pilihan transkrip: arsip belum aktif', pl.s === 200 && pl.b.aktif === false);

// --- hubungkan & pilih folder induk
cek('hubungkan akun Google', (await hubungkan(kA, `216326@${D}`, 'rt-1')) === '/#email/ok');
cek('folder tidak valid → 400', (await admin('/api/arsip/akar', 'POST', { id: '../x' })).s === 400);
cek('folder yang belum dipilih lewat Picker → 403', (await admin('/api/arsip/akar', 'POST', { id: 'tidakAdaAksesXXXX' })).s === 403);
const luar = (await (await fetch(T + '/drive/folder-luar?nama=' + encodeURIComponent('EDISI AL MAHAD'))).json()).id;
let pa = await admin('/api/arsip/akar', 'POST', { id: luar });
cek('pilih folder induk (dipilih lewat Picker) → ok', pa.s === 200 && pa.b.nama === 'EDISI AL MAHAD', JSON.stringify(pa));
ar = (await admin('/api/arsip')).b;
cek('folder induk tersimpan + tautan', ar.akar.id === luar && ar.akar.nama === 'EDISI AL MAHAD' && ar.akar.tautan.endsWith(luar));

// --- folder edisi (coba lagi untuk edisi lama) & edisi baru
let fb = await admin(`/api/arsip/edisi/${e1.b.id}`, 'POST');
cek('Buat folder di Drive (edisi lama) → ok + tautan', fb.s === 200 && /drive\.google\.com\/drive\/folders\//.test(fb.b.tautan), JSON.stringify(fb));
let dv = await drive();
const fE70 = anak(dv, luar).find(f => f.name === 'EDISI KE 70-(3 DASAWARSA)');
cek('folder "EDISI KE 70-(3 DASAWARSA)" di dalam folder induk', !!fE70, JSON.stringify(anak(dv, luar)));
const rub70 = anak(dv, fE70?.id).map(f => f.name).sort();
cek('subfolder rubrik aktif bernomor urutan (tanpa rubrik nonaktif)', JSON.stringify(rub70) === JSON.stringify(['01_IFTITAH', '02_FOKUS UTAMA', '03_CERPEN']), JSON.stringify(rub70));
const jumlahFolder = dv.folder.length;
await admin(`/api/arsip/edisi/${e1.b.id}`, 'POST');
cek('dibuat ulang → tidak membuat folder ganda', (await drive()).folder.length === jumlahFolder);
cek('edisi tak dikenal → 404', (await admin('/api/arsip/edisi/9999', 'POST')).s === 404);
const e2 = await admin('/api/edisi', 'POST', { nomor: 'No. 71', tema: 'Generasi Emas' });
cek('edisi baru → folder langsung dibuat (tanpa pesan galat)', e2.s === 201 && e2.b.folder_galat === null, JSON.stringify(e2.b));
dv = await drive();
const fE71 = anak(dv, luar).find(f => f.name === 'EDISI KE 71-(GENERASI EMAS)');
cek('nama folder: "No. 71" → "EDISI KE 71-(GENERASI EMAS)"', !!fE71, JSON.stringify(anak(dv, luar).map(f => f.name)));
cek('detail edisi baru memuat tautan folder', (await admin(`/api/edisi/${e2.b.id}`)).b.folder.tautan.endsWith(fE71.id));
await admin(`/api/edisi/${e2.b.id}`, 'PUT', { tema: 'Generasi Cahaya' });
cek('tema diganti → nama folder ikut diganti', (await drive()).folder.find(f => f.id === fE71.id).name === 'EDISI KE 71-(GENERASI CAHAYA)');

// --- transkrip ke folder edisi
pl = (await rep('/api/arsip/pilihan')).b;
cek('pilihan transkrip: aktif, 2 edisi (terbaru dulu), 3 rubrik aktif', pl.aktif && pl.edisi.length === 2 && pl.edisi[0].id === e2.b.id && pl.rubrik.length === 3 && !pl.rubrik.some(r => r.id === rLama), JSON.stringify(pl));
const kirimArsip = (k, d) => k('/api/arsip/transkrip', 'POST', { edisi_id: e2.b.id, rubrik_id: rFokus, penulis: 'Ustzh. Rina', judul: 'Kupeluk Pesanmu', teks: 'Isi transkrip.', ...d });
cek('admin saja (tanpa peran redaksi)… ditolak bila bukan redaksi', (await klien(null)('/api/arsip/transkrip', 'POST', {})).s === 401);
cek('rubrik berita ditolak', (await kirimArsip(rep, { rubrik_id: rBerita })).s === 400);
cek('edisi tak dikenal ditolak', (await kirimArsip(rep, { edisi_id: 9999 })).s === 400);
cek('judul & penulis wajib', (await kirimArsip(rep, { judul: '' })).s === 400 && (await kirimArsip(rep, { penulis: ' ' })).s === 400);
let s1 = await kirimArsip(rep, {});
cek('simpan → 201 dokumen baru + tautan folder', s1.s === 201 && s1.b.baru === true && /docs\.google\.com\/document/.test(s1.b.tautan) && /folders/.test(s1.b.folder), JSON.stringify(s1));
dv = await drive();
const fFokus71 = anak(dv, fE71.id).find(f => f.name === '02_FOKUS UTAMA');
const fRina = anak(dv, fFokus71.id).find(f => f.name === '1. Ustzh. Rina');
cek('folder penulis "1. Ustzh. Rina" di 02_FOKUS UTAMA edisi 71', !!fRina, JSON.stringify(anak(dv, fFokus71.id)));
let dk = await docs();
const doc1 = dk[idDari(s1.b.tautan)];
cek('dokumen "Kupeluk Pesanmu" di folder penulis berisi transkrip', doc1 && doc1.name === 'Kupeluk Pesanmu' && doc1.parents[0] === fRina.id && /· Rep Satu\nIsi transkrip\.\n/.test(doc1.teks), JSON.stringify(doc1));
await kirimArsip(rep, { penulis: 'Ahmad Sabani', judul: 'Langit' });
await kirimArsip(ed, { penulis: 'ustzh. rina', judul: 'Kedua' });
dv = await drive();
const penulis = anak(dv, fFokus71.id).map(f => f.name).sort();
cek('penulis kedua "2. Ahmad Sabani"; nama sama (beda huruf) memakai folder yang sama', JSON.stringify(penulis) === JSON.stringify(['1. Ustzh. Rina', '2. Ahmad Sabani']), JSON.stringify(penulis));
cek('rubrik tanpa folder dibuat saat dibutuhkan (edisi 70 / Cerpen sudah ada)', (await kirimArsip(rep, { edisi_id: e1.b.id, rubrik_id: rCerpen })).s === 201 &&
  anak(await drive(), anak(await drive(), fE70.id).find(f => f.name === '03_CERPEN').id).length === 1);

// --- satu dokumen per naskah
const n = await rep('/api/naskah', 'POST', { jenis: 'majalah', judul: 'Catatan yang Tak Pernah Selesai', rubrik_id: rCerpen, isi: '' });
let sn = await kirimArsip(rep, { naskah_id: n.b.id, rubrik_id: rCerpen, penulis: 'Rep Satu', judul: 'Catatan yang Tak Pernah Selesai', teks: 'Halaman satu.' });
cek('naskah: transkrip pertama → dokumen baru', sn.s === 201 && sn.b.baru === true);
let sn2 = await kirimArsip(rep, { naskah_id: n.b.id, rubrik_id: rCerpen, penulis: 'Rep Satu', judul: 'Catatan', teks: 'Halaman dua.' });
cek('naskah: transkrip berikutnya → ditambahkan di dokumen yang sama', sn2.s === 200 && sn2.b.baru === false && sn2.b.tautan === sn.b.tautan, JSON.stringify(sn2));
const dn = (await docs())[idDari(sn.b.tautan)];
cek('dokumen naskah berisi dua transkrip berurutan', dn.teks.indexOf('Halaman satu.') > 0 && dn.teks.indexOf('Halaman dua.') > dn.teks.indexOf('Halaman satu.'));
cek('naskah reporter lain → 404', (await kirimArsip(rep2, { naskah_id: n.b.id })).s === 404);
cek('Editor boleh menyimpan untuk naskah orang lain', (await kirimArsip(ed, { naskah_id: n.b.id, teks: 'Dari editor.' })).s === 200);
await fetch(T + '/docs/hapus/' + idDari(sn.b.tautan));
sn = await kirimArsip(rep, { naskah_id: n.b.id, rubrik_id: rCerpen, penulis: 'Rep Satu', judul: 'Catatan baru', teks: 'x' });
cek('dokumen naskah dihapus di Drive → dibuat dokumen baru', sn.s === 201 && sn.b.baru === true, JSON.stringify(sn));
cek('riwayat mencatat "arsip"', (await rep('/api/transkrip')).b.riwayat.some(r => r.jenis === 'arsip' && r.judul === 'Kupeluk Pesanmu'));

// --- gangguan
await fetch(T + '/drive/hapus-folder?id=' + luar);
const e3 = await admin('/api/edisi', 'POST', { nomor: '72' });
cek('folder induk hilang → edisi tetap dibuat + pesan "Pilih ulang"', e3.s === 201 && /Pilih ulang/.test(e3.b.folder_galat || ''), JSON.stringify(e3.b));
await hubungkan(kA, `lain@${D}`, 'rt-9');
cek('ganti akun Google → folder induk perlu dipilih ulang', (await admin('/api/arsip')).b.akar === null && (await rep('/api/arsip/pilihan')).b.aktif === false);
cek('ganti akun → tautan folder edisi lama tidak dipakai', (await admin(`/api/edisi/${e2.b.id}`)).b.folder.tautan === null);
cek('simpan tanpa folder induk → 409', (await kirimArsip(rep, {})).s === 409);

console.log(`\nLulus ${lulus}, gagal ${gagal}`);
process.exit(gagal ? 1 : 0);
