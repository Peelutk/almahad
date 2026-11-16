// Al-Ma'had — tampilan aplikasi (kerangka, masuk, pengaturan)
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
    <form id="f-masuk" onsubmit="masukNis(event)" style="text-align:left">
      <label for="m-nis">NIS</label><input type="text" id="m-nis" name="nis" autocomplete="username" inputmode="text" required maxlength="20">
      <label for="m-sandi">Password</label><input type="password" id="m-sandi" name="sandi" autocomplete="current-password" required maxlength="200">
      <div class="galat" id="m-galat" hidden></div>
      <button class="btn utama g-btn" id="m-tombol">Masuk</button>
    </form>
    <p class="sub" style="margin:10px 0 0;font-size:13px">Password awal = NIS. Lupa password? Hubungi Admin.</p>
    <div class="pemisah"><span>atau</span></div>
    <a class="btn g-btn" style="margin-top:0" href="/api/google/mulai">Masuk dengan Google</a>
    <p class="sub" style="margin-top:8px;font-size:13px">Google: khusus email sekolah yang terdaftar.</p>
  </div></div>`;
}
async function masukNis(e) {
  e.preventDefault();
  const f = e.target, g = $('#m-galat'), t = $('#m-tombol');
  t.disabled = true; g.hidden = true;
  try {
    await api('/api/masuk', 'POST', { nis: f.nis.value, sandi: f.sandi.value });
    saya = null; history.replaceState(null, '', '/'); tampil();
  } catch (err) { g.hidden = false; g.textContent = err.message; t.disabled = false; f.sandi.value = ''; f.sandi.focus(); }
}

// ---------- ganti password (wajib saat masuk pertama dengan NIS, atau dari Akun saya) ----------
function formSandi(wajib) {
  return `<form id="f-sandi" onsubmit="gantiSandi(event, ${wajib})">
    ${saya.punya_sandi ? `<label for="s-lama">Password lama${wajib ? ' (password awal = NIS Anda)' : ''}</label>
      <input type="password" id="s-lama" name="lama" autocomplete="current-password" required maxlength="200">` : ''}
    <label for="s-baru">Password baru (minimal 8 karakter, tidak sama dengan NIS)</label>
    <input type="password" id="s-baru" name="baru" autocomplete="new-password" required minlength="8" maxlength="100">
    <label for="s-ulang">Ulangi password baru</label>
    <input type="password" id="s-ulang" name="ulang" autocomplete="new-password" required minlength="8" maxlength="100">
    <div class="galat" id="s-galat" hidden></div>
    <div class="baris" style="margin-top:14px"><button class="btn utama">Simpan password</button>
      ${wajib ? '<button class="btn" type="button" onclick="keluar()">Keluar</button>' : ''}</div>
  </form>`;
}
async function gantiSandi(e, wajib) {
  e.preventDefault();
  const f = e.target, g = $('#s-galat');
  g.hidden = true;
  if (f.baru.value !== f.ulang.value) { g.hidden = false; g.textContent = 'Ulangan password baru tidak sama.'; return; }
  try {
    await api('/api/sandi', 'POST', { lama: f.lama ? f.lama.value : '', baru: f.baru.value });
    toast('Password berhasil diganti.');
    saya = null; if (wajib) location.hash = 'dasbor'; tampil();
  } catch (err) { g.hidden = false; g.textContent = err.message; }
}
function halGantiWajib() {
  return `<div class="masuk"><div class="kartu" style="max-width:420px;text-align:left">
    <div class="logo" aria-hidden="true" style="margin:0 auto 12px">M</div>
    <h1 style="text-align:center">Ganti password awal</h1>
    <p class="sub" style="text-align:center">Assalamu'alaikum, ${esc(saya.nama)}. Demi keamanan, ganti password awal (NIS) Anda sebelum melanjutkan.</p>
    ${formSandi(true)}
  </div></div>`;
}
async function halAkun() {
  return `<h1>Akun saya</h1><p class="sub">Data akun diatur oleh Admin. Di sini Anda bisa mengganti password.</p>
  <div class="kartu"><table>
    <tr><th style="width:140px">Nama</th><td>${esc(saya.nama)}</td></tr>
    <tr><th>NIS</th><td>${esc(saya.nis || '—')}</td></tr>
    <tr><th>Email</th><td>${esc(saya.email || '—')}</td></tr>
    <tr><th>Kelas</th><td>${esc(saya.kelas || '—')}</td></tr>
    <tr><th>Peran</th><td>${saya.peran.map(p => `<span class="lencana l-peran">${besar(p)}</span>`).join(' ')}</td></tr>
  </table></div>
  <div class="kartu"><b>Ganti password</b>
    ${saya.nis ? formSandi(false) : '<p class="sub">Akun Anda belum punya NIS, jadi belum bisa masuk dengan NIS + password. Minta Admin mengisi NIS.</p>'}
  </div>`;
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
    ${daftar.length ? `<div class="tabel-wadah"><table><tr><th>Nama</th><th>NIS</th><th>Email</th><th>Kelas</th><th>Peran</th><th>Periode</th><th></th></tr>
    ${daftar.map(a => `<tr style="${a.status === 'arsip' ? 'opacity:.6' : ''}"><td><b>${esc(a.nama)}</b>${a.status === 'arsip' ? ' <span class="lencana l-draf">Arsip</span>' : ''}</td>
      <td>${esc(a.nis || '—')}${a.terkunci ? ' <span class="lencana l-ditolak" title="Terlalu banyak salah password">Terkunci</span>' : ''}</td>
      <td>${esc(a.email || '—')}</td><td>${esc(a.kelas)}</td>
      <td>${a.peran.map(p => `<span class="lencana l-peran">${besar(p)}</span>`).join(' ')}</td>
      <td>${esc(a.periode || '—')}</td>
      <td><button class="btn kecil" onclick="formAnggota(${a.id})">Ubah</button></td></tr>`).join('')}
    </table></div>` : '<div class="kosong">Belum ada anggota.</div>'}
  </div>`;
}
function formAnggota(id) {
  const a = id ? anggotaCache.find(x => x.id === id) : { email: '', nis: '', nama: '', kelas: '', peran: ['reporter'], status: 'aktif' };
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog" id="f-anggota">
    <h2 style="margin-top:0">${id ? 'Ubah anggota' : 'Tambah anggota'}</h2>
    <label>NIS ${id ? '' : '(password awal = NIS)'}</label><input type="text" name="nis" value="${esc(a.nis || '')}" maxlength="20" placeholder="mis. 216326">
    <label>Email sekolah (opsional — untuk login Google & notifikasi)</label><input type="text" name="email" value="${esc(a.email || '')}" placeholder="nama@daarululuumlido.com">
    <label>Nama</label><input type="text" name="nama" value="${esc(a.nama)}" required maxlength="100">
    <label>Kelas</label><input type="text" name="kelas" value="${esc(a.kelas)}" maxlength="20">
    <label>Peran</label><div class="cek">${PERAN.map(p => `<label><input type="checkbox" name="peran" value="${p}" ${a.peran.includes(p) ? 'checked' : ''}> ${besar(p)}</label>`).join('')}</div>
    ${id ? `<label>Status</label><select name="status"><option value="aktif" ${a.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="arsip" ${a.status === 'arsip' ? 'selected' : ''}>Arsip</option></select>` : ''}
    ${id && a.nis ? `<p class="sub" style="margin:10px 0 0;font-size:13px">Password: ${a.sandi_awal ? 'masih password awal (NIS)' : 'sudah diganti anggota'}${a.terkunci ? ' · <b>terkunci</b>' : ''}</p>` : ''}
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Simpan</button>
      ${id && a.nis ? '<button class="btn" value="reset" formnovalidate>Reset password ke NIS</button>' : ''}
      <button class="btn" value="batal" formnovalidate>Batal</button></div>
  </form>`;
  d.showModal();
  $('#f-anggota').onsubmit = async e => {
    const v = e.submitter?.value;
    if (v === 'batal') return;
    e.preventDefault();
    if (v === 'reset') {
      if (!confirm(`Reset password ${a.nama} ke NIS-nya? Anggota wajib mengganti saat masuk berikutnya, dan semua sesinya diakhiri.`)) return;
      try { await api(`/api/anggota/${id}/reset-sandi`, 'POST'); d.close(); toast('Password direset ke NIS.'); tampil(); }
      catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
      return;
    }
    const f = new FormData(e.target);
    const data = { nama: f.get('nama'), kelas: f.get('kelas'), peran: f.getAll('peran'), nis: f.get('nis'), email: f.get('email') };
    if (id) data.status = f.get('status');
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

// ---------- pengaturan email (Admin) ----------
const PESAN_EMAIL = {
  ok: ['ok', 'Akun Gmail pengirim berhasil dihubungkan. Kirim email uji, lalu aktifkan notifikasi.'],
  dibatalkan: ['galat', 'Izin Gmail dibatalkan.'],
  izin_kurang: ['galat', 'Izin "kirim email" tidak dicentang. Ulangi dan centang izin Gmail.'],
  tanpa_token: ['galat', 'Google tidak memberi token jangka panjang. Cabut akses aplikasi di myaccount.google.com/permissions lalu ulangi.'],
  tanpa_kunci: ['galat', 'Secret ENKRIPSI_KUNCI belum dipasang di Worker.'],
  bukan_admin: ['galat', 'Hanya Admin yang bisa menghubungkan akun pengirim.'],
  domain: ['galat', 'Gunakan akun email sekolah sebagai pengirim.'],
  sesi_masuk: ['galat', 'Proses kedaluwarsa. Silakan ulangi.'],
  google: ['galat', 'Gagal memverifikasi akun Google. Silakan ulangi.'],
  belum_diatur: ['galat', 'Login Google belum diatur (client secret).'],
};
const STATUS_EMAIL = { menunggu: ['Menunggu', 'l-diajukan'], dikirim: ['Dikirim', 'l-diajukan'], terkirim: ['Terkirim', 'l-terbit'], gagal: ['Gagal', 'l-ditolak'] };
async function halEmail(args) {
  const e = await api('/api/email');
  const pesan = PESAN_EMAIL[args[0]];
  const tanggal = s => s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const st = { belum: 'Belum dihubungkan', terhubung: 'Terhubung', putus: 'Terputus — hubungkan ulang' }[e.status] || e.status;
  return `<h1>Notifikasi Email</h1><p class="sub">Email dikirim lewat Gmail dari akun pengirim yang dihubungkan Admin.</p>
  ${pesan ? `<div class="${pesan[0] === 'ok' ? 'kartu' : 'galat'}" style="${pesan[0] === 'ok' ? 'border-color:var(--utama)' : ''}">${esc(pesan[1])}</div>` : ''}
  ${!e.kunci_ada ? '<div class="galat">Secret ENKRIPSI_KUNCI belum dipasang di Worker — akun pengirim belum bisa dihubungkan.</div>' : ''}
  <div class="kartu">
    <div class="baris antara"><div><b>Akun pengirim</b><br>
      <span class="${e.status === 'terhubung' ? '' : 'sub'}">${e.pengirim ? esc(e.pengirim) + ' · ' : ''}${esc(st)}</span>
      ${e.galat ? `<div class="galat">${esc(e.galat)}</div>` : ''}</div>
      <div class="baris">
        <a class="btn ${e.status === 'terhubung' ? '' : 'utama'}" href="/api/email/hubungkan">${e.status === 'belum' ? 'Hubungkan Gmail' : 'Hubungkan ulang'}</a>
        ${e.status !== 'belum' ? '<button class="btn bahaya" onclick="putusEmail()">Putuskan</button>' : ''}
      </div></div>
  </div>
  <div class="kartu">
    <div class="baris antara"><div><b>Kirim notifikasi</b><br><span class="sub">${e.aktif ? 'Aktif — email dikirim untuk setiap kejadian.' : 'Nonaktif — tidak ada email yang dikirim atau diantrekan.'}</span></div>
      <div class="baris">
        <button class="btn" onclick="ujiEmail()" ${e.status === 'terhubung' ? '' : 'disabled'}>Kirim email uji ke saya</button>
        <button class="btn ${e.aktif ? 'bahaya' : 'utama'}" onclick="aturEmail(${!e.aktif})" ${e.status === 'terhubung' || e.aktif ? '' : 'disabled'}>${e.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
      </div></div>
    <p class="sub" style="margin:10px 0 0;font-size:13px">Dikirim saat: tugas baru (ke reporter) · naskah diajukan (ke Editor) · lolos editor (ke Pemred) ·
      revisi/ditolak/terbit (ke penulis) · tenggat besok & terlambat (ke reporter, mulai 06.00 WIB). Email yang gagal dicoba ulang tiap 15 menit, maksimal 5 kali.</p>
  </div>
  <div class="kartu"><div class="baris antara"><b>Antrean email terbaru</b>
    <span class="sub" style="font-size:13px">${Object.entries(e.jumlah).map(([k, n]) => `${(STATUS_EMAIL[k] || [k])[0]}: ${n}`).join(' · ') || 'kosong'}
    ${e.jumlah.gagal ? ' <button class="btn kecil" onclick="ulangEmail()">Kirim ulang yang gagal</button>' : ''}</span></div>
    ${e.terbaru.length ? `<div class="tabel-wadah"><table><tr><th>Waktu</th><th>Ke</th><th>Subjek</th><th>Status</th></tr>
    ${e.terbaru.map(x => `<tr><td style="white-space:nowrap">${tanggal(x.dibuat_at)}</td><td>${esc(x.ke)}</td><td>${esc(x.subjek)}${x.galat ? `<br><small style="color:var(--bahaya)">${esc(x.galat)}</small>` : ''}</td>
      <td><span class="lencana ${(STATUS_EMAIL[x.status] || ['', 'l-draf'])[1]}">${(STATUS_EMAIL[x.status] || [x.status])[0]}</span></td></tr>`).join('')}</table></div>`
      : '<div class="kosong">Belum ada email.</div>'}
  </div>`;
}
async function ujiEmail() {
  try { const r = await api('/api/email/uji', 'POST'); toast(`Email uji terkirim ke ${r.ke}. Cek kotak masuk.`); }
  catch (e) { toast(e.message); }
}
const aturEmail = aktif => coba(() => api('/api/email', 'PUT', { aktif }));
const ulangEmail = () => coba(() => api('/api/email/ulang', 'POST'));
function putusEmail() { if (confirm('Putuskan akun pengirim? Notifikasi email akan berhenti.')) coba(() => api('/api/email/putus', 'POST')); }

// ---------- kerangka & rute ----------
// [kunci, judul, boleh?, halaman, tampil di menu?]
const MENU = [
  ['dasbor', 'Dasbor', () => true, halDasbor],
  ['tugas', 'Tugas Liputan', () => punya('reporter', 'editor', 'pemred'), halTugas],
  ['naskah', 'Naskah', () => punya('reporter', 'editor', 'pemred'), a => a.length ? halNaskahDetail(a) : halNaskah()],
  ['antrean', 'Antrean Redaksi', () => punya('editor', 'pemred'), halAntrean],
  ['edisi', 'Edisi Majalah', () => punya('pemred'), halEdisi],
  ['cetak', 'Cetak edisi', () => punya('pemred'), halCetak, false],
  ['cetak-naskah', 'Cetak naskah', () => punya('reporter', 'editor', 'pemred'), halCetakNaskah, false],
  ['__', 'Pengaturan', () => punya('admin', 'pemred')],
  ['anggota', 'Anggota', () => punya('admin'), halAnggota],
  ['periode', 'Periode', () => punya('admin'), halPeriode],
  ['pilihan', 'Daftar Pilihan', () => punya('admin', 'pemred'), halPilihan],
  ['email', 'Email', () => punya('admin'), halEmail],
  ['akun', 'Akun saya', () => true, halAkun, false],
];
let setelahTampil = null; // dipanggil setelah halaman dimasukkan ke DOM

async function keluar() {
  try { await api('/api/keluar', 'POST'); } catch {}
  saya = null; location.hash = ''; tampil();
}

async function tampil() {
  if (!saya) {
    try { saya = await api('/api/saya'); } catch { saya = null; }
  }
  if (!saya) { $('#app').innerHTML = halMasuk(); return; }
  if (saya.wajib_ganti_sandi) { $('#app').innerHTML = halGantiWajib(); return; }
  if (location.search) history.replaceState(null, '', '/' + location.hash);

  const [rute, ...args] = (location.hash.slice(1) || 'dasbor').split('/');
  const item = MENU.find(m => m[0] === rute && m[3] && m[2]()) || MENU[0];
  const menuAktif = { cetak: 'edisi', 'cetak-naskah': 'naskah' }[item[0]] || item[0];
  $('#app').innerHTML = `
  <header class="atas">
    <button class="menu-btn" onclick="$('nav').classList.toggle('buka')" aria-label="Menu">☰</button>
    <div class="logo" aria-hidden="true">M</div><b>Al-Ma'had</b><span class="sela"></span>
    <a class="siapa" href="#akun" title="Akun saya">${esc(saya.nama)}<br>${saya.peran.map(besar).join(', ')}</a>
    <button class="btn kecil" onclick="keluar()">Keluar</button>
  </header>
  <div class="tata">
    <nav>${MENU.filter(m => m[2]() && m[4] !== false).map(([k, t]) => k === '__' ? `<div class="judul">${t}</div>` : `<a href="#${k}" class="${menuAktif === k ? 'aktif' : ''}">${t}</a>`).join('')}</nav>
    <main id="isi"><div class="muat">Memuat…</div></main>
  </div>`;
  setelahTampil = null;
  try {
    $('#isi').innerHTML = await item[3](item[0] === rute ? args : []);
    if (setelahTampil) setelahTampil();
  } catch (e) { $('#isi').innerHTML = `<div class="galat">${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}

addEventListener('hashchange', tampil);
tampil();
