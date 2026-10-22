import { useMemo, useState } from 'react'
import { useDeployment, type Matchable } from '../App'

interface SophosEndpoint {
  id: string
  hostname: string | null
  online: boolean | null
  last_seen_at: string | null
  last_user: string | null
  encryption_status: string | null
  health_status: string | null
  threats_status: string | null
  services_status: string | null
  protected: boolean
}

interface SophosEndpointList extends Matchable {
  tenant_id: string | null
  tenant_name: string | null
  endpoints: SophosEndpoint[]
}

type Filter = 'all' | 'active' | 'inactive_weeks' | 'inactive_months' | 'not_protected'
type SortKey = 'name' | 'online' | 'encryption' | 'health'

const DAY_MS = 24 * 60 * 60 * 1000
// Same buckets as the Sophos Central computers report: seen within 2 weeks, 2 weeks to
// 2 months, or longer ago than that.
const ACTIVE_WITHIN_MS = 14 * DAY_MS
const INACTIVE_WEEKS_WITHIN_MS = 60 * DAY_MS

const TILES: { key: Filter; label: string; tone: string }[] = [
  { key: 'all', label: 'All', tone: 'all' },
  { key: 'active', label: 'Active', tone: 'active' },
  { key: 'inactive_weeks', label: 'Inactive 2+ Weeks', tone: 'inactive' },
  { key: 'inactive_months', label: 'Inactive 2+ Months', tone: 'inactive' },
  { key: 'not_protected', label: 'Not Protected', tone: 'warn' },
]

function ageMs(iso: string | null, now: number): number {
  const time = iso ? Date.parse(iso) : NaN
  return Number.isNaN(time) ? Infinity : now - time
}

function matchesFilter(endpoint: SophosEndpoint, filter: Filter, now: number): boolean {
  const age = ageMs(endpoint.last_seen_at, now)
  switch (filter) {
    case 'all':
      return true
    case 'active':
      return age < ACTIVE_WITHIN_MS
    case 'inactive_weeks':
      return age >= ACTIVE_WITHIN_MS && age < INACTIVE_WEEKS_WITHIN_MS
    case 'inactive_months':
      return age >= INACTIVE_WEEKS_WITHIN_MS
    case 'not_protected':
      return !endpoint.protected
  }
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * DAY_MS],
  ['month', 30 * DAY_MS],
  ['day', DAY_MS],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
]
const relativeFormat = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function timeAgo(iso: string | null, now: number): string {
  const age = ageMs(iso, now)
  if (age === Infinity) return '—'
  for (const [unit, size] of RELATIVE_UNITS) {
    if (age >= size) return relativeFormat.format(-Math.floor(age / size), unit)
  }
  return 'just now'
}

function encryptionLabel(status: string | null): string {
  if (status === 'encrypted') return 'Encrypted'
  if (!status || status === 'unmanaged' || status === 'unknown') return 'Not available'
  return 'Not encrypted'
}

// Capitalized Sophos status for display; unknown values pass through, missing ones show a dash.
function statusText(status: string | null): string {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'
}

type HealthLevel = 'good' | 'warning' | 'bad'

const HEALTH_DISPLAY: Record<HealthLevel, { symbol: string; label: string; className: string }> = {
  good: { symbol: '✔', label: 'Good', className: 'ov-health-good' },
  warning: { symbol: '▲', label: 'Warning', className: 'ov-health-warning' },
  bad: { symbol: '✖', label: 'Bad', className: 'ov-health-bad' },
}

const HEALTH_RANK: Record<HealthLevel, number> = { bad: 0, warning: 1, good: 2 }

// The API's health.overall stays "good" for computers that Sophos Central shows with a warning,
// because Central's Health column also counts device encryption. Mirror that here: anything
// other than "Encrypted" is a warning, and the reasons are listed in the cell's tooltip.
function healthOf(endpoint: SophosEndpoint): { level: HealthLevel; reasons: string[] } {
  const reasons: string[] = []
  let level: HealthLevel = 'good'

  const { health_status, threats_status, services_status } = endpoint
  if (health_status === 'bad') {
    level = 'bad'
    reasons.push('Sophos health: Bad')
  } else if (health_status && health_status !== 'good') {
    level = 'warning'
    reasons.push(`Sophos health: ${statusText(health_status)}`)
  }
  if (threats_status && threats_status !== 'good') {
    reasons.push(`Threats: ${statusText(threats_status)}`)
  }
  if (services_status && services_status !== 'good') {
    reasons.push(`Services: ${statusText(services_status)}`)
  }
  if (endpoint.encryption_status !== 'encrypted') {
    if (level === 'good') level = 'warning'
    reasons.push(`Device encryption: ${encryptionLabel(endpoint.encryption_status)}`)
  }

  return { level, reasons }
}

function sortValue(endpoint: SophosEndpoint, key: SortKey, now: number): string | number {
  switch (key) {
    case 'name':
      return (endpoint.hostname ?? '').toLowerCase()
    case 'online':
      return ageMs(endpoint.last_seen_at, now)
    case 'encryption':
      return encryptionLabel(endpoint.encryption_status)
    case 'health':
      return HEALTH_RANK[healthOf(endpoint).level]
  }
}

export default function SophosEndpoints({ customerName }: { customerName: string }) {
  const { data, error, loading, check } = useDeployment<SophosEndpointList>(
    `/api/sophos/endpoints?customer_name=${encodeURIComponent(customerName)}`,
  )
  const [now] = useState(() => Date.now())
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
    key: 'name',
    descending: false,
  })

  const endpoints = useMemo(() => data?.endpoints ?? [], [data])

  const counts = useMemo(() => {
    const result = {} as Record<Filter, number>
    for (const tile of TILES) {
      result[tile.key] = endpoints.filter((e) => matchesFilter(e, tile.key, now)).length
    }
    return result
  }, [endpoints, now])

  const rows = useMemo(() => {
    const filtered = endpoints.filter((e) => matchesFilter(e, filter, now))
    const direction = sort.descending ? -1 : 1
    return filtered.sort((a, b) => {
      const left = sortValue(a, sort.key, now)
      const right = sortValue(b, sort.key, now)
      if (left < right) return -direction
      if (left > right) return direction
      return 0
    })
  }, [endpoints, filter, sort, now])

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, descending: !prev.descending } : { key, descending: false },
    )
  }

  function header(key: SortKey, label: string) {
    const active = sort.key === key
    return (
      <th aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
        <button className="ov-sort" onClick={() => toggleSort(key)}>
          {label}
          <span className="ov-sort-arrow">{active ? (sort.descending ? '▼' : '▲') : '↕'}</span>
        </button>
      </th>
    )
  }

  return (
    <section className="ov-service">
      <div className="ov-service-header">
        <h2>Computers</h2>
        <button className="ov-button" onClick={check} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && <p className="ov-error">API error: {error}</p>}
      {!error && !data && <p className="ov-muted">Loading computers...</p>}

      {data?.matched && (
        <>
          <div className="ov-tiles">
            {TILES.map((tile) => (
              <button
                key={tile.key}
                className={`ov-tile ov-tile-${tile.tone}${filter === tile.key ? ' active' : ''}`}
                onClick={() => setFilter(tile.key)}
              >
                <span className="ov-tile-count">{counts[tile.key]}</span>
                <span className="ov-tile-label">{tile.label}</span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <p className="ov-muted">No computers match this filter.</p>
          ) : (
            <div className="ov-table-wrap">
              <table className="ov-table">
                <thead>
                  <tr>
                    {header('name', 'Name')}
                    {header('online', 'Online')}
                    <th>Last user</th>
                    {header('encryption', 'Device Encryption')}
                    {header('health', 'Health status')}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => {
                    const { level, reasons } = healthOf(e)
                    const health = HEALTH_DISPLAY[level]
                    return (
                      <tr key={e.id}>
                        <td className="ov-table-name">{e.hostname ?? '—'}</td>
                        <td title={e.last_seen_at ?? undefined}>
                          {e.online ? 'Online now' : timeAgo(e.last_seen_at, now)}
                        </td>
                        <td>{e.last_user ?? '—'}</td>
                        <td>{encryptionLabel(e.encryption_status)}</td>
                        <td>
                          <span
                            className={health.className}
                            title={reasons.length > 0 ? reasons.join('\n') : 'No issues reported'}
                          >
                            {health.symbol} {health.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
