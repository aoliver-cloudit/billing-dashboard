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
  customerName,
  url,
  onboardUrl,
  onboardLink,
  onResult,
  notFoundText,
  renderStats,
}: {
  name: string
  customerName: string
  url: string
  onboardUrl?: string
  // For products with no create API: Onboard opens the product's own portal instead.
  onboardLink?: string
  onResult?: (result: DeploymentResult<T>) => void
  notFoundText: string
  renderStats: (data: T) => React.ReactNode
}) {
  const { data, error, loading, check } = useDeployment<T>(url, onResult)
  const [onboarding, setOnboarding] = useState(false)
  const [onboardError, setOnboardError] = useState<string | null>(null)

  function onboard() {
    if (!onboardUrl) return
    const confirmed = window.confirm(
      `Create "${customerName}" in ${name}?\n\nThis creates a new record for this customer in ${name}.`,
    )
    if (!confirmed) return

    setOnboarding(true)
    setOnboardError(null)
    fetch(onboardUrl, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await describeHttpError(res))
      })
      .then(() => check())
      .catch((err: Error) => setOnboardError(err.message))
      .finally(() => setOnboarding(false))
  }

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
          <>
            <div className="not-found-row">
              <p className="not-found">{notFoundText}</p>
              {onboardLink ? (
                <a
                  className="onboard-button"
                  href={onboardLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${name} has no create API. Opens its portal to add "${customerName}" manually`}
                >
                  Onboard
                </a>
              ) : (
                <button
                  className="onboard-button"
                  onClick={onboard}
                  disabled={!onboardUrl || onboarding || loading}
                  title={
                    onboardUrl
                      ? `Create this customer in ${name}`
                      : `Onboarding for ${name} isn't built yet`
                  }
                >
                  {onboarding ? 'Onboarding...' : 'Onboard'}
                </button>
              )}
            </div>
            {onboardError && <p className="api-error">Onboard failed: {onboardError}</p>}
          </>
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

interface EvoDeployment extends Matchable {
  tenant_id: string | null
  tenant_name: string | null
  mfa_sso_count: number | null
  technician_elevation_count: number | null
  end_user_elevation_count: number | null
  help_desk_verification_count: number | null
}

interface DropsuiteDeployment extends Matchable {
  organization_id: string | null
  organization_name: string | null
  seats_used: number | null
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
      fetchJsonOrNull<EvoDeployment>(`/api/evo/deployment?customer_name=${encodedName}`),
      fetchJsonOrNull<DropsuiteDeployment>(
        `/api/dropsuite/deployment?customer_name=${encodedName}`,
      ),
    ])
      .then(([additionsData, bp, ninja, cr, sophos, cs, evo, dropsuite]) => {
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
          {
            key: 'evo_mfa_sso',
            label: 'Evo MFA and SSO',
            count: evo?.matched ? evo.mfa_sso_count : null,
          },
          {
            key: 'evo_technician_elevation',
            label: 'Evo Technician Elevation',
            count: evo?.matched ? evo.technician_elevation_count : null,
          },
          {
            key: 'evo_end_user_elevation',
            label: 'Evo End User Elevation',
            count: evo?.matched ? evo.end_user_elevation_count : null,
          },
          {
            key: 'evo_help_desk_verification',
            label: 'Evo Help Desk Verification',
            count: evo?.matched ? evo.help_desk_verification_count : null,
          },
          {
            key: 'dropsuite',
            label: 'Dropsuite Seats Used',
            count: dropsuite?.matched ? dropsuite.seats_used : null,
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
  onEvoResult?: (result: DeploymentResult<EvoDeployment>) => void
  onDropsuiteResult?: (result: DeploymentResult<DropsuiteDeployment>) => void
}

function CustomerCard({
  customer,
  onBlackpointResult,
  onNinjaResult,
  onCloudRadialResult,
  onSophosResult,
  onConnectSecureResult,
  onEvoResult,
  onDropsuiteResult,
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
        customerName={customer.name}
        url={`/api/blackpoint/deployment?customer_name=${encodedName}`}
        onboardLink="https://compassone.blackpointcyber.com"
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
        customerName={customer.name}
        url={`/api/ninja/deployment?customer_name=${encodedName}`}
        onboardUrl={`/api/ninja/onboard?customer_name=${encodedName}`}
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
        customerName={customer.name}
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
        customerName={customer.name}
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
        customerName={customer.name}
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
      <IntegrationSection<EvoDeployment>
        name="Evo Security"
        customerName={customer.name}
        url={`/api/evo/deployment?customer_name=${encodedName}`}
        onboardUrl={`/api/evo/onboard?customer_name=${encodedName}`}
        onResult={onEvoResult}
        notFoundText="No matching tenant found in Evo Security"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>MFA and SSO</dt>
            <dd>{d.mfa_sso_count}</dd>
            <dt>Technician Elevation</dt>
            <dd>{d.technician_elevation_count}</dd>
            <dt>End User Elevation</dt>
            <dd>{d.end_user_elevation_count}</dd>
            <dt>Help Desk Verification</dt>
            <dd>{d.help_desk_verification_count}</dd>
          </dl>
        )}
      />
      <IntegrationSection<DropsuiteDeployment>
        name="Dropsuite"
        customerName={customer.name}
        url={`/api/dropsuite/deployment?customer_name=${encodedName}`}
        onResult={onDropsuiteResult}
        notFoundText="No matching organization found in Dropsuite"
        renderStats={(d) => (
          <dl className="integration-stats">
            <dt>Seats Used</dt>
            <dd>{d.seats_used}</dd>
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
  evoResults,
  dropsuiteResults,
}: {
  totalCustomers: number
  blackpointResults: Record<number, DeploymentResult<BlackpointDeployment> | undefined>
  ninjaResults: Record<number, DeploymentResult<NinjaDeployment> | undefined>
  cloudradialResults: Record<number, DeploymentResult<CloudRadialDeployment> | undefined>
  sophosResults: Record<number, DeploymentResult<SophosDeployment> | undefined>
  connectsecureResults: Record<number, DeploymentResult<ConnectSecureDeployment> | undefined>
  evoResults: Record<number, DeploymentResult<EvoDeployment> | undefined>
  dropsuiteResults: Record<number, DeploymentResult<DropsuiteDeployment> | undefined>
}) {
  const bp = summarize(blackpointResults, (d) => d.endpoint_mdr_count)
  const bpCloud = summarize(blackpointResults, (d) => d.cloud_identity_mdr_count)
  const ninja = summarize(ninjaResults, (d) => d.device_count)
  const cloudradial = summarize(cloudradialResults, (d) => d.device_count)
  const sophos = summarize(sophosResults, (d) => d.device_count)
  const sophosEncrypted = summarize(sophosResults, (d) => d.encrypted_count)
  const connectsecure = summarize(connectsecureResults, (d) => d.device_count)
  const evoMfaSso = summarize(evoResults, (d) => d.mfa_sso_count)
  const evoTechnicianElevation = summarize(evoResults, (d) => d.technician_elevation_count)
  const evoEndUserElevation = summarize(evoResults, (d) => d.end_user_elevation_count)
  const evoHelpDeskVerification = summarize(evoResults, (d) => d.help_desk_verification_count)
  const dropsuite = summarize(dropsuiteResults, (d) => d.seats_used)

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
        <SummaryRow
          label="Evo MFA and SSO"
          unit="licenses"
          summary={evoMfaSso}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Evo Technician Elevation"
          unit="licenses"
          summary={evoTechnicianElevation}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Evo End User Elevation"
          unit="licenses"
          summary={evoEndUserElevation}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Evo Help Desk Verification"
          unit="licenses"
          summary={evoHelpDeskVerification}
          totalCustomers={totalCustomers}
        />
        <SummaryRow
          label="Dropsuite"
          unit="seats"
          summary={dropsuite}
          totalCustomers={totalCustomers}
        />
      </dl>
    </div>
  )
}

interface AllResults {
  blackpoint: Record<number, DeploymentResult<BlackpointDeployment> | undefined>
  ninja: Record<number, DeploymentResult<NinjaDeployment> | undefined>
  cloudradial: Record<number, DeploymentResult<CloudRadialDeployment> | undefined>
  sophos: Record<number, DeploymentResult<SophosDeployment> | undefined>
  connectsecure: Record<number, DeploymentResult<ConnectSecureDeployment> | undefined>
  evo: Record<number, DeploymentResult<EvoDeployment> | undefined>
  dropsuite: Record<number, DeploymentResult<DropsuiteDeployment> | undefined>
}

const CSV_FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Stop spreadsheet apps from evaluating text cells that start with a formula character.
  if (typeof value === 'string' && text && CSV_FORMULA_PREFIXES.includes(text[0])) {
    text = `'${text}`
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// Blank means no match in that tool; ERROR means the integration's API call failed.
function metricCell<T extends Matchable>(
  result: DeploymentResult<T> | undefined,
  countOf: (data: T) => number | null,
): string | number {
  if (!result) return ''
  if (result.error) return 'ERROR'
  return result.data?.matched ? (countOf(result.data) ?? '') : ''
}

function buildCsv(customers: Customer[], results: AllResults): string {
  const header = [
    'Customer',
    'Identifier',
    'Status',
    'Tags',
    'Blackpoint Endpoint MDR',
    'Blackpoint Cloud & Identity MDR',
    'NinjaRMM Devices',
    'CloudRadial Devices',
    'Sophos Devices',
    'Sophos Disk Encrypted',
    'ConnectSecure Devices',
    'Evo MFA and SSO',
    'Evo Technician Elevation',
    'Evo End User Elevation',
    'Evo Help Desk Verification',
    'Dropsuite Seats Used',
  ]

  const rows = customers.map((c) => [
    c.name,
    c.identifier,
    c.status,
    c.types.join('; '),
    metricCell(results.blackpoint[c.id], (d) => d.endpoint_mdr_count),
    metricCell(results.blackpoint[c.id], (d) => d.cloud_identity_mdr_count),
    metricCell(results.ninja[c.id], (d) => d.device_count),
    metricCell(results.cloudradial[c.id], (d) => d.device_count),
    metricCell(results.sophos[c.id], (d) => d.device_count),
    metricCell(results.sophos[c.id], (d) => d.encrypted_count),
    metricCell(results.connectsecure[c.id], (d) => d.device_count),
    metricCell(results.evo[c.id], (d) => d.mfa_sso_count),
    metricCell(results.evo[c.id], (d) => d.technician_elevation_count),
    metricCell(results.evo[c.id], (d) => d.end_user_elevation_count),
    metricCell(results.evo[c.id], (d) => d.help_desk_verification_count),
    metricCell(results.dropsuite[c.id], (d) => d.seats_used),
  ])

  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

function downloadCsv(filename: string, csv: string) {
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
  const [evoResults, setEvoResults] = useState<
    Record<number, DeploymentResult<EvoDeployment> | undefined>
  >({})
  const [dropsuiteResults, setDropsuiteResults] = useState<
    Record<number, DeploymentResult<DropsuiteDeployment> | undefined>
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
    setEvoResults({})
    setDropsuiteResults({})
  }, [selectedType])

  const resultMaps = [
    blackpointResults,
    ninjaResults,
    cloudradialResults,
    sophosResults,
    connectsecureResults,
    evoResults,
    dropsuiteResults,
  ]
  const exportReady =
    taggedCustomers.length > 0 &&
    taggedCustomers.every((c) => resultMaps.every((m) => m[c.id] !== undefined))

  function handleExportCsv() {
    const csv = buildCsv(taggedCustomers, {
      blackpoint: blackpointResults,
      ninja: ninjaResults,
      cloudradial: cloudradialResults,
      sophos: sophosResults,
      connectsecure: connectsecureResults,
      evo: evoResults,
      dropsuite: dropsuiteResults,
    })
    const tag = selectedType.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
    const date = new Date().toISOString().slice(0, 10)
    downloadCsv(`deployment-${tag}-${date}.csv`, csv)
  }

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
              <div className="tag-results-header">
                <p className="count">
                  {taggedCustomers.length} customer{taggedCustomers.length === 1 ? '' : 's'} tagged
                  &nbsp;
                  <span className="tag">{selectedType}</span>
                </p>
                <button
                  className="export-csv-button"
                  onClick={handleExportCsv}
                  disabled={!exportReady}
                  title={exportReady ? 'Download these results as a CSV' : 'Waiting for all lookups to finish'}
                >
                  {exportReady ? 'Export CSV' : 'Loading...'}
                </button>
              </div>

              {taggedCustomers.length > 0 && (
                <SummaryCard
                  totalCustomers={taggedCustomers.length}
                  blackpointResults={blackpointResults}
                  ninjaResults={ninjaResults}
                  cloudradialResults={cloudradialResults}
                  sophosResults={sophosResults}
                  connectsecureResults={connectsecureResults}
                  evoResults={evoResults}
                  dropsuiteResults={dropsuiteResults}
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
                  onEvoResult={(result) => setEvoResults((prev) => ({ ...prev, [c.id]: result }))}
                  onDropsuiteResult={(result) =>
                    setDropsuiteResults((prev) => ({ ...prev, [c.id]: result }))
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
