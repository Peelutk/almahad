// Upload CSV anggota (A-51..A-54): pratinjau lalu simpan, dengan satu fungsi yang sama.
import { Galat, json, bacaJson } from './umum.js';

export const POLA_NIS = /^[0-9A-Za-z.-]{3,20}$/;
const MAKS_BARIS = 500;
const MAKS_TEKS = 300_000;
const PERAN_CSV = ['reporter', 'editor', 'pemred']; // Admin tidak boleh lewat CSV (A-52)

// Pengurai CSV sederhana: tanda kutip ganda, "" di dalam kutip, baris baru di dalam kutip.
export function uraiCsv(teks) {
  teks = teks.replace(/^﻿/, '');
  const barisPertama = teks.split(/\r?\n/).find(l => l.trim() && !/^sep=/i.test(l.trim())) || '';
  const pisah = (barisPertama.match(/;/g) || []).length > (barisPertama.match(/,/g) || []).length ? ';' : ',';
  const hasil = [];
  let rekam = [], sel = '', kutip = false, no = 1, noMulai = 1;
  const tutupRekam = () => { rekam.push(sel); hasil.push({ no: noMulai, kolom: rekam }); rekam = []; sel = ''; };
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else { if (c === '\n') no++; sel += c; }
    } else if (c === '"' && sel.trim() === '') { kutip = true; sel = ''; }
    else if (c === pisah) { rekam.push(sel); sel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && teks[i + 1] === '\n') i++;
      tutupRekam(); no++; noMulai = no;
    } else sel += c;
  }
  if (sel !== '' || rekam.length) tutupRekam();
  // Baris "sep=;" (petunjuk pemisah untuk Excel) dan baris kosong dibuang.
  return hasil.filter(r => !/^sep=/i.test(r.kolom[0].trim()) && r.kolom.some(k => k.trim()));
}

export async function csvAnggota(req, env, domain) {
  const b = await bacaJson(req);
  if (typeof b.teks !== 'string' || !b.teks.trim()) throw new Galat(400, 'File CSV kosong.');
  if (b.teks.length > MAKS_TEKS) throw new Galat(400, 'File CSV terlalu besar.');
  if (!PERAN_CSV.includes(b.peran)) throw new Galat(400, 'Pilih peran: Reporter, Editor, atau Pemred.');

  let rekam = uraiCsv(b.teks);
  // Baris judul (mis. "NIS;Nama;Kelas") di baris pertama dilewati.
  const judul = rekam.length && (/^nama$/i.test((rekam[0].kolom[1] || '').trim()) || !/\d/.test(rekam[0].kolom[0] || ''));
  if (judul) rekam = rekam.slice(1);
  if (!rekam.length) throw new Galat(400, 'Tidak ada baris data di file CSV.');
  if (rekam.length > MAKS_BARIS) throw new Galat(400, `Maksimal ${MAKS_BARIS} baris per upload (file ini ${rekam.length} baris).`);

  const { results: ada } = await env.DB.prepare(`SELECT lower(nis) AS nis, lower(email) AS email, status FROM anggota`).all();
  const nisAda = new Map(ada.filter(a => a.nis).map(a => [a.nis, a.status]));
  const emailAda = new Map(ada.map(a => [a.email, a.status]));
  const dilihat = new Set();

  const baris = rekam.map(({ no, kolom }) => {
    const nis = (kolom[0] || '').trim(), nama = (kolom[1] || '').trim(), kelas = (kolom[2] || '').trim();
    const email = `${nis.toLowerCase()}@${domain}`;
    const r = { no, nis, nama, kelas, email, status: 'baru', alasan: '' };
    const kunci = nis.toLowerCase();
    if (!nis) [r.status, r.alasan] = ['salah', 'NIS kosong'];
    else if (!POLA_NIS.test(nis)) [r.status, r.alasan] = ['salah', 'NIS hanya boleh huruf/angka/titik/strip (3–20 karakter)'];
    else if (!nama) [r.status, r.alasan] = ['salah', 'Nama kosong'];
    else if (nama.length > 100) [r.status, r.alasan] = ['salah', 'Nama lebih dari 100 karakter'];
    else if (kelas.length > 20) [r.status, r.alasan] = ['salah', 'Kelas lebih dari 20 karakter'];
    else if (dilihat.has(kunci)) [r.status, r.alasan] = ['dilewati', 'NIS ganda di file ini'];
    else if (nisAda.has(kunci)) [r.status, r.alasan] = ['dilewati', `NIS sudah terdaftar${nisAda.get(kunci) === 'arsip' ? ' (anggota arsip)' : ''}`];
    else if (emailAda.has(email)) [r.status, r.alasan] = ['dilewati', 'Email sudah dipakai anggota lain'];
    if (nis) dilihat.add(kunci);
    if (r.status !== 'baru') r.email = '';
    return r;
  });
  const baru = baris.filter(r => r.status === 'baru');
  const jumlah = { baru: baru.length, dilewati: baris.filter(r => r.status === 'dilewati').length, salah: baris.filter(r => r.status === 'salah').length };

  if (!b.simpan) return json({ baris, jumlah, disimpan: 0 });
  if (!baru.length) throw new Galat(400, 'Tidak ada anggota baru untuk disimpan.');
  // Dua perintah dalam satu transaksi; data dikirim sebagai satu JSON (tidak terkena batas jumlah parameter).
  // Password awal = NIS tanpa hash (A-54).
  const data = JSON.stringify(baru.map(r => ({ nis: r.nis, nama: r.nama, kelas: r.kelas, email: r.email })));
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO anggota (email, nis, nama, kelas, periode_id, sandi_hash, sandi_wajib_ganti)
        SELECT json_extract(j.value, '$.email'), json_extract(j.value, '$.nis'), json_extract(j.value, '$.nama'),
               json_extract(j.value, '$.kelas'), (SELECT id FROM periode WHERE aktif = 1), NULL, 1
        FROM json_each(?) j`).bind(data),
      env.DB.prepare(`INSERT INTO anggota_peran (anggota_id, peran)
        SELECT a.id, ? FROM anggota a JOIN json_each(?) j ON a.nis = json_extract(j.value, '$.nis') COLLATE NOCASE`).bind(b.peran, data),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new Galat(409, 'Data anggota berubah saat menyimpan. Ulangi pratinjau lalu simpan lagi.');
    throw e;
  }
  return json({ baris, jumlah, disimpan: baru.length });
}
