import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 7, title: 'ビュー・関数・トリガー', summary: '再利用できる問い合わせと業務ルールを実装します。',
  steps: [
    { id: 'ch07-01', title: 'v_book_catalog — 定番の問い合わせをビューにする', session: 'A',
      story: '開館から一週間。司書から「書誌と分類名を一緒に見たい問い合わせ、各所で何度も書いている」という声が上がりました。同じ JOIN を何度も書かせているのは、システム側の怠慢です。再利用できる部品としてデータベースに保存しましょう。',
      explanation: '## ビューは「名前をつけた SELECT」\n```sql\nCREATE VIEW public.v_book_catalog AS\nSELECT b.book_id, b.isbn, b.title, c.name AS category_name\nFROM public.books b\nJOIN public.categories c ON c.category_id = b.category_id;\n```\n`CREATE VIEW ビュー名 AS SELECT ...` で、SELECT に名前を付けて保存できます。\n\n- **保存されるのは定義だけ**。実行するたびに中身の SELECT が走ります。表のコピーを作るわけではないので、元表が更新されればビューにも即座に反映されます（これが8章で扱うマテリアライズドビューとの違いです）。\n- ビューは権限の出口にもなります。10章では、会員向け画面にこのビューだけを SELECT できる役割（lib_reader）を作ります。元表の books を直接見せず、必要な列だけを「見せる窓」として提供するのが実務の定番です。\n- JOIN をアプリの SQL に何か所も書くと、列の追加・仕様変更時に修正が散らばります。1か所（ビュー）にまとめれば、アプリは `SELECT * FROM v_book_catalog` と書くだけで済みます。\n\n**なぜ実務でこうするか**: 「同じ問い合わせを複数画面で使い回す」「一般ユーザーに見せる列を限定する」はどちらも頻出要件で、ビューはその両方を SQL の変更だけで解決します。\n\n確認のため、ビューを SELECT してみましょう。',
      task: 'v_book_catalog ビューを作成してください（book_id, isbn, title, category_name の4列）。最後に book_id 順の先頭5行を表示します。',
      hints: ['CREATE VIEW public.v_book_catalog AS SELECT ... ; の形です。', 'books b JOIN public.categories c ON c.category_id = b.category_id で JOIN します。分類名列は c.name AS category_name です。', '確認は SELECT book_id, isbn, title, category_name FROM public.v_book_catalog ORDER BY book_id LIMIT 5;'],
      solution: `CREATE VIEW public.v_book_catalog AS
SELECT b.book_id, b.isbn, b.title, c.name AS category_name
FROM public.books b
JOIN public.categories c ON c.category_id = b.category_id;

SELECT book_id, isbn, title, category_name FROM public.v_book_catalog ORDER BY book_id LIMIT 5;`,
      check: { type: 'sql', sql: `SELECT (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('public.v_book_catalog')) = 'v'
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_book_catalog') = 4
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_book_catalog' AND column_name = 'category_name') = 1
  AND (SELECT category_name FROM public.v_book_catalog WHERE book_id = 1) = '文学'
  AND (SELECT category_name FROM public.v_book_catalog WHERE book_id = 2) = '歴史'` },
      mysqlNote: 'CREATE VIEW は MySQL でもほぼ同じ構文です。MySQL ではビュー定義に `ALGORITHM=MERGE|TEMPTABLE` という実行方式の指定があり、MERGE（定義を呼び出し側に展開）は PostgreSQL の通常ビューに近く、TEMPTABLE（結果を一時表に作る）は集計ビューなどで選ばれます。PostgreSQL のビューは自動で最適な実行方式を選びます。PostgreSQL にのみ存在する「マテリアライズドビュー」は3つ後のステップで登場します。' },
    { id: 'ch07-02', title: 'v_overdue_loans — 延滞一覧を常に同じ定義で', session: 'A',
      story: '延滞はれっきとした「催促業務」の起点です。司書が延滞一覧を取るとき、人によって「due_on を今日と比較する」のか「返却済みも含める」のかが揺れると、督促漏れが発生します。延滞の定義をデータベース側に1つだけ作ります。',
      explanation: '## 業務の定義を1か所に固定する\n```sql\nCREATE VIEW public.v_overdue_loans AS\nSELECT l.loan_id, l.member_id, l.copy_id, l.due_on,\n       CURRENT_DATE - l.due_on AS days_overdue\nFROM public.loans l\nWHERE l.returned_on IS NULL\n  AND l.due_on < CURRENT_DATE;\n```\nポイント:\n- **NULL = 貸出中** の約束（2章）と **日付の相対比較** が組み合わさった、この道場で一番「業務が乗った」問い合わせです。\n- `CURRENT_DATE - l.due_on` は date 同士の引き算で「日数（integer）」を返します。延滞日数の計算を SQL 側に入れてしまうのがミソで、表示側では日付の加工から解放されます。\n- この教材の seed では、貸出 ID 81〜90 の10件が「今日より前が期限・未返却」になる相対日付で作られています。つまりこのビューは**常に10行**を返し、ID 81 は常に「延滞20日」です。日付が基準の業務データを「今日」から作るのは、テストを書きやすくする実務の定番手法です。\n\n**なぜ実務でこうするか**: 「延滞」のような業務用語の定義は、口約束ではなくコードとして存在しないと必ず解釈が分かれます。ビューはその定義に名前を付け、司書・アプリ・帳票の全員が同じ一覧を見るための仕掛けです。',
      task: 'v_overdue_loans ビューを作成してください（loan_id, member_id, copy_id, due_on, days_overdue の5列）。最後に loan_id 順で全行を表示します。',
      hints: ['未返却は returned_on IS NULL、延滞は due_on < CURRENT_DATE です。', 'days_overdue は CURRENT_DATE - l.due_on です（date 同士の引き算で日数になります）。', '確認は SELECT loan_id, member_id, copy_id, due_on, days_overdue FROM public.v_overdue_loans ORDER BY loan_id;'],
      solution: `CREATE VIEW public.v_overdue_loans AS
SELECT l.loan_id, l.member_id, l.copy_id, l.due_on,
       CURRENT_DATE - l.due_on AS days_overdue
FROM public.loans l
WHERE l.returned_on IS NULL
  AND l.due_on < CURRENT_DATE;

SELECT loan_id, member_id, copy_id, due_on, days_overdue FROM public.v_overdue_loans ORDER BY loan_id;`,
      check: { type: 'sql', sql: `SELECT (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('public.v_overdue_loans')) = 'v'
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_overdue_loans') = 5
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'v_overdue_loans' AND column_name = 'days_overdue') = 1
  AND (SELECT count(*) FROM public.v_overdue_loans) = 10
  AND (SELECT days_overdue FROM public.v_overdue_loans WHERE loan_id = 81) = 20
  AND (SELECT count(*) FROM public.v_overdue_loans WHERE member_id = 1) = 1` },
      mysqlNote: 'MySQL でも同じ CREATE VIEW が使えます。日付の差は MySQL では `DATEDIFF(CURRENT_DATE, due_on)` 関数を使います（date 同士の `-` 演算は PostgreSQL の流儀）。CURRENT_DATE は両方で同じ意味です。' },
    { id: 'ch07-03', title: 'mv_category_stats — マテリアライズドビューは「保存された結果」', session: 'A',
      story: '館長から「分類ごとの蔵書数」を集計表として常時見たいと言われました。蔵書数の集計は毎回 JOIN して数え直す必要があるのでしょうか。ここで「ビュー」と「マテリアライズドビュー」の違いを体感します。',
      explanation: '## ビューとの違いは「結果を保存するか」\n```sql\nCREATE MATERIALIZED VIEW public.mv_category_stats AS\nSELECT c.category_id, COUNT(b.book_id)::bigint AS book_count\nFROM public.categories c\nLEFT JOIN public.books b ON b.category_id = c.category_id\nGROUP BY c.category_id;\n```\n- **ビュー** … 定義を保存し、SELECT されるたびに問い合わせが実行される\n- **マテリアライズドビュー（MV）** … **結果そのものを表として保存**する。SELECT は保存済みの結果を見るだけなので、重い集計を何度でも一瞬で見せられる\n\n## なぜ LEFT JOIN と COUNT(b.book_id) なのか\n`COUNT(b.book_id)` は NULL を数えません。「本が1冊もない分類」は book_id が NULL になるので 0 と数えられます。`COUNT(*)` だと**本が無くても1行」と数えてしまう**のが集計SQLの定番バグです。`::bigint` は見た目の統一（COUNT は bigint を返す）です。\n\n## MV の代償: 古くなる\n結果を保存するということは、**元表が変わっても MV は変わらない**ということです。最新にするには `REFRESH MATERIALIZED VIEW` を自分で（夜間バッチなどで）実行します。これは次のステップで体験します。\n\n**なぜ実務でこうするか**: 蔵書数のように「厳密なリアルタイム性は不要だが、参照は頻繁」の集計は、MVにまとめて REFRESH を夜間1回にするだけで、日中の問い合わせコストをほぼゼロにできます。「重いが、鮮度は1日でよい」——この条件が揃ったときに MV は真価を発揮します。',
      task: 'mv_category_stats を作成してください（category_id, book_count の2列、全分類を含む）。最後に分類順で全行を表示します。',
      hints: ['CREATE MATERIALIZED VIEW public.mv_category_stats AS SELECT ... ; です。', 'FROM categories c LEFT JOIN books b ON b.category_id = c.category_id とし、COUNT(b.book_id)::bigint AS book_count で GROUP BY c.category_id します。', 'COUNT(*) ではなく COUNT(b.book_id) を使います（NULL を数えないため、本が無い分類は 0 になる）。'],
      solution: `CREATE MATERIALIZED VIEW public.mv_category_stats AS
SELECT c.category_id, COUNT(b.book_id)::bigint AS book_count
FROM public.categories c
LEFT JOIN public.books b ON b.category_id = c.category_id
GROUP BY c.category_id;

SELECT category_id, book_count FROM public.mv_category_stats ORDER BY category_id;`,
      check: { type: 'sql', sql: `SELECT (SELECT c.relkind FROM pg_class c WHERE c.oid = to_regclass('public.mv_category_stats')) = 'm'
  AND (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = 'public.mv_category_stats'::regclass AND a.attnum > 0 AND NOT a.attisdropped) = 2
  AND (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = 'public.mv_category_stats'::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attname = 'book_count') = 1
  AND (SELECT count(*) FROM public.mv_category_stats) = 10
  AND (SELECT book_count FROM public.mv_category_stats WHERE category_id = 1) = 5
  AND (SELECT book_count FROM public.mv_category_stats WHERE category_id = 10) = 5
  AND (SELECT a.atttypid = 'bigint'::regtype FROM pg_attribute a WHERE a.attrelid = 'public.mv_category_stats'::regclass AND a.attname = 'book_count' AND NOT a.attisdropped)` },
      mysqlNote: '**MySQL にはマテリアライズドビューがありません**（MariaDB も同様）。実務では (1) 集計結果を入れる普通の表を作り、(2) バッチやイベント（CREATE EVENT / cron）で INSERT ... SELECT ... TRUNCATE を定期的に再実行する、という手作り運用が定番です。つまり「REFRESH を自分で作る」世界です。Oracle や PostgreSQL には MV があるため、移行時は「表 + バッチ」に置き換える設計が必要になります。' },
    { id: 'ch07-04', title: 'REFRESH MATERIALIZED VIEW — 古くなった MV を最新にする', session: 'A',
      story: '集計表が完成しました。翌朝、新刊の到着登録を済ませた司書から「蔵書数が昨日のままだ」と連絡がありました。MV が古くなるのは仕様です。最新化の操作を、データを壊さない形で体験します。',
      explanation: '## MV の鮮度は REFRESH で管理する\n`REFRESH MATERIALIZED VIEW public.mv_category_stats;` は「定義の SELECT を実行し、保存された結果を入れ替える」操作です。\n\nこのステップでは、**1件の新刊（ID 51）をトランザクションの中だけで登録**して、MV の挙動を観察します。\n\n1. INSERT の後、MV は**変わらない**（保存された結果を見ているので）\n2. REFRESH を実行すると、**同じトランザクション内の未コミット行も含めて**数え直される（分類1が 5 → 6 になる）\n3. ROLLBACK すると、INSERT も REFRESH も**なかったこと**になる（最後の SELECT で 5 に戻る）\n\n3番は重要です。**PostgreSQL では REFRESH も通常のトランザクションの一部**なので、障害時に中途半端な状態が残りません。夜間バッチは「BEGIN → REFRESH → COMMIT」で安全に組めます。\n\n## 本番運用の作法\n- `REFRESH MATERIALIZED VIEW ... CONCURRENTLY` は参照を**ブロックせず**に切り替えますが、**一意インデックスが MV に必要**です（この MV なら category_id に UNIQUE を付ける）。夜間バッチなら通常の REFRESH で十分です。\n- CONCURRENTLY はトランザクション内で実行できません（エラーになります）。単独の文として実行します。\n\n**なぜ実務でこうするか**: 鮮度要求は業務ごとに決めるものです。「蔵書数は夜間1回」「延滞一覧はリアルタイム（だからビュー）」という使い分けが、コストと正確性のバランスを取る設計です。',
      task: '模範解答を1回実行して、MV が REFRESH で更新され、ROLLBACK で元に戻ることを確認してください。採点は最後の SELECT（実験後に何も残っていないこと）で行います。',
      hints: ['BEGIN 〜 ROLLBACK の中で INSERT → MV 確認 → REFRESH → MV 確認 の順に実行します。', 'INSERT するのは books に ID 51（分類1）の1行だけです。', '最後の SELECT は ROLLBACK の後、トランザクションの外で実行します。'],
      solution: `BEGIN;
INSERT INTO public.books (book_id, isbn, title, category_id)
VALUES (51, '9780000000051', '別冊・図書館の本51', 1);
SELECT category_id, book_count AS before_refresh FROM public.mv_category_stats WHERE category_id = 1;
REFRESH MATERIALIZED VIEW public.mv_category_stats;
SELECT category_id, book_count AS after_refresh FROM public.mv_category_stats WHERE category_id = 1;
ROLLBACK;
SELECT category_id, book_count FROM public.mv_category_stats WHERE category_id = 1;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: 'SELECT category_id, book_count FROM public.mv_category_stats WHERE category_id = 1' },
      mysqlNote: 'MySQL に REFRESH は存在しません（MV 自体が無いため）。MySQL の手作り集計では、`RENAME TABLE` を使った「作ってから名前を入れ替える」アトミックな切り替えが定番です（書き換え中に SELECT が中途半端な結果を見ないようにする工夫）。PostgreSQL の MV + REFRESH はこの切り替えを標準機能として持っている、と考えると理解しやすいです。' },
    { id: 'ch07-05', title: 'calc_late_fee — 料金計算を関数に閉じ込める', session: 'A',
      story: '延滞金の計算規則が決まりました。「返却日（未返却なら今日）から期限日を引いた日数 × 10円、ただし0円以下は0」。この規則を司書全員が暗算で守れるとは限りません。規則は、SQL の関数として1か所に閉じ込めます。',
      explanation: '## SQL 言語の関数\n```sql\nCREATE FUNCTION public.calc_late_fee(p_loan_id integer) RETURNS integer\nLANGUAGE sql STABLE AS $$\n  SELECT GREATEST(COALESCE(l.returned_on, CURRENT_DATE) - l.due_on, 0) * 10\n  FROM public.loans l\n  WHERE l.loan_id = p_loan_id\n$$;\n```\n- `LANGUAGE sql` … 関数の中身が1つの SELECT で書ける場合の選択。PL/pgSQL より単純で、呼び出し側に**インライン展開できる**ため、プランナが最適化しやすいという実務上の利点もあります。\n- **STABLE** … 「1トランザクション内では同じ引数に同じ結果」を保証する印。CURRENT_DATE を使うので不変（IMMUTABLE）にはできませんが、表の行も変えないので揮発性（VOLATILE）にもしたくない。プランナは STABLE な関数を1回だけ評価するなど最適化に使えます。\n- `GREATEST(式, 0)` … マイナスを0に丸める定番 idiom（期限内返却は0円）。\n- `COALESCE(l.returned_on, CURRENT_DATE)` … 未返却なら「今日」で計算。NULL との演算が NULL になる性質を COALESCE で受ける、実務頻出の型です。\n- 存在しない貸出 ID を渡すと SELECT が0行 → **NULL が返ります**（エラーにしない設計。呼び出し側で NULL チェックします）。\n\n**なぜ実務でこうするか**: 計算規則を司書・督促状アプリ・帳票の3か所に書けば、規則改正時に3か所直し、1か所忘れて事故になります。関数にすれば ALTER は1回です。\n\n## SECURITY INVOKER\nPostgreSQL の関数は既定で **SECURITY INVOKER**（呼び出した人の権限で実行）です。この教材の関数はすべてこの既定のままにします。**SECURITY DEFINER（定義者の権限で実行）は権限昇格の事故源**なので、本当に必要な場合（権限の無い利用者に限定操作を許す等）以外は避けるのが実務の作法です。',
      task: 'calc_late_fee(integer) 関数を作成してください（RETURNS integer、LANGUAGE sql STABLE）。最後に貸出 1（期限内返却・0円）、81（延滞中）、9999（存在しない）の3件で結果を確認します。',
      hints: ['CREATE FUNCTION public.calc_late_fee(p_loan_id integer) RETURNS integer LANGUAGE sql STABLE AS $$ ... $$; の形です。', '本体は SELECT GREATEST(COALESCE(l.returned_on, CURRENT_DATE) - l.due_on, 0) * 10 FROM public.loans l WHERE l.loan_id = p_loan_id です。', '確認は SELECT loan_id, calc_late_fee(loan_id) AS fee ... よりも、SELECT calc_late_fee(1), calc_late_fee(81), calc_late_fee(9999) の形が手軽です。'],
      solution: `CREATE FUNCTION public.calc_late_fee(p_loan_id integer) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT GREATEST(COALESCE(l.returned_on, CURRENT_DATE) - l.due_on, 0) * 10
  FROM public.loans l
  WHERE l.loan_id = p_loan_id
$$;

SELECT public.calc_late_fee(1) AS returned_in_time,
       public.calc_late_fee(81) AS still_overdue,
       public.calc_late_fee(9999) AS missing_loan;`,
      check: { type: 'sql', sql: `SELECT to_regprocedure('public.calc_late_fee(integer)') IS NOT NULL
  AND (SELECT public.calc_late_fee(1)) = 0
  AND (SELECT public.calc_late_fee(81)) = 200
  AND (SELECT public.calc_late_fee(9999)) IS NULL
  AND (SELECT public.calc_late_fee(90)) = 20` },
      mysqlNote: 'MySQL では `CREATE FUNCTION ... RETURNS ...` を使いますが、**本文を BEGIN ... END で書く場合は DELIMITER // の中継が必要**です（文内の `;` が関数の終わりと誤解されるのを防ぐため。psql やこのエディターには不要な MySQL 独自の作法です）。関数作成には MySQL で **LOG_BIN_TRUST_FUNCTION_CREATORS または SUPER 権限**（バイナリログ有効時）という制約がありました。MySQL 8.0 では `CREATE FUNCTION ... READS SQL DATA` のような特性宣言（DETERMINISTIC 等）がレプリケーション安全性の観点から必須になる点が、PostgreSQL の STABLE/VOLATILE と似て非なるものです。' },
    { id: 'ch07-06', title: 'check_loan_available — 貸出ルールをトリガーで強制する', session: 'A',
      story: 'ついにこのシステム最大の業務ルールの登場です。「available な蔵書しか貸出できない」。アプリ側でチェックを書いても、直接 SQL を流す人が現れたら破られます。ルールをテーブルの直前に立たせます。',
      explanation: '## トリガー = 行が変わる瞬間に自動で走る手続き\n```sql\nCREATE FUNCTION public.check_loan_available() RETURNS trigger\nLANGUAGE plpgsql AS $$\nDECLARE\n  v_status text;\nBEGIN\n  SELECT status INTO v_status FROM public.copies\n  WHERE copy_id = NEW.copy_id FOR UPDATE;\n  IF v_status IS DISTINCT FROM \'available\' THEN\n    RAISE EXCEPTION \'蔵書 % は貸出できません（状態: %）\', NEW.copy_id, COALESCE(v_status, \'不明\')\n      USING ERRCODE = \'23514\';\n  END IF;\n  UPDATE public.copies SET status = \'loaned\' WHERE copy_id = NEW.copy_id;\n  RETURN NEW;\nEND\n$$;\n\nCREATE TRIGGER trg_loans_check_available\nBEFORE INSERT ON public.loans\nFOR EACH ROW EXECUTE FUNCTION public.check_loan_available();\n```\n2つの部品で構成します。\n1. **トリガー関数**（RETURNS trigger）… PL/pgSQL で書き、`NEW` に「これから入る行」が入る\n2. **トリガー** … 「どの表の、どのタイミング（BEFORE INSERT）で、各行（FOR EACH ROW）に対して、どの関数を」を指定\n\n## この関数がやっていること\n- `FOR UPDATE` … copies のその行を**行ロック**してから読みます。同じ蔵書を2つの窓口が同時に貸し出そうとしたとき、後から来た方が待たされ、先の処理が確定してから判定できます（9章で実演します）。\n- `IS DISTINCT FROM` … NULL と比較しても安全な `=`（copies に存在しない copy_id でも狂わない）。\n- `RAISE EXCEPTION ... USING ERRCODE = \'23514\'` … 業務違反を**CHECK 制約と同じ SQLSTATE** で蹴ります。アプリは「制約違反の仲間」として統一的に扱えます。\n- `UPDATE copies ... status = \'loaned\'` … 貸出と蔵書状態の変更を**不可分**にします。INSERT が失敗すれば、この UPDATE も同じトランザクションで元に戻ります。\n- `RETURN NEW` … 「この行を入れてよし」。RETURN NULL なら INSERT を黙って捨てます（今回は使いません）。\n\n**なぜ実務でこうするか**: 「二重貸出の防止」をアプリ層だけに任せると、SQL を直に流す人・別アプリ・バッチが抜け穴になります。トリガーにすれば**どの経路からでも同じルール**が適用され、ルール変更も1か所です。なお2章で作った部分一意索引 loans_one_open_copy_idx は、トリガーが無くても二重貸出を拒む最後の砦です。トリガーは「分かりやすい業務エラー」と「蔵書状態の維持」を担当し、一意索引が物理的な最終防衛線——2層にしておくのが堅い設計です。\n\n※ 関数は `CREATE OR REPLACE` で上書き修正できますが、トリガーは同名で作り直せません（DROP してから）。実務では本体の修正は OR REPLACE で回します。',
      task: 'check_loan_available() トリガー関数と trg_loans_check_available トリガー（BEFORE INSERT ON loans）を作成してください。',
      hints: ['まず CREATE OR REPLACE FUNCTION public.check_loan_available() RETURNS trigger LANGUAGE plpgsql AS $$ ... $$; を作ります。', '関数は copies の行を FOR UPDATE で読み、available 以外なら RAISE EXCEPTION ... USING ERRCODE = \'23514\'、最後に status = \'loaned\' に更新して RETURN NEW します。', 'トリガーは CREATE TRIGGER trg_loans_check_available BEFORE INSERT ON public.loans FOR EACH ROW EXECUTE FUNCTION public.check_loan_available(); です。'],
      solution: `CREATE OR REPLACE FUNCTION public.check_loan_available() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.copies
    WHERE copy_id = NEW.copy_id FOR UPDATE;
  IF v_status IS DISTINCT FROM 'available' THEN
    RAISE EXCEPTION '蔵書 % は貸出できません（状態: %）', NEW.copy_id, COALESCE(v_status, '不明')
      USING ERRCODE = '23514';
  END IF;
  UPDATE public.copies SET status = 'loaned' WHERE copy_id = NEW.copy_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_loans_check_available
BEFORE INSERT ON public.loans
FOR EACH ROW EXECUTE FUNCTION public.check_loan_available();`,
      check: { type: 'sql', sql: `SELECT (SELECT count(*) FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.proname = 'check_loan_available' AND n.nspname = 'public'
           AND p.prorettype = 'trigger'::regtype AND p.prokind = 'f') = 1
  AND (SELECT count(*) FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE t.tgname = 'trg_loans_check_available' AND n.nspname = 'public' AND c.relname = 'loans'
           AND NOT t.tgisinternal
           AND pg_get_triggerdef(t.oid) LIKE '%BEFORE INSERT ON public.loans%') = 1` },
      mysqlNote: 'MySQL にも BEFORE INSERT トリガーがありますが、細部が違います。(1) トリガー関数という概念がなく、`CREATE TRIGGER ... BEFORE INSERT ON loans FOR EACH ROW BEGIN ... END` に本体を直接書きます（DELIMITER 指定が必要）。(2) MySQL はトリガー内で**トリガー対象の表と同じ表を更新できません**が、loans のトリガーから copies を更新するのは問題なく可能です。(3) エラー送出は `SIGNAL SQLSTATE \'45000\' SET MESSAGE_TEXT = ...`（ユーザー定義領域）が定番で、PostgreSQL の ERRCODE 指定のような細かいエラーコード体系はありません。(4) MySQL のトリガーは1表1イベントに1つだけ（PostgreSQL は複数可）。' },
    { id: 'ch07-07', title: '貸出を体験する — トリガーが蔵書状態を書き換える', session: 'A',
      story: 'トリガーは「入れた」。本当に動くのか、自分の目で確かめます。本気の貸出を1件…と言いたいところですが、seed を汚すわけにはいきません。トランザクションの中だけで実行して、最後に ROLLBACK します。',
      explanation: '## トリガーの動きを追う\n蔵書 1（ステータス available）を会員 1 に貸し出す、という1行の INSERT を観察します。\n\n1. `BEGIN` でトランザクションを開く\n2. loans に INSERT すると、**トリガーが先に走る**（BEFORE INSERT）\n3. `SELECT ... FROM copies WHERE copy_id = 1` は **\'loaned\' に変わっている** — トリガーが UPDATE したから\n4. `ROLLBACK` すると、**INSERT も、トリガーの UPDATE も、一緒に消える**\n\n3 → 4 がこのステップの核心です。トリガーの変更はトリガーを起こした INSERT と**同じトランザクション**に入るので、取り消しも一体です。「貸出が決まった瞬間に蔵書状態も決まる」を、中途半端な状態が存在できない形で実現できています。\n\n**なぜ実務でこうするか**: この実験の ROLLBACK は学習用ですが、実務でも同じ仕組みが事故を防ぎます。貸出の INSERT の後で別テーブルへの登録に失敗して全体がロールバックされる場合でも、蔵書状態にゴミが残りません。',
      task: 'BEGIN 〜 ROLLBACK の中で貸出 ID 101（蔵書1・会員1）を INSERT し、copies の状態が loaned に変わることを確認した後、ROLLBACK してください。最後の SELECT で「何も残っていない」ことを採点します。',
      hints: ['BEGIN; の後に INSERT INTO public.loans (loan_id, copy_id, member_id, due_on) VALUES (101, 1, 1, CURRENT_DATE + 14); を実行します（loan_id を明示するので採番も進みません）。', 'トランザクション中に SELECT copy_id, status FROM public.copies WHERE copy_id = 1; を実行すると loaned が見えます。', 'ROLLBACK; した後、トランザクションの外で最後の SELECT を実行します。'],
      solution: `BEGIN;
INSERT INTO public.loans (loan_id, copy_id, member_id, due_on)
VALUES (101, 1, 1, CURRENT_DATE + 14);
SELECT copy_id, status AS in_loan FROM public.copies WHERE copy_id = 1;
ROLLBACK;
SELECT (SELECT count(*)::int FROM public.loans WHERE loan_id = 101) AS loan_rows,
       (SELECT status FROM public.copies WHERE copy_id = 1) AS copy_status;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `SELECT (SELECT count(*)::int FROM public.loans WHERE loan_id = 101) AS loan_rows,
       (SELECT status FROM public.copies WHERE copy_id = 1) AS copy_status` },
      mysqlNote: 'この一連の動作（トリガーの更新が INSERT と一体でロールバックされる）は MySQL の InnoDB トリガーでも同じです。ただし MySQL では **DDL の暗黙コミット**があるため、「トリガーを作る」操作自体は前後のトランザクションを分断します。PostgreSQL はトリガー作成（DDL）すらトランザクション内で取り消せる点が大きく違います（2章の最後のステップで体験済み）。' },
    { id: 'ch07-08', title: '貸出済みの蔵書は弾かれる（SQLSTATE 23514）', session: 'A',
      story: '逆パターンの確認です。誰かが借りている本（蔵書61は seed の時点で貸出中）を貸し出そうとしたらどうなるか。正しく拒否され、かつデータベースに何も残らないことを確かめます。',
      explanation: '## 業務違反は業務エラーとして\n蔵書 61 は、貸出 ID 81 が未返却（copies のステータスが loaned）です。次の1行を実行してください。\n```sql\nINSERT INTO public.loans (copy_id, member_id, due_on) VALUES (61, 2, CURRENT_DATE + 14);\n```\n結果:\n- **SQLSTATE 23514**（CHECK 制約違反と同じクラス）で、トリガーが例外を投げます\n- INSERT は**失敗し、1行も入らない**\n- トリガーが途中でやったはずの copies の UPDATE も**全部巻き戻る**（単独の INSERT は自動コミット、つまり「1文だけのトランザクション」だから）\n\nこの1文を送った後、セッションの状態表示が **idle に戻る**ことも確認してください。エラーで壊れたのは「その1文」だけで、接続やトランザクションには傷がつきません。\n\nなお、仮にトリガーが無かったらどうなるか — loans_one_open_copy_idx（2章の部分一意索引）が `23505`（一意違反）で同じ挿入を止めます。**トリガーは分かりやすい業務メッセージ、索引は物理的な最終防衛線**。2層防御が効いている証拠です。\n\n**なぜ実務でこうするか**: アプリは 23514 を受け取ったら「その蔵書は今貸出できません」と案内できます。背後の在庫状態（誰がいつまで借りているか）を意識せずに済む、安定した契約です。',
      task: '蔵書61（貸出中）への貸出 INSERT を実行して、SQLSTATE 23514 で拒否されることを確認してください。',
      hints: ['INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (61, 2, CURRENT_DATE + 14); を単独の送信で実行します。', 'エラーパネルの「コード」が 23514 であることを確認します。', '実行後、SELECT count(*) FROM public.loans; が 100 のまま（行が増えていない）ことも確認できます。'],
      solution: `INSERT INTO public.loans (copy_id, member_id, due_on) VALUES (61, 2, CURRENT_DATE + 14);`,
      replay: '',
      check: { type: 'error-code', code: '23514' },
      mysqlNote: 'MySQL では同様の拒否を `SIGNAL SQLSTATE \'45000\'` で実現するのが定番です。MySQL の SQLSTATE は「クラス + サブクラス」の標準体系を持つものの、PostgreSQL ほど違反種別ごとに細かいコードが分かれていません（3章の NOT NULL と同じ注意）。エラー処理を MySQL の番号（ERROR 1644 など）で書いているシステムを移行する場合は、SQLSTATE ベースに置き換える設計になります。' },
    { id: 'ch07-09', title: 'return_loan — 返却を1操作にまとめる手続き', session: 'A',
      story: '貸出は1行の INSERT で済みましたが、返却は「loans の返却日を埋める」+「copies を available に戻す」の2つの更新がセットです。窓口業務は1操作にすべきです。手続き（PROCEDURE）を作り、CALL で回します。',
      explanation: '## PROCEDURE と CALL\n```sql\nCREATE PROCEDURE public.return_loan(p_loan_id integer, p_returned_on date DEFAULT CURRENT_DATE)\nLANGUAGE plpgsql AS $$ ... $$;\n```\n- PostgreSQL 11 から **PROCEDURE（手続き）** が登場しました。関数（SELECT で呼ぶ）と違い、**CALL で呼ぶ**、戻り値を持たない、そして**手続きの中で COMMIT / ROLLBACK を実行できる**（バッチ処理を分割コミットするときに使う）のが特徴です。副作用的な一連の更新をまとめる用途に向いています。\n- `p_returned_on date DEFAULT CURRENT_DATE` — 第2引数を省略すると「今日」返却とみなします。\n- 中身: (1) loans の**未返却の行だけ**を更新し、`RETURNING copy_id INTO v_copy_id` で対象の蔵書を受け取る (2) もし0行（存在しない/返却済み）なら `P0002`（no_data_found、PL/pgSQL の慣習コード）で例外 (3) copies を available に戻す。**返却を2回 CALL しても二重に壊れない**作りです。\n- 関数・トリガーと同じく所有者は admin、**SECURITY DEFINER にはしません**（呼び出し人の権限のまま）。10章では lib_app にこの手続きだけを許可します。\n\n**なぜ実務でこうするか**: 「返却」は複数表の更新が伴う業務操作の典型です。司書は「返却ボタン」を押すだけにして、内部でどの表がどう変わるかは1つの手続きに隠します。実装の変更（例えば延滞金の自動計算を足す）も、呼び出し側を変えずに済みます。\n\n**このステップの採点は「手続きの定義が要件どおりか」で行います。** 手続きを実際に CALL して動きを確かめるのは次のステップです。',
      task: 'return_loan 手続きを作成してください。引数は (p_loan_id integer, p_returned_on date DEFAULT CURRENT_DATE) の2つ。未返却の loans 行だけを更新し、RETURNING で対象の copy_id を受け取り、対象が無ければ P0002 で例外、copies を available に戻す、という流れです。採点は手続きの定義で行います。',
      hints: ['CREATE OR REPLACE PROCEDURE public.return_loan(p_loan_id integer, p_returned_on date DEFAULT CURRENT_DATE) LANGUAGE plpgsql AS $$ ... $$; です。', '中身は UPDATE loans ... WHERE loan_id = p_loan_id AND returned_on IS NULL RETURNING copy_id INTO v_copy_id; → NULL なら RAISE EXCEPTION USING ERRCODE = \'P0002\' → UPDATE copies SET status = \'available\' WHERE copy_id = v_copy_id; の3段です。', 'PL/pgSQL は DECLARE でローカル変数 v_copy_id integer を宣言します。引数は $1 でも p_loan_id でも参照できます。'],
      solution: `CREATE OR REPLACE PROCEDURE public.return_loan(p_loan_id integer, p_returned_on date DEFAULT CURRENT_DATE)
LANGUAGE plpgsql AS $$
DECLARE
  v_copy_id integer;
BEGIN
  UPDATE public.loans SET returned_on = p_returned_on
  WHERE loan_id = p_loan_id AND returned_on IS NULL
  RETURNING copy_id INTO v_copy_id;
  IF v_copy_id IS NULL THEN
    RAISE EXCEPTION '貸出 % は存在しないか返却済みです', p_loan_id USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.copies SET status = 'available' WHERE copy_id = v_copy_id;
END
$$;`,
      check: { type: 'sql', sql: `SELECT to_regprocedure('public.return_loan(integer, date)') IS NOT NULL
  AND (SELECT p.prokind FROM pg_proc p WHERE p.oid = to_regprocedure('public.return_loan(integer, date)')) = 'p'
  AND (SELECT count(*) FROM pg_proc p
        WHERE p.oid = to_regprocedure('public.return_loan(integer, date)')
          AND pg_get_functiondef(p.oid) LIKE '%p_returned_on date DEFAULT CURRENT_DATE%') = 1
  AND (SELECT count(*) FROM pg_proc p
        WHERE p.oid = to_regprocedure('public.return_loan(integer, date)')
          AND p.prosecdef = false) = 1` },
      mysqlNote: 'MySQL にも PROCEDURE と CALL があります（むしろ MySQL は関数より手続きが主役の文化です。DELIMITER 指定が必要）。MySQL の手続きはトランザクション制御文を含められますが、PostgreSQL 11 未満では「関数の中で COMMIT できない」制約がありました（現在は PROCEDURE が担当）。PostgreSQL の PROCEDURE を MySQL に移行するときは、戻り値の代わりに OUT パラメータや結果セットを返す MySQL の流儀に読み替えます。' },
    { id: 'ch07-10', title: '返却を体験する — CALL と、その一体性', session: 'A',
      story: '手続きは「作った」。動かして確かめます。貸出1件を登録してから返却の手続きを呼び、loans の返却日と copies の状態がどう変わるかを見ます。seed は汚せないので、最後は ROLLBACK で巻き戻します。',
      explanation: '## CALL の中身を追う\nガイドに沿って、トランザクションの中だけで「貸して、すぐ返す」を実行します。\n\n1. `BEGIN` でトランザクションを開く\n2. loan_id 102（蔵書2・会員3）を INSERT → 7章のトリガーが copies の蔵書2を **loaned** にする\n3. `CALL public.return_loan(102, CURRENT_DATE);` → loans の返却日が埋まり、copies の蔵書2が **available** に戻る\n4. 途中の SELECT で、**返却日が入っている**ことが見えます（返却が成立した証拠）\n5. `ROLLBACK` すると、INSERT も CALL がやった2つの UPDATE も**一緒に消える**\n\nポイントは 3 の CALL が「loans の UPDATE」と「copies の UPDATE」を**1文にまとめている**ことです。アプリが2つの文を別々に送る実装だと、途中で失敗したときに「返却日は入ったが蔵書が貸出中のまま」という状態が残り得ます。手続きにすれば、その2つは**不可分**です。\n\n二重返却の心配もありません。`WHERE returned_on IS NULL` があるので、返却済みの loan_id を CALL すると **P0002** で例外になります（試すと分かります）。\n\n**なぜ実務でこうするか**: 窓口の「返却」ボタンは1つですが、内部では複数表が動きます。その手順を SQL 側に固定しておけば、どの画面・どのバッチから呼んでも同じ手順になります。\n\n採点は「ROLLBACK して何も残っていないこと」で行います。途中の CALL でエラーが出れば、最後の SELECT が 25P02 で失敗し、採点も通りません。',
      task: 'BEGIN 〜 ROLLBACK の中で、貸出 ID 102（蔵書2・会員3）を INSERT し、CALL public.return_loan(102, CURRENT_DATE); を実行してください。返却日の入った行を SELECT で確認したら、ROLLBACK して何も残らないことを確認します。',
      hints: ['INSERT INTO public.loans (loan_id, copy_id, member_id, due_on) VALUES (102, 2, 3, CURRENT_DATE + 14); で貸出1件を作ります。', 'CALL public.return_loan(102, CURRENT_DATE); がその loan_id を返却にします。第2引数は省略して CALL public.return_loan(102); でも同じです。', 'SELECT l.loan_id, l.returned_on, c.status AS copy_status FROM public.loans l JOIN public.copies c ON c.copy_id = l.copy_id WHERE l.loan_id = 102; で returned_on が今日、copy_status が available になります。'],
      solution: `BEGIN;
INSERT INTO public.loans (loan_id, copy_id, member_id, due_on)
VALUES (102, 2, 3, CURRENT_DATE + 14);
CALL public.return_loan(102, CURRENT_DATE);
SELECT l.loan_id, l.returned_on, c.status AS copy_status
FROM public.loans l JOIN public.copies c ON c.copy_id = l.copy_id
WHERE l.loan_id = 102;
ROLLBACK;
SELECT (SELECT count(*)::int FROM public.loans WHERE loan_id = 102) AS loan_rows,
       (SELECT status FROM public.copies WHERE copy_id = 2) AS copy_status;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `SELECT (SELECT count(*)::int FROM public.loans WHERE loan_id = 102) AS loan_rows,
       (SELECT status FROM public.copies WHERE copy_id = 2) AS copy_status` },
      mysqlNote: 'MySQL の CALL も同じく複数表の更新を1文にまとめられます。ただし MySQL では**手続き本体は定義時ではなく実行時の権限で動く**（DEFINER 指定が既定）で、PostgreSQL の PROCEDURE は呼び出し人の権限で動く（SECURITY INVOKER が既定）という違いがあり、権限設計に効いてきます（10章で扱います）。二重返却を P0002 で拒む設計は MySQL なら SIGNAL SQLSTATE \'45000\' で表現します。' },
  ],
}
export default chapter
