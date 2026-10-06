import { useState } from 'react'
import { panelRegistry } from '../app/panelRegistry'
import type { Step } from '../shared/lessons'
export function PanelDock({ step }: { step?: Step }) {
  const panels = panelRegistry.filter(panel => !panel.showOn || panel.showOn(step))
  const [id, setId] = useState('')
  const active = panels.find(panel => panel.id === id) ?? panels[0]
  if (!active) return <section className="panel dock-placeholder"><h2>図書館のツール</h2><p className="muted">スキーマ・実行計画・ロックの確認パネルをここに追加できます。</p></section>
  const Component = active.component
  return <section className="panel panel-dock"><div className="dock-tabs" role="tablist" aria-label="補助ツール">{panels.map(panel => <button key={panel.id} role="tab" aria-selected={active.id === panel.id} onClick={() => setId(panel.id)}>{panel.label}</button>)}</div><div role="tabpanel" aria-label={active.label}><Component step={step} /></div></section>
}
