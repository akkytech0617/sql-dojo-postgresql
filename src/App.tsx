import { useState } from 'react'
import { pageRegistry } from './app/pageRegistry'
export default function App() {
  const [activeId, setActiveId] = useState(pageRegistry[0].id)
  const active = pageRegistry.find(page => page.id === activeId) ?? pageRegistry[0]
  const Page = active.component
  return <div className="app-shell"><header className="topbar"><a className="brand" href="/" aria-label="SQL道場 ホーム"><span className="brand-mark" aria-hidden="true">道</span><span>SQL<span className="brand-jp">道場</span></span></a><nav aria-label="メインナビゲーション">{pageRegistry.map(page => <button key={page.id} aria-current={page.id === activeId ? 'page' : undefined} className={page.id === activeId ? 'nav-active' : ''} onClick={() => setActiveId(page.id)}>{page.label}</button>)}</nav><span className="local-badge"><span className="status-dot online" />ローカル環境</span></header><Page key={active.id} /></div>
}
