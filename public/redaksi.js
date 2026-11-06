// Al-Ma'had — tampilan modul redaksi: tugas, naskah, antrean, edisi, cetak.
// Memakai pembantu global dari app.js ($, esc, besar, api, toast, punya, saya, coba).
'use strict';

const STATUS_NASKAH = {
  draf: ['Draf', 'l-draf'], diajukan: ['Diajukan', 'l-diajukan'], revisi: ['Revisi', 'l-revisi'],
  lolos: ['Lolos Editor', 'l-lolos'], terbit: ['Terbit', 'l-terbit'], ditolak: ['Ditolak', 'l-ditolak'],
};
const NAMA_AKSI = {
  ajukan: ['Ajukan ke Editor', 'utama'], setujui: ['Setujui (Lolos Editor)', 'utama'], terbitkan: ['Terbitkan', 'utama'],
  revisi: ['Minta revisi', ''], tolak: ['Tolak', 'bahaya'],
};
const lencanaNaskah = s => `<span class="lencana ${STATUS_NASKAH[s][1]}">${STATUS_NASKAH[s][0]}</span>`;
const tgl = s => s ? s.slice(0, 10).split('-').reverse().join('-') : '—';
// Waktu dari D1 (UTC) → WIB
const waktu = s => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const jenisNama = j => j === 'berita' ? 'Berita' : 'Majalah';
const tautanAman = u => /^https?:\/\//i.test(u) ? u : '#';
// Teks naskah → paragraf HTML (aman)
const paragraf = t => (t || '').split(/\n\s*\n/).filter(x => x.trim()).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');

let pilihanRedaksi = null;
async function ambilPilihan() { return (pilihanRedaksi = await api('/api/pilihan')); }
const rubrikAktif = (jenis, kecuali) => (pilihanRedaksi[jenis === 'berita' ? 'rubrik_berita' : 'rubrik_majalah']?.isi || [])
  .filter(r => r.aktif || r.id === kecuali);

// ======================= DASBOR =======================
async function halDasbor() {
  const redaksi = punya('reporter', 'editor', 'pemred');
  const h = redaksi ? await api('/api/ringkasan') : {};
  const kotak = (href, n, label, peringatan) => `<a class="kartu" href="#${href}" style="text-decoration:none;color:inherit">
    <div class="angka" ${peringatan ? 'style="color:var(--bahaya)"' : ''}>${n}</div>${label}</a>`;
  return `<h1>Assalamu'alaikum, ${esc(saya.nama)}</h1>
  <p class="sub">Periode aktif: <b>${esc(saya.periode_aktif?.nama || '—')}</b> · Peran: ${saya.peran.map(p => `<span class="lencana l-peran">${besar(p)}</span>`).join(' ')}</p>
  ${redaksi ? `<div class="grid">
    ${kotak('tugas', h.tugas_saya, 'Tugas saya berjalan')}
    ${h.tugas_terlambat ? kotak('tugas', h.tugas_terlambat, 'Tugas saya terlambat', true) : ''}
    ${kotak('naskah', h.naskah_revisi, 'Naskah saya perlu revisi', h.naskah_revisi > 0)}
    ${h.perlu_sunting !== undefined ? kotak('antrean', h.perlu_sunting, 'Naskah perlu disunting') : ''}
    ${h.perlu_setuju !== undefined ? kotak('antrean', h.perlu_setuju, 'Menunggu persetujuan Pemred') : ''}
    ${h.edisi_disusun !== undefined ? kotak('edisi', h.edisi_disusun, 'Edisi majalah belum terbit') : ''}
  </div>` : '<div class="kartu">Akun Anda hanya berperan Admin. Gunakan menu Pengaturan.</div>'}`;
}

// ======================= TUGAS =======================
let tugasCache = [], tugasTab = 'aktif';
async function halTugas() {
  [tugasCache] = await Promise.all([api('/api/tugas'), ambilPilihan()]);
  const daftar = tugasCache.filter(t => tugasTab === 'semua' || ['baru', 'dikerjakan'].includes(t.status));
  const pemberi = punya('editor', 'pemred');
  return `<div class="baris antara"><div><h1>Tugas Liputan</h1><p class="sub">Tugas tidak bisa ditolak; tenggat wajib diisi. Lewat tenggat ditandai Terlambat.</p></div>
    ${pemberi ? '<button class="btn utama" onclick="formTugas()">+ Beri tugas</button>' : ''}</div>
  <div class="tab">${[['aktif', 'Berjalan'], ['semua', 'Semua']].map(([k, t]) => `<button class="${tugasTab === k ? 'aktif' : ''}" onclick="tugasTab='${k}';tampil()">${t}</button>`).join('')}</div>
  <div class="kartu">${daftar.length ? `<div class="tabel-wadah"><table><tr><th>Tugas</th><th>Reporter</th><th>Tenggat</th><th>Status</th><th></th></tr>
  ${daftar.map(t => `<tr><td><b>${esc(t.judul)}</b><br><small style="color:var(--teks-2)">${jenisNama(t.jenis)} · ${esc(t.rubrik)} · dari ${esc(t.pemberi)}</small>
      ${t.keterangan ? `<br><small>${esc(t.keterangan)}</small>` : ''}</td>
    <td>${esc(t.reporter)}</td><td style="white-space:nowrap">${tgl(t.tenggat)}</td>
    <td>${t.terlambat ? '<span class="lencana l-telat">Terlambat</span> ' : ''}<span class="lencana ${t.status === 'selesai' ? 'l-terbit' : 'l-draf'}">${besar(t.status)}</span></td>
    <td style="text-align:right;white-space:nowrap">
      ${t.naskah_id ? `<a class="btn kecil" href="#naskah/${t.naskah_id}">Naskah</a>` : ''}
      ${!t.naskah_id && t.reporter_id === saya.id && ['baru', 'dikerjakan'].includes(t.status) ? `<a class="btn kecil utama" href="#naskah/baru/${t.id}">Tulis naskah</a>` : ''}
      ${pemberi && ['baru', 'dikerjakan'].includes(t.status) ? `<button class="btn kecil" onclick="formTugas(${t.id})">Ubah</button>` : ''}
    </td></tr>`).join('')}</table></div>` : '<div class="kosong">Tidak ada tugas.</div>'}</div>`;
}

async function formTugas(id) {
  const t = id ? tugasCache.find(x => x.id === id) : { judul: '', keterangan: '', jenis: 'berita', rubrik_id: null, reporter_id: null, tenggat: '' };
  const reporter = await api('/api/reporter');
  const d = $('#dialog');
  const opsiRubrik = jenis => rubrikAktif(jenis, t.rubrik_id).map(r => `<option value="${r.id}" ${r.id === t.rubrik_id ? 'selected' : ''}>${esc(r.nilai)}</option>`).join('');
  d.innerHTML = `<form method="dialog" id="f-tugas"><h2 style="margin-top:0">${id ? 'Ubah tugas' : 'Beri tugas liputan'}</h2>
    <label>Judul tugas</label><input type="text" name="judul" value="${esc(t.judul)}" required maxlength="150">
    <label>Keterangan</label><textarea name="keterangan" style="min-height:80px" maxlength="2000" placeholder="Narasumber, sudut pandang, dll.">${esc(t.keterangan)}</textarea>
    <div class="grid" style="margin:0;grid-template-columns:1fr 1fr">
      <div><label>Jenis</label><select name="jenis" ${t.naskah_id ? 'disabled' : ''}><option value="berita" ${t.jenis === 'berita' ? 'selected' : ''}>Berita</option><option value="majalah" ${t.jenis === 'majalah' ? 'selected' : ''}>Majalah</option></select></div>
      <div><label>Rubrik</label><select name="rubrik_id" required>${opsiRubrik(t.jenis)}</select></div>
      <div><label>Reporter</label><select name="reporter_id" required ${t.naskah_id ? 'disabled' : ''}>${reporter.map(r => `<option value="${r.id}" ${r.id === t.reporter_id ? 'selected' : ''}>${esc(r.nama)}${r.kelas ? ' (' + esc(r.kelas) + ')' : ''}</option>`).join('')}</select></div>
      <div><label>Tenggat *</label><input type="date" name="tenggat" value="${esc(t.tenggat)}" required></div>
    </div>
    ${!rubrikAktif('berita').length && !rubrikAktif('majalah').length ? '<div class="galat">Daftar rubrik masih kosong. Isi dulu di menu Daftar Pilihan.</div>' : ''}
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Simpan</button>
      ${id && !t.naskah_id ? '<button class="btn bahaya" value="batal-tugas" formnovalidate>Batalkan tugas</button>' : ''}
      <button class="btn" value="tutup" formnovalidate>Tutup</button></div></form>`;
  d.showModal();
  const f = $('#f-tugas');
  f.jenis.onchange = () => { f.rubrik_id.innerHTML = opsiRubrik(f.jenis.value); };
  f.onsubmit = async e => {
    const v = e.submitter?.value;
    if (v === 'tutup') return;
    e.preventDefault();
    try {
      if (v === 'batal-tugas') {
        if (!confirm('Batalkan tugas ini?')) return;
        await api(`/api/tugas/${id}`, 'PUT', { status: 'batal' });
      } else {
        const data = { judul: f.judul.value, keterangan: f.keterangan.value, rubrik_id: Number(f.rubrik_id.value), tenggat: f.tenggat.value };
        if (!t.naskah_id) { data.jenis = f.jenis.value; data.reporter_id = Number(f.reporter_id.value); }
        await api(id ? `/api/tugas/${id}` : '/api/tugas', id ? 'PUT' : 'POST', data);
      }
      d.close(); toast('Tersimpan.'); tampil();
    } catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
  };
}

// ======================= NASKAH =======================
let naskahJenis = 'semua', naskahStatus = '';
function tabelNaskah(list, kosong = 'Tidak ada naskah.') {
  if (!list.length) return `<div class="kosong">${kosong}</div>`;
  return `<div class="tabel-wadah"><table><tr><th>Judul</th><th>Jenis</th><th>Penulis</th><th>Status</th></tr>
  ${list.map(n => `<tr><td><a href="#naskah/${n.id}"><b>${esc(n.judul)}</b></a><br><small style="color:var(--teks-2)">${esc(n.rubrik)} · diubah ${waktu(n.diubah_at)}${n.edisi ? ' · Edisi ' + esc(n.edisi) : ''}</small></td>
    <td>${jenisNama(n.jenis)}</td><td>${esc(n.penulis)}</td><td>${lencanaNaskah(n.status)}</td></tr>`).join('')}</table></div>`;
}
async function halNaskah() {
  const semua = await api('/api/naskah');
  const list = semua.filter(n => (naskahJenis === 'semua' || n.jenis === naskahJenis) && (!naskahStatus || n.status === naskahStatus));
  return `<div class="baris antara"><div><h1>Naskah</h1><p class="sub">Berita dan majalah dipisah; jenis dipilih saat naskah dibuat.</p></div>
    <a class="btn utama" href="#naskah/baru">+ Tulis naskah</a></div>
  <div class="tab">${['semua', 'berita', 'majalah'].map(j => `<button class="${naskahJenis === j ? 'aktif' : ''}" onclick="naskahJenis='${j}';tampil()">${besar(j)}</button>`).join('')}</div>
  <div class="kartu"><div class="baris" style="margin-bottom:6px"><label style="margin:0">Status</label>
    <select style="width:auto" onchange="naskahStatus=this.value;tampil()"><option value="">Semua status</option>
    ${Object.entries(STATUS_NASKAH).map(([k, v]) => `<option value="${k}" ${naskahStatus === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
  ${tabelNaskah(list)}</div>`;
}

// Halaman tulis/ubah/lihat naskah
let naskahKini = null, fotoKini = [];
async function halNaskahDetail(args) {
  await ambilPilihan();
  const baru = args[0] === 'baru';
  if (baru) {
    let tugas = null;
    if (args[1]) tugas = (await api('/api/tugas')).find(t => t.id === Number(args[1]) && t.reporter_id === saya.id);
    naskahKini = { baru: true, jenis: tugas?.jenis || 'berita', judul: tugas?.judul || '', rubrik_id: tugas?.rubrik_id || null,
      isi: '', foto: [], tugas, tugas_id: tugas?.id || null, status: 'draf', boleh_ubah: true, aksi: [], riwayat: [] };
  } else {
    naskahKini = await api(`/api/naskah/${Number(args[0])}`);
  }
  const n = naskahKini;
  fotoKini = n.foto.map(f => ({ ...f }));
  const ubah = n.boleh_ubah;
  const opsiRubrik = jenis => rubrikAktif(jenis, n.rubrik_id).map(r => `<option value="${r.id}" ${r.id === n.rubrik_id ? 'selected' : ''}>${esc(r.nilai)}</option>`).join('');
  const bisaHapus = !n.baru && n.status === 'draf' && n.penulis_id === saya.id;
  setelahTampil = pasangFormNaskah;
  return `<p class="sub" style="margin:0"><a href="#naskah">← Naskah</a></p>
  <div class="baris antara"><h1>${n.baru ? 'Tulis Naskah' : esc(n.judul)}</h1>${n.baru ? '' : lencanaNaskah(n.status)}</div>
  ${n.baru ? '' : `<p class="sub">${jenisNama(n.jenis)} · ${esc(n.rubrik)} · oleh ${esc(n.penulis)}${n.edisi ? ' · Edisi ' + esc(n.edisi) : ''}</p>`}
  <div class="dua">
    <div class="kartu">
      ${ubah ? `<form id="f-naskah" onsubmit="return false">
        <label>Judul</label><input type="text" name="judul" value="${esc(n.judul)}" required maxlength="200">
        <div class="grid" style="margin:0">
          <div><label>Jenis</label><select name="jenis" ${n.baru && !n.tugas ? '' : 'disabled'}><option value="berita" ${n.jenis === 'berita' ? 'selected' : ''}>Berita</option><option value="majalah" ${n.jenis === 'majalah' ? 'selected' : ''}>Majalah</option></select></div>
          <div><label>Rubrik</label><select name="rubrik_id">${opsiRubrik(n.jenis)}</select></div>
        </div>
        ${n.tugas ? `<p class="sub" style="margin:8px 0 0">Dari tugas: <b>${esc(n.tugas.judul)}</b> (tenggat ${tgl(n.tugas.tenggat)})</p>` : ''}
        <label>Isi naskah</label><textarea name="isi" maxlength="60000" placeholder="Pisahkan paragraf dengan baris kosong.">${esc(n.isi)}</textarea>
        <label>Tautan foto (Google Drive, dll.)</label>
        <div id="daftar-foto"></div>
        <div class="baris"><input type="url" id="foto-tautan" placeholder="https://drive.google.com/..." style="flex:2;min-width:180px"><input type="text" id="foto-ket" placeholder="Keterangan foto" maxlength="200" style="flex:1;min-width:120px"><button class="btn kecil" type="button" onclick="tambahFoto()">+ Tambah</button></div>
      </form>` : `<div class="isi-baca">${paragraf(n.isi) || '<p class="sub">(isi kosong)</p>'}</div>
        ${n.foto.length ? `<b>Foto</b><ul>${n.foto.map(f => `<li><a href="${esc(tautanAman(f.tautan))}" target="_blank" rel="noopener noreferrer">${esc(f.tautan)}</a>${f.keterangan ? ' — ' + esc(f.keterangan) : ''}</li>`).join('')}</ul>` : ''}`}
      ${n.aksi.some(a => ['revisi', 'tolak'].includes(a)) ? '<label>Catatan untuk penulis (wajib saat minta revisi / menolak)</label><input type="text" id="catatan" maxlength="1000">' : ''}
      <div class="galat" id="f-galat" hidden></div>
      <div class="baris" style="margin-top:16px">
        ${ubah ? `<button class="btn" onclick="simpanNaskah()">${n.baru ? 'Simpan draf' : 'Simpan'}</button>` : ''}
        ${(n.baru ? ['ajukan'] : n.aksi).map(a => `<button class="btn ${NAMA_AKSI[a][1]}" onclick="aksiNaskah('${a}')">${NAMA_AKSI[a][0]}</button>`).join('')}
        ${!n.baru ? `<a class="btn" href="#cetak-naskah/${n.id}">🖨 Cetak</a>` : ''}
        ${bisaHapus ? '<button class="btn bahaya" onclick="hapusNaskah()">Hapus draf</button>' : ''}
      </div>
    </div>
    <div class="kartu"><b>Riwayat</b>
      ${n.riwayat.length ? `<ul class="riwayat" style="margin-top:10px">${n.riwayat.map(h => `<li>${h.dari_status === h.ke_status ? esc(h.catatan) : STATUS_NASKAH[h.ke_status][0] + (h.catatan ? ` — “${esc(h.catatan)}”` : '')}<br><small>${esc(h.oleh)} · ${waktu(h.waktu)}</small></li>`).join('')}</ul>` : '<div class="kosong">Belum ada.</div>'}
    </div>
  </div>`;
}
function gambarFoto() {
  const el = $('#daftar-foto'); if (!el) return;
  el.innerHTML = fotoKini.map((f, i) => `<div class="baris" style="margin-bottom:6px;font-size:14px">📷 <a href="${esc(tautanAman(f.tautan))}" target="_blank" rel="noopener noreferrer" style="word-break:break-all">${esc(f.tautan)}</a>
    ${f.keterangan ? '— ' + esc(f.keterangan) : ''} <button class="btn kecil" type="button" onclick="fotoKini.splice(${i},1);gambarFoto()">Hapus</button></div>`).join('');
}
function pasangFormNaskah() {
  gambarFoto();
  const f = $('#f-naskah'); if (!f) return;
  f.jenis.onchange = () => { naskahKini.jenis = f.jenis.value; f.rubrik_id.innerHTML = rubrikAktif(f.jenis.value).map(r => `<option value="${r.id}">${esc(r.nilai)}</option>`).join(''); };
}
function tambahFoto() {
  const t = $('#foto-tautan').value.trim(), k = $('#foto-ket').value.trim();
  if (!/^https?:\/\/\S+$/i.test(t)) return toast('Tautan foto harus diawali https://');
  fotoKini.push({ tautan: t, keterangan: k });
  $('#foto-tautan').value = ''; $('#foto-ket').value = ''; gambarFoto();
}
function galatNaskah(m) { const g = $('#f-galat'); g.hidden = false; g.textContent = m; }
async function simpanNaskahData() {
  const f = $('#f-naskah');
  const data = { judul: f.judul.value, rubrik_id: Number(f.rubrik_id.value), isi: f.isi.value, foto: fotoKini };
  if (!data.rubrik_id) throw new Error('Pilih rubrik. Jika kosong, isi dulu di Daftar Pilihan.');
  if (naskahKini.baru) {
    data.jenis = f.jenis.value;
    if (naskahKini.tugas_id) data.tugas_id = naskahKini.tugas_id;
    const r = await api('/api/naskah', 'POST', data);
    return r.id;
  }
  await api(`/api/naskah/${naskahKini.id}`, 'PUT', data);
  return naskahKini.id;
}
async function simpanNaskah() {
  try {
    const id = await simpanNaskahData();
    toast('Tersimpan.');
    if (naskahKini.baru) location.hash = `naskah/${id}`; else tampil();
  } catch (e) { galatNaskah(e.message); }
}
async function aksiNaskah(aksi) {
  const catatan = $('#catatan')?.value || '';
  if (['revisi', 'tolak'].includes(aksi) && !catatan.trim()) return galatNaskah('Isi catatan untuk penulis terlebih dahulu.');
  if (aksi === 'tolak' && !confirm('Tolak naskah ini? Naskah yang ditolak tidak bisa diproses lagi.')) return;
  try {
    const id = naskahKini.boleh_ubah ? await simpanNaskahData() : naskahKini.id; // simpan perubahan dulu
    await api(`/api/naskah/${id}/aksi`, 'POST', { aksi, catatan });
    toast('Berhasil.');
    if (location.hash === `#naskah/${id}`) tampil(); else location.hash = `naskah/${id}`;
  } catch (e) { galatNaskah(e.message); }
}
async function hapusNaskah() {
  if (!confirm('Hapus draf ini?')) return;
  try { await api(`/api/naskah/${naskahKini.id}`, 'DELETE'); toast('Draf dihapus.'); location.hash = 'naskah'; }
  catch (e) { galatNaskah(e.message); }
}

// ======================= ANTREAN =======================
async function halAntrean() {
  const semua = await api('/api/naskah');
  return `<h1>Antrean Redaksi</h1><p class="sub">Naskah yang menunggu tindakan Anda.</p>
  <div class="kartu"><b>Perlu disunting (Editor)</b>${tabelNaskah(semua.filter(n => n.status === 'diajukan'), 'Tidak ada naskah yang menunggu.')}</div>
  ${punya('pemred') ? `<div class="kartu"><b>Menunggu persetujuan akhir (Pemred)</b>${tabelNaskah(semua.filter(n => n.status === 'lolos'), 'Tidak ada naskah yang menunggu.')}</div>` : ''}`;
}

// ======================= EDISI (Pemred) =======================
const STATUS_EDISI = { disusun: ['Disusun', 'l-diajukan'], dikunci: ['Dikunci', 'l-revisi'], terbit: ['Terbit', 'l-terbit'] };
const lencanaEdisi = s => `<span class="lencana ${STATUS_EDISI[s][1]}">${STATUS_EDISI[s][0]}</span>`;
let edisiCache = [];
async function halEdisi(args) {
  if (args[0]) return halEdisiDetail(Number(args[0]));
  edisiCache = await api('/api/edisi');
  return `<div class="baris antara"><div><h1>Edisi Majalah</h1><p class="sub">Hanya Pemred yang menyusun edisi. Isi edisi diambil dari naskah majalah berstatus Terbit.</p></div>
    <button class="btn utama" onclick="formEdisi()">+ Edisi baru</button></div>
  <div class="kartu">${edisiCache.length ? `<div class="tabel-wadah"><table><tr><th>Edisi</th><th>Tema</th><th>Terbit</th><th>Naskah</th><th>Status</th><th></th></tr>
  ${edisiCache.map(e => `<tr><td><b>${esc(e.nomor)}</b></td><td>${esc(e.tema)}</td><td>${esc(e.bulan_terbit)}</td><td>${e.jumlah}</td>
    <td>${lencanaEdisi(e.status)}</td><td style="text-align:right"><a class="btn kecil" href="#edisi/${e.id}">Buka</a></td></tr>`).join('')}
  </table></div>` : '<div class="kosong">Belum ada edisi.</div>'}</div>`;
}
function formEdisi(e) {
  e = e || { nomor: '', tema: '', bulan_terbit: '' };
  const d = $('#dialog');
  d.innerHTML = `<form method="dialog" id="f-edisi"><h2 style="margin-top:0">${e.id ? 'Ubah edisi' : 'Edisi baru'}</h2>
    <label>Nomor edisi</label><input type="text" name="nomor" value="${esc(e.nomor)}" required maxlength="40" placeholder="mis. No. 12">
    <label>Tema</label><input type="text" name="tema" value="${esc(e.tema)}" maxlength="150">
    <label>Bulan terbit</label><input type="text" name="bulan_terbit" value="${esc(e.bulan_terbit)}" maxlength="40" placeholder="mis. Desember 2026">
    <div class="galat" id="f-galat" hidden></div>
    <div class="baris" style="margin-top:16px"><button class="btn utama" value="simpan">Simpan</button><button class="btn" value="tutup" formnovalidate>Tutup</button></div></form>`;
  d.showModal();
  $('#f-edisi').onsubmit = async ev => {
    if (ev.submitter?.value !== 'simpan') return;
    ev.preventDefault();
    const f = ev.target;
    try {
      const data = { nomor: f.nomor.value, tema: f.tema.value, bulan_terbit: f.bulan_terbit.value };
      const r = await api(e.id ? `/api/edisi/${e.id}` : '/api/edisi', e.id ? 'PUT' : 'POST', data);
      d.close(); toast('Tersimpan.');
      if (e.id) tampil(); else location.hash = `edisi/${r.id}`;
    } catch (err) { const g = $('#f-galat'); g.hidden = false; g.textContent = err.message; }
  };
}
let edisiKini = null;
async function halEdisiDetail(id) {
  const e = edisiKini = await api(`/api/edisi/${id}`);
  const susun = e.status === 'disusun';
  return `<p class="sub" style="margin:0"><a href="#edisi">← Edisi</a></p>
  <div class="baris antara"><h1>${esc(e.nomor)}${e.tema ? ' — ' + esc(e.tema) : ''}</h1>
    <div class="baris">
      ${e.status !== 'terbit' ? '<button class="btn" onclick="formEdisi(edisiKini)">Ubah</button>' : ''}
      ${susun ? `<button class="btn" onclick="statusEdisi('dikunci')">Kunci edisi</button>` : ''}
      ${e.status === 'dikunci' ? `<button class="btn" onclick="statusEdisi('disusun')">Buka kunci</button><button class="btn utama" onclick="statusEdisi('terbit')">Tandai Terbit</button>` : ''}
      <a class="btn ${e.status === 'disusun' ? '' : 'utama'}" href="#cetak/${e.id}">🖨 Halaman cetak</a></div></div>
  <p class="sub">${esc(e.bulan_terbit || '—')} · ${lencanaEdisi(e.status)}</p>
  <div class="kartu"><b>Isi edisi (urutan)</b>
    ${e.naskah.length ? `<div class="tabel-wadah"><table>${e.naskah.map((n, i) => `<tr><td style="width:30px">${i + 1}</td>
      <td><a href="#naskah/${n.id}"><b>${esc(n.judul)}</b></a><br><small style="color:var(--teks-2)">${esc(n.rubrik)} · ${esc(n.penulis)}</small></td>
      <td style="text-align:right;white-space:nowrap">${susun ? `<button class="btn kecil" onclick="geserEdisi(${i},-1)" ${i ? '' : 'disabled'} aria-label="Naikkan">↑</button>
        <button class="btn kecil" onclick="geserEdisi(${i},1)" ${i < e.naskah.length - 1 ? '' : 'disabled'} aria-label="Turunkan">↓</button>
        <button class="btn kecil bahaya" onclick="keluarkanNaskah(${n.id})">Keluarkan</button>` : ''}</td></tr>`).join('')}</table></div>`
      : '<div class="kosong">Belum ada naskah.</div>'}
  </div>
  ${susun ? `<div class="kartu"><b>Naskah majalah berstatus Terbit yang bisa dimasukkan</b>
    ${e.calon.length ? `<div class="tabel-wadah"><table>${e.calon.map(n => `<tr><td><a href="#naskah/${n.id}">${esc(n.judul)}</a><br><small style="color:var(--teks-2)">${esc(n.rubrik)} · ${esc(n.penulis)}</small></td>
      <td style="text-align:right"><button class="btn kecil" onclick="masukkanNaskah(${n.id})">+ Masukkan</button></td></tr>`).join('')}</table></div>`
      : '<div class="kosong">Tidak ada naskah majalah terbit yang belum masuk edisi.</div>'}</div>` : ''}`;
}
const statusEdisi = s => {
  if (s === 'terbit' && !confirm('Tandai edisi ini Terbit? Setelah terbit, edisi tidak bisa diubah lagi.')) return;
  coba(() => api(`/api/edisi/${edisiKini.id}/status`, 'POST', { status: s }));
};
const masukkanNaskah = nid => coba(() => api(`/api/edisi/${edisiKini.id}/naskah`, 'POST', { naskah_id: nid }));
const keluarkanNaskah = nid => coba(() => api(`/api/edisi/${edisiKini.id}/naskah/${nid}`, 'DELETE'));
function geserEdisi(i, arah) {
  const ids = edisiKini.naskah.map(n => n.id);
  [ids[i], ids[i + arah]] = [ids[i + arah], ids[i]];
  coba(() => api(`/api/edisi/${edisiKini.id}/urutan`, 'POST', { ids }));
}

// ======================= CETAK =======================
const artikelCetak = n => `<article><h3>${esc(n.judul)}</h3><div class="meta">Oleh ${esc(n.penulis)}</div>
  ${paragraf(n.isi)}${n.foto?.length ? `<p class="meta">Foto: ${n.foto.map(f => esc(f.tautan) + (f.keterangan ? ' (' + esc(f.keterangan) + ')' : '')).join('; ')}</p>` : ''}</article>`;
async function halCetak(args) {
  const e = await api(`/api/edisi/${Number(args[0])}`);
  const perRubrik = [];
  for (const n of e.naskah) {
    let g = perRubrik.find(x => x.rubrik === n.rubrik);
    if (!g) perRubrik.push(g = { rubrik: n.rubrik, isi: [] });
    g.isi.push(n);
  }
  return `<div class="baris antara cetak-alat" style="margin-bottom:14px"><a href="#edisi/${e.id}">← Kembali</a>
    <button class="btn utama" onclick="window.print()">🖨 Cetak / Simpan PDF</button></div>
  <div class="kertas">
    <div class="sampul"><h1 style="font-family:system-ui,sans-serif;margin:8px 0 0">Majalah Al-Ma'had</h1>
      <div class="meta">${esc(e.nomor)}${e.bulan_terbit ? ' · ' + esc(e.bulan_terbit) : ''}${e.tema ? ' · Tema: ' + esc(e.tema) : ''}</div></div>
    ${perRubrik.length ? perRubrik.map(g => `<h2>${esc(g.rubrik)}</h2>${g.isi.map(artikelCetak).join('')}`).join('') : '<p>Edisi masih kosong.</p>'}
  </div>`;
}
async function halCetakNaskah(args) {
  const n = await api(`/api/naskah/${Number(args[0])}`);
  return `<div class="baris antara cetak-alat" style="margin-bottom:14px"><a href="#naskah/${n.id}">← Kembali</a>
    <button class="btn utama" onclick="window.print()">🖨 Cetak / Simpan PDF</button></div>
  <div class="kertas"><div class="meta">${jenisNama(n.jenis)} · ${esc(n.rubrik)} · ${STATUS_NASKAH[n.status][0]}</div>${artikelCetak(n)}</div>`;
}
