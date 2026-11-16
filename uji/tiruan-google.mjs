// Tiruan Google OAuth token + Gmail API + Drive API untuk uji lokal (port 8791).
// Kode otorisasi = JSON base64url: { klaim, refresh_token?, scope? } atau langsung klaim id_token.
import http from 'http';
import crypto from 'crypto';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
let kotak = [], gagal = false;
// Drive tiruan
let nomorFile = 0, folder = [], file = [], sesi = [], driveGagal = false, tanpaThumb = false, ukuranThumb = [];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const dekode = s => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, x) => Buffer.from(x, 'base64').toString('utf8'));
const DASAR = 'http://127.0.0.1:8791';
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
      if (m.mimeType !== 'application/vnd.google-apps.folder') return kirim(400, { error: 'bukan folder' });
      const id = 'folder' + (folder.length + 1) + 'XXXXXXXX';
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
    let r = u.pathname.match(/^\/sesi\/(\d+)$/);
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
