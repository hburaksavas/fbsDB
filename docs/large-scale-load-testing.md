# Büyük TNS, şema ve veri yükleri — 31 Ekim 2026

Windows x64 ve .NET 10.0.13 üzerinde yerel Oracle test profiliyle çalıştırıldı. TNS testleri sentetik geçici dosyalar, canlı Oracle testleri benzersiz isimli fixture nesneleri kullanır. Kullanıcı tabloları ve kayıtlı kimlik bilgileri değiştirilmez.

## Çalıştırma

Depo kökünde:

```powershell
# TNS: 1.000 / 10.000 / 50.000 ana alias, her boyutta üç tekrar
.\.tools\dotnet\dotnet.exe run --project tests/ScaleLoad/ScaleLoad.csproj -c Release -- tns 50000 3 .artifacts/scale-load/tns-after.json

# Küçük, veritabanı gerektirmeyen CI kontrolü
.\.tools\dotnet\dotnet.exe run --project tests/ScaleLoad/ScaleLoad.csproj -c Release -- tns 1000 1 .artifacts/scale-load/tns-smoke.json

# Gerçek Oracle katalog ve fiziksel veri testi: FBSDB_LOCAL profili gerekir.
# 1.000 görünüm + 1 milyon satırlık tablo oluşturur, sonunda kaldırır.
.\.tools\dotnet\dotnet.exe run --project tests/ScaleLoad/ScaleLoad.csproj -c Release -- oracle 1000 3 .artifacts/scale-load/oracle.json

# 50.000 katalog nesnesi, çoklu owner, 200 kolon, JOIN ve CTE tamamlama
npm run test:load -- --profile stress --scenario schema-wide-completion --enforce-budgets --output .artifacts/scale-load/schema-completion.json
```

ScaleLoad konumsal argümanları `mod boyut tekrar rapor-yolu` sırasındadır. TNS için boyut 1.000–100.000, Oracle için 1.000–5.000, tekrar 1–20 olabilir. Oracle boyutu 1.000'den büyükse önce 1.000, ardından istenen görünüm sayısı ölçülür. Milyon satırlık tablo her Oracle çalıştırmasında oluşturulur. Test profili localhost üzerinde olmalı, SYS/SYSTEM kullanmamalı ve CREATE TABLE/VIEW yetkisine sahip olmalıdır. Çalıştırma kesilirse benzersiz `FBSCALE_<rastgele>_...` nesneleri için raporu ve kataloğu kontrol edin; normal hata akışında cleanup denenir, cleanup hataları raporu başarısız yapar.

## TNS sonucu ve yapılan düzenleme

TNS fixture'ında çok satırlı iki host içeren descriptor, Türkçe yorum, çoklu alias, SID ve SERVICE_NAME, iki farklı dosyada aynı alias'ın farklı harflerle yazımı bulunur. Ana alias sayısının %1'i kadar ek alias, %10'u kadar ikinci dosya kaydı eklenir. Bütün kayıt sayıları, duplicate işaretleri, son alias ve kayıtlı profillerin doğru kaynak dosyaya bağlanması kontrol edilir. Bulunamayan alias'ın profili `Available=false` olarak korunur; mevcut ayar dosyasının değişmediği doğrulanır.

`GetAliasesAsync`, her yeni alias için bütün eski kayıtları tarıyordu. `GetProfilesAsync` de her kayıtlı profil için alias listesini yeniden tarıyordu. İki yol da alias/kaynak indeksleriyle değiştirildi. Kaynak dosyaya göre ayrım, harf duyarsız eşleştirme ve aynı kaynakta ilk kaydın seçilmesi korundu. Büyük listelerde iptal kontrolü eklendi.

| 10.000 ana alias, toplam 2.212.090 bayt | Önce: tek ölçüm | Sonra: üç ölçümün en yükseği |
| --- | ---: | ---: |
| Dosya okuma, parse, duplicate kontrolü ve sıralama | 780,2 ms | 77,2 ms |
| Okuma dahil 10.001 kayıtlı profilin çözülmesi | 5.662,9 ms | 211,9 ms |

Bu bir yerel öncesi/sonrası kontrolüdür; önceki sürümün yalnızca bir örneği alındığı için istatistiksel performans garantisi değildir. Son sürümde 50.000 ana + 500 ek + 5.000 yinelenen alias, toplam **11.104.890 bayt** işlendi: alias okuma/parse p95 **441,1 ms**, okuma dahil 50.001 profil çözümleme p95 **1.035,4 ms**. Üç örnekte nearest-rank p95 maksimuma eşittir. Ağ paylaşımı, Oracle Net bağlantısı ve masaüstü bağlantı listesinin çizimi ölçülmez.

Ham raporlar: `.artifacts/scale-load/tns-before.json`, `.artifacts/scale-load/tns-after.json`. Geçici TNS ve settings dosyaları kaldırıldı. Ölçülen heap farkı, son async işlemin tuttuğu nesneleri de içerebilir; tek başına sızıntı kararı vermek için kullanılmamalıdır.

## Büyük katalog ve geniş kolon tamamlama

Sentetik katalogda **100 owner altında 50.000 tablo kimliği**, başvurulan tabloda **200 kolon** kullanıldı. Kolon metadata'sı yalnızca başvurulan tablolarda vardır; 50.000 × 200 kolonun tamamı belleğe yüklenmez. JOIN içindeki alias ve CTE üzerinden yıldız projeksiyonu çözülür; 200 kolonun eksiksiz/tekrarsız olduğu ve diğer tablonun kolonunun sızmadığı kontrol edilir.

20 ölçümlü tekrarda her tur iki tamamlama isteği içerdi: p95 **26,1 ms**, en uzun tur **28,7 ms**. Rapor: `.artifacts/scale-load/schema-completion.json`. Bu üretim JavaScript tamamlama işlevinin ölçümüdür; ağ veya gerçek katalog sorgusu içermez.

Canlı katalogda **1.000 görünüm × 32 kolon** oluşturuldu. Şema keşfinde test görünümlerinin tamamının bulunduğu doğrulandı; toplam görünür nesne sayısı 1.028 idi. Ardından katalog boyunca dağıtılmış 20 görünümün kolonları ihtiyaç halinde yüklendi ve 32 kolonun tamamı doğrulandı. Her işlem üç kez çalıştırıldı:

| Canlı Oracle işlemi | İlk örnek | İkinci örnek | Üçüncü örnek |
| --- | ---: | ---: | ---: |
| Bütün erişilebilir şemanın keşfi | 3.669,7 ms | 103,4 ms | 95,7 ms |
| 20 görünümün kolon metadata'sı, toplam süre | 1.875,1 ms | 119,9 ms | 115,0 ms |

İlk ve sonraki örnekler arasında büyük fark var. Oracle/işletim sistemi/provider önbellekleri sıfırlanmadığından ilk örnek gerçek bir cold-start ölçümü sayılmaz. Şema keşfi nesne kimliklerini getirir; 32.000 kolonun tamamını tek seferde getirmez. Metadata sorgularının doğruluğu başarılıdır; ilk keşfin birkaç saniye sürebildiği ayrıca dikkate alınmalıdır.

## Fiziksel milyon satırlık tablo

DUAL'dan sayılar üretip hemen okumak yerine test için **1.000.000 fiziksel satır**, her satırda sayısal ID ve **64 ASCII karakterlik payload** içeren bir tablo oluşturuldu. İki bağımsız oturum bu tabloyu ID sırasıyla baştan sona okudu. İndeks oluşturulmadı; ORDER BY maliyeti de ölçüme dahildir.

| Aynı anda iki oturumun tam okuması | Üç turun p95/maksimumu |
| --- | ---: |
| 500 satırlık sayfalar | 8.812,8 ms |
| 10.000 satırlık sayfalar | 10.066,4 ms |

İki sayfa boyutu × üç tur × iki oturum ile **12 milyon satır** doğrulandı. Her satırın ID sırası, 64 karakterlik payload'ı, sayfa offset'i ve son satıra kadar eksiksiz gelmesi kontrol edildi. Cursor'lar kapatıldı; 1.000 görünüm ve fiziksel tablo temizlendi. Rapor: `.artifacts/scale-load/oracle.json`, `fixture-cleanup=passed`.

Bu tablo milyon satırlık istemci/sayfalama ve gerçek katalog yükünü test eder. TB ölçeğinde veritabanı, çok tablolu iş sorgusu, disk doluluğu, ağ gecikmesi, yüzlerce eşzamanlı oturum veya üretim kapasitesi hakkında sonuç vermez. Ölçümler doğruluk kontrollerini içerir. Bu native ölçek testleri süreyi raporlar; performans eşiği uygulamaz. Tamamlama senaryosunda mevcut 1.500 ms bütçesi uygulanır.

Doğrulama: 279 JavaScript testi ve 10 veritabanı bağımsız native smoke projesi geçti. Kaynak dosyaya göre alias ayrımı ve harf duyarsız duplicate kontrolü için native regresyon kontrolleri eklendi. Genel yük testleri: [yük testi rehberi](load-testing.md).
