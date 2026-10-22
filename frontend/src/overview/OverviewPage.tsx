import { useEffect, useMemo, useState } from 'react'
import {
  SyncModal,
  describeHttpError,
  useDeployment,
  type BlackpointDeployment,
  type CloudRadialDeployment,
  type ConnectSecureDeployment,
  type Customer,
  type DropsuiteDeployment,
  type EvoDeployment,
  type Matchable,
  type NinjaDeployment,
  type SophosDeployment,
} from '../App'
import SophosEndpoints from './SophosEndpoints'
import './overview.css'

type TabKey =
  | 'overview'
  | 'ninja'
  | 'blackpoint'
  | 'evo'
  | 'cloudradial'
  | 'connectsecure'
  | 'sophos'
  | 'dropsuite'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'ninja', label: 'Ninja' },
  { key: 'blackpoint', label: 'Blackpoint' },
  { key: 'evo', label: 'Evo' },
  { key: 'cloudradial', label: 'CloudRadial' },
  { key: 'connectsecure', label: 'Connect Secure' },
  { key: 'sophos', label: 'Sophos' },
  { key: 'dropsuite', label: 'Dropsuite' },
]

const BLACKPOINT_PORTAL_URL = 'https://compassone.blackpointcyber.com'

interface Source<T> {
  data: T | null
  error: string | null
  loading: boolean
  check: () => void
}

type Status = 'loading' | 'error' | 'matched' | 'missing'

function statusOf(source: { data: Matchable | null; error: string | null }): Status {
  if (source.error) return 'error'
  if (!source.data) return 'loading'
  return source.data.matched ? 'matched' : 'missing'
}

const STATUS_LABEL: Record<Status, string> = {
  loading: 'Loading',
  error: 'Error',
  matched: 'Deployed',
  missing: 'Not found',
}

function useCustomerSources(customer: Customer) {
  const name = encodeURIComponent(customer.name)
  const query = `?customer_name=${name}`
  return {
    ninja: useDeployment<NinjaDeployment>(`/api/ninja/deployment${query}`),
    blackpoint: useDeployment<BlackpointDeployment>(`/api/blackpoint/deployment${query}`),
    evo: useDeployment<EvoDeployment>(`/api/evo/deployment${query}`),
    cloudradial: useDeployment<CloudRadialDeployment>(`/api/cloudradial/deployment${query}`),
    connectsecure: useDeployment<ConnectSecureDeployment>(`/api/connectsecure/deployment${query}`),
    sophos: useDeployment<SophosDeployment>(`/api/sophos/deployment${query}`),
    dropsuite: useDeployment<DropsuiteDeployment>(`/api/dropsuite/deployment${query}`),
  }
}

type Sources = ReturnType<typeof useCustomerSources>

function OnboardAction({
  productName,
  customerName,
  onboardUrl,
  onboardLink,
  onDone,
}: {
  productName: string
  customerName: string
  onboardUrl?: string
  onboardLink?: string
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onboard() {
    if (!onboardUrl) return
    const confirmed = window.confirm(
      `Create "${customerName}" in ${productName}?\n\nThis creates a new record for this customer in ${productName}.`,
    )
    if (!confirmed) return

    setBusy(true)
    setError(null)
    fetch(onboardUrl, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await describeHttpError(res))
      })
      .then(onDone)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <>
      {onboardLink ? (
        <a
          className="ov-onboard"
          href={onboardLink}
          target="_blank"
          rel="noopener noreferrer"
          title={`${productName} has no create API. Opens its portal to add "${customerName}" manually`}
        >
          Onboard in {productName} portal
        </a>
      ) : (
        <button
          className="ov-onboard"
          onClick={onboard}
          disabled={!onboardUrl || busy}
          title={
            onboardUrl
              ? `Create this customer in ${productName}`
              : `Onboarding for ${productName} isn't built yet`
          }
        >
          {busy ? 'Onboarding...' : 'Onboard'}
        </button>
      )}
      {error && <p className="ov-error">Onboard failed: {error}</p>}
    </>
  )
}

function ServiceTab<T extends Matchable>({
  productName,
  customerName,
  source,
  notFoundText,
  onboardUrl,
  onboardLink,
  rows,
}: {
  productName: string
  customerName: string
  source: Source<T>
  notFoundText: string
  onboardUrl?: string
  onboardLink?: string
  rows: (data: T) => [string, React.ReactNode][]
}) {
  const status = statusOf(source)

  return (
    <section className="ov-service">
      <div className="ov-service-header">
        <h2>{productName}</h2>
        <button className="ov-button" onClick={source.check} disabled={source.loading}>
          {source.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {status === 'loading' && <p className="ov-muted">Loading...</p>}
      {status === 'error' && <p className="ov-error">API error: {source.error}</p>}
      {status === 'missing' && (
        <div className="ov-missing">
          <p className="ov-muted">{notFoundText}</p>
          <OnboardAction
            productName={productName}
            customerName={customerName}
            onboardUrl={onboardUrl}
            onboardLink={onboardLink}
            onDone={source.check}
          />
        </div>
      )}
      {status === 'matched' && source.data && (
        <dl className="ov-dl">
          {rows(source.data).map(([label, value]) => (
            <div key={label} className="ov-dl-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function countValue<T extends Matchable>(
  source: Source<T>,
  countOf: (data: T) => number | null,
  unit: string,
): React.ReactNode {
  const status = statusOf(source)
  if (status === 'loading') return <span className="ov-muted">Loading...</span>
  if (status === 'error') return <span className="ov-error-text">Error: {source.error}</span>
  if (status === 'missing' || !source.data) return <span className="ov-muted">Not found</span>
  return `${countOf(source.data) ?? 0} ${unit}`
}

function OverviewTab({
  customer,
  sources,
  onTabChange,
}: {
  customer: Customer
  sources: Sources
  onTabChange: (tab: TabKey) => void
}) {
  // Each row links to the tab for the tool it reports on.
  const rows: [string, TabKey, React.ReactNode][] = [
    [
      'Blackpoint Endpoint MDR',
      'blackpoint',
      countValue(sources.blackpoint, (d) => d.endpoint_mdr_count, 'endpoints'),
    ],
    [
      'Blackpoint Cloud & Identity MDR',
      'blackpoint',
      countValue(sources.blackpoint, (d) => d.cloud_identity_mdr_count, 'users'),
    ],
    ['NinjaRMM', 'ninja', countValue(sources.ninja, (d) => d.device_count, 'devices')],
    [
      'CloudRadial',
      'cloudradial',
      countValue(sources.cloudradial, (d) => d.device_count, 'devices'),
    ],
    ['Sophos Endpoint', 'sophos', countValue(sources.sophos, (d) => d.device_count, 'devices')],
    [
      'Sophos Disk Encryption',
      'sophos',
      countValue(sources.sophos, (d) => d.encrypted_count, 'encrypted'),
    ],
    [
      'ConnectSecure',
      'connectsecure',
      countValue(sources.connectsecure, (d) => d.device_count, 'devices'),
    ],
    ['Evo MFA and SSO', 'evo', countValue(sources.evo, (d) => d.mfa_sso_count, 'licenses')],
    [
      'Evo Technician Elevation',
      'evo',
      countValue(sources.evo, (d) => d.technician_elevation_count, 'licenses'),
    ],
    [
      'Evo End User Elevation',
      'evo',
      countValue(sources.evo, (d) => d.end_user_elevation_count, 'licenses'),
    ],
    [
      'Evo Help Desk Verification',
      'evo',
      countValue(sources.evo, (d) => d.help_desk_verification_count, 'licenses'),
    ],
    ['Dropsuite', 'dropsuite', countValue(sources.dropsuite, (d) => d.seats_used, 'seats')],
  ]

  return (
    <>
      <section className="ov-service">
        <h2>Customer</h2>
        <dl className="ov-dl">
          <div className="ov-dl-row">
            <dt>Identifier</dt>
            <dd>{customer.identifier}</dd>
          </div>
          <div className="ov-dl-row">
            <dt>Status</dt>
            <dd>{customer.status ?? '—'}</dd>
          </div>
          <div className="ov-dl-row">
            <dt>Market</dt>
            <dd>{customer.market ?? '—'}</dd>
          </div>
          <div className="ov-dl-row">
            <dt>Website</dt>
            <dd>{customer.website ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="ov-service">
        <h2>Deployment</h2>
        <dl className="ov-dl">
          {rows.map(([label, target, value]) => (
            <div
              key={label}
              className="ov-dl-row ov-dl-link"
              onClick={() => onTabChange(target)}
            >
              <dt>
                <button className="ov-link" title={`Go to the ${label.split(' ')[0]} tab`}>
                  {label}
                </button>
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}

function CustomerPanel({
  customer,
  tab,
  sources,
  onTabChange,
}: {
  customer: Customer
  tab: TabKey
  sources: Sources
  onTabChange: (tab: TabKey) => void
}) {
  const encodedName = encodeURIComponent(customer.name)

  return (
    <>
      {tab === 'overview' && (
        <OverviewTab customer={customer} sources={sources} onTabChange={onTabChange} />
      )}

      {tab === 'ninja' && (
        <ServiceTab<NinjaDeployment>
          productName="NinjaRMM"
          customerName={customer.name}
          source={sources.ninja}
          notFoundText="No matching organization found in NinjaRMM"
          onboardUrl={`/api/ninja/onboard?customer_name=${encodedName}`}
          rows={(d) => [
            ['Organization', d.organization_name],
            ['Organization ID', d.organization_id],
            ['Devices', `${d.device_count} registered`],
          ]}
        />
      )}

      {tab === 'blackpoint' && (
        <ServiceTab<BlackpointDeployment>
          productName="Blackpoint MDR"
          customerName={customer.name}
          source={sources.blackpoint}
          notFoundText="No matching tenant found in Blackpoint"
          onboardLink={BLACKPOINT_PORTAL_URL}
          rows={(d) => [
            ['Tenant', d.tenant_name],
            ['Tenant ID', d.tenant_id],
            ['Endpoint MDR', `${d.endpoint_mdr_count} endpoints`],
            ['Cloud & Identity MDR', `${d.cloud_identity_mdr_count} users`],
          ]}
        />
      )}

      {tab === 'evo' && (
        <ServiceTab<EvoDeployment>
          productName="Evo Security"
          customerName={customer.name}
          source={sources.evo}
          notFoundText="No matching tenant found in Evo Security"
          onboardUrl={`/api/evo/onboard?customer_name=${encodedName}`}
          rows={(d) => [
            ['Tenant', d.tenant_name],
            ['Tenant ID', d.tenant_id],
            ['MFA and SSO', d.mfa_sso_count],
            ['Technician Elevation', d.technician_elevation_count],
            ['End User Elevation', d.end_user_elevation_count],
            ['Help Desk Verification', d.help_desk_verification_count],
          ]}
        />
      )}

      {tab === 'cloudradial' && (
        <ServiceTab<CloudRadialDeployment>
          productName="CloudRadial"
          customerName={customer.name}
          source={sources.cloudradial}
          notFoundText="No matching company found in CloudRadial"
          rows={(d) => [
            ['Company', d.company_name],
            ['Company ID', d.company_id],
            ['Devices', `${d.device_count} registered`],
          ]}
        />
      )}

      {tab === 'connectsecure' && (
        <ServiceTab<ConnectSecureDeployment>
          productName="ConnectSecure"
          customerName={customer.name}
          source={sources.connectsecure}
          notFoundText="No matching company found in ConnectSecure"
          rows={(d) => [
            ['Company', d.company_name],
            ['Company ID', d.company_id],
            ['Devices', `${d.device_count} registered`],
          ]}
        />
      )}

      {tab === 'sophos' && (
        <>
          <ServiceTab<SophosDeployment>
            productName="Sophos Endpoint"
            customerName={customer.name}
            source={sources.sophos}
            notFoundText="No matching tenant found in Sophos"
            rows={(d) => [
              ['Tenant', d.tenant_name],
              ['Tenant ID', d.tenant_id],
              ['Devices', `${d.device_count} registered`],
              ['Disk Encryption', `${d.encrypted_count} encrypted`],
            ]}
          />
          {sources.sophos.data?.matched && <SophosEndpoints customerName={customer.name} />}
        </>
      )}

      {tab === 'dropsuite' && (
        <ServiceTab<DropsuiteDeployment>
          productName="Dropsuite"
          customerName={customer.name}
          source={sources.dropsuite}
          notFoundText="No matching organization found in Dropsuite"
          rows={(d) => [
            ['Organization', d.organization_name],
            ['Organization ID', d.organization_id],
            ['Seats Used', d.seats_used],
          ]}
        />
      )}
    </>
  )
}

// Tab dots come from the same sources the panel renders, so they cost no extra requests.
function TabBar({
  tab,
  onChange,
  sources,
}: {
  tab: TabKey
  onChange: (tab: TabKey) => void
  sources: Sources
}) {
  return (
    <div className="ov-tabs" role="tablist">
      {TABS.map(({ key, label }) => {
        const status = key === 'overview' ? null : statusOf(sources[key])
        return (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'ov-tab active' : 'ov-tab'}
            onClick={() => onChange(key)}
          >
            {status && (
              <span
                className={`ov-dot ov-dot-${status}`}
                title={STATUS_LABEL[status]}
                aria-label={STATUS_LABEL[status]}
              />
            )}
            {label}
          </button>
        )
      })}
    </div>
  )
}

function CustomerView({
  customer,
  tab,
  onTabChange,
}: {
  customer: Customer
  tab: TabKey
  onTabChange: (tab: TabKey) => void
}) {
  const sources = useCustomerSources(customer)
  const [syncOpen, setSyncOpen] = useState(false)

  return (
    <div className="ov-customer">
      <div className="ov-customer-header">
        <div>
          <h1>{customer.name}</h1>
          <div>
            {customer.types.map((t) => (
              <span key={t} className="ov-tag">
                {t}
              </span>
            ))}
          </div>
        </div>
        <button className="ov-button" onClick={() => setSyncOpen(true)}>
          Sync with CW
        </button>
      </div>

      <TabBar tab={tab} onChange={onTabChange} sources={sources} />

      <div className="ov-tab-body">
        <CustomerPanel
          customer={customer}
          tab={tab}
          sources={sources}
          onTabChange={onTabChange}
        />
      </div>

      {syncOpen && <SyncModal customer={customer} onClose={() => setSyncOpen(false)} />}
    </div>
  )
}

export default function OverviewPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [selectedType, setSelectedType] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [tab, setTab] = useState<TabKey>('overview')

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then((data: Customer[]) => setCustomers(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const allTypes = useMemo(() => {
    const set = new Set<string>()
    customers.forEach((c) => c.types.forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [customers])

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    return customers
      .filter((c) => !selectedType || c.types.includes(selectedType))
      .filter(
        (c) =>
          !trimmed ||
          c.name.toLowerCase().includes(trimmed) ||
          c.identifier.toLowerCase().includes(trimmed),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [customers, query, selectedType])

  const selected = customers.find((c) => c.id === selectedId) ?? null

  return (
    <div className="ov-page">
      <aside className="ov-sidebar">
        <div className="ov-sidebar-top">
          <div className="ov-sidebar-title">
            <h2>Customers</h2>
            <a href="/">Classic view</a>
          </div>
          <input
            type="text"
            placeholder="Search customers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
            <option value="">All tags</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {!loading && !error && (
            <p className="ov-count">
              {visible.length} customer{visible.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {loading && <p className="ov-muted ov-pad">Loading customers...</p>}
        {error && <p className="ov-error ov-pad">Failed to load customers: {error}</p>}

        <ul className="ov-list">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                className={c.id === selectedId ? 'ov-list-item active' : 'ov-list-item'}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="ov-main">
        {selected ? (
          <CustomerView key={selected.id} customer={selected} tab={tab} onTabChange={setTab} />
        ) : (
          <p className="ov-muted ov-pad">Select a customer from the list.</p>
        )}
      </main>
    </div>
  )
}
