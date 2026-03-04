#!/bin/bash
# check-health.sh — Backend ayakta mı kontrol et
# Çıktı: UP veya DOWN + detay

BASE_URL="${1:-http://localhost:3000}"
TIMEOUT=5

# Health endpoint dene
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$BASE_URL/health" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
  echo "UP"
  exit 0
fi

# Health endpoint yoksa root dene
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout $TIMEOUT "$BASE_URL/" 2>/dev/null)

if [ "$HTTP_CODE" != "000" ]; then
  echo "UP"
  exit 0
fi

# Port açık mı kontrol et
if command -v nc &> /dev/null; then
  HOST=$(echo "$BASE_URL" | sed 's|http://||' | cut -d: -f1)
  PORT=$(echo "$BASE_URL" | sed 's|http://||' | cut -d: -f2 | cut -d/ -f1)
  PORT="${PORT:-3000}"
  
  nc -z -w $TIMEOUT "$HOST" "$PORT" 2>/dev/null
  if [ $? -eq 0 ]; then
    echo "UP_NO_HEALTH"
    exit 0
  fi
fi

echo "DOWN"
exit 1