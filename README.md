# Al-Ma'had

Sistem redaksi internal organisasi jurnalistik santri — Cloudflare Workers + D1, login Google email sekolah.

- Desain sistem: [DESAIN.md](DESAIN.md)
- Prototipe tampilan (statis): [prototipe/index.html](prototipe/index.html)
- Alamat: https://almahad.jaohongk.workers.dev

## Status

Semua modul tersedia: login Google & NIS + password, Anggota & peran, Periode, Daftar Pilihan, Tugas Liputan,
Naskah (tautan foto + riwayat), Antrean Redaksi, Edisi Majalah, Halaman Cetak (edisi & naskah), Notifikasi Email (Gmail API + Cron).

## Struktur

| Berkas | Isi |
|--------|-----|
| `wrangler.jsonc` | Konfigurasi Worker `almahad`, binding D1 `DB`, variabel publik |
| `src/worker.js` | API `/api/*`: login Google, sesi, anggota, periode, daftar pilihan |
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
5. **Notifikasi email** (sekali):
   - Secret `ENKRIPSI_KUNCI` = teks acak panjang (kunci enkripsi token Gmail). Jangan diganti setelah dipakai.
   - Google Cloud Console (proyek OAuth yang sama): aktifkan **Gmail API**; di *OAuth consent screen → Data access* tambahkan scope `.../auth/gmail.send`; status aplikasi **In production**.
   - Masuk sebagai Admin → **Pengaturan → Email** → *Hubungkan Gmail* dengan akun pengirim → *Kirim email uji* → *Aktifkan*.
6. **Login NIS** (tanpa pengaturan tambahan): Admin mengisi NIS anggota → password awal = NIS → anggota wajib ganti saat pertama masuk. Opsional: variabel `PBKDF2_ITERASI` (bawaan 10000).
7. **Admin pertama**: masuk dengan `216326@daarululuumlido.com` → otomatis menjadi Admin + Pemred (hanya selama belum ada Admin).

## Aturan keamanan

- Masuk dengan Google (hanya email `@daarululuumlido.com`) atau NIS + password; keduanya hanya untuk anggota aktif.
- Password: PBKDF2 + salt; 5× salah → akun dikunci 15 menit; 20× gagal per perangkat / 15 menit → ditahan.
- Sesi disimpan sebagai hash di D1, cookie `HttpOnly; Secure; SameSite=Lax`, berlaku 30 hari; anggota yang diarsipkan langsung keluar.
- Setiap perubahan data wajib membawa header `x-almahad: 1` (pengaman CSRF).
- Harus selalu ada minimal satu Admin aktif.
- `UJI_LOGIN` hanya untuk pengujian lokal (`.dev.vars`, tidak masuk repo) dan hanya berlaku di `localhost`.
