// Al-Ma'had — tampilan aplikasi (Tahap 1)
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const besar = s => s ? s[0].toUpperCase() + s.slice(1) : '';
const PERAN = ['reporter', 'editor', 'pemred', 'admin'];

let saya = null;

function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('ada');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('ada'), 2600);
}

async function api(jalur, cara = 'GET', data) {
  const opsi = { method: cara, headers: { 'x-almahad': '1' } };
  if (data !== undefined) { opsi.headers['content-type'] = 'application/json'; opsi.body = JSON.stringify(data); }
  const r = await fetch(jalur, opsi);
  const isi = await r.json().catch(() => ({}));
  if (r.status === 401 && jalur !== '/api/saya') { saya = null; location.hash = ''; tampil(); }
  if (!r.ok) throw new Error(isi.galat || 'Terjadi kesalahan.');
  return isi;
}
const punya = (...p) => !!saya && p.some(x => saya.peran.includes(x));

// ---------- halaman masuk ----------
const PESAN_MASUK = {
  belum_terdaftar: 'Email Anda belum terdaftar sebagai anggota. Hubungi Admin.',
  arsip: 'Akun Anda sudah diarsipkan (periode lama). Hubungi Admin.',
  domain: 'Gunakan akun Google email sekolah.',
  sesi_masuk: 'Proses masuk kedaluwarsa. Silakan coba lagi.',
  google: 'Gagal memverifikasi akun Google. Silakan coba lagi.',
  belum_diatur: 'Login Google belum diatur oleh pengelola (client secret).',
};
function halMasuk() {
  const kode = new URLSearchParams(location.search).get('galat');
  return `<div class="masuk"><div class="kartu">
    <div class="logo" aria-hidden="true">M</div>
    <h1>Al-Ma'had</h1>
    <p class="sub">Sistem redaksi organisasi jurnalistik</p>
    ${kode ? `<div class="galat">${esc(PESAN_MASUK[kode] || 'Gagal masuk.')}</div>` : ''}
    <a class="btn utama g-btn" href="/api/google/mulai">Masuk dengan Google</a>
    <p class="sub" style="margin-top:12px;font-size:13px">Hanya email sekolah yang terdaftar sebagai anggota.</p>
  </div></div>`;
}

// ---------- dasbor ----------
async function halDasbor() {
  return `<h1>Assalamu'alaikum, ${esc(saya.nama)}</h1>
  <p class="sub">Periode aktif: <b>${esc(saya.periode_aktif?.nama || '—')}</b></p>
  <div class="grid">
    <div class="kartu"><b>Peran Anda</b><div style="margin-top:8px">${saya.peran.map(p => `<span class="lencana l-peran">${besar(p)}</span>`).join(' ')}</div></div>
  </div>
  <div class="kartu"><b>Tahap 1</b><p class="sub" style="margin:6px 0 0">Fitur yang sudah tersedia: Anggota, Periode, dan Daftar Pilihan.
  Tugas liputan, naskah, antrean redaksi, dan edisi majalah menyusul pada tahap berikutnya.</p></div>`;
}

// ---------- anggota ----------
let anggotaCache = [];
let tampilArsip = false;
async function halAnggota() {
  anggotaCache = await api('/api/anggota');
  const daftar = anggotaCache.filter(a => tampilArsip || a.status === 'aktif');
  return `<div class="baris antara"><div><h1>Anggota</h1><p class="sub">Satu anggota boleh punya beberapa peran. Anggota periode lama diarsipkan.</p></div>
    <button class="btn utama" onclick="formAnggota()">+ Tambah anggota</button></div>
  <div class="kartu">
    <div class="cek" style="margin-bottom:6px"><label><input type="checkbox" ${tampilArsip ? 'checked' : ''} onchange="tampilArsip=this.checked;tampil()"> Tampilkan anggota arsip</label></div>
    ${daftar.length ? `<div class="tabel-wadah"><table><tr><th>Nama</th><th>Email</th><th>Kelas</th><th>Peran</th><th>Periode</th><th></th></tr>
    ${daftar.map(a => `<tr style="${a.status === 'arsip' ? 'opacity:.6' : ''}"><td><b>${esc(a.nama)}</b>${a.status === 'arsip' ? ' <span class="lencana l-draf">Arsip</span>' : ''}</td>
      <td>${esc(a.email)}</td><td>${esc(a.kelas)}</td>
      <td>${a.peran.map(p => `<span class="lencana l-peran">${besar(p)}</span>`).join(' ')}</td>
      <td>${esc(a.periode || '—')}</td>
      <td><button class="btn kecil" onclick="formAnggota(${a.id})">Ubah</button></td></tr>`).join('')}
    </table></div>` : '<div class="kosong">Belum ada anggota.</div>'}
  </div>`;
}
function formAnggota(id) {
  const a = id ? anggotaCache.find(x => x.id === id) : { email: '', nama: '', kelas: '', peran: ['reporter'], status: 'aktif' };
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog" id="f-anggota">
    <h2 style="margin-top:0">${id ? 'Ubah anggota' : 'Tambah anggota'}</h2>
    <label>Email sekolah</label><input type="text" name="email" value="${esc(a.email)}" ${id ? 'disabled' : 'required'} placeholder="nama@daarululuumlido.com">
    <label>Nama</label><input type="text" name="nama" value="${esc(a.nama)}" required maxlength="100">
    <label>Kelas</label><input type="text" name="kelas" value="${esc(a.kelas)}" maxlength="20">
    <label>Peran</label><div class="cek">${PERAN.map(p => `<label><input type="checkbox" name="peran" value="${p}" ${a.peran.includes(p) ? 'checked' : ''}> ${besar(p)}</label>`).join('')}</div>
    ${id ? `<label>Status</label><select name="status"><option value="aktif" ${a.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="arsip" ${a.status === 'arsip' ? 'selected' : ''}>Arsip</option></select>` : ''}
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Simpan</button><button class="btn" value="batal" formnovalidate>Batal</button></div>
  </form>`;
  d.showModal();
  $('#f-anggota').onsubmit = async e => {
    if (e.submitter?.value !== 'simpan') return;
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { nama: f.get('nama'), kelas: f.get('kelas'), peran: f.getAll('peran') };
    if (id) data.status = f.get('status'); else data.email = f.get('email');
    try {
      await api(id ? `/api/anggota/${id}` : '/api/anggota', id ? 'PUT' : 'POST', data);
      d.close(); toast('Tersimpan.'); tampil();
    } catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
  };
}

// ---------- periode ----------
let periodeCache = [];
async function halPeriode() {
  periodeCache = await api('/api/periode');
  return `<div class="baris antara"><div><h1>Periode Kepengurusan</h1><p class="sub">Saat periode baru diaktifkan, anggota yang tidak dilanjutkan otomatis diarsipkan.</p></div>
    <button class="btn utama" onclick="formPeriode()">+ Periode baru</button></div>
  <div class="kartu"><div class="tabel-wadah"><table><tr><th>Periode</th><th>Anggota aktif</th><th>Status</th><th></th></tr>
  ${periodeCache.map(p => `<tr><td><b>${esc(p.nama)}</b></td><td>${p.jumlah_aktif}</td>
    <td>${p.aktif ? '<span class="lencana l-terbit">Aktif</span>' : '—'}</td>
    <td style="text-align:right;white-space:nowrap"><button class="btn kecil" onclick="formPeriode(${p.id})">Ganti nama</button>
    ${p.aktif ? '' : `<button class="btn kecil" onclick="formAktifkan(${p.id})">Jadikan aktif</button>`}</td></tr>`).join('')}
  </table></div></div>`;
}
function formPeriode(id) {
  const p = id ? periodeCache.find(x => x.id === id) : { nama: '' };
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog" id="f-periode"><h2 style="margin-top:0">${id ? 'Ganti nama periode' : 'Periode baru'}</h2>
    <label>Nama periode</label><input type="text" name="nama" value="${esc(p.nama)}" required maxlength="30" placeholder="mis. 2027/2028">
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Simpan</button><button class="btn" value="batal" formnovalidate>Batal</button></div></form>`;
  d.showModal();
  $('#f-periode').onsubmit = async e => {
    if (e.submitter?.value !== 'simpan') return;
    e.preventDefault();
    try {
      await api(id ? `/api/periode/${id}` : '/api/periode', id ? 'PUT' : 'POST', { nama: new FormData(e.target).get('nama') });
      d.close(); toast('Tersimpan.'); tampil();
    } catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
  };
}
async function formAktifkan(id) {
  const p = periodeCache.find(x => x.id === id);
  const aktif = (await api('/api/anggota')).filter(a => a.status === 'aktif');
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog" id="f-aktif"><h2 style="margin-top:0">Aktifkan periode ${esc(p.nama)}</h2>
    <p class="sub">Centang anggota yang <b>lanjut</b> ke periode ini. Yang tidak dicentang akan <b>diarsipkan</b> dan tidak bisa masuk lagi (masih bisa diaktifkan kembali oleh Admin).</p>
    <div style="max-height:300px;overflow:auto">${aktif.map(a => `<div class="cek"><label><input type="checkbox" name="lanjut" value="${a.id}" checked ${a.id === saya.id ? 'disabled' : ''}>
      ${esc(a.nama)} <small style="color:var(--teks-2)">${a.peran.map(besar).join(', ')}${a.id === saya.id ? ' — Anda' : ''}</small></label></div>`).join('')}</div>
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Aktifkan</button><button class="btn" value="batal" formnovalidate>Batal</button></div></form>`;
  d.showModal();
  $('#f-aktif').onsubmit = async e => {
    if (e.submitter?.value !== 'simpan') return;
    e.preventDefault();
    const lanjut = new FormData(e.target).getAll('lanjut').map(Number);
    try {
      await api(`/api/periode/${id}/aktifkan`, 'POST', { lanjut });
      d.close(); toast('Periode diaktifkan.'); saya = await api('/api/saya'); tampil();
    } catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
  };
}

// ---------- daftar pilihan ----------
let kelompok = 'rubrik_berita';
let pilihanCache = {};
async function halPilihan() {
  pilihanCache = await api('/api/pilihan');
  const k = pilihanCache[kelompok];
  return `<h1>Daftar Pilihan</h1><p class="sub">Dikelola Admin dan Pemred. Pilihan tidak dihapus — cukup dinonaktifkan agar data lama tetap utuh.</p>
  <div class="tab">${Object.entries(pilihanCache).map(([kk, v]) => `<button class="${kk === kelompok ? 'aktif' : ''}" onclick="kelompok='${kk}';tampil()">${esc(v.judul)}</button>`).join('')}</div>
  <div class="kartu">
    <form class="baris" style="margin-bottom:10px" onsubmit="tambahPilihan(event)"><input type="text" name="nilai" placeholder="Nilai baru" maxlength="60" required style="flex:1"><button class="btn utama">+ Tambah</button></form>
    ${k.isi.length ? `<div class="tabel-wadah"><table>${k.isi.map((r, i) => `<tr style="${r.aktif ? '' : 'opacity:.55'}"><td style="width:30px">${i + 1}</td><td>${esc(r.nilai)}</td>
      <td>${r.aktif ? 'Aktif' : '<span class="lencana l-draf">Nonaktif</span>'}</td>
      <td style="text-align:right;white-space:nowrap">
        <button class="btn kecil" onclick="geserPilihan(${i},-1)" ${i ? '' : 'disabled'} aria-label="Naikkan">↑</button>
        <button class="btn kecil" onclick="geserPilihan(${i},1)" ${i < k.isi.length - 1 ? '' : 'disabled'} aria-label="Turunkan">↓</button>
        <button class="btn kecil" onclick="namaiPilihan(${r.id})">Ubah</button>
        <button class="btn kecil" onclick="aturPilihan(${r.id},${r.aktif ? 0 : 1})">${r.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>`).join('')}</table></div>`
      : '<div class="kosong">Belum ada pilihan.</div>'}
  </div>`;
}
async function coba(fn) { try { await fn(); tampil(); } catch (e) { toast(e.message); } }
function tambahPilihan(e) {
  e.preventDefault();
  const nilai = new FormData(e.target).get('nilai');
  coba(() => api('/api/pilihan', 'POST', { kelompok, nilai }));
}
const aturPilihan = (id, aktif) => coba(() => api(`/api/pilihan/${id}`, 'PUT', { aktif }));
function namaiPilihan(id) {
  const r = pilihanCache[kelompok].isi.find(x => x.id === id);
  const nilai = prompt('Ubah nilai pilihan:', r.nilai);
  if (nilai !== null && nilai.trim() && nilai.trim() !== r.nilai) coba(() => api(`/api/pilihan/${id}`, 'PUT', { nilai }));
}
function geserPilihan(i, arah) {
  const ids = pilihanCache[kelompok].isi.map(r => r.id);
  [ids[i], ids[i + arah]] = [ids[i + arah], ids[i]];
  coba(() => api('/api/pilihan/urutan', 'POST', { kelompok, ids }));
}

// ---------- kerangka & rute ----------
const MENU = [
  ['dasbor', 'Dasbor', () => true, halDasbor],
  ['__', 'Pengaturan', () => punya('admin', 'pemred')],
  ['anggota', 'Anggota', () => punya('admin'), halAnggota],
  ['periode', 'Periode', () => punya('admin'), halPeriode],
  ['pilihan', 'Daftar Pilihan', () => punya('admin', 'pemred'), halPilihan],
];

async function keluar() {
  try { await api('/api/keluar', 'POST'); } catch {}
  saya = null; location.hash = ''; tampil();
}

async function tampil() {
  if (!saya) {
    try { saya = await api('/api/saya'); } catch { saya = null; }
  }
  if (!saya) { $('#app').innerHTML = halMasuk(); return; }
  if (location.search) history.replaceState(null, '', '/' + location.hash);

  const rute = location.hash.slice(1) || 'dasbor';
  const item = MENU.find(m => m[0] === rute && m[3] && m[2]()) || MENU[0];
  $('#app').innerHTML = `
  <header class="atas">
    <button class="menu-btn" onclick="$('nav').classList.toggle('buka')" aria-label="Menu">☰</button>
    <div class="logo" aria-hidden="true">M</div><b>Al-Ma'had</b><span class="sela"></span>
    <div class="siapa">${esc(saya.nama)}<br>${saya.peran.map(besar).join(', ')}</div>
    <button class="btn kecil" onclick="keluar()">Keluar</button>
  </header>
  <div class="tata">
    <nav>${MENU.filter(m => m[2]()).map(([k, t]) => k === '__' ? `<div class="judul">${t}</div>` : `<a href="#${k}" class="${item[0] === k ? 'aktif' : ''}">${t}</a>`).join('')}</nav>
    <main id="isi"><div class="muat">Memuat…</div></main>
  </div>`;
  try { $('#isi').innerHTML = await item[3](); }
  catch (e) { $('#isi').innerHTML = `<div class="galat">${esc(e.message)}</div>`; }
}

addEventListener('hashchange', tampil);
tampil();
