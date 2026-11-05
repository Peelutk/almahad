// Al-Ma'had — Worker utama (Tahap 1)
// API di /api/*, selain itu file statis dari ./public.
import { pastikanSkema } from './skema.js';

const PERAN = ['reporter', 'editor', 'pemred', 'admin'];
const KELOMPOK = { rubrik_berita: 'Rubrik berita', rubrik_majalah: 'Rubrik majalah' };
const UMUR_SESI = 30 * 24 * 3600; // detik
const COOKIE_SESI = 'am_sesi';
const COOKIE_STATE = 'am_state';

class Galat extends Error {
  constructor(status, pesan) { super(pesan); this.status = status; }
}

// ---------- pembantu ----------
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
const alihkan = (lokasi, headers = {}) => new Response(null, { status: 302, headers: { location: lokasi, 'cache-control': 'no-store', ...headers } });

function bacaCookie(req, nama) {
  const c = req.headers.get('cookie') || '';
  for (const bagian of c.split(';')) {
    const [k, ...v] = bagian.trim().split('=');
    if (k === nama) return v.join('=');
  }
  return null;
}
const buatCookie = (nama, nilai, umur, path = '/') =>
  `${nama}=${nilai}; Path=${path}; Max-Age=${umur}; HttpOnly; Secure; SameSite=Lax`;

function acak(n = 32) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(teks) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function dekodeJwt(token) {
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const biner = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(biner, c => c.charCodeAt(0))));
}
async function bacaJson(req) {
  try { return await req.json(); } catch { throw new Galat(400, 'Data tidak valid.'); }
}
function teks(v, nama, maks, wajib = true) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (wajib && !s) throw new Galat(400, `${nama} wajib diisi.`);
  if (s.length > maks) throw new Galat(400, `${nama} maksimal ${maks} karakter.`);
  return s;
}
function daftarPeran(v) {
  if (!Array.isArray(v)) throw new Galat(400, 'Peran tidak valid.');
  const p = [...new Set(v)];
  if (!p.length) throw new Galat(400, 'Pilih minimal satu peran.');
  if (p.some(x => !PERAN.includes(x))) throw new Galat(400, 'Peran tidak dikenal.');
  return p;
}
const domain = env => (env.GOOGLE_HD || '').toLowerCase();
function emailSekolah(env, email) {
  const e = teks(email, 'Email', 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(e) || !e.endsWith('@' + domain(env)))
    throw new Galat(400, `Email harus berakhiran @${domain(env)}.`);
  return e;
}

// ---------- sesi ----------
async function ambilSaya(req, env) {
  const token = bacaCookie(req, COOKIE_SESI);
  if (!token) return null;
  const a = await env.DB.prepare(`SELECT a.id, a.email, a.nama, a.kelas, a.periode_id
    FROM sesi s JOIN anggota a ON a.id = s.anggota_id
    WHERE s.token_hash = ? AND s.kedaluwarsa > ? AND a.status = 'aktif'`)
    .bind(await sha256(token), Math.floor(Date.now() / 1000)).first();
  if (!a) return null;
  const { results } = await env.DB.prepare('SELECT peran FROM anggota_peran WHERE anggota_id = ?').bind(a.id).all();
  a.peran = results.map(r => r.peran);
  return a;
}
function wajib(saya, ...peran) {
  if (!saya) throw new Galat(401, 'Silakan masuk terlebih dahulu.');
  if (peran.length && !peran.some(p => saya.peran.includes(p))) throw new Galat(403, 'Anda tidak punya akses untuk ini.');
}

// Dipanggil setelah identitas Google terverifikasi.
async function selesaiMasuk(env, email, namaGoogle) {
  email = email.toLowerCase();
  let a = await env.DB.prepare('SELECT id, status FROM anggota WHERE email = ?').bind(email).first();
  if (!a) {
    // Admin awal: hanya bila email = ADMIN_AWAL dan belum ada admin sama sekali.
    const adaAdmin = await env.DB.prepare("SELECT 1 FROM anggota_peran WHERE peran = 'admin' LIMIT 1").first();
    if (email !== (env.ADMIN_AWAL || '').toLowerCase() || adaAdmin) return { galat: 'belum_terdaftar' };
    const periode = await env.DB.prepare('SELECT id FROM periode WHERE aktif = 1').first();
    const r = await env.DB.prepare('INSERT INTO anggota (email, nama, periode_id) VALUES (?, ?, ?) RETURNING id')
      .bind(email, (namaGoogle || email.split('@')[0]).slice(0, 100), periode ? periode.id : null).first();
    await env.DB.batch(['admin', 'pemred'].map(p =>
      env.DB.prepare('INSERT INTO anggota_peran (anggota_id, peran) VALUES (?, ?)').bind(r.id, p)));
    a = { id: r.id, status: 'aktif' };
  }
  if (a.status !== 'aktif') return { galat: 'arsip' };
  const token = acak();
  const kini = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesi WHERE kedaluwarsa <= ?').bind(kini),
    env.DB.prepare('INSERT INTO sesi (token_hash, anggota_id, kedaluwarsa) VALUES (?, ?, ?)')
      .bind(await sha256(token), a.id, kini + UMUR_SESI),
  ]);
  return { token };
}

// ---------- Google OAuth ----------
function googleMulai(req, env) {
  const url = new URL(req.url);
  const state = acak(24);
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/google/kembali`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: domain(env),
    prompt: 'select_account',
  });
  return alihkan(`${env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'}?${p}`,
    { 'set-cookie': buatCookie(COOKIE_STATE, state, 600, '/api/google') });
}

async function googleKembali(req, env) {
  const url = new URL(req.url);
  const hapusState = buatCookie(COOKIE_STATE, '', 0, '/api/google');
  const gagal = kode => alihkan(`/?galat=${kode}`, { 'set-cookie': hapusState });
  const state = url.searchParams.get('state');
  const kode = url.searchParams.get('code');
  if (!state || !kode || state !== bacaCookie(req, COOKIE_STATE)) return gagal('sesi_masuk');
  if (!env.GOOGLE_CLIENT_SECRET) return gagal('belum_diatur');

  const r = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: kode, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/google/kembali`, grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) return gagal('google');
  const data = await r.json();
  let id;
  try { id = dekodeJwt(data.id_token); } catch { return gagal('google'); }
  // id_token diterima langsung dari Google lewat HTTPS → cukup periksa isinya.
  const hd = domain(env);
  const email = String(id.email || '').toLowerCase();
  if (id.aud !== env.GOOGLE_CLIENT_ID ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(id.iss) ||
      !(id.exp > Date.now() / 1000) ||
      id.email_verified !== true) return gagal('google');
  if (id.hd !== hd || !email.endsWith('@' + hd)) return gagal('domain');

  const h = await selesaiMasuk(env, email, id.name);
  if (h.galat) return gagal(h.galat);
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  headers.append('set-cookie', hapusState);
  headers.append('set-cookie', buatCookie(COOKIE_SESI, h.token, UMUR_SESI));
  return new Response(null, { status: 302, headers });
}

// ---------- anggota ----------
async function daftarAnggota(env) {
  const { results } = await env.DB.prepare(`SELECT a.id, a.email, a.nama, a.kelas, a.status, a.periode_id,
      p.nama AS periode, (SELECT group_concat(peran) FROM anggota_peran WHERE anggota_id = a.id) AS peran
    FROM anggota a LEFT JOIN periode p ON p.id = a.periode_id
    ORDER BY a.status, a.nama COLLATE NOCASE`).all();
  return results.map(r => ({ ...r, peran: r.peran ? r.peran.split(',') : [] }));
}

async function jumlahAdminAktif(env, kecualiId) {
  const r = await env.DB.prepare(`SELECT count(DISTINCT a.id) AS n FROM anggota a
    JOIN anggota_peran p ON p.anggota_id = a.id
    WHERE p.peran = 'admin' AND a.status = 'aktif' AND a.id <> ?`).bind(kecualiId).first();
  return r.n;
}

async function tambahAnggota(req, env) {
  const b = await bacaJson(req);
  const email = emailSekolah(env, b.email);
  const nama = teks(b.nama, 'Nama', 100);
  const kelas = teks(b.kelas, 'Kelas', 20, false);
  const peran = daftarPeran(b.peran);
  if (await env.DB.prepare('SELECT 1 FROM anggota WHERE email = ?').bind(email).first())
    throw new Galat(409, 'Email ini sudah terdaftar.');
  const periode = await env.DB.prepare('SELECT id FROM periode WHERE aktif = 1').first();
  const r = await env.DB.prepare('INSERT INTO anggota (email, nama, kelas, periode_id) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(email, nama, kelas, periode ? periode.id : null).first();
  await env.DB.batch(peran.map(p => env.DB.prepare('INSERT INTO anggota_peran (anggota_id, peran) VALUES (?, ?)').bind(r.id, p)));
  return json({ id: r.id }, 201);
}

async function ubahAnggota(req, env, id) {
  const lama = await env.DB.prepare('SELECT * FROM anggota WHERE id = ?').bind(id).first();
  if (!lama) throw new Galat(404, 'Anggota tidak ditemukan.');
  const b = await bacaJson(req);
  const nama = b.nama === undefined ? lama.nama : teks(b.nama, 'Nama', 100);
  const kelas = b.kelas === undefined ? lama.kelas : teks(b.kelas, 'Kelas', 20, false);
  const status = b.status === undefined ? lama.status : b.status;
  if (!['aktif', 'arsip'].includes(status)) throw new Galat(400, 'Status tidak valid.');
  const peran = b.peran === undefined ? null : daftarPeran(b.peran);

  // Pengaman: harus selalu ada minimal satu Admin aktif.
  const tetapAdmin = status === 'aktif' && (peran ? peran.includes('admin')
    : !!(await env.DB.prepare("SELECT 1 FROM anggota_peran WHERE anggota_id = ? AND peran = 'admin'").bind(id).first()));
  if (!tetapAdmin && (await jumlahAdminAktif(env, id)) === 0)
    throw new Galat(400, 'Harus ada minimal satu Admin aktif.');

  let periodeId = lama.periode_id;
  if (lama.status === 'arsip' && status === 'aktif') {
    const p = await env.DB.prepare('SELECT id FROM periode WHERE aktif = 1').first();
    periodeId = p ? p.id : null; // diaktifkan kembali → masuk periode aktif
  }
  const q = [env.DB.prepare('UPDATE anggota SET nama = ?, kelas = ?, status = ?, periode_id = ? WHERE id = ?')
    .bind(nama, kelas, status, periodeId, id)];
  if (peran) {
    q.push(env.DB.prepare('DELETE FROM anggota_peran WHERE anggota_id = ?').bind(id));
    for (const p of peran) q.push(env.DB.prepare('INSERT INTO anggota_peran (anggota_id, peran) VALUES (?, ?)').bind(id, p));
  }
  await env.DB.batch(q);
  return json({ ok: true });
}

// ---------- periode ----------
async function daftarPeriode(env) {
  const { results } = await env.DB.prepare(`SELECT p.id, p.nama, p.aktif,
      (SELECT count(*) FROM anggota a WHERE a.periode_id = p.id AND a.status = 'aktif') AS jumlah_aktif
    FROM periode p ORDER BY p.id DESC`).all();
  return results;
}
async function tambahPeriode(req, env) {
  const b = await bacaJson(req);
  const nama = teks(b.nama, 'Nama periode', 30);
  if (await env.DB.prepare('SELECT 1 FROM periode WHERE nama = ?').bind(nama).first())
    throw new Galat(409, 'Periode dengan nama ini sudah ada.');
  const r = await env.DB.prepare('INSERT INTO periode (nama) VALUES (?) RETURNING id').bind(nama).first();
  return json({ id: r.id }, 201);
}
async function ubahPeriode(req, env, id) {
  const b = await bacaJson(req);
  const nama = teks(b.nama, 'Nama periode', 30);
  if (await env.DB.prepare('SELECT 1 FROM periode WHERE nama = ? AND id <> ?').bind(nama, id).first())
    throw new Galat(409, 'Periode dengan nama ini sudah ada.');
  const r = await env.DB.prepare('UPDATE periode SET nama = ? WHERE id = ?').bind(nama, id).run();
  if (!r.meta.changes) throw new Galat(404, 'Periode tidak ditemukan.');
  return json({ ok: true });
}
// Ganti periode aktif: anggota di "lanjut" pindah ke periode baru, anggota aktif lain diarsipkan (A-14).
async function aktifkanPeriode(req, env, saya, id) {
  const p = await env.DB.prepare('SELECT id, aktif FROM periode WHERE id = ?').bind(id).first();
  if (!p) throw new Galat(404, 'Periode tidak ditemukan.');
  if (p.aktif) throw new Galat(400, 'Periode ini sudah aktif.');
  const b = await bacaJson(req);
  const lanjut = Array.isArray(b.lanjut) ? b.lanjut.map(Number).filter(Number.isInteger) : [];
  if (!lanjut.includes(saya.id)) lanjut.push(saya.id); // admin yang mengganti tidak ikut terarsip
  const tanda = lanjut.map(() => '?').join(',');
  await env.DB.batch([
    env.DB.prepare('UPDATE periode SET aktif = (id = ?)').bind(id),
    env.DB.prepare(`UPDATE anggota SET periode_id = ? WHERE status = 'aktif' AND id IN (${tanda})`).bind(id, ...lanjut),
    env.DB.prepare(`UPDATE anggota SET status = 'arsip' WHERE status = 'aktif' AND (periode_id IS NULL OR periode_id <> ?)`).bind(id),
  ]);
  return json({ ok: true });
}

// ---------- daftar pilihan ----------
async function semuaPilihan(env) {
  const { results } = await env.DB.prepare('SELECT id, kelompok, nilai, urutan, aktif FROM pilihan ORDER BY kelompok, urutan, id').all();
  const hasil = {};
  for (const k of Object.keys(KELOMPOK)) hasil[k] = { judul: KELOMPOK[k], isi: [] };
  for (const r of results) if (hasil[r.kelompok]) hasil[r.kelompok].isi.push(r);
  return hasil;
}
function cekKelompok(k) {
  if (!Object.hasOwn(KELOMPOK, k)) throw new Galat(400, 'Kelompok pilihan tidak dikenal.');
  return k;
}
async function tambahPilihan(req, env) {
  const b = await bacaJson(req);
  const kelompok = cekKelompok(b.kelompok);
  const nilai = teks(b.nilai, 'Nilai', 60);
  if (await env.DB.prepare('SELECT 1 FROM pilihan WHERE kelompok = ? AND nilai = ?').bind(kelompok, nilai).first())
    throw new Galat(409, 'Pilihan ini sudah ada.');
  const r = await env.DB.prepare(`INSERT INTO pilihan (kelompok, nilai, urutan)
    VALUES (?, ?, (SELECT coalesce(max(urutan), 0) + 1 FROM pilihan WHERE kelompok = ?)) RETURNING id`)
    .bind(kelompok, nilai, kelompok).first();
  return json({ id: r.id }, 201);
}
// Pilihan tidak bisa dihapus (A-20): hanya diganti nama atau dinonaktifkan.
async function ubahPilihan(req, env, id) {
  const lama = await env.DB.prepare('SELECT * FROM pilihan WHERE id = ?').bind(id).first();
  if (!lama) throw new Galat(404, 'Pilihan tidak ditemukan.');
  const b = await bacaJson(req);
  const nilai = b.nilai === undefined ? lama.nilai : teks(b.nilai, 'Nilai', 60);
  const aktif = b.aktif === undefined ? lama.aktif : (b.aktif ? 1 : 0);
  if (nilai !== lama.nilai && await env.DB.prepare('SELECT 1 FROM pilihan WHERE kelompok = ? AND nilai = ? AND id <> ?')
    .bind(lama.kelompok, nilai, id).first()) throw new Galat(409, 'Pilihan ini sudah ada.');
  await env.DB.prepare('UPDATE pilihan SET nilai = ?, aktif = ? WHERE id = ?').bind(nilai, aktif, id).run();
  return json({ ok: true });
}
async function urutkanPilihan(req, env) {
  const b = await bacaJson(req);
  const kelompok = cekKelompok(b.kelompok);
  if (!Array.isArray(b.ids) || !b.ids.length) throw new Galat(400, 'Urutan tidak valid.');
  await env.DB.batch(b.ids.map((id, i) =>
    env.DB.prepare('UPDATE pilihan SET urutan = ? WHERE id = ? AND kelompok = ?').bind(i + 1, Number(id), kelompok)));
  return json({ ok: true });
}

// ---------- rute API ----------
async function api(req, env, url) {
  const { pathname: p } = url;
  const m = req.method;

  if (p === '/api/google/mulai' && m === 'GET') return googleMulai(req, env);
  if (p === '/api/google/kembali' && m === 'GET') return googleKembali(req, env);

  // Masuk uji: HANYA saat pengujian lokal (UJI_LOGIN=1 di .dev.vars dan host localhost).
  if (p === '/api/uji/masuk' && m === 'GET') {
    if (env.UJI_LOGIN !== '1' || !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Galat(404, 'Tidak ditemukan.');
    const h = await selesaiMasuk(env, url.searchParams.get('email') || '', url.searchParams.get('nama'));
    if (h.galat) return json({ galat: h.galat }, 403);
    const kuki = { 'set-cookie': buatCookie(COOKIE_SESI, h.token, UMUR_SESI) };
    if (url.searchParams.get('lanjut') === '1') return alihkan('/', kuki); // untuk uji tampilan di browser
    return json({ ok: true }, 200, kuki);
  }

  // Pengaman CSRF: semua perubahan wajib membawa header khusus (tidak bisa dikirim situs lain tanpa izin CORS).
  if (m !== 'GET' && req.headers.get('x-almahad') !== '1') throw new Galat(403, 'Permintaan ditolak.');

  const saya = await ambilSaya(req, env);

  if (p === '/api/keluar' && m === 'POST') {
    const token = bacaCookie(req, COOKIE_SESI);
    if (token) await env.DB.prepare('DELETE FROM sesi WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': buatCookie(COOKIE_SESI, '', 0) });
  }
  if (p === '/api/saya' && m === 'GET') {
    wajib(saya);
    const periode = await env.DB.prepare('SELECT id, nama FROM periode WHERE aktif = 1').first();
    return json({ ...saya, periode_aktif: periode });
  }

  if (p === '/api/anggota') {
    wajib(saya, 'admin');
    if (m === 'GET') return json(await daftarAnggota(env));
    if (m === 'POST') return tambahAnggota(req, env);
  }
  let r = p.match(/^\/api\/anggota\/(\d+)$/);
  if (r && m === 'PUT') { wajib(saya, 'admin'); return ubahAnggota(req, env, Number(r[1])); }

  if (p === '/api/periode') {
    wajib(saya, 'admin');
    if (m === 'GET') return json(await daftarPeriode(env));
    if (m === 'POST') return tambahPeriode(req, env);
  }
  r = p.match(/^\/api\/periode\/(\d+)$/);
  if (r && m === 'PUT') { wajib(saya, 'admin'); return ubahPeriode(req, env, Number(r[1])); }
  r = p.match(/^\/api\/periode\/(\d+)\/aktifkan$/);
  if (r && m === 'POST') { wajib(saya, 'admin'); return aktifkanPeriode(req, env, saya, Number(r[1])); }

  if (p === '/api/pilihan') {
    if (m === 'GET') { wajib(saya); return json(await semuaPilihan(env)); }
    if (m === 'POST') { wajib(saya, 'admin', 'pemred'); return tambahPilihan(req, env); }
  }
  if (p === '/api/pilihan/urutan' && m === 'POST') { wajib(saya, 'admin', 'pemred'); return urutkanPilihan(req, env); }
  r = p.match(/^\/api\/pilihan\/(\d+)$/);
  if (r && m === 'PUT') { wajib(saya, 'admin', 'pemred'); return ubahPilihan(req, env, Number(r[1])); }

  throw new Galat(404, 'Tidak ditemukan.');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await pastikanSkema(env.DB);
      return await api(req, env, url);
    } catch (e) {
      if (e instanceof Galat) return json({ galat: e.message }, e.status);
      console.error(e);
      return json({ galat: 'Terjadi kesalahan pada server.' }, 500);
    }
  },
};
