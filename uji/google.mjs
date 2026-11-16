// Uji login Google (verifikasi id_token) — butuh tiruan-google.mjs
const B = process.env.B || 'http://localhost:8795', CID = '272243653251-t44feo34jks8603qa3sb0e9l9qthun3b.apps.googleusercontent.com';
let l = 0, g = 0; const cek = (n, ok, i = '') => { ok ? l++ : g++; console.log(`${ok ? 'OK  ' : 'GAGAL'} ${n}${ok ? '' : ' :: ' + i}`); };
const kode = k => Buffer.from(JSON.stringify(k)).toString('base64url');
const dasar = { aud: CID, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 600, email_verified: true, hd: 'daarululuumlido.com', email: '216326@daarululuumlido.com', name: 'Hong Khai' };
async function kembali(klaim) {
  const r = await fetch(`${B}/api/google/kembali?state=s1&code=${kode(klaim)}`, { redirect: 'manual', headers: { cookie: 'am_state=s1' } });
  return { loc: r.headers.get('location'), kuki: (r.headers.get('set-cookie') || '').match(/am_sesi=([^;]+)/)?.[1] };
}
let r = await kembali({ ...dasar, aud: 'lain' }); cek('aud salah ditolak', r.loc === '/?galat=google' && !r.kuki, r.loc);
r = await kembali({ ...dasar, iss: 'evil.com' }); cek('iss salah ditolak', r.loc === '/?galat=google');
r = await kembali({ ...dasar, exp: 1 }); cek('token kedaluwarsa ditolak', r.loc === '/?galat=google');
r = await kembali({ ...dasar, email_verified: false }); cek('email belum terverifikasi ditolak', r.loc === '/?galat=google');
r = await kembali({ ...dasar, hd: undefined, email: '216326@gmail.com' }); cek('akun luar domain ditolak', r.loc === '/?galat=domain');
r = await kembali({ ...dasar, email: 'x@gmail.com' }); cek('hd cocok tapi email luar ditolak', r.loc === '/?galat=domain');
r = await kembali({ ...dasar, email: 'tamu@daarululuumlido.com' }); cek('email sekolah tak terdaftar ditolak', r.loc === '/?galat=belum_terdaftar');
r = await kembali(dasar); cek('admin berhasil masuk via Google', r.loc === '/' && !!r.kuki, r.loc);
const s = await fetch(B + '/api/saya', { headers: { cookie: 'am_sesi=' + r.kuki } }).then(x => x.json());
cek('sesi Google valid', s.email === '216326@daarululuumlido.com' && s.peran.includes('admin') && s.wajib_ganti_sandi === false, JSON.stringify(s));
console.log(`\nLulus ${l}, gagal ${g}`); process.exit(g ? 1 : 0);
