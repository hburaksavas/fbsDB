# fbsDB Uygulama Planı

Bu dosya tek çalışma planıdır. Doğrulanıp biten maddeler çıkarılır; açık maddelerin tümü ilk sürüm kapsamındadır.

## Öncelik sırası

1. Regional defaults davranışını Windows üzerinde değişen Windows bölge ayarlarıyla doğrula.
2. Settings kaynak/kapsam görünümünü tamamla.
3. B3 sorgu zaman aşımını gerçek Oracle bağlantısıyla doğrula.
4. Results özelliklerini Windows/WebView2’de kabul et.

## C1 — Regional defaults

- [ ] Windows bölgesi değiştiğinde yeni Results kümelerinin tarih/saat, sayı biçimi, metin sıralama/filtreleme yereli ve CSV ayıracı otomatik güncellenir; mevcut kümeler ve açık kullanıcı/çalışma alanı tercihleri değişmeden kalır.
- [ ] Desteklenmeyen bölge etiketleri Windows’tan algılanıp Intl tarafından desteklendiğinde English (US) varsayılanına düşmek yerine aynen kullanılır.

**Kabul:** En az bir ondalık virgüllü ve bir ondalık noktalı Windows bölgesiyle yeni sonuç varsayılanları kontrol edilir. Var olan sonuç ayarları ve açık kullanıcı/çalışma alanı tercihleri korunur. UI dili sabit English kalır; dil çevirisi kapsam dışıdır.

## C1 — Settings görünürlüğü

- [ ] Her ayarın etkin değeri, kaynağı (ürün/sistem bölgesi/kullanıcı/workspace/profil/geçerli sonuç), uygulama zamanı ve kullanılabilir kapsama göre sıfırlaması alan bazında görünür olur.

## B3 — Sorgu zaman aşımı

- [ ] Sorgu zaman aşımı ve kullanıcı iptalini gerçek Windows/WebView2 + Oracle bağlantısıyla doğrula.

**Kabul:** Süre dolunca komut durur ve zaman aşımı açıkça bildirilir; kullanıcı iptali farklı bildirilir; işlem/transaction durumu kaybolmaz.

## Results — Masaüstü kabul doğrulaması

- [ ] Results akışlarını gerçek Windows/WebView2 arayüzünde doğrula: transpose seçim/kopyalama/klavye/sağ tık; kolon hizası; MERGE `.sql` taslağı ve binary uyarısı; uçtan uca/DB süresi ile JSON bayt tahmini; JSONPath destek sınırları; export ve çizim.

**Kabul:** Gerçek masaüstünde görünen davranışlar ve varsa düzeltmeler kaydedilir. DOM/build başarısı tek başına kabul sayılmaz. Oracle gerektiren senaryolar gerçek bağlantıda doğrulanır.

## Kapsam dışı

Türkçe arayüz çevirisi, sonuç maskeleme, hücre/satır notları, Results görünüm Undo/Redo geçmişi ve sonuç karşılaştırma. Bunlar kapsam dışıdır; yeniden plana eklenmemelidir.
