import type { SqlNotice } from '../shared/types'
export function NoticeList({ notices }: { notices: SqlNotice[] }) {
  if (!notices.length) return null
  return <section className="notice-panel" aria-label="データベースからの通知"><h2>通知</h2><ul>{notices.map((notice, index) => <li key={index}><code>{notice.severity}</code> {notice.message}</li>)}</ul></section>
}
