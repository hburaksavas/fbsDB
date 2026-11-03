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
| UX-04 | **Boş durum yönlendirmeleri:** sonuç yok, düzenlenemeyen sonuç, bekleyen değişiklik yok gibi durumlarda bir sonraki adımı söyleyen kısa metin (düzenlenemiyorsa neden ve ne yapılabileceği). `ActionableState` bileşeni genişletilebilir. | O | S |

## B. Güven ve geri bildirim (veri değiştiren akışlar)

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-05 | **Uygula öncesi tek ekranlık özet:** kaç INSERT/UPDATE/DELETE, hangi tablo, hangi bağlantı/ortam (PROD ise belirgin uyarı), toplam etkilenecek satır. Onay düğmesi etkiyi söylesin ("12 satırı güncelle"), "Tamam" değil. | Y | M |
| UX-06 | **Geri alınabilirlik göstergesi:** her uygulama sonucunda "Geri alınabilir (commit edilmedi)" ya da "Kalıcı" durumu aynı yerde ve aynı dille görünsün; sekme işlem göstergesiyle tutarlı olsun. | Y | S |
| UX-07 | **Hata iletilerinde eylem:** Oracle hataları (ORA-…) yalnızca metin değil, "Bu satıra git", "Taslağı düzelt", "Hatayı kopyala" düğmeleriyle sunulsun. `oracleErrorMap` zaten var; yüzeye çıkarılır. | Y | M |
| UX-08 | **Uzun işlemlerde iptal ve ilerleme:** Apply, dışa aktarma ve LOB okuma için aynı ilerleme/iptal deseni (ilerleme çubuğu, geçen süre, İptal). Şu an her biri kendi biçiminde. | O | M |
| UX-09 | **Kaybolan taslak koruması:** sekme kapatılırken, bağlantı değişirken veya sonuç yenilenirken bekleyen taslaklar için tek biçimli uyarı ("3 değişiklik kaybolacak" — Kaydet/Sakla/At). | Y | M |

## C. Klavye ve erişilebilirlik

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-10 | **Odak yönetimi denetimi:** tüm diyalog ve açılır panellerde odağın açılışta içeri girmesi, kapanışta tetikleyiciye dönmesi ve Escape davranışının tutarlı olması için ortak bir denetim listesi ve otomatik test. | Y | M |
| UX-11 | **Klavye kısayol haritası ekranı:** `?` ile açılan, bağlama göre (editör / grid / ağaç) filtrelenen kısayol listesi; kullanıcı kısayollarını da gösterir. | O | S |
| UX-12 | **Yüksek karşıtlık ve azaltılmış hareket:** `prefers-contrast` ve `prefers-reduced-motion` için tema belirteçlerini doğrula; durum renkleri (hata, uyarı, PROD) yalnızca renge dayanmasın, simge/metin de taşısın. | Y | M |
| UX-13 | **Ekran okuyucu duyuruları:** Uygula sonucu, doğrulama hataları ve yükleme tamamlanması için `aria-live` bildirimlerinin tek bir yerden yönetilmesi (`Feedback.jsx`). | O | S |

## D. Gezinme ve bağlam

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-14 | **Durum çubuğunda etkin bağlam:** bağlantı, şema, ortam ve işlem durumunu (bekleyen değişiklik sayısı dahil) her zaman görünen tek bir şeritte topla; tıklayınca ilgili ayar/panele git. | Y | M |
| UX-15 | **Son kullanılanlar ve geri dönüş:** son açılan nesneler/sorgular/sonuçlar için tek bir "Son" listesi; Alt+Sol/Sağ ile gezinme geçmişi (varsa tutarlı hale getir). | O | M |
| UX-16 | **Ayarlarda arama ve değişiklik işareti:** ayar sayfalarında tek arama kutusu ve varsayılandan farklı ayarlar için "Değiştirildi" rozeti + tek tıkla sıfırlama. | O | M |
| UX-17 | **Geri alınabilir yerleşim:** panel yerleşimini bozan kullanıcı için "Yerleşimi sıfırla" eylemi ve kayıtlı yerleşim önizlemesi (`SavedLayouts`). | O | S |

## E. Performans algısı ve cilâ

| # | Öneri | Etki | Efor |
| --- | --- | --- | --- |
| UX-18 | **İskelet/yer tutucu yükleme durumları:** nesne ağacı, şema ağacı ve sonuç ızgarası için boş ekran yerine yükleme iskeleti; 300 ms'den kısa sürede göstermeyerek titremeyi önle. | O | S |
| UX-19 | **Büyük sonuçlarda sanal kaydırma ölçümü:** 100 bin+ satır ve 100+ sütunda kaydırma/seçim gecikmesini ölçen bir `test:load` senaryosu ve bütçe (ör. kare süresi) belirle. | O | M |
| UX-20 | **Mikro etkileşim tutarlılığı:** hover/odak/basılı durumları, 4-8 px aralık ölçeği, simge boyutları için tek tasarım belirteci seti; mevcut tema üretecine eklenir ve sapmalar lint ile yakalanır. | D | M |
| UX-21 | **Dil ve metin tutarlılığı:** arayüz metinleri İngilizce ve Türkçe karışık; hangi dilin varsayılan olduğunu belirle, tüm metinleri tek kaynaktan (sözlük) yönet ve eksik çeviri denetimi ekle. | Y | L |

## Durum

- **UX-01 tamamlandı:** çekirdek eylemler çubukta, gelişmiş araçlar "More" menüsünde (ok tuşları, Escape ile odağı geri verme, çubuğa sabitleme; açık bir süzgeç menüde gizlenmez). Birim test (`tests/grid-bar-layout.test.mjs`) ve WebView2 masaüstü testi geçti (124 kontrol).
- **UX-02 tamamlandı:** düzenleme çubuğunun altında seçime ve hazırlanan değişikliklere göre tek satırlık ipucu (seçim yok / tek hücre / çok hücre → Bulk edit / bekleyen değişiklik). "Got it" ipucunu kalıcı kapatır, "Turn off tips" hepsini kapatır. Birim test (`tests/edit-hints.test.mjs`) ve masaüstü testi (124 kontrol) geçti.
- **UX-03 tamamlandı:** Ctrl+P komut paletinde ekrandaki sonucun grid düzenleme eylemleri "Grid: …" öneki ile aranabilir (düzenle, yeni satır, NULL, sil, geri al, toplu düzenle, yapıştır, kayıt görünümü, kontroller…). Devre dışı eylemler nedeniyle birlikte listelenir. Birim test (`tests/grid-action-bridge.test.mjs`) ve masaüstü testi (124 kontrol) geçti.
- **Ek düzenleme (UX-01/03 sonrası):** "Edit rows" anahtarı sonuç araç çubuğuna (kalem simgesi) ve Descriptions simgesi araç çubuğuna taşındı; ayrı düzenleme satırı yalnızca düzenleme açıkken görünür (`docs/ui-decisions.md`). Masaüstü testi 124 kontrol geçti; Apply onayı adımı bir ara iki çalıştırmada zaman aşımına uğradı, üçüncüde geçti (olası zamanlama yarışı, nedeni araştırılmadı).

## Önerilen sıra

1. **Hızlı kazançlar (S efor, yüksek etki):** UX-03, UX-04, UX-06, UX-11, UX-13.
2. **Güveni artıranlar:** UX-05, UX-07, UX-09.
3. **Yapısal:** UX-01, UX-14, UX-10, UX-21.

Her madde için mevcut döngü uygulanır: uygula → birim test → gerçek WebView2 masaüstü testi → katalogda `[x]` ve ilerleme günlüğü.

## Doğrulanmamış varsayımlar

- UX-21 (karışık dil) ve UX-15 (gezinme geçmişi) için mevcut durumu kodda tek tek doğrulamadım; başlamadan önce kısa bir envanter gerekir.
- Etki/efor değerleri tahmindir.
