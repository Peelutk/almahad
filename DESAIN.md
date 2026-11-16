# Al-Ma'had — Desain Sistem (Draf 13)

> Status: **TAHAP KODE — semua modul** (login, anggota, periode, daftar pilihan, tugas, naskah, antrean, edisi, cetak). Keputusan baru tetap dicatat di sini.
> Proyek ini **berdiri sendiri**: tidak terkait ProjectJao/HISADA, inventaris Amar, maupun Veinmara.

## 1. Gambaran

Al-Ma'had adalah **organisasi jurnalistik santri** di lingkungan pondok. Sistem ini adalah **alat kerja internal redaksi**:
mengelola anggota, memberi tugas liputan, menulis naskah, menyunting berjenjang, lalu menerbitkan naskah sebagai **berita**
atau menyusunnya ke dalam **edisi majalah**. Tidak ada halaman untuk pembaca umum — "terbit" berarti naskah siap dipakai
(cetak, mading, media sosial).

## 2. Keputusan

| No | Keputusan | Positif | Negatif |
|----|-----------|---------|---------|
| A-01 | Hosting Cloudflare (Workers + D1), **akun Cloudflare terpisah**; Worker `almahad` → https://almahad.jaohongk.workers.dev; ID database D1: `0a95fda8-2dd8-4fd3-bff4-31bbea81ee5a` | Benar-benar lepas dari proyek lain; gratis | Perlu login wrangler terpisah di PC ini |
| A-02 | Kode disimpan di repo GitHub **publik** [Peelutk/almahad](https://github.com/Peelutk/almahad) (salinan kerja lokal `C:\HISADA\almahad`) | Ada cadangan & riwayat; bisa dihubungkan ke Workers Builds untuk deploy otomatis | Siapa pun bisa membaca desain & kode → rahasia (client secret, token) tidak boleh masuk repo |
| A-03 | **Desain dulu**, kode belakangan | Struktur matang sebelum dibangun | Hasil yang bisa dicoba muncul lebih lambat |
| A-04 | Pengguna: Reporter, Editor, Pemred, Admin | Tanpa pembaca umum → lebih sederhana & aman | Hasil kerja tidak terlihat publik dari sistem |
| A-05 | Alur redaksi **Reporter → Editor → Pemred → Terbit** | Kualitas terjaga dua lapis | Naskah lebih lama sampai terbit |
| A-06 | Majalah = **edisi kumpulan naskah**; tata letak di luar sistem (Canva/InDesign) | Ringan; desainer bebas berkreasi | Perlu ekspor naskah ke alat tata letak |
| A-07 | "Terbit" = **internal saja** | Tidak perlu moderasi publik | Arsip tidak bisa dibaca orang luar |
| A-08 | Login **Google**, hanya email **`@daarululuumlido.com`** | Tanpa kata sandi; orang luar pondok tidak bisa masuk | Butuh OAuth client Google; anggota tanpa email sekolah tidak bisa masuk |
| A-09 | Naskah **berita** dan naskah **majalah** **dipisah** (jenis dipilih saat naskah dibuat) | Alur dan arsip jelas; tidak ada naskah ganda | Tulisan yang cocok untuk keduanya harus ditulis/disalin dua kali |
| A-10 | Foto **tidak diunggah**; naskah cukup menyimpan **tautan file foto** (mis. Google Drive) | Tanpa R2; D1 tetap kecil; gratis | Foto bisa hilang/terkunci jika izin tautan berubah; tidak ada pratinjau terjamin |
| A-11 | **Penugasan liputan** lewat sistem | Tugas & tenggat tercatat; mudah dipantau | Menambah satu alur dan satu tabel |
| A-12 | Satu anggota boleh punya **lebih dari satu peran** | Cocok untuk organisasi kecil (mis. Editor + Admin) | Hak akses digabung; perlu aturan agar orang tidak menyetujui naskahnya sendiri |
| A-13 | Edisi majalah **hanya disusun Pemred** | Satu penanggung jawab isi edisi | Beban Pemred bertambah |
| A-14 | Saat periode berganti, anggota lama **diarsipkan** (tidak dihapus) | Nama penulis naskah lama tetap tercatat | Data bertambah tiap periode |
| A-15 | Anggota **boleh menyunting/menyetujui naskahnya sendiri** bila punya perannya (tanpa larangan khusus) | Sederhana; Pemred yang menulis tetap bisa menerbitkan | Pemeriksaan dua lapis bisa terlewati; mengandalkan kejujuran anggota (riwayat tetap mencatat siapa yang menyetujui) |
| A-16 | Tugas liputan **tidak bisa ditolak** reporter dan **wajib punya tenggat tanggal** | Tugas pasti dikerjakan; pemantauan jelas | Reporter yang berhalangan harus minta pemberi tugas mengubah/membatalkan tugas |
| A-17 | Reporter **boleh menulis naskah tanpa tugas** (inisiatif sendiri) | Kreativitas anggota tidak terhambat | Beban sunting Editor bisa bertambah |
| A-18 | **Tidak ada divisi** | Data anggota lebih sederhana | Pengelompokan anggota hanya lewat peran |
| A-19 | Ekspor majalah = **halaman cetak** dari browser, rapi seperti Google Docs (cetak / simpan PDF) | Tanpa pustaka tambahan; langsung bisa dicetak | Tata letak cetak sederhana; teks perlu disalin manual ke Canva/InDesign bila didesain ulang |
| A-20 | Modul khusus **Daftar Pilihan**: semua isian yang bersifat *dipilih* (rubrik berita, rubrik majalah, dll.) disimpan di **satu tabel** dan diatur lewat satu halaman; tidak ada daftar rubrik bawaan | Isi pilihan bisa diubah tanpa mengubah kode; satu tempat untuk semua daftar | Kesalahan ubah/hapus pilihan berdampak ke banyak data → pilihan yang sudah dipakai hanya bisa **dinonaktifkan**, tidak dihapus |
| A-21 | Daftar Pilihan untuk sementara hanya berisi **rubrik berita** dan **rubrik majalah**; kelompok lain ditambah nanti bila perlu | Mulai sederhana | Penambahan kelompok baru nanti butuh sedikit perubahan |
| A-22 | Daftar Pilihan dikelola **Admin dan Pemred** | Pemred bisa langsung menambah rubrik sesuai kebutuhan redaksi | Dua pihak bisa mengubah; perubahan perlu dicatat |
| A-23 | Tugas lewat tenggat **cukup ditandai "Terlambat"** dan tetap bisa dikerjakan | Tidak ada naskah yang hilang karena telat | Tenggat bisa kurang dihargai; Editor/Pemred memantau sendiri |
| A-24 | Tampilan **sederhana**, warna dari logo (hijau tua `#00A859`, hijau muda `#88C44A`), tema **terang/gelap mengikuti perangkat** | Identitas konsisten; nyaman di HP & malam hari | Dua set warna harus dirawat; hijau logo terlalu terang untuk teks di latar putih → tombol memakai hijau lebih gelap `#007A41` |
| A-25 | Kode dibangun **bertahap**; Tahap 1 = login Google, Anggota & peran, Periode, Daftar Pilihan | Fondasi teruji sebelum alur redaksi | Fitur redaksi belum bisa dipakai di Tahap 1 |
| A-26 | Deploy lewat **Workers Builds** dari GitHub (push ke `main` = deploy) | Tanpa login wrangler di PC; deploy otomatis | Setiap push langsung tayang → push hanya setelah uji lulus |
| A-27 | **Admin awal** = `216326@daarululuumlido.com`, otomatis Admin + Pemred saat pertama masuk (hanya selama belum ada Admin) | Tidak perlu halaman penyiapan | Email admin awal tertulis di konfigurasi publik |
| A-28 | Ganti periode: Admin mencentang anggota yang **lanjut**; sisanya diarsipkan otomatis, Admin yang mengganti selalu ikut lanjut | Sesuai A-14, tidak ada yang terkunci tanpa sengaja | Anggota yang lupa dicentang harus diaktifkan kembali manual |
| A-29 | Harus selalu ada **minimal satu Admin aktif** (sistem menolak perubahan yang melanggar) | Sistem tidak pernah kehilangan pengelola | — |
| A-30 | Logo asli **tidak** masuk repo; aplikasi memakai tanda lingkaran dua warna hijau | Berkas logo tetap privat | Tampilan belum memakai logo asli |
| A-31 | **Siapa melihat naskah**: penulis selalu; Editor/Pemred semua naskah kecuali Draf orang lain; naskah **Terbit** bisa dibaca semua anggota | Draf tetap pribadi; hasil terbit jadi arsip bersama | Reporter tidak bisa melihat naskah orang lain yang sedang diproses |
| A-32 | **Siapa mengubah isi**: penulis saat Draf/Revisi; Editor/Pemred saat Diajukan (penyuntingan dicatat "Disunting"); Pemred saat Lolos Editor; Terbit & Ditolak terkunci | Sesuai alur sunting berjenjang; jejak penyuntingan jelas | Penulis tidak bisa mengoreksi sendiri setelah mengajukan — harus lewat Revisi |
| A-33 | Naskah **Ditolak** bersifat final; penulis membuat naskah baru bila ingin mencoba lagi | Alur sederhana, riwayat jujur | Tulisan harus disalin ke naskah baru |
| A-34 | Penulis boleh **menghapus naskah Draf** miliknya; tugasnya kembali berstatus Baru | Tidak menumpuk draf percobaan | Draf yang terhapus tidak bisa dikembalikan |
| A-35 | Satu tugas hanya punya **satu naskah**; tugas jadi **Dikerjakan** saat naskah dibuat dan **Selesai** saat naskah diajukan; tugas yang sudah punya naskah tidak bisa dibatalkan atau dipindah reporternya | Status tugas otomatis, tidak perlu diubah manual | — |
| A-36 | Status edisi: **Disusun ⇄ Dikunci → Terbit**; isi & urutan hanya bisa diubah saat Disusun; edisi Terbit tidak bisa diubah; satu naskah hanya masuk satu edisi | Isi edisi aman saat dikerjakan desainer | Koreksi setelah terbit tidak mungkin |
| A-37 | Ada **halaman cetak per naskah** (selain per edisi) untuk berita/mading | Berita bisa dicetak tanpa membuat edisi | — |
| A-38 | **Foto ditampilkan dari tautan**: tautan *file* Google Drive → gambar (thumbnail Drive, dimuat dengan login Google si pembaca); tautan *folder* Drive → bingkai grid bawaan Drive; tautan langsung berakhiran .jpg/.png/.webp/.gif → gambar; tautan lain tetap teks | Tanpa API key dan tanpa server tambahan; folder khusus akun sekolah tetap terlihat oleh pembaca yang berhak | Gambar hanya tampil bila pembaca punya akses ke file; bingkai folder bisa kosong bila browser memblokir cookie pihak ketiga dan tampilannya gaya Google |
| A-39 | **Halaman cetak memuat gambar** dari tautan file/gambar; folder tetap dicetak sebagai tautan | Hasil cetak/PDF berisi foto | Folder tidak ikut tercetak; gambar yang gagal dimuat tercetak sebagai pesan |
| A-40 | **Notifikasi email lewat Gmail API** dari akun `216326@daarululuumlido.com`; Admin menghubungkan akun sekali lewat tombol (izin `gmail.send`) | Gratis, jarang masuk spam ke sesama akun sekolah, tanpa layanan baru | OAuth app harus *In production* (status *Testing* membuat izin kedaluwarsa tiap 7 hari); email tercatat di Terkirim akun tersebut |
| A-41 | Refresh token Gmail disimpan **terenkripsi (AES-GCM)** di D1; kuncinya secret Worker `ENKRIPSI_KUNCI` | Token tidak terbaca walau database bocor; tidak ada token yang lewat chat | Bila `ENKRIPSI_KUNCI` diganti, akun pengirim harus dihubungkan ulang |
| A-42 | Kejadian yang dikirimi email: tugas baru/ganti reporter → reporter; naskah diajukan → semua Editor; lolos editor → semua Pemred; revisi/ditolak/terbit → penulis; pelaku tidak menerima email atas aksinya sendiri | Setiap orang tahu saat gilirannya bertindak | Editor/Pemred bisa menerima banyak email bila naskah ramai |
| A-43 | **Pengingat tenggat** H-1 dan saat terlambat, masing-masing sekali per tugas (diulang bila tenggat diubah), mulai 06.00 WIB, lewat Cron tiap 15 menit | Reporter diingatkan tanpa kerja manual | — |
| A-44 | Email masuk **antrean**: dikirim langsung, yang gagal dicoba ulang maksimal 5 kali lalu bisa dikirim ulang manual; notifikasi **nonaktif secara bawaan** dan tidak mengantrekan apa pun saat nonaktif/terputus | Aksi utama tidak pernah gagal karena email; tidak ada banjir email saat diaktifkan | Kejadian selama nonaktif tidak akan pernah dikirimi email |
| A-45 | **Login NIS + password** untuk semua anggota; login Google tetap ada. Setiap anggota punya NIS dan/atau email sekolah — **email jadi opsional** | Anggota tanpa email sekolah tetap bisa masuk | Anggota tanpa email tidak bisa login Google dan tidak menerima notifikasi email |
| A-46 | **Password awal = NIS**, wajib diganti saat pertama masuk dengan NIS (semua fitur terkunci sampai diganti); password baru minimal 8 karakter dan tidak sama dengan NIS; mengganti password mengakhiri sesi lain | Praktis, tidak perlu menyampaikan password | Siapa pun yang tahu NIS bisa masuk duluan sebelum pemiliknya mengganti — sampaikan ke anggota agar segera masuk |
| A-47 | **Pengaman**: 5× salah password → akun dikunci 15 menit; 20× gagal dari satu perangkat dalam 15 menit → perangkat ditahan; pesan galat tidak membedakan NIS salah atau password salah | Menahan tebak-tebakan password | Pemilik akun ikut menunggu bila ada yang iseng mencoba |
| A-48 | **Lupa password** → Admin menekan *Reset password ke NIS* di halaman Anggota (wajib ganti lagi, kunci dibuka, semua sesi anggota itu diakhiri) | Sederhana, tanpa email | Admin harus dihubungi langsung |
| A-49 | Password disimpan sebagai **PBKDF2-SHA256** dengan salt; iterasi diatur variabel `PBKDF2_ITERASI` (bawaan 10.000 karena batas CPU Worker gratis) dan otomatis ditingkatkan saat anggota masuk bila nilainya dinaikkan | Tidak ada password tersimpan dalam bentuk asli | 10.000 iterasi di bawah rekomendasi OWASP; naikkan bila memakai paket Workers berbayar |
| A-50 | Anggota tanpa email menyimpan penanda internal `nis:<NIS>` di kolom email (migrasi 4 hanya menambah kolom, tanpa membangun ulang tabel anggota) | Migrasi aman: tabel induk tidak dibangun ulang, data & relasi tidak tersentuh | Penanda harus selalu disaring di kode (sudah: tampilan, Google, email) |
| A-51 | **Upload CSV anggota** (Admin, halaman Anggota): kolom berurutan `NIS, Nama, Kelas`; pemisah koma atau titik koma (format Excel Indonesia); baris yang kolom NIS-nya bukan NIS (mis. baris judul) dilewati; tersedia *Unduh contoh CSV*; maksimal 500 baris per upload | Mendaftarkan banyak anggota sekaligus | Urutan kolom harus tepat (tidak dicocokkan dari judul kolom) |
| A-52 | Alur upload: **pilih file → pilih peran → pratinjau → Simpan**. Peran (Reporter/Editor/Pemred, **tanpa Admin**) berlaku untuk semua baris. Pratinjau menandai tiap baris: akan ditambahkan / dilewati (NIS atau email sudah terdaftar, atau ganda di file) / salah (beserta alasan); belum ada yang tersimpan sebelum Simpan. **Duplikat dilewati**, data lama tidak diubah | Kesalahan terlihat sebelum tersimpan; CSV tidak bisa menimpa data atau membuat Admin | Satu file = satu peran; peran campuran diubah manual sesudahnya |
| A-53 | **Email otomatis `(NIS)@daarululuumlido.com`**: di CSV selalu; di form manual terisi otomatis saat NIS diketik tetapi tetap bisa diubah atau dikosongkan | Anggota langsung bisa login Google & menerima notifikasi | Bila email sekolah santri tidak sama dengan NIS, harus dibetulkan manual (login NIS tetap jalan) |
| A-54 | **Password awal tanpa hash**: anggota yang punya NIS tetapi belum punya hash password berarti *password awal = NIS* (dicocokkan langsung dengan NIS, tetap wajib ganti). Berlaku untuk tambah anggota, CSV, ubah NIS, dan reset. Hash PBKDF2 baru dibuat saat anggota mengganti password | Upload ratusan baris tidak melebihi batas CPU Worker gratis; tambah/reset lebih ringan | Satu cabang tambahan di kode login & ganti password (diuji khusus) |

## 3. Mindmap

```mermaid
mindmap
  root((Al-Ma'had))
    Anggota
      Data anggota
      Upload CSV
      Peran ganda
      Periode & arsip
    Penugasan
      Buat tugas liputan
      Tenggat wajib
      Naskah dari tugas
    Redaksi
      Tulis naskah
      Ajukan
      Sunting Editor
      Setujui Pemred
      Riwayat & catatan revisi
    Berita
      Naskah jenis berita
      Rubrik
      Tautan foto
    Majalah
      Edisi
      Naskah jenis majalah
      Urutan rubrik
      Halaman cetak
    Pengaturan
      Akun & peran
      Daftar Pilihan
```

## 4. Peran & hak akses

| Kemampuan | Reporter | Editor | Pemred | Admin |
|-----------|:-------:|:------:|:------:|:-----:|
| Tulis & ajukan naskah sendiri | ✔ | ✔ | ✔ | – |
| Beri tugas liputan | – | ✔ | ✔ | – |
| Sunting naskah orang lain / minta revisi | – | ✔ | ✔ | – |
| Setujui akhir (terbitkan) | – | – | ✔ | – |
| Susun edisi majalah | – | – | ✔ | – |
| Kelola anggota, periode | – | – | – | ✔ |
| Kelola Daftar Pilihan | – | – | ✔ | ✔ |

Peran ganda = gabungan hak dari semua perannya. Menyetujui naskah sendiri **diperbolehkan** (A-15); riwayat tetap mencatat siapa yang menyetujui.

## 5. Alur penugasan liputan

```mermaid
flowchart TD
    A[Editor atau Pemred buat tugas] --> B[Pilih reporter, jenis, rubrik, tenggat wajib]
    B --> C[Reporter menerima tugas]
    C --> D[Reporter tulis naskah dari tugas]
    D --> E[Naskah masuk alur redaksi]
    E --> F[Tugas selesai saat naskah diajukan]
    C --> G[Tenggat lewat: ditandai Terlambat]
    G --> D
```

## 6. Alur naskah

```mermaid
stateDiagram-v2
    [*] --> Draf
    Draf --> Diajukan: Reporter ajukan
    Diajukan --> Revisi: Editor minta revisi
    Revisi --> Diajukan: Reporter ajukan ulang
    Diajukan --> LolosEditor: Editor setuju
    LolosEditor --> Revisi: Pemred minta revisi
    LolosEditor --> Terbit: Pemred setuju
    Diajukan --> Ditolak: Editor tolak
    LolosEditor --> Ditolak: Pemred tolak
    Terbit --> [*]
    Ditolak --> [*]
```

Setiap perpindahan status dicatat (siapa, kapan, catatan). Naskah **berita** selesai di status Terbit;
naskah **majalah** yang Terbit siap dimasukkan ke edisi.

## 7. Alur majalah

```mermaid
flowchart TD
    A[Pemred buat edisi baru] --> B[Pilih naskah jenis majalah berstatus Terbit]
    B --> C[Atur urutan per rubrik]
    C --> D[Kunci edisi]
    D --> E[Buka halaman cetak lalu cetak atau simpan PDF]
    E --> F[Tandai edisi Terbit]
```

## 8. Rancangan database (D1) — draf

| Tabel | Kolom utama |
|-------|-------------|
| `anggota` | id, email (unik, `@daarululuumlido.com`, atau penanda `nis:<NIS>`), nis (unik), nama, kelas, periode_id, status (`aktif`/`arsip`), sandi_hash (kosong + ada NIS = password awal NIS), sandi_wajib_ganti, gagal_masuk, terkunci_sampai |
| `anggota_peran` | anggota_id, peran (`reporter`/`editor`/`pemred`/`admin`) — satu baris per peran |
| `periode` | id, nama (mis. 2026/2027), mulai, selesai, aktif |
| `pilihan` | id, kelompok (mis. `rubrik_berita`, `rubrik_majalah`), nilai, urutan, aktif — modul Daftar Pilihan (A-20) |
| `tugas` | id, judul, keterangan, jenis, rubrik_id → `pilihan`, pemberi_id, reporter_id, tenggat (wajib), status (`baru`/`dikerjakan`/`selesai`/`batal`); "terlambat" dihitung dari tenggat, tidak disimpan |
| `naskah` | id, jenis (`berita`/`majalah`), judul, rubrik_id → `pilihan`, penulis_id, tugas_id (boleh kosong), isi, status, dibuat_at, diubah_at |
| `naskah_foto` | id, naskah_id, tautan, keterangan |
| `naskah_riwayat` | id, naskah_id, dari_status, ke_status, oleh_id, catatan, waktu |
| `edisi` | id, nomor, tema, bulan_terbit, status (`disusun`/`dikunci`/`terbit`) |
| `edisi_naskah` | edisi_id, naskah_id, urutan |
| `sesi` | token, anggota_id, kedaluwarsa |

## 9. Rancangan tampilan

Prototipe statis: `prototipe/index.html` (data contoh, tombol belum berfungsi; logo dari `aset/` yang tidak masuk repo). Aplikasi asli Tahap 1 ada di `public/`.

| Halaman | Pengguna | Isi |
|---------|----------|-----|
| Masuk | semua | Tombol Masuk dengan Google; hanya `@daarululuumlido.com` |
| Dasbor | semua | Ringkasan sesuai peran: tugas saya, perlu disunting, menunggu Pemred, edisi disusun |
| Tugas Liputan | Reporter, Editor, Pemred | Daftar tugas, tanda **Terlambat**; Editor/Pemred: Beri tugas (tenggat wajib) |
| Naskah | Reporter, Editor, Pemred | Tab Semua/Berita/Majalah; tulis naskah; halaman naskah dengan tautan foto, tombol sesuai status & peran, riwayat |
| Antrean Redaksi | Editor, Pemred | Perlu disunting; menunggu persetujuan akhir |
| Edisi Majalah | Pemred | Daftar edisi; susun & urutkan naskah; kunci; halaman cetak |
| Halaman cetak | Pemred | Tampilan seperti dokumen (kertas putih, per rubrik) → Cetak / Simpan PDF |
| Anggota | Admin | Daftar per periode, peran ganda, status arsip; Upload CSV (pratinjau → Simpan) |
| Daftar Pilihan | Admin, Pemred | Tab rubrik berita/majalah; tambah, urutkan, nonaktifkan |

## 10. Pertanyaan terbuka

Tidak ada. Desain draf ini **lengkap**; langkah berikutnya (perubahan prototipe atau mulai kode) menunggu persetujuan Hong Khai.
