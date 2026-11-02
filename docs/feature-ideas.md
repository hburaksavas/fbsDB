# fbsDB özellik roadmap'i

Güncelleme: 2026-11-01

Amaç: fbsDB'yi Oracle SQL çalışma alanından proje ve paket odaklı bir IDE'ye ilerletmek; sonuç inceleme ve veri düzenleme akışlarını aynı ürün yolunda geliştirmek.

Bu dosya, daha önce kaydedilmiş **231 önerinin tamamını** 10 konu grubunda toplar. Fazlar değer, teknik bağımlılıklar ve veri tutarlılığı ihtiyaçlarına göre önerilen sıradır; onaylanmış öncelik, teslim tarihi veya uygulama taahhüdü değildir. Uygulama durumu aşağıdaki ilerleme kaydında tutulur; katalogdaki faz etiketleri tamamlanma anlamına gelmez. Önceki kayıtlarda reddedilen veya seçilmeyen fikirler kapsama eklenmemiştir.

Özgün özellik adları ve açıklamaları kapsamı korumak için İngilizce bırakılmıştır. `FI-001`–`FI-231` kimlikleri önceki dosyadaki madde sırasından gelir ve izleme için sabittir. Her fikir aşağıdaki katalogda yalnızca bir kez yer alır; yanındaki `R`etiketi önerilen teslim fazını gösterir. Aynı faz içindeki liste sırası öncelik değildir.

## 1. Teslim fazları

| Faz | Odak ve teslim edilecek akış | Bağımlılık | Tamamlanma ölçütü |
| --- | --- | --- | --- |
| R1 — IDE çekirdeği | Proje/paket dosyaları, tanıma gitme, spec/body geçişi, derleme hatasına gitme ve kayıtlı parametrelerle tekrar çalıştırma. Kaynak/DB farkı ve bağlantı bağlamı görünür olur. | Mevcut workspace, Monaco, Oracle metadata ve sekme oturumu altyapısı. Önce proje/nesne kimliği, kaynak sürümü ve hata konumu eşlemesi tanımlanır. | Bir paket açılır, çağrılan tanıma gidilir, düzenlenir, derlenir, hata satırı düzeltilir ve kayıtlı çağrı açıkça çalıştırılır. Yayınlama öncesi sunucu değişikliği gösterilir; sonuçların hangi kaynak sürümüne ait olduğu anlaşılır. |
| R2 — Günlük kullanım ve sonuç inceleme | Kod bilgisi, editör kısayolları, çalışma alanı ergonomisi, bind arayüzü, sonuç görüntüleyicileri ve büyük sonuçları kontrollü inceleme/dışa aktarma. | Semantik özellikler R1 nesne/konum modeline; sonuç özellikleri cursor, tip ve oturum yaşam döngüsüne dayanır. Bağımsız arayüz işleri R1 ile birlikte ilerleyebilir. | Kullanıcı bind girip sorguyu çalıştırır, sonuç kaynağına döner, JSON/XML/LOB değerlerini inceler ve büyük çıktıyı sınırsız bellek kullanmadan dosyaya aktarır. Yerel filtre/kopya kapsamı ve iptal davranışı görünürdür. |
| R3 — Güvenilir grid düzenleme | Salt okunur sonuçtan açık düzenleme moduna geçiş; yerel taslaklar, değişiklik incelemesi, Apply, Commit/Rollback, çakışma ve hata kurtarma. | R2 tip/sonuç kimliği ve R1 fiziksel oturum bağlamı. Yazma açılmadan önce güvenilir satır kimliği, concurrency kontrolü ve batch hata politikası belirlenir. | Düzenle/ekle/sil taslakları incelenir ve açıkça uygulanır. Başarılı, başarısız ve belirsiz sonuçlar ayrılır; yanlış etkilenen satır sayısı ele alınır. Commit kapsamı ve bağlantı değiştirme/kapatma kararları açıktır; taslak silme ile Rollback karışmaz. |
| R4 — Proje ölçeği ve ileri üretkenlik | Refactoring, Git/test/task akışı, bağımlılık analizi, migration/offline çalışma, toplu veri girişi ve gelişmiş transaction yardımcıları. | Kod dönüşümleri için yeterli semantik analiz; testler için seçilmiş framework; toplu grid işleri için R3 taslak ve kurtarma modeli gerekir. | Kod dönüşümleri desteklenen kapsam ve önizlemeyle sunulur; derle/test akışı kaynak konumlarına bağlanır. Toplu veri işlemleri önce doğrulanmış taslak oluşturur; kısmi hata ve tekrar deneme başarılı DML'yi yinelemez. |
| R5 — İleri Oracle ve genişletilebilirlik | PL/SQL debugging, profiling, coverage, SSH tünelleri ve extension sistemi. | Oracle/provider sürümü, yetkiler, debug/instrumentation kurulumu ve extension sözleşmesi ayrı ayrı doğrulanır. SSH işi diğer R5 işlerinden bağımsız değerlendirilebilir. | Desteklenen ortamlar ve kurulum gereksinimleri belgelenir; özellikler uygun yetkilerle doğrulanır, desteklenmeyen durumlar anlaşılır biçimde gösterilir. |

### İlk uygulanabilir dilim: R1

1. `FI-001`, `FI-114`, `FI-075`, `FI-115`: proje ve Oracle dosya türlerini, paket eşlemesini ve bağımsız dosya/kayıt durumlarını kur.
2. `FI-002`, `FI-047`, `FI-029`: sembol konumlarını, dosya yapısını ve imzaları aynı kaynak/metadata modelinden sun.
3. `FI-003`, `FI-009`, `FI-042`: derleme, sunucu farkı ve hata konumuna dönüşü birleştir; paket yayınlamadan önce kaynak sürümünü karşılaştır.
4. `FI-004`, `FI-090`: tipli parametrelerle çağrı oluşturma ve kayıtlı çağrıyı açıkça tekrar çalıştırmayı tamamla.
5. `FI-055`, `FI-107`, `FI-153`, `FI-123`: bağlantı/ortam, transaction durumu ve sonuçların çalıştırılan kaynakla ilişkisini görünür kıl.

Bu sıralama ilk uçtan uca akışı tanımlar; sonraki fazların tümünü beklemeden kullanıcı değerlendirmesine sunulabilir.

### Uygulama ilerlemesi — 2026-11-01

- **FI-167 / FI-183 / FI-198 / FI-166 / FI-204 · Tamamlandı (toplu giriş):** (1) "Bulk edit…" seçili hücreleri tek seferde değiştirir: değere ayarla, NULL yap, metinde bul-değiştir (düz metin, büyük/küçük harf seçenekli), sayı ekle, çarp, yüzde artır. Önce önizleme gösterilir ("N hücre değişir, M atlandı", eski → yeni, atlananların nedeni: NULL, sayı değil, kilitli sütun); hiçbir şey hazırlanmaz, "Stage" tek bir Geri Al adımıdır. (2) "Paste…" / Ctrl+V panodaki tablo (sekmeyle ayrılmış, tırnaklı hücreler ve Windows satır sonları destekli) verisini önizler: ilk satır başlık olarak atlanabilir; etkin hücreden itibaren konum sırasıyla doldurur ya da tek anahtar sütunu varsa ilk yapıştırılan sütunu anahtar sayıp satırları anahtarla eşler (yüklü olmayan anahtar atlananlar arasında). Boş hücre NULL olur, grid dışına taşan sütun/satırlar bildirilir. Birim (652) ve WebView2 testi geçti.

- **FI-179 / FI-229 / FI-197 / FI-164 · Tamamlandı (düzenleme kolaylıkları):** (1) Bekleyen değişiklikler çekmecesindeki "Copy as script", deyimleri ve bind değerlerini (yorum olarak, NULL açıkça) gözden geçirilebilir bir betik olarak kopyalar; başlığı "COMMIT içermez" der. (2) Commit sonrası "Copy receipt": zaman, sekme, tablo, işlem sayıları, satır anahtarları ve eski → yeni değerler; kapsam notu yalnızca gridden gönderilenlerin listelendiğini söyler. (3) Ctrl+D etkin hücreye bir üst satırın görünen değerini (NULL dahil) taslak olarak kopyalar. (4) "Duplicate row" seçili satırı yeni satır taslağı yapar; anahtar, kimlik ve kilitli sütunlar veritabanına bırakılır. Birim (643) ve WebView2 testi geçti.

- **FI-193 / FI-195 · Tamamlandı (Rollback sonrası taslak, Commit sonrası doğrulama):** Gridin uyguladığı değişiklikler anahtarlarıyla birlikte kayıt altında tutulur. Rollback'ten sonra hücreler saklanan değerlere döner ve işlem satırında "Keep my edits as drafts" çıkar; seçersen geri alınan düzenlemeler/silme işaretleri yeniden düzeltilebilir taslak olur (kendiliğinden hiçbir şey yeniden uygulanmaz). Commit'ten sonra "Verify against the database" değişen satırları anahtarlarıyla (anahtar değiştiyse yeni değerle) tek bir salt okunur SELECT ile yeniden okur (en çok 50 satır) ve beklenen değerlerle karşılaştırır: eşleşti / farklı / satır yok; silinenler için anahtarın kalktığına bakar. Fark, "başka bir oturum sonradan değiştirmiş olabilir; Commit başarısız olduğu anlamına gelmez" notuyla ayrı raporlanır. Birim (641) ve WebView2 testi geçti.

- **FI-213 / FI-220 / FI-228 / FI-223 / FI-172 / FI-222 / FI-203 · Tamamlandı (inceleme yardımcıları):** (1) Bekleyen değişiklikler listesindeki önerilen yeni değer doğrudan düzenlenir (Enter/odak kaybı taslağı günceller). (2) Hücre/başlık ipuçları ve liste yazılan çözümlenmiş `şema.tablo.sütun`'u gösterir ("Writes to APP.T.COL"; anahtar sütunda "Key column …"). (3) Apply onayı etkiyi tablo ve işlem türüne göre gruplar ("APP"."REVIEW": 1 update, 1 delete) ve dışarıda bırakılan taslak sayısını söyler. (4) "Deletions only" yalnızca silinmeye işaretli satırları ve tanımlayıcı anahtar sütunları gösterir. (5) Her bekleyen değişikliğin onay kutusu Apply'a yalnızca seçilenleri gönderir; seçilmeyenler taslak kalır. (6) INSERT ve DELETE taslakları UPDATE'e karıştırılmadan ayrı işlemler olarak tutulur ve sunulur. (7) Enter ile hücre hazırlama + ayrı açık Apply eylemi tamamlandı. Birim (637) ve WebView2 testi geçti.

- **FI-230 / FI-178 · Tamamlandı (kontrollü durdurma, belirsiz Commit):** Apply sürerken çekmecede "Stop after the current statement" görünür (`sql.stopApplyDml`): yeni deyim gönderilmez, çalışmakta olan biter ve sonucu bildirilir; kalanlar "gönderilmedi" olarak taslakta kalır, uygulananlar açık işlemde durur ve Commit/Rollback kararını sana bırakır — sessizce işlenmez, geri alınmaz ya da yeniden denenmez ("Stopped by you: N statement(s) were applied…"). Commit sırasında bağlantı koparsa native `transaction.state` ile "commit outcome unknown" (unconfirmed) bildirir: pencere "Oracle kaydetmiş olabilir de olmayabilir; yeniden denenmedi; yeniden bağlanıp etkilenen satırları sorgulayarak karşılaştır" der, başarı ya da başarısızlık iddia etmez; gridin işlem satırı "onaylanmadı" gösterir. Birim (636) ve WebView2 testi geçti.

- **FI-176 · Tamamlandı (kısıt rehberliği):** Apply bir kısıt adı veren hata alırsa (ORA-00001/02290/02291/02292) yeni `result.constraintInfo` (ALL_CONSTRAINTS + ALL_CONS_COLUMNS, salt okunur) ile kısıtın tanımı okunur ve hata satırının altında tek cümleyle gösterilir: CHECK için gerçek koşul ("POS_CHK requires: …"), benzersiz/birincil için sütun grubu, yabancı anahtar için eşleşmesi gereken ebeveyn. Yalnızca Oracle hata kodu değil kuralın kendisi görünür. Yerel smoke gerektirmeyen yeni native sorgu derlendi; birim (635) ve WebView2 testi geçti.

- **FI-161 · Tamamlandı (satır içi hatalar):** Apply'da Oracle'ın reddettiği deyimin hatası (ORA-12899 değer çok uzun, ORA-01400/01407 NULL yasak, ORA-00001 benzersiz, ORA-02290 CHECK, ORA-02291/02292 yabancı anahtar, ORA-01722 biçim…) okunur: hata metni sonuçtaki bir sütunu adlandırıyorsa o hücre (✖, çerçeve ve "Oracle rejected this value: …" ipucu), değilse satır işaretlenir; sonuç listesindeki "Show NAME"/"Show row" düğmesi ilgili yere götürür, hücreyi yeniden düzenlemek hatasını temizler. Deyim sonuçları ve işlem durumu (uygulandı/başarısız/geri alındı, işlenmemiş) çekmecede ve işlem satırında ayrı ayrı görünür. Birim (634) ve WebView2 testi geçti.

- **FI-231 / FI-210 · Tamamlandı (kapatma ve bağlantı değiştirme incelemesi):** Sekmeyi kapatma, bağlantıyı değiştirme ve bağlantıyı kesme artık sekmede uygulanmamış grid düzenlemesi varsa (tüm tablolar toplamı) önce "Unapplied grid edits" penceresi açar: "N yerel düzenleme Oracle'a gönderilmedi, yalnızca bu pencerede durur ve başka bağlantıya taşınamaz". Seçenekler "Keep editing" (hiçbir şey değişmez) ve "Discard the edits and continue"dir; bu, Commit/Rollback'ten ayrı bir karardır ve oturumda işlenmemiş iş varsa pencere bunu ayrıca belirtir (bu seçim onu işlemez ya da geri almaz; mevcut işlem koruması ayrıca sorar). Taslaklar kendiliğinden başka bağlantıya aktarılmaz ve hiçbir şey sessizce işlenmez. Birim (632) ve WebView2 testi geçti.

- **FI-224 / FI-187 · Tamamlandı (işlem sayacı):** Düzenleme çubuğu gridin kendi gönderdiği değişiklikleri izler: "N grid change(s) applied, not committed · open for 3 min. Other work in this session is not counted here." (süre 15 sn'de bir güncellenir; scriptler veya rutinlerin etkileri sayılmaz ve bunu söyler). Native `transaction.state` ile Commit "committed", Rollback "rolled back" olur; geri almada uygulanmış-işaretli hücreler saklanan değerlere döner. Birim (631) ve WebView2 testi geçti.

- **FI-169 / FI-160 · Tamamlandı (yenileme ve çakışma):** Sonuç yeniden çalıştırılıp ızgara yeniden kurulduğunda bile uygulanmamış taslaklar kaybolmaz: bellekte (diske yazılmaz) sekme+kaynak tablo başına saklanır ve yeni sonuç gelince her satır özgün anahtarıyla yeniden bulunup yeni konumuna taşınır; sütun düzeni değiştiyse taslaklar sessizce atılmaz, "Edits discarded" uyarısı gösterilir. Satırı artık yoksa veya saklı değer okunduktan sonra değiştiyse taslak üzerine yazılmaz; çekmecede "Conflicts" olarak listelenir ("stored value changed from … to …"), çözüm olarak "Keep my edit" ya da "Use the database value" seçilir ve çözülene dek Apply kapalıdır. Birim (629) ve WebView2 testi geçti.

- **FI-221 · Tamamlandı, FI-160 kısmen (eşzamanlılık):** Üretilen UPDATE artık yalnızca özgün anahtara değil, düzenlenen sütunların okunan değerine de bağlıdır (`WHERE "ID" = :uk1 AND "NAME" = :ok1`, özgün değer NULL ise `IS NULL`); başka bir oturum satırı değiştirmiş ya da silmişse 0 satır etkilenir, Apply durur ve çekmece bunu "başka bir oturum değiştirmiş olabilir (eşzamanlılık denetimi)" diye açıklar, hiçbir şey sessizce ezilmez. Birim (624) ve WebView2 testi geçti.

- **FI-209 / FI-190 · Tamamlandı:** (1) Hazırlanan anahtar değerleri, yüklü satırlar ve yeni satırlar arasında yinelenen birincil anahtar için denetlenir (silinen satır anahtarını serbest bırakır, NULL içeren anahtar çakışmaz, varsayılan/kimlikle üretilecek eksik anahtar bilinmeyen sayılır, bileşik anahtar tüm parçalar eşleşince çakışır); çakışma çekmecede iki satırı da adlandırır, "yalnızca yüklü satırlar karşılaştırıldı, son kural Oracle'ındır" der ve Apply'ı kapatır. (2) Birincil anahtarı olmayan tabloda "Choose the columns that identify a row" seçicisi sütun önerir; seçim yüklü satırlarda NULL'suz ve benzersiz olmalıdır (ihlal satır numaralarıyla söylenir), sonuç "tablodaki benzersizliği kanıtlamaz" diye etiketlenir, açık onay kutusu işaretlenmeden kullanılamaz ve Apply her deyimin tam bir satırı değiştirdiğini zaten doğrular. Birim (624) ve WebView2 testi geçti.

- **FI-184 · Tamamlandı, FI-194 kısmen:** Düzenleme modunda tek sütunlu anahtar otomatik sabitlenir (kapatınca geri alınır, kullanıcının kendi sabitlemesi korunur); başlıklarda anahtar sütun 🔑, kilitli sütun 🔒 ve nedeni olan ipucu gösterir (sanal/hesaplanmış, GENERATED ALWAYS, LOB-ikili, ifade/başka tablo). Yetki tabanlı nedenler henüz yok. Birim (618) ve WebView2 testi geçti.

- **FI-189 / FI-174 / FI-201 · Tamamlandı (FI-185 kısmen):** Düzenleme çubuğundaki "Changes only" yalnızca değişen (veya silinmeye işaretli) satırları ve yalnızca değişen sütunları gösterir; satırı belirleyen anahtar sütunlar ve eski/yeni değerler görünür kalır, kapatınca tam sonuç döner. Silinmeye işaretli satır üstü çizili kalır ve Revert/Undo ile iptal edilir (uygulanana dek). Taslak değerler süzgeç ve sıralamayı yeniden hesaplamaz: düzenlenen satır yerinden zıplamaz ve süzgeçten düşmez (yeniden sıralamaya gerek yoktur). Birim (618) ve WebView2 testi geçti.

- **FI-208 / FI-214 / FI-215 · Tamamlandı (doğrulama):** Hücre düzenleyicisi canlı bir sayaç gösterir: karakter, UTF-8 bayt ve sütun sınırı (sütunun uzunluk anlamına göre bayt/karakter), aşımda "too long". Hazırlanan değerler yerelde denetlenir (NOT NULL'a NULL, sayı biçimi/hassasiyet/ölçek, tarih biçimi, metin uzunluğu); geçersiz hücreler ⚠ ve noktalı çerçeveyle işaretlenir, çubuktaki "N invalid" düğmesi sıradaki geçersiz hücreye gider ve nedenini söyler, çekmece sorunları listeler ve geçersiz değer varken "Apply to Oracle…" kapalı kalır (Oracle yine son söz sahibidir). Çekmecede "Copy original" / "Copy draft" ayrı eylemlerdir. Birim (618) ve WebView2 testi geçti.

- **FI-156 · Devam (tipli düzenleyiciler):** Düz DATE/TIMESTAMP hücreleri (saat dilimi/kesirsiz) takvim (`datetime-local`) ile, 80 karakterden uzun veya çok satırlı metin çok satırlı düzenleyiciyle (Enter satır ekler, Ctrl+Enter hazırlar) düzenlenir; takvim değeri bind metnine (`YYYY-MM-DD HH:MM:SS`) çevrilir. İlişkili kayıt seçici alt maddesi açık. Birim (614) ve WebView2 testi geçti.

- **FI-155 / FI-165 / FI-200 / FI-186 · Tamamlandı (yeni satır girişi):** Düzenleme çubuğundaki "New row" bölümlü bir giriş formu açar (düzenlenebilir sütun başına alan + NULL kutusu). Yalnızca doldurulan sütunlar INSERT'e girer; boş bırakılanlar veritabanı varsayılanını kullanır ("(database default)"), bilinçli NULL ayrı durumdur ve alanı devre dışı bırakır. NOT NULL, varsayılansız ve kimliksiz sütunlar `*` ile işaretlenir ve satır başlığında "Missing required: …" sayacı gösterilir. Bekleyen çekmece yeni satırı ve `INSERT INTO … (yalnızca dolu sütunlar) VALUES (:i1…)` önizlemesini gösterir; yeni satır Remove ile kaldırılır. Birim (612) ve WebView2 testi geçti.

- **FI-158 / FI-162 / FI-192 / FI-207 · Tamamlandı (FI-177, FI-187, FI-203 kısmen):** Çekmecedeki "Apply to Oracle…" açık bir onayla (Apply'a basılana dek hiçbir şey gönderilmez) taslakları tek seferde, yeni `sql.applyDml` ile sekmenin oturumunda sırayla çalıştırır. Onay metni, Commit'in oturumdaki TÜM bekleyen işi (gride ait olmayan DML dahil) işleyeceğini ve Rollback'in hepsini atacağını söyler. Native taraf yalnızca gridin ürettiği tek INSERT/UPDATE/DELETE biçimlerine izin verir (`GridDmlGuard`: noktalı virgül, yorum, başka deyim reddedilir), auto commit açıksa hiç başlamaz, önce `SAVEPOINT` alır, her deyimde beklenen satır sayısını (1) doğrular; hata veya 0/çoklu satır etkilenmesinde durur ve politikaya göre (varsayılan: tüm toplu işi savepoint'e geri sar — oturumdaki ilgisiz önceki iş etkilenmez; alternatif: önceki başarıları işlenmemiş bırak) kurtarır. Uygulananlar taslaktan çıkıp "applied" (✓) işaretiyle işlem içinde kalır, başarısız/uyuşmayan/geri alınan/atlanan değişiklikler taslak olarak durur ve yalnızca onlar yeniden gönderilir; satır başına sonuç listelenir. Yerel smoke (11 proje, `GridDmlGuard` dahil), birim (611) ve WebView2 testi geçti.

- **R3 grid düzenleme temeli · Tamamlandı (FI-188, FI-157, FI-159, FI-168, FI-171, FI-191, FI-212; FI-155/163/203/221/165 kısmen):** Sonuç ızgarası yalnızca tek kaynak tablolu sonuçlarda "Edit rows" çubuğu sunar ve varsayılan salt okunurdur. Açık düzenleme modunda satır kimliği için yeni `result.editIdentity` (birincil anahtar sütunları) istenir; anahtar yoksa/eksikse, hesaplanmış, sanal, LOB-ikili sütun veya birden çok tablo varsa düzenleme gerekçeyle kapalı kalır. F2/Enter/çift tıklama hücreyi düzenletir (Enter yerelde hazırlar, Escape iptal eder, Tab sonraki hücreye geçer); özgün değere dönmek işareti kaldırır (gereksiz UPDATE yok); "Set NULL" boş metinden ayrı bilinçli NULL'dur; "Delete row" satırı üstü çizili işaretler. Ctrl+Z/Ctrl+Y ve düğmelerle taslak geri alma/yineleme, "Pending" çekmecesinde satır/hücre bazlı Revert ve ilgili hücreye git, ↑/↓ ile düzenlenmiş hücreler arasında gezinme (görünümde olmayan satır bildirilir) ve parametreli INSERT/UPDATE/DELETE önizlemesi (değerler hep bind; UPDATE özgün anahtar değerleriyle satırı bulur) vardır. Bu aşamada hiçbir SQL Oracle'a gönderilmez; Apply, yeni satır girişi ve eşzamanlılık denetimi sonraki maddelerdir. Birim (610+) ve WebView2 testi geçti.

- **FI-133 · Devam (mini araç):** Mini araçlar penceresindeki kayıtlı araç listesinde F2 veya çift tıklama adı yerinde düzenletir; Enter `workspace.tools.save` ile kaydeder (araç kimliği ve SQL değişmez), Escape iptal eder. Boş, 100+ karakter ve başka araçla aynı (büyük/küçük harf duyarsız) adlar reddedilir; native kaydetme hatası aynı satırda gösterilir. Düzenleme alanındaki Escape artık tüm pencereyi kapatmaz (`data-escape-local`). Bağlantı görünen adı alt maddesi açık: ad `connection.save` yapılandırmasının parçası olduğundan ayrı bir etiket deposu gerekir. Birim (598) ve WebView2 testi geçti.

- **FI-117 · Tamamlandı (kayıt seçici):** Satır içi bind alanlarındaki "Pick…" düğmesi aranabilir bir kayıt seçici açar. Seçici sorgusu kullanıcının kendi tek SELECT'idir (ilk sütun değer; yalnızca `:search` bind'i kullanılabilir, başka bind/DML/çoklu deyim reddedilir), yalnızca "Search"e basılınca ve en çok 50 satırla çalışır; yazarken veya diyalog açılırken hiçbir şey çalışmaz. Sorgu metni bind adı başına bu bilgisayarda saklanır (`fbsdb.bindLookups`, veri değil yapılandırma), arama metni her zaman bind değeri olarak gönderilir. Satıra tıklamak ilk sütunu alana yazar (Oracle tipi alanın tipi olarak korunur); NULL seçilemez, NULL onay kutusu kullanılır. Birim (597) ve WebView2 testi geçti.

- **FI-068 · Tamamlandı (hazır eşlemeler):** Ayarlar &gt; Shortcuts başına "Keymap preset" seçimi eklendi: fbsDB varsayılan, Visual Studio tarzı (Run F5, satır sil Ctrl+Shift+L, satır çoğalt Ctrl+D, satır taşı Alt+Yukarı/Aşağı) ve JetBrains tarzı (satır sil Ctrl+Shift+Delete, çoğalt Ctrl+D, taşı Alt+Shift+Yukarı/Aşağı, Replace Ctrl+R, Outline Ctrl+F12). Ön ayarlar yalnızca adlandırdığı eylemleri değiştirir, çakışma/ayrılmış tuş denetiminden geçer, Format SQL Ctrl+Shift+F'de sabit kalır; elle değiştirilen eşleme "Custom" görünür. Vim modlu düzenleme alt maddesi açık bırakıldı (maddenin "veya" koşulu hazır eşlemelerle karşılanır). Birim (593) ve WebView2 testi geçti.

- **FI-067 · Tamamlandı:** Ayarlar &gt; General &gt; Icon theme: yerleşik temalar (Default renkli çizgi, Monochrome, Letter badges) ve içe aktarılan simge paketleri. Tema; şema nesnesi (TABLE, VIEW, PACKAGE…), dosya ve klasör simgelerini, ağaçta, paletle ve ayar önizlemesinde anında değiştirir (`useSyncExternalStore` tabanlı küçük depo). Paket JSON'u (`{version:1,name,icons:{TABLE:"M…"}}`) yalnızca bilinen yuvalar için düz SVG yol verisi (M/L/C/A/Z… ve sayılar, ≤2000 karakter, ≤20 simge, ≤10 paket, ≤100 KB) kabul eder; etiket/betik/URL içeren her değer atlanır ve gerekçesi gösterilir, geçersiz paket mevcut temayı değiştirmez. Paketler bu bilgisayarda (`fbsdb.iconPacks`) saklanır, tek tıkla kaldırılır ve varsayılana dönülür. Birim (590) ve WebView2 testi geçti.

- **FI-095 · Tamamlandı:** Hücre değeri görüntüleyicisine "Coordinates" biçimi eklendi; GeoJSON (Point/MultiPoint/LineString/Feature), WKT (POINT/MULTIPOINT/LINESTRING, `SRID=…;` önekli) ve `SDO_GEOMETRY(…SDO_POINT_TYPE(x,y…))` değerleri sütun metadatasından bağımsız içerik tespitiyle otomatik seçilir, elle değiştirilebilir. Koordinatlar çevrimdışı SVG çizimiyle (ızgara, nokta/çizgi, otomatik sınır kutusu) gösterilir; kural açıkça yazılır: WGS 84 (SRID 4326), WKT/GeoJSON/SDO boylam-önce, düz "a, b" çiftlerinde sıra kullanıcı seçer (varsayılan enlem, boylam). 4326 dışı SRID ve aralık dışı değerler tahmin edilmeden gerekçeyle reddedilir. "Open in OpenStreetMap…" koordinatı dışarı göndereceğini söyleyen açık bir onay ister; onay olmadan hiçbir şey gönderilmez. Birim (586) ve WebView2 testi geçti.

- **FI-105 · Tamamlandı:** Mevcut akışlı CSV dışa aktarma (csv / csv.gz, sayfa sayfa okuma, sınırsız bellek tamponu yok, iptalde `.partial` dosyanın silinmesi, tek dışa aktarma/sekme) genişletildi: ilerleme bildirimi artık satır sayısı, dosya boyutu (B/KB/MB/GB) ve aktarım hızını (bayt/sn, satır/sn) canlı gösterir; bitişte nihai boyut ve süre raporlanır (`bytesWritten`/`elapsedMs`). xlsx biçimi akışsızdır (bellekte yazılır) ve bu kapsamın dışında belgelenmiştir. Birim (581) ve WebView2 testi geçti.

- **FI-132 / FI-141 / FI-133 (kısmen) · Tamamlandı:** Sekme sağ tık menüsünden "Add to new group" / "Group N tabs…" (Ctrl/Shift ile çoklu seçili sekmeler birlikte), "Add to “…”", "Remove from group", "Rename group", "Ungroup". Gruplar adlı, renkli (teal/amber/rose), daraltılabilir; üyeler yan yana tutulur, daraltılmış grup yalnızca etkin sekmesini gösterir, kapanan sekmeler gruptan düşer, boş grup silinir; kalıcılık `fbsdb.tabGroups`. Grup adı yerinde düzenlenir: yeni grupta otomatik, F2/çift tıklamayla; Enter kaydeder, Escape iptal eder; boş/41+ karakter/başka grupla aynı ad hata olarak aynı yerde gösterilir. Sekme başlıkları değişmedi (docs/ui-decisions.md korunur). Bağlantı adı ve mini araç yeniden adlandırma alt maddeleri açık. Birim (579) ve WebView2 testi geçti.

- **FI-121 · Tamamlandı:** Komut paletindeki "Try the selected subquery…", seçili (parantezli ya da çıplak) tek bir SELECT'i yalnızca "Run trial"a basılınca, sekmenin oturumunda ve geçici bind değerleriyle çalıştırır; en çok 20 satır pencerede tablo olarak gösterilir, sonuç ızgarasına/geçmişe gitmez. FROM/JOIN/WITH/satır-içi görünüm takma adları dışındaki nitelikli başvurular (`o.id` gibi dış sorgu başvuruları) tespit edilir ve sorgu hiç çalıştırılmadan, sessizce değiştirilmeden bildirilir. Saf olmayan işlev çağrıları ikinci onay ister. Aynı `sql.evaluate` yolu `rowLimit` (1–50) ile genişletildi. Birim (574) ve WebView2 testi geçti.

- **FI-116 / FI-120 / FI-117 (kısmen) · Tamamlandı:** Ayarlar &gt; General &gt; "Enter query bind values beside the SQL instead of a dialog" açıkken, imlecin bulunduğu deyimin üstünde (Monaco view zone, kaynak metni değişmez) her ayrı bind için tek bir alan çıkar; tekrarlanan `:id` aynı alanı paylaşır. Tip seçilebilir (VARCHAR2/NUMBER/DATE/TIMESTAMP), NULL ayrı bir onay kutusudur (boş metinden farklı), değerler yalnızca bellekte, sekme+bağlantı kapsamında tutulur ve diske yazılmaz. Alana odaklanınca deyimdeki tüm `:ad` kullanımları vurgulanır. Ctrl+Enter eksik değer varsa çalıştırmaz, ilk eksik alana odaklanır (iletişim kutusu açılmaz). DATE/TIMESTAMP için takvim, `is_/has_/..._flag` gibi adlar için Y/N/1/0 seçimi. Kayıt seçici alt maddesi açık. Birim (570) ve WebView2 testi geçti.

- **FI-093 · Tamamlandı:** Sonuç ızgarasında tek hücre seçiliyken o hücre editöre sürüklenebilir. Bırakılan yere yalnızca tipli bir bind yer tutucusu (`:sutun_adi`, çakışmada `_2`) eklenir; hücre değeri SQL'e hiçbir zaman yazılmaz (text/plain de yalnızca yer tutucudur). Kısa, skaler ve hassas olmayan değer yalnızca bellekte tutulup bir sonraki bind isteminde (tipiyle) önerilir; CLOB/ham/1000+ karakter ve password/token/secret gibi adlı sütunlarda değer taşınmaz, hiçbir yere kaydedilmez (localStorage'da yok). Salt okunur editöre bırakma uyarıyla reddedilir. Birim (566) ve WebView2 testi geçti.

- **FI-076 · Tamamlandı:** Komut paletindeki "Evaluate the selected SQL expression…", seçili ifadeyi `SELECT (ifade) AS "RESULT" FROM dual` olarak yalnızca "Evaluate"e basılınca, sekmenin kendi oturumunda ve bind değerleri/tipleriyle (`sql.evaluate` → `sql.evaluated`) çalıştırır; sonuç sonuç ızgarasına, geçmişe veya editöre değil küçük pencereye yazılır. Deyim/DML/PL-SQL, noktalı virgül ve dengesiz parantez açıklamayla reddedilir. Saf bilinen işlevler (TO_CHAR, NVL…) dışındaki her çağrı (kullanıcı, paket, tırnaklı) listelenir ve yan etkisiz varsayılmaz: ikinci bir onay kutusu işaretlenmeden Evaluate etkinleşmez. Birim (563) ve WebView2 testi geçti.

- **FI-065 · Tamamlandı:** Komut paletindeki "Open SQLcl / SQL\*Plus / a terminal in the project directory" komutları, çalışma alanı klasöründe ayrı bir konsol penceresi açar (`ui.openTerminal` → `ExternalTerminalService`). Bağlantı bağlamı olarak yalnızca parola içermeyen `kullanıcı@bağlantı` ve TNS_ADMIN (seçili profilin tnsnames klasörü) taşınır; parola, token veya cüzdan gizlisi komut satırına/ortama konmaz, araç parolayı kendisi sorar. Kabuk metakarakterleri ve bilinmeyen araçlar reddedilir, PATH'te bulunmayan araç açıkça bildirilir, dış aracın oturumu ve işlemi editör sekmesinden ayrıdır. Birim (559), yerel smoke (11 proje) ve WebView2 testi geçti.

- **FI-044 · Atlandı (kullanıcı kararı):** Peek Definition bu turda atlandı; Monaco'nun peek eylemi bu derlemede pencere açmadı, yarım kod geri alındı.

- **FI-041 · Tamamlandı:** Editörde `/** … */` belge yorumu olan bir PROCEDURE/FUNCTION'ın adının (bildirim ya da aynı kaynaktaki çağrı üzerinde) üzerine gelindiğinde hover, imzayı, açıklamayı, Parameters listesini (mod/tip ve açıklama), Returns ve diğer etiketleri (@throws vb.) işlenmiş Markdown olarak gösterir; yorumu olmayan yordamlarda hiçbir şey eklenmez. Belge iskeleti komutuyla üretilen format ve serbest biçimli etiketler ayrıştırılır. 559 birim testi ve WebView2 testi geçti.

- **FI-084 · Tamamlandı:** Explorer'daki yeni "Server" görünümü, bağlı şemanın paket (spesifikasyon/gövde ayrı), prosedür, fonksiyon, tetikleyici ve tip kaynaklarını sanal bir ağaçta listeler. Üstte "sunucu tanımları okunur ve salt okunur açılır, çalışma alanındaki dosyalar değildir" uyarısı, her girişte "Server" rozeti vardır; yerel dosyalar yalnızca Files görünümünde kalır. Listeleme kaynak yüklemez; tıklayınca mevcut salt okunur tanım sekmesi (`OWNER.NAME.sql`, yol yok) açılır. Filtre kutusu vardır. 556 birim testi ve WebView2 testi geçti.

- **FI-151 · Tamamlandı:** Editör ve sonuç araç çubukları ayrı satırlarda kalır; Ayarlar &gt; General &gt; Toolbars bölümü her çubuk için hangi eylemlerin satırda görüneceğini seçtirir. İşareti kaldırılan eylem o çubuğun taşma (overflow) menüsüne taşınır, kaybolmaz; "Table view options" ve "Result commands" gizlenemez. Tercih `ui.toolbars` ayarında saklanır. 554 birim testi ve WebView2 testi geçti.

- **FI-142 · Tamamlandı:** Alt tuşuna kısa basmak, görünen tüm düğme/sekme/menü öğelerinin üzerinde benzersiz birer harf (Ctrl/Alt kısayolları ve Alt+tuş akorları etkilenmeden) gösterir; harfe basmak o denetimi etkinleştirir, Escape/fare/başka tuş iptal eder. Açık bir pencere varsa yalnızca onun denetimleri etiketlenir. Ayarlar &gt; General içinde kapatılabilir (`ui.keyTips`, varsayılan açık). Birim testleri ve WebView2 testi (`20261102-102129-7441f90a`) geçti.

- **FI-070 · Tamamlandı:** Komut paletindeki "Compare the editor (or selection) with the clipboard" ve "Compare two files…", salt okunur bir Monaco karşılaştırma penceresi açar. Pencereye bırakılan en çok iki metin dosyası (2 MB sınırı; ikili/uzantısız-medya dosyaları ve üçüncü dosya gerekçesiyle reddedilir) boş tarafa, çift bırakma iki tarafa yerleşir; her taraf "Editor" veya "Clipboard" ile de doldurulabilir ve "Swap sides" ile değiştirilir. Özet satır sayılarını ve aynı olup olmadığını söyler. Bırakılan dosyalar editörde açılmaz, kaydedilmez ve SQL çalışmaz. 546 birim testi ve gerçek WebView2 testi (`20261102-101608-38339325`) geçti.

- **FI-014 · Tamamlandı:** Kayıtlı bir dosya değişerek yeniden kaydedildiğinde, değiştirilen önceki disk içeriği Git'ten bağımsız olarak kullanıcıya özel `%LOCALAPPDATA% bsDB\history` altına anlık görüntü olarak alınır (workspace'e yazılmaz): aynı içerik tekrarlanmaz, dosya başına en çok 50 sürüm ve 20 MB, tek sürüm en çok 2 MB; geçmiş hataları kaydı asla engellemez. Komut paletindeki "Local history" açık dosyanın sürümlerini zaman ve boyutla listeler, seçilen sürümü Monaco karşılaştırma görünümünde mevcut editör metniyle yan yana gösterir; "Restore this version in the editor" yalnız editör metnini tek undo adımıyla değiştirir, diske yazmaz. Geçmiş okuma yalnız açık dosyalar için yapılır ve sürüm kimlikleri yol gezintisine karşı doğrulanır. Native duman testleri (yakalama yalnız gerçek değişikliklerde, sıra/içerik, sınırlar, traversal, temizleme), 543 birim testi ve gerçek WebView2 testi (`20261102-101230-e9a17961`) geçti.

- **FI-110 · Tamamlandı:** Bind formu tanımları artık SQL dosyasının yanında, workspace'te `.fbsdb/binds/<yol özeti>.json` olarak saklanır ve takımla paylaşılır; yol workspace'e göreli ve büyük-küçük harfe duyarsız anahtarlanır (workspace dışı dosyalar reddedilir, bağlantı noktalı klasörler kullanılmaz). Tanım: ad, tip, etiket, açıklama, zorunlu bayrağı ve isteğe bağlı varsayılan değer. Parola/secret/token/api-key benzeri adların, CLOB'ların ve 1.000 karakterden uzun varsayılanların varsayılan değeri hiç yazılmaz; çalıştırma değerleri hiçbir zaman saklanmaz. Dosya açıldığında `workspace.binds.load` ile form yerel önbelleğe yüklenir (SQL çalıştırılmaz); form açıldığında etiket başlıkta görünür ve varsayılan değer alana önceden yazılır. "Save bind form" `workspace.binds.save` ile yalnız tanımları yazar, boş form dosyayı siler. Native duman testleri (11 proje: normalize, sızıntı, büyük-küçük harf, workspace dışı ve yinelenen ad reddi), 542 birim testi ve gerçek WebView2 testi geçti.

- **FI-043 · Tamamlandı:** Komut paletindeki "Create related file", açık paket/prosedür/fonksiyon kaynağından proje kurallarına göre üç taslak önerir: test (Project rules'taki ilk test kalıbı), migration (migrations alanında mevcut `V###__` dosyalarından sonraki sürüm numarası) ve örnek çağrı (scripts alanında; rutin imzalarından `:result := paket.fonksiyon(p => :p)` / `paket.prosedur(...)` blokları). Diyalog yolu ve metin önizlemesini gösterir, var olan hedefleri "already exists" diye işaretleyip "Open existing file" sunar. Yeni `workspace.createFile` komutu yalnız onaydan sonra çalışır: workspace-göreli yol zorunludur, ara klasörleri oluşturur, `..`/mutlak/geçersiz uzantı ve var olan dosyayı reddeder (mevcut dosya asla ezilmez) ve içeriği UTF-8'e yazar; dosya açılır, hiçbir SQL çalışmaz, test çerçevesi iddia edilmez. Native duman testleri (11 proje), 541 birim testi ve gerçek WebView2 testi (`20261102-065507-0990d7c1`) geçti.

- **FI-112 · Tamamlandı:** Komut paletindeki "Workspace portability check" açık ve salt okunur bir tarama yapar (mevcut sınırlı kaynak okuyucusu: en çok 300 dosya, dosya başına 1 MB, toplam 8 MB; atlanan dosyalar ve kesik tarama görünür). Bulgular: kaynaklardaki makineye özgü mutlak yollar (Windows sürücü/UNC, `/home`, `/Users`; workspace içindeki mutlak yollar ayrı "göreli yap" önerisiyle), `HOST`/dış araç bağımlılıkları (sqlldr, sqlplus vb.), kaynakların veya proje kurallarının başvurduğu TNS profilleri (alias dosyası workspace dışındaysa uyarı; içindeyse ekip aynı alias adına ihtiyaç duyar) ve `.fbsdb/workspace.json` kural yollarındaki mutlak klasörler. Her bulgu dosya:satır, ayrıntı ve öneri gösterir, satırı olanlar "Open" ile açılır; hiçbir dosya değişmez, SQL çalışmaz ve bulunmayan bir şey için "taşınabilir" iddiası yapılmaz (kapsam sınırı açıkça yazılır). 539 birim testi ve gerçek WebView2 testi geçti.

- **FI-020 · Tamamlandı:** Komut paletindeki "Run console", etkin sekmenin son 50 çalıştırmasını bellekte (yalnız bu oturum, sekme kapanınca silinir) listeler: durum, süre, satır/etkilenen satır, bağlantı, SQL, DBMS_OUTPUT satırları (en çok 200 satır × 500 karakter), hata iletisi ve bind parametre adları. Bind değerleri varsayılan olarak saklanmaz ("value not kept"); Privacy ayarındaki "Keep bind values in the run console for this session" açıksa yalnız parola/secret/token/key gibi adlara sahip olmayanlar tutulur. Her kayıt "Load into new editor" ile yeni sekmeye alınabilir veya "Rerun…" ile normal çalıştırma yolundan yeniden başlatılır (bind formu değerleri yeniden ister; kendiliğinden çalışmaz). 535 birim testi ve gerçek WebView2 testi (`20261102-064654-3f00c9a3`) geçti.

- **FI-013 / FI-051 · Tamamlandı:** Paket, prosedür, fonksiyon ve trigger başlıklarının üstünde Monaco code lens'leri gösterilir: dosyadaki başvuru sayısı (bildirim hariç, tırnaklı/büyük-küçük harf farkı gözetilmez; tıklayınca adı seçip Find'ı açar), paketlerde "Go to body/specification" (mevcut spec/body geçişi), kayıtlı kaynakta "Compile…" (mevcut kaynak karşılaştırma ve onay incelemesini açar) ve çağrılabilir rutinlerde "Run call…" (mevcut tipli çağrı formunu açar). Hiçbir lens SQL'i kendiliğinden çalıştırmaz veya derlemez; tüm eylemler zaten açık olan inceleme/form adımlarına gider. SQL deyimleri ve anonim bloklar için mevcut çalıştırma glifi korunur; rutinlerde çalıştırma eylemi satırın üstündeki lens'tedir. General ayarlarındaki "Code lenses above packages and routines" ile kapatılabilir, büyük dosyalarda kapalıdır, en fazla 100 grup gösterilir. 532 birim testi ve gerçek WebView2/Monaco testi (`20261102-064147-21ff6100`) geçti.

- **FI-027 · Tamamlandı:** Komut paletindeki "New scratch file" proje dosyası eklemeden çalışılan geçici bir sekme açar (`Scratch N.sql`, son bağlantıyı kullanır; çalıştırma ve tüm editör özellikleri normaldir). Sekme kesik çerçeve ve kalem simgesiyle işaretlenir, ekran okuyucuya "scratch file, not part of the project" olarak bildirilir. Kirli olsa da kapatılırken kaydet sorusu çıkmaz (toplu kapatma incelemesine de girmez); Ctrl+S veya sekme menüsündeki "Promote to project file…" kayıt akışını açar ve dosya yol aldığı anda sekme normal belge gibi davranır. Hiçbir dosya workspace'e kendiliğinden yazılmaz. 529 birim testi ve gerçek WebView2 testi geçti.

- **FI-057 · Tamamlandı:** Komut paleti ("Session inspector…") ve durum çubuğundaki şema göstergesi, etkin sekmenin fiziksel Oracle oturumu için salt okunur bir inceleme paneli açar: bağlantı (profil, durum, bağlantı nesli), oturum (şema, container, edition, servis, oturum kimliği), NLS ayarları (etkin değer + "Profile override / Changed from X in this session / Database default" kaynağı), işlem durumu (bekleyen değişiklik, auto commit, çalışan ifade) ve imleç/sonuç (yüklenen satır, sunucuda daha fazla satır/imleç kullanılamıyor, SQL id, süre). Panel yalnız mevcut `session.context` ve `session.nls` okumalarını sekmeye ait epoch ile ister; "Refresh" ile yeniden okunur, bağlantı yokken neyin eksik olduğunu yazar, SQL çalıştırmaz ve hiçbir ayarı değiştirmez. 527 birim testi ve gerçek WebView2 testi (`20261102-062623-d043856b`) geçti.

- **FI-111 · Tamamlandı:** Mevcut bağlantı tanılaması (DNS, TCP, Oracle servisi/hedef, kimlik doğrulama, oturum) çoğaltılmadan genişletildi: tanı penceresi üstte dört aşamayı (DNS, Network, Oracle service, Authentication) geçti/başarısız/uyarı/atlandı/ulaşılmadı durumlarıyla sıralı gösterir; sunucu adımları (Target, Oracle network, Oracle session) bu aşamalara eşlenir ve oturum açılabildiyse servis aşaması "sign-in ile doğrulandı" olarak işaretlenir. Başarısız veya uyarı veren her adımın altında, bilinen ORA kodları için (01017, 28000/28001/28002, 12154, 12514, 12505, 12541, 12170, 12537, 12560) ve DNS/Network aşamaları için sade bir anlam ve kontrol listesi çıkar; bilinmeyen kodlar bunu açıkça söyler. Ham Oracle iletisi (parolası maskelenmiş) yanında görünür kalır. Native probe değişmedi; tanı hâlâ geçici bağlantı kullanır. 525 birim testi ve gerçek WebView2 testi geçti.

- **FI-109 · Tamamlandı:** Sorgu süresi için mevcut zaman aşımı korunur; Results ayarlarına yüklenen satır sayısı (`results.budgetRows`) ve tahmini istemci belleği (`results.budgetMemoryMb`, MB) bütçeleri ile ulaşıldığında davranış (`stop` / `warn`) eklendi; 0 = sınırsız ve varsayılan davranış değişmedi. Bütçeler yalnız otomatik devamı ("Load remaining rows") denetler: `stop` yüklemeyi durdurur ve yüklü satırları korur, `warn` uyarır ve devam eder; kullanıcının açıkça "Load next page" demesi engellenmez. Bellek, örneklenen satırlardan tahmin edilir (UTF-16 metin + satır yükü, binary için bayt uzunluğu) ve gerçek ölçüm olarak sunulmaz. Uyarı metni bunun bu penceredeki istemci güvenliği olduğunu, veritabanı kaynaklarını sınırlamadığını ve sunucuda daha fazla satır olabileceğini açıkça söyler. 523 birim testi ve gerçek WebView2 testi (`20261102-061537-e3a61f38`) geçti.

- **FI-149 · Tamamlandı:** Explorer'da dosyaya tek tıklama, tek bir yeniden kullanılabilir önizleme sekmesinde açar (italik, ekran okuyucuya "preview" olarak bildirilir). Sonraki tek tıklama, önizleme sekmesi temizse onu kapatıp yenisini aynı yere açar; kirli önizleme asla değiştirilmez. Önizleme; düzenleme, sekmeye veya Explorer öğesine çift tıklama ya da Enter/menüden açık "Open" ile kalıcı olur ve belge durumu (imleç, kayıt, oturum) korunur. Zaten açık dosya önizlemeyi değiştirmeden etkinleşir. General ayarlarındaki "Open Explorer files in a preview tab on single click" (varsayılan açık) ile kapatılabilir. 521 birim testi ve gerçek WebView2 testi (`20261102-060820-8a1b8125`) geçti.

- **FI-141 · Devam:** Sekme şeridinde Ctrl/Cmd+tık sekmeyi seçime ekler/çıkarır (ilk Ctrl+tıkta etkin sekme de seçime girer), Shift+tık etkin/çapa sekmeden aralık seçer, Shift+Ctrl birleştirir; düz tık seçimi temizler ve sekmeyi etkinleştirir, Escape de temizler. Seçili sekmeler çerçeveyle işaretlenir ve ekran okuyucuya "selected" olarak bildirilir; kapanan sekmeler seçimden düşer. Seçili sekmeye sağ tıkta menü "Close N selected tabs" eylemini sunar; paket spec/body çiftleri birlikte kapanır ve kirli belgeler mevcut toplu kapatma incelemesine girer. Seçimi etkin sekme yapmaz, oturum sahipliği değişmez. Birlikte taşıma ve gruplama sekme sürükleme/gruplama (FI-132) ile birlikte açık alt iş. 518 birim testi ve gerçek WebView2 testi geçti.

- **FI-066 · Tamamlandı:** Editör durum çubuğuna sağ tık, göstergeleri işaretli/işaretsiz seçtiren bir menü açar: caret'teki rutin, geçerli şema, Oracle sürümü, Git dalı, girinti, satır sonu, kodlama ve dil. Seçim kullanıcı ayarında (`ui.statusIndicators`) sıralı liste olarak saklanır; geçersiz/yinelenen kimlikler atılır, varsayılan girinti + kodlama + dil'dir. Veri yoksa gösterge gizlenir (bağlantısız Oracle sürümü/şema, depo olmayan çalışma alanında dal). Tıklama eylemleri: rutin → dosya anahattı, şema → nesne araması, dal → Git durumu, girinti → editör stili ayarları, satır sonu → LF/CRLF geçişi (belgeyi düzenler, tooltip bunu söyler); kodlama ve sürüm yalnız bilgidir. İmleç konumu ve yerel değişiklik gezintisi sabit kalır. 515 birim testi ve gerçek WebView2 testi (`20261102-060109-a326349d`) geçti.

- **FI-092 · Tamamlandı:** Minimap açıkken (View &gt; Editor &gt; Minimap) paket, prosedür, fonksiyon, trigger ve type başlangıçları, breadcrumb ile aynı outline modelinden alınan adlarla (`PKG billing body`, `FUNC total`, `PROC reset`) altı çizili bölüm başlığı olarak minimap'te etiketlenir. Adlar başlık satırından ayıklanır (CREATE OR REPLACE, tırnaklı adlar, BODY), iç içe en fazla ikinci seviye ve 200 etiketle sınırlıdır; düzenleme sonrası etiketler outline ile birlikte güncellenir, minimap kapalıyken hiç dekorasyon eklenmez. 512 birim testi ve gerçek Monaco testi geçti.

- **FI-041 · Devam:** Bağlam menüsü ve komut paletindeki "Generate documentation comment", imleçteki (veya hemen altındaki) PROCEDURE/FUNCTION bildiriminin başlığını lexer ile çözümler ve üstüne `/** … */` iskeleti ekler: açıklama, her parametre için hizalı `@param ad MOD TİP (default …)` ve fonksiyonlarda `@return`. Tab durakları açıklama ve her parametre/dönüş metni arasında gezer; girinti bildirimle aynıdır, kod kaynaklı `$`/`}`/`\` snippet için kaçışlanır. Rutinin üstünde zaten yorum varsa yenisi eklenmez, uyarı verilir; ekleme tek undo adımıdır ve SQL çalıştırmaz. Yorumları editörde işlenmiş gösterme alt işi açık. 510 birim testi ve gerçek Monaco testi (`20261102-055100-ecd5fde9`) geçti.

- **FI-122 · Tamamlandı:** Tablo/görünüm/senkronim referanslarında mevcut nesne menüsü zaten veri (Open SELECT…) ve DDL eylemlerini, prosedür/paket referanslarında çağrı bloğu ve derleme şablonlarını sunuyordu; çözümleme metadata'ya dayanır ve hiçbir eylem kendiliğinden çalıştırma yapmaz. Eksik olan bind parametresi menüsü eklendi: seçimsiz sağ tık/Shift+F10 bir `:bind` üzerindeyse (string, yorum ve `::` ayrıştırılır) menü başında bind adı, kayıtlı tipi ve kullanım sayısı görünür; VARCHAR2/NUMBER/DATE/TIMESTAMP/CLOB tip seçimi dosyanın bind formu tanımına yazılır (SQL metni değişmez; kayıtlı dosya yoksa devre dışı), "Find all :NAME", ":NAME kopyala" ve açık "Run with bind values…" (normal bind formunu açar). Gerçek WebView2 testi (kopyalama, bulma, çalıştırmama) ve 507 birim testi geçti.

- **FI-119 · Tamamlandı:** Çalıştırılan her SQL bloğunun son satırının sonunda soluk bir özet gösterilir (`✓ 12 ms · 1 row`, `✓ … · 3 rows affected`, daha fazla satır varsa `1,200 rows+`, hatada `✗ failed · süre`). Özet, açıklama/boşluk/`;` farkları yok sayılarak normalize edilmiş ifade metnine bağlıdır: ifade düzenlenince özet kaybolur (bayat sayı gösterilmez), metin eski haline dönünce son çalıştırmayla yeniden eşleşir. Hover'da bağlantı adı, çalıştırma zamanı, hata iletisi ve "tam bu ifade metnini yansıtır" provenance'ı yer alır; özete tıklamak Results sekmesini açar. Sekme başına en fazla 500 ifade tutulur, sekme kapanınca temizlenir; SQL metni dosyaya veya diske yazılmaz. 505 birim testi ve gerçek Monaco testi (`20261102-054424-c76f72f5`) geçti. (Monaco 0.57'de çökmüş aralıktaki `after` metni için `showIfCollapsed` gerekiyor.)

- **FI-000 · Tamamlandı:** Editör toolbar'ı yeniden tasarlandı. Eylemler sola dayalıdır (önce Çalıştır, sonra gruplar: dosya — Open/Save/New, düzenleme — Undo/Redo/Format, arama — Find/Toggle comment, analiz — Explain plan, işlem — Commit/Rollback/Auto commit, Rows); maximize butonu soldan çıkarılıp sağ uca, taşma menüsünün yanına alındı. Yeni işlevler: Save, New, Redo, Find, Toggle comment ve Explain plan. Eylemler tek bir tanım tablosundan (`editorToolbarModel.js`) gelir; genişlik azaldıkça düşük öncelikli eylemler (Comment, Find, Rows, Redo, New …) sırayla "More editor actions" menüsüne taşınır, Commit/Rollback/Format/Save en son kalır; menü kısayolları ve devre dışı durumları korur ve yalnız taşan eylem olduğunda görünür. Eski CSS'teki 620 px'te tüm düğmeleri gizleyen kural ve kırılgan `nth-of-type` kuralları kaldırıldı; mevcut aria-label'lar korundu. 502 birim testi ve gerçek WebView2 testi (`20261102-052758-bd222bc4`: hizalama, tüm eylemler, komut/geri alma/yinele/bul, daralınca taşma menüsü) geçti.

- **FI-074 · Tamamlandı:** Çalışan sorgu Windows görev çubuğu düğmesinde belirsiz (indeterminate) ilerleme gösterir ve sonuçla temizlenir; yüzde yalnız anlamlı ilerleme verisi olduğunda gösterilmeli kuralı gereği hiç gösterilmez. Odak dışındayken başarısız olan sorgu, pencere odaklanana kadar hata durumunu (kırmızı) gösterir. FI-087 ayarları açıkken tamamlanma bildirimi geçen süreyi (ör. "Elapsed 2 min 5 s") içerir. Yeni `ui.setTaskbarProgress` komutu `ITaskbarList3` kullanır; COM yoksa sessizce atlanır. Gerçek WebView2 testi (`20261102-052406-1e29ca07`) ve 498 birim testi geçti.

- **FI-087 · Tamamlandı:** Notifications ayarlarına dört seçenek eklendi: çalıştırmada Results sekmesine geçişi kapatma (varsayılan açık), tamamlanma sesi ve görev çubuğu dikkat çekme (kapalı / yalnız pencere odakta değilken / her zaman) ve "en az N saniye süren sorgular" eşiği. Ses yerel üretilen kısa iki tonlu uyarıdır (ses dosyası veya ağ yok; başarı ve hata farklı); dikkat çekme yeni `ui.requestAttention` komutuyla `FlashWindowEx` kullanır, odağı çalmaz. Başarı, zaman aşımı ve hata tamamlanmalarında çalışır. Varsayılan davranış değişmedi. Gerçek WebView2 testi (`20261102-052217-ae160436`) ve 496 birim testi geçti.

- **FI-016 · Tamamlandı (desteklenen yerel kapsam):** Tekil yerel prosedürde gerekli IN parametrelerinin adını değiştirme, sıralama ve `DEFAULT NULL` değerli isteğe bağlı IN parametresi ekleme önizlenir. Adlandırılmış çağrı etiketleri ve konumsal çağrı argümanları aynı belgede güncellenir; imza uygulaması sürüm korumalı tek undo adımıdır. Aşırı yükleme, nitelikli/belirsiz çağrı, etkilenen listelerde yorum ve diğer dosyalar kapsam dışıdır. 481 birim testi, web derlemesi ve gerçek masaüstü önizleme/uygulama/undo testi (`20261102-034926-75ee06cf`) geçti.

- **FI-017 · Tamamlandı (desteklenen atamalar):** Üst düzey DECLARE bloğunda seçilen bitişik ve tam basit atamalar yerel prosedüre çıkarılır. Basit skaler yerel değişkenlerin okuma/yazma sırası IN, OUT ve IN OUT yönünü belirler; bildirim ve çağrı önizlenir, model sürüm korumasıyla tek undo adımında uygulanır. Karmaşık ifadeler, SQL, kontrol akışı ve çözülemeyen türler durdurulur. 484 birim testi, web derlemesi ve gerçek masaüstü önizleme/uygulama/undo testi (`20261102-035139-1280fbae`) geçti.

- **FI-024 · Tamamlandı (desteklenen öğeler):** Komut paleti ve editör menüsünden SELECT projeksiyon ifadeleri, basit AND koşulları ve aynı kapsamdaki PL/SQL cümleleri/blokları yukarı veya aşağı taşınır. Virgül/AND ayraçları ve satır girintisi korunur; yorumlar, farklı ayraç düzeni, OR/BETWEEN ve SELECT değiştiricileri güvenli biçimde durdurulur. Uygulama tek undo adımıdır. 488 birim testi, web derlemesi ve gerçek masaüstü hareket/undo testi (`20261102-035339-4a37b5d7`) geçti.

- **FI-037 · Tamamlandı (statik literal):** Tek ve normal tek tırnaklı `EXECUTE IMMEDIATE` SQL literali ayrı Monaco SQL editöründe tamamlamayla açılır, biçimlendirilir ve çift tek tırnak kaçışlı kaynak önizlemesinden sonra sürüm korumalı tek undo adımıyla geri yazılır. Birleştirme, değişken ifade ve q-quote kapsam dışı olarak açıkça reddedilir; SQL çalıştırılmaz. 490 birim testi, web derlemesi ve gerçek masaüstü düzenleme/kaçış/undo testi (`20261102-035522-9d22bea6`) geçti.

- **FI-053 · Tamamlandı (oturum belleği):** Editörden kopyalanan parçalar yalnız açıkça etkinleştirilince tutulur; başlangıçta kapalıdır, en fazla 20 parça/20.000 karakter oturum belleğindedir, arama ve temizleme vardır, kapatma veriyi siler. Çoklu seçimde kopyalanmış parçalar eş sayıda dağıtılır; seçenekle satırlar da dağıtılabilir. 492 birim testi, web derlemesi ve gerçek masaüstü opt-in/kopyalama/temizleme testi (`20261102-035712-0f291a65`) geçti.

- **FI-063 · Tamamlandı (güvenli editör eylemleri):** Editör menüsündeki yukarı/aşağı taşıma ve satır yorumu aç/kapat eylemleri en fazla 20 adımlı, adlandırılmış oturum makrosu olarak kaydedilir. Son makro Ctrl+Alt+Shift+M ile yeniden oynatılır; en fazla 9 makro bellekte tutulur. SQL yürütme, dosya, bağlantı ve diğer dış etkiler kaydedilemez. 494 birim testi, web derlemesi ve gerçek masaüstü kayıt/kısayol testi (`20261102-040257-77d24800`) geçti.

- **FI-015 · Devam:** Yerel prosedür/fonksiyon/parametre konumundan silme öncesi inceleme açılır. Geçerli belgede çözülmüş başvurular sayılır; workspace içindeki sınırlı metin adayları dosya/satır içeriğiyle listelenir. Dinamik SQL, sunucu çağıranları ve arama sınırları ve okunamayan dosyalar eksik tarama olarak işaretlenir; inceleme kod silmez ve güvenli silme iddiası vermez. Proje çapı semantik doğrulama ve gerçek silme kapısı açık alt iştir. 477 birim testi, web derlemesi ve izole masaüstü testi (`20261102-033946-920f1755`) geçti.

- **FI-008 · Tamamlandı (desteklenen tanılar):** Alt+Enter, aynı editör anlık görüntüsüne ve imleç satırına bağlı Oracle derleme tanısında PLS-00103 beklenen noktalı virgülü veya PLS-00201 basit yerel ad bildirimi taslağını önerir. Bildirim tipi açık TODO yer tutucusudur. Önizleme ve model sürüm koruması vardır; tek undo adımı uygulanır, SQL çalıştırılmaz. Diğer tanılarda seçenek sunulmaz. 475 birim testi, web derlemesi, gerçek Alt+Enter masaüstü testi (`20261102-033314-111e93d4`) ve tam masaüstü regresyonu (`20261102-033440-ff470a72`) geçti.

- **FI-005 · Tamamlandı:** Yerel PL/SQL değişken/parametre adlandırması mevcut sembol ve başvuru çözümleyicisinin aynı kapsam kimliğiyle yalnız geçerli belgedeki bildirimi ve kullanımları önizler. Belirsiz, 100.000 karakteri veya 128 aday sınırını aşan analiz durur; başka yerel adla çakışma ve anahtar sözcük reddedilir. Uygulama sürüm korumalı tek undo adımıdır. 473 birim testi, web derlemesi ve gerçek Monaco önizleme/uygulama/undo testi (`20261102-033057-177bb5a3`) geçti.

- **FI-056 · Tamamlandı:** Object Explorer içindeki tablo ve yüklenmiş sütunlar editöre sürüklenince gözden geçirilebilir SELECT taslağı eklenir. Editörde tek, belirsiz olmayan kaynak tablo adı ve metadata içinde tek doğrulanmış FK ilişkisi varsa bileşik sütun çiftleriyle JOIN taslağı üretilir; belirsiz/eksik ilişki tahmin edilmez. 200 sütun sınırı taslakta belirtilir. SQL çalıştırılmaz. 470 birim testi, web derlemesi ve gerçek WebView2/Monaco sürükle-bırak testi (`20261102-032830-2f2b04b9`) geçti.

- **FI-080/FI-094 · Tamamlandı:** Çalışma alanı proje kurallarında tercih edilen adlandırma stili, tam terim, kısaltma ve bilinen alternatif yazımlar saklanır; native doğrulama çakışan/geçersiz girişleri reddeder. Identifier dönüşümünde proje tam ad/kısaltma stilleri seçilir; önizleme bilinen alternatifleri gösterir ve Oracle kimliği değişimini işaretler. Uygulama yalnız seçimi etkiler. 468 birim testi, web derlemesi ve izole gerçek masaüstü/proje kuralı paketi (`20261102-032101-1a3c02ef`) geçti.

- **FI-077 · Tamamlandı:** Editör bağlam menüsü ve komut paletindeki sütun imleçleri eylemi, panodaki tek TSV başlık satırını veya satır satır sütun adlarını (2–100) editöre yerleştirip her adı ayrı Monaco seçimine dönüştürür. Özel karakterli adlar Oracle tırnaklı identifier olarak kaçışlanır; çok satırlı tablo verisi reddedilir. Seçimler eşzamanlı alias/fonksiyon düzenlemesine hazırdır, ekleme tek undo adımıdır ve SQL çalıştırılmaz. 465 birim testi ve gerçek Monaco masaüstü testi (`20261102-025012-663a5da0`) geçti.

- **FI-058 · Tamamlandı:** Tam ifadelerden (çağrı, literal, parantezli ifade veya en az iki parçalı nitelikli ad) sonra `.in`, `.notin`, `.isnull`, `.notnull`, `.nvl`, `.like`, `.between`, `.upper`, `.trim`, `.count` postfix tamamlamaları snippet olarak açılır; tek parçalı `alias.` tamamlaması gölgelenmez. "Extract query into CTE" (bağlam menüsü/palet) seçili alt sorguyu ifadenin WITH listesine (varsa mevcut CTE'lerden sonra) taşır ve iki ad konumunu tek yer tutucuyla düzenletir. 465 birim testi ve gerçek Monaco masaüstü testi (`20261102-025012-663a5da0`) geçti.

- **FI-023 · Tamamlandı:** SQL modelleri için Monaco SelectionRangeProvider kaydedildi; Shift+Alt+Right/Left ve komut paletindeki Expand/Shrink selection, lexer'a dayalı adımlarla genişler/daralır: token → nitelikli ad → koşul (AND/OR/WHEN/THEN sınırları) → liste öğesi/argümanlar → parantez içi → parantez → (dışa doğru tekrar) → PL/SQL blok gövdesi → ifade → belge. Aralıklar her zaman iç içedir; 500.000 karakter üstünde sağlayıcı devre dışı kalır. Alt+Left/Right geçmiş gezinmesinin Shift+Alt kombinasyonlarını da yakalayıp Monaco'nun daraltmasını bozması düzeltildi; F12/geri-ileri testleri yeniden geçti. 460 birim testi, gerçek Monaco testi (`20261102-023838-e4be615e`) ve proje kuralları masaüstü paketi (`20261102-023942-8a7831ca`) geçti.

- **FI-018 · Tamamlandı:** Mevcut snippet tamamlama altyapısına `proc`, `func`, `cursor`, `curfor`, `exc`, `raise`, `pkg`, `pkgb` PL/SQL iskeletleri eklendi; yerleşik şablonlar ayrı modüle taşındı. Kısaltma tamamlamadan seçilince Monaco snippet'i olarak açılır ve Tab yer tutucular arasında gezer; aynı numaralı yer tutucular (ör. prosedür adı ve `END` adı) birlikte düzenlenir. Bu tetikleyicilerle daha önce kaydedilmiş özel snippet'ler gizlenmez, önceliği korur. Testler tetikleyici benzersizliğini, yer tutucu numaralandırmasını ve ad tutarlılığını doğrular. 456 birim testi ve gerçek Monaco testi (`20261102-023441-327c357e`) geçti.

- **FI-059 · Tamamlandı:** Özelleştirilebilir Ctrl+Shift+Enter kısayolu ve komut paletindeki "Complete statement (Smart Enter)", imleç satırındaki yapıyı tamamlar: IF/ELSIF'e eksik THEN, FOR/WHILE'a LOOP, WHEN'e THEN ekler; aynı girintide kapanış yoksa END IF/END LOOP/END/END CASE satırını yazar ve imleci girintili gövde satırına koyar. Açık parantezler lexer ile sayılıp kapatılır; düz ifadelere bir kez `;` eklenir, virgül/açık parantezle biten veya zaten sonlanmış satırlar korunur, string içindeki `--` yorum sayılmaz. Tanınmayan boş satırda normal yeni satır davranır. Tek undo adımıdır, SQL çalışmaz. 453 birim testi ve gerçek Monaco testi (`20261102-023013-db987346`) geçti.

- **FI-083 · Tamamlandı:** `INSERT INTO … (sütunlar) VALUES (değerler)` içinde imleç bir sütun veya değerdeyken (SQL ve PL/SQL bloklarında) eşi Monaco occurrence vurgusuyla işaretlenir; boş bırakılmış değer konumu dahil sıralar korunur ve sayı uyuşmazlığı modelde raporlanır. Boş VALUES konumunda veya `:` yazarken tamamlama, eşleşen sütun adından türetilmiş bind yer tutucusunu (`:customer_name`) önerir; değer girilmez, SQL çalışmaz. Eklenen highlight sağlayıcısı Monaco'nun kelime vurgusunun yerini aldığından, INSERT dışında aynı tam-kelime metinsel vurgu korunur. 449 birim testi ve gerçek Monaco testi (`20261102-022515-183179cf`) geçti.

- **FI-038 · Tamamlandı:** Editör bağlam menüsü ve komut paletindeki "Paste as…", panodaki metni seçimin yerine tek undo adımıyla dönüştürür: tablo/satır ayrımlı hücreler tekilleştirilmiş `IN (...)` listesine (tümü sayıysa tırnaksız, aksi halde kaçışlı literal; 1.000'den fazla değer `OR` ile parçalanır), JSON nesne/dizi tipli sütunlara sahip `JSON_TABLE` taslağına (iç içe değerler `FORMAT JSON`, özel anahtarlar tırnaklı yol), sütun adları eşleşen bind'li `INSERT` şablonuna. Hatalı pano içeriği açık mesaj verir; modelin satır sonu kullanılır, SQL çalıştırılmaz. 446 birim testi ve gerçek Monaco testi (`20261102-021520-8b0340ee`) geçti.

- **FI-039 · Tamamlandı:** Editör bağlam menüsündeki ve komut paletindeki "Surround with…", seçili satırları kapsama göre şablonla sarar: ifadeler için BEGIN/EXCEPTION/END, IF/END IF, FOR döngüsü ve DBMS_UTILITY.GET_TIME zamanlama bloğu; SELECT/WITH sorguları için yalnız cursor FOR döngüsü. Ekleme Monaco snippet'i olarak yapılır, Tab ile koşul/sayaç/istisna yer tutucuları arasında gezilir; tek undo adımıdır. Temel girinti korunur, gövde editörün girinti ayarı kadar içeri alınır, modelin satır sonu kullanılır, sonlandırıcısız DML'ye `;` eklenir ve kullanıcı metnindeki snippet sözdizimi kaçışlanır. Değişmiş editörde eylem reddedilir; SQL çalıştırılmaz. 443 birim testi ve gerçek Monaco testi (`20261102-021253-def984c0`) geçti.

- **FI-143 · Tamamlandı:** Sütun başlığı menüsündeki Filter… paneli sütun tipine göre tipli kontrol sunar: DATE/TIMESTAMP için takvimli (`datetime-local`) başlangıç/bitiş, sayılar için kesin ondalık doğrulamalı min/max, metin için yüklü satırlardan sayımlı, aranabilir değer listesi (NULL seçeneği, ilk 200 farklı değer; eksikse belirtilir). Boş sınır açık uçlu karşılaştırmaya dönüşür, ters sınırlar reddedilir. Panel filtrenin yüklü N satıra uygulandığını ve sunucu sorgusunun yeniden çalışmadığını açıkça yazar; mevcut "Server filter" açık eylem olarak kalır ve yeni değer listesi orada bind'li `IN (...)`/`IS NULL` olarak çevrilir. Filtre listesi aralık ve değer listesi etiketlerini doğru gösterir. 440 birim testi ve gerçek WebView2 testi (`20261102-020314-47639cd3`) geçti.

- **FI-061 · Tamamlandı:** Sonuç sütunları, çalıştırılan sorgunun dış blok projeksiyon ifadelerine (WITH sonrası, DISTINCT/alias ayrıştırılmış) bağlanır. Grid'de bir sütun seçilince editördeki ifade vurgulanır; sütun menüsündeki "Show source expression" ifadeyi seçip görünür alana getirir; editör imleci bir projeksiyon ifadesindeyken ilgili sonuç başlığı işaretlenir. Bağlantı yalnız editör çalıştırma anlık görüntüsüyle aynıyken ve ifade ofseti doğrulanabildiğinde kurulur; metin değişince vurgular temizlenir ve eylem açık uyarı verir. Tek `*` iki uçtan konumla çözülür, birden fazla `*` veya sayı uyuşmazlığında tahmin yapılmaz. Bu dilimde hex görünümünün dar panelde satır kaydırması ve seçimde durum satırının yükseklik değiştirmesi de düzeltildi. 436 birim testi ve gerçek WebView2 testi (`20261102-015650-86cf59e2`) geçti.

- **FI-097 · Tamamlandı:** XML yapı görünümündeki her öğenin "SQL draft" eylemi (hover/odakta görünür) o öğeyi satır yolu yapan bir XMLTABLE taslağı açar. Belgedeki her namespace URI'si (varsayılan namespace dahil) kararlı `nsN` önekiyle `XMLNAMESPACES` içinde bildirilir; satır yolu ve sütun yolları bu önekleri kullanır. Sütunlar öğenin öznitelikleri (`@id`, `@ns2:flag`) ve tekil yaprak alt öğeleridir; yoksa öğe değeri (`.`) kullanılır. Sütun adları geçerli ve benzersiz identifier'lara dönüştürülür, literal'ler kaçışlanır; taslak çalıştırılmaz. JSON tarafıyla birlikte FI-097 tamam. 433 birim testi ve gerçek WebView2 testi (`20261102-014818-07a7ce05`) geçti.

- **FI-097 · Devam:** JSON ağacında odaklanan düğüm "SQL draft" ile yeni, kaydedilmemiş bir SQL sekmesinde düzenlenebilir taslak açar: skalerlerde `JSON_VALUE(... RETURNING NUMBER|VARCHAR2(4000)|VARCHAR2(5) NULL ON ERROR)`, nesne/dizilerde `JSON_QUERY(... RETURNING CLOB)`. Ağaç yolları Oracle SQL/JSON sözdizimine (`."odd key"`, `[n]`) çevrilir, tek tırnaklar kaçışlanır, takma ad son anahtardan geçerli identifier olarak türetilir; kaynak tablo metadata'dan, bilinmiyorsa açık yer tutucuyla yazılır. Taslak çalıştırılmaz. XMLTABLE/namespace kısmı açık alt iş. 430 birim testi ve gerçek WebView2 testi (`20261102-014606-84a2334b`) geçti.

- **FI-095 · Devam:** Değer görüntüleyicisine "JSON tree" eklendi: genişletilebilir, ok tuşlarıyla gezilebilir (Sağ/Sol aç-kapa, Yukarı/Aşağı, Enter yolu kopyalar) ve tip/boyut gösteren salt okunur ağaç; düğüm yolları JSONPath gösterimindedir, ilk iki seviye açık başlar, 5.000 düğüm sınırı açıkça belirtilir. Varsayılan görüntüleyici önce sütun tipine (JSON → ağaç, XMLTYPE → XML), sonra metin/CLOB içerik tespitine göre seçilir; mevcut biçim seçicisiyle elle değiştirilir. Harita görünümü dış tile servisi ve koordinat kuralları gerektirdiğinden açık alt iş olarak kaldı. 427 birim testi ve gerçek WebView2 testi (`20261102-014328-ab789453`) geçti.

- **FI-100 · Tamamlandı:** BLOB inceleyicisinin Hex modu artık ofset, hex ve yazdırılabilir ASCII metin sütunlarını aynı bayt ofsetleriyle yan yana gösterir. Hover iki panelde aynı baytı, tıklama/sürükleme ve Shift+tıklama seçili aralığı her iki panelde vurgular; ok tuşları (Shift ile genişletme) ve Escape klavye alternatifidir. Aralığın ofsetleri/uzunluğu gösterilir ve hex olarak kopyalanabilir. Mevcut 4 KB parça gezinmesi, kodlama çözümleme, önizleme ve kaydetme korunur. 424 birim testi ve gerçek WebView2 testi (`20261102-014112-80309151`) geçti.

- **FI-096 · Tamamlandı:** Değer görüntüleyicisinin (modal ve yan panel) mevcut tam değer araması artık eşleşme sayısını, etkin eşleşmenin satır/sütun konumunu ve sonraki/önceki gezinmeyi (Enter / Shift+Enter, ↑↓ butonları) sunar; etkin eşleşme vurgulanır ve görünür alana kaydırılır. Arama raw, JSON ve XML biçimlendirilmiş metinde düz metin olarak çalışır (regex kaçış sorunları yok), 1.000 eşleşmeden sonra "+" ile sınır belirtilir. 422 birim testi ve gerçek WebView2 testi (`20261102-013511-b4c3e93b`) geçti.

- **FI-101 · Tamamlandı:** Değer inceleyicisi (modal ve FI-131 yan paneli) zaman değerleri için "Timezone lens" gösterir. Saklanan bilgi (Oracle tipi, duvar saati, saklı offset/bölge, oturum saat dilimi) ile türetilmiş dönüşümler (UTC, yerel IANA bölgesi, oturum, saklı bölge) ayrı bölümlerdedir ve dönüşümün dayanağı yazılır. Nanosaniye kesri korunur. Offset'i olan TSTZ ve oturum offset'i bilinen LTZ değerleri dönüştürülür; oturum yalnız bölge adıyla biliniyorsa anlık zaman uydurulmaz. DATE/TIMESTAMP gibi saat dilimsiz değerler kullanıcı açıkça UTC veya bir offset seçmedikçe dönüştürülmez ve seçim "Assumed (not stored)" olarak etiketlenir. 420 birim testi ve gerçek WebView2 testi (`20261102-013255-6df25cce`) geçti.

- **FI-099 · Tamamlandı:** Grid bağlam menüsündeki "Open in code editor", metin değerini editör temasını kullanan ayrı bir Monaco görünümünde açar. Dil JSON/XML/SQL-PL/SQL/düz metin olarak tespit edilir ve değiştirilebilir; Format JSON/XML için mevcut yapı biçimlendiricisini, SQL için Oracle biçimlendiricisini kullanır. Düzenleme yerel kalır ve bu açıkça yazılır; veritabanına veya sonuca yazılmaz. SQL değerleri "Open as new SQL file" ile çalıştırılmadan yeni sekmeye aktarılabilir. NULL, binary ve 2 MB üstü değerler açılmaz. 416 birim testi ve gerçek WebView2/Monaco testi (`20261102-013018-a19d4d06`) geçti.

- **FI-098 · Tamamlandı:** Sonuç değerlerinde (ilk 2.000 karakter) HTTP/HTTPS URL, e-posta, Windows/UNC yolu ve nitelikli `SCHEMA.OBJECT` referansı tanınır; grid bağlam menüsü "Link" bölümünde açık eylem ve kopyalama sunar. Render veya tıklama hiçbir şey açmaz. URL ve `mailto:` yalnız native `result.openUrl` ile açılır (native izin listesine `mailto` eklendi); yol yalnız Oracle kaynak uzantılarında editörde açılır, diğerleri kopyalanır; nesne yalnız yüklü şema metadata'sında varsa Object Explorer'da gösterilir, yoksa açık uyarı verilir. Tırnaklı/tırnaksız ad kuralları uygulanır; düz kelimeler ve sayılar bağlantı sayılmaz. Mevcut "Highlight links" sütun biçimi tüm türleri vurgular. 414 birim testi ve gerçek WebView2 testi (`20261102-012502-c4506f61`) geçti.

- **FI-146 · Tamamlandı:** Workspace, Oracle nesne ve bağlantı ağaçlarında kırpılmış ad, fareyle üzerine gelince veya satır klavyeyle odaklanınca etiketle aynı konumda, aynı font/padding ile başlayan bir overlay'de tam gösterilir. Overlay işaretçi olaylarını almaz ve ağacı yeniden akıtmaz; kırpılmamış adlarda açılmaz, iç içe satırda yalnız kendi etiketini kullanır, görüntü alanı kenarında satır kaydırır. Escape, odak kaybı, kaydırma ve pencere boyutu değişimi kapatır. Renkler tema tokenlarından gelir. 411 birim testi ve gerçek WebView2 testi (`20261102-012206-d9d2df6b`) geçti.

- **FI-050 · Tamamlandı:** General ayarlarındaki "Show shortcut hints after menu use" (varsayılan kapalı) açıkken, komut paletinden veya editör bağlam menüsünden kısayolu olan bir eylem çalıştırıldığında kullanıcının yapılandırdığı kısayolu gösteren kapatılabilir bir ipucu çıkar. Klavyeyle tetiklenen eylemler ipucu üretmez. Her ipucu en fazla üç kez gösterilir; "Don't show again" ve sayaçlar yalnız eylem kimliğiyle cihazda saklanır (depolama yoksa sessizce atlanır); General'da sıfırlama butonu vardır. 409 birim testi ve gerçek WebView2 testi (`20261102-011916-249ea41d`) geçti.

- **FI-150 · Tamamlandı:** Sekme şeridindeki + butonu split butona dönüştü. Ana eylem Ctrl+N ile aynıdır ve tooltip'te geçerli profil adını gösterir. Açılır menü kayıtlı profilleri (geçerli olan başta, ortam etiketiyle; erişilemeyenler görünür ama devre dışı), "No connection" ve SELECT / PL/SQL blok / oturum bağlamı başlangıç şablonlarını sunar. Profil seçimi normal bağlantı akışını başlatır; şablon yalnız editör metnini doldurur, kaydedilmemiş olarak işaretlenir ve SQL çalıştırmaz. Menü klavyeyle (oklar, Home/End, Escape) gezilir ve temaya uyar. 406 birim testi ve gerçek WebView2 testi (`20261102-011632-e2550a1e`) geçti.

- **FI-104 · Tamamlandı:** Sütun menüsündeki "Set/Rename display heading…" başlıkta yerinde düzenleme açar; "Restore original heading" geri alır. Alias yalnız görüntüdür: SQL, sıralama/filtre, aria etiketi, kopyalama/export başlıkları ve metadata özgün adı korur; tooltip "original column" bilgisini gösterir. Eşleşme özgün ad + aynı adlı sütunlar içindeki sırayla (`NAME#2`) yapılır; projeksiyon sırası değişse de doğru sütuna bağlanır, eşleşmeyenler uygulanmaz. Sunum sorgu şablonuyla hatırlanır: yorum/boşluk ve unquoted büyük-küçük harf farkını yok sayan, bind adlarını koruyan bir parmak izi anahtar olur; SQL metni saklanmaz. Cihazda en fazla 200 şablon × 200 alias tutulur. Pivot/özet görünümlerinde kapalıdır. Header tooltip'i yeniden render'da kaybolmayan `data-tooltip-content` ile verilir. 404 birim testi ve gerçek WebView2 testi (`20261102-011332-14e3cfb1`) geçti.

- **FI-131 · Tamamlandı:** Shift+Enter veya grid bağlam menüsündeki "Inspect in side panel", hücre değerini mevcut yeniden boyutlandırılabilir sağ inspector'da açar. Drawer mevcut değer görüntüleyicisini (raw/JSON/XML, arama, binary/uzunluk) gömülü kullanır, sütun/satır başlığını gösterir ve klavye/işaretçi seçimi değiştikçe odak hücreyi izler; modal açılmaz, tablo kullanılabilir kalır. Enter ile modal inceleme ve inspector genişlik kilidi korunur. 400 birim testi ve gerçek WebView2 testi (`20261102-010502-700476a5`) geçti.

- **FI-154 · Tamamlandı:** Birden fazla hücre seçildiğinde, işaretçi bırakıldıktan sonra odak hücrenin yanında seçim boyutunu, Copy, Formats… (FI-145 kapsam önizlemesi), Export… ve Details eylemlerini gösteren küçük bir toolbar açılır; grid içinde kalır, alt kenarda yukarı açılır ve hücre kaydırılınca gizlenir. × yalnız bu seçim için gizler; "Don't show" cihaz tercihidir (tarayıcı depolaması yoksa varsayılan açık) ve grid bağlam menüsünden geri açılır. Klavye alternatifleri Ctrl+C, Shift+F10 bağlam menüsü ve Enter/Details'tir; toolbar'ın kendisi odak sırasını değiştirmez. 400 birim testi ve gerçek WebView2 testi (`20261102-010226-d1e45bd9`) geçti.

- **FI-136 · Tamamlandı:** Table view &gt; Columns listesinde bir kutudan sürüklemeye başlamak, ilk sütunun tersine çevrilmiş durumunu sürüklenen tüm sütunlara uygular; her sütunun başlangıç durumu ne olursa olsun sonuç tutarlıdır. Hızlı sürüklemede ara durum kaybolmaz. Klavye alternatifi olarak sütun aramasından sonra "Show/Hide N matching" eylemleri ve mevcut Space ile tek kutu değiştirme vardır. En az bir sütun görünür kalır; engellenen değişiklik açık mesajla bildirilir. 397 birim testi ve gerçek WebView2 sürükleme testi (`20261102-005832-d8492aef`) geçti.

- **FI-144 · Tamamlandı:** Mevcut satır işaretleri (row-number çift tıklama) grid kaydırma çubuğunun yanında ince bir şeritte gösterilir. Konum, satır kimliğinin geçerli filtrelenmiş/sıralanmış sayfadaki sırasından hesaplanır; yakın işaretler birleşir (en fazla 500), görünüm dışındaki işaret sayısı tooltip'te yazılır. İşarete tıklama veya Ctrl+Alt+Down/Up ilgili satıra gider. Renk tema `--warning` tokenından gelir. 395 birim testi ve gerçek WebView2 testi (`20261102-005442-d990bedc`) geçti.

- **FI-152 · Tamamlandı:** Grid bağlam menüsündeki "Column widths" bölümü seçili hücrelerin sütunlarını (veya yüklenmiş sütun seçimini) kullanır: genişlikleri ortalamada eşitler (en az iki sütun), mevcut "fit" ölçümüyle içeriğe sığdırır veya grid'deki kalan yatay alanı seçili sütunlara bölüştürür. Seçilmeyen sütunlar değişmez; genişlikler mevcut 70–700 px sınırında kalır, alan yoksa açık mesaj gösterilir. 393 birim testi ve gerçek WebView2 testi (`20261102-005229-2a9321c3`) geçti.

- **FI-145 · Tamamlandı:** Toolbar "Copy selection" paneli kopyalamadan önce seçili satır × sütun × hücre sayısını ve kapsamı gösterir: geçerli sayfadaki seçim, diğer sayfaların ve henüz fetch edilmemiş satırların dahil olmadığı, ya da yüklenmiş sütun seçiminde görünümdeki tüm yüklenmiş satırlar. Her biçim header dahil/değil, JSON anahtarları, yalnız değer gibi içeriğini satırında ve tooltip'te belirtir. Grid bağlam menüsü başlığı da seçim boyutunu ve kapsamını gösterir. Kopyalama davranışı ve Ctrl+C değişmedi; seçim genişletilmez. 391 birim testi ve gerçek WebView2 testi (`20261102-004929-f2898811`) geçti.

- **FI-135 · Tamamlandı:** Sonuç hücresinde Alt+Enter veya bağlam menüsündeki "Expand cell text", kırpılmış görüntü metnini hücreye bağlı bir katmanda açar. Katman dar hücrede genişler, ekranın altında hücrenin üstüne açılır ve görüntü alanında kalır; sütun/satır kimliğini ve kırpılmamışsa bunu gösterir. Biçimlendirilmiş görüntü metni (NULL etiketi dahil) kullanılır; 20.000 karakterden uzun değerlerde sınır açıkça yazılır ve ham/LOB değer için mevcut Inspect yolu önerilir. Escape odağı grid'e geri verir; dış tıklama, grid kaydırma ve pencere boyutu değişimi katmanı kapatır. Renkler tema tokenlarından gelir. 389 birim testi ve gerçek WebView2 testi (`20261102-004636-bc745df8`) geçti.

- **FI-134 · Tamamlandı:** Satır numarası başlığına (#) sağ tık veya grid içinde Ctrl+G, satır numarası girişini açar; mevcut toolbar "Navigate" eylemi de aynı çözümleyiciyi kullanır. Numaralar # sütununda gösterilen yüklenmiş sonuç sırasıdır; sıralama, filtre ve sayfalama yeniden numaralandırmaz. Filtreyle gizlenen satır, dondurulmuş satır ve yüklenen satır sayısını aşan numara (daha fazla fetch gerekir) ayrı mesajlarla açıklanır; başka sayfadaki satıra o sayfa açılarak gidilir. Gezinme fetch veya SQL başlatmaz. 386 birim testi ve gerçek WebView2 grid testi (`20261102-004406-2d137e91`) geçti.

- **FI-094 · Devam:** Editör bağlam menüsü ve komut paleti "Convert identifier case" önizlemesini açar. Seçimdeki unquoted identifier'lar snake_case, camelCase, PascalCase veya UPPER_CASE'e çevrilir; string/q-literal, yorum, bind değişkeni ve anahtar sözcükler değişmez. Tırnaklı identifier'lar case-sensitive olduğu için yalnız açık seçimle dahil edilir. Oracle'ın büyük harfe katladığı kimlik değişirse (ör. order_id → orderId) satır semantik yeniden adlandırma olarak işaretlenir; seçim dışındaki referanslar, diğer dosyalar ve DB nesneleri güncellenmez. `$`/`#` içeren, 128 baytı aşan veya anahtar sözcüğe dönüşen adlar atlanır ve listelenir. Seçim 100.000 karakter / 2.000 değişiklikle sınırlıdır. Uygulama yakalanan model sürümüne bağlıdır ve tek undo adımıdır. Proje adlandırma stilleri FI-080'e bağlı kaldığı için ana kutu açık. 383 birim testi ve gerçek Monaco masaüstü testi (`20261102-003842-55f8c7d8`) geçti.

- **FI-073 · Tamamlandı:** Getting started penceresi sabitlenmiş çalışma alanlarını ve son projeleri (son açılmaya göre, en fazla 8'er) proje şablonlarıyla birlikte gösterir; General'da ve hub'da "Show workspace hub on startup" ayarı vardır. Erişilemeyen veya etkin çalışma alanı açılamaz. Boş, Oracle paket ve migration şablonları yalnız yeni bir klasöre taslak dosya yazar; bağlantı tanımlamaz ve SQL çalıştırmaz. Yazma hatasında yalnız bu çağrının oluşturduğu klasör kaldırılır. Bridge sözleşmesindeki `enum` kısıtları artık JavaScript ve C# doğrulayıcılarında uygulanır; bilinmeyen şablon iki tarafta da reddedilir. 379 birim testi, bridge/domain tip kontrolleri, 11 native smoke projesi ve gerçek WebView2 masaüstü regresyonu (`20261102-001238-60ad163b`) geçti. Fiziksel klasör seçici penceresi doğrulanmadı.

- **FI-025 · Tamamlandı:** İsteğe bağlı semantik renklendirme Monaco range token sağlayıcısıyla parametre, yerel değişken, sütun/record alanı ve paket üyelerini ortak scope/metadata kimliklerinden ayırır. Gölgelenme, yorum/metin sabitleri ve bilinmeyen semboller korunur. Worker analizi görünür aralık, 100.000 karakter, 2.000 identifier ve 64 metadata çözümlemesiyle sınırlıdır; sınırlar ayarlarda açıklanır ve büyük dosyada durur. 375 birim testi ve gerçek Monaco renk/italik ayrımı testi (`20261101-141335-633c430c`) geçti.

- **FI-089 · Tamamlandı:** Yerel değişken hover alanı `%TYPE` sütun tipini (mevcut precision/scale ve CHAR/BYTE uzunluklarıyla), `%ROWTYPE` için ilk 200 alanı ve yerel `%TYPE` zincirlerini gösterir. Nesne şeması belirsizse başka şema tahmin edilmez; eksik/erişilemez, yaşı bilinmeyen ve TTL süresi geçmiş metadata açıkça belirtilir. Oturum cache kaydı alma/sona erme zamanlarını taşır; sunucunun DDL sonrası hâlâ aynı olduğu iddia edilmez. 373 birim testi, bridge/domain tip kontrolleri ve gerçek Monaco hover testi (`20261101-140819-63dad8cb`) geçti.

- **FI-048 · Tamamlandı:** Monaco overview ruler üç şeritle etkinleştirildi; mevcut tanı ve arama işaretlerine kayıtlı sürüme göre yerel değişiklikler eklendi. Fark hesabı worker içinde en fazla 1.000.000 LCS hücresi kullanır; daha pahalı aralıklar ve 500 işaret sınırı açıkça coarse olarak gösterilir. Büyük dosyada yerel fark hesabı durur; bilinmeyen baseline uydurulmaz. Sonraki yerel değişiklik butonu ve ruler tıklamasıyla gezinme sunulur; kayıt işaretleri temizler, gecikmiş kayıt yeni düzenlemeleri kaybolmuş saymaz. 371 birim testi ve gerçek dosyalı Monaco testi (`20261101-140513-e57664a8`) geçti.

- **FI-072 · Tamamlandı:** 524.288 karakterden itibaren hafif editör seçenekleri uygulanır; tamamlama/gezinme, tanılar, outline/folding ve kaynak kimliği/başlangıç karşılaştırması varsayılan kapalıdır. Her biri yalnızca bu belge için açıkça etkinleştirilebilir. Otomatik metadata ısınması ve statement gutter taraması da kapalı özelliklere uyar. 8 MB yerel okuyucu sınırı korunur. Gerçek dosya açma (`20261101-135840-f9cb3339`) ve worker isteği/tokenizasyon/normal moda dönüş (`20261101-140035-1c853388`) masaüstü testleri ile 369 birim testi geçti.

- **FI-052/FI-124/FI-125/FI-126 · Tamamlandı:** Sütun önerileri benzersiz sütunlarda da gerçek alias ile nitelenir; mevcut doğrulanmış bileşik FK join önerileri korundu. Public API görünümü yalnızca tamamlanmış spec bildirimlerinden overload, mod, özgün default ifadesi, dokümantasyon ve tipleri kaynak bağlantısıyla sunar; body reddedilir. Sekme önizlemeleri ilk 8 satır/1000 karakterle sınırlıdır; fare ve Alt+Down ile kaynak, bağlantı ve son durumu gösterir. Mevcut dock edilmiş dikey editör listesi artık dosya/yol/bağlantı araması ve klavye gezinmesi içerir; genişliği mevcut ayraçla değişir. 368 birim testi, bridge/domain tip kontrolleri ve gerçek masaüstü testi (`20261101-135453-5378c420`) geçti.

- **FI-137 · Tamamlandı:** Uzun editör, bağlantı, Oracle nesnesi, workspace, File ve sütun ana menülerinde yerinde eylem araması eklendi. Tüm arama sözcükleri eşleşir; disabled eylemler korunur. Ok tuşları ve Enter filtrelenmiş eylemlerle çalışır; Escape önce filtreyi temizler, sonra menüyü kapatır. 365 birim testi ve gerçek masaüstü testi (`20261101-135030-5df27ad6`) geçti.

- **FI-049/FI-127/FI-138 · Tamamlandı:** View / Layout içinde üç hazır düzen ve en fazla 12 adlandırılmış kullanıcı düzeni, uygulanmadan önce minyatür önizleme ve Ctrl+Alt+1/2/3 geçişleri eklendi. Yerel ayarlarda yalnızca panel geometrisi saklanır; workspace genişletme yolları kayda alınmaz. Başlık butonuyla/geçerli boş başlık alanına çift tıklayarak editör veya sonuç geçici büyütülür; Escape eski geometriyi geri getirir. 364 birim testi ve gerçek masaüstü testi (`20261101-134811-272ee986`) geçti.

- **FI-128/FI-129/FI-130 · Tamamlandı:** View / Quick paneli font, satır yüksekliği, ortak yoğunluk ve seçili sonuçtaki NULL metnini anında uygular; ham değerler korunur. Alt çubuk iptal/çalıştırma, gerçek hata, bekleyen transaction ve seçim özetini önceliklendirir; commit modu fiziksel oturumdan gelir. 362 birim testi, üretim derlemesi ve gerçek WebView2 masaüstü regresyonu geçti (`20261101-134539-c6ef46e9`).

- **FI-114 · Başlandı:** `.pks`, `.pkb`, `.prc`, `.fnc`, `.trg` dosyaları workspace ağacına, dosya/içerik aramasına, Git/replace, workset, açma/kaydetme, kopyalama ve taşıma/yeniden adlandırma akışlarına eklendi. Yeni dosyalarda uzantıya göre kaynak şablonu oluşturulur; dosya oluşturma SQL çalıştırmaz. Her dosya mevcut bağımsız belge, kayıt, imleç ve bağlantı tercihi modelini kullanır.

- **FI-114 · Devam:** Kaynak bildiriminden nesne türü/şema/ad ve özgün kaynak konumu çıkarılıyor; tür/uzantı uyuşmazlığı editörde gösteriliyor. Bu kontrol tam PL/SQL sözdizimi veya Oracle derleme doğrulaması değildir. Yapılandırılabilir uzantı eşlemeleri bu dilimde eklendi; özel derleme eylemleri kaldığından FI-114 tamamlanmadı.

- **FI-075 · Başlandı:** Açık yerel spec/body dosyaları arasında buton, komut paleti ve editörde Alt+O ile geçiş eklendi. Eşleme kaynak bildirimi, workspace, bağlantı ve şema kimliğine dayanır; çoklu eşleşmede seçim yapılmaz. Şeması bilinmeyen niteliksiz bildirimler aynı klasörde veya açık proje yol çifti içinde olmalıdır. Dosyaların bağımsız dirty/kayıt ve mevcut imleç konumu korunur. Alt+Shift+O, proje kurallarıyla ilişkili kaynak ve test dosyalarını kullanıcı seçimi için açar; testler otomatik çalıştırılmaz.

- **FI-075/FI-115 · Devam:** Açılmamış eş kaynakları bulmak için kullanıcı tarafından başlatılan, en fazla 300 dosya / dosya başına 1 MB / toplam 8 MB içerik okuyan keşif eklendi. Eksik tarama ve atlanan dosyalar görünür; dosya açılması açık bir seçim gerektirir. Açık dosyanın unsaved içeriği disk sürümünden önce gelir. Tekil, karşılıklı eşleşmeler tek mantıksal sekmede Specification/Body alt görünümleriyle sunulur. Belgelerin kayıt, imleç ve fiziksel oturumları birleşmez.

- **FI-001/FI-114 · Devam:** Proje kuralları `<workspace>/.fbsdb/workspace.json`içinde sürüm/revizyon kontrolüyle saklanıyor. Project rules ekranı uzantı/tür, spec/body yol çiftleri ve test yol kalıplarını düzenliyor. Geçersiz veya workspace dışına çıkan yollar reddediliyor; başka bir düzenleme yapılmışsa eski kayıt mevcut kuralları ezmiyor. `.sql` genel SQL türü olarak korunuyor.

- **FI-115 · Tamamlandı:** Nesne kimliği ve yapılandırılabilir proje yol kurallarıyla tek mantıksal paket sekmesi, bağımsız alt görünümler/kayıt/imleç ve Alt+O geçişi.

- **FI-075 · Tamamlandı:** Test dosyasından spec/body kaynaklarına ters gezinme, her adayın gerçek bildirimini proje test kalıbına uygulayarak çözülür. Birden fazla aday açık seçim için listelenir; unsaved içerik korunur ve SQL çalışmaz.

- **FI-003/FI-114 · Tamamlandı:** Compare and compile eylemi, kaynak/uzantı doğrulaması, sunucu farkı, açık DDL onayı ve mevcut Problems konumlarına dönüş bağlandı. CREATE ön eki oluşturulan ve SQLPlus `/` sonlandırıcılı kaynaklarda derleme hataları özgün editör konumuna eşleniyor.

- **FI-009 · Devam:** Bağlı yerel kaynak açıldığında metadata başlangıç sürümü yakalanıyor. Kaynak kimliği, içerik özeti, nesne kimliği/DDL zamanı ve Oracle bağlamı karşılaştırılıyor; derlemeden hemen önce aynı fiziksel oturumda yeniden kontrol ediliyor. Başka oturumun bu son kontrolden sonra DDL göndermesi atomik olarak engellenmiyor ve arayüz bu sınırı açıklıyor. Çok nesneli scriptlerin kaynak adımları da aşağıdaki ayrı inceleme kapısına bağlıdır.

- **FI-004/FI-090 · Tamamlandı:** Public paket spec ve bağımsız rutin imzalarından çağrı üretme, tipli IN/OUT/IN OUT girişleri ve function dönüşleri eklendi. Desteklenen skaler bindler NUMBER, VARCHAR2/NVARCHAR2, DATE, TIMESTAMP ve IN CLOB'dur; record/collection ve desteklenmeyen tipler tahmin edilmeden gösterilir. Varsayılan parametreyi atlama ve overload imzası korunur. Çağrı/parametre tanımları `.fbsdb/runs` altında sürümlü saklanır; değerler, sonuçlar ve bağlantı bilgileri saklanmaz. Açma/kaydetme çalıştırmaz; Run call açık eylemdir.

- **FI-055/FI-107/FI-123/FI-153 · Tamamlandı:** Açık ortam etiketleri editör sınırında, sekmelerde ve kayıtlı profil eşlemesiyle proje ağacında gösterilir. Sekmeler bağlantı ve bekleyen transaction durumunu metin/şekille de gösterir. Sonuçlar özgün editör snapshot, profil, fiziksel oturum nesli ve SQL özetiyle ilişkilendirilir; kaynak veya oturum değişirse görünür uyarı çıkar. Kayıt/dirty durumu bu karşılaştırmadan bağımsızdır. Read-only metadata görünümü arka plandaki SQL belgesini çalıştıramaz veya kaydedemez.

- **FI-042 · Tamamlandı:** ORA-06512 nesne/satır çerçeveleri Results/Output ve Problems içinde kaynağa bağlanır. Native metadata gerçek nesne türünü çözer, pakette gövdeyi seçer; erişimsiz veya çok anlamlı adlar tahmin edilmez. Kaynak salt okunur açılır. Adlandırılmış çerçevelerde çalıştırma sürümünün bilinmediği, kaynağın hata sonrasında okunduğu görünürdür; anonim blok özgün gönderilen snapshot ile konumlandırılır. Oturum değişirse eski çerçeve yeni bağlantıdan kaynak açamaz. Canlı Oracle ve izole WinUI kaynak/satır doğrulamaları geçti.

- **FI-047 · Tamamlandı:** Explorer &gt; Structure paneli ve komut paleti eylemi, mevcut worker outline modelinden prosedür/function, iç rutin, cursor, type ve subtype bildirimlerini listeler. Metin/tür filtreleri, boş durum ve özgün kaynak konumuna dönüş izole WinUI üzerinde doğrulandı. Panel açık dosyayla güncellenir.

- **FI-029 · Tamamlandı:** İmza/aktif argüman yardımına aynı modelden bağlı yerel yorumlar, mevcut metadata açıklaması ve tip/değer gerektiren örnek bind çağrıları eklendi. Açıklama yoksa bu durum açık yazılır. Overload ve named-argument takibi korunur; gerçek Monaco parameter hints görünümü native UI testinde doğrulandı.

- **FI-002 · Tamamlandı:** F12 tanım, Alt+Left/Right ve Shift+F12 mevcut belge referansları ortak sembol kimliğine bağlandı. Yerel shadowing, metadata nesne/ sütun kimliği ve yorum/literal ayrımı korunur. Referans kapsamı açık belgede 100.000 karakter/128 aynı adlı adayla sınırlıdır; eksik tarama bildirilir. Dinamik SQL ve belirsiz yerel overload tahmin edilmez. Sunucuda toplanmış referanslar mevcut açık PL/Scope eyleminde kalır. Klavye akışları WinUI üzerinde doğrulandı; debugger test yardımcısının F-tuş/ok tuş kodları düzeltildi.

- **FI-009 · Tamamlandı:** Çok nesneli script, native tarafta her CREATE/ALTER PL/SQL kaynak adımından hemen önce durur. Kaynak diff ve açık onaydan sonra aynı SQL/sunucu sürümü tek kullanımlı token ile yeniden doğrulanır; spec/body ayrı ayrı ve sırayla incelenir. İptal kalan scripti durdurur, önceki adımları geri almış gibi göstermez. Onay sekme/run/adım/nonce kimliğine bağlıdır. Dosyadaki ilk 32 kaynağın başlangıç sürümü sınırlı, gecikmeli metadata okumasıyla alınır; daha sonraki adımlarda önceki baseline yoksa bu açık gösterilir. Native gate testleri eski/başka sekme onaylarını ve iptal temizliğini; WinUI testi iki gerçek Monaco diff, ayrı onaylar, değişmiş metin koruması ve iptali doğruladı. UI script/metadata sınırı fixture'dır; gerçek Oracle sürüm doğrulaması ayrı canlı regresyonda sınandı.

- **FI-001 · Tamamlandı:** Proje kuralları paket/migration/script/test klasörlerini, saved profile referanslarını/default profili, tipli bind tanımlarını ve run varsayılanlarını saklar. Explorer alan filtresi; proje bağlantı komutları; açık “New project SQL file” ve “Use project run defaults” eylemleri bağlandı. Proje açma/kaydetme bağlantı veya SQL başlatmaz; yeni proje SQL dosyası yalnız tanımlı default profile açık eylemle bağlanır. Eksik profil silinmeden gösterilir. Bind değerleri her çalıştırmada girilir; dosya tanımları proje tanımlarını geçersiz kılabilir. Timeout/page-size açık uygulanır; transaction modu ayrı kalır. Native doğrulama/persistence ve izole WinUI kayıt, yeniden açma, defaults, alan seçimi, yeni belge ve gerçek bind formu testleri geçti. R1 katalog kapsamı tamam.

- **FI-147 · Tamamlandı:** View &gt; Layout ve komut paletinde kalıcı yerleşim kilidi; panel sürükleme, dock/split/results/inspector yeniden boyutlandırma pointer ve klavye yollarında engellenir. Mevcut yerleşim korunur; görünür “Layout locked · Unlock” eylemi ve panel menüsünden açıkça açılır. Native UI testinde kilitli drag/resize değişiklik yapmadı; unlock sonrası resize çalıştı.

- **FI-139 · Tamamlandı:** Aynı adlı sekmeler ve Open editors, yalnızca ayırıcı en kısa klasör son ekini gösterir. Tam yol mevcut tooltip altyapısında korunur; aynı yolun bağımsız kopyaları, draft ve server görünümleri ayrıca ayrılır. Farklı klasörlerde aynı adlı gerçek dosyalar native UI testinde doğrulandı.

- **FI-148 · Tamamlandı:** Toplu kapatma incelemesi kirli belgeleri tek listede sunar; her belge için save/keep/discard seçilebilir. Kaydetme native onayı bekler, açık tutulan buffer korunur ve DB transaction kararı ayrı kalır. İncelenen içerik değişirse eski karar uygulanmaz. Native testte bir dosya kaydedilip kapandı, biri unsaved açık kaldı, diğerinin yalnız buffer'ı atıldı.

- **FI-046 · Tamamlandı:** Son/önceki/sonraki edit konumları, belge kimliği ve metin değişimleriyle taşınan offsetlerle (en fazla 100 konum) tutulur. Ctrl+Alt+ Home/PageUp/PageDown kısayolları özelleştirilebilir. Ctrl+Alt+End, son çalıştırılan SQL'in tekil güncel konumuna döner; kaynak değişmiş/belirsizse ayrı salt okunur execution snapshot açar. Snapshot açma SQL çalıştırmaz. Her iki akış gerçek Monaco/native UI testlerinde doğrulandı; kapatılmış belge konumları temizlenir.

- **FI-054/FI-081/FI-082 · Tamamlandı:** Ortak worker outline modeli Monaco document-symbol/folding sağlayıcılarına bağlandı. Breadcrumb proje/şema ve paket/rutin/blok yolunu gösterir; düğümler ve komşu sembol seçimi konuma gider. View &gt; Editor'da kalıcı sticky header ayarı vardır. Eşleşen `-- #region Name`/ `-- #endregion` yorumları katlanır; “Focus current PL/SQL routine” ve “Show all source regions” Monaco'nun katlama eylemlerini kullanır. Native test sibling geçişi, gerçek sticky rutin başlığı, diğer rutini katlama/geri açma ve named region katlamayı kaynak metnini değiştirmeden doğruladı.

- **FI-071 · Tamamlandı:** Adlandırılmış yer imleri, glyph işaretleri ve Ctrl+Alt+B/J/Shift+J kısayollarıyla ekleme/ileri/geri gezinme eklendi. Yerel düzenlemelerde konumlar taşınır; dosya işaretleri yalnız yol/ad/satır/sütun olarak cihazda saklanır (200 sınırı), draft/server işaretleri session-only'dir. Kaydedilmiş kapalı dosya açık eylemle yeniden açılır. Native test konum kayması, kalıcılık, WebView yeniden yükleme ve kapalı dosyaya dönüşü SQL çalıştırmadan doğruladı. Bu testin ortaya çıkardığı, kapatılmış başlangıç sekmesinden sonra UI reload/bootstrap hatası da düzeltildi; normal kapalı-sekme komutları hâlâ reddedilir ve yeniden başlatılan UI boş, yeni fiziksel oturum alır.

- **FI-022 · Tamamlandı:** Ctrl+P birleşik araması mevcut dosya/editor/Oracle/ bağlantı/history kaynaklarına current-source sembollerini, ayarları ve komutları ekler. Her tür ayrı filtrelenir ve büyük şema diğer türleri gömmez. Ayar seçimi ilgili Settings aramasını açar; General'da opsiyonel double Shift tetikleyicisi vardır. Native test sembol, komut, ayar hedefi ve double Shift'i doğruladı. LF/CRLF dosya açılışında Monaco EOL eşlemesi düzeltildi; model hizalama belgeyi dirty yapmaz ve satıra gitme kaynak konumunu korur.

- **Sıradaki dilim:** R2 dosya/sekme ergonomisi; ayırt edici sekme yolları ve kilitlenebilir panel yerleşimi, ardından diğer günlük kullanım akışları.

- **Doğrulama:** 359 JavaScript testi, web üretim derlemesi, bridge/domain tip kontrolleri ve workspace/advanced-workspace/Git-replace native testleri geçti. Native kaynak keşfi sınırları ve bridge sözleşmesi de doğrulandı. Windows masaüstü uygulaması 0 uyarı ve 0 hatayla derlendi; masaüstü regresyonu başlangıç, sekme/dosya/kayıt, dirty kapanış ve kurtarma senaryolarını geçti. Paket gruplama ve keşif seçimi ayrıca izole WinUI/WebView2 üzerinde uçtan uca sınandı: proje kurallarını kaydet/yeniden aç, özel uzantılı eş kaynağı keşfet ve grupla, iki kaynağın unsaved metin ve imlecini koru, grup kapanışını iptal et, yalnız aktif dosyayı kaydet ve ilişkili testi SQL çalıştırmadan aç, testten unsaved kaynağa geri dön. On bir native smoke projesi geçti. Canlı Oracle regresyonu benzersiz geçici prosedür/paketlerde derleme, derleme hataları, spec/body sürüm ayrımı, sunucu çakışması, eski/tekrar kullanılan inceleme belirteci ve bekleyen DML korumasını doğruladı; fixture nesneleri temizlendi. Native renderer testi gerçek Monaco diff, değişiklik uyarısı, açık onay ve değişmiş editör korumasını deterministik metadata sınırıyla doğruladı. Kayıtlı çağrı native UI testi gerçek kayıt/yeniden yüklemeyi, değerlerin saklanmamasını, açık Run ve bağlantısız çalışma korumasını sınadı (çalıştırma callback sınırında yakalanır). Canlı Oracle testi tekrar çağrı, function overload seçimi, 38 basamaklı NUMBER, OUT/IN OUT, NULL ve nanosaniyeli tarih/saat dönüşlerini doğruladı. Fiziksel dosya seçici penceresi doğrulanmadı.

### Fazlar arası ortak kararlar

- Mevcut Git, Monaco, docking, mini-tool, değer inceleme, streaming CSV ve bağlantı tanılama yeteneklerini genişlet; her özellikte mevcut davranışla farkı belirle.
- Yerel dosya, veritabanı nesnesi, kaynak sürümü, sonuç kümesi ve fiziksel oturum kimliklerini ayır. Semantik gezinme, kaynak senkronizasyonu ve grid yazma bu modele dayanır.
- R3 içinde önce düzenlenebilirlik/satır kimliği ve taslak modeli (H), sonra transaction/hata/çakışma modeli (I), ardından uçtan uca yazma akışı tamamlanır. Kullanıcıya DML açılmadan bu iki grubun temel sözleşmeleri birlikte hazır olmalıdır.
- R3'ün batch politikası (`FI-207`) ilk teslimde tanımlanır; kullanıcıya politika seçtirme ve ileri savepoint araçları R4'te genişletilir. R4 toplu giriş işleri (J) bu sözleşmeyi kullanır.
- Otomatik kod çalıştırma ekleme; çalıştırma, Apply ve Commit eylemlerini açık tut. Commit fiziksel oturumdaki tüm bekleyen işi kapsar. Belirsiz uygulama/commit sonucu doğrulanmadan otomatik tekrar deneme yapma.
- Şifre, hassas bind ve sonuç değerlerinin saklanması özellik bazında tanımlanır. Dinamik SQL, kısmi metadata ve desteklenmeyen semantik durumlar açıkça işaretlenir.
- Faz takvimleri ve efor tahminleri, kapsam ve mevcut uygulamayla farklar doğrulandıktan sonra belirlenir. Bu doküman kodun tamamlanma durumuna ilişkin bir denetim değildir.

## 2. Konu grupları ve kapsam

| Grup | Alan | Öneri sayısı | Ana bağımlılık |
| --- | --- | --- | --- |
| A | Proje, paket ve kaynak yaşam döngüsü | 17 | Workspace, nesne/dosya kimliği ve kaynak sürümleri |
| B | Kod gezinmesi ve semantik bilgi | 25 | A grubunun kaynak ve sembol modeli |
| C | Editör üretkenliği ve refactoring | 24 | B grubunun semantik analizi ve düzenleme önizlemesi |
| D | Çalıştırma, bind parametreleri ve bağlantı bağlamı | 26 | Tipli bind modeli ve fiziksel oturum sahipliği |
| E | Git, test, derleme otomasyonu ve ileri Oracle araçları | 11 | A/B kaynak modeli, Git ve test/Oracle entegrasyonları |
| F | Çalışma alanı, sekmeler ve arayüz ergonomisi | 29 | Mevcut docking, sekme ve belge durum yönetimi |
| G | Sonuç inceleme, büyük veri ve grid görünümü | 22 | Sonuç metadata, cursor ve LOB yaşam döngüsü |
| H | Grid düzenleme modeli ve değişiklik incelemesi | 30 | G sonuç modeli ve güvenilir satır kimliği |
| I | DML uygulama, transaction ve tutarlılık | 27 | H taslak modeli ve D oturum/transaction bağlamı |
| J | Toplu veri girişi ve düzenleme kısayolları | 20 | H/I doğrulama, uygulama ve kurtarma modeli |

## 3. Özellik kataloğu

Ana checkbox, özelliğin katalogdaki bütün kapsamının tamamlandığını gösterir. Kısmi teslimlerde tamamlanan alt işlere `[x]` konur; ana kutu açık kalır. Kutunun açık olması, mevcut uygulamada o özelliğin hiçbir parçası olmadığı anlamına gelmez; katalog dışında kalan eski yeteneklerin tam kapsam denetimi yapılmamıştır.

Her alt başlık bir konu grubunun ilgili fazdaki kapsamını toplar. Özelliklerin özgün teknik koşulları aşağıda korunmuştur.

### A. Proje, paket ve kaynak yaşam döngüsü

#### R1 — IDE çekirdeği

- [x] **FI-001 · R1** — Project system: packages, migrations, scripts and tests organized with project-specific connections, variables and run settings.

  - [x] Workspace içinde sürümlü proje kuralları, uzantı eşlemeleri ve paket/test yol kalıplarını sakla; eşzamanlı kural değişikliğinde eski kaydı reddet.

  - [x] Proje bağlantıları, değişkenleri ve çalıştırma ayarları ile proje alanlarını bütünleştir.

- [x] **FI-003 · R1** — Package development: switch between specification and body, compile, and navigate from compilation diagnostics to the relevant source line.

- [x] **FI-009 · R1** — Database/source synchronization: detect when the database definition has changed during local editing and show differences between local and server versions before publishing changes.

  - [x] Bağlı yerel tek nesneli kaynakta metadata başlangıç sürümünü yakala ve sonraki sunucu değişimini göster.

  - [x] Monaco diff görünümünde güncel sunucu kaynağı ile gönderilecek kodu karşılaştır; açık onay olmadan derleme gönderme.

  - [x] Sunucu sürümü, fiziksel bağlantı veya yerel metin değişirse incelemeyi geçersiz kıl; belirteci tek kullanımlı ve süreli tut.

  - [x] Normal Run ve tek nesneli Run script eylemlerini aynı derleme incelemesine yönlendir.

  - [x] Çok nesneli genel SQL scriptlerinde her nesne için ayrı kaynak eşzamanlama incelemesini tamamla.

- [x] **FI-075 · R1** — Related files: navigate between package specification, body and associated test files using project naming conventions and a dedicated shortcut.

  - [x] Açık yerel spec/body dosyaları arasında kaynak kimliğiyle geçiş (buton, komut, Alt+O).

  - [x] Şema/bağlantı/workspace farkında veya çoklu eşleşmede otomatik hedef seçme.

  - [x] Açılmamış spec/body kaynaklarını sınırlı workspace taramasıyla bul; hedefi kullanıcıya seçtir.

  - [x] Keşifte disk içeriği yerine açık dosyanın kaydedilmemiş metnini esas al.

  - [x] Kalıcı proje yol kalıplarını ve ilişkili test dosyalarını keşfe bağla (Alt+Shift+O).

  - [x] Test dosyasından kaynak pakete ters yönlü ilişki çözümleme ekle.

- [x] **FI-114 · R1** — Oracle-specific file types: associate .pks, .pkb, .prc, .fnc and .trg files with package specifications, package bodies, procedures, functions and triggers respectively. Offer type-specific creation templates and explicit compilation actions. Treat extensions as conventions, validate actual source declarations and allow configurable associations where conventions differ.

  - [x] Oracle uzantılarını workspace, arama, Git/replace ve workset akışlarına dahil et.

  - [x] Açma/kaydetme ve kopyalama/taşıma/yeniden adlandırmada uzantıları koru.

  - [x] Yeni dosyalara türe göre şablon oluştur; oluştururken SQL çalıştırma.

  - [x] Kaynak bildirimindeki türü tanı; uzantıyla uyuşmazlığı editörde göster.

  - [x] Yapılandırılabilir uzantı/tür eşlemelerini şablon, dosya seçici, arama, Git/replace ve workset akışlarına bağla.

  - [x] Compare and compile eylemi, sunucu farkı incelemesi ve kaynak sürümü kontrolüyle derleme ekle.

- [x] **FI-115 · R1** — Group related package files in one editor tab: expose package specification and body as subviews of a single logical tab, with a shortcut to switch between them. Preserve independent file identity, dirty/save state and cursor position; determine pairing from object identity and configurable project conventions rather than filename similarity alone.

  - [x] Tekil spec/body eşleşmesini sekme şeridinde tek mantıksal sekmede grupla.

  - [x] Specification/Body alt görünümlerini sun; dosyaların bağımsız kayıt, dirty, oturum ve imleç durumlarını koru.

  - [x] Grup kapanışını iki belgenin mevcut kapanış incelemesine yönlendir; Open editors içinde tekil dosya kapanışını koru.

  - [x] Yapılandırılabilir proje yol kurallarını kaynak/bağlantı/şema kimliğini koruyarak eşlemeye dahil et.

#### R2 — Günlük kullanım ve sonuç inceleme

- [x] **FI-014 · R2** — Local History: compare and restore prior local file versions independently of Git commits.

- [x] **FI-043 · R2** — Contextual file creation: create related tests, migrations or example calls from a package using project conventions.

- [x] **FI-073 · R2** — Welcome workspace hub: show recent projects, pinned workspaces and project templates together at startup.

- [x] **FI-084 · R2** — Virtual database source tree: browse database packages as virtual source files, explicitly distinguishing server definitions from local files.

- [x] **FI-110 · R2** — SQL companion parameter forms: store bind labels, types and optional defaults beside SQL files and restore a parameter form on open without execution. Reuse mini-tool metadata where appropriate and exclude sensitive defaults.

- [x] **FI-112 · R2** — Workspace portability checks: identify machine-specific absolute paths, TNS dependencies and local tools needed on another computer.

- [x] **FI-124 · R2** — Package API surface view: present only publicly declared package signatures, documentation and types as a readable reference page. Derive visibility from the specification, retain overload and parameter-mode/default information, link entries to source and indicate whether the source is local or from the database. Exclude private body implementation details from this view.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-021 · R4** — DDL-to-project scaffolding: generate package specifications/bodies, CRUD procedures and test drafts for selected tables using project naming templates; generation does not execute the resulting code.

- [ ] **FI-033 · R4** — Migration workbench: author versioned schema changes, track applied migrations per environment and preview an application plan.

- [ ] **FI-034 · R4** — Offline development: cache schema metadata for completion, navigation and supported static checks without a connection; show cache age and scope.

- [ ] **FI-064 · R4** — Project health panel: consolidate local changes, objects needing compilation, compilation diagnostics and failed tests with navigation to relevant actions.

### B. Kod gezinmesi ve semantik bilgi

#### R1 — IDE çekirdeği

- [x] **FI-002 · R1** — Code navigation: go to definition (F12), find references (Shift+F12), and back/forward navigation for Oracle and PL/SQL symbols.

- [x] **FI-029 · R1** — Quick documentation and parameter info: show signatures, documentation and example calls at the caret, with active-argument tracking while typing.

- [x] **FI-047 · R1** — File structure panel: browse and filter procedures, functions, cursors and types in the current package, then navigate to their source locations.

- [x] **FI-000 · R1** — Editor üzerindeki toolbarı yeniden tasarla, maximize button konumu değişmeli, toolbar fonksiyonları artmalı ve sola dayalı olmalı. Bu task önceliklidir.

#### R2 — Günlük kullanım ve sonuç inceleme

- [x] **FI-022 · R2** — Search Everywhere: extend existing Ctrl+P search with symbols, settings and commands, optionally opened by double Shift.

- [x] **FI-025 · R2** — Semantic highlighting: distinguish parameters, local variables, columns and package members using symbol scope where available.

- [x] **FI-041 · R2** — Inline documentation preview: render procedure comments in the editor and generate documentation skeletons from parameter definitions.

  - [x] İmleçteki PROCEDURE/FUNCTION için parametre ve dönüş tiplerinden belge iskeleti üret.

  - [x] Yordam yorumlarını editörde (hover/önizleme) işlenmiş biçimde göster.

- [ ] **FI-044 · R2** — Peek Definition: inspect and edit a definition in an inline editor without leaving the current source location.

- [x] **FI-046 · R2** — Change navigation: return to the last edit, move between edit locations, or return to the last executed SQL location.

- [x] **FI-048 · R2** — Editor overview ruler: mark diagnostics, search matches and local changes along the editor edge with click-to-navigate behavior; extend existing Monaco capabilities rather than duplicating them.

- [x] **FI-052 · R2** — Alias-aware completion: qualify column suggestions with the applicable alias and propose join predicates from known column relationships.

- [x] **FI-054 · R2** — Code regions: define named foldable regions in long packages and focus on the procedure being edited, extending existing editor folding capabilities.

- [x] **FI-071 · R2** — Bookmarks: assign names or numbers to source locations and navigate through dedicated shortcuts.

- [x] **FI-080 · R2** — Project dictionary: define team abbreviations and domain terms for naming suggestions and spelling inspections.

- [x] **FI-081 · R2** — Breadcrumb navigation: show the current project/schema/package/procedure/ block path and offer navigation to neighboring symbols.

- [x] **FI-082 · R2** — Sticky code headers: keep enclosing procedure signatures and block headers visible when scrolling through long source files.

- [x] **FI-089 · R2** — Anchored type inspection: show resolved column types for %TYPE and record fields for %ROWTYPE, identifying unavailable or stale metadata.

- [x] **FI-092 · R2** — Structural minimap: label procedure boundaries and names within a source navigation map for large packages.

- [x] **FI-122 · R2** — Contextual editor menus: show table data/DDL actions on table references, run/compile actions on procedures and value/type actions on bind parameters; resolve the symbol and preserve explicit execution controls.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-010 · R4** — Structural search: find procedures writing to a table, blocks handling a particular exception, or packages referencing a particular column.

- [ ] **FI-019 · R4** — Call hierarchy: browse callers and callees in a bidirectional tree, with unresolved or dynamic calls identified where possible.

- [ ] **FI-026 · R4** — Inlay hints: display parameter names beside positional call arguments as editor decorations rather than source text.

- [ ] **FI-035 · R4** — Dependency graph: explore package, view and table relationships in an interactive graph with navigation to source definitions.

- [ ] **FI-060 · R4** — Column lineage navigation: trace a selected projection through aliases, CTEs and subqueries to source columns, showing unsupported or ambiguous cases.

- [ ] **FI-062 · R4** — Usage-informed completion: show real project call examples alongside package function completion suggestions.

- [ ] **FI-088 · R4** — Expected-type completion: rank compatible expressions and variables using the expected argument type, including DATE and cursor parameters.

### C. Editör üretkenliği ve refactoring

#### R2 — Günlük kullanım ve sonuç inceleme

- [x] **FI-018 · R2** — Live templates: expand abbreviations such as proc, cursor and exception into code skeletons with Tab navigation between placeholders.

- [x] **FI-023 · R2** — Structural selection: expand/shrink selection through expressions, conditions, SELECT statements and PL/SQL blocks.

- [x] **FI-038 · R2** — Paste-to-code actions: turn pasted spreadsheet values into an IN list, JSON into a JSON_TABLE draft, or column names into an INSERT template.

- [x] **FI-039 · R2** — Surround With: wrap selected code in BEGIN/EXCEPTION/END, IF, loops or timing blocks, with placeholder navigation and scope-aware supported transforms.

- [x] **FI-056 · R2** — Drag-to-SQL: drag tables or columns from the schema explorer to generate SELECT projections and supported relationship-based JOIN drafts.

- [x] **FI-058 · R2** — Postfix completion: expand supported expression suffixes into SQL templates, such as an IN predicate, or extract a selected query into a CTE.

- [x] **FI-059 · R2** — Smart Enter: complete supported syntax constructs with missing THEN, END IF, parentheses or statement terminators based on context.

- [x] **FI-077 · R2** — Column-to-multicursor editing: turn pasted result-column names into separate editor selections for simultaneous alias or function edits.

- [x] **FI-083 · R2** — Paired INSERT editing: match INSERT target columns with VALUES expressions, highlight corresponding entries and support contextual placeholder completion.

- [x] **FI-094 · R2** — Identifier case conversion: transform selected identifiers into snake_case, camelCase, UPPER_CASE or project naming styles while treating string literals separately. Respect quoted-identifier semantics and preview semantic renames.

  - [x] Seçimdeki identifier'ları snake_case/camelCase/PascalCase/UPPER_CASE'e çevir; string, yorum, bind ve anahtar sözcükleri koru.

  - [x] Tırnaklı identifier'ları varsayılan olarak atla; Oracle kimliğini değiştiren dönüşümleri önizlemede semantik yeniden adlandırma olarak işaretle.

  - [x] Proje adlandırma stillerini (FI-080 proje sözlüğü) dönüşüm seçeneklerine bağla.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [x] **FI-005 · R4** — Refactoring: rename local variables and parameters within their scope with a preview of the proposed edits.

- [x] **FI-008 · R4** — Quick fixes (Alt+Enter): propose contextual edits such as declaring an unknown local variable, generating a missing procedure skeleton, or fixing a supported compilation diagnostic. Preview edits before applying them.

- [ ] **FI-015 · R4** — Safe delete: find project references before removing a procedure or parameter, and show affected code. Report analysis scope and unresolved dynamic references rather than claiming complete coverage.

  - [x] Geçerli belgede çözülen başvuruları ve sınırlı çalışma alanı metin adaylarını silme öncesi incelemede göster; belirsiz kapsamı açıkla.

  - [ ] Proje çapı semantik doğrulama ve gerçek silme akışına inceleme kapısı ekle; atlanan/okunamayan dosyaları ayrı raporla.

- [x] **FI-016 · R4** — Change Signature: preview coordinated updates to supported call sites when adding, reordering or renaming procedure parameters.

- [x] **FI-017 · R4** — Extract Procedure: turn a selected PL/SQL block into a procedure and propose IN/OUT parameters based on variable usage, within supported semantic cases.

- [x] **FI-024 · R4** — Statement movement: move supported conditions, projection expressions and PL/SQL blocks up/down while preserving delimiters and indentation.

- [x] **FI-037 · R4** — Embedded SQL editing: open supported SQL strings inside EXECUTE IMMEDIATE in a dedicated SQL editor with completion and formatting, then write edits back with correct literal escaping. Handle dynamic fragments explicitly.

- [x] **FI-053 · R4** — Clipboard history: search recently copied code fragments and paste selected entries, including distribution across multiple selections. Retention should be optional and account for potentially sensitive SQL contents.

- [x] **FI-063 · R4** — Editing macros: record repeatable editor actions, name them and replay them through shortcuts; execution and external side effects require separate scope.

- [ ] **FI-079 · R4** — Dynamic SQL preview: show statically resolvable portions of concatenated SQL strings in a separate panel and mark unresolved fragments without execution.

- [ ] **FI-085 · R4** — Oracle regex workbench: test expressions against sample text, inspect matches/groups and insert the expression into SQL. Use Oracle-backed explicit evaluation or clearly label any local approximation and its limitations.

- [ ] **FI-086 · R4** — Date format designer: preview supported TO_CHAR/TO_DATE format models with sample dates and selectable format elements, exposing relevant NLS context and distinguishing Oracle evaluation from local approximation.

- [ ] **FI-113 · R4** — Explain expression at caret: explain a selected CASE expression, analytic function or window frame using a small illustrative dataset. Highlight the rows involved and resulting values, including partitioning, ordering, ties and ROWS/RANGE distinctions where applicable. Label example data clearly; do not execute user SQL implicitly or claim unsupported semantics are exact.

- [ ] **FI-118 · R4** — Inline color previews: decorate supported HEX/RGB values with color swatches and offer an explicit color picker edit without misclassifying arbitrary IDs.

### D. Çalıştırma, bind parametreleri ve bağlantı bağlamı

#### R1 — IDE çekirdeği

- [x] **FI-004 · R1** — Run configurations: save procedure calls and parameter definitions so users can repeat execution without rebuilding anonymous PL/SQL blocks.

- [x] **FI-042 · R1** — Stack trace navigation: link package names and source line numbers in error output to source, and show whether the available source matches the version associated with the failed execution when that information is available.

- [x] **FI-055 · R1** — Environment-aware editor appearance: use distinct borders or watermarks for production and other environments so connection context stays visible.

- [x] **FI-090 · R1** — Runnable call examples: generate a procedure invocation from its signature, let users supply parameters and explicitly execute the resulting call.

- [x] **FI-107 · R1** — Connection-colored files: indicate file/profile environment associations in editor tabs and the project tree, extending existing environment indicators.

- [x] **FI-123 · R1** — Changes since execution: mark SQL edits made after the latest execution and indicate whether displayed results correspond to the current source text.

- [x] **FI-153 · R1** — Connection state badges: represent connecting, connected, disconnected and pending-transaction states on tabs using shape/text as well as color.

#### R2 — Günlük kullanım ve sonuç inceleme

- [x] **FI-013 · R2** — Code lenses: contextual actions and reference counts above procedures and packages, including Run, Test, Compile and Go to body.

- [x] **FI-020 · R2** — Run consoles: retain parameters, DBMS_OUTPUT, errors and elapsed time per execution, and explicitly rerun a previous configuration. Parameter retention needs privacy controls and should exclude sensitive values by default.

- [x] **FI-027 · R2** — Scratch files: run temporary SQL/PLSQL experiments without adding project files, with an option to promote useful drafts into the project.

- [x] **FI-051 · R2** — Run gutter: provide contextual run actions beside supported procedures, anonymous blocks and SQL statements in the source editor.

- [x] **FI-057 · R2** — Session inspector: consolidate active-tab NLS settings, current schema, transaction status and available cursor information in an inspection panel.

- [x] **FI-065 · R2** — Editor-tab terminal: open a tool such as SQLcl in the project directory with the selected connection context. Use supported secure authentication paths; do not place credentials in command history or process arguments. An external tool has its own session and transaction, distinct from the editor tab.

- [x] **FI-074 · R2** — Windows taskbar execution status: show indeterminate progress for running queries and offer completion notifications containing elapsed time. Show percentage progress only when meaningful progress data is available.

- [x] **FI-076 · R2** — Quick evaluation: explicitly execute a selected supported SQL expression with supplied bind values and show the result in a small window. Evaluation must not silently execute code or assume called functions are side-effect free.

- [x] **FI-087 · R2** — Post-execution preferences: configure optional result-panel activation, sounds or window attention behavior after query completion.

- [x] **FI-093 · R2** — Result-to-bind drag and drop: create a typed bind placeholder from a result cell and populate its value without injecting a SQL literal or persisting sensitive values by default.

- [x] **FI-109 · R2** — Execution budgets: configure per-query time, fetched-row and client-memory limits and choose supported behavior when a limit is reached. Distinguish client safeguards from server resource guarantees.

- [x] **FI-111 · R2** — Connection troubleshooting: expose DNS, port, service and authentication stages with understandable failure details; extend existing connection diagnostics rather than duplicate them.

- [x] **FI-116 · R2** — Inline bind inputs: enter query bind values in interactive fields beside the relevant source lines instead of a separate dialog. Render fields as editor UI without modifying source text; synchronize repeated named binds, preserve Oracle type and NULL distinctions, and scope values to the intended execution context. Do not persist sensitive values by default.

- [x] **FI-117 · R2** — Bind value pickers: provide calendar controls for dates, explicit choices for boolean-like values and searchable record pickers for configured related identifiers. Respect Oracle types; record searches require explicit queries.

  - [x] DATE/TIMESTAMP için takvim (datetime-local) ve boolean benzeri adlar için Y/N/1/0 seçimi.

  - [x] Yapılandırılmış ilişkili tanımlayıcılar için aranabilir kayıt seçici (açık sorguyla).

- [x] **FI-119 · R2** — Per-statement execution summaries: show the latest duration, row count and result link beside each executed SQL block, with execution provenance.

- [x] **FI-120 · R2** — Bind usage highlighting: focus an inline bind field to highlight all matching parameter occurrences within the relevant statement/execution scope.

- [x] **FI-121 · R2** — Inline subquery trials: explicitly run a selected supported subquery with temporary binds and show a small inline result table. Identify unresolved correlated references rather than silently changing query semantics.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-091 · R4** — Execution queue: queue subsequent statements while the same session is busy, with reorder/removal controls before execution. Capture submitted SQL and binds explicitly; define failure and transaction behavior before implementation.

#### R5 — İleri Oracle ve genişletilebilirlik

- [ ] **FI-069 · R5** — SSH connection tunnels: manage SSH forwarding for Oracle connections and expose tunnel status and connection failure details within the application.

### E. Git, test, derleme otomasyonu ve ileri Oracle araçları

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-006 · R4** — Integrated Git workflow: changed files, line diffs, staging and commits; compare local source with the database definition. Extend existing workspace Git capabilities where appropriate.

- [ ] **FI-011 · R4** — Test Explorer: browse PL/SQL tests, run a test or suite, and navigate from a failed assertion to its source location.

- [ ] **FI-012 · R4** — Task runner: define explicit sequences such as compile, run tests, then check invalid objects; show progress and output per step.

- [ ] **FI-028 · R4** — Personal code review queue: attach local review notes to source locations and collect them alongside TODO/FIXME comments in a navigable panel.

- [ ] **FI-030 · R4** — Dependency-aware compilation: identify objects affected by source changes, preview a compilation order and execute the selected compilation plan.

- [ ] **FI-040 · R4** — Semantic diff: de-emphasize formatting changes and highlight changed signatures, conditions and moved procedures in package comparisons.

- [ ] **FI-078 · R4** — Inline Git blame: show line authorship and navigate to the associated commit and its message.

#### R5 — İleri Oracle ve genişletilebilirlik

- [ ] **FI-007 · R5** — PL/SQL debugging: breakpoints, stepping, variable inspection and call stack, subject to Oracle permissions and debug-session setup.

- [ ] **FI-031 · R5** — PL/SQL profiling: annotate source with available line-level execution timings and navigate to expensive sections, subject to Oracle instrumentation and permissions.

- [ ] **FI-032 · R5** — Test coverage: show executed and uncovered PL/SQL source lines where the selected test framework and Oracle instrumentation support coverage.

- [ ] **FI-036 · R5** — Extension system: support custom lint rules, generators and commands so teams can integrate their development conventions.

### F. Çalışma alanı, sekmeler ve arayüz ergonomisi

#### R2 — Günlük kullanım ve sonuç inceleme

- [ ] **FI-045 · R2** — Independent editor splits: give each editor group its own tabs and support drag-and-drop placement, for example package body beside specification with results below. Extend existing docking where appropriate.

- [x] **FI-049 · R2** — Saved workspace layouts: switch between focused editing, code/results and side-by-side review arrangements with shortcuts.

- [x] **FI-050 · R2** — Shortcut coach: optionally show the keyboard shortcut for a menu action after use, with dismissible hints and locally remembered preferences.

- [x] **FI-066 · R2** — Customizable status bar: let users choose indicators such as Oracle version, encoding, line endings, current schema, Git branch and procedure at the caret; each indicator links to its relevant setting, detail or action.

- [x] **FI-067 · R2** — Icon themes: customize schema-object, file and folder icons through selectable or imported icon packs.

- [x] **FI-068 · R2** — Vim mode and IDE keymaps: support Vim-style editing or preset shortcut mappings inspired by familiar Visual Studio and JetBrains workflows.

  - [x] Hazır kısayol eşlemeleri (Visual Studio ve JetBrains tarzı).

  - [ ] Vim tarzı modlu düzenleme (ayrı paket/uygulama gerektirir; hazır eşlemeler maddenin "veya" koşulunu karşılar).

- [x] **FI-070 · R2** — Drag-and-drop comparison: compare two dropped SQL files or compare clipboard text with the active document.

- [x] **FI-072 · R2** — Large-file mode: open large SQL dumps with a lightweight editor configuration and enable expensive language features selectively.

- [x] **FI-125 · R2** — Tab previews: on hover, show a compact SQL preview, connection identity and latest execution status; offer equivalent keyboard access.

- [x] **FI-126 · R2** — Vertical tabs: provide a searchable, resizable vertical list for many open files, extending existing open-editor navigation where appropriate.

- [x] **FI-127 · R2** — Temporary panel maximization: maximize the editor or results panel on a header action/double-click and restore its previous arrangement afterward.

- [x] **FI-128 · R2** — Live quick settings: preview font size, line spacing, grid density and NULL presentation changes while adjusting them in a compact settings panel.

- [x] **FI-129 · R2** — Compact/comfortable density: switch toolbar, tree-row and grid-cell spacing through a coordinated density preference while retaining usable hit targets.

- [x] **FI-130 · R2** — Contextual bottom status area: use a stable footer area for execution state, current selection summaries or relevant error information with clear priority.

- [x] **FI-132 · R2** — Tab groups: organize editor tabs into named, colored, collapsible groups such as packages, validation queries and temporary work.

- [ ] **FI-133 · R2** — Inline renaming: rename a tab group, connection display name or saved mini tool directly in its current list/header without opening a separate dialog. Support F2 or an explicit rename action, Enter to save and Escape to cancel; validate input and show save failures in place. Preserve stable identities and do not treat a connection label edit as a credential/configuration change.

  - [x] Sekme grubu yerinde yeniden adlandırma (F2/çift tıklama, Enter kaydeder, Escape iptal eder, doğrulama hatası yerinde).

  - [ ] Bağlantı görünen adı yerinde yeniden adlandırma (kimlik bilgisi/yapılandırma değişikliği sayılmadan).

  - [x] Kayıtlı mini araç yerinde yeniden adlandırma. (F2/çift tıklama, Enter kaydeder, Escape iptal eder; boş/100+ karakter/yinelenen ad ve kaydetme hatası listede yerinde gösterilir, araç kimliği değişmez.)

- [x] **FI-137 · R2** — Search within menus: type in long context menus to filter available actions without losing keyboard navigation.

- [x] **FI-138 · R2** — Layout restore previews: show a miniature arrangement before applying a saved panel layout.

- [x] **FI-139 · R2** — Disambiguated tab paths: show only the directory suffix needed to distinguish files sharing the same basename, with the full path available on demand.

- [x] **FI-141 · R2** — Multi-select tabs: select editor tabs with Ctrl/Shift and move, group or close them together, preserving dirty-document prompts and session ownership.

  - [x] Ctrl ile seç/çıkar, Shift ile aralık seç, Escape ile temizle; seçili sekmeleri birlikte kapat (kirli belge incelemesi korunur).

  - [x] Seçili sekmeleri birlikte taşı ve grupla (sekme sürükleme/FI-132 sekme grupları ile birlikte).

- [x] **FI-142 · R2** — Keyboard access labels: reveal letter labels on actionable controls with Alt and activate them by keyboard, coordinating with existing editor shortcuts.

- [x] **FI-146 · R2** — Full-name tree overlays: reveal clipped object names in an aligned overlay without reflowing the tree, with equivalent keyboard access.

- [x] **FI-147 · R2** — Layout locking: optionally prevent accidental panel dragging or resizing and provide a readily accessible unlock action.

- [x] **FI-148 · R2** — Batch close review: list dirty documents together and choose save, keep open or discard per document before closing.

- [x] **FI-149 · R2** — Preview tab: single-click a file into a reusable preview tab; promote it to a persistent tab on editing or double-click, preserving document state.

- [x] **FI-150 · R2** — New-query split button: open a query using the current profile with the main action and choose another profile or template from its dropdown.

- [x] **FI-151 · R2** — Separate configurable toolbars: keep editor and result actions on distinct rows and let users choose visible controls for each.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-106 · R4** — Cross-window tab movement: detach SQL tabs into another window while retaining their connection/session and results, with explicit session ownership.

- [ ] **FI-140 · R4** — Spring-loaded panels: temporarily open a collapsed target panel when an item is dragged over it, allowing a valid drop and restoring state on cancellation.

### G. Sonuç inceleme, büyük veri ve grid görünümü

#### R2 — Günlük kullanım ve sonuç inceleme

- [x] **FI-061 · R2** — SQL/result navigation: link result columns to their producing projection expressions and highlight the corresponding source or result column.

- [x] **FI-095 · R2** — Specialized result viewers: display JSON as an expandable tree, coordinates on a map and XML in a structured view. Select viewers using column metadata and supported content detection, with a manual override. Extend existing value inspection rather than duplicate it; define coordinate conventions explicitly and avoid sending result values to external services without user authorization.

  - [x] JSON için genişletilebilir, klavyeyle gezilebilir ağaç; XML için mevcut yapı görünümü.

  - [x] Görüntüleyiciyi sütun metadata'sı ve içerik tespitiyle seç; elle değiştirilebilir.

  - [x] Koordinatları açık kuralla (lat/lon sırası, SRID) harita üzerinde göster; değerleri kullanıcı izni olmadan dış servise gönderme.

- [x] **FI-096 · R2** — In-cell search: search large JSON, XML and CLOB values and navigate from matches to their locations in the active viewer.

- [x] **FI-097 · R2** — JSON/XML path to SQL: generate editable JSON_VALUE, JSON_QUERY or XMLTABLE drafts for selected fields, accounting for escaping, namespaces and types.

  - [x] JSON ağacındaki seçili düğümden tipine göre JSON_VALUE (RETURNING NUMBER/VARCHAR2) veya JSON_QUERY taslağı; Oracle yol sözdizimi ve literal kaçışı.

  - [x] XML yapı görünümündeki öğeden namespace bildirimleriyle XMLTABLE taslağı.

- [x] **FI-098 · R2** — Smart links: recognize URLs, file paths, email addresses and Oracle object references in result values and offer explicit open/navigation actions.

- [x] **FI-099 · R2** — Code-valued cell editor: inspect SQL, PL/SQL or JSON cell contents in a dedicated syntax-aware editor with formatting; editing does not imply saving changes to the database.

- [x] **FI-100 · R2** — Binary inspector: extend existing BLOB inspection with synchronized hex and text views and corresponding byte-range highlighting.

- [x] **FI-101 · R2** — Timezone lens: show supported timestamp values in database/session context, local time and UTC while distinguishing stored information from conversions. Do not infer an absolute instant for timezone-free values without an explicit timezone assumption.

- [ ] **FI-103 · R2** — Incremental LOB reading: inspect large CLOB/BLOB values by fetching portions from Oracle on demand rather than downloading the entire value first. Display the fetched amount and total size when available, using appropriate character or byte units. This is distinct from paging a fully downloaded local value; define locator/session lifetime and invalidation behavior.

- [x] **FI-104 · R2** — Result column display aliases: assign readable column headings without changing query SQL, and remember the presentation with the query template. Retain original column names in metadata and define stable matching when the projection changes or contains duplicate names.

- [x] **FI-105 · R2** — Direct-to-file streaming: export very large query results without loading all rows into the grid, with live exported-row count, output file size and transfer rate. Extend the existing streaming CSV capabilities rather than treat streaming as absent. Define supported formats, cancellation, partial file handling and cursor/session ownership; avoid an unbounded in-memory result buffer.

- [ ] **FI-108 · R2** — Deferred heavy-column loading: omit supported large LOB values initially and retrieve selected cells on demand, with stable row identity and clear consistency/session-lifetime behavior.

- [x] **FI-131 · R2** — Resizable cell detail drawer: open cell details in a right-side drawer that can be resized while retaining the surrounding result-table context.

- [x] **FI-134 · R2** — Jump to result row: enter a row number from the row-number control and navigate within loaded results, clearly defining filtered-view numbering.

- [x] **FI-135 · R2** — Expand truncated text in place: open clipped cell text in an anchored overlay and dismiss it on outside interaction or Escape.

- [x] **FI-136 · R2** — Visibility brush: drag across column-visibility checkboxes to apply a consistent show/hide state to multiple columns, with keyboard alternatives.

- [x] **FI-143 · R2** — Typed header filters: open calendar, numeric-range or text/value-list filter controls from column headers. State whether each filter affects loaded rows or explicitly reruns a server query.

- [x] **FI-144 · R2** — Scrollbar row markers: mark bookmarked result-row positions on the scrollbar, keeping marker mapping consistent with the current filtered/sorted view.

- [x] **FI-145 · R2** — Copy scope preview: show the selected row/column count and header inclusion before copying, with explicit loaded-result scope.

- [x] **FI-152 · R2** — Column width distribution: equalize selected widths, fit content or distribute remaining space across selected columns.

- [x] **FI-154 · R2** — Floating selection toolbar: offer copy, export and details near selected grid cells, with optional dismissal and accessible keyboard alternatives.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-102 · R4** — Cell annotations: attach local notes to values, associated with query context and a stable row key where available; define stale-result and sensitive-data retention behavior before implementation.

### H. Grid düzenleme modeli ve değişiklik incelemesi

#### R3 — Güvenilir grid düzenleme

- [x] **FI-155 · R3** — Change layer: mark edited cells with original-value previews and distinguish newly inserted and deletion-marked rows with non-color indicators.

  - [x] Düzenlenen hücre işareti (sol çubuk + ✎/∅ simgesi), özgün değer ipucu ve silinmeye işaretli satırın üstü çizili/− göstergesi (renge bağlı değil).

  - [x] Yeni eklenen satırların gösterimi.

- [ ] **FI-156 · R3** — Typed cell editors: provide date pickers, expanded text editors and configured related-record selectors; make setting NULL an explicit action.

  - [x] Düz DATE/TIMESTAMP için takvim denetimi; uzun/çok satırlı metin için çok satırlı düzenleyici (Ctrl+Enter ile hazırlar); NULL açık eylem.

  - [ ] Yapılandırılmış ilişkili kayıt seçici.

- [x] **FI-157 · R3** — Pending changes drawer: summarize updates/inserts/deletes and navigate from each pending change to its row or cell.

- [x] **FI-159 · R3** — Draft undo by cell or row: discard selected unapplied edits without losing other draft changes. Do not imply applied DML can be undone independently without a defined transactional mechanism.

- [ ] **FI-163 · R3** — Editability explanations: explain computed columns, ambiguous source tables, missing reliable row identity or insufficient privileges when editing is unavailable. Do not assume arbitrary SELECT results can be safely updated.

  - [x] Hesaplanmış/sanal sütun, birden çok kaynak tablo, kaynak tablo yok, birincil anahtar yok/eksik ve LOB-ikili sütun nedenleri gerekçesiyle gösterilir.

  - [ ] Yetersiz yetki nedeni (uygulama adımında).

- [x] **FI-165 · R3** — Default versus NULL: distinguish explicit values, explicit NULL and omitted columns using database defaults when constructing inserts.

  - [x] Bilinçli NULL (Set NULL), boş metin ve dokunulmamış hücre taslakta ayrı durumlardır; INSERT'te atlanan sütunlar veritabanı varsayılanını kullanır (model).

  - [x] Yeni satır giriş arayüzü.

- [x] **FI-168 · R3** — DML preview: inspect generated INSERT/UPDATE/DELETE statements and binds per row before applying; do not persist or unnecessarily expose sensitive values.

- [x] **FI-171 · R3** — Navigate pending edits: move to previous/next edited cells in large grids, accounting for hidden, filtered or unloaded rows.

- [x] **FI-174 · R3** — Deletion preview: retain deletion-marked rows with strikethrough until DML application and allow cancellation of unapplied deletion drafts.

- [x] **FI-176 · R3** — Constraint guidance: show available CHECK expressions or unique-column groups alongside validation/database errors rather than only Oracle error codes.

- [x] **FI-184 · R3** — Pin identifying columns: keep reliable row-key columns visible while editing so users can identify the record being changed.

- [ ] **FI-185 · R3** — Keep edited rows visible: temporarily retain locally edited rows that no longer satisfy the current filter and label that state explicitly.

  - [x] Süzgeç ve sıralama saklanan değerlere uygulandığı için düzenlenen satır taslak değerle süzgeçten düşmez.

  - [ ] Taslak değeri süzgece uymayan satırın açıkça etiketlenmesi.

- [x] **FI-188 · R3** — Explicit edit mode: start results read-only and reveal cell editing and mutation controls through an explicit Edit data action.

- [x] **FI-189 · R3** — Changes-only review: hide unchanged rows/columns during pre-commit review while retaining identifying keys and old/new values.

- [x] **FI-190 · R3** — Row identity selection: explain missing reliable identity and allow a suitable unique key to be selected and validated. Do not treat sample uniqueness as proof of a stable database-wide key.

- [x] **FI-191 · R3** — Remove no-op edits: clear draft markers and unnecessary UPDATEs when a cell is restored to its original typed value.

- [ ] **FI-194 · R3** — Editable-column metadata: explain why generated, identity or unauthorized columns are locked, based on actual Oracle capabilities and privileges.

  - [x] Sanal/hesaplanmış, GENERATED ALWAYS, LOB-ikili ve ifade sütunları başlıkta 🔒 ve nedeni içeren ipucuyla işaretlenir.

  - [ ] Gerçek Oracle yetkilerine (INSERT/UPDATE ayrıcalıkları) dayalı kilit nedenleri.

- [x] **FI-200 · R3** — Required-field counter: show missing required inputs on new row drafts and navigate to each, accounting for database defaults and generated values.

- [x] **FI-201 · R3** — Stable ordering while editing: defer local resorting so an edited row does not jump away, with an explicit action to reapply sort order.

- [x] **FI-203 · R3** — Keyboard cell completion: Enter stages a cell edit locally, Escape cancels the active edit and a separate explicit action applies drafts to Oracle.

  - [x] Enter hücre düzenlemesini yerelde hazırlar, Escape iptal eder, Tab hazırlayıp bir sonraki hücreye geçer.

  - [x] Taslakları Oracle'a uygulayan ayrı, açık eylem (Apply).

- [x] **FI-208 · R3** — Text length meter: show character and byte counts against column limits using actual Oracle character-set and BYTE/CHAR semantics where available.

- [x] **FI-212 · R3** — Local Undo/Redo: undo and redo unapplied cell edits operation by operation; do not imply this reverses database-applied DML.

- [x] **FI-213 · R3** — Edit in the change list: correct proposed new values directly in the old/new review list without navigating back to the grid.

- [x] **FI-214 · R3** — Copy original value: offer separate actions to copy the current draft value or the originally read value.

- [x] **FI-215 · R3** — Invalid-cell navigation: move to the next validation error by shortcut and update the error count as cells are corrected.

- [x] **FI-220 · R3** — Show source-column identity: display the resolved schema.table.column while editing an aliased projection; reject ambiguous update targets.

- [x] **FI-221 · R3** — Track changed primary keys: retain original row identity when editing key values and show old/new keys while enforcing concurrency checks.

  - [x] Anahtar sütun düzenlense bile WHERE koşulu okunan özgün anahtar değerini kullanır; çekmecede eski → yeni değer görünür.

  - [x] Eşzamanlılık denetimi (uygulama adımında).

- [x] **FI-222 · R3** — Distinguish delete/reinsert: retain DELETE and INSERT drafts as separate operations even when keys match; do not silently convert them to UPDATE.

- [x] **FI-223 · R3** — Deletion review mode: focus on deletion-marked records with identifying keys and populated fields before application.

- [x] **FI-228 · R3** — Application impact summary: group planned INSERT/UPDATE/DELETE counts by target table before applying drafts.

### I. DML uygulama, transaction ve tutarlılık

#### R3 — Güvenilir grid düzenleme

- [x] **FI-158 · R3** — Two-stage application: keep local grid drafts separate from database-applied, uncommitted DML. Apply sends edits to the session transaction; Commit/Rollback resolves that transaction, with clear state transitions and failure behavior.

- [x] **FI-160 · R3** — Conflict resolution: compare originally read, locally edited and current database values when another session changes a row. Use reliable identity and concurrency checks and require explicit resolution before overwriting.

  - [x] Başka oturumun değiştirdiği veya sildiği satır tespit edilir: UPDATE, okunan özgün değerleri de şart koşar ve eşleşme yoksa "başka bir oturum değiştirmiş/silmiş" gerekçesiyle durur (üzerine yazılmaz).

  - [x] Çakışma çekmecesi: okunan değer → güncel değer gösterilir, "Keep my edit" (taslak güncel değerin üzerine yeniden temellenir) veya "Use the database value" açıkça seçilmeden Apply kapalıdır.

- [x] **FI-162 · R3** — Commit scope summary: show that Commit affects all pending work in the physical session, including DML executed outside the grid.

- [x] **FI-169 · R3** — Refresh with draft preservation: reconcile unapplied edits against refreshed rows using reliable identity, separate conflicts and never silently lose edits.

- [ ] **FI-170 · R3** — Read back database-produced values: retrieve supported default, identity and trigger-produced values after applying within the same transaction, clearly distinguishing readback failures from DML failures.

- [x] **FI-172 · R3** — Select drafts to apply: choose draft rows with checkboxes and apply only selected changes; distinguish this from session-wide Commit semantics.

- [ ] **FI-177 · R3** — Retry corrected failures: preserve confirmed applied outcomes, let users correct failed drafts and avoid resending successful DML. Unknown outcomes require reconciliation before retry; define batch atomicity explicitly.

  - [x] Uygulanan değişiklikler korunur ve yeniden gönderilmez; başarısız/uyuşmayan/geri alınan/atlanan taslaklar düzeltilip yeniden denenebilir.

  - [ ] Belirsiz sonuç (bağlantı kopması) için mutabakat.

- [x] **FI-178 · R3** — Uncertain commit outcome: if the connection fails during Commit, report an unconfirmed outcome and provide reconciliation guidance rather than an automatic retry or an unsupported success/failure assertion.

- [x] **FI-187 · R3** — Per-row application progress: show queued, applying, applied and failed outcomes while distinguishing applied-uncommitted from committed states.

  - [x] Her satır için uygulandı / başarısız / durduruldu / çalışmadı / geri alındı sonucu (uygulandı-işlenmemiş durumu açık).

  - [x] Commit/Rollback sonrası "işlendi"/"geri alındı" durumu (uygulanıyor göstergesi "Applying…" ile).

- [x] **FI-192 · R3** — Affected-row mismatch handling: report zero or multiple affected rows for an intended single-row mutation, stop normal progression and use a defined transactional recovery mechanism rather than leave unintended work pending.

- [x] **FI-207 · R3** — Batch application policy: choose between rolling back the grid batch on failure or retaining confirmed successes as uncommitted work, using defined savepoint/statement handling without discarding earlier unrelated session DML.

- [x] **FI-209 · R3** — Draft unique-key checks: identify duplicate unique-key values within staged rows before applying, respecting Oracle NULL semantics and leaving final enforcement to database constraints.

- [x] **FI-210 · R3** — Connection-switch review: distinguish local drafts from applied pending transaction work before changing profiles and require an explicit disposition without silently transferring edits or committing work.

- [x] **FI-224 · R3** — Pending-transaction counter: show elapsed time since application began and known pending operation counts, distinguishing tracked work from unknown effects of arbitrary scripts or database routines.

- [x] **FI-230 · R3** — Controlled application stop: stop sending new mutations, reconcile any in-flight outcome and separate confirmed applied work from remaining drafts; do not silently commit or retry uncertain operations.

- [x] **FI-231 · R3** — Unified close review: offer distinct choices for local drafts and pending session transactions so discarding drafts cannot be confused with Rollback.

- [x] **FI-161 · R3** — Inline errors: map validation and constraint failures to affected cells/rows where possible and report statement outcomes and transaction state clearly.

#### R4 — Proje ölçeği ve ileri üretkenlik

- [ ] **FI-173 · R4** — Grid savepoint: optionally create a savepoint before applying an edit batch and offer rollback to that boundary, explicitly showing that all subsequent session work is affected. Track invalidation by transaction boundaries and never promise independent row rollback through savepoints.

- [ ] **FI-175 · R4** — Related-record checks: display known foreign-key relationships and offer explicit checks for blocking/cascade effects; report scope and acknowledge that concurrent changes may invalidate a preflight result.

- [x] **FI-179 · R4** — Export draft DML: generate a reviewable parameterized SQL script from local edits without executing it, with explicit handling of bind values and secrets.

- [x] **FI-193 · R4** — Preserve drafts after rollback: optionally retain intended local edits after session rollback, then reconcile with refreshed records before reapplication.

- [x] **FI-195 · R4** — Post-commit verification: reread changed records and compare against expected values, separating verification failures from commit outcomes and noting that later concurrent updates may explain differences.

- [ ] **FI-202 · R4** — Named transaction context: attach a local descriptive label to pending work and show it with Commit/Rollback summaries; the label does not change Oracle transaction scope or isolate that work from other session DML.

- [ ] **FI-206 · R4** — Pre-commit check queries: explicitly run user-defined SELECT checks in the same transaction and display outcomes during commit review. Do not treat arbitrary SELECT functions as side-effect free or replace database constraints.

- [ ] **FI-225 · R4** — Lock wait preference: configure supported wait behavior for grid mutations and expose per-row timeout/wait outcomes. Validate Oracle/provider support rather than promise a generic exact lock timeout.

- [ ] **FI-226 · R4** — Merge non-overlapping conflicts: propose combining edits to different columns after concurrent changes; require explicit review and an atomic recheck to avoid overwriting subsequent changes.

- [x] **FI-229 · R4** — Commit receipt: provide a copyable summary of a confirmed commit with time, connection identity and known operation counts, without claiming complete trigger effects or durable auditing.

### J. Toplu veri girişi ve düzenleme kısayolları

#### R4 — Proje ölçeği ve ileri üretkenlik

- [x] **FI-164 · R4** — Duplicate row: copy a record into a new local row draft, omit identity and generated columns and flag fields requiring user input.

- [x] **FI-166 · R4** — Spreadsheet paste: stage rectangular pasted data with column mapping and cell-level validation before applying DML.

- [x] **FI-167 · R4** — Bulk cell assignment: fill selected editable cells with a value or NULL and preview the affected cell count and validation failures.

- [ ] **FI-180 · R4** — Tab-driven entry: navigate editable cells with Tab and optionally create a new local row draft after the final cell, prioritizing required input fields.

- [ ] **FI-181 · R4** — Load cell value from file: stage text/JSON files for CLOBs and binary files for BLOBs with size and content previews before applying.

- [ ] **FI-182 · R4** — Lookup descriptions: display configured related-record descriptions beside foreign-key IDs while retaining the actual key as the stored value.

- [x] **FI-183 · R4** — Bulk find/replace: preview old/new values in selected editable text cells before creating replacement drafts.

- [x] **FI-186 · R4** — Row creation form: enter wide-table records in a sectioned form that creates a grid draft rather than immediately executing an INSERT.

- [ ] **FI-196 · R4** — Fill handle: drag from a cell corner to copy values or generate supported numeric/date sequences into local drafts, with a preview and validation.

- [x] **FI-197 · R4** — Fill from above: copy the preceding cell value into the active cell or selected editable range through a shortcut.

- [x] **FI-198 · R4** — Bulk arithmetic: preview transformations such as percentage increases, addition and rounding on selected numeric cells, preserving Oracle numeric precision and validating range/scale constraints.

- [ ] **FI-199 · R4** — Vertical record editing: edit a row in an attribute/value view and retain field focus when moving between records.

- [x] **FI-204 · R4** — Key-matched paste: match spreadsheet rows by reliable keys rather than grid position, separating updates, new records, unmatched and ambiguous entries.

- [ ] **FI-205 · R4** — Related-record insertion: stage parent/child records together, show execution order and propagate supported generated keys within the same transaction.

- [ ] **FI-211 · R4** — Existing-value suggestions: suggest values from the loaded result while editing text cells, retaining free entry and explaining suggestion scope.

- [ ] **FI-216 · R4** — Date/time component editing: change only the date or time component of selected timestamps while preserving other components and type semantics.

- [ ] **FI-217 · R4** — Locale-aware numeric input: parse user-entered number formats using an explicit locale and preview the precise numeric value sent to Oracle.

- [ ] **FI-218 · R4** — Boolean-like column mappings: configure Y/N or 1/0 columns as checkboxes with a separate NULL state and explicit stored-value mappings.

- [ ] **FI-219 · R4** — Drag-copy rows between grids: map source columns to a target table and stage INSERT drafts rather than execute mutations on drop.

- [ ] **FI-227 · R4** — Row draft templates: save reusable new-record field presets while excluding keys, generated fields and sensitive values as appropriate.

## 4. Roadmap bakım kuralı

Her teslimde tamamlanan işe katalog içinde `[x]` koy. Özelliğin yalnızca bir kısmı teslim edildiyse tamamlanan alt işleri işaretle, kalan kapsamı açık yaz ve ana checkbox'ı bütün kabul koşulları karşılanana kadar açık bırak.

Yeni fikirleri ilgili konu grubuna yeni bir sabit kimlikle ekle. Faz değiştirirken bağımlılık ve tamamlanma ölçütünü birlikte değerlendir. Yakın fikirler ayrı kimliklerini korur: örneğin run configuration/bind formu, paket derleme/bağımlı derleme ve taslak undo/transaction rollback farklı kapsamları temsil eder.