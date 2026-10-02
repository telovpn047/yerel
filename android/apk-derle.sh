#!/data/data/com.termux/files/usr/bin/bash
# Yerel APK'yı Gradle'sız, doğrudan Termux'ta derler.  Kullanım: bash apk-derle.sh
set -e
cd "$(dirname "$0")"
M=app/src/main
B=build-termux
need() { command -v "$1" >/dev/null 2>&1; }

echo "• Araçlar kuruluyor..."
for p in aapt aapt2 zipalign apksigner d8 openjdk-17 zip unzip curl; do
  dpkg -s "$p" >/dev/null 2>&1 || pkg install -y "$p" >/dev/null 2>&1 || true
done
for c in aapt2 d8 javac apksigner zip; do need $c || { echo "✗ '$c' bulunamadı. Çıktıyı Claude'a gönder: pkg search $c"; exit 1; }; done
ZA=""; need zipalign && ZA=zipalign

JAR="$(find "$PREFIX" -name android.jar 2>/dev/null | sort | tail -1)"
if [ -z "$JAR" ]; then
  echo "• android.jar indiriliyor..."
  mkdir -p "$PREFIX/share/android"
  JAR="$PREFIX/share/android/android.jar"
  curl -fL --retry 3 -o "$JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-33/android.jar
fi
echo "• android.jar: $JAR"

rm -rf "$B" && mkdir -p "$B/gen" "$B/cls" "$B/dex"
# Gradle'ın eklediği package bilgisini manifest'e koy
sed 's#<manifest xmlns:android="http://schemas.android.com/apk/res/android">#<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.yerel.messenger">#' \
  "$M/AndroidManifest.xml" > "$B/AndroidManifest.xml"

echo "• Kaynaklar derleniyor (aapt2)..."
aapt2 compile --dir "$M/res" -o "$B/res.zip"
aapt2 link -o "$B/base.apk" -I "$JAR" --manifest "$B/AndroidManifest.xml" -A "$M/assets" \
  --java "$B/gen" --min-sdk-version 26 --target-sdk-version 34 --version-code 1 --version-name 1.0 \
  --auto-add-overlay "$B/res.zip"

echo "• Java derleniyor..."
javac -nowarn -source 8 -target 8 -bootclasspath "$JAR" -cp "$JAR" -d "$B/cls" -encoding UTF-8 \
  $(find "$M/java" "$B/gen" -name '*.java') 2>&1 | grep -v "^warning\|^Note\|^[0-9]* warning" || true
[ -f "$B/cls/com/yerel/messenger/MainActivity.class" ] || { echo "✗ Java derlenemedi (yukarıdaki hatayı gönder)"; exit 1; }

echo "• DEX oluşturuluyor (d8)..."
d8 --release --min-api 26 --lib "$JAR" --output "$B/dex" $(find "$B/cls" -name '*.class')

echo "• Paketleniyor ve imzalanıyor..."
( cd "$B/dex" && zip -q -j ../base.apk classes.dex )
if [ -n "$ZA" ]; then zipalign -f -p 4 "$B/base.apk" "$B/aligned.apk"; else cp "$B/base.apk" "$B/aligned.apk"; fi
apksigner sign --ks app/yerel.jks --ks-type PKCS12 --ks-pass pass:yerel123 --ks-key-alias yerel --key-pass pass:yerel123 \
  --out "$B/Yerel.apk" "$B/aligned.apk"

OUT=~/storage/downloads/Yerel.apk
[ -d ~/storage/downloads ] || termux-setup-storage
cp "$B/Yerel.apk" "$OUT" 2>/dev/null && echo "✓ Hazır: İndirilenler/Yerel.apk" || echo "✓ Hazır: $(pwd)/$B/Yerel.apk"
