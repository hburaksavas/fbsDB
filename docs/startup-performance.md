# Açılış performansı — 31 Ekim 2026

Üretim derlemeleri, Windows üzerinde headless Microsoft Edge ve yerel Vite preview ile karşılaştırıldı. Her sürüm için beş ayrı tarayıcı bağlamı açıldı. Oracle bağlantısı kullanılmadı; Monaco dış kaynaktan yüklendi. Yerel HTTP ve makine/işletim sistemi önbellekleri nedeniyle bu sonuçlar paketli WebView2 açılış süresi olarak yorumlanmamalıdır.

| Ölçüm | Önce | Sonra |
| --- | ---: | ---: |
| Ana JavaScript paketi | 1.082,79 KB | 651,17 KB |
| Ana paket ve statik React bağımlılığı | 1.082,79 KB | 845,00 KB |
| Yukarıdaki dosyalar, gzip | 293,14 KB | 249,81 KB |
| Arayüzün DOM'a eklenmesi, medyan | 300,5 ms | 305,0 ms |
| Monaco editör DOM'u, medyan | 1.187,9 ms | 1.194,1 ms |

İlk statik JavaScript yükü yaklaşık %22, gzip boyutu yaklaşık %15 azaldı. Her iki sürümde ayrıca yaklaşık 15,14 KB Monaco React sarmalayıcısı yükleniyor. CSS 304,43 KB olarak kaldı. Worker yaklaşık 210 KB ve editör açıldığında yükleniyor; ana paket boyutuna dahil değil.

Bu beş örnekli yerel ölçümde açılış süresinde iyileşme görülmedi. Süre farkı yaklaşık %1 düzeyindedir. Boyut azalması, daha yavaş ağlarda veya WebView2'de aynı oranda hızlanma sağlayacağı anlamına gelmez. Ana paket hâlâ 500 KB üzerinde olduğu için Vite boyut uyarısı sürüyor.

Ayarlar, mini araçlar, Explain Plan, nesne inceleyici ve tanımları, çalışma alanı yönetimi ve çeşitli diyaloglar ayrı React.lazy/Suspense sınırlarına taşındı. Tam Oracle sözlüğü ve sağ tık sembol çözümlemesi de ihtiyaç olduğunda yükleniyor. React ortak paketi ayrı dosyada tutuluyor. Tarayıcı kontrolünde ayarlar/mini araçlar/sözlük dosyalarının ilk açılışta istenmediği ve ilgili ekran açılınca yüklendiği doğrulandı; JavaScript hatası görülmedi.

Uygulama artık `fbsdb:startup:shell-ready` ve `fbsdb:startup:editor-ready` Performance ölçümlerini kaydediyor. Bunlar navigasyon başlangıcından React arayüzünün bağlanmasına ve Monaco onMount işleminin tamamlanmasına kadar geçen sürelerdir. Yukarıdaki karşılaştırma eski sürümde de çalışabilmesi için DOM MutationObserver kullanır; ölçüm noktaları birebir aynı değildir.

Tekrar ölçmek için üretim derlemesini preview ile çalıştırın:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4173
# Başka bir terminalde, mevcut Playwright modülünün yolunu verin:
node scripts/measure-startup.mjs <playwright/index.mjs> http://127.0.0.1:4173/ 5
```

Ham örnekler: [startup-performance-2026-10-31.json](startup-performance-2026-10-31.json). Build manifesti `dist/client/.vite/manifest.json` içindedir.

Doğrulama: 270 birim testi, bridge tür kontrolü, üretim derlemesi ve Edge üzerinde ihtiyaç halinde yüklenen ayarlar/mini araçlar kontrolü. İlk alias kolon isteğinin 60 ms'den geç gelen metadata ile ikinci tuşa gerek kalmadan tamamlanması test edildi. Gerçek Oracle sunucusuyla uçtan uca kolon gecikmesi ölçülmedi.
