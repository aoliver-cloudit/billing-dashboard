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

interface BlackpointDeployment {
  matched: boolean
  tenant_id: string | null
  tenant_name: string | null
  endpoint_mdr_count: number | null
  cloud_identity_mdr_count: number | null
}

function BlackpointSection({ customerName }: { customerName: string }) {
  const [deployment, setDeployment] = useState<BlackpointDeployment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function check() {
    setLoading(true)
    setError(null)
    fetch(`/api/blackpoint/deployment?customer_name=${encodeURIComponent(customerName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then((data: BlackpointDeployment) => setDeployment(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName])

  return (
    <div className="integration">
      <div className="integration-header">
        <span className="integration-name">Blackpoint MDR</span>
        <button onClick={check} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error">Failed to check Blackpoint: {error}</p>}
      {deployment &&
        (deployment.matched ? (
          <dl className="integration-stats">
            <dt>Endpoint MDR</dt>
            <dd>{deployment.endpoint_mdr_count} endpoints</dd>
            <dt>Cloud &amp; Identity MDR</dt>
            <dd>{deployment.cloud_identity_mdr_count} users</dd>
          </dl>
        ) : (
          <p className="not-found">No matching tenant found in Blackpoint</p>
        ))}
    </div>
  )
}

interface NinjaDeployment {
  matched: boolean
  organization_id: number | null
  organization_name: string | null
  device_count: number | null
}

function NinjaSection({ customerName }: { customerName: string }) {
  const [deployment, setDeployment] = useState<NinjaDeployment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function check() {
    setLoading(true)
    setError(null)
    fetch(`/api/ninja/deployment?customer_name=${encodeURIComponent(customerName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then((data: NinjaDeployment) => setDeployment(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName])

  return (
    <div className="integration">
      <div className="integration-header">
        <span className="integration-name">NinjaRMM</span>
        <button onClick={check} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error">Failed to check NinjaRMM: {error}</p>}
      {deployment &&
        (deployment.matched ? (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{deployment.device_count} registered</dd>
          </dl>
        ) : (
          <p className="not-found">No matching organization found in NinjaRMM</p>
        ))}
    </div>
  )
}

interface CloudRadialDeployment {
  matched: boolean
  company_id: number | null
  company_name: string | null
  device_count: number | null
}

function CloudRadialSection({ customerName }: { customerName: string }) {
  const [deployment, setDeployment] = useState<CloudRadialDeployment | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function check() {
    setLoading(true)
    setError(null)
    fetch(`/api/cloudradial/deployment?customer_name=${encodeURIComponent(customerName)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        return res.json()
      })
      .then((data: CloudRadialDeployment) => setDeployment(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName])

  return (
    <div className="integration">
      <div className="integration-header">
        <span className="integration-name">CloudRadial</span>
        <button onClick={check} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      {error && <p className="error">Failed to check CloudRadial: {error}</p>}
      {deployment &&
        (deployment.matched ? (
          <dl className="integration-stats">
            <dt>Devices</dt>
            <dd>{deployment.device_count} registered</dd>
          </dl>
        ) : (
          <p className="not-found">No matching company found in CloudRadial</p>
        ))}
    </div>
  )
}

function CustomerCard({ customer }: { customer: Customer }) {
  return (
    <div className="detail-card">
      <h2>{customer.name}</h2>
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

      <BlackpointSection customerName={customer.name} />
      <NinjaSection customerName={customer.name} />
      <CloudRadialSection customerName={customer.name} />
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
              {taggedCustomers.map((c) => (
                <CustomerCard key={c.id} customer={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
