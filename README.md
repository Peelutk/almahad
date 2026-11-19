# Al-Ma'had

Sistem redaksi internal organisasi jurnalistik santri — Cloudflare Workers + D1, login Google email sekolah.

- Desain sistem: [DESAIN.md](DESAIN.md)
- Prototipe tampilan (statis): [prototipe/index.html](prototipe/index.html)
- Alamat: https://almahad.jaohongk.workers.dev

## Status

Semua modul tersedia: login Google & NIS + password, Anggota & peran (termasuk Upload CSV), Periode, Daftar Pilihan, Tugas Liputan,
Naskah (upload foto ke Google Drive / tautan foto + riwayat), Antrean Redaksi, Edisi Majalah, Halaman Cetak (edisi & naskah), Notifikasi Email (Gmail API + Cron), Upload Foto (Google Drive), Transkrip Foto (Gemini → Google Docs).

## Struktur

| Berkas | Isi |
|--------|-----|
| `wrangler.jsonc` | Konfigurasi Worker `almahad`, binding D1 `DB`, variabel publik |
| `src/worker.js` | API `/api/*`: login Google, sesi, anggota, periode, daftar pilihan |
| `src/csv.js` | Upload CSV anggota (pratinjau & simpan) |
| `src/drive.js` | Upload foto ke Google Drive & tampil lewat `/api/foto/<id>` |
| `src/transkrip.js` | Transkrip foto (Gemini Files API) → pratinjau → Google Docs; dokumen tujuan; riwayat |
| `src/arsip.js` | Folder arsip edisi di Drive (Picker, folder edisi/rubrik/penulis), transkrip → folder edisi |
| `src/redaksi.js` | API tugas, naskah, antrean, edisi, ringkasan dasbor |
| `src/umum.js` | Pembantu bersama (galat, JSON, validasi, akses peran) |
| `src/email.js` | Notifikasi email: Gmail API, antrean, pengingat tenggat (Cron), pengaturan email |
| `src/skema.js` | Migrasi database — berjalan otomatis pada permintaan pertama |
| `uji/` | Uji otomatis (API, migrasi, klik browser) — lihat `uji/README.md`; tidak ikut ter-deploy |
| `public/` | Tampilan aplikasi (HTML/CSS/JS tanpa build); `redaksi.js` = halaman modul redaksi |

## Penyiapan (sekali)

1. **Database D1** dengan ID `0a95fda8-2dd8-4fd3-bff4-31bbea81ee5a` harus ada di akun Cloudflare yang sama dengan Worker. Tabel dibuat otomatis.
2. **Workers Builds**: dashboard Cloudflare → Workers & Pages → `almahad` → Settings → Builds → hubungkan repo `Peelutk/almahad`, branch `main`. Setiap push ke `main` akan deploy otomatis.
3. **Google OAuth** (Google Cloud Console → Credentials → OAuth client):
   - Authorized redirect URI: `https://almahad.jaohongk.workers.dev/api/google/kembali`
4. **Rahasia Worker** (dashboard → `almahad` → Settings → Variables and Secrets → *Secret*):
   - `GOOGLE_CLIENT_SECRET` = client secret dari Google. **Jangan** ditulis di repo atau dikirim lewat chat.
5. **Akun Google untuk Email & Drive** (sekali):
   - Secret `ENKRIPSI_KUNCI` = teks acak panjang (kunci enkripsi token Gmail). Jangan diganti setelah dipakai.
   - Google Cloud Console (proyek OAuth yang sama): aktifkan **Gmail API**, **Google Drive API**, dan **Google Docs API**; di *OAuth consent screen → Data access* tambahkan scope `.../auth/gmail.send` dan `.../auth/drive.file`; status aplikasi **In production**.
   - Masuk sebagai Admin → **Pengaturan → Google** → *Hubungkan akun Google* (centang izin Gmail **dan** Drive) → *Kirim email uji* → *Aktifkan*.
   - Foto upload disimpan di folder Drive *Al-Ma'had – Foto* milik akun itu (privat, ditampilkan lewat aplikasi).
   - **Transkrip foto**: buat API key di Google AI Studio → secret Worker `GEMINI_API_KEY` (jangan ditulis di repo/chat). Model diatur variabel `GEMINI_MODEL` di `wrangler.jsonc`. Lalu Admin membuat dokumen tujuan di **Pengaturan → Google**.
   - **Folder arsip edisi** (Google Cloud, proyek OAuth): aktifkan **Google Picker API**; buat API key yang dibatasi ke `https://almahad.jaohongk.workers.dev/*` dan Picker API → variabel Worker `GOOGLE_PICKER_KEY` (dashboard, jangan di repo); OAuth Client → *Authorized JavaScript origins* tambah `https://almahad.jaohongk.workers.dev`. Lalu Admin → **Pengaturan → Google** → *Pilih folder arsip edisi* (masuk sebagai akun yang terhubung) → pilih folder induk, mis. *EDISI AL MAHAD*.
6. **Login NIS** (tanpa pengaturan tambahan): Admin mengisi NIS anggota (satu per satu atau **Upload CSV** `NIS;Nama;Kelas`, email otomatis `NIS@daarululuumlido.com`) → password awal = NIS → anggota wajib ganti saat pertama masuk. Opsional: variabel `PBKDF2_ITERASI` (bawaan 10000).
7. **Admin pertama**: masuk dengan `216326@daarululuumlido.com` → otomatis menjadi Admin + Pemred (hanya selama belum ada Admin).

## Aturan keamanan

- Masuk dengan Google (hanya email `@daarululuumlido.com`) atau NIS + password; keduanya hanya untuk anggota aktif.
- Password: PBKDF2 + salt; 5× salah → akun dikunci 15 menit; 20× gagal per perangkat / 15 menit → ditahan.
- Sesi disimpan sebagai hash di D1, cookie `HttpOnly; Secure; SameSite=Lax`, berlaku 30 hari; anggota yang diarsipkan langsung keluar.
- Setiap perubahan data wajib membawa header `x-almahad: 1` (pengaman CSRF).
- Harus selalu ada minimal satu Admin aktif.
- `UJI_LOGIN` hanya untuk pengujian lokal (`.dev.vars`, tidak masuk repo) dan hanya berlaku di `localhost`.
