# Kalan işler

Eski `docs/feature-ideas.md` kataloğundan üretilmiştir. Katalog çalışma ağacından kaldırıldı; tamamlanan maddeler ve ilerleme günlüğü için: `git show 2bbc282^:docs/feature-ideas.md`.

## Özet

- Toplam madde: **232**
- Tamamlanan: **185**
- Açık: **47** (kısmen yapılmış: 7, hiç başlanmamış: 40)

| Faz | Açık | Kısmen yapılmış | Hiç başlanmamış |
| --- | --- | --- | --- |
| R2 — Günlük kullanım ve sonuç inceleme | 5 | 1 | 4 |
| R3 — Güvenilir grid düzenleme | 6 | 5 | 1 |
| R4 — Proje ölçeği ve ileri üretkenlik | 31 | 1 | 30 |
| R5 — İleri Oracle ve genişletilebilirlik | 5 | 0 | 5 |

## Okurken

- ⚠ engel ya da uyarı notudur; alt madde kutuları (\[x\] / \[ \]) gerçek durumu gösterir.
- **Canlı Oracle durumu (2026-11-05):** `tests/OracleLiveRegression` artık grid Apply'ı gerçek Oracle'da çalıştırır: gridin kendi kodunun ürettiği deyimler, savepoint'e geri dönme, başka oturumun değişikliği, FK hatası ve ilişki sorguları, kilit zaman aşımı, otomatik commit reddi ve durdurma. **Hâlâ canlı denenmeyenler:** Commit sırasında bağlantı kopması, kullanıcı yazımı Commit öncesi denetimler, TIMESTAMP WITH TIME ZONE sütunları ve uygulamanın WebView2 üzerinden Oracle'a giden tam akışı.
- FI-044 kullanıcı kararıyla atlanmıştır.
- Bazı maddelerin uzun açıklamaları katalogda eski bir bozulma nedeniyle kısalmış olabilir.

## 1. Kısmen yapılmış maddeler

Ana özellik çalışıyor; aşağıdaki alt maddeler açık.

### R2 — Günlük kullanım ve sonuç inceleme (1)

- **FI-133** (R2) — Yerinde yeniden adlandırma: bir sekme grubunu, bağlantı görünen adını veya kayıtlı mini aracı ayrı bir pencere açmadan bulunduğu liste/başlık içinde doğrudan yeniden adlandır. F2 ya da açık bir yeniden adlandırma eylemini, kaydetmek için Enter'ı ve iptal için Escape'i destekle; girdiyi doğrula ve kaydetme hatalarını yerinde göster. Kararlı kimlikleri koru ve bağlantı etiketi değişikliğini kimlik bilgisi/yapılandırma değişikliği sayma.
  - [x] Sekme grubu yerinde yeniden adlandırma (F2/çift tıklama, Enter kaydeder, Escape iptal eder, doğrulama hatası yerinde).

  - [ ] Bağlantı görünen adı yerinde yeniden adlandırma (kimlik bilgisi/yapılandırma değişikliği sayılmadan).

  - [x] Kayıtlı mini araç yerinde yeniden adlandırma. (F2/çift tıklama, Enter kaydeder, Escape iptal eder; boş/100+ karakter/yinelenen ad ve kaydetme hatası listede yerinde gösterilir, araç kimliği değişmez.)

### R3 — Güvenilir grid düzenleme (5)

- **FI-156** (R3) — Tür farkında hücre düzenleyicileri: tarih seçiciler, genişletilmiş metin düzenleyicileri ve yapılandırılmış ilişkili kayıt seçicileri sun; NULL atamayı açık bir eylem yap.
  - [x] Düz DATE/TIMESTAMP için takvim denetimi; uzun/çok satırlı metin için çok satırlı düzenleyici (Ctrl+Enter ile hazırlar); NULL açık eylem.
  - [ ] Yapılandırılmış ilişkili kayıt seçici.
- **FI-163** (R3) — Düzenlenebilirlik açıklamaları: düzenleme kullanılamadığında hesaplanmış sütunları, belirsiz kaynak tabloları, güvenilir satır kimliği eksikliğini veya yetersiz yetkileri açıkla. Rastgele SELECT sonuçlarının güvenle güncellenebileceğini varsayma.
  - [x] Hesaplanmış/sanal sütun, birden çok kaynak tablo, kaynak tablo yok, birincil anahtar yok/eksik ve LOB-ikili sütun nedenleri gerekçesiyle gösterilir.
  - [ ] Yetersiz yetki nedeni (uygulama adımında).
- **FI-185** (R3) — Düzenlenen satırları görünür tut: yerel olarak düzenlenmiş ve artık geçerli süzgece uymayan satırları geçici olarak koru ve bu durumu açıkça etiketle.
  - [x] Süzgeç ve sıralama saklanan değerlere uygulandığı için düzenlenen satır taslak değerle süzgeçten düşmez.
  - [ ] Taslak değeri süzgece uymayan satırın açıkça etiketlenmesi.
- **FI-194** (R3) — Düzenlenebilir sütun üst verisi: üretilmiş, kimlik (identity) veya yetkisiz sütunların neden kilitli olduğunu gerçek Oracle yeteneklerine ve yetkilerine dayanarak açıkla.
  - [x] Sanal/hesaplanmış, GENERATED ALWAYS, LOB-ikili ve ifade sütunları başlıkta 🔒 ve nedeni içeren ipucuyla işaretlenir.

  - [ ] Gerçek Oracle yetkilerine (INSERT/UPDATE ayrıcalıkları) dayalı kilit nedenleri.
  - ⚠ Gerçek Oracle yetkilerini (ALL_TAB_PRIVS / oturum ayrıcalıkları) okuyan yeni bir native sorgu gerekir.
- **FI-177** (R3) — Düzeltilmiş hataları yeniden dene: onaylanmış uygulanan sonuçları koru, kullanıcıların başarısız taslakları düzeltmesine izin ver ve başarılı DML'i yeniden gönderme. Belirsiz sonuçlar yeniden denemeden önce mutabakat gerektirir; toplu işlem atomikliğini açıkça tanımla.
  - [x] Uygulanan değişiklikler korunur ve yeniden gönderilmez; başarısız/uyuşmayan/geri alınan/atlanan taslaklar düzeltilip yeniden denenebilir.
  - [ ] Belirsiz sonuç (bağlantı kopması) için mutabakat.

### R4 — Proje ölçeği ve ileri üretkenlik (1)

- **FI-015** (R4) — Güvenli silme: bir prosedürü veya parametreyi kaldırmadan önce proje başvurularını bul ve etkilenen kodu göster. Tam kapsam iddia etmek yerine analiz kapsamını ve çözülemeyen dinamik başvuruları bildir.
  - [x] Geçerli belgede çözülen başvuruları ve sınırlı çalışma alanı metin adaylarını silme öncesi incelemede göster; belirsiz kapsamı açıkla.
  - [ ] Proje çapı semantik doğrulama ve gerçek silme akışına inceleme kapısı ekle; atlanan/okunamayan dosyaları ayrı raporla.

## 2. Hiç başlanmamış maddeler

### R2 — Günlük kullanım ve sonuç inceleme (4)

- **FI-044** (R2) — Tanıma bakış (Peek Definition): geçerli kaynak konumundan ayrılmadan bir tanımı satır içi (inline) bir düzenleyicide incele ve düzenle.
  - ⚠ Monaco'nun inline "peek" eylemi bu derlemede pencere açmadı; kullanıcı kararıyla atlandı, yarım kod geri alındı.
- **FI-045** (R2) — Bağımsız editör bölmeleri: her editör grubuna kendi sekmelerini ver ve sürükle-bırak yerleşimini destekle; örneğin paket gövdesi belirtimin yanında, sonuçlar altta. Uygun yerlerde mevcut yerleşimi (docking) genişlet.
  - ⚠ Bağımsız editör grupları App.jsx'teki tek `documents`/`editorRef` modelinin derin yeniden yapılandırılmasını gerektirir.
- **FI-103** (R2) — Artımlı LOB okuma: büyük CLOB/BLOB değerlerini önce tamamını indirmek yerine Oracle'dan isteğe bağlı parçalar halinde çekerek incele. Çekilen miktarı ve mümkünse toplam boyutu uygun karakter veya bayt birimiyle göster. Bu, tamamen indirilmiş yerel bir değerin sayfalanmasından farklıdır; konumlayıcı (locator)/oturum ömrünü ve geçersiz kılma davranışını tanımla.
  - ⚠ Gerçek Oracle LOB konumlayıcısı ve oturum yaşam döngüsü gerekir; canlı veritabanı olmadan doğrulanamaz.
- **FI-108** (R2) — Ağır sütunların ertelenmiş yüklenmesi: desteklenen büyük LOB değerlerini başlangıçta dışarıda bırak ve seçilen hücreleri isteğe bağlı getir; kararlı satır kimliği ile net tutarlılık/oturum ömrü davranışı olsun.
  - ⚠ Gerçek Oracle LOB okuması ve kararlı satır kimliği gerekir; canlı veritabanı olmadan doğrulanamaz.

### R3 — Güvenilir grid düzenleme (1)

- **FI-170** (R3) — Veritabanının ürettiği değerleri geri oku: Apply sonrasında desteklenen varsayılan, identity ve tetikleyici değerlerini aynı işlem içinde al; geri okuma hatalarını DML hatalarından açıkça ayır.

### R4 — Proje ölçeği ve ileri üretkenlik (30)

- **FI-021** (R4) — DDL'den proje iskeleti: seçilen tablolar için proje adlandırma şablonlarıyla paket belirtimleri/gövdeleri, CRUD prosedürleri ve test taslakları üret; üretim, ortaya çıkan kodu çalıştırmaz.
- **FI-033** (R4) — Migrasyon tezgâhı: sürümlü şema değişiklikleri yaz, uygulanan migrasyonları ortam başına izle ve uygulama planını önizle.
- **FI-034** (R4) — Çevrimdışı geliştirme: şema üst verisini önbelleğe alarak bağlantı olmadan tamamlama, gezinme ve desteklenen statik denetimleri sağla; önbellek yaşını ve kapsamını göster.
- **FI-064** (R4) — Proje sağlık paneli: yerel değişiklikleri, derlenmesi gereken nesneleri, derleme tanılarını ve başarısız testleri ilgili eylemlere gezinmeyle birlikte tek yerde topla.
- **FI-010** (R4) — Yapısal arama: bir tabloya yazan prosedürleri, belirli bir istisnayı işleyen blokları veya belirli bir sütuna başvuran paketleri bul.
- **FI-019** (R4) — Çağrı hiyerarşisi: çağıranları ve çağrılanları çift yönlü bir ağaçta gez; çözülemeyen veya dinamik çağrıları mümkün olduğunca belirt.
- **FI-026** (R4) — Satır içi ipuçları (inlay hints): konumsal çağrı argümanlarının yanında parametre adlarını kaynak metin olarak değil, editör süslemesi olarak göster.
- **FI-035** (R4) — Bağımlılık grafiği: paket, görünüm ve tablo ilişkilerini kaynak tanımlarına gezinmeyle etkileşimli bir grafikte keşfet.
- **FI-060** (R4) — Sütun soy ağacı gezinmesi: seçili bir projeksiyonu takma adlar, CTE'ler ve alt sorgular üzerinden kaynak sütunlara kadar izle; desteklenmeyen veya belirsiz durumları göster.
- **FI-062** (R4) — Kullanım bilgili tamamlama: paket fonksiyonu tamamlama önerilerinin yanında gerçek proje çağrı örneklerini göster.
- **FI-088** (R4) — Beklenen türe göre tamamlama: DATE ve imleç (cursor) parametreleri dahil, beklenen argüman türünü kullanarak uyumlu ifadeleri ve değişkenleri sırala.
- **FI-079** (R4) — Dinamik SQL önizlemesi: birleştirilmiş SQL dizelerinin statik olarak çözülebilen kısımlarını ayrı bir panelde göster ve çözülemeyen parçaları çalıştırmadan işaretle.
- **FI-113** (R4) — İmleçteki ifadeyi açıkla: seçili bir CASE ifadesini, analitik fonksiyonu veya pencere çerçevesini küçük, açıklayıcı bir veri kümesiyle açıkla. İlgili satırları ve ortaya çıkan değerleri vurgula; uygun yerlerde bölümleme, sıralama, eşitlikler ve ROWS/RANGE farklarını göster. Örnek veriyi açıkça etiketle; kullanıcı SQL'ini örtük olarak çalıştırma ve desteklenmeyen anlamların birebir doğru olduğunu iddia etme.
- **FI-091** (R4) — Çalıştırma kuyruğu: aynı oturum meşgulken sonraki deyimleri kuyruğa al; çalıştırmadan önce yeniden sıralama/kaldırma denetimleri olsun. Gönderilen SQL'i ve bind'leri açıkça yakala; uygulamadan önce hata ve işlem davranışını tanımla.
- **FI-006** (R4) — Bütünleşik Git iş akışı: değişen dosyalar, satır farkları, hazırlama (staging) ve commit'ler; yerel kaynağı veritabanı tanımıyla karşılaştır. Uygun yerlerde mevcut çalışma alanı Git yeteneklerini genişlet.
- **FI-011** (R4) — Test Gezgini: PL/SQL testlerine göz at, bir testi veya paketi çalıştır ve başarısız bir doğrulamadan kaynak konumuna git.
- **FI-012** (R4) — Görev çalıştırıcı: derle, testleri çalıştır, sonra geçersiz nesneleri denetle gibi açık dizileri tanımla; her adım için ilerlemeyi ve çıktıyı göster.
- **FI-028** (R4) — Kişisel kod inceleme kuyruğu: kaynak konumlarına yerel inceleme notları iliştir ve bunları TODO/FIXME yorumlarıyla birlikte gezilebilir bir panelde topla.
- **FI-030** (R4) — Bağımlılık farkında derleme: kaynak değişikliklerinden etkilenen nesneleri belirle, derleme sırasını önizle ve seçilen derleme planını çalıştır.
- **FI-040** (R4) — Anlamsal fark: paket karşılaştırmalarında biçim değişikliklerini geri plana al; değişen imzaları, koşulları ve taşınan prosedürleri vurgula.
- **FI-078** (R4) — Satır içi Git blame: satır yazarlığını göster ve ilişkili commit'e ve mesajına git.
- **FI-106** (R4) — Pencereler arası sekme taşıma: SQL sekmelerini bağlantı/oturum ve sonuçlarını koruyarak başka bir pencereye ayır; oturum sahipliği açık olsun.
- **FI-140** (R4) — Yaylı paneller (spring-loaded): bir öğe üzerine sürüklendiğinde daralmış hedef paneli geçici olarak aç, geçerli bir bırakmaya izin ver ve iptalde durumu geri yükle.
- **FI-102** (R4) — Hücre notları: değerlere yerel notlar iliştir; sorgu bağlamı ve varsa kararlı satır anahtarıyla ilişkilendir. Uygulamadan önce eskimiş sonuç ve hassas veri saklama davranışını tanımla.
- **FI-225** (R4) — Kilit bekleme tercihi: grid değişiklikleri için desteklenen bekleme davranışını yapılandır ve satır başına zaman aşımı/bekleme sonuçlarını göster. Genel bir kesin kilit zaman aşımı vaat etmek yerine Oracle/sağlayıcı desteğini doğrula.
- **FI-226** (R4) — Çakışmayan değişiklikleri birleştir: eşzamanlı değişikliklerden sonra farklı sütunlardaki düzenlemeleri birleştirmeyi öner; sonraki değişikliklerin ezilmemesi için açık inceleme ve atomik yeniden denetim iste.
- **FI-181** (R4) — Hücre değerini dosyadan yükle: CLOB'lar için metin/JSON dosyalarını, BLOB'lar için ikili dosyaları uygulamadan önce boyut ve içerik önizlemeleriyle hazırla.
- **FI-196** (R4) — Doldurma tutamacı (fill handle): bir hücre köşesinden sürükleyerek değerleri kopyala veya desteklenen sayısal/tarih dizilerini yerel taslaklara üret; önizleme ve doğrulama olsun.
- **FI-205** (R4) — İlişkili kayıt ekleme: ana/alt kayıtları birlikte hazırla, yürütme sırasını göster ve desteklenen üretilmiş anahtarları aynı işlem içinde aktar.
- **FI-219** (R4) — Gridler arası satır sürükleyip kopyalama: kaynak sütunları bir hedef tabloya eşle ve bırakınca değişiklik çalıştırmak yerine INSERT taslakları hazırla.

### R5 — İleri Oracle ve genişletilebilirlik (5)

- **FI-069** (R5) — SSH bağlantı tünelleri: Oracle bağlantıları için SSH yönlendirmesini yönet; tünel durumunu ve bağlantı hata ayrıntılarını uygulama içinde göster.
  - ⚠ SSH tünelleri ayrı bir ağ bileşeni ve sağlayıcı doğrulaması gerektirir.
- **FI-007** (R5) — PL/SQL hata ayıklama: kesme noktaları, adım adım ilerleme, değişken inceleme ve çağrı yığını; Oracle izinlerine ve hata ayıklama oturumu kurulumuna bağlı.
  - ⚠ PL/SQL debug için Oracle debug ayrıcalıkları ve DBMS_DEBUG_JDWP kurulumu gerekir.
- **FI-031** (R5) — PL/SQL profilleme: kaynağı mevcut satır düzeyi yürütme süreleriyle işaretle ve pahalı bölümlere git; Oracle enstrümantasyonuna ve izinlerine bağlı.
- **FI-032** (R5) — Test kapsamı: seçilen test çerçevesi ve Oracle enstrümantasyonu kapsamı destekliyorsa yürütülen ve yürütülmeyen PL/SQL kaynak satırlarını göster.
- **FI-036** (R5) — Eklenti sistemi: ekiplerin geliştirme kurallarını bütünleştirebilmesi için özel lint kurallarını, üreteçleri ve komutları destekle.
  - ⚠ Eklenti sözleşmesi ayrı tasarlanmalı.