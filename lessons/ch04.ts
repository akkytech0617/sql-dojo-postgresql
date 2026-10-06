import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 4, title: '検索基本', summary: '条件・並べ替え・NULL を使って必要な情報を探します。',
  steps: [
    { id: 'ch04-01', title: 'SELECT の列指定と * の使い分け', session: 'A',
      connect: { A: { user: 'admin', password: '', database: 'library' } },
      story: '開館できました。最初の仕事は新着コーナーの「棚札」づくりです。本の番号・書名・価格だけが載った一覧が必要です。',
      explanation: '## 必要な列だけを書く\n```sql\nSELECT book_id, title, price FROM public.books;\n```\nSELECT の後ろに**欲しい列だけ**をカンマ区切りで並べます。\n\n`SELECT *`（全列）は手軽ですが、実務では避けるのが作法です。\n- 列を足した瞬間に「列数が合わない」で壊れる（アプリ・帳票・CSV 出力すべて）\n- いらない列まで転送して遅い（特に大きな text 列）\n- レビューで「何を使っているか」が読めない\n\nまず `SELECT * FROM public.books;` を自由練習で実行して全列を眺め、それから課題の3列だけを選びましょう。**列は SELECT の順に表示される**点も、帳票づくりでは重要です。',
      task: 'books から book_id、title、price の3列を book_id 順に、先頭10行分表示してください。',
      hints: ['SELECT の後ろに列をカンマ区切りで書きます。', 'ORDER BY book_id で並べ替え、LIMIT 10 で行数を絞ります。', '列の順序は book_id, title, price の順です。'],
      solution: `SELECT book_id, title, price
FROM public.books
ORDER BY book_id
LIMIT 10;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id, title, price
FROM public.books
ORDER BY book_id
LIMIT 10` },
      mysqlNote: 'MySQL でも構文は全く同じです（`SELECT book_id, title, price FROM books ORDER BY book_id LIMIT 10;`）。実務上の違いは `SELECT *` のリスクが共通であることと、PostgreSQL はテーブル名の前にスキーマ名を `public.books` のように書ける点です（MySQL では database 名を同じ形式で書けます）。' },
    { id: 'ch04-02', title: 'WHERE — 比較と AND / OR と優先順位', session: 'A',
      story: '技術書と芸術書の中から、高額な本（2,900円以上）だけを抜き出して移動先の書架を検討することになりました。',
      explanation: '## WHERE で行を絞り込む\n```sql\nSELECT book_id, title, category_id, price\nFROM public.books\nWHERE (category_id = 4 OR category_id = 5) AND price >= 2900\nORDER BY book_id;\n```\n- 比較演算子は `=` `<>` `!=` `<` `<=` `>` `>=`。等号は `==` ではなく `=` です。\n- `AND` は「かつ」、`OR` は「または」。**AND の方が優先順位が高い**ため、OR と混ぜるときは括弧が必要です。\n\n括弧を外すと `category_id = 4 OR (category_id = 5 AND price >= 2900)` の意味になり、「技術書は全て」漏れなく入ってしまいます。実務では**意味が自明な場合でも括弧を付ける**コードが好まれます。数か月後の自分と、レビュアーの誤読を防ぐためです。',
      task: '技術（category_id=4）または芸術（category_id=5）の本のうち、price が 2900 以上のものを book_id、title、category_id、price の4列で book_id 順に表示してください。',
      hints: ['WHERE (category_id = 4 OR category_id = 5) AND price >= 2900 が骨格です。', '括弧を外すと結果が変わります。AND が OR より強いからです。', 'ORDER BY book_id を忘れずに。'],
      solution: `SELECT book_id, title, category_id, price
FROM public.books
WHERE (category_id = 4 OR category_id = 5) AND price >= 2900
ORDER BY book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id, title, category_id, price
FROM public.books
WHERE (category_id = 4 OR category_id = 5) AND price >= 2900
ORDER BY book_id` },
      mysqlNote: '比較・AND・OR・優先順位は MySQL も完全に同じです（AND が OR より強い点も）。違いがあるとすれば、MySQL では C 言語風の `&&` `||` も（sql_mode によっては）書けることです。移植性を考えれば `AND` `OR` を使うべき、という結論は両方で同じです。' },
    { id: 'ch04-03', title: 'IN と BETWEEN で範囲を書く', session: 'A',
      story: '児童・社会・哲学の3ジャンルについて、ここ10年ほどで入手した本だけの一覧を作ります。OR を並べるより読みやすい書き方を覚えましょう。',
      explanation: '## 選択肢と範囲\n```sql\nSELECT book_id, title, published_year\nFROM public.books\nWHERE category_id IN (6, 7, 8) AND published_year BETWEEN 2010 AND 2020\nORDER BY book_id;\n```\n- `IN (値, ...)` は「この中のどれか」。`category_id = 6 OR category_id = 7 OR ...` と同じ意味ですが、読みやすく、書き漏らしも起きにくいのが強みです。\n- `BETWEEN a AND b` は「a 以上 b 以下」の**両端を含みます**（`>= a AND <= b` と同値）。実務では「境界の1日・1円が入るか」の認識ズレが事故になるので、含まれると暗記しておいてください。\n- `NOT IN` と `NOT BETWEEN` もあります。ただし NOT IN には NULL で全滅する罠があります（ステップ05で扱います）。\n\n日付の範囲は `BETWEEN` ではなく半開区間 `>= a AND < b+1日` で書くのが実務の定番です（月の最終日を間違えない）。',
      task: 'category_id が 6, 7, 8 のいずれかで、published_year が 2010〜2020 の本を book_id、title、category_id、published_year の4列で book_id 順に表示してください。',
      hints: ['IN (6, 7, 8) と BETWEEN 2010 AND 2020 を AND でつなぎます。', 'BETWEEN は両端を含みます。', '表示列は book_id, title, category_id, published_year の順です。'],
      solution: `SELECT book_id, title, category_id, published_year
FROM public.books
WHERE category_id IN (6, 7, 8) AND published_year BETWEEN 2010 AND 2020
ORDER BY book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id, title, category_id, published_year
FROM public.books
WHERE category_id IN (6, 7, 8) AND published_year BETWEEN 2010 AND 2020
ORDER BY book_id` },
      mysqlNote: 'IN / BETWEEN / NOT IN / NOT BETWEEN は MySQL でも同じ構文・同じ両端含みです。日付の半開区間イディオム（`>= a AND < b`）も同じく MySQL の定番です。' },
    { id: 'ch04-04', title: 'LIKE / ILIKE — パターンマッチ', session: 'A',
      story: '司書から「バーコードを小文字で打ち込んで検索したい」という要望が来ました。大文字・小文字の扱いが鍵になります。',
      explanation: '## LIKE の書き方\n```sql\nSELECT copy_id, barcode FROM public.copies WHERE barcode LIKE \'CP001%\';\n```\n- `%` は「任意の0文字以上」、`_` は「任意の1文字」。`LIKE \'CP001%\'` は CP0010〜CP0019 に一致します。\n- PostgreSQL の `LIKE` は**大文字・小文字を区別します**。`\'cp001%\'` では CP0010 に一致しません。\n- 大小を無視するのが `ILIKE` です。`WHERE barcode ILIKE \'cp001%\'` なら小文字指定でも一致します。\n\n実務の知見:\n- **前方一致（\'x%\'）は B-tree インデックスが使える**、中間一致（\'%x%\'）は全行走査になります。検索窓の仕様を決めるときに必ず意識してください（8章でインデックスを扱います）。\n- 文字列の「含む検索」には `position()` や `regexp_like`（正規表現）も選択肢です。\n\nMySQL の LIKE は**既定の照合順序が大文字・小文字を無視する**ため、PG の LIKE とは挙動が違います（下の MySQL ノート）。',
      task: 'copies から barcode が小文字で cp001 で始まる蔵書を copy_id、barcode の2列で copy_id 順に表示してください。大小を無視できる構文を使います。',
      hints: ['大小を無視するのは ILIKE です。', "WHERE barcode ILIKE 'cp001%' です。", 'ORDER BY copy_id を付けます。'],
      solution: `SELECT copy_id, barcode
FROM public.copies
WHERE barcode ILIKE 'cp001%'
ORDER BY copy_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT copy_id, barcode
FROM public.copies
WHERE barcode ILIKE 'cp001%'
ORDER BY copy_id` },
      mysqlNote: 'MySQL の LIKE は照合順序しだいで、多くの環境（utf8mb4_0900_ai_ci など）では**大文字・小文字を無視**します。つまり MySQL の `LIKE \'cp001%\'` は PostgreSQL の `ILIKE` に近い挙動です。PostgreSQL で LIKE を区別したくない列は、式インデックス（`lower(barcode)`）＋ `lower(barcode) LIKE ...` で定番に対処します（8章で再登場）。' },
    { id: 'ch04-05', title: 'IS NULL — 「不明」と = NULL の罠', session: 'A',
      story: 'メールマガジンの配信準備中です。「メールアドレスを登録していない会員」をリストアップして、案内状を郵送することになりました。',
      explanation: '## NULL は = で比較できない\n```sql\nSELECT member_id, name, email\nFROM public.members\nWHERE email IS NULL;\n```\nNULL は「不明・未入力」を表す特殊な値で、**通常の比較は全部 UNKNOWN** になります。つまり:\n\n```sql\nWHERE email = NULL   -- 1行も返さない（比較結果が UNKNOWN のため）\nWHERE email <> NULL  -- これも1行も返さない\n```\n\nNULL 判定には必ず `IS NULL` / `IS NOT NULL` を使います。WHERE は「条件が TRUE の行だけ」を返すため、UNKNOWN は弾かれる——ここが「= NULL が黙って0行を返す」事故の正体です（三値論理: TRUE / FALSE / UNKNOWN）。\n\n実務の関連知識:\n- `NOT IN (SELECT ...)` は、サブクエリの結果に NULL が1つでも混ざると**全滅**します（NOT IN の中で x <> NULL が UNKNOWN になるため）。NOT で反転する条件は要注意です（5章のサブクエリで再登場）。\n- この seed では会員20だけが email なし。UNIQUE 制約が付いていても「NULL は複数許される」ので、未登録会員をこの形で表現できます（2章の設計どおりです）。',
      task: 'email が未登録（NULL）の会員を member_id、name、email の3列で member_id 順に表示してください。',
      hints: ['WHERE email IS NULL です。', '= NULL では1行も返りません。比較ではなく IS NULL を使います。', 'ORDER BY member_id を付けます。'],
      solution: `SELECT member_id, name, email
FROM public.members
WHERE email IS NULL
ORDER BY member_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT member_id, name, email
FROM public.members
WHERE email IS NULL
ORDER BY member_id` },
      mysqlNote: 'MySQL も IS NULL / IS NOT NULL を使う点は同じで、`= NULL` が1行も返らない点も同じです。ただし MySQL には `NULL` 安全な等価演算子 `<=>`（NULL-safe equal）があります: `email <=> NULL` は TRUE を返せます。PostgreSQL にこの演算子はないため IS NULL 一択です。' },
    { id: 'ch04-06', title: 'ORDER BY — 複数キーと NULL の順番', session: 'A',
      story: '督促業務のために、会員1さんの貸出記録を「未返却を先頭に、返却済みは古い順」で並べた一覧が必要です。',
      explanation: '## 並べ替えの構文\n```sql\nSELECT loan_id, returned_on\nFROM public.loans\nWHERE member_id = 1\nORDER BY returned_on NULLS FIRST, loan_id;\n```\n- ORDER BY は**左のキーから順に**効きます。第1キーが同じ行だけが第2キーで比較されます（辞書順と同じ発想）。\n- `ASC`（昇順・既定）/ `DESC`（降順）。\n- **NULL の順番を決めるのが NULLS FIRST / NULLS LAST**。これを書かないと「既定は昇順なら NULLS LAST、降順なら NULLS FIRST」です。この規則は頭に入れておかないと、未返却（NULL）がリストのどこに沈むか分からなくなります。実務では NULL の位置が要件になることが多く、**明示的に書く**のが作法です。\n- 並びが同じ行の順序は保証されません。表示が一意になるよう、最後のキーで必ず決まるよう ID を添えるのが実務の定番です（ページングでも必須。次のステップへ）。',
      task: '会員1さんの貸出（member_id = 1）を、未返却（returned_on が NULL）を先頭に、返却済みは返却日の古い順、同じなら loan_id 順で loan_id、returned_on の2列で表示してください。',
      hints: ['ORDER BY returned_on NULLS FIRST が第1キーです。', '第2キーに loan_id を足します。', 'WHERE member_id = 1 で絞り込みます。'],
      solution: `SELECT loan_id, returned_on
FROM public.loans
WHERE member_id = 1
ORDER BY returned_on NULLS FIRST, loan_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT loan_id, returned_on
FROM public.loans
WHERE member_id = 1
ORDER BY returned_on NULLS FIRST, loan_id` },
      mysqlNote: 'MySQL は ORDER BY ... LIMIT n でソートも LIMIT も同じ構文です。大きく違うのは **NULL の既定の並び**: MySQL では昇順でも NULL が先頭（最小値扱い）、PostgreSQL では昇順で NULL は最後です。MySQL に NULLS FIRST/LAST 構文はないため、`ORDER BY col IS NULL, col` のような式で工夫します（`col IS NULL` は NULL の行で 1 になり後ろに回る、というイディオム）。' },
    { id: 'ch04-07', title: 'LIMIT と OFFSET — ページング', session: 'A',
      story: '新着コーナーの棚札を10件ずつ印刷することになりました。2ページ目を取得してください。',
      explanation: '## LIMIT で行数、OFFSET で読み飛ばし\n```sql\nSELECT book_id, title, price\nFROM public.books\nORDER BY book_id\nLIMIT 10 OFFSET 10;\n```\n- `LIMIT n` は最大 n 行、`OFFSET m` は先頭 m 行を読み飛ばします。OFFSET 10 で「11件目から」、つまり2ページ目です。\n- **ORDER BY なしの LIMIT/OFFSET は禁止**と考えてください。並び順が保証されないので、ページによって行が重複したり抜けたりします。「同じ ORDER BY を全ページで使う」が前提です。\n- 実務の知見: OFFSET が大きくなると、PostgreSQL は読み飛ばす分も全部走査します（100万件の50万ページ目は重い）。深いページングには **keyset（シーク）方式**: `WHERE book_id > 最後に見たID ORDER BY book_id LIMIT 10` を使います。インデックスが効いて速く、ページ漏れも起きません。\n- OFFSET を使うのは「ページ番号を URL に持つ管理画面」など、件数が少なくて済む場面と割り切るのが実務の判断です。',
      task: 'books を book_id 順に並べ、2ページ目（11件目から10件）を book_id、title、price の3列で表示してください。',
      hints: ['LIMIT 10 OFFSET 10 です。', 'ORDER BY book_id が必須です。ないとページの中身が保証されません。', '表示列はステップ01と同じ book_id, title, price です。'],
      solution: `SELECT book_id, title, price
FROM public.books
ORDER BY book_id
LIMIT 10 OFFSET 10;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id, title, price
FROM public.books
ORDER BY book_id
LIMIT 10 OFFSET 10` },
      mysqlNote: 'MySQL は `LIMIT 10 OFFSET 10` も書けますし、省略形 `LIMIT 10, 10`（LIMIT オフセット, 行数）もあります。PostgreSQL はこの省略形が書けない点に注意。深いページングの課題（OFFSET の走査コスト）は MySQL も同じで、keyset 方式の推奨も同じです。' },
    { id: 'ch04-08', title: 'DISTINCT — 重複を1つにまとめる', session: 'A',
      story: '棚卸しの準備です。「蔵書には今、どんな状態のものがあるか」を重複なく一覧にしてください。',
      explanation: '## DISTINCT は重複行を畳む\n```sql\nSELECT DISTINCT status FROM public.copies ORDER BY status;\n```\nDISTINCT を付けると、**選んだ列の組み合わせが同じ行は1行にまとまります**。SELECT DISTINCT が見たら「なぜ重複が生まれる問い合わせなのか」を疑うのが実務の目です:\n- 1対多を JOIN すると、多の側の行数だけ左の行が増える（5章で実際に起きます）\n- 純粋な「値の種類」が欲しいときは DISTINCT が正当な使い方です\n\nPostgreSQL には `DISTINCT ON (列)` という「その列ごとに最初の1行だけ」を返す拡張があります（例: 会員ごとに最も新しい貸出）。「最初」の定義は ORDER BY とセットで決まります。MySQL にはなく、窓関数（5章）で代用します。\n\nCOUNT と組み合わせた `COUNT(DISTINCT col)` は5章で扱います。',
      task: 'copies の status の値を重複なく、status 順に1列で表示してください。',
      hints: ['SELECT の直後に DISTINCT を付けます。', 'ORDER BY status で整列します。', '表示列は status だけです。'],
      solution: `SELECT DISTINCT status
FROM public.copies
ORDER BY status;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT DISTINCT status
FROM public.copies
ORDER BY status` },
      mysqlNote: 'MySQL も SELECT DISTINCT は同じ構文・同じ意味です。PostgreSQL の DISTINCT ON (列) は MySQL にはありません（窓関数 ROW_NUMBER() で代用します）。DISTINCT が「重複の匂い」を教えてくれる点はどちらの文化でも同じです。' },
    { id: 'ch04-09', title: '別名・計算列・CASE 式', session: 'A',
      story: '技術書コーナーの値札を刷新します。税込価格を計算し、価格帯ごとに「格安」「標準」「高額」のラベルを付けた一覧を作ってください。',
      explanation: '## 計算列と別名\n```sql\nSELECT book_id,\n       title,\n       price,\n       price * 1.1 AS price_with_tax,\n       CASE WHEN price < 2000 THEN \'格安\'\n            WHEN price < 4000 THEN \'標準\'\n            ELSE \'高額\' END AS price_class\nFROM public.books\nWHERE category_id = 4\nORDER BY book_id;\n```\n- **式の結果も列として出せる**（計算列）。`price * 1.1` のように列と定数を混ぜられます。金額の numeric は 2進の誤差がないので 1.1倍も安全です（float はこうはいきません）。\n- `AS 別名` で列名を付けます。AS は省略できますが、**計算列には必ず付ける**のが実務の作法です（帳票・アプリは列名で値を取るため、名前がないと取れません）。\n- **CASE 式**: WHEN 条件 THEN 値 ... ELSE 値 END。上から順に判定し、当てはまった時点で終わります（なので `< 4000` だけで「2000〜3999」が表せます）。表示の分類・値の置換・集計条件（5章）に使う、SQL の定番構文です。ELSE を省略すると「どれにも当てはまらない」は NULL になる点にも注意。',
      task: '技術書（category_id = 4）について book_id、title、price、税込価格（price * 1.1、列名 price_with_tax）、価格帯ラベル（未満2000=格安 / 未満4000=標準 / それ以上=高額、列名 price_class）を book_id 順に表示してください。',
      hints: ['price * 1.1 AS price_with_tax です。', "CASE WHEN price < 2000 THEN '格安' WHEN price < 4000 THEN '標準' ELSE '高額' END AS price_class です。", 'WHERE category_id = 4 で絞り、ORDER BY book_id です。'],
      solution: `SELECT book_id,
       title,
       price,
       price * 1.1 AS price_with_tax,
       CASE WHEN price < 2000 THEN '格安'
            WHEN price < 4000 THEN '標準'
            ELSE '高額' END AS price_class
FROM public.books
WHERE category_id = 4
ORDER BY book_id;`,
      replay: '',
      check: { type: 'result-equals', ordered: true, expectedSql: `SELECT book_id,
       title,
       price,
       price * 1.1 AS price_with_tax,
       CASE WHEN price < 2000 THEN '格安'
            WHEN price < 4000 THEN '標準'
            ELSE '高額' END AS price_class
FROM public.books
WHERE category_id = 4
ORDER BY book_id` },
      mysqlNote: '計算列・AS 別名・CASE 式は MySQL もほぼ同じ構文です。違いが出るのは金額: MySQL の DECIMAL * 1.1 も正確ですが、FLOAT/DOUBLE は両方で誤差が出ます（金額は DECIMAL/numeric 一択、は共通の鉄則）。なお MySQL 8.0.19 以降は VALUES() 関数廃止の流れなど、句の名前空間に細かい差がありますが、SELECT の別名周りは変わりません。' },
  ],
}
export default chapter
