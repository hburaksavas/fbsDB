# Kalan işler

`docs/feature-ideas.md` kataloğundan üretilmiştir; tamamlanan maddeler ve ayrıntılı ilerleme günlüğü o dosyadadır.

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

- ⚠ engel ya da uyarı notudur; alt madde kutuları ([x] / [ ]) gerçek durumu gösterir.
- **Canlı Oracle uyarısı:** son oturumlarda yazılan yerel kod (Apply, savepoint ile geri alma, kısıt ve ilişki sorguları, Commit akışı, doğrulama sorgusu) yalnızca derlendi ve sahte (fixture) ortamda test edildi; gerçek Oracle'a karşı çalıştırılmadı. `npm run test:release` bir Oracle profili parametresi ister ve çalıştırılamadı.
- FI-044 kullanıcı kararıyla atlanmıştır.
- Bazı maddelerin uzun açıklamaları ve alt maddeleri katalogda eski bir bozulma nedeniyle kısalmış olabilir; kısmen yapılmış olup alt maddesi görünmeyen maddeler (ör. FI-170, FI-068) "hiç başlanmamış" altında listelenir.

## 1. Kısmen yapılmış maddeler

Ana özellik çalışıyor; aşağıdaki alt maddeler açık.

### R2 — Günlük kullanım ve sonuç inceleme (1)

- **FI-133** (R2) — Inline renaming: rename a tab group, connection display name or saved mini tool directly in its current list/header without opening a separate dialog. Support F2 or an explicit rename action, Enter to save and Escape to cancel; validate input and show save failures in place. Preserve stable identities and do not treat a connection label edit as a credential/configuration change.
  - [x] Sekme grubu yerinde yeniden adlandırma (F2/çift tıklama, Enter kaydeder, Escape iptal eder, doğrulama hatası yerinde).
  - [ ] Bağlantı görünen adı yerinde yeniden adlandırma (kimlik bilgisi/yapılandırma değişikliği sayılmadan).
  - [x] Kayıtlı mini araç yerinde yeniden adlandırma. (F2/çift tıklama, Enter kaydeder, Escape iptal eder; boş/100+ karakter/yinelenen ad ve kaydetme hatası listede yerinde gösterilir, araç kimliği değişmez.)

### R3 — Güvenilir grid düzenleme (5)

- **FI-156** (R3) — Typed cell editors: provide date pickers, expanded text editors and configured related-record selectors; make setting NULL an explicit action.
  - [x] Düz DATE/TIMESTAMP için takvim denetimi; uzun/çok satırlı metin için çok satırlı düzenleyici (Ctrl+Enter ile hazırlar); NULL açık eylem.
  - [ ] Yapılandırılmış ilişkili kayıt seçici.
- **FI-163** (R3) — Editability explanations: explain computed columns, ambiguous source tables, missing reliable row identity or insufficient privileges when editing is unavailable. Do not assume arbitrary SELECT results can be safely updated.
  - [x] Hesaplanmış/sanal sütun, birden çok kaynak tablo, kaynak tablo yok, birincil anahtar yok/eksik ve LOB-ikili sütun nedenleri gerekçesiyle gösterilir.
  - [ ] Yetersiz yetki nedeni (uygulama adımında).
  - ⚠ Yetersiz yetki nedeni FI-194 ile aynı yetki sorgusuna bağlı.
- **FI-185** (R3) — Keep edited rows visible: temporarily retain locally edited rows that no longer satisfy the current filter and label that state explicitly.
  - [x] Süzgeç ve sıralama saklanan değerlere uygulandığı için düzenlenen satır taslak değerle süzgeçten düşmez.
  - [ ] Taslak değeri süzgece uymayan satırın açıkça etiketlenmesi.
- **FI-194** (R3) — Editable-column metadata: explain why generated, identity or unauthorized columns are locked, based on actual Oracle capabilities and privileges.
  - [x] Sanal/hesaplanmış, GENERATED ALWAYS, LOB-ikili ve ifade sütunları başlıkta 🔒 ve nedeni içeren ipucuyla işaretlenir.
  - [ ] Gerçek Oracle yetkilerine (INSERT/UPDATE ayrıcalıkları) dayalı kilit nedenleri.
  - ⚠ Gerçek Oracle yetkilerini (ALL_TAB_PRIVS / oturum ayrıcalıkları) okuyan yeni bir native sorgu gerekir.
- **FI-177** (R3) — Retry corrected failures: preserve confirmed applied outcomes, let users correct failed drafts and avoid resending successful DML. Unknown outcomes require reconciliation before retry; define batch atomicity explicitly.
  - [x] Uygulanan değişiklikler korunur ve yeniden gönderilmez; başarısız/uyuşmayan/geri alınan/atlanan taslaklar düzeltilip yeniden denenebilir.
  - [ ] Belirsiz sonuç (bağlantı kopması) için mutabakat.

### R4 — Proje ölçeği ve ileri üretkenlik (1)

- **FI-015** (R4) — Safe delete: find project references before removing a procedure or parameter, and show affected code. Report analysis scope and unresolved dynamic references rather than claiming complete coverage.
  - [x] Geçerli belgede çözülen başvuruları ve sınırlı çalışma alanı metin adaylarını silme öncesi incelemede göster; belirsiz kapsamı açıkla.
  - [ ] Proje çapı semantik doğrulama ve gerçek silme akışına inceleme kapısı ekle; atlanan/okunamayan dosyaları ayrı raporla.

## 2. Hiç başlanmamış maddeler

### R2 — Günlük kullanım ve sonuç inceleme (4)

#### R2 — Günlük kullanım ve sonuç inceleme

- **FI-044** (R2) — Peek Definition: inspect and edit a definition in an inline editor without leaving the current source location.
  - ⚠ Monaco'nun inline "peek" eylemi bu derlemede pencere açmadı; kullanıcı kararıyla atlandı, yarım kod geri alındı.
- **FI-045** (R2) — Independent editor splits: give each editor group its own tabs and support drag-and-drop placement, for example package body beside specification with results below. Extend existing docking where appropriate.
  - ⚠ Bağımsız editör grupları App.jsx'teki tek `documents`/`editorRef` modelinin derin yeniden yapılandırılmasını gerektirir.
- **FI-103** (R2) — Incremental LOB reading: inspect large CLOB/BLOB values by fetching portions from Oracle on demand rather than downloading the entire value first. Display the fetched amount and total size when available, using appropriate character or byte units. This is distinct from paging a fully downloaded local value; define locator/session lifetime and invalidation behavior.
  - ⚠ Gerçek Oracle LOB konumlayıcısı ve oturum yaşam döngüsü gerekir; canlı veritabanı olmadan doğrulanamaz.
- **FI-108** (R2) — Deferred heavy-column loading: omit supported large LOB values initially and retrieve selected cells on demand, with stable row identity and clear consistency/session-lifetime behavior.
  - ⚠ Gerçek Oracle LOB okuması ve kararlı satır kimliği gerekir; canlı veritabanı olmadan doğrulanamaz.

### R3 — Güvenilir grid düzenleme (1)

#### R3 — Güvenilir grid düzenleme

- **FI-170** (R3) — Read back database-produced values: retrieve supported default, identity and trigger-produced values after applying within the same transaction, clearly distinguishing readback failures from DML failures.
  - ⚠ INSERT sonrası veritabanının ürettiği değerlerin (RETURNING) okunması; native tarafta yeni yol ve canlı Oracle gerekir.

### R4 — Proje ölçeği ve ileri üretkenlik (30)

#### R4 — Proje ölçeği ve ileri üretkenlik

- **FI-021** (R4) — DDL-to-project scaffolding: generate package specifications/bodies, CRUD procedures and test drafts for selected tables using project naming templates; generation does not execute the resulting code.
- **FI-033** (R4) — Migration workbench: author versioned schema changes, track applied migrations per environment and preview an application plan.
- **FI-034** (R4) — Offline development: cache schema metadata for completion, navigation and supported static checks without a connection; show cache age and scope.
- **FI-064** (R4) — Project health panel: consolidate local changes, objects needing compilation, compilation diagnostics and failed tests with navigation to relevant actions.
- **FI-010** (R4) — Structural search: find procedures writing to a table, blocks handling a particular exception, or packages referencing a particular column.
- **FI-019** (R4) — Call hierarchy: browse callers and callees in a bidirectional tree, with unresolved or dynamic calls identified where possible.
- **FI-026** (R4) — Inlay hints: display parameter names beside positional call arguments as editor decorations rather than source text.
- **FI-035** (R4) — Dependency graph: explore package, view and table relationships in an interactive graph with navigation to source definitions.
- **FI-060** (R4) — Column lineage navigation: trace a selected projection through aliases, CTEs and subqueries to source columns, showing unsupported or ambiguous cases.
- **FI-062** (R4) — Usage-informed completion: show real project call examples alongside package function completion suggestions.
- **FI-088** (R4) — Expected-type completion: rank compatible expressions and variables using the expected argument type, including DATE and cursor parameters.
- **FI-079** (R4) — Dynamic SQL preview: show statically resolvable portions of concatenated SQL strings in a separate panel and mark unresolved fragments without execution.
- **FI-113** (R4) — Explain expression at caret: explain a selected CASE expression, analytic function or window frame using a small illustrative dataset. Highlight the rows involved and resulting values, including partitioning, ordering, ties and ROWS/RANGE distinctions where applicable. Label example data clearly; do not execute user SQL implicitly or claim unsupported semantics are exact.
- **FI-091** (R4) — Execution queue: queue subsequent statements while the same session is busy, with reorder/removal controls before execution. Capture submitted SQL and binds explicitly; define failure and transaction behavior before implementation.
- **FI-006** (R4) — Integrated Git workflow: changed files, line diffs, staging and commits; compare local source with the database definition. Extend existing workspace Git capabilities where appropriate.
- **FI-011** (R4) — Test Explorer: browse PL/SQL tests, run a test or suite, and navigate from a failed assertion to its source location.
- **FI-012** (R4) — Task runner: define explicit sequences such as compile, run tests, then check invalid objects; show progress and output per step.
- **FI-028** (R4) — Personal code review queue: attach local review notes to source locations and collect them alongside TODO/FIXME comments in a navigable panel.
- **FI-030** (R4) — Dependency-aware compilation: identify objects affected by source changes, preview a compilation order and execute the selected compilation plan.
- **FI-040** (R4) — Semantic diff: de-emphasize formatting changes and highlight changed signatures, conditions and moved procedures in package comparisons.
- **FI-078** (R4) — Inline Git blame: show line authorship and navigate to the associated commit and its message.
- **FI-106** (R4) — Cross-window tab movement: detach SQL tabs into another window while retaining their connection/session and results, with explicit session ownership.
- **FI-140** (R4) — Spring-loaded panels: temporarily open a collapsed target panel when an item is dragged over it, allowing a valid drop and restoring state on cancellation.
- **FI-102** (R4) — Cell annotations: attach local notes to values, associated with query context and a stable row key where available; define stale-result and sensitive-data retention behavior before implementation.
- **FI-225** (R4) — Lock wait preference: configure supported wait behavior for grid mutations and expose per-row timeout/wait outcomes. Validate Oracle/provider support rather than promise a generic exact lock timeout.
- **FI-226** (R4) — Merge non-overlapping conflicts: propose combining edits to different columns after concurrent changes; require explicit review and an atomic recheck to avoid overwriting subsequent changes.
- **FI-181** (R4) — Load cell value from file: stage text/JSON files for CLOBs and binary files for BLOBs with size and content previews before applying.
- **FI-196** (R4) — Fill handle: drag from a cell corner to copy values or generate supported numeric/date sequences into local drafts, with a preview and validation.
- **FI-205** (R4) — Related-record insertion: stage parent/child records together, show execution order and propagate supported generated keys within the same transaction.
- **FI-219** (R4) — Drag-copy rows between grids: map source columns to a target table and stage INSERT drafts rather than execute mutations on drop.

### R5 — İleri Oracle ve genişletilebilirlik (5)

#### R5 — İleri Oracle ve genişletilebilirlik

- **FI-069** (R5) — SSH connection tunnels: manage SSH forwarding for Oracle connections and expose tunnel status and connection failure details within the application.
  - ⚠ SSH tünelleri ayrı bir ağ bileşeni ve sağlayıcı doğrulaması gerektirir.
- **FI-007** (R5) — PL/SQL debugging: breakpoints, stepping, variable inspection and call stack, subject to Oracle permissions and debug-session setup.
  - ⚠ PL/SQL debug için Oracle debug ayrıcalıkları ve DBMS_DEBUG_JDWP kurulumu gerekir.
- **FI-031** (R5) — PL/SQL profiling: annotate source with available line-level execution timings and navigate to expensive sections, subject to Oracle instrumentation and permissions.
- **FI-032** (R5) — Test coverage: show executed and uncovered PL/SQL source lines where the selected test framework and Oracle instrumentation support coverage.
- **FI-036** (R5) — Extension system: support custom lint rules, generators and commands so teams can integrate their development conventions.
  - ⚠ Eklenti sözleşmesi ayrı tasarlanmalı.
