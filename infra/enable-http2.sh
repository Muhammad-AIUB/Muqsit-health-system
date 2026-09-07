#!/usr/bin/env bash
# Enable HTTP/2 on every TLS server block, then test and reload.
#
# Run ON THE VPS. Safe to re-run: a listen line that already says http2 is left
# alone. Nothing is reloaded unless `nginx -t` passes, and every file it edits is
# backed up first — if anything is wrong, the restore command is printed for you.
set -uo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="/root/nginx-backup-$STAMP"

echo "== nginx version =="
nginx -v
echo

# nginx 1.25.1+ deprecates `listen ... http2` in favour of a separate `http2 on;`
# directive and warns on every reload. 1.24 (what this box runs) uses the listen
# form. Detect rather than assume — a config that only warns still works, but a
# config written for the wrong version is a trap for the next person.
VER="$(nginx -v 2>&1 | sed -E 's|.*/([0-9]+)\.([0-9]+)\.[0-9]+.*|\1 \2|')"
MAJOR="$(echo "$VER" | cut -d' ' -f1)"
MINOR="$(echo "$VER" | cut -d' ' -f2)"
USE_DIRECTIVE=0
if [ "$MAJOR" -gt 1 ] || { [ "$MAJOR" -eq 1 ] && [ "$MINOR" -ge 25 ]; }; then
  USE_DIRECTIVE=1
  echo "nginx >= 1.25 — will use the 'http2 on;' directive instead of the listen flag."
  echo
fi

# Which files carry a TLS listen line that is missing http2?
mapfile -t FILES < <(grep -rlE '^\s*listen\s+(\[::\]:)?443\s+ssl\s*;' /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null | sort -u)

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "No 'listen 443 ssl;' line without http2 found. Either it is already enabled,"
  echo "or the TLS blocks live somewhere else. Current TLS listen lines:"
  grep -rnE '^\s*listen.*443' /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true
  grep -rn 'http2' /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null || true
  exit 0
fi

mkdir -p "$BACKUP_DIR"
echo "== files to change =="
for f in "${FILES[@]}"; do
  echo "  $f"
  cp -a "$f" "$BACKUP_DIR/$(basename "$f")"
done
echo "backed up to $BACKUP_DIR"
echo

for f in "${FILES[@]}"; do
  if [ "$USE_DIRECTIVE" -eq 1 ]; then
    # Add `http2 on;` once per server block that listens on 443 ssl.
    awk '
      /^[[:space:]]*listen[[:space:]]+(\[::\]:)?443[[:space:]]+ssl[[:space:]]*;/ && !seen[FILENAME]++ {
        print; match($0, /^[[:space:]]*/); print substr($0, 1, RLENGTH) "http2 on;"; next
      } { print }
    ' "$f" > "$f.new" && mv "$f.new" "$f"
  else
    # Append http2 to the listen line itself, keeping any trailing
    # "# managed by Certbot" comment intact. Lines that already have it are
    # skipped, so re-running cannot produce "ssl http2 http2".
    sed -i -E '/http2/! s/^([[:space:]]*listen[[:space:]]+(\[::\]:)?443[[:space:]]+ssl)[[:space:]]*;/\1 http2;/' "$f"
  fi
done

echo "== changed lines =="
for f in "${FILES[@]}"; do
  echo "--- $f"
  diff -u "$BACKUP_DIR/$(basename "$f")" "$f" || true
done
echo

echo "== nginx -t =="
if nginx -t; then
  echo
  echo "== reloading =="
  if systemctl reload nginx; then
    echo "RELOAD OK"
  else
    echo "RELOAD FAILED — rolling back."
    for f in "${FILES[@]}"; do cp -a "$BACKUP_DIR/$(basename "$f")" "$f"; done
    nginx -t && systemctl reload nginx
    echo "Rolled back to the backup in $BACKUP_DIR"
    exit 1
  fi
else
  echo
  echo "CONFIG TEST FAILED — nothing was reloaded. Rolling back."
  for f in "${FILES[@]}"; do cp -a "$BACKUP_DIR/$(basename "$f")" "$f"; done
  echo "Rolled back to the backup in $BACKUP_DIR"
  exit 1
fi

echo
echo "== verify: what the API origin now negotiates =="
echo | openssl s_client -connect api.muqsithealthsystem.com:443 -alpn h2 \
  -servername api.muqsithealthsystem.com 2>/dev/null | grep -i 'ALPN' \
  || echo "(openssl check unavailable — test from your laptop instead)"
echo
echo "Backup kept at $BACKUP_DIR — restore with:  cp -a $BACKUP_DIR/* /etc/nginx/sites-available/ && nginx -t && systemctl reload nginx"
