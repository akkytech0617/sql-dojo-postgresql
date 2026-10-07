import { isBigMisestimate, maxNodeTime, misestimateFactor, nodeGloss, nodeTimeTotal, type ExplainNode } from './ExplainPlan'

const formatRows = (value: number): string => value.toLocaleString('ja-JP')
const formatTime = (value: number): string => `${value.toFixed(3)}ms`

interface DetailRow { key: string; value: string; emphasis?: boolean }

const detailKeys: { field: keyof ExplainNode; label: string; emphasis?: boolean }[] = [
  { field: 'Index Cond', label: '索引条件', emphasis: true },
  { field: 'Recheck Cond', label: '再検査条件' },
  { field: 'Filter', label: 'フィルタ', emphasis: true },
  { field: 'Rows Removed by Filter', label: 'フィルタで捨てた行' },
  { field: 'Rows Removed by Index Recheck', label: '再検査で捨てた行' },
  { field: 'Hash Cond', label: 'ハッシュ条件' },
  { field: 'Join Filter', label: '結合フィルタ' },
  { field: 'Heap Fetches', label: '表の実読み取り（Heap Fetches）' },
]

function relationLabel(node: ExplainNode): string {
  const relation = node['Relation Name']
  if (!relation) return ''
  const schema = node.Schema && node.Schema !== 'public' ? `${node.Schema}.` : ''
  const alias = node.Alias && node.Alias !== relation ? `（別名 ${node.Alias}）` : ''
  return `on ${schema}${relation}${alias}`
}

function costLabel(node: ExplainNode): string | null {
  const startup = node['Startup Cost'], total = node['Total Cost']
  if (startup === undefined || total === undefined) return null
  return `cost ${startup.toFixed(2)}..${total.toFixed(2)}`
}

function sortKeyLabel(node: ExplainNode): string | null {
  const key = node['Sort Key']
  if (!key) return null
  const text = Array.isArray(key) ? key.join(', ') : key
  const method = node['Sort Method'] ? `（${node['Sort Method']}${node['Sort Space Used'] !== undefined ? `・${node['Sort Space Used'].toLocaleString('ja-JP')}${node['Sort Space Type'] === 'Disk' ? 'バイト（ディスク）' : ''}` : ''}）` : ''
  return `ソートキー ${text}${method}`
}

function blockDetail(node: ExplainNode): string | null {
  const hit = node['Shared Hit Blocks'], read = node['Shared Read Blocks']
  if (hit === undefined && read === undefined) return null
  const parts: string[] = []
  if (hit !== undefined) parts.push(`共有バッファ ヒット ${hit.toLocaleString('ja-JP')}`)
  if (read !== undefined) parts.push(`ディスク読み取り ${read.toLocaleString('ja-JP')}`)
  return parts.join('・')
}

function details(node: ExplainNode): DetailRow[] {
  const rows: DetailRow[] = []
  for (const { field, label, emphasis } of detailKeys) {
    const value = node[field]
    if (value === undefined || value === null || value === '') continue
    const display = typeof value === 'number' ? value.toLocaleString('ja-JP') : String(value)
    rows.push({ key: String(field), value: `${label}: ${display}`, emphasis })
  }
  const sort = sortKeyLabel(node)
  if (sort) rows.push({ key: 'Sort Key', value: sort })
  if (node['Group Key']) rows.push({ key: 'Group Key', value: `グループキー ${node['Group Key'].join(', ')}` })
  if (node['Join Type'] && node['Join Type'] !== 'Inner') rows.push({ key: 'Join Type', value: `結合方式 ${node['Join Type']}` })
  if (node.Strategy) rows.push({ key: 'Strategy', value: `方式 ${node.Strategy}` })
  const blocks = blockDetail(node)
  if (blocks) rows.push({ key: 'Blocks', value: blocks })
  return rows
}

function NodeLine({ node, timeScale }: { node: ExplainNode; timeScale: number }) {
  const gloss = nodeGloss[node['Node Type']] ?? ''
  const relation = relationLabel(node)
  const index = node['Index Name'] ? `using ${node['Index Name']}` : ''
  const cost = costLabel(node)
  const planned = node['Plan Rows']
  const actual = node['Actual Rows']
  const loops = node['Actual Loops']
  const analyzed = node['Actual Total Time'] !== undefined
  const total = nodeTimeTotal(node)
  const barPercent = timeScale > 0 ? Math.max(1, Math.min(100, (total / timeScale) * 100)) : 0
  const misestimate = misestimateFactor(node)
  const flagged = isBigMisestimate(node)
  return <div className="plan-node">
    <div className="plan-node-head">
      <strong>{node['Node Type']}</strong>
      {gloss && <span className="plan-gloss">{gloss}</span>}
      {relation && <code>{relation}</code>}
      {index && <code className="plan-index">{index}</code>}
    </div>
    <div className="plan-node-metrics">
      {cost && <span className="plan-metric">{cost}</span>}
      {planned !== undefined && <span className="plan-metric">見積行数 {formatRows(planned)}行</span>}
      {analyzed && <>
        <span className={`plan-metric${flagged ? ' plan-metric-warn' : ''}`}>実測 {formatRows(actual ?? 0)}行（loops {formatRows(loops ?? 1)}）</span>
        {misestimate !== null && Math.abs(misestimate) !== 1 && <span className={`plan-estimate${flagged ? ' plan-estimate-bad' : ''}`}>
          {flagged ? '⚠ 見積もりと大きくズレています（統計情報を疑うサイン）' : `（見積もりとの比 約${misestimate.toFixed(1)}倍）`}
        </span>}
      </>}
      {analyzed && <span className="plan-time">
        <span className="plan-time-label">実測 {formatTime(node['Actual Total Time'] ?? 0)}</span>
        <span className="plan-time-bar" aria-hidden="true"><span className="plan-time-fill" style={{ width: `${barPercent}%` }} /></span>
      </span>}
    </div>
    {details(node).map(row => (
      <div key={row.key} className={`plan-detail${row.emphasis ? ' plan-detail-emphasis' : ''}`}>{row.value}</div>
    ))}
  </div>
}

function PlanBranch({ node, timeScale }: { node: ExplainNode; timeScale: number }) {
  const children = node.Plans ?? []
  return <li className="plan-branch">
    <NodeLine node={node} timeScale={timeScale} />
    {children.length > 0 && <ul className="plan-children">{children.map((child, index) =>
      <PlanBranch key={`${child['Node Type']}-${index}`} node={child} timeScale={timeScale} />)}</ul>}
  </li>
}

/** Renders an EXPLAIN (FORMAT JSON) plan as an indented tree; children (executed first) are nested below each node. */
export function PlanTree({ root }: { root: ExplainNode }) {
  const timeScale = maxNodeTime(root)
  return <ul className="plan-tree"><PlanBranch node={root} timeScale={timeScale} /></ul>
}
