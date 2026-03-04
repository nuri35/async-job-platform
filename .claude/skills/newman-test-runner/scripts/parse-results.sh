#!/bin/bash
# parse-results.sh — Newman JSON sonuçlarını özet rapora çevir
# Input: /tmp/newman-results.json
# Output: Formatlanmış test raporu (stdout)

RESULTS_FILE="${1:-/tmp/newman-results.json}"

# Dosya kontrol
if [ ! -f "$RESULTS_FILE" ]; then
  echo "ERROR: Sonuç dosyası bulunamadı: $RESULTS_FILE"
  exit 1
fi

# jq kontrolü
if ! command -v jq &> /dev/null; then
  echo "WARNING: jq kurulu değil, ham JSON gösteriliyor"
  cat "$RESULTS_FILE"
  exit 0
fi

# Metrikleri çek
TOTAL_REQUESTS=$(jq '.run.stats.requests.total // 0' "$RESULTS_FILE")
FAILED_REQUESTS=$(jq '.run.stats.requests.failed // 0' "$RESULTS_FILE")
TOTAL_ASSERTIONS=$(jq '.run.stats.assertions.total // 0' "$RESULTS_FILE")
FAILED_ASSERTIONS=$(jq '.run.stats.assertions.failed // 0' "$RESULTS_FILE")
PASSED_REQUESTS=$((TOTAL_REQUESTS - FAILED_REQUESTS))

# Süre hesapla
START_TIME=$(jq '.run.timings.started // 0' "$RESULTS_FILE")
END_TIME=$(jq '.run.timings.completed // 0' "$RESULTS_FILE")
DURATION=$((END_TIME - START_TIME))

# Collection adı
COLLECTION_NAME=$(jq -r '.collection.info.name // "Unknown"' "$RESULTS_FILE")

# Başlık
echo "═══════════════════════════════════════"
echo "  TEST SONUÇLARI: $COLLECTION_NAME"
echo "═══════════════════════════════════════"
echo ""
echo "  Toplam Request:      $TOTAL_REQUESTS"
echo "  Basarisiz Request:   $FAILED_REQUESTS"
echo "  Toplam Assertion:    $TOTAL_ASSERTIONS"
echo "  Basarisiz Assertion: $FAILED_ASSERTIONS"
echo "  Toplam Sure:         ${DURATION}ms"
echo ""

# Başarılı request'ler
if [ "$PASSED_REQUESTS" -gt 0 ]; then
  echo "BASARILI ($PASSED_REQUESTS/$TOTAL_REQUESTS)"
  echo "-------------------------------------"
  
  # Her execution'ı kontrol et
  EXEC_COUNT=$(jq '.run.executions | length' "$RESULTS_FILE")
  for i in $(seq 0 $((EXEC_COUNT - 1))); do
    # Bu request'te fail var mı
    HAS_FAIL=$(jq ".run.executions[$i].assertions // [] | map(select(.error != null)) | length" "$RESULTS_FILE")
    
    if [ "$HAS_FAIL" -eq 0 ]; then
      NAME=$(jq -r ".run.executions[$i].item.name // \"Request $i\"" "$RESULTS_FILE")
      CODE=$(jq ".run.executions[$i].response.code // 0" "$RESULTS_FILE")
      TIME=$(jq ".run.executions[$i].response.responseTime // 0" "$RESULTS_FILE")
      METHOD=$(jq -r ".run.executions[$i].request.method // \"GET\"" "$RESULTS_FILE" 2>/dev/null)
      URL_PATH=$(jq -r ".run.executions[$i].request.url.path // [] | join(\"/\")" "$RESULTS_FILE" 2>/dev/null)
      
      echo "  [PASS] $NAME"
      echo "         $METHOD /$URL_PATH -> $CODE (${TIME}ms)"
      
      # Assertion'ları listele
      ASSERTION_COUNT=$(jq ".run.executions[$i].assertions // [] | length" "$RESULTS_FILE")
      if [ "$ASSERTION_COUNT" -gt 0 ]; then
        ASSERTIONS=$(jq -r ".run.executions[$i].assertions[].assertion // \"\"" "$RESULTS_FILE" 2>/dev/null | tr '\n' ', ' | sed 's/,$//')
        echo "         Assertions: $ASSERTIONS"
      fi
      echo ""
    fi
  done
fi

# Başarısız request'ler
FAILURE_COUNT=$(jq '.run.failures | length' "$RESULTS_FILE")
if [ "$FAILURE_COUNT" -gt 0 ]; then
  echo ""
  echo "BASARISIZ ($FAILURE_COUNT fail)"
  echo "-------------------------------------"
  
  for i in $(seq 0 $((FAILURE_COUNT - 1))); do
    ERROR_NAME=$(jq -r ".run.failures[$i].error.name // \"Error\"" "$RESULTS_FILE")
    ERROR_TEST=$(jq -r ".run.failures[$i].error.test // \"N/A\"" "$RESULTS_FILE")
    ERROR_MSG=$(jq -r ".run.failures[$i].error.message // \"N/A\"" "$RESULTS_FILE")
    SOURCE_NAME=$(jq -r ".run.failures[$i].source.name // \"Unknown\"" "$RESULTS_FILE")
    
    echo "  [FAIL] $SOURCE_NAME"
    echo "         $ERROR_NAME: \"$ERROR_TEST\""
    echo "         Mesaj: $ERROR_MSG"
    echo ""
  done
fi

# Özet satır
echo "═══════════════════════════════════════"
if [ "$FAILED_REQUESTS" -eq 0 ] && [ "$FAILED_ASSERTIONS" -eq 0 ]; then
  echo "  SONUC: $TOTAL_REQUESTS/$TOTAL_REQUESTS gecti | Sure: ${DURATION}ms"
else
  echo "  SONUC: $PASSED_REQUESTS/$TOTAL_REQUESTS gecti | $FAILURE_COUNT fail | Sure: ${DURATION}ms"
fi
echo "═══════════════════════════════════════"

# Exit code
if [ "$FAILED_REQUESTS" -gt 0 ] || [ "$FAILED_ASSERTIONS" -gt 0 ]; then
  exit 1
else
  exit 0
fi