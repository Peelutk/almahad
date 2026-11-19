// Upload & tampil foto lewat Google Drive (A-55..A-60).
// - Upload: browser → Worker → Drive (upload resumable, dialirkan tanpa ditampung di memori).
// - Tampil: /api/foto/<id> — hanya foto yang tercatat di foto_upload, hanya untuk anggota yang sudah masuk.
import { Galat, json, wajib } from './umum.js';
import { ambilAtur, aturStmt, tokenAkses } from './email.js';

export const MAKS_UKURAN = 20 * 1024 * 1024;
const JENIS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif' };
const MIME_FOLDER = 'application/vnd.google-apps.folder';
export const apiDrive = env => env.DRIVE_API_URL || 'https://www.googleapis.com';
const kiniWib = () => new Date(Date.now() + 7 * 3600e3).toISOString(); // 2026-11-16T21:05:09.123Z (jam WIB)

export async function siapDrive(env, fitur = 'Upload foto') {
  if ((await ambilAtur(env, 'gmail_status')) !== 'terhubung' || (await ambilAtur(env, 'drive_izin')) !== '1')
    throw new Galat(503, `${fitur} belum aktif: Admin perlu menghubungkan akun Google dengan izin Drive (Pengaturan → Google).`);
  try { return await tokenAkses(env); } catch (e) { throw new Galat(503, 'Akun Google untuk Drive bermasalah: ' + e.message); }
}

async function buatFolder(env, token, nama, induk) {
  const r = await fetch(`${apiDrive(env)}/drive/v3/files?fields=id`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nama, mimeType: MIME_FOLDER, ...(induk ? { parents: [induk] } : {}) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Galat(502, `Gagal membuat folder di Drive (${r.status}).`);
  return d.id;
}
// Folder disimpan di pengaturan; bila dua upload bersamaan membuat folder, yang tersimpan pertama dipakai.
export async function folder(env, token, kunci, nama, induk) {
  const ada = await ambilAtur(env, kunci);
  if (ada) return ada;
  const id = await buatFolder(env, token, nama, induk);
  await env.DB.prepare(`INSERT INTO pengaturan (kunci, nilai, diubah_at) VALUES (?, ?, datetime('now')) ON CONFLICT(kunci) DO NOTHING`).bind(kunci, id).run();
  return ambilAtur(env, kunci);
}

function namaAman(s) {
  const n = String(s || '').replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_').trim().slice(0, 120);
  return n || 'foto';
}

async function upload(req, env, saya) {
  wajib(saya, 'reporter', 'editor', 'pemred');
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!JENIS[mime]) throw new Galat(415, 'Jenis file harus foto JPG, PNG, WEBP, HEIC, atau GIF.');
  const ukuran = Number(req.headers.get('content-length'));
  if (!ukuran) throw new Galat(411, 'Ukuran file tidak diketahui.');
  if (ukuran > MAKS_UKURAN) throw new Galat(413, 'Ukuran foto maksimal 20 MB.');
  let asli = '';
  try { asli = decodeURIComponent(req.headers.get('x-nama-file') || ''); } catch {}
  asli = namaAman(asli);
  if (!/\.[a-z0-9]{2,5}$/i.test(asli)) asli += '.' + JENIS[mime];

  const token = await siapDrive(env);
  const akar = await folder(env, token, 'drive_folder', "Al-Ma'had – Foto");
  const bulan = kiniWib().slice(0, 7);
  const sub = await folder(env, token, `drive_folder_${bulan}`, bulan, akar);
  const nama = `${kiniWib().slice(0, 19).replace('T', '_').replace(/:/g, '.')}_${asli}`;

  // 1) Sesi upload resumable
  const s = await fetch(`${apiDrive(env)}/upload/drive/v3/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': mime, 'x-upload-content-length': String(ukuran) },
    body: JSON.stringify({ name: nama, parents: [sub] }),
  });
  const lokasi = s.headers.get('location');
  if (!s.ok || !lokasi) throw new Galat(502, `Drive menolak upload (${s.status}).`);
  // 2) Kirim isi file (dialirkan) dengan panjang tetap
  const { readable, writable } = new FixedLengthStream(ukuran);
  const salur = req.body.pipeTo(writable).catch(() => {});
  const u = await fetch(lokasi, { method: 'PUT', headers: { 'content-type': mime }, body: readable });
  await salur;
  const d = await u.json().catch(() => ({}));
  if (!u.ok || !d.id) throw new Galat(502, `Upload ke Drive gagal (${u.status}). Coba lagi.`);

  const r = await env.DB.prepare(`INSERT INTO foto_upload (drive_id, nama, mime, ukuran, pengunggah_id) VALUES (?, ?, ?, ?, ?) RETURNING id`)
    .bind(d.id, asli, mime, ukuran, saya.id).first();
  return json({ tautan: `/api/foto/${r.id}`, nama: asli }, 201);
}

// Kirim ulang respons Drive sebagai gambar (tanpa header dari Drive selain jenis & panjang).
function sebagaiGambar(r, mime, tambahan = {}) {
  const h = new Headers({ 'content-type': mime, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=86400', ...tambahan });
  const p = r.headers.get('content-length'); if (p) h.set('content-length', p);
  return new Response(r.body, { status: 200, headers: h });
}

async function tampil(req, env, saya, id) {
  wajib(saya);
  const f = await env.DB.prepare('SELECT drive_id, nama, mime FROM foto_upload WHERE id = ?').bind(id).first();
  if (!f) throw new Galat(404, 'Foto tidak ditemukan.');
  const token = await siapDrive(env);
  const auth = { authorization: `Bearer ${token}` };
  const asli = new URL(req.url).searchParams.get('asli') === '1';
  if (!asli) {
    // Pratinjau Google ±1600 px; bila belum siap → file asli.
    const m = await fetch(`${apiDrive(env)}/drive/v3/files/${encodeURIComponent(f.drive_id)}?fields=thumbnailLink`, { headers: auth });
    const d = await m.json().catch(() => ({}));
    if (m.ok && d.thumbnailLink) {
      const t = await fetch(d.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, '') + '=s1600', { headers: auth });
      const jenis = (t.headers.get('content-type') || '').split(';')[0];
      if (t.ok && jenis.startsWith('image/') && jenis !== 'image/svg+xml') return sebagaiGambar(t, jenis);
    }
    if (m.status === 404) throw new Galat(404, 'File foto sudah tidak ada di Drive.');
  }
  const r = await fetch(`${apiDrive(env)}/drive/v3/files/${encodeURIComponent(f.drive_id)}?alt=media`, { headers: auth });
  if (r.status === 404) throw new Galat(404, 'File foto sudah tidak ada di Drive.');
  if (!r.ok) throw new Galat(502, `Gagal mengambil foto dari Drive (${r.status}).`);
  return sebagaiGambar(r, f.mime, asli
    ? { 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.nama)}` }
    : {});
}

export async function apiFoto(req, env, saya, p, m) {
  if (p === '/api/foto' && m === 'POST') return upload(req, env, saya);
  const r = p.match(/^\/api\/foto\/(\d+)$/);
  if (r && m === 'GET') return tampil(req, env, saya, Number(r[1]));
  return null;
}
