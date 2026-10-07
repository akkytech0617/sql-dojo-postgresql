import type { Chapter } from '../src/shared/lessons.js'
const chapter: Chapter = {
  id: 0, title: 'はじめに', summary: '市立図書館の仕事を題材に、RDB と SQL の入口を学びます。',
  steps: [
    { id: 'ch00-01', title: '図書館の情報を表でつなぐ', database: 'postgres', session: 'A',
      story: '市立図書館の司書になりました。本・会員・貸出を安全に管理する仕組みを作りましょう。',
      explanation: '## リレーショナルデータベースとは\n情報を **表（テーブル）** の行と列で管理し、キーで表を関連付けます。\n\n本のタイトルと、棚にある一冊（蔵書）は別の情報です。重複を減らし、矛盾を防ぐ設計を学びます。',
      task: '左でステップを選び、右の SQL エディターで実行します。採点後に次へ進みましょう。自由練習も使えます。',
      hints: [], solution: '', replay: '', check: { type: 'manual' },
      mysqlNote: 'MySQL も RDB です。SQL の考え方は共通ですが、型や構文、権限には違いがあります。' },
    { id: 'ch00-02', title: '最初の SELECT', database: 'postgres', session: 'A',
      explanation: '`SELECT` は値やテーブルの行を取り出します。テーブルなしでも計算できます。\n\n```sql\nSELECT 1 AS answer;\n```',
      task: '数値 `1` を `answer` という列名で表示してください。⌘ / Ctrl + Enter でも実行できます。',
      hints: ['SELECT の後ろに値を書きます。', 'AS answer で列名を指定します。'],
      solution: 'SELECT 1 AS answer;', replay: '',
      check: { type: 'result-equals', expectedSql: 'SELECT 1 AS answer' },
      mysqlNote: '`SELECT 1 AS answer` は MySQL でも同じです。' },
    { id: 'ch00-03', title: 'PostgreSQL のバージョンを見る', database: 'postgres', session: 'A',
      explanation: '`version()` は現在使っている PostgreSQL の情報を返す関数です。接続先も確認する習慣を付けましょう。',
      task: '`version()` の結果を `version` 列として表示してください。',
      hints: ['関数にも SELECT を使えます。'], solution: 'SELECT version() AS version;', replay: '',
      check: { type: 'result-equals', expectedSql: 'SELECT version() AS version' },
      mysqlNote: 'MySQL では `SELECT VERSION();`。同名の関数ですが、表示される製品とバージョンは異なります。' },
  ],
}
export default chapter
