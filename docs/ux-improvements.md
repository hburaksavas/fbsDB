# UX iyileştirme önerileri

Bu liste, son dönemde eklenen özelliklerin (özellikle grid düzenleme araçları) ve `src/` altındaki bileşen envanterinin incelenmesinden çıkarıldı. **Kullanıcı araştırmasına dayanmaz**; hepsi öneridir. Öncelik ve kapsam senin kararındır. Onayladıkların `docs/feature-ideas.md` kataloğuna (`FI-232`'den başlayarak) taşınabilir.

Kısıtlar:
- Sekme başlıkları ve üzerine gelince açılan önizlemeler `docs/ui-decisions.md`'deki onaylı kararlara bağlıdır; bu listedeki hiçbir madde onları değiştirmez.
- Ölçek: **Etki** (Y/O/D) kullanıcının günlük akışına etkisi, **Efor** (S/M/L) tahmini iş büyüklüğü.

## A. Keşfedilebilirlik ve yoğunluk

Grid düzenleme sırasında araç çubuğuna ve panellere çok sayıda eylem eklendi (GridEditBar, bekleyen değişiklikler, yeni satırlar, toplu düzenleme, yapıştırma, mantıksal sütunlar, commit denetimleri, dikey kayıt, açıklamalar). Yeni kullanıcı için hangisinin ne zaman gerektiği belirsiz olabilir.

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-01 ✅ | **Düzenleme araç çubuğunu kademelendir:** her zaman görünen çekirdek (Düzenle, Uygula, Geri al) ve "Daha fazla" menüsüne alınan gelişmiş araçlar (Toplu düzenle, Yapıştır, Açıklamalar, Mantıksal sütunlar). Kullanım sıklığına göre kullanıcı sabitleyebilsin. | Y | M |
| UX-02 ✅ | **Bağlama duyarlı ipucu şeridi:** düzenleme modunda seçime göre tek satırlık öneri ("Satırı kopyalamak için…", "Birden çok hücre seçili: Toplu düzenle"). Kapatılabilir ve bir kez gösterilir. | O | S |
| UX-03 ✅ | **Komut paletinde grid eylemleri:** tüm grid düzenleme eylemleri `IdeCommandPalette` içinde aranabilir olsun; araç çubuğunda yer olmayan eylemler buradan bulunur. | Y | S |
| UX-04 ✅ | **Boş durum yönlendirmeleri:** sonuç yok, düzenlenemeyen sonuç, bekleyen değişiklik yok gibi durumlarda bir sonraki adımı söyleyen kısa metin (düzenlenemiyorsa neden ve ne yapılabileceği). `ActionableState` bileşeni genişletilebilir. | O | S |

## B. Güven ve geri bildirim (veri değiştiren akışlar)

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-05 ✅ | **Uygula öncesi tek ekranlık özet:** kaç INSERT/UPDATE/DELETE, hangi tablo, hangi bağlantı/ortam (PROD ise belirgin uyarı), toplam etkilenecek satır. Onay düğmesi etkiyi söylesin ("12 satırı güncelle"), "Tamam" değil. | Y | M |
| UX-06 ✅ | **Geri alınabilirlik göstergesi:** her uygulama sonucunda "Geri alınabilir (commit edilmedi)" ya da "Kalıcı" durumu aynı yerde ve aynı dille görünsün; sekme işlem göstergesiyle tutarlı olsun. | Y | S |
| UX-07 ✅ | **Hata iletilerinde eylem:** Oracle hataları (ORA-…) yalnızca metin değil, "Bu satıra git", "Taslağı düzelt", "Hatayı kopyala" düğmeleriyle sunulsun. `oracleErrorMap` zaten var; yüzeye çıkarılır. | Y | M |
| UX-08 ✅ | **Uzun işlemlerde iptal ve ilerleme:** Apply, dışa aktarma ve LOB okuma için aynı ilerleme/iptal deseni (ilerleme çubuğu, geçen süre, İptal). Şu an her biri kendi biçiminde. | O | M |
| UX-09 ✅ | **Kaybolan taslak koruması:** sekme kapatılırken, bağlantı değişirken veya sonuç yenilenirken bekleyen taslaklar için tek biçimli uyarı ("3 değişiklik kaybolacak" — Kaydet/Sakla/At). | Y | M |

## C. Klavye ve erişilebilirlik

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-10 ✅ | **Odak yönetimi denetimi:** tüm diyalog ve açılır panellerde odağın açılışta içeri girmesi, kapanışta tetikleyiciye dönmesi ve Escape davranışının tutarlı olması için ortak bir denetim listesi ve otomatik test. | Y | M |
| UX-11 ✅ | **Klavye kısayol haritası ekranı:** `?` ile açılan, bağlama göre (editör / grid / ağaç) filtrelenen kısayol listesi; kullanıcı kısayollarını da gösterir. | O | S |
| UX-12 ✅ | **Yüksek karşıtlık ve azaltılmış hareket:** `prefers-contrast` ve `prefers-reduced-motion` için tema belirteçlerini doğrula; durum renkleri (hata, uyarı, PROD) yalnızca renge dayanmasın, simge/metin de taşısın. | Y | M |
| UX-13 ✅ | **Ekran okuyucu duyuruları:** Uygula sonucu, doğrulama hataları ve yükleme tamamlanması için `aria-live` bildirimlerinin tek bir yerden yönetilmesi (`Feedback.jsx`). | O | S |

## D. Gezinme ve bağlam

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-14 ✅ | **Durum çubuğunda etkin bağlam:** bağlantı, şema, ortam ve işlem durumunu (bekleyen değişiklik sayısı dahil) her zaman görünen tek bir şeritte topla; tıklayınca ilgili ayar/panele git. | Y | M |
| UX-15 ✅ | **Son kullanılanlar ve geri dönüş:** son açılan nesneler/sorgular/sonuçlar için tek bir "Son" listesi; Alt+Sol/Sağ ile gezinme geçmişi (varsa tutarlı hale getir). | O | M |
| UX-16 ✅ | **Ayarlarda arama ve değişiklik işareti:** ayar sayfalarında tek arama kutusu ve varsayılandan farklı ayarlar için "Değiştirildi" rozeti + tek tıkla sıfırlama. | O | M |
| UX-17 ✅ | **Geri alınabilir yerleşim:** panel yerleşimini bozan kullanıcı için "Yerleşimi sıfırla" eylemi ve kayıtlı yerleşim önizlemesi (`SavedLayouts`). | O | S |

## E. Performans algısı ve cilâ

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-18 ✅ | **İskelet/yer tutucu yükleme durumları:** nesne ağacı, şema ağacı ve sonuç ızgarası için boş ekran yerine yükleme iskeleti; 300 ms'den kısa sürede göstermeyerek titremeyi önle. | O | S |
| UX-19 ✅ | **Büyük sonuçlarda sanal kaydırma ölçümü:** 100 bin+ satır ve 100+ sütunda kaydırma/seçim gecikmesini ölçen bir `test:load` senaryosu ve bütçe (ör. kare süresi) belirle. | O | M |
| UX-20 | **Mikro etkileşim tutarlılığı:** hover/odak/basılı durumları, 4-8 px aralık ölçeği, simge boyutları için tek tasarım belirteci seti; mevcut tema üretecine eklenir ve sapmalar lint ile yakalanır. | D | M |
| UX-21 | **Dil ve metin tutarlılığı:** arayüz metinleri İngilizce ve Türkçe karışık; hangi dilin varsayılan olduğunu belirle, tüm metinleri tek kaynaktan (sözlük) yönet ve eksik çeviri denetimi ekle. | Y | L |

## Durum

- **UX-01 tamamlandı:** çekirdek eylemler çubukta, gelişmiş araçlar "More" menüsünde (ok tuşları, Escape ile odağı geri verme, çubuğa sabitleme; açık bir süzgeç menüde gizlenmez). Birim test (`tests/grid-bar-layout.test.mjs`) ve WebView2 masaüstü testi geçti (124 kontrol).
- **UX-02 tamamlandı:** düzenleme çubuğunun altında seçime ve hazırlanan değişikliklere göre tek satırlık ipucu (seçim yok / tek hücre / çok hücre → Bulk edit / bekleyen değişiklik). "Got it" ipucunu kalıcı kapatır, "Turn off tips" hepsini kapatır. Birim test (`tests/edit-hints.test.mjs`) ve masaüstü testi (124 kontrol) geçti.
- **UX-03 tamamlandı:** Ctrl+P komut paletinde ekrandaki sonucun grid düzenleme eylemleri "Grid: …" öneki ile aranabilir (düzenle, yeni satır, NULL, sil, geri al, toplu düzenle, yapıştır, kayıt görünümü, kontroller…). Devre dışı eylemler nedeniyle birlikte listelenir. Birim test (`tests/grid-action-bridge.test.mjs`) ve masaüstü testi (124 kontrol) geçti.
- **Ek düzenleme (UX-01/03 sonrası):** "Edit rows" anahtarı sonuç araç çubuğuna (kalem simgesi) ve Descriptions simgesi araç çubuğuna taşındı; ayrı düzenleme satırı yalnızca düzenleme açıkken görünür (`docs/ui-decisions.md`). Masaüstü testi 124 kontrol geçti; Apply onayı adımı bir ara iki çalıştırmada zaman aşımına uğradı, üçüncüde geçti (olası zamanlama yarışı, nedeni araştırılmadı).
- **UX-04 tamamlandı:** sonuç alanı boşken duruma göre yönlendirme ve tek eylem düğmesi (bağlı değil → "Choose a connection", SQL var → "Run statement", SQL yok → "Go to the editor"; çalıştır kısayolu ayarlardan okunur). "No rows returned" artık WHERE koşullarını/şemayı denetlemeyi söyler ve "Return to SQL" sunar. Boş bekleyen değişiklik listesi F2 / New row / silme işaretlemeyi anlatır. Birim test (`tests/empty-guidance.test.mjs`) ve masaüstü testi (125 kontrol) geçti. Apply onay adımındaki zaman aşımı, düğmenin etkinleşmesini bekleyerek giderildi.
- **UX-05 tamamlandı:** Apply onayı artık tek satırda etkiyi ("4 statements · about 4 rows affected (2 updates, 1 insert, 1 delete)"), hedefi (bağlantı adı · ortam) ve PROD ise kalın bir uyarıyı gösterir; düğme etkisini söyler ("Apply 4 changes"). PROD için ek onay kutusu koymadım (sürtünme artırır); istenirse eklenebilir. Birim test (`tests/apply-confirm.test.mjs`) ve masaüstü testi (125 kontrol) geçti. PROD uyarısı masaüstü testinde değil yalnızca birim testte doğrulandı (fixture bağlantısı PROD değil).
- **UX-06 tamamlandı:** tek sözlük (`src/reversibility.js`): "Not committed · can still be rolled back", "Committed · permanent", "Rolled back · undone", "Unconfirmed · check the stored data…". Grid durum şeridi bu rozeti gösterir, sekme bağlantı metni "… · not committed" der, sorgu sonucu ipucu aynı dili kullanır, Commit/Rollback düğmeleri etkilerini söyler. **Bulunan hata (UX-06 ile ilgisiz, düzeltildi):** `GlobalTooltip` bir `title`'ı taşıdıktan sonra kendi attribute değişikliğini yeniden işleyip açıklayıcı metni kısa `aria-label` ile eziyordu; hem `title` hem `aria-label` taşıyan tüm düğmelerin tooltip'i etkilenirdi. Birim test (`tests/reversibility.test.mjs`) ve masaüstü testi (125 kontrol) geçti.
- **UX-07 tamamlandı:** başarısız Apply ifadeleri için "Show <sütun>" yanında "Correct this value" (hücreye gider ve düzenlemeyi başlatır) ve "Copy error"; sorgu hatalarında ORA-00942 → "Find the object…" (nesne aramasını açar), ORA-01031 → "Choose another connection" (mevcut Return to SQL / Copy error ile birlikte). Eylem kararları `src/errorActions.js`'te. Birim test (`tests/error-actions.test.mjs`) ve masaüstü testi (126 kontrol) geçti. ORA-01031 düğmesi yalnızca birim testte doğrulandı; masaüstünde ORA-00942 yolu denendi.
- **UX-08 kısmen tamamlandı:** ortak `OperationProgress` bileşeni (ne çalışıyor, ayrıntı satırı, geçen süre, ne yaptığını söyleyen durdur düğmesi). Apply çalışırken artık "Applying changes…" + "Sending N statements … Nothing is committed." + süre + "Stop after the current statement" gösterir. Dışa aktarma zaten ilerleme (satır/boyut/hız) ve "Cancel export" içeriyordu, olduğu gibi bırakıldı; sorgu çalışırken zaten süre ve Cancel vardı. **Yapılmayanlar:** LOB okuma henüz yok (FI-103), bu yüzden bağlanacak bir yer yok; Apply için ifade-ifade ilerleme native taraftan olay gelmediği için gösterilmiyor (uydurma sayaç koymadım). Birim test ve masaüstü testi (126 kontrol) geçti.
- **UX-09 tamamlandı:** kapatma/bağlantı değiştirme/bağlantıyı kesme için onay penceresi zaten vardı. Eksik olan: başka bir sonuç gösterilirken önceki sonucun uygulanmamış düzenlemeleri bellekte sessizce tutuluyordu ve kullanıcıya görünmüyordu. Artık sonuç görünümünün üstünde "N unapplied grid edit(s) kept for APP.TABLO. Run its query again to continue, or discard them." + **Discard** çıkar (`src/HeldDraftsNotice.jsx`, `src/heldDrafts.js`; `draftStore` değişiklikleri abonelere bildirir). Düzenleme kaybı onayı vermedim: taslaklar zaten kaybolmuyor, bildirim yeterli. Birim test (`tests/held-drafts.test.mjs`) ve masaüstü testi (127 kontrol) geçti.
- **UX-10 tamamlandı:** odak girişi, Tab tuzağı, Escape ve odağı geri verme zaten `ModalBackdrop` içinde merkezi; asıl risk modalların doğru işaretlenmemesiydi. Statik denetim testi (`tests/dialog-accessibility.test.mjs`) 61 `ModalBackdrop` kullanımını ve her `dialog`/`alertdialog` rolünü tarar (rol, `aria-modal`, erişilebilir ad). **Bulunan 2 gerçek eksik düzeltildi:** bağlantı değiştirme ("Uncommitted changes") ve kaydedilmemiş SQL ("Unsaved SQL") onay pencerelerinde rol/ad yoktu. Masaüstü testi History ve Settings için odağın içeri girmesini, Tab'ın içeride kalmasını, Escape ile kapanmayı ve odağın tetikleyiciye dönmesini doğrular (128 kontrol). Not: masaüstünde yalnızca iki diyalog denendi; kalanlar statik denetim ve ortak `ModalBackdrop` davranışıyla kapsanıyor.
- **UX-11 tamamlandı:** `?` (alan/editör/diyalog dışında) veya palette "Keyboard shortcut map" ile açılan, aranabilir kısayol haritası; klavyenin bulunduğu bölüm (Editor / Results grid / Anywhere) en üstte. Editör kısayolları kullanıcının kendi atamalarını gösterir; grid ve genel kısayollar koddaki gerçek bağlamalardan (F2, Ctrl+Z/Y, Ctrl+V, Ctrl+G, Ctrl+Shift+P…) yazıldı. Birim test (`tests/shortcut-map.test.mjs`) ve masaüstü testi (129 kontrol) geçti. Not: grid/genel kısayol listesi elle tutuluyor; kodda yeni kısayol eklenince burada da güncellenmeli.
- **UX-12 kısmen tamamlandı:** `src/motion.css` (son yüklenen stil dosyası) `prefers-reduced-motion` için tüm animasyon/geçişleri kısaltır ve tekrarı keser; sonsuz animasyonlu her stil dosyasında kendi kuralı olduğunu denetleyen test eklendi ve eksik bir dosya (`executionContext.css` sekme bağlantı döndürücüsü) düzeltildi. Durum göstergeleri zaten yalnız renge dayanmıyor (⚠, ✖, noktalı çerçeve, yazı); `forced-colors` odak kuralı mevcut (testle sabitlendi). **Yapılmadı:** gerçek yüksek karşıtlık (`prefers-contrast`) paletleri ve tema renk çiftleri için otomatik karşıtlık ölçümü; reduced-motion davranışı masaüstünde emüle edilerek denenmedi, yalnızca CSS/test düzeyinde doğrulandı (`tests/motion-accessibility.test.mjs`).
- **UX-13 tamamlandı:** tek bir gizli canlı bölge çifti (`LiveAnnouncer`, polite + assertive) ve `announce()` yardımcısı. Duyurulanlar: biten sorgunun satır sayısı/süresi, düzenleme modunun açılıp kapanması, bekleyen değişiklik sayısı, Oracle'ın reddedeceği değer sayısı. Mevcut bildirimler (Feedback, sonuç durumu) zaten `alert`/`status` rolündeydi. Birim test (`tests/announcer.test.mjs`) ve masaüstü testi (129 kontrol) geçti.
- **UX-14 tamamlandı:** alt çubukta (zaten çalışma alanı, durum ve işlem metni vardı) artık her zaman görünen bağlantı adı + ortam düğmesi (tıklayınca bağlantı seçici) ve sekmede uygulanmamış grid düzenlemesi varsa "N unapplied edits" hatırlatıcısı (tıklayınca sonuçlar öne gelir). İşlem metni UX-06 sözlüğüne hizalandı ("Manual commit · not committed"). **Yapılmayan:** şema adı gösterilmedi (görünür bağlantı nesnesinde güvenilir şema alanı yok); `Transaction pending` yazan diğer yerler (WorkbenchStatus, editör oturum durumu) çok sayıda teste bağlı olduğu için olduğu gibi bırakıldı. Masaüstü testi (129 kontrol) geçti.
- **UX-15/16/17 (çoğu zaten vardı, kod incelenerek doğrulandı):** gezinme geçmişi (Alt+Sol/Sağ, "Return to last edit", önceki/sonraki düzenleme konumu), sorgu geçmişi ve son çalışma alanları mevcut olduğundan yeni "Son kullanılanlar" listesi yazılmadı (UX-15 yeni kod gerektirmedi). Ayarlarda arama, "Changed only" süzgeci ve kategori sıfırlama zaten vardı; eklenen: varsayılandan farklı değer içeren kategori adlarının yanında ● işareti ve `aria-description` (UX-16). Görünüm menüsünde "Reset Panel Layout" ve kayıtlı yerleşimler zaten vardı; eklenen: komut paletinde "Reset panel layout" (UX-17). Masaüstü testi (130 kontrol) geçti.
- **UX-18 kısmen tamamlandı:** Object Explorer'da şema yüklenirken ve liste boşken, 300 ms'den uzun sürerse gri iskelet satırları (gizli "Loading Oracle objects…" durum metniyle, `prefers-reduced-motion`'a saygılı). Daha kısa beklemelerde iskelet hiç görünmez, titreme olmaz. **Yapılmadı:** sonuç ızgarası için iskelet (zaten "Running query…" göstergesi ve süre var), proje ağacı. Zamanlama mantığı birim testli (`tests/loading-skeleton.test.mjs`); masaüstünde şema yükleme akışı tetiklenmediği için görsel olarak denenmedi.
- **UX-19 tamamlandı:** yük testine geniş sonuç senaryosu eklendi (20 000 satır × 120 sütun: bağlama, dikey/yatay kaydırma, hücre seçimi) ve p95 bütçeleri sabitlendi (bağlama 4000 ms, kaydırma 1500 ms, seçim 500 ms). Bu makinede ölçülen: bağlama 122 ms, dikey kaydırma 112 ms, yatay 67 ms, seçim 67 ms. Çalıştırma: `npm run test:desktop -- -LoadTest` (normal masaüstü koşusu yük testini içermez). Bütçeler takılmaları yakalamak için bilerek geniş tutuldu; gerçek bir performans hedefi değildir.

## Önerilen sıra

1. **Hızlı kazançlar (S efor, yüksek etki):** UX-03, UX-04, UX-06, UX-11, UX-13.
2. **Güveni artıranlar:** UX-05, UX-07, UX-09.
3. **Yapısal:** UX-01, UX-14, UX-10, UX-21.

Her madde için mevcut döngü uygulanır: uygula → birim test → gerçek WebView2 masaüstü testi → katalogda `[x]` ve ilerleme günlüğü.

## Doğrulanmamış varsayımlar

- UX-21 (karışık dil) ve UX-15 (gezinme geçmişi) için mevcut durumu kodda tek tek doğrulamadım; başlamadan önce kısa bir envanter gerekir.
- Etki/efor değerleri tahmindir.
