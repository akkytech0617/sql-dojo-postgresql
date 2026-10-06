import { useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { EditorView, keymap } from '@codemirror/view'
interface Props { value: string; onChange: (sql: string) => void; onRun: (sql: string) => void; busy: boolean }
export function SqlEditor({ value, onChange, onRun, busy }: Props) {
  const view = useRef<EditorView | null>(null)
  const extensions = useMemo(() => [
    sql({ dialect: PostgreSQL }),
    EditorView.contentAttributes.of({ 'aria-label': 'SQL エディター' }),
    keymap.of([{ key: 'Mod-Enter', run: editor => {
      if (!busy) {
        const { from, to } = editor.state.selection.main
        onRun(from === to ? editor.state.doc.toString() : editor.state.sliceDoc(from, to))
      }
      return true
    } }]),
    EditorView.theme({ '&': { backgroundColor: '#171b22', fontSize: '14px' }, '.cm-gutters': { backgroundColor: '#171b22', borderRight: '1px solid #2a303a' }, '.cm-content': { padding: '20px 0', fontFamily: '"SFMono-Regular", Consolas, monospace', lineHeight: '1.9' }, '.cm-line': { padding: '0 20px' }, '&.cm-focused': { outline: 'none' } }),
  ], [onRun, busy])
  function run() {
    const editor = view.current
    if (!editor) return onRun(value)
    const { from, to } = editor.state.selection.main
    onRun(from === to ? editor.state.doc.toString() : editor.state.sliceDoc(from, to))
  }
  return <section className="panel editor-panel" aria-labelledby="editor-title">
    <div className="panel-heading"><h2 id="editor-title">SQL エディター</h2><span className="muted small">PostgreSQL 18</span></div>
    <CodeMirror value={value} onChange={onChange} extensions={extensions} theme="dark" height="300px" onCreateEditor={editor => { view.current = editor }} basicSetup={{ foldGutter: false }} />
    <div className="editor-footer"><span className="muted small">選択した範囲のみ実行できます <kbd>⌘ / Ctrl + Enter</kbd></span><button className="primary" onClick={run} disabled={busy || !value.trim()}>{busy ? '実行中…' : 'SQL を実行 →'}</button></div>
  </section>
}
