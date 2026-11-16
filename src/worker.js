// Al-Ma'had — Worker utama
// API di /api/*, selain itu file statis dari ./public.
import { pastikanSkema } from './skema.js';
import {
  Galat, json, alihkan, bacaCookie, buatCookie, acak, sha256, dekodeJwt, bacaJson, teks, daftarPeran, wajib,
  hashSandi, cekSandi, iterasiSandi, iterasiHash,
} from './umum.js';
import { apiRedaksi } from './redaksi.js';
import { apiEmail, paramGmail, simpanPengirim, prosesAntrean, jadwal } from './email.js';

const KELOMPOK = { rubrik_berita: 'Rubrik berita', rubrik_majalah: 'Rubrik majalah' };
const UMUR_SESI = 30 * 24 * 3600; // detik
const COOKIE_SESI = 'am_sesi';
const COOKIE_STATE = 'am_state';

const domain = env => (env.GOOGLE_HD || '').toLowerCase();
const KUNCI_GAGAL = 5;            // salah password berturut-turut → akun dikunci
const LAMA_KUNCI = 15 * 60;       // detik
const BATAS_IP = 20;              // salah password dari satu IP dalam 15 menit → IP ditahan
const detikKini = () => Math.floor(Date.now() / 1000);

// NIS: 3–20 karakter huruf/angka/titik/strip. Kosong → null.
function cekNis(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  if (!/^[0-9A-Za-z.-]{3,20}$/.test(s)) throw new Galat(400, 'NIS hanya boleh huruf/angka (3–20 karakter).');
  return s;
}
// Anggota tanpa email menyimpan penanda internal "nis:<NIS>" di kolom email (lihat migrasi 4).
const emailAsli = e => (e && !String(e).startsWith('nis:') ? e : null);
const kolomEmail = (email, nis) => email || `nis:${nis}`;
// Email boleh kosong (A-45); bila diisi harus email sekolah.
function emailOpsional(env, v) {
  return typeof v === 'string' && v.trim() ? emailSekolah(env, v) : null;
}
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
  const a = await env.DB.prepare(`SELECT a.id, a.email, a.nis, a.nama, a.kelas, a.periode_id, s.cara,
      a.sandi_wajib_ganti, a.sandi_hash IS NOT NULL AS punya_sandi
    FROM sesi s JOIN anggota a ON a.id = s.anggota_id
    WHERE s.token_hash = ? AND s.kedaluwarsa > ? AND a.status = 'aktif'`)
    .bind(await sha256(token), detikKini()).first();
  if (!a) return null;
  a.email = emailAsli(a.email);
  // Masuk dengan NIS memakai password awal (= NIS) → wajib ganti dulu (A-46).
  a.wajib_ganti_sandi = a.cara === 'nis' && a.sandi_wajib_ganti === 1;
  a.punya_sandi = !!a.punya_sandi;
  delete a.sandi_wajib_ganti;
  const { results } = await env.DB.prepare('SELECT peran FROM anggota_peran WHERE anggota_id = ?').bind(a.id).all();
  a.peran = results.map(r => r.peran);
  return a;
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
  return { token: await buatSesi(env, a.id, 'google') };
}

async function buatSesi(env, anggotaId, cara) {
  const token = acak();
  const kini = detikKini();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sesi WHERE kedaluwarsa <= ?').bind(kini),
    env.DB.prepare('INSERT INTO sesi (token_hash, anggota_id, kedaluwarsa, cara) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), anggotaId, kini + UMUR_SESI, cara),
  ]);
  return token;
}

// ---------- masuk dengan NIS + password ----------
let hashPalsu = null; // dipakai saat NIS tidak dikenal agar waktu jawab sama (tidak membocorkan NIS terdaftar)
async function masukNis(req, env) {
  const b = await bacaJson(req);
  const nis = typeof b.nis === 'string' ? b.nis.trim() : '';
  const sandi = typeof b.sandi === 'string' ? b.sandi : '';
  if (!nis || !sandi) throw new Galat(400, 'Isi NIS dan password.');
  if (sandi.length > 200) throw new Galat(400, 'NIS atau password salah.');
  const kini = detikKini();
  const ip = req.headers.get('cf-connecting-ip') || 'lokal';
  const dariIp = await env.DB.prepare('SELECT count(*) AS n FROM masuk_gagal WHERE ip = ? AND waktu > ?').bind(ip, kini - LAMA_KUNCI).first();
  if (dariIp.n >= BATAS_IP) throw new Galat(429, 'Terlalu banyak percobaan dari perangkat ini. Coba lagi dalam 15 menit.');
  const a = await env.DB.prepare('SELECT id, status, sandi_hash, gagal_masuk, terkunci_sampai FROM anggota WHERE nis = ? COLLATE NOCASE').bind(nis).first();
  if (a && a.terkunci_sampai > kini)
    throw new Galat(429, `Akun dikunci karena terlalu banyak salah password. Coba lagi dalam ${Math.ceil((a.terkunci_sampai - kini) / 60)} menit.`);
  if (!hashPalsu) hashPalsu = await hashSandi(acak(), iterasiSandi(env));
  const cocok = await cekSandi(sandi, a && a.sandi_hash ? a.sandi_hash : hashPalsu);
  if (!a || !a.sandi_hash || !cocok) {
    const q = [
      env.DB.prepare('INSERT INTO masuk_gagal (ip, waktu) VALUES (?, ?)').bind(ip, kini),
      env.DB.prepare('DELETE FROM masuk_gagal WHERE waktu <= ?').bind(kini - LAMA_KUNCI),
    ];
    if (a) {
      const n = a.gagal_masuk + 1;
      q.push(n >= KUNCI_GAGAL
        ? env.DB.prepare('UPDATE anggota SET gagal_masuk = 0, terkunci_sampai = ? WHERE id = ?').bind(kini + LAMA_KUNCI, a.id)
        : env.DB.prepare('UPDATE anggota SET gagal_masuk = ? WHERE id = ?').bind(n, a.id));
    }
    await env.DB.batch(q);
    throw new Galat(400, 'NIS atau password salah.');
  }
  if (a.status !== 'aktif') throw new Galat(403, 'Akun Anda sudah diarsipkan (periode lama). Hubungi Admin.');
  const q = [env.DB.prepare('UPDATE anggota SET gagal_masuk = 0, terkunci_sampai = NULL WHERE id = ?').bind(a.id)];
  // Naikkan kekuatan hash bila pengaturan iterasi bertambah.
  if (iterasiHash(a.sandi_hash) < iterasiSandi(env))
    q.push(env.DB.prepare('UPDATE anggota SET sandi_hash = ? WHERE id = ?').bind(await hashSandi(sandi, iterasiSandi(env)), a.id));
  await env.DB.batch(q);
  const token = await buatSesi(env, a.id, 'nis');
  return json({ ok: true }, 200, { 'set-cookie': buatCookie(COOKIE_SESI, token, UMUR_SESI) });
}

// Ganti password sendiri. Sesi lain milik anggota ini diakhiri.
async function gantiSandi(req, env, saya) {
  const b = await bacaJson(req);
  const a = await env.DB.prepare('SELECT nis, sandi_hash FROM anggota WHERE id = ?').bind(saya.id).first();
  if (!a.nis) throw new Galat(400, 'Akun Anda belum punya NIS. Minta Admin mengisi NIS terlebih dahulu.');
  const lama = typeof b.lama === 'string' ? b.lama : '';
  const baru = typeof b.baru === 'string' ? b.baru : '';
  if (a.sandi_hash && !(await cekSandi(lama, a.sandi_hash))) throw new Galat(400, 'Password lama salah.');
  if (baru.length < 8) throw new Galat(400, 'Password baru minimal 8 karakter.');
  if (baru.length > 100) throw new Galat(400, 'Password baru maksimal 100 karakter.');
  if (baru.toLowerCase() === a.nis.toLowerCase()) throw new Galat(400, 'Password baru tidak boleh sama dengan NIS.');
  if (baru === lama) throw new Galat(400, 'Password baru harus berbeda dari password lama.');
  const token = bacaCookie(req, COOKIE_SESI);
  await env.DB.batch([
    env.DB.prepare('UPDATE anggota SET sandi_hash = ?, sandi_wajib_ganti = 0, gagal_masuk = 0, terkunci_sampai = NULL WHERE id = ?')
      .bind(await hashSandi(baru, iterasiSandi(env)), saya.id),
    env.DB.prepare('DELETE FROM sesi WHERE anggota_id = ? AND token_hash <> ?').bind(saya.id, await sha256(token || '')),
  ]);
  return json({ ok: true });
}

// ---------- Google OAuth ----------
// mode 'gmail' = Admin menghubungkan akun pengirim email (izin gmail.send); state diawali 'g.'
function googleMulai(req, env, mode) {
  const url = new URL(req.url);
  const state = (mode === 'gmail' ? 'g.' : '') + acak(24);
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${url.origin}/api/google/kembali`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: domain(env),
    prompt: 'select_account',
    ...(mode === 'gmail' ? paramGmail(env) : {}),
  });
  return alihkan(`${env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth'}?${p}`,
    { 'set-cookie': buatCookie(COOKIE_STATE, state, 600, '/api/google') });
}

async function googleKembali(req, env) {
  const url = new URL(req.url);
  const hapusState = buatCookie(COOKIE_STATE, '', 0, '/api/google');
  const state = url.searchParams.get('state') || '';
  const modeGmail = state.startsWith('g.');
  const gagal = kode => alihkan(modeGmail ? `/#email/${kode}` : `/?galat=${kode}`, { 'set-cookie': hapusState });
  if (modeGmail && url.searchParams.get('error')) return gagal('dibatalkan');
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

  if (modeGmail) {
    // Hanya Admin yang sedang masuk boleh menghubungkan akun pengirim.
    const saya = await ambilSaya(req, env);
    if (!saya || !saya.peran.includes('admin')) return gagal('bukan_admin');
    if (!env.ENKRIPSI_KUNCI) return gagal('tanpa_kunci');
    const g = await simpanPengirim(env, email, data);
    if (g) return gagal(g);
    return alihkan('/#email/ok', { 'set-cookie': hapusState });
  }

  const h = await selesaiMasuk(env, email, id.name);
  if (h.galat) return gagal(h.galat);
  const headers = new Headers({ location: '/', 'cache-control': 'no-store' });
  headers.append('set-cookie', hapusState);
  headers.append('set-cookie', buatCookie(COOKIE_SESI, h.token, UMUR_SESI));
  return new Response(null, { status: 302, headers });
}

// ---------- anggota ----------
async function daftarAnggota(env) {
  const { results } = await env.DB.prepare(`SELECT a.id, a.email, a.nis, a.nama, a.kelas, a.status, a.periode_id,
      a.sandi_wajib_ganti AS sandi_awal, a.terkunci_sampai > ${detikKini()} AS terkunci,
      p.nama AS periode, (SELECT group_concat(peran) FROM anggota_peran WHERE anggota_id = a.id) AS peran
    FROM anggota a LEFT JOIN periode p ON p.id = a.periode_id
    ORDER BY a.status, a.nama COLLATE NOCASE`).all();
  return results.map(r => ({ ...r, email: emailAsli(r.email), terkunci: !!r.terkunci, sandi_awal: r.sandi_awal === 1, peran: r.peran ? r.peran.split(',') : [] }));
}

async function jumlahAdminAktif(env, kecualiId) {
  const r = await env.DB.prepare(`SELECT count(DISTINCT a.id) AS n FROM anggota a
    JOIN anggota_peran p ON p.anggota_id = a.id
    WHERE p.peran = 'admin' AND a.status = 'aktif' AND a.id <> ?`).bind(kecualiId).first();
  return r.n;
}

async function tambahAnggota(req, env) {
  const b = await bacaJson(req);
  const email = emailOpsional(env, b.email);
  const nis = cekNis(b.nis);
  if (!email && !nis) throw new Galat(400, 'Isi minimal NIS atau email sekolah.');
  const nama = teks(b.nama, 'Nama', 100);
  const kelas = teks(b.kelas, 'Kelas', 20, false);
  const peran = daftarPeran(b.peran);
  if (email && await env.DB.prepare('SELECT 1 FROM anggota WHERE email = ?').bind(email).first())
    throw new Galat(409, 'Email ini sudah terdaftar.');
  if (nis && await env.DB.prepare('SELECT 1 FROM anggota WHERE nis = ? COLLATE NOCASE').bind(nis).first())
    throw new Galat(409, 'NIS ini sudah terdaftar.');
  const periode = await env.DB.prepare('SELECT id FROM periode WHERE aktif = 1').first();
  // Password awal = NIS, wajib diganti saat pertama masuk dengan NIS (A-46).
  const r = await env.DB.prepare(`INSERT INTO anggota (email, nis, nama, kelas, periode_id, sandi_hash, sandi_wajib_ganti)
    VALUES (?, ?, ?, ?, ?, ?, 1) RETURNING id`)
    .bind(kolomEmail(email, nis), nis, nama, kelas, periode ? periode.id : null, nis ? await hashSandi(nis, iterasiSandi(env)) : null).first();
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
  const emailLama = emailAsli(lama.email);
  const email = b.email === undefined ? emailLama : emailOpsional(env, b.email);
  const nis = b.nis === undefined ? lama.nis : cekNis(b.nis);
  if (!email && !nis) throw new Galat(400, 'Isi minimal NIS atau email sekolah.');
  if (email && email !== (emailLama || '').toLowerCase() && await env.DB.prepare('SELECT 1 FROM anggota WHERE email = ? AND id <> ?').bind(email, id).first())
    throw new Galat(409, 'Email ini sudah terdaftar.');
  if (nis && await env.DB.prepare('SELECT 1 FROM anggota WHERE nis = ? COLLATE NOCASE AND id <> ?').bind(nis, id).first())
    throw new Galat(409, 'NIS ini sudah terdaftar.');
  // NIS berubah dan password masih password awal → password awal ikut NIS baru.
  let sandiHash = lama.sandi_hash;
  if (nis && nis !== lama.nis && (lama.sandi_wajib_ganti === 1 || !lama.sandi_hash)) sandiHash = await hashSandi(nis, iterasiSandi(env));
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
  const q = [env.DB.prepare('UPDATE anggota SET nama = ?, kelas = ?, status = ?, periode_id = ?, email = ?, nis = ?, sandi_hash = ? WHERE id = ?')
    .bind(nama, kelas, status, periodeId, kolomEmail(email, nis), nis, sandiHash, id)];
  if (peran) {
    q.push(env.DB.prepare('DELETE FROM anggota_peran WHERE anggota_id = ?').bind(id));
    for (const p of peran) q.push(env.DB.prepare('INSERT INTO anggota_peran (anggota_id, peran) VALUES (?, ?)').bind(id, p));
  }
  await env.DB.batch(q);
  return json({ ok: true });
}

// Admin mereset password anggota ke NIS-nya (wajib ganti lagi), membuka kunci, dan mengakhiri semua sesinya.
async function resetSandi(env, id) {
  const a = await env.DB.prepare('SELECT nis FROM anggota WHERE id = ?').bind(id).first();
  if (!a) throw new Galat(404, 'Anggota tidak ditemukan.');
  if (!a.nis) throw new Galat(400, 'Anggota ini belum punya NIS. Isi NIS terlebih dahulu.');
  await env.DB.batch([
    env.DB.prepare('UPDATE anggota SET sandi_hash = ?, sandi_wajib_ganti = 1, gagal_masuk = 0, terkunci_sampai = NULL WHERE id = ?')
      .bind(await hashSandi(a.nis, iterasiSandi(env)), id),
    env.DB.prepare('DELETE FROM sesi WHERE anggota_id = ?').bind(id),
  ]);
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
  if (p === '/api/email/hubungkan' && m === 'GET') {
    const s = await ambilSaya(req, env);
    if (!s || !s.peran.includes('admin')) return alihkan('/#email/bukan_admin');
    return googleMulai(req, env, 'gmail');
  }
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

  if (p === '/api/masuk' && m === 'POST') return masukNis(req, env);

  const saya = await ambilSaya(req, env);

  // Wajib ganti password awal: semua API lain ditolak sampai password diganti (A-46).
  if (saya && saya.wajib_ganti_sandi && !['/api/saya', '/api/sandi', '/api/keluar'].includes(p))
    throw new Galat(403, 'Ganti password awal Anda terlebih dahulu.');
  if (p === '/api/sandi' && m === 'POST') { wajib(saya); return gantiSandi(req, env, saya); }

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
  r = p.match(/^\/api\/anggota\/(\d+)\/reset-sandi$/);
  if (r && m === 'POST') { wajib(saya, 'admin'); return resetSandi(env, Number(r[1])); }

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

  // Pengaturan email (Admin).
  const hasilEmail = await apiEmail(req, env, saya, p, m);
  if (hasilEmail) return hasilEmail;

  // Modul redaksi: tugas, naskah, antrean, edisi.
  const hasil = await apiRedaksi(req, env, saya, p, m);
  if (hasil) return hasil;

  throw new Galat(404, 'Tidak ditemukan.');
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      await pastikanSkema(env.DB);
      const res = await api(req, env, url);
      // Setelah perubahan data, kirim email yang baru diantrekan tanpa menahan jawaban.
      if (req.method !== 'GET' && res.ok && ctx) ctx.waitUntil(prosesAntrean(env).catch(e => console.error('email', e)));
      return res;
    } catch (e) {
      if (e instanceof Galat) return json({ galat: e.message }, e.status);
      console.error(e);
      return json({ galat: 'Terjadi kesalahan pada server.' }, 500);
    }
  },
  // Cron (lihat wrangler.jsonc): coba ulang email & pengingat tenggat.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => { await pastikanSkema(env.DB); await jadwal(env); })().catch(e => console.error('jadwal', e)));
  },
};
