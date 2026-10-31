# Yük testleri

Bu paket Oracle bağlantısı gerektirmeden, uygulamanın kullandığı JavaScript işlevlerini sentetik veriyle tekrar tekrar çalıştırır. Her tekrarda sonuç doğruluğu da kontrol edilir. WinUI/WebView2 çizim süresi, ağ gecikmesi ve Oracle sunucu kapasitesi bu ölçümlerin kapsamı dışındadır.

## Çalıştırma

Depo kökünde:

```powershell
# CI ile aynı kısa kontrol; doğruluk, zaman aşımı ve süre bütçesi hataları çıkış kodu 1 üretir.
npm run test:load -- --profile smoke --enforce-budgets

# Günlük geliştirme: orta boy veri, 10 ölçümlü tekrar
npm run test:load -- --profile standard --output .artifacts/load/standard.json

# Büyük veri: 20 ölçümlü tekrar
npm run test:load -- --profile stress --enforce-budgets --output .artifacts/load/stress.json

# Tek senaryo üzerinde en az 60 saniye ve en az 10 tekrar
npm run test:load -- --profile standard --scenario result-filter-sort --duration 60 --timeout 120 --output .artifacts/load/soak.json
```

`--iterations N` profilin tekrar sayısını değiştirir. `--duration` her senaryo için asgari ölçüm süresidir; son işlem tamamlandığında durur. `--timeout` hazırlık ve ısınma dahil, her alt süreç için kesin zaman sınırıdır; `--duration` değerinden büyük olmalıdır. Varsayılanı 120 saniyedir. `--output` verilmezse `.artifacts/load/latest.json` üzerine yazılır. Karşılaştırılacak raporlara farklı adlar verin.

## Veri ve doğruluk senaryoları

| Senaryo | smoke | standard | stress | Kontrol |
| --- | ---: | ---: | ---: | --- |
| `result-filter-sort` | 1.000 satır | 50.000 satır | 200.000 satır | Türkçe arama, boşluk kırpma, sayısal sıralama, tam eşleşen satır sayısı ve kaynak indeksleri |
| `csv-export` | 1.000 satır | 50.000 satır | 200.000 satır | Başlık, NULL, Unicode, tırnak/virgül/satır sonu kaçışları, kayıt sayısı ve son kayıt |
| `schema-completion` | 1.000 nesne | 10.000 nesne | 50.000 nesne | Listenin sonundaki tablonun alias kolonları eksiksiz ve tekrarsız önerilir |
| `schema-wide-completion` | 1.000 nesne | 10.000 nesne | 50.000 nesne | Birden fazla owner, 200 kolon, JOIN ve CTE alias çözümleme; kolonlar ihtiyaç halinde yüklenmiş olarak temsil edilir |
| `sql-batch` | 200 ifade | 5.000 ifade | 20.000 ifade | Karışık SELECT/PLSQL, literal içi noktalı virgül, slash ayırıcı, bütün ifade içerikleri ve kaynak aralıkları |
| `workspace-search` | 1.000 dosya | 20.000 dosya | 100.000 dosya | Tam ağaç, seçici arama, büyük/küçük harf ve üst klasörün korunması |

Her sonuç satırı dört kolondur. Basit şema tamamlama dört kolonlu tabloları, geniş şema senaryosu yalnızca başvurulan tablolarda yüklenmiş kolonları temsil eder. İş yükü sabittir; rastgele veri, gerçek kullanıcı dosyası veya kayıtlı bağlantı kullanılmaz. Tekrar sayıları sırasıyla 3, 10 ve 20'dir. Bu senaryolar eşzamanlı Oracle kullanıcıları simüle etmez.

Büyük TNS dosyaları, gerçek katalog nesneleri ve fiziksel milyon satırlık tabloyla yapılan testler: [ölçek testi komutları ve sonuçları](large-scale-load-testing.md).

## Raporları yorumlama

Senaryolar sırayla ve ayrı Node süreçlerinde çalışır. Her biri veri hazırlığı ve doğrulamalı bir ısınma turundan sonra ölçülür. Ölçülen süre, üretim işleviyle birlikte doğruluk kontrollerini de içerir. JSON raporu şunları kaydeder:

- p50, p95 ve en uzun tekrar süresi; p95, sıralı örneklerde nearest-rank yöntemiyle hesaplanır. Küçük örnek sayılarında maksimuma eşit olabilir.
- Tekrar sayısı, toplam süre ve iş birimi/saniye. Birimler: sonuç/CSV/SQL için satır veya ifade, tamamlamada istek, çalışma alanında iki tarama için dosya sayısının iki katı.
- Isınma sonrası GC ile başlangıç heap'i, tekrar sonlarında gözlenen en yüksek heap, bitiş GC'si sonrası heap farkı ve sürecin maksimum RSS'i. Gözlenen heap gerçek anlık tepe ölçümü değildir. RSS hazırlık/ısınmayı da içerir; heap farkı tek başına bellek sızıntısı kanıtı değildir.
- Node/işletim sistemi/işlemci bilgisi, veri boyutları, seçenekler, doğruluk hataları ve zaman aşımı bilgisi.

p95 bütçesi tamamlamada 1.500 ms, diğer senaryolarda 3.000 ms'dir. Bunlar takılmaları yakalamak için başlangıç eşikleridir; arayüz yanıt süresi hedefi veya Oracle SLA'sı değildir. Bütçe aşımı her zaman raporlanır; `--enforce-budgets` verilirse çalıştırma başarısız olur. Doğruluk hatası ve zaman aşımı her durumda başarısız olur. Windows CI, smoke profilini bütçe kontrolüyle çalıştırır ve JSON'u diğer CI çıktılarıyla saklar.

Karşılaştırmaları aynı makinede, aynı Node sürümüyle ve başka yük çalıştırmadan yapın. Uzun süreli bellek incelemesinde birden fazla süreyi karşılaştırın; tek kısa çalıştırmadan sızıntı kararı vermeyin.

## Yerel doğrulama — 31 Ekim 2026

Windows x64, Node v25.8.0, Intel Core i7-12700 üzerinde standard profilinin 10 tekrarlı ölçümünde, filtre metnini her hücre için yeniden normalize etmek yerine işlem başına bir kez normalize eden düzenleme şu sonucu verdi:

| 50.000 satırda filtreleme ve sıralama | Önce | Sonra |
| --- | ---: | ---: |
| p50 | 736,8 ms | 389,9 ms |
| p95 | 837,1 ms | 588,4 ms |

p95 yaklaşık %30 azaldı. Bunlar doğruluk kontrollerini içeren yerel Node ölçümleridir; masaüstünde aynı oranda hızlanma garantisi vermez. Ham raporlar `.artifacts/load/before.json` ve `.artifacts/load/after.json` konumundadır.

Smoke, standard ve stress profillerinin beşer senaryosu bütçe kontrolüyle geçti. Ayrı bir 30 saniyelik standard `result-filter-sort` çalıştırması 73 doğrulanmış tekrar tamamladı; p95 608,8 ms, en uzun tekrar 666,0 ms oldu (`.artifacts/load/soak.json`). 279 JavaScript testi, bridge tür kontrolü ve üretim derlemesi geçti. Raporlar `.artifacts/` altında yerel çıktıdır ve Git'e eklenmez.

Aynı gün canlı Oracle ve masaüstü doğrulaması da yapıldı. İlk Oracle bağlantısı ORA-01109 ile başarısız oldu; yerel FREEPDB1, MOUNTED durumundan açıldı ve testler tekrarlandı. Kalıcı SAVE STATE ayarı değiştirilmedi. Son çalıştırmalarda:

- Oracle servis regresyonları geçti: ayrı oturumlar, gerçek Commit/Rollback, sayfalama, iptal, kuyruktaki metadata iptali, timeout ve yeniden bağlanma. Geçici test tablosu temizlendi (`.artifacts/oracle-live/current-regression.json`).
- SELECT yükünde 84 sorgu ile toplam 8,4 milyon satır doğrulandı. Sekiz oturumda 100.000 satırın tamamlanması için p95, 500 satırlık sayfalarda 653,7 ms, 5.000 satırlık sayfalarda 683,4 ms oldu. Ardından iki oturumlu 60 saniyelik test 10.293 tur tamamladı; yönetilen heap farkı −478.520 bayttı (`.artifacts/oracle-live/load.json`). Bunlar tek kolonlu sentetik DUAL sorgularıdır; gerçek iş sorgularının kapasitesini temsil etmez.
- Ayrı ayarlı masaüstü uygulamasında mevcut 12 regresyon kontrolü geçti (`.artifacts/desktop-regression/20261031-191937-f5f191aa/report.json`).
- WebView2 yük fixture'ının hazırlığında JSX derleyici ayarı ve başlangıç bekleyişi düzeltildi; aşağıdaki son çalıştırma iki veri boyutunda da beşer doğruluk turuyla geçti (`.artifacts/desktop-regression/20261031-192343-3382b3e4/report.json`).

| WebView2 işlem p95 | 50.000 satır | 200.000 satır |
| --- | ---: | ---: |
| Veri bağlama ve render bekleyişi | 31,5 ms | 31,8 ms |
| Sayısal sıralama ve render bekleyişi | 44,5 ms | 116,0 ms |
| Türkçe filtre ve render bekleyişi | 212,6 ms | 733,3 ms |
| Son satıra kaydırma | 67,4 ms | 66,9 ms |
| Bellekte CSV üretimi | 17,8 ms | 61,8 ms |

Beş örnekte p95 maksimuma eşittir. Toplam 19 long task gözlendi; en uzunu 714 ms idi. Doğruluk kontrolleri başarılı olsa da özellikle 200.000 satırda eşzamanlı filtreleme ana iş parçacığında hissedilir bekleme yaratabilir. 15–30 dakikalık çalışma, sunucu cursor sayısı takibi ve tam SQL-köprü-grid kullanıcı akışı bu çalıştırmada ölçülmedi.

## Canlı Oracle ve masaüstü için tamamlayıcı senaryolar

Canlı Oracle ve masaüstü testleri Node yük paketinden ayrı çalıştırılır:

```powershell
# Yerel Oracle profili ve kayıtlı kimlik bilgileri gerekir; yalnızca SELECT yükü.
.\.tools\dotnet\dotnet.exe run --project tests/OracleLoad/OracleLoad.csproj -c Release -- FBSDB_LOCAL .artifacts/oracle-live/load.json

# Gerçek Oracle iptal/timeout/transaction/sayfalama regresyonları.
.\.tools\dotnet\dotnet.exe run --project tests/OracleLiveRegression/OracleLiveRegression.csproj -c Release -- FBSDB_LOCAL .artifacts/oracle-live/current-regression.json

# İzole WinUI/WebView2 uygulaması içinde gerçek ResultsGrid ve üretim yardımcıları.
npm run test:desktop -- -LoadTest
# Güncel web derlemesini kullanmak için: npm run test:desktop -- -SkipBuild -LoadTest
```

`OracleLoad`, 2/4/8 bağımsız oturumda 500 ve 5.000 satırlık sayfalarla üçer tur 100.000 satır okur. Bütün değerlerin sırasını ve offset'lerini doğrular, her cursor'ı kapatır. Ardından iki oturumda 10.000 satırlık sorgu/fetch/close döngüsünü en az 60 saniye çalıştırır. Bir sorgu için iptal süresi 90 saniye, provider timeout'u 60 saniyedir. Yalnızca localhost profilleri kabul edilir; kayıtlı kimlik bilgileri değiştirilmez. Sunucu açık cursor sayısı ölçülmez; rapordaki yönetilen heap farkı uzun süreli sızıntı analizi yerine geçmez.

Masaüstü yük testi, ayrı ayarlar ve WebView2 profiliyle başlatılan uygulamada 50.000 ve 200.000 sentetik satırı beşer tur kullanır. Tam veri üzerinde sayısal sıralama ve Türkçe filtreleme, son satıra kaydırma, sanal DOM satır sayısı ve CSV doğruluğu kontrol edilir. Render ölçümü React güncellemesini ve iki animation frame bekleyişini içerir; fiziksel ekran sunum süresi değildir. İşlemler test API'siyle tetiklenir. SQL'in masaüstü köprüsünden Oracle'a gidip sonuç dönmesi, Monaco etkileşimleri, dosya indirme diyaloğu ve uçtan uca kullanıcı tıklaması gecikmesi bu fixture'ın kapsamında değildir. p95 ve long-task süreleri raporlanır; masaüstü için performans eşiği uygulanmaz.

Aşağıdaki daha uzun veya sunucu izleme gerektiren senaryolar ayrıca uygulanabilir:

| Senaryo | Uygulama ve beklenen davranış |
| --- | --- |
| Paralel sekmeler | 2, 4 ve 8 bağımsız oturumda `SELECT LEVEL AS N FROM dual CONNECT BY LEVEL <= 100000` çalıştırın. İlk sayfa/tüm sayfalar için p50/p95, hata ve toplam satır sayısını kaydedin; her oturumda 1..100000 değerleri eksiksiz olmalı. |
| Sayfalama ve cursor ömrü | 500 ve 5.000 satırlık sayfalarla aynı sonucu sonuna kadar çekin; her sayfanın offset'ini ve satırların tekilliğini kontrol edin. Sonuçları kapatıp döngüyü tekrarlayın; açık cursor/oturum ve istemci belleğinin kalıcı büyümesini inceleyin. |
| İptal ve toparlanma | Bir sekmede uzun SELECT çalışırken diğerinde `SELECT 42 FROM dual` çalıştırın. Uzun sorguyu iptal edin, iptal gecikmesini ölçün, iki oturumda tekrar sorgu çalıştırın. Bağımsız oturumun kuyrukta beklememesi ve sonradan çalışabilmesi gerekir. |
| Süreli kullanım | 15–30 dakika boyunca sorgu → sayfalama → sonuç kapatma döngüsü uygulayın. Hata oranı, p95, açık cursor/oturum ve bellek eğilimini kaydedin. |
| Masaüstü sonuç çizimi | 50 bin/200 bin yüklenmiş satırda filtre, sıralama, kaydırma, sekme değiştirme ve dışa aktarmayı WebView2 üzerinde ölçün. Node sürelerinden ayrı olarak ana iş parçacığı takılmalarını ve kullanıcı etkileşim gecikmesini kaydedin. |

Mevcut `tests/OracleLiveRegression` projesi gerçek oturumlarda sayfalama, iptal, timeout, transaction izolasyonu ve yeniden bağlanma doğruluğunu kontrol eder; bir yük üreticisi değildir. Çalıştırma komutu ve veritabanı önkoşulları README'dedir. Bu projedeki DML senaryoları benzersiz bir geçici tablo oluşturur; yukarıdaki SELECT yük senaryoları kullanıcı tablosu gerektirmez.
