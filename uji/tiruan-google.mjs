// Tiruan Google OAuth token + Gmail API untuk uji lokal (port 8791).
// Kode otorisasi = JSON base64url: { klaim, refresh_token?, scope? } atau langsung klaim id_token.
import http from 'http';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
let kotak = [], gagal = false;
const dekode = s => s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, x) => Buffer.from(x, 'base64').toString('utf8'));
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const kirim = (s, o) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
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
      if (!/^Bearer at-/.test(req.headers.authorization || '')) return kirim(401, { error: 'unauth' });
      if (gagal) return kirim(500, { error: 'backend' });
      const raw = Buffer.from(JSON.parse(body).raw, 'base64url').toString('utf8');
      const [kepala, isi] = raw.split('\r\n\r\n');
      const h = Object.fromEntries(kepala.split('\r\n').map(l => [l.slice(0, l.indexOf(':')).toLowerCase(), dekode(l.slice(l.indexOf(':') + 2))]));
      kotak.push({ to: h.to, from: h.from, subject: h.subject, html: Buffer.from(isi.replace(/\r\n/g, ''), 'base64').toString('utf8'), token: req.headers.authorization });
      return kirim(200, { id: 'm' + kotak.length });
    }
    if (u.pathname === '/kotak') return kirim(200, kotak);
    if (u.pathname === '/reset') { kotak = []; return kirim(200, {}); }
    if (u.pathname === '/mode') { gagal = u.searchParams.get('gagal') === '1'; return kirim(200, { gagal }); }
    kirim(404, {});
  });
}).listen(8791, () => console.log('tiruan google siap'));
