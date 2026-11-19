// Migrasi database D1 — dijalankan otomatis pada permintaan pertama.
// ATURAN: jangan ubah migrasi yang sudah terpasang; tambah versi baru.
// Isian bawaan memakai INSERT OR IGNORE agar aman dijalankan ulang.

export const MIGRASI = [
  {
    versi: 1,
    nama: 'Tahap 1: periode, anggota, peran, daftar pilihan, sesi',
    sql: [
      `CREATE TABLE IF NOT EXISTS periode (
        id INTEGER PRIMARY KEY,
        nama TEXT NOT NULL UNIQUE,
        aktif INTEGER NOT NULL DEFAULT 0,
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS anggota (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nama TEXT NOT NULL,
        kelas TEXT NOT NULL DEFAULT '',
        periode_id INTEGER REFERENCES periode(id),
        status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','arsip')),
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS anggota_peran (
        anggota_id INTEGER NOT NULL REFERENCES anggota(id) ON DELETE CASCADE,
        peran TEXT NOT NULL CHECK (peran IN ('reporter','editor','pemred','admin')),
        PRIMARY KEY (anggota_id, peran)
      )`,
      `CREATE TABLE IF NOT EXISTS pilihan (
        id INTEGER PRIMARY KEY,
        kelompok TEXT NOT NULL,
        nilai TEXT NOT NULL,
        urutan INTEGER NOT NULL DEFAULT 0,
        aktif INTEGER NOT NULL DEFAULT 1,
        UNIQUE (kelompok, nilai)
      )`,
      `CREATE TABLE IF NOT EXISTS sesi (
        token_hash TEXT PRIMARY KEY,
        anggota_id INTEGER NOT NULL REFERENCES anggota(id) ON DELETE CASCADE,
        kedaluwarsa INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS sesi_anggota ON sesi(anggota_id)`,
      // Anggota diarsipkan → semua sesinya langsung berakhir.
      `CREATE TRIGGER IF NOT EXISTS anggota_diarsip AFTER UPDATE OF status ON anggota
        WHEN NEW.status = 'arsip'
        BEGIN DELETE FROM sesi WHERE anggota_id = NEW.id; END`,
      `INSERT OR IGNORE INTO periode (nama, aktif) VALUES ('2026/2027', 1)`,
    ],
  },
  {
    versi: 2,
    nama: 'Tahap 2: tugas liputan, naskah, foto, riwayat, edisi majalah',
    sql: [
      `CREATE TABLE IF NOT EXISTS tugas (
        id INTEGER PRIMARY KEY,
        judul TEXT NOT NULL,
        keterangan TEXT NOT NULL DEFAULT '',
        jenis TEXT NOT NULL CHECK (jenis IN ('berita','majalah')),
        rubrik_id INTEGER NOT NULL REFERENCES pilihan(id),
        pemberi_id INTEGER NOT NULL REFERENCES anggota(id),
        reporter_id INTEGER NOT NULL REFERENCES anggota(id),
        tenggat TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','dikerjakan','selesai','batal')),
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS tugas_reporter ON tugas(reporter_id)`,
      `CREATE TABLE IF NOT EXISTS naskah (
        id INTEGER PRIMARY KEY,
        jenis TEXT NOT NULL CHECK (jenis IN ('berita','majalah')),
        judul TEXT NOT NULL,
        rubrik_id INTEGER NOT NULL REFERENCES pilihan(id),
        penulis_id INTEGER NOT NULL REFERENCES anggota(id),
        tugas_id INTEGER REFERENCES tugas(id),
        isi TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','diajukan','revisi','lolos','terbit','ditolak')),
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now')),
        diubah_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS naskah_penulis ON naskah(penulis_id)`,
      `CREATE INDEX IF NOT EXISTS naskah_status ON naskah(status)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS naskah_tugas ON naskah(tugas_id) WHERE tugas_id IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS naskah_foto (
        id INTEGER PRIMARY KEY,
        naskah_id INTEGER NOT NULL REFERENCES naskah(id) ON DELETE CASCADE,
        tautan TEXT NOT NULL,
        keterangan TEXT NOT NULL DEFAULT '',
        urutan INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS naskah_foto_naskah ON naskah_foto(naskah_id)`,
      `CREATE TABLE IF NOT EXISTS naskah_riwayat (
        id INTEGER PRIMARY KEY,
        naskah_id INTEGER NOT NULL REFERENCES naskah(id) ON DELETE CASCADE,
        dari_status TEXT,
        ke_status TEXT NOT NULL,
        oleh_id INTEGER NOT NULL REFERENCES anggota(id),
        catatan TEXT NOT NULL DEFAULT '',
        waktu TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS naskah_riwayat_naskah ON naskah_riwayat(naskah_id)`,
      `CREATE TABLE IF NOT EXISTS edisi (
        id INTEGER PRIMARY KEY,
        nomor TEXT NOT NULL UNIQUE,
        tema TEXT NOT NULL DEFAULT '',
        bulan_terbit TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'disusun' CHECK (status IN ('disusun','dikunci','terbit')),
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS edisi_naskah (
        edisi_id INTEGER NOT NULL REFERENCES edisi(id) ON DELETE CASCADE,
        naskah_id INTEGER NOT NULL UNIQUE REFERENCES naskah(id),
        urutan INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (edisi_id, naskah_id)
      )`,
    ],
  },
  {
    versi: 3,
    nama: 'Notifikasi email: pengaturan, antrean email, penanda pengingat tenggat',
    sql: [
      `CREATE TABLE IF NOT EXISTS pengaturan (
        kunci TEXT PRIMARY KEY,
        nilai TEXT NOT NULL,
        diubah_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS email_antrean (
        id INTEGER PRIMARY KEY,
        ke TEXT NOT NULL,
        subjek TEXT NOT NULL,
        html TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu','dikirim','terkirim','gagal')),
        percobaan INTEGER NOT NULL DEFAULT 0,
        galat TEXT,
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now')),
        dikunci_at TEXT,
        dikirim_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS email_antrean_status ON email_antrean(status)`,
      `ALTER TABLE tugas ADD COLUMN ingat_h1_at TEXT`,
      `ALTER TABLE tugas ADD COLUMN ingat_telat_at TEXT`,
    ],
  },
  {
    // Email menjadi opsional TANPA membangun ulang tabel anggota (membangun ulang tabel induk di D1
    // memicu CASCADE/pelanggaran FK). Anggota tanpa email menyimpan penanda internal "nis:<NIS>"
    // di kolom email; penanda ini tidak pernah ditampilkan, dikirimi email, atau dipakai login Google.
    versi: 4,
    nama: 'Login NIS + password: kolom NIS & password, cara masuk sesi, percobaan masuk',
    sql: [
      `ALTER TABLE anggota ADD COLUMN nis TEXT`,
      `CREATE UNIQUE INDEX IF NOT EXISTS anggota_nis ON anggota(nis COLLATE NOCASE)`,
      `ALTER TABLE anggota ADD COLUMN sandi_hash TEXT`,
      `ALTER TABLE anggota ADD COLUMN sandi_wajib_ganti INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE anggota ADD COLUMN gagal_masuk INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE anggota ADD COLUMN terkunci_sampai INTEGER`,
      `ALTER TABLE sesi ADD COLUMN cara TEXT NOT NULL DEFAULT 'google'`,
      `CREATE TABLE IF NOT EXISTS masuk_gagal (
        id INTEGER PRIMARY KEY,
        ip TEXT NOT NULL,
        waktu INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS masuk_gagal_ip ON masuk_gagal(ip, waktu)`,
    ],
  },
  {
    // Hanya tabel baru (A-59): foto yang diupload ke Drive lewat aplikasi.
    versi: 5,
    nama: 'Upload foto ke Google Drive',
    sql: [
      `CREATE TABLE IF NOT EXISTS foto_upload (
        id INTEGER PRIMARY KEY,
        drive_id TEXT NOT NULL UNIQUE,
        nama TEXT NOT NULL,
        mime TEXT NOT NULL,
        ukuran INTEGER NOT NULL,
        pengunggah_id INTEGER REFERENCES anggota(id),
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    // Hanya tabel baru (A-63, A-66): dokumen tujuan transkrip & riwayat transkrip (tanpa isi teks).
    versi: 6,
    nama: 'Transkrip foto ke Google Docs',
    sql: [
      `CREATE TABLE IF NOT EXISTS docs_tujuan (
        id INTEGER PRIMARY KEY,
        nama TEXT NOT NULL,
        doc_id TEXT NOT NULL UNIQUE,
        akun TEXT NOT NULL,
        aktif INTEGER NOT NULL DEFAULT 1,
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS transkrip_riwayat (
        id INTEGER PRIMARY KEY,
        anggota_id INTEGER REFERENCES anggota(id),
        jenis TEXT NOT NULL,
        docs_id INTEGER REFERENCES docs_tujuan(id),
        judul TEXT,
        jumlah_foto INTEGER NOT NULL DEFAULT 0,
        panjang INTEGER NOT NULL DEFAULT 0,
        waktu INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS transkrip_riwayat_anggota ON transkrip_riwayat(anggota_id, jenis, waktu)`,
    ],
  },
  {
    // A-67..A-70: ID folder arsip edisi/rubrik/penulis di Drive + dokumen transkrip per naskah.
    // Hanya tabel baru & kolom baru (naskah tidak dibangun ulang).
    versi: 7,
    nama: 'Folder arsip edisi di Google Drive',
    sql: [
      `CREATE TABLE IF NOT EXISTS arsip_folder (
        id INTEGER PRIMARY KEY,
        akun TEXT NOT NULL,
        edisi_id INTEGER NOT NULL,
        rubrik_id INTEGER NOT NULL DEFAULT 0,
        penulis TEXT NOT NULL DEFAULT '',
        nama TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        dibuat_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (akun, edisi_id, rubrik_id, penulis)
      )`,
      `ALTER TABLE naskah ADD COLUMN transkrip_doc_id TEXT`,
    ],
  },
];

let siap = false;

export async function pastikanSkema(db) {
  if (siap) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS _migrasi (
    versi INTEGER PRIMARY KEY, nama TEXT, dipasang_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  const { results } = await db.prepare('SELECT versi FROM _migrasi').all();
  const sudah = new Set(results.map(r => r.versi));
  for (const m of MIGRASI) {
    if (sudah.has(m.versi)) continue;
    // Satu batch = satu transaksi: migrasi terpasang utuh atau tidak sama sekali.
    try {
      await db.batch([
        ...m.sql.map(s => db.prepare(s)),
        db.prepare('INSERT INTO _migrasi (versi, nama) VALUES (?, ?)').bind(m.versi, m.nama),
      ]);
    } catch (e) {
      // Bisa terjadi bila dua permintaan memigrasi bersamaan: cukup bila versi ini sudah tercatat.
      const ada = await db.prepare('SELECT 1 FROM _migrasi WHERE versi = ?').bind(m.versi).first();
      if (!ada) throw e;
    }
  }
  siap = true;
}
