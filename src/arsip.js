// Folder arsip edisi di Google Drive (A-67..A-70).
// - Admin memilih folder induk (mis. "EDISI AL MAHAD") lewat Google Picker → aplikasi boleh membuat folder di dalamnya (izin drive.file).
// - Edisi baru → folder "EDISI KE <nomor>-(<TEMA>)" + subfolder per rubrik majalah aktif ("01_IFTITAH", …).
// - Transkrip → Google Docs di <edisi>/<rubrik>/<n. Penulis>/; satu dokumen per naskah (berikutnya ditambahkan di bawah).
// Semua ID folder disimpan di tabel arsip_folder (per akun Google).
import { Galat, json, bacaJson, teks, wajib } from './umum.js';
import { ambilAtur, aturStmt } from './email.js';
import { apiDrive, siapDrive } from './drive.js';
import { tulisDoc, waktuWib, tautanDoc, MAKS_TEKS } from './transkrip.js';

const MIME_FOLDER = 'application/vnd.google-apps.folder';
const tautanFolder = id => `https://drive.google.com/drive/folders/${id}`;
const detikKini = () => Math.floor(Date.now() / 1000);
const bersih = s => String(s || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();

// "No. 71" / "Edisi 71" → "EDISI KE 71-(TEMA)" (sama dengan pola arsip yang ada).
export const namaFolderEdisi = e => {
  const nomor = bersih(e.nomor).replace(/^(edisi|nomor|no\.?)\s*(ke\s*)?/i, '') || bersih(e.nomor);
  return `EDISI KE ${nomor}${e.tema ? `-(${bersih(e.tema).toUpperCase()})` : ''}`;
};

async function akarArsip(env) {
  const akar = await ambilAtur(env, 'drive_folder_arsip');
  if (!akar) throw new Galat(409, 'Folder arsip edisi belum dipilih. Minta Admin memilihnya di Pengaturan → Google.');
  return akar;
}

async function buatFolderDrive(env, token, nama, induk) {
  const r = await fetch(`${apiDrive(env)}/drive/v3/files?fields=id`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nama, mimeType: MIME_FOLDER, parents: [induk] }),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Galat(409, 'Folder induk arsip tidak bisa diakses aplikasi (dihapus atau aksesnya dicabut). Pilih ulang folder arsip di Pengaturan → Google.');
  if (!r.ok || !d.id) throw new Galat(502, `Gagal membuat folder di Google Drive (${r.status}).`);
  return d.id;
}

// Ambil folder dari arsip_folder; bila belum ada → buat di Drive lalu simpan. Dua permintaan bersamaan: yang tersimpan pertama dipakai.
async function folderTercatat(env, token, akun, kunci, nama, induk) {
  const cari = () => env.DB.prepare('SELECT folder_id, nama FROM arsip_folder WHERE akun = ? AND edisi_id = ? AND rubrik_id = ? AND penulis = ?')
    .bind(akun, kunci.edisi, kunci.rubrik || 0, kunci.penulis || '').first();
  const ada = await cari();
  if (ada) return ada.folder_id;
  const id = await buatFolderDrive(env, token, nama, induk);
  await env.DB.prepare(`INSERT INTO arsip_folder (akun, edisi_id, rubrik_id, penulis, nama, folder_id) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (akun, edisi_id, rubrik_id, penulis) DO NOTHING`).bind(akun, kunci.edisi, kunci.rubrik || 0, kunci.penulis || '', nama, id).run();
  return (await cari()).folder_id;
}

async function rubrikMajalah(env) {
  return (await env.DB.prepare("SELECT id, nilai, aktif FROM pilihan WHERE kelompok = 'rubrik_majalah' ORDER BY urutan, id").all()).results;
}
// Nomor folder rubrik = urutan di antara rubrik majalah aktif (rubrik nonaktif: urutan di antara semua).
function namaFolderRubrik(semua, rubrik) {
  const aktif = semua.filter(r => r.aktif);
  let i = aktif.findIndex(r => r.id === rubrik.id);
  if (i < 0) i = semua.findIndex(r => r.id === rubrik.id);
  return `${String(i + 1).padStart(2, '0')}_${bersih(rubrik.nilai).toUpperCase()}`;
}

async function konteks(env, fitur) {
  const token = await siapDrive(env, fitur);
  const akun = await ambilAtur(env, 'drive_akun');
  return { token, akun, akar: await akarArsip(env) };
}
async function folderEdisi(env, k, e) {
  return folderTercatat(env, k.token, k.akun, { edisi: e.id }, namaFolderEdisi(e), k.akar);
}
async function folderRubrik(env, k, e, rubrik, semua) {
  const induk = await folderEdisi(env, k, e);
  return folderTercatat(env, k.token, k.akun, { edisi: e.id, rubrik: rubrik.id }, namaFolderRubrik(semua || await rubrikMajalah(env), rubrik), induk);
}
async function folderPenulis(env, k, e, rubrik, nama) {
  const induk = await folderRubrik(env, k, e, rubrik);
  const kunci = nama.toLowerCase();
  const ada = await env.DB.prepare('SELECT folder_id FROM arsip_folder WHERE akun = ? AND edisi_id = ? AND rubrik_id = ? AND penulis = ?').bind(k.akun, e.id, rubrik.id, kunci).first();
  if (ada) return ada.folder_id;
  const n = (await env.DB.prepare("SELECT count(*) AS n FROM arsip_folder WHERE akun = ? AND edisi_id = ? AND rubrik_id = ? AND penulis <> ''").bind(k.akun, e.id, rubrik.id).first()).n;
  return folderTercatat(env, k.token, k.akun, { edisi: e.id, rubrik: rubrik.id, penulis: kunci }, `${n + 1}. ${nama}`, induk);
}

// ---------- dipakai modul edisi (redaksi.js) ----------
// Buat folder edisi + semua rubrik majalah aktif. Mengembalikan null bila berhasil, atau pesan galat (edisi tetap tersimpan).
export async function siapkanFolderEdisi(env, edisiId) {
  try {
    const e = await env.DB.prepare('SELECT * FROM edisi WHERE id = ?').bind(edisiId).first();
    const k = await konteks(env, 'Folder arsip edisi');
    const semua = await rubrikMajalah(env);
    await folderEdisi(env, k, e);
    for (const r of semua.filter(r => r.aktif)) await folderRubrik(env, k, e, r, semua);
    return null;
  } catch (err) {
    return err instanceof Galat ? err.message : 'Gagal membuat folder di Google Drive.';
  }
}
// Nama edisi berubah → nama folder ikut diganti (bila foldernya ada). Galat diabaikan agar perubahan edisi tetap tersimpan.
export async function gantiNamaFolderEdisi(env, e) {
  try {
    const akun = await ambilAtur(env, 'drive_akun');
    const f = await env.DB.prepare('SELECT id, folder_id, nama FROM arsip_folder WHERE akun = ? AND edisi_id = ? AND rubrik_id = 0 AND penulis = ?').bind(akun || '', e.id, '').first();
    const nama = namaFolderEdisi(e);
    if (!f || f.nama === nama) return;
    const token = await siapDrive(env, 'Folder arsip edisi');
    const r = await fetch(`${apiDrive(env)}/drive/v3/files/${encodeURIComponent(f.folder_id)}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: nama }),
    });
    if (r.ok) await env.DB.prepare('UPDATE arsip_folder SET nama = ? WHERE id = ?').bind(nama, f.id).run();
  } catch { /* abaikan */ }
}
export async function infoFolderEdisi(env, edisiId) {
  const akun = await ambilAtur(env, 'drive_akun');
  const f = await env.DB.prepare('SELECT folder_id FROM arsip_folder WHERE akun = ? AND edisi_id = ? AND rubrik_id = 0 AND penulis = ?').bind(akun || '', edisiId, '').first();
  return { tautan: f ? tautanFolder(f.folder_id) : null, siap: !!(await ambilAtur(env, 'drive_folder_arsip')) };
}

// ---------- pengaturan folder induk (Admin) ----------
async function infoArsip(env) {
  const id = await ambilAtur(env, 'drive_folder_arsip');
  const clientId = env.GOOGLE_CLIENT_ID || '';
  return {
    akar: id ? { id, nama: await ambilAtur(env, 'drive_folder_arsip_nama'), tautan: tautanFolder(id) } : null,
    picker_key: env.GOOGLE_PICKER_KEY || null,
    client_id: clientId,
    app_id: clientId.split('-')[0],
    akun: await ambilAtur(env, 'drive_akun'),
    drive: (await ambilAtur(env, 'gmail_status')) === 'terhubung' && (await ambilAtur(env, 'drive_izin')) === '1',
  };
}
async function pilihAkar(req, env) {
  const b = await bacaJson(req);
  const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{10,100}$/.test(b.id) ? b.id : null;
  if (!id) throw new Galat(400, 'Folder tidak valid.');
  const token = await siapDrive(env, 'Folder arsip edisi');
  // Pastikan aplikasi benar-benar bisa memakai folder ini (dipilih lewat Picker dengan akun yang terhubung).
  const r = await fetch(`${apiDrive(env)}/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType`, { headers: { authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 404) throw new Galat(403, 'Aplikasi belum diberi akses ke folder itu. Pilih folder lewat tombol Pilih folder, masuk dengan akun Google yang terhubung.');
  if (!r.ok) throw new Galat(502, `Gagal memeriksa folder di Drive (${r.status}).`);
  if (d.mimeType !== MIME_FOLDER) throw new Galat(400, 'Yang dipilih bukan folder.');
  await env.DB.batch([aturStmt(env, 'drive_folder_arsip', d.id), aturStmt(env, 'drive_folder_arsip_nama', d.name || '')]);
  return json({ ok: true, nama: d.name });
}

// ---------- transkrip → folder edisi ----------
async function simpanTranskrip(req, env, saya) {
  wajib(saya, 'reporter', 'editor', 'pemred');
  const b = await bacaJson(req);
  const judul = teks(b.judul, 'Judul naskah', 150);
  const penulis = bersih(teks(b.penulis, 'Nama penulis', 100));
  if (!penulis) throw new Galat(400, 'Nama penulis wajib diisi.');
  const isi = teks(b.teks, 'Teks transkrip', MAKS_TEKS).replace(/\r\n/g, '\n');
  const e = await env.DB.prepare('SELECT * FROM edisi WHERE id = ?').bind(Number(b.edisi_id) || 0).first();
  if (!e) throw new Galat(400, 'Pilih edisi.');
  if (e.status === 'terbit') throw new Galat(400, 'Edisi yang sudah terbit tidak bisa ditambah.');
  const rubrik = await env.DB.prepare("SELECT id, nilai, aktif FROM pilihan WHERE id = ? AND kelompok = 'rubrik_majalah'").bind(Number(b.rubrik_id) || 0).first();
  if (!rubrik) throw new Galat(400, 'Pilih rubrik majalah.');
  let naskah = null;
  if (b.naskah_id) {
    naskah = await env.DB.prepare('SELECT id, penulis_id, jenis, transkrip_doc_id FROM naskah WHERE id = ?').bind(Number(b.naskah_id)).first();
    if (!naskah || (naskah.penulis_id !== saya.id && !saya.peran.some(p => ['editor', 'pemred'].includes(p)))) throw new Galat(404, 'Naskah tidak ditemukan.');
  }
  const k = await konteks(env, 'Simpan ke folder edisi');
  const kepala = [waktuWib(), saya.nama].join(' · ');
  // Naskah yang sudah punya dokumen → ditambahkan di bawah dokumen itu (A-69).
  if (naskah?.transkrip_doc_id && await tulisDoc(env, k.token, naskah.transkrip_doc_id, kepala, isi)) {
    await catat(env, saya, judul, isi);
    return json({ ok: true, baru: false, tautan: tautanDoc(naskah.transkrip_doc_id) });
  }
  const induk = await folderPenulis(env, k, e, rubrik, penulis);
  const r = await fetch(`${apiDrive(env)}/drive/v3/files?fields=id`, {
    method: 'POST', headers: { authorization: `Bearer ${k.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: bersih(judul), mimeType: 'application/vnd.google-apps.document', parents: [induk] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Galat(502, `Gagal membuat dokumen di folder edisi (${r.status}).`);
  await tulisDoc(env, k.token, d.id, kepala, isi);
  if (naskah) await env.DB.prepare('UPDATE naskah SET transkrip_doc_id = ? WHERE id = ?').bind(d.id, naskah.id).run();
  await catat(env, saya, judul, isi);
  return json({ ok: true, baru: true, tautan: tautanDoc(d.id), folder: tautanFolder(induk) }, 201);
}
const catat = (env, saya, judul, isi) => env.DB.prepare("INSERT INTO transkrip_riwayat (anggota_id, jenis, judul, panjang, waktu) VALUES (?, 'arsip', ?, ?, ?)")
  .bind(saya.id, judul, isi.length, detikKini()).run();

export async function apiArsip(req, env, saya, p, m) {
  if (p === '/api/arsip' && m === 'GET') { wajib(saya, 'admin'); return json(await infoArsip(env)); }
  if (p === '/api/arsip/akar' && m === 'POST') { wajib(saya, 'admin'); return pilihAkar(req, env); }
  if (p === '/api/arsip/pilihan' && m === 'GET') {
    // Untuk layar transkrip: edisi yang belum terbit + rubrik majalah aktif.
    wajib(saya, 'reporter', 'editor', 'pemred');
    const edisi = (await env.DB.prepare("SELECT id, nomor, tema FROM edisi WHERE status <> 'terbit' ORDER BY id DESC").all()).results;
    const rubrik = (await rubrikMajalah(env)).filter(r => r.aktif).map(({ id, nilai }) => ({ id, nilai }));
    return json({ aktif: !!(await ambilAtur(env, 'drive_folder_arsip')), edisi, rubrik });
  }
  if (p === '/api/arsip/transkrip' && m === 'POST') return simpanTranskrip(req, env, saya);
  const r = p.match(/^\/api\/arsip\/edisi\/(\d+)$/);
  if (r && m === 'POST') {
    wajib(saya, 'pemred');
    if (!(await env.DB.prepare('SELECT 1 FROM edisi WHERE id = ?').bind(Number(r[1])).first())) throw new Galat(404, 'Edisi tidak ditemukan.');
    const galat = await siapkanFolderEdisi(env, Number(r[1]));
    if (galat) throw new Galat(502, galat);
    return json({ ok: true, ...(await infoFolderEdisi(env, Number(r[1]))) });
  }
  return null;
}
