const protectedPatterns = [
  /\.env$/,
  /\.env\..+$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.git\//,
  /\.git$/,
  /node_modules\//,
];

// stdin'den hook verisini oku
let input = '';
process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Dosya yolunu al (Write ve Edit tool'ları farklı field kullanır)
    const filePath =
      data.tool_input?.file_path ||
      data.tool_input?.path ||
      data.tool_input?.command ||
      '';

    // Korunan dosyalarla eşleşiyor mu?
    const blocked = protectedPatterns.find((pattern) => pattern.test(filePath));

    if (blocked) {
      // stderr'e neden engellendiğini yaz (Claude bunu görür)
      process.stderr.write(
        `BLOCKED: "${filePath}" korunuyor. Bu dosyayi degistiremezsin.`,
      );
      // Exit 2 = engelle
      process.exit(2);
    }

    // Exit 0 = izin ver
    process.exit(0);
  } catch {
    // JSON parse hatası — izin ver, hook'un kendisi soruna neden olmasın
    process.exit(0);
  }
});
