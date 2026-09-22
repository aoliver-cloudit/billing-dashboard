import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

interface Customer {
  id: number
  identifier: string
  name: string
  status: string | null
  types: string[]
  market: string | null
  website: string | null
}

const MAX_SUGGESTIONS = 20

interface Matchable {
  matched: boolean
}

interface DeploymentResult<T> {
  data: T | null
  error: string | null
}

async function describeHttpError(res: Response): Promise<string> {
  let detail = ''
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') detail = body.detail
  } catch {
    // response body wasn't JSON (or was empty) - fall back to just the status
  }
  const clean = detail
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const snippet = clean.length > 140 ? `${clean.slice(0, 140)}…` : clean
  return snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`
}

function useDeployment<T extends Matchable>(
  url: string,
  onResult?: (result: DeploymentResult<T>) => void,
) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function check() {
    setLoading(true)
    setError(null)
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(await describeHttpError(res))
        return (await res.json()) as T
      })
      .then((json) => {
        setData(json)
        onResult?.({ data: json, error: null })
      })
      .catch((err: Error) => {
        setData(null)
        setError(err.message)
        onResult?.({ data: null, error: err.message })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return { data, error, loading, check }
}

function IntegrationSection<T extends Matchable>({
  name,
  url,
  onResult,
  notFoundText,
  renderStats,
}: {
  name: string
  url: string
  onResult?: (result: DeploymentResult<T>) => void
  notFoundText: string
  renderStats: (data: T) => React.ReactNode
}) {
  const { data, error, loading, check } = useDeployment<T>(url, onResult)

  return (
    <div className="integration">
      <div className="integration-header">
        <span className="integration-name">{name}</span>
        <button onClick={check} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error ? (
        <p className="api-error">API error: {error}</p>
      ) : data ? (
        data.matched ? (
          renderStats(data)
        ) : (
          <p className="not-found">{notFoundText}</p>
        )
      ) : null}
    </div>
  )
}

interface BlackpointDeployment extends Matchable {
  tenant_id: string | null
  tenant_name: string | null
  endpoint_mdr_count: number | null
  cloud_identity_mdr_count: number | null
}

interface NinjaDeployment extends Matchable {
  organization_id: number | null
  organization_name: string | null
  device_count: number | null
}

interface CloudRadialDeployment extends Matchable {
  company_id: number | null
  company_name: string | null
  device_count: number | null
}

interface SophosDeployment extends Matchable {
  tenant_id: string | null
  tenant_name: string | null
  device_count: number | null
  encrypted_count: number | null
}

interface ConnectSecureDeployment extends Matchable {
  company_id: number | null
  company_name: string | null
  device_count: number | null
}

interface Addition {
  id: number
  agreement_id: number
  agreement_name: string | null
  product_id: number | null
  product_identifier: string | null
  description: string | null
  quantity: number
}

interface AdditionSyncResult {
  addition_id: number
  success: boolean
  error: string | null
}

interface ToolOption {
  key: string
  label: string
  count: number | null
}

async function fetchJsonOrNull<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function SyncModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [additions, setAdditions] = useState<Addition[]>([])
  const [toolOptions, setToolOptions] = useState<ToolOption[]>([])
  const [mapping, setMapping] = useState<Record<number, string>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncResults, setSyncResults] = useState<Record<number, AdditionSyncResult> | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)

    const encodedName = encodeURIComponent(customer.name)

    Promise.all([
      fetch(`/api/connectwise/additions?company_id=${customer.id}`).then(async (res) => {
        if (!res.ok) throw new Error(await describeHttpError(res))
        return (await res.json()) as Addition[]
      }),
      fetchJsonOrNull<BlackpointDeployment>(
        `/api/blackpoint/deployment?customer_name=${encodedName}`,
      ),
      fetchJsonOrNull<NinjaDeployment>(`/api/ninja/deployment?customer_name=${encodedName}`),
      fetchJsonOrNull<CloudRadialDeployment>(
        `/api/cloudradial/deployment?customer_name=${encodedName}`,
      ),
      fetchJsonOrNull<SophosDeployment>(`/api/sophos/deployment?customer_name=${encodedName}`),
      fetchJsonOrNull<ConnectSecureDeployment>(
        `/api/connectsecure/deployment?customer_name=${encodedName}`,
      ),
    ])
      .then(([additionsData, bp, ninja, cr, sophos, cs]) => {
        if (cancelled) return
        setAdditions(additionsData)
        setToolOptions([
          {
            key: 'bp_endpoint',
            label: 'Blackpoint Endpoint MDR',
            count: bp?.matched ? bp.endpoint_mdr_count : null,
          },
          {
            key: 'bp_cloud',
            label: 'Blackpoint Cloud & Identity MDR',
            count: bp?.matched ? bp.cloud_identity_mdr_count : null,
          },
          { key: 'ninja', label: 'NinjaRMM', count: ninja?.matched ? ninja.device_count : null },
          {
            key: 'cloudradial',
            label: 'CloudRadial',
            count: cr?.matched ? cr.device_count : null,
          },
          {
            key: 'sophos',
            label: 'Sophos Endpoint',
            count: sophos?.matched ? sophos.device_count : null,
          },
          {
            key: 'sophos_encryption',
            label: 'Sophos Disk Encryption',
            count: sophos?.matched ? sophos.encrypted_count : null,
          },
          {
            key: 'connectsecure',
            label: 'ConnectSecure',
            count: cs?.matched ? cs.device_count : null,
          },
        ])
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [customer.id, customer.name])

  function toolCount(key: string): number | null {
    const tool = toolOptions.find((t) => t.key === key)
    return tool ? tool.count : null
  }

  function handleSync() {
    const updates = additions
      .map((a) => {
        const key = mapping[a.id]
        if (!key) return null
        const count = toolCount(key)
        if (count === null || count === a.quantity) return null
        return { agreement_id: a.agreement_id, addition_id: a.id, quantity: count }
      })
      .filter(
        (u): u is { agreement_id: number; addition_id: number; quantity: number } => u !== null,
      )

    if (updates.length === 0) {
      onClose()
      return
    }

    setSyncing(true)
    setSyncError(null)
    fetch('/api/connectwise/additions/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await describeHttpError(res))
        return (await res.json()) as AdditionSyncResult[]
      })
      .then((results) => {
        const byId: Record<number, AdditionSyncResult> = {}
        results.forEach((r) => {
          byId[r.addition_id] = r
        })
        setSyncResults(byId)
      })
      .catch((err: Error) => setSyncError(err.message))
      .finally(() => setSyncing(false))
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h2>Sync with ConnectWise — {customer.name}</h2>

        {loading && <p>Loading agreement additions...</p>}
        {loadError && <p className="api-error">{loadError}</p>}

        {!loading && !loadError && (
          <>
            {additions.length === 0 ? (
              <p className="not-found">No active agreement additions found for this customer.</p>
            ) : (
              <div className="sync-table-wrap">
                <table className="sync-table">
                  <thead>
                    <tr>
                      <th>Addition (Product ID)</th>
                      <th>Current Qty</th>
                      <th>Map to Tool</th>
                      <th>New Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {additions.map((a) => {
                      const selectedKey = mapping[a.id] ?? ''
                      const newValue = selectedKey ? toolCount(selectedKey) : null
                      const result = syncResults?.[a.id]
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="sync-product-id">{a.product_identifier ?? '—'}</div>
                            <div className="sync-description">{a.description}</div>
                          </td>
                          <td>{a.quantity}</td>
                          <td>
                            <select
                              value={selectedKey}
                              onChange={(e) =>
                                setMapping((prev) => ({ ...prev, [a.id]: e.target.value }))
                              }
                              disabled={syncing || syncResults !== null}
                            >
                              <option value="">— none —</option>
                              {toolOptions.map((t) => (
                                <option key={t.key} value={t.key} disabled={t.count === null}>
                                  {t.label} {t.count === null ? '(unavailable)' : `(${t.count})`}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {newValue === null ? (
                              '—'
                            ) : (
                              <span
                                className={newValue !== a.quantity ? 'sync-value-changed' : ''}
                              >
                                {newValue}
                              </span>
                            )}
                            {result && (
                              <div className={result.success ? 'sync-ok' : 'sync-fail'}>
                                {result.success ? 'Synced' : `Failed: ${result.error}`}
                              </div>
                            )}
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

        {syncError && <p className="api-error">{syncError}</p>}

        <div className="modal-actions">
          <button onClick={onClose} disabled={syncing}>
            {syncResults ? 'Close' : 'Cancel'}
          </button>
          {!syncResults && (
            <button
              className="primary"
              onClick={handleSync}
              disabled={loading || syncing || additions.length === 0}
            >
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

interface CustomerCardProps {
  customer: Customer
  onBlackpointResult?: (result: DeploymentResult<BlackpointDeployment>) => void
  onNinjaResult?: (result: DeploymentResult<NinjaDeployment>) => void
  onCloudRadialResult?: (result: DeploymentResult<CloudRadialDeployment>) => void
  onSophosResult?: (result: DeploymentResult<SophosDeployment>) => void
  onConnectSecureResult?: (result: DeploymentResult<ConnectSecureDeployment>) => void
}

function CustomerCard({
  customer,
  onBlackpointResult,
  onNinjaResult,
  onCloudRadialResult,
  onSophosResult,
  onConnectSecureResult,
}: CustomerCardProps) {
  const encodedName = encodeURIComponent(customer.name)
  const [syncOpen, setSyncOpen] = useState(false)

  return (
    <div className="detail-card">
      <div className="card-header-row">
        <h2>{customer.name}</h2>
        <button className="sync-with-cw-button" onClick={() => setSyncOpen(true)}>
          Sync with CW
        </button>
      </div>
      <dl>
        <dt>Identifier</dt>
        <dd>{customer.identifier}</dd>
        <dt>Status</dt>
        <dd>{customer.status ?? '—'}</dd>
        <dt>Tags</dt>
        <dd>
          {customer.types.length > 0
            ? customer.types.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))
            : '—'}
        </dd>
        <dt>Market</dt>
        <dd>{customer.market ?? '—'}</dd>
        <dt>Website</dt>
        <dd>{customer.website ?? '—'}</dd>
      </dl>

      <IntegrationSection<BlackpointDeployment>
        name="Blackpoint MDR"
        url={`/api/blackpoint/deployment?customer_name=${encodedName}`}
        onResult={onBlackpointResult}
        notFoundText="No matching tenant found in Blackpoint"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Endpoint MDR</dt>
            <dd>{d.endpoint_mdr_count} endpoints</dd>
            <dt>Cloud &amp; Identity MDR</dt>
            <dd>{d.cloud_identity_mdr_count} users</dd>
          </dl>
        )}
      />
      <IntegrationSection<NinjaDeployment>
        name="NinjaRMM"
        url={`/api/ninja/deployment?customer_name=${encodedName}`}
        onResult={onNinjaResult}
        notFoundText="No matching organization found in NinjaRMM"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{d.device_count} registered</dd>
          </dl>
        )}
      />
      <IntegrationSection<CloudRadialDeployment>
        name="CloudRadial"
        url={`/api/cloudradial/deployment?customer_name=${encodedName}`}
        onResult={onCloudRadialResult}
        notFoundText="No matching company found in CloudRadial"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{d.device_count} registered</dd>
          </dl>
        )}
      />
      <IntegrationSection<SophosDeployment>
        name="Sophos Endpoint"
        url={`/api/sophos/deployment?customer_name=${encodedName}`}
        onResult={onSophosResult}
        notFoundText="No matching tenant found in Sophos"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{d.device_count} registered</dd>
            <dt>Disk Encryption</dt>
            <dd>{d.encrypted_count} encrypted</dd>
          </dl>
        )}
      />
      <IntegrationSection<ConnectSecureDeployment>
        name="ConnectSecure"
        url={`/api/connectsecure/deployment?customer_name=${encodedName}`}
        onResult={onConnectSecureResult}
        notFoundText="No matching company found in ConnectSecure"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{d.device_count} registered</dd>
          </dl>
        )}
      />

      {syncOpen && <SyncModal customer={customer} onClose={() => setSyncOpen(false)} />}
    </div>
  )
}

function summarize<T extends Matchable>(
  results: Record<number, DeploymentResult<T> | undefined>,
  countOf: (data: T) => number | null,
) {
  let reported = 0
  let matched = 0
  let total = 0
  let errors = 0

  for (const result of Object.values(results)) {
    if (!result) continue
    reported += 1
    if (result.error) {
      errors += 1
      continue
    }
    if (result.data?.matched) {
      matched += 1
      total += countOf(result.data) ?? 0
    }
  }

  return { reported, matched, total, errors }
}

function SummaryRow({
  label,
  unit,
  summary,
  totalCustomers,
}: {
  label: string
  unit: string
  summary: { reported: number; matched: number; total: number; errors: number }
  totalCustomers: number
}) {
  const pending = totalCustomers - summary.reported
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {summary.total} {unit} across {summary.matched} customer{summary.matched === 1 ? '' : 's'}
        {summary.errors > 0 && (
          <span className="summary-errors">
            {' '}
            — {summary.errors} error{summary.errors === 1 ? '' : 's'}
          </span>
        )}
        {pending > 0 && ` (checking ${summary.reported}/${totalCustomers}...)`}
      </dd>
    </>
  )
}

function SummaryCard({
  totalCustomers,
  blackpointResults,
  ninjaResults,
  cloudradialResults,
  sophosResults,
  connectsecureResults,
}: {
  totalCustomers: number
  blackpointResults: Record<number, DeploymentResult<BlackpointDeployment> | undefined>
  ninjaResults: Record<number, DeploymentResult<NinjaDeployment> | undefined>
  cloudradialResults: Record<number, DeploymentResult<CloudRadialDeployment> | undefined>
  sophosResults: Record<number, DeploymentResult<SophosDeployment> | undefined>
  connectsecureResults: Record<number, DeploymentResult<ConnectSecureDeployment> | undefined>
}) {
  const bp = summarize(blackpointResults, (d) => d.endpoint_mdr_count)
  const bpCloud = summarize(blackpointResults, (d) => d.cloud_identity_mdr_count)
  const ninja = summarize(ninjaResults, (d) => d.device_count)
  const cloudradial = summarize(cloudradialResults, (d) => d.device_count)
  const sophos = summarize(sophosResults, (d) => d.device_count)
  const sophosEncrypted = summarize(sophosResults, (d) => d.encrypted_count)
  const connectsecure = summarize(connectsecureResults, (d) => d.device_count)

  return (
    <div className="summary-card">
      <h2>Aggregated Deployment Summary</h2>
      <dl className="integration-stats">
        <SummaryRow
          label="Blackpoint Endpoint MDR"
          unit="endpoints"
          summary={bp}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Blackpoint Cloud & Identity MDR"
          unit="users"
          summary={bpCloud}
          totalCustomers={totalCustomers}
        />
        <SummaryRow label="NinjaRMM" unit="devices" summary={ninja} totalCustomers={totalCustomers} />
        <SummaryRow
          label="CloudRadial"
          unit="devices"
          summary={cloudradial}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Sophos Endpoint"
          unit="devices"
          summary={sophos}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Sophos Disk Encryption"
          unit="encrypted"
          summary={sophosEncrypted}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="ConnectSecure"
          unit="devices"
          summary={connectsecure}
          totalCustomers={totalCustomers}
        />
      </dl>
    </div>
  )
}

function App() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [selected, setSelected] = useState<Customer | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  const [blackpointResults, setBlackpointResults] = useState<
    Record<number, DeploymentResult<BlackpointDeployment> | undefined>
  >({})
  const [ninjaResults, setNinjaResults] = useState<
    Record<number, DeploymentResult<NinjaDeployment> | undefined>
  >({})
  const [cloudradialResults, setCloudradialResults] = useState<
    Record<number, DeploymentResult<CloudRadialDeployment> | undefined>
  >({})
  const [sophosResults, setSophosResults] = useState<
    Record<number, DeploymentResult<SophosDeployment> | undefined>
  >({})
  const [connectsecureResults, setConnectsecureResults] = useState<
    Record<number, DeploymentResult<ConnectSecureDeployment> | undefined>
  >({})

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then((data: Customer[]) => setCustomers(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    customers.forEach((c) => c.types.forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [customers])

  const suggestions = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return []
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(trimmed) || c.identifier.toLowerCase().includes(trimmed),
      )
      .slice(0, MAX_SUGGESTIONS)
  }, [customers, query])

  const taggedCustomers = useMemo(() => {
    if (!selectedType) return []
    return customers
      .filter((c) => c.types.includes(selectedType))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, selectedType])

  useEffect(() => {
    setBlackpointResults({})
    setNinjaResults({})
    setCloudradialResults({})
    setSophosResults({})
    setConnectsecureResults({})
  }, [selectedType])

  function selectCustomer(customer: Customer) {
    setSelected(customer)
    setQuery(customer.name)
    setIsOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectCustomer(suggestions[highlightedIndex])
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="page">
      <h1>Customers</h1>

      {loading && <p>Loading customers...</p>}
      {error && <p className="error">Failed to load customers: {error}</p>}

      {!loading && !error && (
        <>
          <div className="controls">
            <div className="search" ref={searchRef}>
              <input
                type="text"
                placeholder="Search customers by name..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setIsOpen(true)
                  setHighlightedIndex(0)
                  if (selected && e.target.value !== selected.name) setSelected(null)
                }}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
              />
              {isOpen && suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((c, i) => (
                    <li
                      key={c.id}
                      className={i === highlightedIndex ? 'active' : ''}
                      onMouseDown={() => selectCustomer(c)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                    >
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <select
              className="type-select"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">All tags</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {selected && <CustomerCard customer={selected} />}

          {selectedType && (
            <div className="tag-results">
              <p className="count">
                {taggedCustomers.length} customer{taggedCustomers.length === 1 ? '' : 's'} tagged
                &nbsp;
                <span className="tag">{selectedType}</span>
              </p>

              {taggedCustomers.length > 0 && (
                <SummaryCard
                  totalCustomers={taggedCustomers.length}
                  blackpointResults={blackpointResults}
                  ninjaResults={ninjaResults}
                  cloudradialResults={cloudradialResults}
                  sophosResults={sophosResults}
                  connectsecureResults={connectsecureResults}
                />
              )}

              {taggedCustomers.map((c) => (
                <CustomerCard
                  key={c.id}
                  customer={c}
                  onBlackpointResult={(result) =>
                    setBlackpointResults((prev) => ({ ...prev, [c.id]: result }))
                  }
                  onNinjaResult={(result) =>
                    setNinjaResults((prev) => ({ ...prev, [c.id]: result }))
                  }
                  onCloudRadialResult={(result) =>
                    setCloudradialResults((prev) => ({ ...prev, [c.id]: result }))
                  }
                  onSophosResult={(result) =>
                    setSophosResults((prev) => ({ ...prev, [c.id]: result }))
                  }
                  onConnectSecureResult={(result) =>
                    setConnectsecureResults((prev) => ({ ...prev, [c.id]: result }))
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
