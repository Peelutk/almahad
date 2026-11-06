// Modul redaksi: tugas liputan, naskah, antrean, edisi majalah.
// Aturan mengacu ke DESAIN.md (A-05, A-09..A-17, A-23).
import { Galat, json, bacaJson, teks, wajib } from './umum.js';

const JENIS = ['berita', 'majalah'];
const KELOMPOK_JENIS = { berita: 'rubrik_berita', majalah: 'rubrik_majalah' };
const MAKS_ISI = 60000;
const MAKS_FOTO = 20;

// Tanggal hari ini menurut WIB (UTC+7), format YYYY-MM-DD.
const hariIni = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const punya = (saya, ...p) => p.some(x => saya.peran.includes(x));
const angka = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new Galat(400, 'ID tidak valid.'); return n; };

function cekJenis(v) {
  if (!JENIS.includes(v)) throw new Galat(400, 'Jenis harus berita atau majalah.');
  return v;
}
function cekTanggal(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + 'T00:00:00Z')))
    throw new Galat(400, 'Tenggat wajib diisi dengan tanggal yang valid.');
  return v;
}
// Rubrik harus sesuai jenis; rubrik nonaktif hanya boleh bila memang sudah dipakai sebelumnya.
async function cekRubrik(env, id, jenis, lamaId) {
  const r = await env.DB.prepare('SELECT id, kelompok, aktif FROM pilihan WHERE id = ?').bind(angka(id)).first();
  if (!r || r.kelompok !== KELOMPOK_JENIS[jenis]) throw new Galat(400, 'Rubrik tidak sesuai jenis.');
  if (!r.aktif && r.id !== lamaId) throw new Galat(400, 'Rubrik ini sudah dinonaktifkan.');
  return r.id;
}
function cekFoto(v) {
  if (v === undefined) return null;
  if (!Array.isArray(v)) throw new Galat(400, 'Daftar foto tidak valid.');
  if (v.length > MAKS_FOTO) throw new Galat(400, `Maksimal ${MAKS_FOTO} tautan foto.`);
  return v.map(f => {
    const tautan = teks(f?.tautan, 'Tautan foto', 500);
    let u;
    try { u = new URL(tautan); } catch { throw new Galat(400, 'Tautan foto harus berupa alamat web (https://…).'); }
    if (!['https:', 'http:'].includes(u.protocol)) throw new Galat(400, 'Tautan foto harus diawali https://');
    return { tautan, keterangan: teks(f?.keterangan, 'Keterangan foto', 200, false) };
  });
}

// ======================= TUGAS =======================
const SQL_TUGAS = `SELECT t.id, t.judul, t.keterangan, t.jenis, t.rubrik_id, r.nilai AS rubrik, t.tenggat, t.status,
    t.pemberi_id, pb.nama AS pemberi, t.reporter_id, rp.nama AS reporter, t.dibuat_at,
    (SELECT id FROM naskah WHERE tugas_id = t.id) AS naskah_id
  FROM tugas t JOIN pilihan r ON r.id = t.rubrik_id
  JOIN anggota pb ON pb.id = t.pemberi_id JOIN anggota rp ON rp.id = t.reporter_id`;

const tandaiTugas = (rows, kini) => rows.map(t => ({ ...t, terlambat: ['baru', 'dikerjakan'].includes(t.status) && t.tenggat < kini }));

async function daftarTugas(env, saya) {
  const semua = punya(saya, 'editor', 'pemred');
  const { results } = await env.DB.prepare(`${SQL_TUGAS} ${semua ? '' : 'WHERE t.reporter_id = ?'}
    ORDER BY CASE t.status WHEN 'baru' THEN 0 WHEN 'dikerjakan' THEN 1 ELSE 2 END, t.tenggat`)
    .bind(...(semua ? [] : [saya.id])).all();
  return tandaiTugas(results, hariIni());
}

async function cekReporter(env, id) {
  const r = await env.DB.prepare(`SELECT a.id FROM anggota a JOIN anggota_peran p ON p.anggota_id = a.id
    WHERE a.id = ? AND a.status = 'aktif' AND p.peran = 'reporter'`).bind(angka(id)).first();
  if (!r) throw new Galat(400, 'Reporter tidak valid atau tidak aktif.');
  return r.id;
}

async function tambahTugas(req, env, saya) {
  const b = await bacaJson(req);
  const judul = teks(b.judul, 'Judul tugas', 150);
  const keterangan = teks(b.keterangan, 'Keterangan', 2000, false);
  const jenis = cekJenis(b.jenis);
  const rubrik = await cekRubrik(env, b.rubrik_id, jenis);
  const reporter = await cekReporter(env, b.reporter_id);
  const tenggat = cekTanggal(b.tenggat);
  if (tenggat < hariIni()) throw new Galat(400, 'Tenggat tidak boleh di masa lalu.');
  const r = await env.DB.prepare(`INSERT INTO tugas (judul, keterangan, jenis, rubrik_id, pemberi_id, reporter_id, tenggat)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(judul, keterangan, jenis, rubrik, saya.id, reporter, tenggat).first();
  return json({ id: r.id }, 201);
}

// Editor/Pemred mengubah atau membatalkan tugas (reporter tidak bisa menolak — A-16).
async function ubahTugas(req, env, id) {
  const t = await env.DB.prepare('SELECT * FROM tugas WHERE id = ?').bind(id).first();
  if (!t) throw new Galat(404, 'Tugas tidak ditemukan.');
  if (['selesai', 'batal'].includes(t.status)) throw new Galat(400, 'Tugas yang sudah selesai/batal tidak bisa diubah.');
  const b = await bacaJson(req);
  if (b.status === 'batal') {
    const n = await env.DB.prepare('SELECT status FROM naskah WHERE tugas_id = ?').bind(id).first();
    if (n) throw new Galat(400, 'Tugas sudah punya naskah; tidak bisa dibatalkan.');
    await env.DB.prepare("UPDATE tugas SET status = 'batal' WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (b.status !== undefined) throw new Galat(400, 'Status tugas tidak bisa diubah langsung.');
  const judul = b.judul === undefined ? t.judul : teks(b.judul, 'Judul tugas', 150);
  const keterangan = b.keterangan === undefined ? t.keterangan : teks(b.keterangan, 'Keterangan', 2000, false);
  const tenggat = b.tenggat === undefined ? t.tenggat : cekTanggal(b.tenggat);
  let reporter = t.reporter_id, rubrik = t.rubrik_id, jenis = t.jenis;
  const adaNaskah = await env.DB.prepare('SELECT 1 FROM naskah WHERE tugas_id = ?').bind(id).first();
  if (b.reporter_id !== undefined && Number(b.reporter_id) !== t.reporter_id) {
    if (adaNaskah) throw new Galat(400, 'Reporter tidak bisa diganti karena naskah sudah dibuat.');
    reporter = await cekReporter(env, b.reporter_id);
  }
  if (b.jenis !== undefined && b.jenis !== t.jenis) {
    if (adaNaskah) throw new Galat(400, 'Jenis tidak bisa diganti karena naskah sudah dibuat.');
    jenis = cekJenis(b.jenis);
  }
  if (b.rubrik_id !== undefined || jenis !== t.jenis) rubrik = await cekRubrik(env, b.rubrik_id ?? t.rubrik_id, jenis, t.rubrik_id);
  await env.DB.prepare('UPDATE tugas SET judul = ?, keterangan = ?, jenis = ?, rubrik_id = ?, reporter_id = ?, tenggat = ? WHERE id = ?')
    .bind(judul, keterangan, jenis, rubrik, reporter, tenggat, id).run();
  return json({ ok: true });
}

async function daftarReporter(env) {
  const { results } = await env.DB.prepare(`SELECT a.id, a.nama, a.kelas FROM anggota a
    JOIN anggota_peran p ON p.anggota_id = a.id WHERE a.status = 'aktif' AND p.peran = 'reporter'
    ORDER BY a.nama COLLATE NOCASE`).all();
  return results;
}

// ======================= NASKAH =======================
const SQL_NASKAH = `SELECT n.id, n.jenis, n.judul, n.rubrik_id, r.nilai AS rubrik, n.penulis_id, a.nama AS penulis,
    n.tugas_id, n.status, n.dibuat_at, n.diubah_at,
    (SELECT e.nomor FROM edisi_naskah en JOIN edisi e ON e.id = en.edisi_id WHERE en.naskah_id = n.id) AS edisi
  FROM naskah n JOIN pilihan r ON r.id = n.rubrik_id JOIN anggota a ON a.id = n.penulis_id`;

// Siapa boleh melihat: penulis; semua anggota bila Terbit; Editor/Pemred bila bukan Draf.
function bolehLihat(saya, n) {
  return n.penulis_id === saya.id || n.status === 'terbit' || (n.status !== 'draf' && punya(saya, 'editor', 'pemred'));
}
// Siapa boleh mengubah isi pada status tertentu.
function bolehUbah(saya, n) {
  if (['draf', 'revisi'].includes(n.status)) return n.penulis_id === saya.id;
  if (n.status === 'diajukan') return punya(saya, 'editor', 'pemred');
  if (n.status === 'lolos') return punya(saya, 'pemred');
  return false;
}

async function daftarNaskah(env, saya) {
  const redaksi = punya(saya, 'editor', 'pemred');
  const { results } = await env.DB.prepare(`${SQL_NASKAH}
    WHERE n.penulis_id = ? OR n.status = 'terbit' ${redaksi ? "OR n.status <> 'draf'" : ''}
    ORDER BY n.diubah_at DESC`).bind(saya.id).all();
  return results;
}

async function ambilNaskah(env, id) {
  const n = await env.DB.prepare(`${SQL_NASKAH} WHERE n.id = ?`).bind(id).first();
  if (!n) throw new Galat(404, 'Naskah tidak ditemukan.');
  return n;
}

async function detailNaskah(env, saya, id) {
  const n = await ambilNaskah(env, id);
  if (!bolehLihat(saya, n)) throw new Galat(404, 'Naskah tidak ditemukan.');
  const isi = await env.DB.prepare('SELECT isi FROM naskah WHERE id = ?').bind(id).first();
  const foto = (await env.DB.prepare('SELECT tautan, keterangan FROM naskah_foto WHERE naskah_id = ? ORDER BY urutan, id').bind(id).all()).results;
  const riwayat = (await env.DB.prepare(`SELECT h.dari_status, h.ke_status, h.catatan, h.waktu, a.nama AS oleh
    FROM naskah_riwayat h JOIN anggota a ON a.id = h.oleh_id WHERE h.naskah_id = ? ORDER BY h.id DESC`).bind(id).all()).results;
  const tugas = n.tugas_id ? await env.DB.prepare('SELECT id, judul, tenggat FROM tugas WHERE id = ?').bind(n.tugas_id).first() : null;
  return { ...n, isi: isi.isi, foto, riwayat, tugas, boleh_ubah: bolehUbah(saya, n), aksi: aksiTersedia(saya, n) };
}

const simpanFoto = (env, id, foto) => [
  env.DB.prepare('DELETE FROM naskah_foto WHERE naskah_id = ?').bind(id),
  ...foto.map((f, i) => env.DB.prepare('INSERT INTO naskah_foto (naskah_id, tautan, keterangan, urutan) VALUES (?, ?, ?, ?)')
    .bind(id, f.tautan, f.keterangan, i)),
];
const catat = (env, id, dari, ke, oleh, catatan = '') =>
  env.DB.prepare('INSERT INTO naskah_riwayat (naskah_id, dari_status, ke_status, oleh_id, catatan) VALUES (?, ?, ?, ?, ?)')
    .bind(id, dari, ke, oleh, catatan);

async function tambahNaskah(req, env, saya) {
  const b = await bacaJson(req);
  const jenis = cekJenis(b.jenis);
  const judul = teks(b.judul, 'Judul', 200);
  const rubrik = await cekRubrik(env, b.rubrik_id, jenis);
  const isi = typeof b.isi === 'string' ? b.isi : '';
  if (isi.length > MAKS_ISI) throw new Galat(400, `Isi naskah maksimal ${MAKS_ISI} karakter.`);
  const foto = cekFoto(b.foto) || [];
  let tugasId = null;
  if (b.tugas_id !== undefined && b.tugas_id !== null && b.tugas_id !== '') {
    const t = await env.DB.prepare('SELECT * FROM tugas WHERE id = ?').bind(angka(b.tugas_id)).first();
    if (!t || t.reporter_id !== saya.id) throw new Galat(400, 'Tugas tidak ditemukan atau bukan tugas Anda.');
    if (!['baru', 'dikerjakan'].includes(t.status)) throw new Galat(400, 'Tugas ini sudah selesai atau dibatalkan.');
    if (t.jenis !== jenis) throw new Galat(400, 'Jenis naskah harus sama dengan jenis tugas.');
    if (await env.DB.prepare('SELECT 1 FROM naskah WHERE tugas_id = ?').bind(t.id).first())
      throw new Galat(409, 'Tugas ini sudah punya naskah.');
    tugasId = t.id;
  }
  const r = await env.DB.prepare(`INSERT INTO naskah (jenis, judul, rubrik_id, penulis_id, tugas_id, isi)
    VALUES (?, ?, ?, ?, ?, ?) RETURNING id`).bind(jenis, judul, rubrik, saya.id, tugasId, isi).first();
  const q = [...simpanFoto(env, r.id, foto), catat(env, r.id, null, 'draf', saya.id, tugasId ? 'Dibuat dari tugas' : 'Dibuat')];
  if (tugasId) q.push(env.DB.prepare("UPDATE tugas SET status = 'dikerjakan' WHERE id = ? AND status = 'baru'").bind(tugasId));
  await env.DB.batch(q);
  return json({ id: r.id }, 201);
}

async function ubahNaskah(req, env, saya, id) {
  const n = await ambilNaskah(env, id);
  if (!bolehLihat(saya, n)) throw new Galat(404, 'Naskah tidak ditemukan.');
  if (!bolehUbah(saya, n)) throw new Galat(403, 'Naskah ini tidak bisa Anda ubah pada status sekarang.');
  const b = await bacaJson(req);
  const lama = await env.DB.prepare('SELECT isi FROM naskah WHERE id = ?').bind(id).first();
  const judul = b.judul === undefined ? n.judul : teks(b.judul, 'Judul', 200);
  const rubrik = b.rubrik_id === undefined ? n.rubrik_id : await cekRubrik(env, b.rubrik_id, n.jenis, n.rubrik_id);
  let isi = lama.isi;
  if (b.isi !== undefined) {
    if (typeof b.isi !== 'string') throw new Galat(400, 'Isi naskah tidak valid.');
    if (b.isi.length > MAKS_ISI) throw new Galat(400, `Isi naskah maksimal ${MAKS_ISI} karakter.`);
    isi = b.isi;
  }
  const foto = cekFoto(b.foto);
  const q = [env.DB.prepare("UPDATE naskah SET judul = ?, rubrik_id = ?, isi = ?, diubah_at = datetime('now') WHERE id = ?")
    .bind(judul, rubrik, isi, id)];
  if (foto) q.push(...simpanFoto(env, id, foto));
  // Penyuntingan oleh orang lain dicatat di riwayat.
  if (n.penulis_id !== saya.id) {
    const terakhir = await env.DB.prepare('SELECT oleh_id, ke_status, catatan FROM naskah_riwayat WHERE naskah_id = ? ORDER BY id DESC LIMIT 1').bind(id).first();
    if (!(terakhir && terakhir.oleh_id === saya.id && terakhir.catatan === 'Disunting' && terakhir.ke_status === n.status))
      q.push(catat(env, id, n.status, n.status, saya.id, 'Disunting'));
  }
  await env.DB.batch(q);
  return json({ ok: true });
}

// Alur status (A-05): Draf → Diajukan → Lolos Editor → Terbit; Revisi/Ditolak dari Editor atau Pemred.
const AKSI = {
  ajukan: { dari: ['draf', 'revisi'], ke: 'diajukan', boleh: (s, n) => n.penulis_id === s.id },
  revisi: { dari: ['diajukan', 'lolos'], ke: 'revisi', catatan: true,
    boleh: (s, n) => n.status === 'diajukan' ? punya(s, 'editor', 'pemred') : punya(s, 'pemred') },
  setujui: { dari: ['diajukan'], ke: 'lolos', boleh: s => punya(s, 'editor', 'pemred') },
  terbitkan: { dari: ['lolos'], ke: 'terbit', boleh: s => punya(s, 'pemred') },
  tolak: { dari: ['diajukan', 'lolos'], ke: 'ditolak', catatan: true,
    boleh: (s, n) => n.status === 'diajukan' ? punya(s, 'editor', 'pemred') : punya(s, 'pemred') },
};
const aksiTersedia = (saya, n) => Object.keys(AKSI).filter(k => AKSI[k].dari.includes(n.status) && AKSI[k].boleh(saya, n));

async function aksiNaskah(req, env, saya, id) {
  const n = await ambilNaskah(env, id);
  if (!bolehLihat(saya, n)) throw new Galat(404, 'Naskah tidak ditemukan.');
  const b = await bacaJson(req);
  const a = AKSI[b.aksi];
  if (!a || !Object.hasOwn(AKSI, b.aksi)) throw new Galat(400, 'Aksi tidak dikenal.');
  if (!a.dari.includes(n.status)) throw new Galat(400, 'Aksi ini tidak berlaku untuk status naskah sekarang.');
  if (!a.boleh(saya, n)) throw new Galat(403, 'Anda tidak punya akses untuk aksi ini.');
  const catatan = teks(b.catatan, 'Catatan', 1000, !!a.catatan);
  if (b.aksi === 'ajukan') {
    const isi = await env.DB.prepare('SELECT isi FROM naskah WHERE id = ?').bind(id).first();
    if (!isi.isi.trim()) throw new Galat(400, 'Isi naskah masih kosong.');
  }
  // Perubahan status dijaga dengan "AND status = ?" agar dua orang tidak memproses bersamaan.
  const q = [
    env.DB.prepare("UPDATE naskah SET status = ?, diubah_at = datetime('now') WHERE id = ? AND status = ?").bind(a.ke, id, n.status),
    catat(env, id, n.status, a.ke, saya.id, catatan),
  ];
  if (b.aksi === 'ajukan' && n.tugas_id)
    q.push(env.DB.prepare("UPDATE tugas SET status = 'selesai' WHERE id = ? AND status IN ('baru','dikerjakan')").bind(n.tugas_id));
  const hasil = await env.DB.batch(q);
  if (!hasil[0].meta.changes) {
    // Status sudah berubah oleh orang lain: batalkan catatan riwayat yang terlanjur masuk.
    await env.DB.prepare('DELETE FROM naskah_riwayat WHERE id = (SELECT max(id) FROM naskah_riwayat WHERE naskah_id = ?)').bind(id).run();
    throw new Galat(409, 'Status naskah sudah diubah orang lain. Muat ulang halaman.');
  }
  return json({ ok: true, status: a.ke });
}

async function hapusNaskah(env, saya, id) {
  const n = await ambilNaskah(env, id);
  if (n.penulis_id !== saya.id) throw new Galat(404, 'Naskah tidak ditemukan.');
  if (n.status !== 'draf') throw new Galat(400, 'Hanya naskah berstatus Draf yang bisa dihapus.');
  const q = [env.DB.prepare("DELETE FROM naskah WHERE id = ? AND status = 'draf'").bind(id)];
  if (n.tugas_id) q.push(env.DB.prepare("UPDATE tugas SET status = 'baru' WHERE id = ? AND status = 'dikerjakan'").bind(n.tugas_id));
  await env.DB.batch(q);
  return json({ ok: true });
}

// ======================= EDISI (hanya Pemred — A-13) =======================
async function daftarEdisi(env) {
  const { results } = await env.DB.prepare(`SELECT e.*, (SELECT count(*) FROM edisi_naskah WHERE edisi_id = e.id) AS jumlah
    FROM edisi e ORDER BY e.id DESC`).all();
  return results;
}
async function ambilEdisi(env, id) {
  const e = await env.DB.prepare('SELECT * FROM edisi WHERE id = ?').bind(id).first();
  if (!e) throw new Galat(404, 'Edisi tidak ditemukan.');
  return e;
}
function dataEdisi(b, lama = {}) {
  return {
    nomor: b.nomor === undefined ? lama.nomor : teks(b.nomor, 'Nomor edisi', 40),
    tema: b.tema === undefined ? (lama.tema ?? '') : teks(b.tema, 'Tema', 150, false),
    bulan: b.bulan_terbit === undefined ? (lama.bulan_terbit ?? '') : teks(b.bulan_terbit, 'Bulan terbit', 40, false),
  };
}
async function tambahEdisi(req, env) {
  const d = dataEdisi(await bacaJson(req));
  if (!d.nomor) throw new Galat(400, 'Nomor edisi wajib diisi.');
  if (await env.DB.prepare('SELECT 1 FROM edisi WHERE nomor = ?').bind(d.nomor).first()) throw new Galat(409, 'Nomor edisi sudah ada.');
  const r = await env.DB.prepare('INSERT INTO edisi (nomor, tema, bulan_terbit) VALUES (?, ?, ?) RETURNING id').bind(d.nomor, d.tema, d.bulan).first();
  return json({ id: r.id }, 201);
}
async function ubahEdisi(req, env, id) {
  const e = await ambilEdisi(env, id);
  if (e.status === 'terbit') throw new Galat(400, 'Edisi yang sudah terbit tidak bisa diubah.');
  const d = dataEdisi(await bacaJson(req), e);
  if (await env.DB.prepare('SELECT 1 FROM edisi WHERE nomor = ? AND id <> ?').bind(d.nomor, id).first()) throw new Galat(409, 'Nomor edisi sudah ada.');
  await env.DB.prepare('UPDATE edisi SET nomor = ?, tema = ?, bulan_terbit = ? WHERE id = ?').bind(d.nomor, d.tema, d.bulan, id).run();
  return json({ ok: true });
}
async function detailEdisi(env, id) {
  const e = await ambilEdisi(env, id);
  const isi = (await env.DB.prepare(`SELECT n.id, n.judul, n.isi, r.nilai AS rubrik, a.nama AS penulis, en.urutan
    FROM edisi_naskah en JOIN naskah n ON n.id = en.naskah_id JOIN pilihan r ON r.id = n.rubrik_id JOIN anggota a ON a.id = n.penulis_id
    WHERE en.edisi_id = ? ORDER BY en.urutan, n.id`).bind(id).all()).results;
  const foto = isi.length ? (await env.DB.prepare(`SELECT naskah_id, tautan, keterangan FROM naskah_foto
    WHERE naskah_id IN (SELECT naskah_id FROM edisi_naskah WHERE edisi_id = ?) ORDER BY urutan, id`).bind(id).all()).results : [];
  for (const n of isi) n.foto = foto.filter(f => f.naskah_id === n.id).map(({ tautan, keterangan }) => ({ tautan, keterangan }));
  const calon = (await env.DB.prepare(`SELECT n.id, n.judul, r.nilai AS rubrik, a.nama AS penulis
    FROM naskah n JOIN pilihan r ON r.id = n.rubrik_id JOIN anggota a ON a.id = n.penulis_id
    WHERE n.jenis = 'majalah' AND n.status = 'terbit' AND n.id NOT IN (SELECT naskah_id FROM edisi_naskah)
    ORDER BY n.diubah_at DESC`).all()).results;
  return { ...e, naskah: isi, calon };
}
async function wajibDisusun(env, id) {
  const e = await ambilEdisi(env, id);
  if (e.status !== 'disusun') throw new Galat(400, 'Edisi sudah dikunci; buka kunci dulu untuk mengubah isi.');
  return e;
}
async function masukkanNaskah(req, env, id) {
  await wajibDisusun(env, id);
  const b = await bacaJson(req);
  const n = await env.DB.prepare('SELECT id, jenis, status FROM naskah WHERE id = ?').bind(angka(b.naskah_id)).first();
  if (!n || n.jenis !== 'majalah' || n.status !== 'terbit') throw new Galat(400, 'Hanya naskah majalah berstatus Terbit yang bisa dimasukkan.');
  if (await env.DB.prepare('SELECT 1 FROM edisi_naskah WHERE naskah_id = ?').bind(n.id).first()) throw new Galat(409, 'Naskah ini sudah masuk edisi.');
  await env.DB.prepare(`INSERT INTO edisi_naskah (edisi_id, naskah_id, urutan)
    VALUES (?, ?, (SELECT coalesce(max(urutan), 0) + 1 FROM edisi_naskah WHERE edisi_id = ?))`).bind(id, n.id, id).run();
  return json({ ok: true }, 201);
}
async function keluarkanNaskah(env, id, naskahId) {
  await wajibDisusun(env, id);
  const r = await env.DB.prepare('DELETE FROM edisi_naskah WHERE edisi_id = ? AND naskah_id = ?').bind(id, naskahId).run();
  if (!r.meta.changes) throw new Galat(404, 'Naskah tidak ada di edisi ini.');
  return json({ ok: true });
}
async function urutkanEdisi(req, env, id) {
  await wajibDisusun(env, id);
  const b = await bacaJson(req);
  if (!Array.isArray(b.ids) || !b.ids.length) throw new Galat(400, 'Urutan tidak valid.');
  await env.DB.batch(b.ids.map((n, i) => env.DB.prepare('UPDATE edisi_naskah SET urutan = ? WHERE edisi_id = ? AND naskah_id = ?').bind(i + 1, id, Number(n))));
  return json({ ok: true });
}
const ALUR_EDISI = { disusun: ['dikunci'], dikunci: ['disusun', 'terbit'], terbit: [] };
async function statusEdisi(req, env, id) {
  const e = await ambilEdisi(env, id);
  const { status } = await bacaJson(req);
  if (!(ALUR_EDISI[e.status] || []).includes(status)) throw new Galat(400, 'Perubahan status edisi tidak berlaku.');
  if (status === 'dikunci' && !(await env.DB.prepare('SELECT 1 FROM edisi_naskah WHERE edisi_id = ?').bind(id).first()))
    throw new Galat(400, 'Edisi masih kosong.');
  await env.DB.prepare('UPDATE edisi SET status = ? WHERE id = ? AND status = ?').bind(status, id, e.status).run();
  return json({ ok: true });
}

// ======================= RINGKASAN DASBOR =======================
async function ringkasan(env, saya) {
  const kini = hariIni();
  const satu = async (sql, ...v) => (await env.DB.prepare(sql).bind(...v).first()).n;
  const h = {
    tugas_saya: await satu("SELECT count(*) AS n FROM tugas WHERE reporter_id = ? AND status IN ('baru','dikerjakan')", saya.id),
    tugas_terlambat: await satu("SELECT count(*) AS n FROM tugas WHERE reporter_id = ? AND status IN ('baru','dikerjakan') AND tenggat < ?", saya.id, kini),
    naskah_revisi: await satu("SELECT count(*) AS n FROM naskah WHERE penulis_id = ? AND status = 'revisi'", saya.id),
  };
  if (punya(saya, 'editor', 'pemred')) h.perlu_sunting = await satu("SELECT count(*) AS n FROM naskah WHERE status = 'diajukan'");
  if (punya(saya, 'pemred')) {
    h.perlu_setuju = await satu("SELECT count(*) AS n FROM naskah WHERE status = 'lolos'");
    h.edisi_disusun = await satu("SELECT count(*) AS n FROM edisi WHERE status <> 'terbit'");
  }
  return h;
}

// ======================= RUTE =======================
export async function apiRedaksi(req, env, saya, p, m) {
  if (!p.startsWith('/api/tugas') && !p.startsWith('/api/naskah') && !p.startsWith('/api/edisi') &&
      p !== '/api/reporter' && p !== '/api/ringkasan') return null;
  wajib(saya, 'reporter', 'editor', 'pemred');
  let r;

  if (p === '/api/ringkasan' && m === 'GET') return json(await ringkasan(env, saya));
  if (p === '/api/reporter' && m === 'GET') { wajib(saya, 'editor', 'pemred'); return json(await daftarReporter(env)); }

  if (p === '/api/tugas') {
    if (m === 'GET') return json(await daftarTugas(env, saya));
    if (m === 'POST') { wajib(saya, 'editor', 'pemred'); return tambahTugas(req, env, saya); }
  }
  if ((r = p.match(/^\/api\/tugas\/(\d+)$/)) && m === 'PUT') { wajib(saya, 'editor', 'pemred'); return ubahTugas(req, env, Number(r[1])); }

  if (p === '/api/naskah') {
    if (m === 'GET') return json(await daftarNaskah(env, saya));
    if (m === 'POST') return tambahNaskah(req, env, saya);
  }
  if ((r = p.match(/^\/api\/naskah\/(\d+)$/))) {
    const id = Number(r[1]);
    if (m === 'GET') return json(await detailNaskah(env, saya, id));
    if (m === 'PUT') return ubahNaskah(req, env, saya, id);
    if (m === 'DELETE') return hapusNaskah(env, saya, id);
  }
  if ((r = p.match(/^\/api\/naskah\/(\d+)\/aksi$/)) && m === 'POST') return aksiNaskah(req, env, saya, Number(r[1]));

  if (p.startsWith('/api/edisi')) {
    wajib(saya, 'pemred');
    if (p === '/api/edisi') {
      if (m === 'GET') return json(await daftarEdisi(env));
      if (m === 'POST') return tambahEdisi(req, env);
    }
    if ((r = p.match(/^\/api\/edisi\/(\d+)$/))) {
      if (m === 'GET') return json(await detailEdisi(env, Number(r[1])));
      if (m === 'PUT') return ubahEdisi(req, env, Number(r[1]));
    }
    if ((r = p.match(/^\/api\/edisi\/(\d+)\/naskah$/)) && m === 'POST') return masukkanNaskah(req, env, Number(r[1]));
    if ((r = p.match(/^\/api\/edisi\/(\d+)\/naskah\/(\d+)$/)) && m === 'DELETE') return keluarkanNaskah(env, Number(r[1]), Number(r[2]));
    if ((r = p.match(/^\/api\/edisi\/(\d+)\/urutan$/)) && m === 'POST') return urutkanEdisi(req, env, Number(r[1]));
    if ((r = p.match(/^\/api\/edisi\/(\d+)\/status$/)) && m === 'POST') return statusEdisi(req, env, Number(r[1]));
  }
  return null;
}
