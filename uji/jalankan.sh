#!/bin/bash
# Menjalankan semua uji API Al-Ma'had di database lokal BERSIH.
# Pakai: bash uji/jalankan.sh   (dari folder almahad; butuh .dev.vars berisi nilai uji, lihat uji/README.md)
cd "$(dirname "$0")/.."
U=.wrangler/uji
rm -rf "$U"/{a,b,c,d}; mkdir -p "$U"/{a,b,c,d}
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.wrangler-almahad}"
node uji/tiruan-google.mjs > "$U/tiruan.log" 2>&1 & P1=$!
npx wrangler dev --port 8795 --inspector-port 9335 --persist-to "$U/a" > "$U/a.log" 2>&1 & P2=$!
npx wrangler dev --port 8796 --inspector-port 9336 --persist-to "$U/b" > "$U/b.log" 2>&1 & P3=$!
npx wrangler dev --port 8797 --inspector-port 9337 --persist-to "$U/d" > "$U/d.log" 2>&1 & P4=$!
npx wrangler dev --port 8798 --inspector-port 9338 --test-scheduled --persist-to "$U/c" > "$U/c.log" 2>&1 & P5=$!
for i in $(seq 1 180); do
  grep -q "Ready on" "$U/a.log" && grep -q "Ready on" "$U/b.log" && grep -q "Ready on" "$U/c.log" && grep -q "Ready on" "$U/d.log" && break
  sleep 1
done
echo "== Dasar";   B=http://localhost:8795 node uji/dasar.mjs   | grep -E "GAGAL|Lulus"
echo "== Google";  B=http://localhost:8795 node uji/google.mjs  2>/dev/null | grep -E "GAGAL|Lulus"
echo "== Redaksi"; B=http://localhost:8796 node uji/redaksi.mjs | grep -E "GAGAL|Lulus"
echo "== NIS";     B=http://localhost:8797 node uji/nis.mjs     | grep -E "GAGAL|Lulus"
echo "== Email";   B=http://localhost:8798 node uji/email.mjs   | grep -E "GAGAL|Lulus"
echo "(Matikan server: proses wrangler/workerd di port 8795–8798 dan node tiruan di 8791.)"
