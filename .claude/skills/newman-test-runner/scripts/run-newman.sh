#!/bin/bash
# run-newman.sh — Newman ile Postman collection çalıştır
# Usage: bash run-newman.sh <COLLECTION_UID> [ENV_UID] [API_KEY] [FOLDER]
# Çıktı: /tmp/newman-results.json + exit code (0=pass, 1=fail)

COLLECTION_UID="$1"
ENV_UID="$2"
API_KEY="$3"
FOLDER="$4"
RESULTS_FILE="/tmp/newman-results.json"

# Temizlik — önceki sonuçları sil
rm -f "$RESULTS_FILE"

# API key kontrolü
if [ -z "$API_KEY" ]; then
  API_KEY="$POSTMAN_API_KEY"
fi

if [ -z "$API_KEY" ]; then
  echo "ERROR: POSTMAN_API_KEY bulunamadı"
  exit 2
fi

if [ -z "$COLLECTION_UID" ]; then
  echo "ERROR: Collection UID gerekli"
  exit 2
fi

# Newman kontrolü
NEWMAN_CMD="newman"
if ! command -v newman &> /dev/null; then
  if command -v npx &> /dev/null; then
    NEWMAN_CMD="npx newman"
  else
    echo "ERROR: Newman kurulu değil. Çalıştır: npm install -g newman"
    exit 2
  fi
fi

# Collection URL
COLLECTION_URL="https://api.getpostman.com/collections/${COLLECTION_UID}?apikey=${API_KEY}"

# Newman komutunu oluştur
CMD="$NEWMAN_CMD run \"$COLLECTION_URL\""

# Environment varsa ekle
if [ -n "$ENV_UID" ]; then
  ENV_URL="https://api.getpostman.com/environments/${ENV_UID}?apikey=${API_KEY}"
  CMD="$CMD --environment \"$ENV_URL\""
else
  CMD="$CMD --env-var \"base_url=http://localhost:3000\""
fi

# Folder varsa ekle
if [ -n "$FOLDER" ]; then
  CMD="$CMD --folder \"$FOLDER\""
fi

# Sabit flag'ler
CMD="$CMD --reporters cli,json"
CMD="$CMD --reporter-json-export $RESULTS_FILE"
CMD="$CMD --color off"
CMD="$CMD --disable-unicode"
CMD="$CMD --timeout-request 10000"
CMD="$CMD --timeout 300000"

# Çalıştır
eval $CMD 2>&1

EXIT_CODE=$?

# Sonuç dosyası kontrol
if [ -f "$RESULTS_FILE" ]; then
  echo ""
  echo "NEWMAN_RESULTS_EXPORTED: $RESULTS_FILE"
else
  echo "WARNING: JSON sonuç dosyası oluşturulamadı"
fi

exit $EXIT_CODE