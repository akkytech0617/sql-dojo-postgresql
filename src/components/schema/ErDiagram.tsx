import { useEffect, useId, useState } from 'react'
import type { SchemaTable } from '../../shared/schema'
import { buildErDiagram } from './erBuilder.js'
export function ErDiagram({ schema, tables }: { schema: string; tables: SchemaTable[] }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(true)
  const reactId = useId().replaceAll(':', '-')
  const diagram = buildErDiagram(schema, tables)
  useEffect(() => {
    let cancelled = false
    setPending(true)
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict', fontFamily: '"SFMono-Regular", Consolas, monospace' })
        const rendered = await mermaid.render(`er-${reactId}`, diagram)
        if (!cancelled) { setSvg(rendered.svg); setError('') }
      } catch (renderError) {
        if (!cancelled) setError(`ER図の描画に失敗しました: ${String(renderError instanceof Error ? renderError.message : renderError)}`)
      } finally { if (!cancelled) setPending(false) }
    })()
    return () => { cancelled = true }
  }, [diagram, reactId])
  if (!tables.some(table => table.kind === 'table' || table.kind === 'partitioned'))
    return <p className="schema-status">ER図に含める表がこのスキーマにはありません。</p>
  if (error) return <p className="schema-error">{error}</p>
  if (pending && !svg) return <p className="schema-status">ER図を描画しています…（mermaid を読み込み中）</p>
  return <div className="er-diagram" role="img" aria-label={`${schema} スキーマの ER 図`} dangerouslySetInnerHTML={{ __html: svg }} />
}
