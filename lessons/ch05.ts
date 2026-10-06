import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 5, title: '結合と集計', summary: '表をつなぎ、貸出と延滞を集計します。',
  steps: [
    { id: 'ch05-01', title: 'INNER JOIN — 2つの表を繋ぐ', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' } },
      story: '図書の表には分類の「番号」しか入っていません。司書向けの一覧には分類「名前」が必要です。番号で繋いで名前を取ってきましょう。',
      explanation: '## JOIN は「条件に一致する行」を横に繋ぐ\n```sql\nSELECT b.book_id, b.title, c.name AS category_name\nFROM public.books b\nJOIN public.categories c ON c.category_id = b.category_id\nWHERE b.category_id = 4\nORDER BY b.book_id;\n```\n- `JOIN 繋ぐ表 ON 繋ぐ条件`。ON に「両表の列を結ぶ条件」を書きます。ここでは books.category_id = categories.category_id（2章で作った外部キーそのもの）。\n- **INNER JOIN は「条件に一致する行だけ」を返します**。片方にしかない行は消えます（消えない JOIN は次の次のステップ）。\n- 表に**短い別名**（b, c）を付けると SQL が読みやすくなります。列がどちらの表かを明示する（b.title）のは、同名の列で曖昧になるのを防ぐ実務の作法です。\n- JOIN は「正規化で分割した表を、読むときにだけ繋ぎ戻す」操作です。保存時は分割・読み取り時は結合、がリレーショナルモデルの基本リズムです。',
      task: '技術書（category_id = 4）について book_id、title、category_name（categories.name の別名）を book_id 順に表示してください。',
      hints: ['FROM public.books b JOIN public.categories c ON c.category_id = b.category_id です。', 'c.name AS category_name で列名を付けます。', 'WHERE b.category_id = 4 で技術書に絞ります。'],
      solution: `SELECT b.book_id, b.title, c.name AS category_name
FROM public.books b
JOIN public.categories c ON c.category_id = b.category_id
WHERE b.category_id = 4
ORDER BY b.book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT b.book_id, b.title, c.name AS category_name
FROM public.books b
JOIN public.categories c ON c.category_id = b.category_id
WHERE b.category_id = 4
ORDER BY b.book_id` },
      mysqlNote: 'INNER JOIN / ON の構文は MySQL も同じです。MySQL では JOIN の条件を WHERE に書いても動きますが、ON に書くのが標準的で、PostgreSQL とも共通の作法です（LEFT JOIN では ON と WHERE で意味が変わる、はステップ03で扱う共通の落とし穴です）。' },
    { id: 'ch05-02', title: '3表 JOIN — 多対多を通る', session: 'A',
      story: '「この本の著者は誰？」を調べるには、books から book_authors を通って authors まで渡る必要があります。共著も正しく出るはずです。',
      explanation: '## 中間表を通って繋ぐ\n```sql\nSELECT b.book_id, b.title, a.author_id, a.name AS author_name\nFROM public.books b\nJOIN public.book_authors ba ON ba.book_id = b.book_id\nJOIN public.authors a ON a.author_id = ba.author_id\nWHERE b.book_id <= 5\nORDER BY b.book_id, a.author_id;\n```\n- JOIN は**いくつでも連鎖**できます。多対多の実体は中間表 book_authors で、その両側を ID で渡ります。\n- 1対多を JOIN すると**行が増える**点に注意。本1冊に著者が2人いれば、その本は2行になります。行が増えること自体は正しい挙動で、誤りではなく設計の結果です（DISTINCT が不要か必要かは、この行増加を理解しているかで決まります）。\n- 3表以上の JOIN は、**まず2表で意味を確認してから1つずつ足す**のが実務の組み立て方です。一度に書くと WHERE の置き間違いが見つからなくなります。',
      task: 'book_id が5以下の本について book_id、title、author_id、author_name（authors.name の別名）を book_id、author_id の順に表示してください。',
      hints: ['JOIN を2回書きます: book_authors、次に authors。', 'ON は ba.book_id = b.book_id と a.author_id = ba.author_id。', 'ORDER BY b.book_id, a.author_id で共著が見やすくなります。'],
      solution: `SELECT b.book_id, b.title, a.author_id, a.name AS author_name
FROM public.books b
JOIN public.book_authors ba ON ba.book_id = b.book_id
JOIN public.authors a ON a.author_id = ba.author_id
WHERE b.book_id <= 5
ORDER BY b.book_id, a.author_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT b.book_id, b.title, a.author_id, a.name AS author_name
FROM public.books b
JOIN public.book_authors ba ON ba.book_id = b.book_id
JOIN public.authors a ON a.author_id = ba.author_id
WHERE b.book_id <= 5
ORDER BY b.book_id, a.author_id` },
      mysqlNote: '複数 JOIN の連鎖は MySQL も同じ構文です。実務の違いは性能面: MySQL は JOIN のアルゴリズムが実表結合（ネステッドループ）中心で、PostgreSQL はハッシュ結合・マージ結合を選べます。大表同士の JOIN で想定より遅いとき、実行計画の読み方（EXPLAIN）が処方箋になるのは共通です（8章で再訪）。' },
    { id: 'ch05-03', title: 'LEFT JOIN — 「一致しない行」を消さない', session: 'A',
      story: '館長から「現在延滞している会員」ではなく、逆に「延滞していない会員」の一覧を出してほしいと言われました。INNER JOIN では書けないパターンです。',
      explanation: '## LEFT JOIN と anti-join\n```sql\nSELECT m.member_id, m.name\nFROM public.members m\nLEFT JOIN public.loans l ON l.member_id = m.member_id\n  AND l.returned_on IS NULL AND l.due_on < CURRENT_DATE\nWHERE l.loan_id IS NULL\nORDER BY m.member_id;\n```\n- `LEFT JOIN` は**左の表の行を全部残し**、右に一致がなければ右の列を NULL で埋めます。INNER JOIN だと「一致する行が1つもない左の行」は消えてしまいます。例えば「貸出0件の会員」は INNER JOIN の結果に絶対に現れません。\n- **右側を残したい行に限定する条件は ON に**書きます（未返却・延滞の条件）。WHERE に書くと「NULL の行」まで消えて LEFT JOIN の意味がなくなります。ON と WHERE の役割の違いは、LEFT JOIN で最も大事な知識です。\n- `WHERE 右表.主キー IS NULL` と組み合わせると「**一致する行が存在しない左の行**」を取り出せます。このパターンを anti-join と呼び、実務で「未発注の商品」「未着手の会員」を出す定番です。この seed の会員は全員借りた実績があるので、「現在延滞中」という条件で絞った右側を使って「延滞していない会員」を取り出します。\n- NOT IN や NOT EXISTS でも同じことが書けます（ステップ08で実際に比較します）。',
      task: '現在延滞していない会員（未返却かつ due_on が今日より前の貸出が存在しない会員）を member_id、name の2列で member_id 順に表示してください。',
      hints: ['LEFT JOIN public.loans l ON l.member_id = m.member_id AND l.returned_on IS NULL AND l.due_on < CURRENT_DATE。', '右側を絞る条件は ON に書きます（WHERE に書くと LEFT JOIN の意味が変わります）。', 'WHERE l.loan_id IS NULL で「延滞中の貸出がない会員」にします。'],
      solution: `SELECT m.member_id, m.name
FROM public.members m
LEFT JOIN public.loans l ON l.member_id = m.member_id
  AND l.returned_on IS NULL AND l.due_on < CURRENT_DATE
WHERE l.loan_id IS NULL
ORDER BY m.member_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT m.member_id, m.name
FROM public.members m
LEFT JOIN public.loans l ON l.member_id = m.member_id
  AND l.returned_on IS NULL AND l.due_on < CURRENT_DATE
WHERE l.loan_id IS NULL
ORDER BY m.member_id` },
      mysqlNote: 'LEFT JOIN と ON/WHERE の役割分担、anti-join のイディオムは MySQL も全く同じです。注意点も共通: MySQL 5.x には LEFT JOIN を INNER JOIN 相当に最適化してしまう歴史があり、ON に書く条件を WHERE に書き間違えると結果が変わる事故は両方で起きます。' },
    { id: 'ch05-04', title: 'COUNT — 行を数える3通り', session: 'A',
      story: '月次報告の原資料です。「貸出は総件数・返却済み・貸出中」の3点セットを、1つの SELECT で出してください。',
      explanation: '## COUNT(*) と COUNT(列) は違う\n```sql\nSELECT count(*) AS all_loans,\n       count(returned_on) AS returned_loans,\n       count(*) - count(returned_on) AS open_loans\nFROM public.loans;\n```\n- `count(*)` は**行の数**。NULL は関係ありません。\n- `count(列)` は**その列が NULL でない行の数**。NULL は数に入りません。\n- この違いは「NULL で未入力を表す列」で事故になります。「メール登録者数」を `count(*)` で数えると未登録者も数えてしまう、などです。\n- 「貸出中の件数」のように**NULL のままの行**を数えたいとき、わざわざ WHERE を書かなくても `count(*) - count(列)` で出せるのが軽妙なイディオムです（ここでは「未返却 = returned_on が NULL」をそのまま数えています）。\n- その他: `count(DISTINCT 列)` は「値の種類数」（4章 DISTINCT と同じ考え方）。',
      task: 'loans から、総貸出件数（all_loans）、返却済み件数（returned_loans）、貸出中件数（open_loans）を1行で表示してください。',
      hints: ['count(*) と count(returned_on) を並べます。', '貸出中は count(*) - count(returned_on) で出せます。', '3つの列に all_loans / returned_loans / open_loans と別名を付けます。'],
      solution: `SELECT count(*) AS all_loans,
       count(returned_on) AS returned_loans,
       count(*) - count(returned_on) AS open_loans
FROM public.loans;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `SELECT count(*) AS all_loans,
       count(returned_on) AS returned_loans,
       count(*) - count(returned_on) AS open_loans
FROM public.loans` },
      mysqlNote: 'count(*) と count(列) の意味の違い、count(DISTINCT 列) は MySQL も同じです。細かい差: PostgreSQL の count は bigint を返し、MySQL も bigint を返します。また「NULL を含む列の平均」など集計関数が NULL を無視する挙動（avg や sum も）は両方で共通です。' },
    { id: 'ch05-05', title: 'GROUP BY — グループごとに集計', session: 'A',
      story: '分類ごとの蔵書点数を集計して、書架の増強計画に使うことになりました。',
      explanation: '## 縦にまとめる\n```sql\nSELECT c.category_id, c.name, count(*) AS book_count\nFROM public.categories c\nJOIN public.books b ON b.category_id = c.category_id\nGROUP BY c.category_id, c.name\nORDER BY c.category_id;\n```\n- `GROUP BY 列` は、その列の値が同じ行を**1つのグループに畳みます**。SELECT に出せるのは「GROUP BY した列」と「集計関数の結果」だけです。グループ内の個々の行（例: 各本の title）は出せません。\n- 実務では「**何の単位で数えているか**」を GROUP BY が宣言している、と読みます。この SQL は「分類単位」の行数です。\n- `count(*)` はグループごとの行数。`sum(price)` なら分類ごとの価格合計、`avg(price)` なら平均、`min/max` もグループ単位で効きます。\n- 「0件のグループも出したい」場合は JOIN ではなく LEFT JOIN + `count(b.book_id)`（NULL は数えない）を使います。count(*) だと NULL 埋めされた行も1と数えてしまう、はこの章の頻出ミスです。',
      task: '分類ごとの蔵書点数を category_id、name、book_count の3列で category_id 順に表示してください。',
      hints: ['GROUP BY c.category_id, c.name に集計対象を合わせます。', 'count(*) AS book_count で点数を出します。', 'ORDER BY c.category_id です。'],
      solution: `SELECT c.category_id, c.name, count(*) AS book_count
FROM public.categories c
JOIN public.books b ON b.category_id = c.category_id
GROUP BY c.category_id, c.name
ORDER BY c.category_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT c.category_id, c.name, count(*) AS book_count
FROM public.categories c
JOIN public.books b ON b.category_id = c.category_id
GROUP BY c.category_id, c.name
ORDER BY c.category_id` },
      mysqlNote: 'GROUP BY と集計の基本は MySQL も同じです。実務的な違い: MySQL は sql_mode の only_full_group_by（既定で有効）により、GROUP BY に含まない列の SELECT を拒否します。PostgreSQL も同様に拒否しますが、主キーで機能的に従属する列は許可する（例: category_id で GROUP BY すれば name は許可）点がやや寛容です。どちらでも「集計単位以外の列を出す」のは避けるのが作法です。' },
    { id: 'ch05-06', title: 'HAVING — グループを絞り込む', session: 'A',
      story: '次の企画会議向けに「1950年代生まれの著者のうち、著書が3冊以上ある人」だけをリストアップします。',
      explanation: '## WHERE は行、HAVING はグループ\n```sql\nSELECT a.author_id, a.name, count(*) AS book_count\nFROM public.authors a\nJOIN public.book_authors ba ON ba.author_id = a.author_id\nWHERE a.birth_year < 1970\nGROUP BY a.author_id, a.name\nHAVING count(*) >= 3\nORDER BY a.author_id;\n```\n- **WHERE: グループ化する前の個々の行**を絞る。**HAVING: グループ化した後のグループ**を絞る。\n- 集計結果（count(*) >= 3）は HAVING にしか書けません。WHERE は行を1行ずつ見る段階なので「グループの行数」を知らないからです。\n- 処理順序の暗記: `WHERE → GROUP BY → HAVING → SELECT → ORDER BY`。\n- 実務の性能勘: **同じ条件で書けるなら WHERE に書く**。行を減らしてから集計した方が速いためです（HAVING は集計後の全グループを舐める）。逆に「集計してから意味が決まる条件」は HAVING 一択です。この区別はコードレビューで頻出します。',
      task: '1950年代〜60年代生まれ（birth_year < 1970）の著者のうち、著書が3冊以上ある人を author_id、name、book_count の3列で author_id 順に表示してください。',
      hints: ['birth_year の条件は WHERE に、冊数の条件は HAVING に書きます。', 'HAVING count(*) >= 3 です。', 'ORDER BY a.author_id です。'],
      solution: `SELECT a.author_id, a.name, count(*) AS book_count
FROM public.authors a
JOIN public.book_authors ba ON ba.author_id = a.author_id
WHERE a.birth_year < 1970
GROUP BY a.author_id, a.name
HAVING count(*) >= 3
ORDER BY a.author_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT a.author_id, a.name, count(*) AS book_count
FROM public.authors a
JOIN public.book_authors ba ON ba.author_id = a.author_id
WHERE a.birth_year < 1970
GROUP BY a.author_id, a.name
HAVING count(*) >= 3
ORDER BY a.author_id` },
      mysqlNote: 'HAVING の役割と WHERE/HAVING の使い分けは MySQL も全く同じです。MySQL では HAVING に書いた別名（HAVING book_count >= 3）が動いてしまう歴史がありますが、標準ではなく移植性が落ちるため、PostgreSQL でも動く集計式のまま書くのが安全です。' },
    { id: 'ch05-07', title: 'サブクエリ — 値の一覧と平均を使う', session: 'A',
      story: '収集の目安として「平均価格より高く、なおかつ現在貸出中の蔵書がある本」を調べます。1つの SELECT の中に SELECT を入れます。',
      explanation: '## SELECT の中の SELECT\n```sql\nSELECT book_id, title, price\nFROM public.books\nWHERE price > (SELECT avg(price) FROM public.books)\n  AND book_id IN (SELECT book_id FROM public.copies WHERE status = \'loaned\')\nORDER BY book_id;\n```\n- **スカラー・サブクエリ**: `(SELECT avg(price) FROM public.books)` は「1行1列」の値として扱われ、比較の右辺に置けます。平均より上、という「表から計算した基準」をその場で作れるのが強みです。\n- **IN サブクエリ**: `(SELECT ...)` の結果の一覧と一致する行、という条件です。固定値の IN (6,7,8)（4章）が、問い合わせになった形です。\n- 実務では「アプリで先に平均を取ってから2本目の SQL を投げる」より、**1本の SQL で意味が完結する**サブクエリの方が、一貫性（計算の瞬間が同じ）とレビュー性で勝ります。\n- パフォーマンスの知見: PostgreSQL のプランナは IN と EXISTS をほぼ同じプランに最適化できるので、**読みやすい方**を選んでよい場面が多いです。ただし NOT 側（次のステップ）には NULL の罠があります。',
      task: 'price が全書誌の平均より高く、かつ貸出中（status = \'loaned\'）の蔵書を持つ本を book_id、title、price の3列で book_id 順に表示してください。',
      hints: ['平均は (SELECT avg(price) FROM public.books) で取ります。', '貸出中の本は book_id IN (SELECT book_id FROM public.copies WHERE status = \'loaned\') です。', '2つの条件は AND でつなぎ、ORDER BY book_id です。'],
      solution: `SELECT book_id, title, price
FROM public.books
WHERE price > (SELECT avg(price) FROM public.books)
  AND book_id IN (SELECT book_id FROM public.copies WHERE status = 'loaned')
ORDER BY book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id, title, price
FROM public.books
WHERE price > (SELECT avg(price) FROM public.books)
  AND book_id IN (SELECT book_id FROM public.copies WHERE status = 'loaned')
ORDER BY book_id` },
      mysqlNote: 'スカラー・サブクエリも IN サブクエリも MySQL は同じ構文です。MySQL 5.6 以前はサブクエリが遅い実装だった名残で「サブクエリ禁止」の文化が残ることがありますが、8.0 ではプランナが大きく改善しています。「読みやすい方を選ぶ」基準は PostgreSQL と共通です。' },
    { id: 'ch05-08', title: 'EXISTS と NOT IN の罠', session: 'A',
      story: '「今、誰にも借りられていない本」を一覧にして、新着紹介に使いましょう。NOT 系のサブクエリには、4章で予告した NULL の罠があります。',
      explanation: '## 存在チェックと反転の罠\n```sql\nSELECT b.book_id, b.title\nFROM public.books b\nWHERE NOT EXISTS (\n  SELECT 1 FROM public.copies c JOIN public.loans l ON l.copy_id = c.copy_id\n  WHERE c.book_id = b.book_id AND l.returned_on IS NULL\n)\nORDER BY b.book_id;\n```\n- `EXISTS (サブクエリ)` は「1行でも一致すれば真」。中の SELECT は列が何でもよく、慣習で `SELECT 1` と書きます。**相関**サブクエリ（中から外の b を参照する）の定番です。\n- ここで **NOT IN を使うと事故**になります:\n```sql\nWHERE b.book_id NOT IN (SELECT c.book_id FROM public.copies c JOIN public.loans l ...\n  WHERE l.returned_on IS NULL ...)  -- これは良い（book_id は NULL になり得ない）\nWHERE b.book_id NOT IN (SELECT l.returned_on FROM public.loans l ...)  -- 悪い例: NULL が混ざると全滅\n```\n  `NOT IN (x, NULL, ...)` は `b.book_id <> x AND b.book_id <> NULL ...` に展開され、`<> NULL` が UNKNOWN になるため**1行も返りません**。NOT IN の一覧に NULL が混ざる可能性がある列（NULL 許可の列や LEFT JOIN の結果）は、最初から **NOT EXISTS** で書くのが実務の安全側です。\n- EXISTS は「見つかったら探索を打ち切れる」ので、巨大な一覧との一致確認でも行数を数える IN より理屈上効率よく終われます（プランナ次第とはいえ、意味が伝わりやすいのも利点です）。',
      task: '現在貸出中（未返却）の蔵書が1つもない本を book_id、title の2列で book_id 順に表示してください。NOT EXISTS を使います。',
      hints: ['WHERE NOT EXISTS (SELECT 1 FROM ... WHERE c.book_id = b.book_id AND l.returned_on IS NULL)。', '中の SELECT は SELECT 1 で構いません。', '外側は ORDER BY b.book_id です。'],
      solution: `SELECT b.book_id, b.title
FROM public.books b
WHERE NOT EXISTS (
  SELECT 1 FROM public.copies c JOIN public.loans l ON l.copy_id = c.copy_id
  WHERE c.book_id = b.book_id AND l.returned_on IS NULL
)
ORDER BY b.book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT b.book_id, b.title
FROM public.books b
WHERE NOT EXISTS (
  SELECT 1 FROM public.copies c JOIN public.loans l ON l.copy_id = c.copy_id
  WHERE c.book_id = b.book_id AND l.returned_on IS NULL
)
ORDER BY b.book_id` },
      mysqlNote: 'EXISTS / NOT EXISTS は MySQL も同じ構文で、NOT IN の NULL 全滅トラップも MySQL で同じ挙動（UNKNOWN は WHERE で弾かれる）です。「NOT 系は NOT EXISTS で書く」は両方の文化で通用する作法です。' },
    { id: 'ch05-09', title: 'CTE (WITH) — 段組みで読みやすく', session: 'A',
      story: '月次レポートの下書きです。「未返却の貸出」をいったん名前付きの部品にして、本数・延滞数・最古の期限を1行にまとめます。',
      explanation: '## WITH で部品を作る\n```sql\nWITH open_loans AS (\n  SELECT loan_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL\n)\nSELECT count(*) AS open_count,\n       count(*) FILTER (WHERE due_on < CURRENT_DATE) AS overdue_count,\n       min(due_on) AS oldest_due\nFROM open_loans;\n```\n- `WITH 名前 AS (SELECT ...)` は**CTE（共通テーブル式）**。問い合わせの中だけで使える一時的な「名前つきの結果」で、以降の SELECT はそれを表のように使えます。\n- 複雑なレポートを「まずこの形に整える」「次にそれを集計する」と**段組みに分割**できるのが最大の価値です。レビューで「この段は何をしているか」が読めます。CTE は複数つなげられ、後ろの CTE から前の CTE を参照できます。\n- `count(*) FILTER (WHERE ...)` は PostgreSQL の便利な構文で、「条件を満たす行だけを数える」集計です。CASE で書く `count(CASE WHEN due_on < CURRENT_DATE THEN 1 END)` と同じ結果を、意図が伝わる形で書けます。\n- CTE とビューの違い: ビューは保存されて全セッションで再利用できる（7章）。CTE はこの1文のためだけの部品です。使い捨ての中間成果物は CTE、恒久的な定義はビュー、と使い分けます。',
      task: 'WITH で open_loans（未返却の貸出: loan_id, member_id, due_on）を定義し、そこから open_count（件数）、overdue_count（うち due_on が今日より前）、oldest_due（最も古い due_on）を1行で表示してください。',
      hints: ['WITH open_loans AS (SELECT loan_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL)。', '本体は FROM open_loans に対する集計です。', 'overdue_count は count(*) FILTER (WHERE due_on < CURRENT_DATE) で出せます。'],
      solution: `WITH open_loans AS (
  SELECT loan_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL
)
SELECT count(*) AS open_count,
       count(*) FILTER (WHERE due_on < CURRENT_DATE) AS overdue_count,
       min(due_on) AS oldest_due
FROM open_loans;`,
      replay: '',
      check: { type: 'result-equals', expectedSql: `WITH open_loans AS (
  SELECT loan_id, member_id, due_on FROM public.loans WHERE returned_on IS NULL
)
SELECT count(*) AS open_count,
       count(*) FILTER (WHERE due_on < CURRENT_DATE) AS overdue_count,
       min(due_on) AS oldest_due
FROM open_loans` },
      mysqlNote: 'MySQL 8.0 から CTE（WITH）と再帰 CTE が使えるようになり、構文は PostgreSQL とほぼ同じです。ただし `count(*) FILTER (WHERE ...)` は MySQL にありません。MySQL では `count(CASE WHEN 条件 THEN 1 END)` または `SUM(条件)` で代用します。FILTER の方が読みやすいので PostgreSQL では好んで使われます。' },
    { id: 'ch05-10', title: '窓関数 — カテゴリ内ランキング', session: 'A',
      story: '「ジャンル別の人気本」を作りましょう。GROUP BY だと各グループが1行に畳んで消えてしまう「順位」を、窓関数なら行を残したまま計算できます。',
      explanation: '## 集計せずに集計関数を使う\n```sql\nSELECT b.category_id, b.book_id, b.title, count(*) AS loan_count,\n       rank() OVER (PARTITION BY b.category_id ORDER BY count(*) DESC) AS rank_in_category\nFROM public.books b\nJOIN public.copies c ON c.book_id = b.book_id\nJOIN public.loans l ON l.copy_id = c.copy_id\nGROUP BY b.category_id, b.book_id, b.title\nORDER BY b.category_id, rank_in_category, b.book_id\nLIMIT 10;\n```\n- **窓関数**は「周囲の行を見ながら計算するが、行を畳まない」関数です。`OVER (...)` が窓の指定で、GROUP BY と共存できます（ここでは一度集計した行に対して順位を付けています）。\n- `PARTITION BY` は窓の仕切り。「カテゴリ内で順位を付ける」の「カテゴリ内」です。省略すると全行が1つの窓になります。\n- `rank()` は同点が同じ順位になり、次は順位が飛びます（1, 1, 3...）。`dense_rank()` は飛ばさず（1, 1, 2...）、`row_number()` は同点でもバラバラに連番を付けます。「同点の扱い」で使い分け、実務では row_number() を使って「1行だけ選ぶ」ことが多いです。\n- 窓関数は WHERE より後で計算されるため、**順位で WHERE の絞り込みはできません**。絞り込みたいときは CTE やサブクエリで囲んでから WHERE に使います（副問い合わせに順位列を渡す、という段組み）。\n- 人気の定義を「貸出回数」にしています。実務のランキング実装で、ほぼこの形の SQL になります。',
      task: '本ごとの貸出回数（loan_count）を数え、カテゴリ内の人気順位（rank_in_category）を rank() で付けた一覧を、category_id、rank_in_category、book_id の順に並べて先頭10行表示してください。',
      hints: ['GROUP BY で貸出回数を集計し、その隣に rank() OVER (PARTITION BY b.category_id ORDER BY count(*) DESC) を置きます。', 'ORDER BY b.category_id, rank_in_category, b.book_id で行順を確定します。', 'LIMIT 10 で先頭だけにします。'],
      solution: `SELECT b.category_id, b.book_id, b.title, count(*) AS loan_count,
       rank() OVER (PARTITION BY b.category_id ORDER BY count(*) DESC) AS rank_in_category
FROM public.books b
JOIN public.copies c ON c.book_id = b.book_id
JOIN public.loans l ON l.copy_id = c.copy_id
GROUP BY b.category_id, b.book_id, b.title
ORDER BY b.category_id, rank_in_category, b.book_id
LIMIT 10;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT b.category_id, b.book_id, b.title, count(*) AS loan_count,
       rank() OVER (PARTITION BY b.category_id ORDER BY count(*) DESC) AS rank_in_category
FROM public.books b
JOIN public.copies c ON c.book_id = b.book_id
JOIN public.loans l ON l.copy_id = c.copy_id
GROUP BY b.category_id, b.book_id, b.title
ORDER BY b.category_id, rank_in_category, b.book_id
LIMIT 10` },
      mysqlNote: '窓関数（rank / dense_rank / row_number / PARTITION BY / OVER）は MySQL 8.0 から使えます。それ以前（5.7 まで）は相関サブクエリや変数の黒魔術で代用していた歴史があり、「窓関数が使えるか」が移行先 MySQL のバージョン判断材料になります。「窓関数の結果で WHERE できない」制約も MySQL と共通で、CTE で囲む workaround も同じです。' },
    { id: 'ch05-11', title: '日付計算 — 今日の延滞者リスト', session: 'A',
      story: 'いよいよ実務に近い形です。「今日時点の延滞者リスト」を、延滞日数つきで館長に提出してください。この問い合わせは、明日実行すれば明日の延滞になります。',
      explanation: '## 日付は引ける\n```sql\nSELECT l.loan_id, m.name AS member_name, l.due_on, CURRENT_DATE - l.due_on AS days_overdue\nFROM public.loans l\nJOIN public.members m ON m.member_id = l.member_id\nWHERE l.returned_on IS NULL AND l.due_on < CURRENT_DATE\nORDER BY days_overdue DESC, l.loan_id;\n```\n- PostgreSQL では **date - date は integer（日数）** になります。`CURRENT_DATE - l.due_on` で「何日延滞か」がそのまま出ます。日付の加減算（+ n、- n）も日単位でできます。\n- `CURRENT_DATE` は問い合わせた日（タイムゾーンなし）。実行した日に応じて結果が変わる、つまり**この SQL は毎朝実行するだけで最新の督促リストになる**。seed の日付も「今日からの相対」で作ってあるので、教材の中でこの SQL は常に正しく動きます。\n- 「未返却 AND 期限切れ」の2条件で延滞を定義します。`due_on < CURRENT_DATE` は「昨日までが期限」（境界日は今日が期限、＝延滞ではない）。\n- ORDER BY で days_overdue の降順にすると「最も長く延滞している人」が上に来ます。督促業務の優先順位そのものです。\n- 7章では、この日数を使う延滞料の計算を関数にします（`days_overdue × 単価`）。',
      task: '未返却で due_on が今日より前の貸出について、loan_id、member_name（会員名）、due_on、days_overdue（延滞日数）を、延滞日数が長い順に表示してください。',
      hints: ['延滞日数は CURRENT_DATE - l.due_on で計算します。', 'WHERE l.returned_on IS NULL AND l.due_on < CURRENT_DATE です。', 'ORDER BY days_overdue DESC, l.loan_id で長い順に並べます。'],
      solution: `SELECT l.loan_id, m.name AS member_name, l.due_on, CURRENT_DATE - l.due_on AS days_overdue
FROM public.loans l
JOIN public.members m ON m.member_id = l.member_id
WHERE l.returned_on IS NULL AND l.due_on < CURRENT_DATE
ORDER BY days_overdue DESC, l.loan_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT l.loan_id, m.name AS member_name, l.due_on, CURRENT_DATE - l.due_on AS days_overdue
FROM public.loans l
JOIN public.members m ON m.member_id = l.member_id
WHERE l.returned_on IS NULL AND l.due_on < CURRENT_DATE
ORDER BY days_overdue DESC, l.loan_id` },
      mysqlNote: 'MySQL では date 同士の `-` はできないため `DATEDIFF(l.due_on, CURRENT_DATE) * -1` または `DATEDIFF(CURRENT_DATE, l.due_on)` を使います（DATEDIFF(a, b) は a - b の日数）。現在時刻は CURDATE()（日付）と NOW()（日時）で、PostgreSQL の CURRENT_DATE / CURRENT_TIMESTAMP にほぼ対応します。日付の加算は MySQL では DATE_ADD(d, INTERVAL 14 DAY) と書きます。' },
  ],
}
export default chapter
