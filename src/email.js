// Notifikasi email lewat Gmail API (A-40..A-44).
// - Akun pengirim dihubungkan sekali oleh Admin (OAuth, izin gmail.send); refresh token disimpan
//   TERENKRIPSI (AES-GCM, kunci = secret ENKRIPSI_KUNCI) di tabel pengaturan.
// - Email masuk antrean (email_antrean) lalu dikirim langsung; yang gagal dicoba ulang oleh Cron.
// - Bila notifikasi nonaktif, kejadian tidak diantrekan sama sekali.
import { Galat, json, bacaJson, wajib } from './umum.js';

const SCOPE_GMAIL = 'https://www.googleapis.com/auth/gmail.send';
export const SCOPE_DRIVE = 'https://www.googleapis.com/auth/drive.file'; // hanya file buatan aplikasi (A-55)
const MAKS_PERCOBAAN = 5;
const hariIni = (geser = 0) => new Date(Date.now() + 7 * 3600e3 + geser * 864e5).toISOString().slice(0, 10);
const jamWib = () => new Date(Date.now() + 7 * 3600e3).getUTCHours();
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tglId = s => s ? s.split('-').reverse().join('-') : '';

// ---------- pengaturan ----------
export { aturStmt };
export async function ambilAtur(env, kunci) {
  const r = await env.DB.prepare('SELECT nilai FROM pengaturan WHERE kunci = ?').bind(kunci).first();
  return r ? r.nilai : null;
}
const aturStmt = (env, kunci, nilai) => nilai === null
  ? env.DB.prepare('DELETE FROM pengaturan WHERE kunci = ?').bind(kunci)
  : env.DB.prepare(`INSERT INTO pengaturan (kunci, nilai, diubah_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(kunci) DO UPDATE SET nilai = excluded.nilai, diubah_at = excluded.diubah_at`).bind(kunci, String(nilai));

// ---------- enkripsi refresh token ----------
async function kunciAes(env) {
  if (!env.ENKRIPSI_KUNCI) throw new Galat(500, 'Secret ENKRIPSI_KUNCI belum diatur.');
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.ENKRIPSI_KUNCI));
  return crypto.subtle.importKey('raw', h, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function enkripsi(env, teks) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await kunciAes(env), new TextEncoder().encode(teks));
  return `${b64(iv)}.${b64(new Uint8Array(c))}`;
}
async function dekripsi(env, s) {
  const [iv, c] = s.split('.');
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await kunciAes(env), unb64(c));
  return new TextDecoder().decode(p);
}

// ---------- menghubungkan akun pengirim (dipanggil dari alur OAuth di worker.js) ----------
export function paramGmail(env) {
  return { scope: `openid email ${SCOPE_GMAIL} ${SCOPE_DRIVE}`, access_type: 'offline', prompt: 'consent', login_hint: env.ADMIN_AWAL || '' };
}
export async function simpanPengirim(env, email, data) {
  if (!String(data.scope || '').split(' ').includes(SCOPE_GMAIL)) return 'izin_kurang';
  if (!data.refresh_token) return 'tanpa_token';
  const izinDrive = String(data.scope || '').split(' ').includes(SCOPE_DRIVE);
  // Akun berbeda dari pemilik folder → folder Drive milik akun lama tidak bisa dipakai lagi.
  // (drive_akun tidak ikut dihapus saat akun diputus, agar pergantian akun tetap terdeteksi.)
  const akunDrive = await ambilAtur(env, 'drive_akun');
  const hapusFolder = akunDrive && akunDrive.toLowerCase() !== email.toLowerCase()
    ? [env.DB.prepare("DELETE FROM pengaturan WHERE kunci LIKE 'drive_folder%'")] : [];
  await env.DB.batch([
    ...hapusFolder,
    aturStmt(env, 'drive_akun', email),
    aturStmt(env, 'drive_izin', izinDrive ? '1' : '0'),
    aturStmt(env, 'gmail_token', await enkripsi(env, data.refresh_token)),
    aturStmt(env, 'gmail_pengirim', email),
    aturStmt(env, 'gmail_status', 'terhubung'),
    aturStmt(env, 'gmail_galat', null),
  ]);
  cacheAkses = null;
  return izinDrive ? null : 'ok_tanpa_drive';
}

// ---------- kirim lewat Gmail API ----------
let cacheAkses = null; // { token, habis }
export async function tokenAkses(env) {
  if (cacheAkses && cacheAkses.habis > Date.now() + 60e3) return cacheAkses.token;
  const enc = await ambilAtur(env, 'gmail_token');
  if (!enc) throw new Error('Akun pengirim belum dihubungkan.');
  const r = await fetch(env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: await dekripsi(env, enc), grant_type: 'refresh_token',
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    if (d.error === 'invalid_grant') {
      // Izin dicabut/kedaluwarsa → tandai putus agar Admin menghubungkan ulang.
      await env.DB.batch([aturStmt(env, 'gmail_status', 'putus'), aturStmt(env, 'gmail_galat', 'Izin Gmail dicabut atau kedaluwarsa. Hubungkan ulang.')]);
    }
    throw new Error(`Gagal mengambil token Gmail (${d.error || r.status}).`);
  }
  cacheAkses = { token: d.access_token, habis: Date.now() + (d.expires_in || 3600) * 1000 };
  return cacheAkses.token;
}
const b64url = s => {
  const u8 = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64Utf8 = s => { const u8 = new TextEncoder().encode(s); let bin = ''; for (const x of u8) bin += String.fromCharCode(x); return btoa(bin); };
async function kirimGmail(env, ke, subjek, html) {
  const pengirim = await ambilAtur(env, 'gmail_pengirim');
  if (/[\r\n]/.test(ke + subjek)) throw new Error('Alamat/subjek tidak valid.');
  const badan = b64Utf8(html).replace(/.{76}/g, '$&\r\n');
  const mime = [
    `From: =?UTF-8?B?${b64Utf8("Al-Ma'had")}?= <${pengirim}>`,
    `To: ${ke}`,
    `Subject: =?UTF-8?B?${b64Utf8(subjek)}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    badan,
  ].join('\r\n');
  const r = await fetch(`${env.GMAIL_API_URL || 'https://gmail.googleapis.com'}/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await tokenAkses(env)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime) }),
  });
  if (!r.ok) {
    if (r.status === 401) cacheAkses = null;
    const t = await r.text().catch(() => '');
    throw new Error(`Gmail menolak (${r.status}) ${t.slice(0, 200)}`);
  }
}

// ---------- templat ----------
function templat(env, judul, isiHtml, jalur, tombol) {
  const url = `${(env.APP_URL || '').replace(/\/$/, '')}/${jalur ? '#' + jalur : ''}`;
  return `<!doctype html><html><body style="margin:0;background:#f6f8f6;font-family:Arial,sans-serif;color:#16211b">
  <div style="max-width:560px;margin:0 auto;padding:16px">
    <div style="background:#007A41;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold;font-size:17px">Al-Ma'had</div>
    <div style="background:#fff;border:1px solid #dce3de;border-top:0;border-radius:0 0 10px 10px;padding:18px">
      <h2 style="margin:0 0 10px;font-size:18px">${escHtml(judul)}</h2>
      ${isiHtml}
      <p style="margin:18px 0 4px"><a href="${escHtml(url)}" style="background:#007A41;color:#fff;text-decoration:none;padding:9px 16px;border-radius:8px;display:inline-block">${escHtml(tombol || 'Buka Al-Ma\'had')}</a></p>
    </div>
    <p style="font-size:12px;color:#5a6a60;margin:10px 4px">Email otomatis dari sistem redaksi Al-Ma'had. Tidak perlu dibalas.</p>
  </div></body></html>`;
}
const baris = (label, nilai) => nilai ? `<p style="margin:4px 0"><b>${escHtml(label)}:</b> ${escHtml(nilai)}</p>` : '';

// ---------- antrean ----------
export async function emailAktif(env) {
  return (await ambilAtur(env, 'email_aktif')) === '1' && (await ambilAtur(env, 'gmail_status')) === 'terhubung';
}
async function antrekan(env, daftar) {
  const unik = new Map();
  // Anggota tanpa email (penanda "nis:…") dilewati.
  for (const d of daftar) if (d.ke && d.ke.includes('@') && !unik.has(d.ke.toLowerCase())) unik.set(d.ke.toLowerCase(), d);
  if (!unik.size) return 0;
  await env.DB.batch([...unik.values()].map(d =>
    env.DB.prepare('INSERT INTO email_antrean (ke, subjek, html) VALUES (?, ?, ?)').bind(d.ke, d.subjek, d.html)));
  return unik.size;
}

export async function prosesAntrean(env, maks = 20) {
  if (!(await emailAktif(env))) return { terkirim: 0, gagal: 0 };
  const { results } = await env.DB.prepare(`SELECT id, ke, subjek, html, percobaan FROM email_antrean
    WHERE status = 'menunggu' ORDER BY id LIMIT ?`).bind(maks).all();
  let terkirim = 0, gagal = 0;
  for (const e of results) {
    // Kunci baris agar tidak dikirim dua kali oleh proses lain.
    const k = await env.DB.prepare(`UPDATE email_antrean SET status = 'dikirim', dikunci_at = datetime('now')
      WHERE id = ? AND status = 'menunggu'`).bind(e.id).run();
    if (!k.meta.changes) continue;
    try {
      await kirimGmail(env, e.ke, e.subjek, e.html);
      await env.DB.prepare(`UPDATE email_antrean SET status = 'terkirim', dikirim_at = datetime('now'), galat = NULL WHERE id = ?`).bind(e.id).run();
      terkirim++;
    } catch (err) {
      const n = e.percobaan + 1;
      await env.DB.prepare('UPDATE email_antrean SET status = ?, percobaan = ?, galat = ? WHERE id = ?')
        .bind(n >= MAKS_PERCOBAAN ? 'gagal' : 'menunggu', n, String(err.message).slice(0, 300), e.id).run();
      gagal++;
      if ((await ambilAtur(env, 'gmail_status')) !== 'terhubung') break; // akun putus: hentikan
    }
  }
  return { terkirim, gagal };
}

// ---------- penerima ----------
async function emailPeran(env, peran, kecualiId) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT a.email FROM anggota a JOIN anggota_peran p ON p.anggota_id = a.id
    WHERE a.status = 'aktif' AND a.email LIKE '%@%' AND p.peran = ? AND a.id <> ?`).bind(peran, kecualiId || 0).all();
  return results.map(r => r.email);
}

// ---------- kejadian ----------
export async function notifTugas(env, tugasId) {
  if (!(await emailAktif(env))) return 0;
  const t = await env.DB.prepare(`SELECT t.id, t.judul, t.keterangan, t.jenis, t.tenggat, r.nilai AS rubrik,
      rp.email, rp.status AS st, pb.nama AS pemberi
    FROM tugas t JOIN pilihan r ON r.id = t.rubrik_id JOIN anggota rp ON rp.id = t.reporter_id JOIN anggota pb ON pb.id = t.pemberi_id
    WHERE t.id = ?`).bind(tugasId).first();
  if (!t || t.st !== 'aktif') return 0;
  return antrekan(env, [{
    ke: t.email, subjek: `Tugas liputan baru: ${t.judul}`,
    html: templat(env, 'Anda mendapat tugas liputan', baris('Tugas', t.judul) + baris('Jenis', t.jenis === 'berita' ? 'Berita' : 'Majalah') +
      baris('Rubrik', t.rubrik) + baris('Tenggat', tglId(t.tenggat)) + baris('Dari', t.pemberi) + baris('Keterangan', t.keterangan),
      'tugas', 'Lihat tugas'),
  }]);
}

export async function notifNaskah(env, naskahId, aksi, oleh, catatan) {
  if (!(await emailAktif(env))) return 0;
  const n = await env.DB.prepare(`SELECT n.id, n.judul, n.jenis, n.penulis_id, a.nama AS penulis, a.email, a.status AS st, r.nilai AS rubrik
    FROM naskah n JOIN anggota a ON a.id = n.penulis_id JOIN pilihan r ON r.id = n.rubrik_id WHERE n.id = ?`).bind(naskahId).first();
  if (!n) return 0;
  const info = baris('Judul', n.judul) + baris('Jenis', n.jenis === 'berita' ? 'Berita' : 'Majalah') + baris('Rubrik', n.rubrik) + baris('Penulis', n.penulis);
  const jalur = `naskah/${n.id}`;
  const daftar = [];
  if (aksi === 'ajukan') {
    for (const ke of await emailPeran(env, 'editor', oleh.id))
      daftar.push({ ke, subjek: `Naskah perlu disunting: ${n.judul}`, html: templat(env, 'Naskah baru menunggu suntingan', info, jalur, 'Sunting naskah') });
  } else if (aksi === 'setujui') {
    for (const ke of await emailPeran(env, 'pemred', oleh.id))
      daftar.push({ ke, subjek: `Menunggu persetujuan Pemred: ${n.judul}`, html: templat(env, 'Naskah lolos editor', info + baris('Disetujui oleh', oleh.nama), jalur, 'Periksa naskah') });
  } else if (['revisi', 'tolak', 'terbitkan'].includes(aksi) && n.penulis_id !== oleh.id && n.st === 'aktif') {
    const judul = { revisi: 'Naskah Anda perlu revisi', tolak: 'Naskah Anda ditolak', terbitkan: 'Naskah Anda terbit' }[aksi];
    daftar.push({ ke: n.email, subjek: `${judul}: ${n.judul}`, html: templat(env, judul, info + baris('Oleh', oleh.nama) + baris('Catatan', catatan), jalur, 'Buka naskah') });
  }
  return antrekan(env, daftar);
}

// Pengingat tenggat: H-1 dan saat terlambat, masing-masing sekali per tugas (mulai pukul 06.00 WIB).
export async function pengingatTenggat(env) {
  if (!(await emailAktif(env)) || jamWib() < 6) return 0;
  const sql = `SELECT t.id, t.judul, t.tenggat, rp.email FROM tugas t JOIN anggota rp ON rp.id = t.reporter_id
    WHERE t.status IN ('baru','dikerjakan') AND rp.status = 'aktif' AND rp.email LIKE '%@%' AND `;
  const besok = (await env.DB.prepare(sql + 't.tenggat = ? AND t.ingat_h1_at IS NULL').bind(hariIni(1)).all()).results;
  const telat = (await env.DB.prepare(sql + 't.tenggat < ? AND t.ingat_telat_at IS NULL').bind(hariIni()).all()).results;
  const q = [];
  for (const t of besok) {
    q.push(env.DB.prepare('INSERT INTO email_antrean (ke, subjek, html) VALUES (?, ?, ?)').bind(t.email, `Pengingat: tenggat besok — ${t.judul}`,
      templat(env, 'Tenggat tugas Anda besok', baris('Tugas', t.judul) + baris('Tenggat', tglId(t.tenggat)), 'tugas', 'Lihat tugas')));
    q.push(env.DB.prepare("UPDATE tugas SET ingat_h1_at = datetime('now') WHERE id = ?").bind(t.id));
  }
  for (const t of telat) {
    q.push(env.DB.prepare('INSERT INTO email_antrean (ke, subjek, html) VALUES (?, ?, ?)').bind(t.email, `Tugas terlambat: ${t.judul}`,
      templat(env, 'Tugas Anda melewati tenggat', baris('Tugas', t.judul) + baris('Tenggat', tglId(t.tenggat)) +
        '<p>Segera kerjakan dan ajukan naskahnya, atau hubungi pemberi tugas.</p>', 'tugas', 'Lihat tugas')));
    q.push(env.DB.prepare("UPDATE tugas SET ingat_telat_at = datetime('now') WHERE id = ?").bind(t.id));
  }
  if (q.length) await env.DB.batch(q);
  return besok.length + telat.length;
}

// Dijalankan oleh Cron: lepaskan kunci macet, buat pengingat, kirim antrean.
export async function jadwal(env) {
  await env.DB.prepare(`UPDATE email_antrean SET status = 'menunggu' WHERE status = 'dikirim' AND dikunci_at < datetime('now', '-10 minutes')`).run();
  await pengingatTenggat(env);
  return prosesAntrean(env, 50);
}

// ---------- API pengaturan email (Admin) ----------
export async function apiEmail(req, env, saya, p, m) {
  if (!p.startsWith('/api/email')) return null;
  wajib(saya, 'admin');
  if (p === '/api/email' && m === 'GET') {
    const status = await ambilAtur(env, 'gmail_status');
    const jumlah = (await env.DB.prepare('SELECT status, count(*) AS n FROM email_antrean GROUP BY status').all()).results;
    const terbaru = (await env.DB.prepare(`SELECT id, ke, subjek, status, percobaan, galat, dibuat_at, dikirim_at
      FROM email_antrean ORDER BY id DESC LIMIT 30`).all()).results;
    return json({
      status: status || 'belum', pengirim: await ambilAtur(env, 'gmail_pengirim'), galat: await ambilAtur(env, 'gmail_galat'),
      aktif: (await ambilAtur(env, 'email_aktif')) === '1', kunci_ada: !!env.ENKRIPSI_KUNCI,
      drive: status === 'terhubung' && (await ambilAtur(env, 'drive_izin')) === '1',
      drive_folder: await ambilAtur(env, 'drive_folder'),
      jumlah: Object.fromEntries(jumlah.map(j => [j.status, j.n])), terbaru,
    });
  }
  if (p === '/api/email' && m === 'PUT') {
    const b = await bacaJson(req);
    if (typeof b.aktif !== 'boolean') throw new Galat(400, 'Nilai aktif tidak valid.');
    if (b.aktif && (await ambilAtur(env, 'gmail_status')) !== 'terhubung') throw new Galat(400, 'Hubungkan akun Gmail pengirim terlebih dahulu.');
    await aturStmt(env, 'email_aktif', b.aktif ? '1' : '0').run();
    return json({ ok: true });
  }
  if (p === '/api/email/uji' && m === 'POST') {
    if ((await ambilAtur(env, 'gmail_status')) !== 'terhubung') throw new Galat(400, 'Hubungkan akun Gmail pengirim terlebih dahulu.');
    if (!saya.email) throw new Galat(400, 'Akun Anda tidak punya email.');
    try {
      await kirimGmail(env, saya.email, "Email uji Al-Ma'had", templat(env, 'Email uji berhasil',
        `<p>Assalamu'alaikum ${escHtml(saya.nama)}, notifikasi email Al-Ma'had sudah bisa mengirim email.</p>`, '', "Buka Al-Ma'had"));
    } catch (e) { throw new Galat(502, e.message); }
    return json({ ok: true, ke: saya.email });
  }
  if (p === '/api/email/putus' && m === 'POST') {
    await env.DB.batch(['gmail_token', 'gmail_pengirim', 'gmail_status', 'gmail_galat', 'drive_izin'].map(k => aturStmt(env, k, null))
      .concat([aturStmt(env, 'email_aktif', '0')]));
    cacheAkses = null;
    return json({ ok: true });
  }
  if (p === '/api/email/ulang' && m === 'POST') {
    // Kirim ulang email yang gagal permanen.
    const r = await env.DB.prepare("UPDATE email_antrean SET status = 'menunggu', percobaan = 0 WHERE status = 'gagal'").run();
    return json({ ok: true, jumlah: r.meta.changes });
  }
  return null;
}
