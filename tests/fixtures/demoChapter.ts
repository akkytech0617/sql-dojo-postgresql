import type { Chapter } from '../../src/shared/lessons.js'
const demoChapter: Chapter = {
  id: 1, title: 'エンジン用の小さな教材', summary: 'DB作成・状態検査・結果比較を実DBで確認。',
  steps: [
    { id: 'ch01-01', title: 'データベースを作る', explanation: 'fixture', task: '', hints: [],
      session: 'A', database: 'postgres', solution: "CREATE DATABASE library WITH ENCODING 'UTF8' LOCALE 'C' TEMPLATE template0",
      check: { type: 'sql', sql: "SELECT EXISTS(SELECT FROM pg_database WHERE datname='library')" } },
    { id: 'ch01-02', title: '小さいテーブルを作る', explanation: 'fixture', task: '', hints: [],
      session: 'A', database: 'library', connect: { A: { user: 'admin', password: '', database: 'library' } },
      solution: "CREATE TABLE public.demo (id integer PRIMARY KEY, title text NOT NULL); INSERT INTO public.demo VALUES (1,'図書館');",
      check: { type: 'sql', sql: 'SELECT count(*)=1 FROM public.demo' } },
    { id: 'ch01-03', title: '結果を比較する', explanation: 'fixture', task: '', hints: [],
      session: 'A', database: 'library', solution: 'SELECT id,title FROM public.demo ORDER BY id', replay: '',
      check: { type: 'result-equals', expectedSql: 'SELECT id,title FROM public.demo ORDER BY id', ordered: true } },
  ],
}
export default demoChapter
