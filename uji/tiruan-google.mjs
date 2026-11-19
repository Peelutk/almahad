// Tiruan Google OAuth token + Gmail API + Drive API untuk uji lokal (port 8791).
// Kode otorisasi = JSON base64url: { klaim, refresh_token?, scope? } atau langsung klaim id_token.
import http from 'http';
import crypto from 'crypto';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
let kotak = [], gagal = false;
// Drive tiruan
// Docs & Gemini tiruan
let nomorFolder = 0, nomorDoc = 0, dokumen = {}, docsGagal = false;
let nomorG = 0, gUnggah = [], gBerkas = {}, gDihapus = [], gemini = { gagal: 0, kosong: false, terakhir: null };
let nomorFile = 0, folder = [], file = [], sesi = [], driveGagal = false, tanpaThumb = false, ukuranThumb = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const dekode = s => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, x) => Buffer.from(x, 'base64').toString('utf8'));
const DASAR = 'http://127.0.0.1:8791';
// Baca lebar × tinggi dari penanda SOF JPEG.
function ukuranJpeg(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1], pjg = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc2) return { tinggi: b.readUInt16BE(i + 5), lebar: b.readUInt16BE(i + 7) };
    i += 2 + pjg;
  }
  return {};
}
http.createServer((req, res) => {
  const potong = []; req.on('data', c => potong.push(c)); req.on('end', () => {
    const mentah = Buffer.concat(potong), body = mentah.toString('utf8');
    const u = new URL(req.url, 'http://x');
    const kirim = (s, o, h = {}) => { res.writeHead(s, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)); };
    const berhak = () => /^Bearer at-/.test(req.headers.authorization || '');
    if (u.pathname === '/token') {
      const p = new URLSearchParams(body);
      if (p.get('client_secret') !== 'rahasia-uji') return kirim(401, { error: 'invalid_client' });
      if (p.get('grant_type') === 'refresh_token') {
        const rt = p.get('refresh_token');
        if (rt === 'rt-cabut') return kirim(400, { error: 'invalid_grant' });
        return kirim(200, { access_token: 'at-' + rt, expires_in: 3600 });
      }
      let k; try { k = JSON.parse(Buffer.from(p.get('code'), 'base64url').toString()); } catch { return kirim(400, { error: 'invalid_grant' }); }
      const klaim = k.klaim || k;
      const o = { id_token: `${b64({ alg: 'none' })}.${b64(klaim)}.x` };
      if (k.refresh_token) o.refresh_token = k.refresh_token;
      if (k.scope) o.scope = k.scope;
      return kirim(200, o);
    }
    if (u.pathname === '/gmail/v1/users/me/messages/send') {
      if (!berhak()) return kirim(401, { error: 'unauth' });
      if (gagal) return kirim(500, { error: 'backend' });
      const raw = Buffer.from(JSON.parse(body).raw, 'base64url').toString('utf8');
      const [kepala, isi] = raw.split('\r\n\r\n');
      const h = Object.fromEntries(kepala.split('\r\n').map(l => [l.slice(0, l.indexOf(':')).toLowerCase(), dekode(l.slice(l.indexOf(':') + 2))]));
      kotak.push({ to: h.to, from: h.from, subject: h.subject, html: Buffer.from(isi.replace(/\r\n/g, ''), 'base64').toString('utf8'), token: req.headers.authorization });
      return kirim(200, { id: 'm' + kotak.length });
    }
    // ---- Drive: buat folder
    if (u.pathname === '/drive/v3/files' && req.method === 'POST') {
      if (!berhak()) return kirim(401, { error: 'unauth' });
      const m = JSON.parse(body);
      // Induk harus folder yang bisa diakses aplikasi (buatan aplikasi atau dipilih lewat Picker).
      if ((m.parents || []).some(pid => !folder.some(f => f.id === pid))) return kirim(404, { error: 'induk tidak ada / tidak boleh' });
      if (m.mimeType === 'application/vnd.google-apps.document') {
        const id = 'doc' + (++nomorDoc) + 'XXXXXXXXXX';
        dokumen[id] = { name: m.name, parents: m.parents || [], teks: '\n', gaya: [], token: req.headers.authorization };
        return kirim(200, { id });
      }
      if (m.mimeType !== 'application/vnd.google-apps.folder') return kirim(400, { error: 'bukan folder' });
      const id = 'folder' + (++nomorFolder) + 'XXXXXXXX';
      folder.push({ id, name: m.name, parents: m.parents || [], token: req.headers.authorization });
      return kirim(200, { id });
    }
    // ---- Drive: mulai upload resumable
    if (u.pathname === '/upload/drive/v3/files' && req.method === 'POST' && u.searchParams.get('uploadType') === 'resumable') {
      if (!berhak()) return kirim(401, { error: 'unauth' });
      const m = JSON.parse(body);
      sesi.push({ meta: m, mime: req.headers['x-upload-content-type'], panjang: Number(req.headers['x-upload-content-length']) });
      return kirim(200, {}, { location: `${DASAR}/sesi/${sesi.length - 1}` });
    }
    let r;
    // ---- Drive: ganti nama berkas (dokumen)
    r = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (r && req.method === 'PATCH') {
      if (!berhak()) return kirim(401, {});
      const id = decodeURIComponent(r[1]);
      const d = dokumen[id] || folder.find(f => f.id === id);
      if (!d) return kirim(404, { error: 'notFound' });
      d.name = JSON.parse(body).name; return kirim(200, { id });
    }
    // ---- Drive: metadata folder (GET) — berkas biasa ditangani di bawah
    r = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (r && req.method === 'GET' && folder.some(f => f.id === decodeURIComponent(r[1]))) {
      if (!berhak()) return kirim(401, {});
      const f = folder.find(x => x.id === decodeURIComponent(r[1]));
      return kirim(200, { id: f.id, name: f.name, mimeType: 'application/vnd.google-apps.folder' });
    }
    if (r && req.method === 'GET' && dokumen[decodeURIComponent(r[1])]) {
      if (!berhak()) return kirim(401, {});
      return kirim(200, { id: r[1], name: dokumen[decodeURIComponent(r[1])].name, mimeType: 'application/vnd.google-apps.document' });
    }
    // ---- Docs API
    r = u.pathname.match(/^\/v1\/documents\/([^/:]+)(:batchUpdate)?$/);
    if (r) {
      if (!berhak()) return kirim(401, {});
      const d = dokumen[decodeURIComponent(r[1])];
      if (!d) return kirim(404, { error: 'notFound' });
      if (!r[2] && req.method === 'GET') return kirim(200, { body: { content: [{ endIndex: 1, sectionBreak: {} }, { startIndex: 1, endIndex: d.teks.length + 1, paragraph: {} }] } });
      if (r[2] && req.method === 'POST') {
        if (docsGagal) return kirim(500, { error: 'backend' });
        for (const q of JSON.parse(body).requests) {
          if (q.insertText) {
            const i = q.insertText.location.index; // indeks Docs mulai 1
            if (i < 1 || i > d.teks.length) return kirim(400, { error: `indeks ${i} di luar dokumen (${d.teks.length})` });
            d.teks = d.teks.slice(0, i - 1) + q.insertText.text + d.teks.slice(i - 1);
          } else if (q.updateParagraphStyle) {
            const { startIndex, endIndex } = q.updateParagraphStyle.range;
            if (endIndex > d.teks.length + 1) return kirim(400, { error: 'range di luar dokumen' });
            d.gaya.push({ gaya: q.updateParagraphStyle.paragraphStyle.namedStyleType, teks: d.teks.slice(startIndex - 1, endIndex - 1) });
          }
        }
        return kirim(200, { documentId: r[1] });
      }
    }
    // ---- Gemini Files API + generateContent
    const kunciGemini = () => req.headers['x-goog-api-key'] === 'kunci-gemini-uji';
    if (u.pathname === '/upload/v1beta/files' && req.method === 'POST') {
      if (!kunciGemini()) return kirim(403, { error: { code: 403 } });
      if (gemini.gagal) return kirim(gemini.gagal, { error: { code: gemini.gagal } });
      gUnggah.push({ panjang: Number(req.headers['x-goog-upload-header-content-length']), mime: req.headers['x-goog-upload-header-content-type'], protokol: req.headers['x-goog-upload-protocol'], perintah: req.headers['x-goog-upload-command'] });
      return kirim(200, {}, { 'x-goog-upload-url': `${DASAR}/gunggah/${gUnggah.length - 1}` });
    }
    r = u.pathname.match(/^\/gunggah\/(\d+)$/);
    if (r && req.method === 'POST') {
      const s = gUnggah[Number(r[1])];
      if (!s || req.headers['x-goog-upload-command'] !== 'upload, finalize' || req.headers['x-goog-upload-offset'] !== '0') return kirim(400, {});
      if (mentah.length !== s.panjang) return kirim(400, { error: `panjang ${mentah.length} ≠ ${s.panjang}` });
      const nama = 'files/g' + (++nomorG) + 'abc';
      gBerkas[nama] = { mime: s.mime, ukuran: mentah.length, chunked: req.headers['transfer-encoding'] || null, jpeg: mentah[0] === 0xff && mentah[1] === 0xd8, ...ukuranJpeg(mentah) };
      s.hasil = gBerkas[nama];
      return kirim(200, { file: { name: nama, uri: `${DASAR}/v1beta/${nama}`, mimeType: s.mime, state: 'ACTIVE' } });
    }
    r = u.pathname.match(/^\/v1beta\/(files\/[a-z0-9-]+)$/);
    if (r && req.method === 'DELETE') {
      if (!kunciGemini()) return kirim(403, {});
      gDihapus.push(r[1]); delete gBerkas[r[1]]; return kirim(200, {});
    }
    r = u.pathname.match(/^\/v1beta\/models\/([^:]+):generateContent$/);
    if (r && req.method === 'POST') {
      if (!kunciGemini()) return kirim(403, { error: { code: 403 } });
      const q = JSON.parse(body);
      const parts = q.contents[0].parts;
      const fileParts = parts.filter(p => p.file_data);
      gemini.terakhir = { model: decodeURIComponent(r[1]), perintah: parts[0].text, uri: fileParts.map(p => p.file_data.file_uri), suhu: q.generationConfig?.temperature };
      if (gemini.gagal) return kirim(gemini.gagal, { error: { code: gemini.gagal } });
      const hilang = fileParts.find(p => !gBerkas[p.file_data.file_uri.replace(/^.*\/v1beta\//, '')]);
      if (hilang) return kirim(400, { error: { message: 'file tidak ada' } });
      const teks = gemini.kosong ? 'TIDAK_ADA_TEKS' : `Hasil transkrip dari ${fileParts.length} foto.\r\n\r\n\r\n\r\nParagraf kedua [?] tulisan tangan.`;
      return kirim(200, { candidates: [{ content: { parts: [{ text: teks.slice(0, 20) }, { text: teks.slice(20) }] }, finishReason: 'STOP' }] });
    }
    r = u.pathname.match(/^\/sesi\/(\d+)$/);
    if (r && req.method === 'PUT') {
      const s = sesi[Number(r[1])];
      if (!s) return kirim(404, {});
      if (driveGagal) return kirim(500, { error: 'backend' });
      if (mentah.length !== s.panjang) return kirim(400, { error: `panjang ${mentah.length} ≠ ${s.panjang}` });
      const id = 'file' + (++nomorFile) + 'XXXXXXXXXX';
      file.push({ id, name: s.meta.name, parents: s.meta.parents, mime: s.mime, data: mentah,
        sha: crypto.createHash('sha256').update(mentah).digest('hex'), content_length: req.headers['content-length'] || null, chunked: req.headers['transfer-encoding'] || null });
      return kirim(200, { id });
    }
    r = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (r && req.method === 'GET') {
      if (!berhak()) return kirim(401, { error: 'unauth' });
      const f = file.find(x => x.id === decodeURIComponent(r[1]));
      if (!f) return kirim(404, { error: 'notFound' });
      if (u.searchParams.get('alt') === 'media') { res.writeHead(200, { 'content-type': f.mime, 'content-length': f.data.length, 'set-cookie': 'drive=rahasia' }); return res.end(f.data); }
      return kirim(200, tanpaThumb ? {} : { thumbnailLink: `${DASAR}/thumb/${f.id}=s220` });
    }
    r = u.pathname.match(/^\/thumb\/([^=]+)=s(\d+)$/);
    if (r) {
      if (!berhak()) return kirim(403, {});
      ukuranThumb.push(Number(r[2]));
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length }); return res.end(PNG);
    }
    if (u.pathname === '/gemini/keadaan') return kirim(200, { ...gemini, unggah: gUnggah, berkas: gBerkas, dihapus: gDihapus });
    if (u.pathname === '/gemini/mode') {
      gemini.gagal = Number(u.searchParams.get('gagal')) || 0; gemini.kosong = u.searchParams.get('kosong') === '1';
      return kirim(200, gemini);
    }
    if (u.pathname === '/docs/keadaan') return kirim(200, dokumen);
    r = u.pathname.match(/^\/docs\/hapus\/(.+)$/);
    if (r) { delete dokumen[r[1]]; return kirim(200, {}); }
    if (u.pathname === '/docs/mode') { docsGagal = u.searchParams.get('gagal') === '1'; return kirim(200, {}); }
    // Simulasi folder milik orang lain yang dipilih Admin lewat Picker (aplikasi jadi boleh memakainya).
    if (u.pathname === '/drive/folder-luar') {
      const id = 'luar' + (++nomorFolder) + 'XXXXXXXXXX';
      folder.push({ id, name: u.searchParams.get('nama') || 'Luar', parents: [], luar: true });
      return kirim(200, { id });
    }
    if (u.pathname === '/drive/hapus-folder') { const id = u.searchParams.get('id'); folder = folder.filter(f => f.id !== id); return kirim(200, {}); }
    if (u.pathname === '/drive/keadaan') return kirim(200, { folder, file: file.map(({ data, ...f }) => ({ ...f, ukuran: data.length })), ukuranThumb });
    r = u.pathname.match(/^\/drive\/hapus\/(.+)$/);
    if (r) { file = file.filter(f => f.id !== r[1]); return kirim(200, {}); }
    if (u.pathname === '/kotak') return kirim(200, kotak);
    if (u.pathname === '/reset') { kotak = []; return kirim(200, {}); }
    if (u.pathname === '/mode') {
      if (u.searchParams.has('gagal')) gagal = u.searchParams.get('gagal') === '1';
      if (u.searchParams.has('drive_gagal')) driveGagal = u.searchParams.get('drive_gagal') === '1';
      if (u.searchParams.has('tanpa_thumb')) tanpaThumb = u.searchParams.get('tanpa_thumb') === '1';
      return kirim(200, { gagal, driveGagal, tanpaThumb });
    }
    kirim(404, {});
  });
}).listen(8791, () => console.log('tiruan google siap'));
