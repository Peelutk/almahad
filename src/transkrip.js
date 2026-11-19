// Transkrip foto → pratinjau → Google Docs / naskah (A-61..A-66).
// - Foto (sudah dikecilkan browser) dialirkan ke Gemini Files API, dibaca generateContent, lalu dihapus.
// - Dokumen tujuan dibuat aplikasi (izin drive.file) dan dicatat di docs_tujuan.
// - Riwayat tanpa isi teks.
import { Galat, json, bacaJson, teks, wajib } from './umum.js';
import { ambilAtur } from './email.js';
import { apiDrive, siapDrive, folder } from './drive.js';

const REDAKSI = ['reporter', 'editor', 'pemred'];
const MAKS_FOTO = 5;
const MAKS_UKURAN = 10 * 1024 * 1024;  // per foto setelah dikecilkan browser
const JENIS = ['image/jpeg', 'image/png', 'image/webp'];
const MAKS_TEKS = 50_000;
const BATAS_BACA = 30;                  // per anggota per jam (A-64)
const TANPA_TEKS = 'TIDAK_ADA_TEKS';
const apiGemini = env => env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com';
const apiDocs = env => env.DOCS_API_URL || 'https://docs.googleapis.com';
const model = env => env.GEMINI_MODEL || 'gemini-2.5-flash';
const detikKini = () => Math.floor(Date.now() / 1000);
const tautanDoc = id => `https://docs.google.com/document/d/${id}/edit`;

const PERINTAH = `Transkripsikan semua tulisan pada foto berikut — tulisan tangan maupun cetak — apa adanya dalam bahasa aslinya.
Aturan:
- Pertahankan pembagian paragraf; pisahkan paragraf dengan satu baris kosong.
- Jangan menambah, meringkas, menerjemahkan, membetulkan, atau mengomentari isi.
- Kata atau bagian yang tidak terbaca tulis [?].
- Bila ada beberapa foto, gabungkan sesuai urutan foto.
- Keluarkan teks polos saja, tanpa format Markdown.
- Bila tidak ada tulisan sama sekali, keluarkan tepat: ${TANPA_TEKS}`;

function kunciGemini(env) {
  if (!env.GEMINI_API_KEY) throw new Galat(503, 'Transkrip belum aktif: secret GEMINI_API_KEY belum dipasang di Worker.');
  return env.GEMINI_API_KEY;
}
function galatGemini(status, asal) {
  if (status === 429) return new Galat(429, 'Kuota pembaca foto (Gemini) sedang habis. Coba lagi beberapa saat lagi.');
  return new Galat(502, `Pembaca foto (Gemini) menolak permintaan (${status}${asal ? ' saat ' + asal : ''}).`);
}

// 1) Satu foto → Gemini Files API (dialirkan, upload resumable). Mengembalikan nama berkas "files/…".
async function fotoKeGemini(req, env, saya) {
  wajib(saya, ...REDAKSI);
  const kunci = kunciGemini(env);
  const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!JENIS.includes(mime)) throw new Galat(415, 'Foto harus JPG, PNG, atau WEBP.');
  const ukuran = Number(req.headers.get('content-length'));
  if (!ukuran) throw new Galat(411, 'Ukuran foto tidak diketahui.');
  if (ukuran > MAKS_UKURAN) throw new Galat(413, 'Foto terlalu besar untuk dibaca (maks 10 MB).');
  const mulai = await fetch(`${apiGemini(env)}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': kunci, 'content-type': 'application/json',
      'x-goog-upload-protocol': 'resumable', 'x-goog-upload-command': 'start',
      'x-goog-upload-header-content-length': String(ukuran), 'x-goog-upload-header-content-type': mime,
    },
    body: JSON.stringify({ file: { display_name: `almahad-${saya.id}-${Date.now()}` } }),
  });
  const lokasi = mulai.headers.get('x-goog-upload-url');
  if (!mulai.ok || !lokasi) throw galatGemini(mulai.status, 'mengirim foto');
  const { readable, writable } = new FixedLengthStream(ukuran);
  const salur = req.body.pipeTo(writable).catch(() => {});
  const r = await fetch(lokasi, {
    method: 'POST',
    headers: { 'x-goog-api-key': kunci, 'x-goog-upload-offset': '0', 'x-goog-upload-command': 'upload, finalize', 'content-type': mime },
    body: readable,
  });
  await salur;
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !/^files\/[a-z0-9-]+$/.test(d.file?.name || '')) throw galatGemini(r.status, 'mengirim foto');
  return json({ berkas: d.file.name, mime }, 201);
}

async function hapusBerkas(env, nama) {
  await Promise.allSettled(nama.map(n => fetch(`${apiGemini(env)}/v1beta/${n}`, { method: 'DELETE', headers: { 'x-goog-api-key': env.GEMINI_API_KEY } })));
}

// 2) Baca berkas-berkas → teks. Berkas dihapus dari Gemini setelahnya (berhasil maupun gagal).
async function baca(req, env, saya) {
  wajib(saya, ...REDAKSI);
  const kunci = kunciGemini(env);
  const b = await bacaJson(req);
  const berkas = Array.isArray(b.berkas) ? b.berkas : [];
  if (!berkas.length) throw new Galat(400, 'Pilih minimal satu foto.');
  if (berkas.length > MAKS_FOTO) throw new Galat(400, `Maksimal ${MAKS_FOTO} foto sekali baca.`);
  for (const f of berkas) {
    if (typeof f?.berkas !== 'string' || !/^files\/[a-z0-9-]+$/.test(f.berkas) || !JENIS.includes(f.mime)) throw new Galat(400, 'Data foto tidak valid.');
  }
  const kini = detikKini();
  const jumlah = await env.DB.prepare("SELECT count(*) AS n FROM transkrip_riwayat WHERE anggota_id = ? AND jenis = 'baca' AND waktu > ?")
    .bind(saya.id, kini - 3600).first();
  if (jumlah.n >= BATAS_BACA) {
    await hapusBerkas(env, berkas.map(f => f.berkas));
    throw new Galat(429, `Batas ${BATAS_BACA} kali baca per jam tercapai. Coba lagi nanti.`);
  }
  let hasil;
  try {
    const r = await fetch(`${apiGemini(env)}/v1beta/models/${encodeURIComponent(model(env))}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': kunci, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: PERINTAH },
          ...berkas.map(f => ({ file_data: { mime_type: f.mime, file_uri: `${apiGemini(env)}/v1beta/${f.berkas}` } })),
        ] }],
        generationConfig: { temperature: 0 },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw galatGemini(r.status, 'membaca foto');
    hasil = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  } finally {
    await hapusBerkas(env, berkas.map(f => f.berkas));
  }
  await env.DB.prepare("INSERT INTO transkrip_riwayat (anggota_id, jenis, jumlah_foto, panjang, waktu) VALUES (?, 'baca', ?, ?, ?)")
    .bind(saya.id, berkas.length, hasil.length, kini).run();
  if (!hasil || hasil === TANPA_TEKS) throw new Galat(422, 'Tidak ada tulisan yang terbaca di foto. Coba foto yang lebih jelas dan terang.');
  return json({ teks: hasil.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') });
}

// ---------- dokumen tujuan ----------
const SQL_DOCS = `SELECT id, nama, doc_id, aktif FROM docs_tujuan WHERE akun = ? ORDER BY aktif DESC, nama COLLATE NOCASE`;
async function daftarDocs(env, semua) {
  const akun = await ambilAtur(env, 'drive_akun');
  if (!akun) return [];
  const { results } = await env.DB.prepare(SQL_DOCS).bind(akun).all();
  return results.filter(d => semua || d.aktif).map(d => ({ ...d, aktif: !!d.aktif, tautan: tautanDoc(d.doc_id) }));
}

async function buatDoc(req, env) {
  const b = await bacaJson(req);
  const nama = teks(b.nama, 'Nama dokumen', 100);
  const token = await siapDrive(env, 'Dokumen transkrip');
  const akun = await ambilAtur(env, 'drive_akun');
  const induk = await folder(env, token, 'drive_folder_transkrip', "Al-Ma'had – Transkrip");
  const r = await fetch(`${apiDrive(env)}/drive/v3/files?fields=id`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nama, mimeType: 'application/vnd.google-apps.document', parents: [induk] }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) throw new Galat(502, `Gagal membuat dokumen di Google Docs (${r.status}).`);
  const x = await env.DB.prepare('INSERT INTO docs_tujuan (nama, doc_id, akun) VALUES (?, ?, ?) RETURNING id').bind(nama, d.id, akun).first();
  return json({ id: x.id, tautan: tautanDoc(d.id) }, 201);
}

async function ubahDoc(req, env, id) {
  const lama = await env.DB.prepare('SELECT * FROM docs_tujuan WHERE id = ?').bind(id).first();
  if (!lama) throw new Galat(404, 'Dokumen tidak ditemukan.');
  const b = await bacaJson(req);
  const nama = b.nama === undefined ? lama.nama : teks(b.nama, 'Nama dokumen', 100);
  if (b.aktif !== undefined && typeof b.aktif !== 'boolean') throw new Galat(400, 'Nilai aktif tidak valid.');
  const aktif = b.aktif === undefined ? lama.aktif : (b.aktif ? 1 : 0);
  if (nama !== lama.nama) {
    // Nama di Google Docs ikut diganti.
    const token = await siapDrive(env, 'Dokumen transkrip');
    const r = await fetch(`${apiDrive(env)}/drive/v3/files/${encodeURIComponent(lama.doc_id)}`, {
      method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: nama }),
    });
    if (!r.ok) throw new Galat(502, `Gagal mengganti nama di Google Docs (${r.status}).`);
  }
  await env.DB.prepare('UPDATE docs_tujuan SET nama = ?, aktif = ? WHERE id = ?').bind(nama, aktif, id).run();
  return json({ ok: true });
}

// ---------- kirim ke Google Docs ----------
const waktuWib = () => {
  const d = new Date(Date.now() + 7 * 3600e3);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WIB`;
};
async function kirim(req, env, saya) {
  wajib(saya, ...REDAKSI);
  const b = await bacaJson(req);
  const judul = teks(b.judul, 'Judul', 150, false);
  const isi = teks(b.teks, 'Teks transkrip', MAKS_TEKS);
  const jumlahFoto = Math.max(0, Math.min(MAKS_FOTO, Number(b.jumlah_foto) || 0));
  const akun = await ambilAtur(env, 'drive_akun');
  const doc = await env.DB.prepare('SELECT id, doc_id, nama FROM docs_tujuan WHERE id = ? AND aktif = 1 AND akun = ?').bind(Number(b.docs_id) || 0, akun || '').first();
  if (!doc) throw new Galat(400, 'Pilih dokumen tujuan.');
  const token = await siapDrive(env, 'Kirim ke Google Docs');
  const auth = { authorization: `Bearer ${token}` };
  const url = `${apiDocs(env)}/v1/documents/${encodeURIComponent(doc.doc_id)}`;
  const g = await fetch(`${url}?fields=body/content/endIndex`, { headers: auth });
  if (g.status === 404) throw new Galat(410, `Dokumen "${doc.nama}" sudah tidak ada di Google Docs. Minta Admin menyembunyikannya.`);
  if (!g.ok) throw new Galat(502, `Gagal membuka dokumen Google Docs (${g.status}).`);
  const konten = (await g.json()).body?.content || [];
  const akhir = Math.max(1, ...konten.map(c => c.endIndex || 1)) - 1; // sebelum baris baru terakhir dokumen
  const kepala = [judul, waktuWib(), saya.nama].filter(Boolean).join(' · ');
  const badan = isi.replace(/\r\n/g, '\n');
  const sisip = `${kepala}\n${badan}\n────────────\n`;
  const awalBadan = akhir + kepala.length + 1;
  const r = await fetch(`${url}:batchUpdate`, {
    method: 'POST', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ requests: [
      { insertText: { location: { index: akhir }, text: sisip } },
      { updateParagraphStyle: { range: { startIndex: akhir, endIndex: awalBadan }, paragraphStyle: { namedStyleType: 'HEADING_3' }, fields: 'namedStyleType' } },
      { updateParagraphStyle: { range: { startIndex: awalBadan, endIndex: akhir + sisip.length }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }, fields: 'namedStyleType' } },
    ] }),
  });
  if (!r.ok) throw new Galat(502, `Gagal menulis ke Google Docs (${r.status}).`);
  await env.DB.prepare("INSERT INTO transkrip_riwayat (anggota_id, jenis, docs_id, judul, jumlah_foto, panjang, waktu) VALUES (?, 'kirim', ?, ?, ?, ?, ?)")
    .bind(saya.id, doc.id, judul || null, jumlahFoto, badan.length, detikKini()).run();
  return json({ ok: true, nama: doc.nama, tautan: tautanDoc(doc.doc_id) });
}

async function riwayat(env, saya) {
  const semua = saya.peran.includes('admin') || saya.peran.includes('pemred');
  const { results } = await env.DB.prepare(`SELECT r.id, r.jenis, r.judul, r.jumlah_foto, r.panjang, r.waktu, a.nama AS oleh, d.nama AS dokumen
    FROM transkrip_riwayat r LEFT JOIN anggota a ON a.id = r.anggota_id LEFT JOIN docs_tujuan d ON d.id = r.docs_id
    ${semua ? '' : 'WHERE r.anggota_id = ?'} ORDER BY r.id DESC LIMIT 30`).bind(...(semua ? [] : [saya.id])).all();
  return results;
}

export async function apiTranskrip(req, env, saya, p, m) {
  if (p === '/api/transkrip/foto' && m === 'POST') return fotoKeGemini(req, env, saya);
  if (p === '/api/transkrip/baca' && m === 'POST') return baca(req, env, saya);
  if (p === '/api/transkrip/kirim' && m === 'POST') return kirim(req, env, saya);
  if (p === '/api/transkrip' && m === 'GET') {
    wajib(saya, ...REDAKSI, 'admin');
    return json({ docs: await daftarDocs(env, false), riwayat: await riwayat(env, saya), aktif: !!env.GEMINI_API_KEY });
  }
  if (p === '/api/docs-tujuan') {
    wajib(saya, 'admin');
    if (m === 'GET') return json(await daftarDocs(env, true));
    if (m === 'POST') return buatDoc(req, env);
  }
  const r = p.match(/^\/api\/docs-tujuan\/(\d+)$/);
  if (r && m === 'PUT') { wajib(saya, 'admin'); return ubahDoc(req, env, Number(r[1])); }
  return null;
}
