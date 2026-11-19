# Uji otomatis Al-Ma'had

Uji API terhadap `wrangler dev` dengan database lokal bersih. Tidak menyentuh database atau akun Google asli.

`.dev.vars` (tidak masuk git) untuk pengujian:

```
UJI_LOGIN=1
GOOGLE_CLIENT_SECRET=rahasia-uji
GOOGLE_TOKEN_URL=http://127.0.0.1:8791/token
GMAIL_API_URL=http://127.0.0.1:8791
DRIVE_API_URL=http://127.0.0.1:8791
GEMINI_API_URL=http://127.0.0.1:8791
DOCS_API_URL=http://127.0.0.1:8791
GEMINI_API_KEY=kunci-gemini-uji
ENKRIPSI_KUNCI=kunci-uji-lokal
```

Jalankan: `bash uji/jalankan.sh`

| Berkas | Isi |
|--------|-----|
| `dasar.mjs` | Masuk, anggota & peran, periode, daftar pilihan |
| `google.mjs` | Verifikasi login Google (id_token) |
| `redaksi.mjs` | Tugas, naskah, antrean, edisi |
| `nis.mjs` | Login NIS + password, wajib ganti, penguncian, reset Admin |
| `csv.mjs` | Upload CSV anggota (pratinjau, duplikat, 500 baris) + password awal tanpa hash |
| `email.mjs` | Notifikasi email, Cron, coba ulang, izin dicabut |
| `migrasi.sh <commit>` | Buat DB berisi data dengan kode commit lama, lalu migrasikan dengan kode sekarang dan bandingkan |
| `klik-nis.mjs` | Uji klik di Chrome: masuk NIS, wajib ganti password, Akun saya |
| `klik-csv.mjs` | Uji klik di Chrome: Upload CSV (file ANSI), pratinjau, simpan, email otomatis di form |
| `foto.mjs` | Upload foto ke Drive (tiruan): izin, folder, file 20 MB, tampil pratinjau/asli, akses |
| `klik-foto.mjs` | Uji klik di Chrome: upload foto (progres, tolak bukan foto / > 20 MB), keterangan, simpan, cetak, halaman Google |
| `transkrip.mjs` | Transkrip foto: Gemini (tiruan) — kirim foto, baca, batas, kuota; dokumen tujuan & kirim ke Google Docs (tiruan); riwayat |
| `tiruan-google.mjs` | Server tiruan Google OAuth + Gmail + Drive + Docs + Gemini (port 8791) |

`/api/uji/masuk` hanya aktif bila `UJI_LOGIN=1` **dan** host `localhost` — tidak berlaku di Worker asli.
