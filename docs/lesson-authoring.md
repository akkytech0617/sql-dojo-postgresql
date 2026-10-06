# 教材担当者向け

先に `docs/schema-contract.md` と共通型 `src/shared/lessons.ts` を読んでください。

## ファイル所有権

- W2: engine/共通型/registry/tests/共通data（schema.sql,seed.sql,authors.csv,reservations.sql）、ch00。
- W3: ch01..ch06、必要な追加data（ファイル名にw3_）。
- W4: ch07..ch09、追加data（w4_）。
- W5: ch10..ch12、追加data（w5_）。
- 各章ファイルだけを変更。indexやregistryへの編集不要。
  新UIは `src/panels/*.tsx` に named export `panel: PanelDefinition`、
  新ページは `src/pages/*.tsx` に named export `page: PageDefinition`。
  globで自動登録、orderでソート（小さい順）。componentsは担当area配下。
  追加dataの自動includeは許可しないため、通常のSQLをchapterに直接書く。

## 書き方

Chapterをdefault export、stepsに共通型Stepを追加。全て日本語、mysqlNoteも各stepに付ける。
通常 `database:'library', session:'A'`、接続変更は
`connect:{A:{user:'admin',password:'',database:'library'}}`。
初回ステップは必要な接続を明示。ABは両方明示。
トランザクションの続きのstepにconnect指定しない。

check sql は solution前にfalse、後にtrueになるcatalog/行数の検査。
SELECT体験はresult-equals、制約違反はerror-code、説明はmanual。
sql採点がテーブル不存在で失敗してもそれは不合格として扱う。
expectedSqlは副作用のない非空SELECT、列名もsolutionと同じ、LIMITは1000以下。
例: `{type:'result-equals',expectedSql:'SELECT title FROM public.books ORDER BY book_id LIMIT 5',ordered:true}`。

AB scriptはactionごとsession/sql/expectを指定。expect:'blocks'は問い合わせが未完了のまま次へ。
別sessionのCOMMIT/ROLLBACK等で解放し、ブロック問い合わせも最終成功させる。
ABとerror-codeはreplay必須。実験がROLLBACKで完結ならreplay:''。
DDL変更はsolutionと同じ永続状態にするreplayを書く。再生はstepごと独立接続なのでSETを跨がない。
CREATE DATABASEはpostgresで独立文。psqlメタコマンドはエディター不可。
canonical seed は `solution:'-- @include seed.sql'`、CSV は `solution:'-- @csv authors.csv'`。

## 独立DBと検証

```sh
PGPORT=5434 docker compose -p sql-dojo-w3 up -d --wait
PGPORT=5434 LESSON_CHAPTERS=0-6 pnpm test:lessons
# W4: 5435 / sql-dojo-w4 / LESSON_CHAPTERS=7-9
# W5: 5436 / sql-dojo-w5 / LESSON_CHAPTERS=10-12
pnpm typecheck
pnpm lint
```

範囲開始前の章をreplayして状態を準備。範囲の解答を順に実行し各stepを採点、
各章末のschema/column/constraint/index/view/function/trigger/role/ACL/RLS fingerprintと
resetで再生した同じ章末を比較。データそのものの同値は各章の検査も書く。
先行章がまだstubなら後続章テストは動かない（完成後に再実行）。

### 先行章が未完成のとき: LESSON_BOOTSTRAP（一時的な補助）

`LESSON_BOOTSTRAP=<.sqlのパス>` を指定すると、範囲開始前の章を再生した直後に、
その SQL を管理者で `library` に実行します（既存の tokenizer で文を分割）。
実装上は「範囲開始の直前の章」の末尾に replay 専用ステップ（`chNN-99`）を差し込むため、
解答実行側と replay fingerprint 側の両方に同じ位置で適用され、比較は有効なままです。
範囲は ch2 以降から始める必要があります（`library` が必要）。

```sh
# W5: ch7–9 が stub のワークツリーで ch10–12 を検証
PGPORT=5436 LESSON_CHAPTERS=10-12 LESSON_BOOTSTRAP=tests/fixtures/bootstrap-ch07-09.sql pnpm test:lessons
```

`tests/fixtures/bootstrap-ch07-09.sql` は契約どおりの ch7 オブジェクト（view/MV/関数/トリガー/
プロシージャ）と ch8 の `loan_history` 100万行＋4索引＋ANALYZE を、ch3 終了状態の上に作ります。
**ch7–9 が未執筆の間だけ有効な一時的な補助**です。本物の ch7–9 が揃ったら指定せずに実行してください
（両方を同時に使うと重複作成になります。定義本文も本物の章と一致する保証はありません）。
bootstrap 自体の検証（重い・破壊的なので既定では skip）:
`BOOTSTRAP_SELFTEST=1 PGPORT=<自分のポート> pnpm vitest run tests/bootstrap.test.ts`。
test:lessonsはfixtureも実行し、終了時DBは最後のテストの状態（全リセットされる場合もある）。
pnpm testは全テスト、ファイル並列なし。ローカルDBは破壊的にリセットされる。

通常テストは管理者solution、connectでlesson roleにも実際にTCP接続。
seedの値を変えない。lib_以外のroleは作らない。実験DBは同stepで削除。
コミットはオーケストレーター担当です。
