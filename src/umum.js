// Pembantu bersama untuk semua modul API.

export const PERAN = ['reporter', 'editor', 'pemred', 'admin'];

export class Galat extends Error {
  constructor(status, pesan) { super(pesan); this.status = status; }
}

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
export const alihkan = (lokasi, headers = {}) => new Response(null, { status: 302, headers: { location: lokasi, 'cache-control': 'no-store', ...headers } });

export function bacaCookie(req, nama) {
  const c = req.headers.get('cookie') || '';
  for (const bagian of c.split(';')) {
    const [k, ...v] = bagian.trim().split('=');
    if (k === nama) return v.join('=');
  }
  return null;
}
export const buatCookie = (nama, nilai, umur, path = '/') =>
  `${nama}=${nilai}; Path=${path}; Max-Age=${umur}; HttpOnly; Secure; SameSite=Lax`;

export function acak(n = 32) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256(teks) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teks));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function dekodeJwt(token) {
  const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const biner = atob(p + '='.repeat((4 - p.length % 4) % 4));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(biner, c => c.charCodeAt(0))));
}
export async function bacaJson(req) {
  try { return await req.json(); } catch { throw new Galat(400, 'Data tidak valid.'); }
}
export function teks(v, nama, maks, wajib = true) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (wajib && !s) throw new Galat(400, `${nama} wajib diisi.`);
  if (s.length > maks) throw new Galat(400, `${nama} maksimal ${maks} karakter.`);
  return s;
}
export function daftarPeran(v) {
  if (!Array.isArray(v)) throw new Galat(400, 'Peran tidak valid.');
  const p = [...new Set(v)];
  if (!p.length) throw new Galat(400, 'Pilih minimal satu peran.');
  if (p.some(x => !PERAN.includes(x))) throw new Galat(400, 'Peran tidak dikenal.');
  return p;
}
export function wajib(saya, ...peran) {
  if (!saya) throw new Galat(401, 'Silakan masuk terlebih dahulu.');
  if (peran.length && !peran.some(p => saya.peran.includes(p))) throw new Galat(403, 'Anda tidak punya akses untuk ini.');
}
