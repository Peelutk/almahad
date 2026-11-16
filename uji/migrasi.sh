#!/bin/bash
# Uji migrasi: buat DB berisi data dengan kode commit LAMA (argumen 1, mis. HEAD), lalu jalankan kode SEKARANG
# pada salinannya dan bandingkan isinya. Pakai: bash uji/migrasi.sh <commit-lama>
cd "$(dirname "$0")/.."
LAMA=${1:-HEAD}
U=.wrangler/uji-migrasi
W=$(mktemp -d)/almahad-lama
rm -rf "$U"; mkdir -p "$U/lama"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.wrangler-almahad}"
git worktree add -q --detach "$W" "$LAMA" && cp .dev.vars "$W/"
tunggu() { for i in $(seq 1 120); do grep -q "Ready on" "$1" && return; sleep 1; done; echo "server tidak siap: $1"; }

# 1) Kode lama + data dari uji redaksi + satu sesi yang kuncinya disimpan
(cd "$W" && npx wrangler dev --port 8799 --inspector-port 9339 --persist-to "$OLDPWD/$U/lama" > "$OLDPWD/$U/lama.log" 2>&1 &)
tunggu "$U/lama.log"
B=http://localhost:8799 node uji/redaksi.mjs | tail -1
curl -s -D - -o /dev/null "http://localhost:8799/api/uji/masuk?email=editor1@daarululuumlido.com" | grep -io 'am_sesi=[^;]*' > "$U/kuki.txt"
powershell -NoProfile -Command "Get-CimInstance Win32_Process | ? { \$_.CommandLine -match 'wrangler.*dev --port 8799' } | % { Get-CimInstance Win32_Process -Filter \"ParentProcessId=\$(\$_.ProcessId)\" | % { Stop-Process -Id \$_.ProcessId -Force }; Stop-Process -Id \$_.ProcessId -Force }" 2>/dev/null
sleep 2
cp -r "$U/lama" "$U/salin"
F=$(ls "$U"/salin/v3/d1/miniflare-D1DatabaseObject/*.sqlite | grep -v metadata | head -1)
hitung() { node -e "
const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});const q=s=>db.prepare(s).get();
console.log(JSON.stringify({versi:q('select group_concat(versi) v from _migrasi').v,anggota:q('select count(*) n from anggota').n,peran:q('select count(*) n from anggota_peran').n,sesi:q('select count(*) n from sesi').n,naskah:q('select count(*) n from naskah').n,riwayat:q('select count(*) n from naskah_riwayat').n,tugas:q('select count(*) n from tugas').n,fk:db.prepare('pragma foreign_key_check').all().length}))" "$1"; }
echo "SEBELUM: $(hitung "$F")"

# 2) Kode sekarang pada salinan
npx wrangler dev --port 8799 --inspector-port 9339 --persist-to "$U/salin" > "$U/baru.log" 2>&1 &
tunggu "$U/baru.log"
K=$(cat "$U/kuki.txt")
echo "sesi lama: $(curl -s -H "cookie: $K" http://localhost:8799/api/saya | head -c 160)"
KA=$(curl -s -D - -o /dev/null "http://localhost:8799/api/uji/masuk?email=216326@daarululuumlido.com" | grep -io 'am_sesi=[^;]*')
echo "anggota: $(curl -s -H "cookie: $KA" http://localhost:8799/api/anggota | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log(a.map(x=>x.nama+'['+x.peran+']'+(x.email?'':'(tanpa email)')).join(' | '))})")"
echo "tambah NIS: $(curl -s -X POST -H "cookie: $KA" -H 'x-almahad: 1' -H 'content-type: application/json' -d '{"nis":"5555","nama":"Baru NIS","peran":["reporter"]}' http://localhost:8799/api/anggota)"
echo "masuk NIS: $(curl -s -X POST -H 'x-almahad: 1' -H 'content-type: application/json' -d '{"nis":"5555","sandi":"5555"}' http://localhost:8799/api/masuk)"
echo "naskah lama: $(curl -s -H "cookie: $KA" http://localhost:8799/api/naskah/1 | head -c 100)"
echo "SESUDAH: $(hitung "$F")"
git worktree remove --force "$W"
echo "(Matikan server port 8799 setelah selesai.)"
