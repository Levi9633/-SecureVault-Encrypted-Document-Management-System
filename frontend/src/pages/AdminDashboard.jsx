import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import api, { getAnalytics, getUsers, getAudits, getSupabaseAudits } from '../services/api'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import GlassSurface from '../components/GlassSurface'

const COLORS = ['#34d399', '#3b82f6', '#facc15', '#ec4899', '#a855f7', '#06b6d4']

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p style={{ fontWeight: 'bold', marginBottom: '8px', color: '#fff' }}>{payload[0].payload.timeLabel || label}</p>
        {payload.map((entry, index) => {
          if (entry.name === 'SuccessCount' || entry.name === 'ErrorCount') return null; // hide from tooltip if stacked
          return (
            <p key={index} style={{ color: entry.color, margin: '4px 0', fontSize: '0.9rem' }}>
              {entry.name}: {entry.value} {entry.name.includes('Time') ? 'ms' : ''}
            </p>
          )
        })}
        {payload[0].payload.Endpoint && (
          <p style={{ color: '#9ca3af', margin: '4px 0', fontSize: '0.8rem' }}>{payload[0].payload.Endpoint}</p>
        )}
      </div>
    )
  }
  return null
}

export default function AdminDashboard() {
  const nav = useNavigate()
  const location = useLocation()
  const currentTab = location.pathname.split('/').pop() || 'analytics'

  const [stats, setStats] = useState({ total_users: 0, total_storage_bytes: 0, total_audit_events: 0 })
  const [users, setUsers] = useState([])
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [endpointFilter, setEndpointFilter] = useState('All')
  const [endpointRole, setEndpointRole] = useState('Admin')
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [analyticsMode, setAnalyticsMode] = useState('all') // 'all' | 'date'
  const [auditDateMode, setAuditDateMode] = useState('all') // 'all' | 'date'
  const [auditDate, setAuditDate] = useState(new Date().toISOString().split('T')[0])

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    fetchData()
    const isToday = selectedDate === todayStr
    let interval
    if (isToday) {
      interval = setInterval(fetchData, 60000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [selectedDate])

  const fetchData = async () => {
    try {
      const [sRes, uRes, aRes, sbRes] = await Promise.all([
        getAnalytics(),
        getUsers(),
        getAudits(),
        getSupabaseAudits()
      ])
      
      const localAudits = aRes.data || []
      const sbAuditsRaw = sbRes.data || []
      
      // Debug: log what we have
      const apiReqCount = localAudits.filter(a => a.action === 'API_REQUEST').length
      const otherCount = localAudits.filter(a => a.action !== 'API_REQUEST').length
      console.log(`[Admin] Total local audits: ${localAudits.length} | API_REQUEST: ${apiReqCount} | Other events: ${otherCount}`)
      console.log('[Admin] Sample:', localAudits[0])

      const sbAuditsFormatted = sbAuditsRaw.map(a => ({
        username: a.payload?.actor_username || a.payload?.actor_email || 'System',
        action: `Auth: ${a.payload?.action || 'Event'}`,
        details: a.payload?.log_type || '',
        timestamp: a.created_at
      }))

      const combined = [...localAudits, ...sbAuditsFormatted].sort((a, b) => 
        new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
      )

      setStats(sRes.data)
      setUsers(uRes.data)
      setAudits(combined)
    } catch (err) {
      console.error('[Admin] fetchData error:', err)
      if (err.response?.status === 403 || err.response?.status === 401) {
        setSessionExpired(true)
      }
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // ─── Date filtering (respects analyticsMode: 'all' = no filter, 'date' = filter by selectedDate) ─
  const filteredAudits = useMemo(() => {
    if (analyticsMode === 'all') return audits
    return audits.filter(a => {
      if (!a.timestamp) return false
      const d = new Date(a.timestamp).toISOString().split('T')[0]
      return d === selectedDate
    })
  }, [audits, selectedDate, analyticsMode])

  // ─── Data Science Processors (Analytics Tab) ─────────────────────────────────

  const activityData = useMemo(() => {
    const counts = {}
    for (let i = 13; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const key = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      counts[key] = { name: key, Uploads: 0, Downloads: 0, Auth: 0, Other: 0 }
    }
    audits.forEach(a => {
      if (!a.timestamp || a.action === 'API_REQUEST') return
      const key = new Date(a.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      if (counts[key]) {
        const action = a.action?.toLowerCase() || ''
        // Match FILE_ENCRYPT_UPLOAD, upload, encrypt
        if (action.includes('upload') || action.includes('encrypt'))
          counts[key].Uploads++
        // Match FILE_DECRYPT, download, decrypt
        else if (action.includes('download') || action.includes('decrypt'))
          counts[key].Downloads++
        // Auth events
        else if (action.includes('auth') || action.includes('login') || action.includes('signup'))
          counts[key].Auth++
        else
          counts[key].Other++
      }
    })
    return Object.values(counts)
  }, [audits])

  const topUsersData = useMemo(() => {
    const counts = {}
    audits.forEach(a => {
      if (a.action === 'API_REQUEST') return
      if (a.username && a.username !== 'System') {
        counts[a.username] = (counts[a.username] || 0) + 1
      }
    })
    return Object.keys(counts)
      .map(key => ({ name: key, Events: counts[key] }))
      .sort((a, b) => b.Events - a.Events)
      .slice(0, 10)
  }, [audits])

  const eventCompositionData = useMemo(() => {
    const counts = { Uploads: 0, Downloads: 0, Auth: 0, Other: 0 }
    audits.forEach(a => {
      if (a.action === 'API_REQUEST') return
      const action = a.action?.toLowerCase() || ''
      if (action.includes('upload')) counts.Uploads++
      else if (action.includes('download')) counts.Downloads++
      else if (action.includes('auth') || action.includes('login') || action.includes('signup')) counts.Auth++
      else counts.Other++
    })
    return Object.keys(counts).filter(k => counts[k] > 0).map(k => ({ name: k, value: counts[k] }))
  }, [audits])
  const userMapping = useMemo(() => {
    const mapping = {}
    users.forEach(u => {
      if (u.email && u.username) {
        const prefix = u.email.split('@')[0].toLowerCase()
        mapping[prefix] = u.username
      }
    })
    return mapping
  }, [users])

  const cleanUser = (name) => {
    if (!name) return 'Guest'
    let u = name.includes('@') ? name.split('@')[0] : name
    return userMapping[u.toLowerCase()] || u
  }

  const userActivityData = useMemo(() => {
    const data = {}
    
    filteredAudits.forEach(a => {
      const finalUser = cleanUser(a.username)
      
      const lower = finalUser.toLowerCase()
      const isSystem = ['system', 'admin', 'guest', 'unknown', 'gateway', 'service_role', 'supabase_admin'].some(s => lower === s)
      if (isSystem || lower === '') return
      
      if (!data[finalUser]) data[finalUser] = { name: finalUser, api: 0, uploads: 0, downloads: 0 }
      
      const action = (a.action || '').toUpperCase()
      let details = {}
      try { details = JSON.parse(a.details || '{}') } catch(e) {}
      const path = (details.endpoint || '').toLowerCase()

      if (action.includes('UPLOAD') || path.includes('/upload')) {
        data[finalUser].uploads++
      } else if (action.includes('DECRYPT') || action.includes('DOWNLOAD') || path.includes('/download')) {
        data[finalUser].downloads++
      } else if (action === 'API_REQUEST') {
        data[finalUser].api++
      } else {
        // Any other action (Auth, Encrypt, etc.) counts as an API interaction
        data[finalUser].api++
      }
    })
    
    return Object.values(data)
      .sort((a, b) => (b.api + b.uploads + b.downloads) - (a.api + a.uploads + a.downloads))
      .slice(0, 12)
  }, [filteredAudits, userMapping])

  const userActivityTimeData = useMemo(() => {
    const userBuckets = {} 
    
    filteredAudits.forEach(a => {
      const finalUser = cleanUser(a.username)

      if (['system', 'guest', 'unknown', 'service_role', 'supabase_admin'].some(s => finalUser.toLowerCase() === s)) return
      
      const ts = new Date(a.timestamp).getTime()
      if (isNaN(ts)) return
      
      const bucket = Math.floor(ts / (5 * 60 * 1000)) 
      if (!userBuckets[finalUser]) userBuckets[finalUser] = new Set()
      userBuckets[finalUser].add(bucket)
    })
    
    return Object.keys(userBuckets).map(user => ({
      name: user,
      value: userBuckets[user].size * 5
    })).sort((a,b) => b.value - a.value).slice(0, 8)
  }, [filteredAudits, userMapping])


  // ─── API Gateway Processors (API Tab) ────────────────────────────────────────

  const apiLogs = useMemo(() => {
    return filteredAudits.map(a => {
      let data = {}
      try { data = JSON.parse(a.details) } catch(e){}
      
      // Map non-API events (Encrypt, Decrypt, Auth) into pseudo-endpoints
      if (a.action !== 'API_REQUEST') {
         const pseudoEndpoint = `/${a.action.toLowerCase().replace(/: /g, '/').replace(/ /g, '_')}`
         return {
           ...a,
           ...data,
           endpoint: data.endpoint || pseudoEndpoint,
           status: data.status || (a.status === 'SUCCESS' ? 200 : 400),
           ms: data.ms || 0
         }
      }
      
      return { ...a, ...data }
    }).filter(a => a.endpoint)
  }, [filteredAudits])

  const [usersList, setUsersList] = useState([])
  const [userLoading, setUserLoading] = useState(false)

  const fetchUsers = async () => {
    setUserLoading(true)
    try {
      const res = await api.get('/admin/users')
      console.log('[Admin] Users List fetched:', res.data)
      setUsersList(res.data)
    } catch (e) {
      console.error('Failed to fetch users:', e)
    } finally {
      setUserLoading(false)
    }
  }

  useEffect(() => {
    if (currentTab === 'users') fetchUsers()
  }, [currentTab])

  const handleDeleteUser = async (uid) => {
    if (!uid) return alert('Invalid User ID')
    if (!window.confirm('Are you sure you want to PERMANENTLY delete this user? This cannot be undone.')) return
    try {
      await api.delete(`/admin/users/${uid}`)
      fetchUsers()
    } catch (e) {
      alert('Delete failed: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleToggleBlock = async (uid, currentStatus) => {
    if (!uid) return alert('Invalid User ID')
    const action = currentStatus ? 'unblock' : 'block'
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return
    try {
      await api.post(`/admin/users/${uid}/toggle-block?block=${!currentStatus}`)
      fetchUsers()
    } catch (e) {
      alert('Action failed: ' + (e.response?.data?.detail || e.message))
    }
  }

  const apiStats = useMemo(() => {
    if (apiLogs.length === 0) return { req: 0, successRate: '0.0', lq: 0, median: 0, uq: 0 }
    
    const req = apiLogs.length
    const successes = apiLogs.filter(a => a.status < 400).length
    const successRate = ((successes / req) * 100).toFixed(1)
    
    const times = apiLogs.map(a => a.ms || 0).sort((a,b) => a - b)
    const lq = times[Math.floor(times.length * 0.25)] || 0
    const median = times[Math.floor(times.length * 0.5)] || 0
    const uq = times[Math.floor(times.length * 0.75)] || 0
    
    return { req, successRate, lq, median, uq }
  }, [apiLogs])

  const apiChartData = useMemo(() => {
    if (apiLogs.length === 0) return []
    const reqs = apiLogs.filter(a => a.action === 'API_REQUEST' && (a.ms ?? 0) > 0)
    if (reqs.length === 0) return []
    const times = reqs.map(a => new Date(a.timestamp).getTime()).filter(t => !isNaN(t))
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const spanMs = maxTime - minTime
    const groupMs = Math.max(10 * 1000, spanMs / 50)
    const buckets = {}
    reqs.forEach(a => {
      const tsRaw = new Date(a.timestamp).getTime()
      if (isNaN(tsRaw)) return
      const ts = Math.floor(tsRaw / groupMs) * groupMs
      if (!buckets[ts]) {
        const d = new Date(ts)
        let timeLabel = ''
        if (groupMs < 60000) timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        else if (groupMs < 86400000) timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        else timeLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        buckets[ts] = { ts, timeLabel, totalMs: 0, count: 0, worstStatus: 200, endpoints: new Set() }
      }
      buckets[ts].totalMs += a.ms
      buckets[ts].count += 1
      const status = a.status || 200
      if (status > buckets[ts].worstStatus) buckets[ts].worstStatus = status
      if (a.endpoint) buckets[ts].endpoints.add(a.endpoint)
    })
    return Object.values(buckets).sort((a, b) => a.ts - b.ts).map(b => ({
      timeLabel: b.timeLabel,
      ResponseTime: Math.round(b.totalMs / b.count),
      Status: b.worstStatus,
      Endpoint: Array.from(b.endpoints).slice(0, 2).join(', ') + (b.endpoints.size > 2 ? '...' : '') || 'API Call'
    }))
  }, [apiLogs])

  const activityChartData = useMemo(() => {
    if (apiLogs.length === 0) return []

    // Use apiLogs which already has status correctly parsed from details JSON
    const times = apiLogs.map(a => new Date(a.timestamp).getTime()).filter(t => !isNaN(t))
    if (times.length === 0) return []
    
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const spanMs = maxTime - minTime
    
    // Minimum 10 seconds grouping, otherwise divide span into ~50 bars
    const groupMs = Math.max(10 * 1000, spanMs / 50)

    const buckets = {}
    apiLogs.forEach(a => {
      const tsRaw = new Date(a.timestamp).getTime()
      if (isNaN(tsRaw)) return
      const ts = Math.floor(tsRaw / groupMs) * groupMs
      
      if (!buckets[ts]) {
        const d = new Date(ts)
        let timeLabel = ''
        if (groupMs < 60 * 1000) timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        else if (groupMs < 24 * 60 * 60 * 1000) timeLabel = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        else timeLabel = d.toLocaleDateString([], { month: 'short', day: 'numeric' })
        buckets[ts] = { ts, timeLabel, SuccessCount: 0, ErrorCount: 0 }
      }
      // a.status is already the HTTP integer (e.g. 200, 400, 500) — no re-parsing needed
      const status = a.status || 200
      const isError = status >= 400
      if (isError) buckets[ts].ErrorCount++
      else buckets[ts].SuccessCount++
    })
    
    return Object.values(buckets).sort((a, b) => a.ts - b.ts)
  }, [apiLogs])
  const endpointData = useMemo(() => {
    const counts = {}
    apiLogs.forEach(a => {
      const endpoint = a.endpoint || 'Unknown'
      const status = a.status || 200
      
      const epLower = endpoint.toLowerCase()
      
      let isFiles = epLower.includes('upload') || epLower.includes('download') || epLower.includes('files') || epLower.includes('bucket')
      let isAdmin = epLower.includes('admin') || epLower.includes('users') || epLower.includes('audits') || epLower.includes('analytics')
      let isUser = !isAdmin && !isFiles && (epLower.includes('auth') || epLower.includes('login') || epLower.includes('logout') || epLower.includes('encrypt') || epLower.includes('decrypt') || epLower.includes('dashboard') || epLower.includes('vault'))
      
      if (!isAdmin && !isFiles && !isUser) {
         isUser = true 
      }

      if (endpointRole === 'Admin' && !isAdmin) return
      if (endpointRole === 'User' && !isUser) return

      let type = 'Success'
      let color = '#34d399' // Green
      if (status >= 300 && status < 400) { type = 'Redirect'; color = '#facc15' } // Yellow
      else if (status >= 400 && status < 500) { type = 'Client'; color = '#3b82f6' } // Blue
      else if (status >= 500) { type = 'Server'; color = '#ef4444' } // Red
      
      const key = `${endpoint}-${type}`
      if (!counts[key]) counts[key] = { endpoint, type, color, count: 0 }
      counts[key].count++
    })
    
    let filtered = Object.values(counts)
    if (endpointFilter !== 'All') {
      filtered = filtered.filter(x => x.type === endpointFilter)
    }
    
    return filtered.sort((a, b) => b.count - a.count).slice(0, 15) // Top 15
  }, [apiLogs, endpointFilter, endpointRole])


  if (loading) {
    return <div className="page"><h2 style={{ textAlign: 'center' }}>Loading Admin Panel...</h2></div>
  }

  if (sessionExpired) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ textAlign: 'center', background: '#161616', border: '1px solid #ef4444', borderRadius: '12px', padding: '3rem', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
          <h2 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Session Expired</h2>
          <p style={{ color: '#9ca3af', marginBottom: '2rem', fontSize: '0.9rem' }}>
            Your admin session has expired or become invalid. Please log in again to continue.
          </p>
          <button
            onClick={() => { sessionStorage.removeItem('session'); nav('/login') }}
            style={{ background: '#34d399', color: '#000', border: 'none', borderRadius: '8px', padding: '0.75rem 2rem', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', width: '100%' }}>
            🔑 Log In Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ 
      maxWidth: '1400px', 
      margin: '0 auto', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      overflow: 'hidden',
      padding: '0 2rem'
    }}>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2d2d2d; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3d3d3d; }
      `}</style>

      <div className="header" style={{ margin: '1.5rem 0', paddingBottom: '1rem', borderBottom: '1px solid #2d2d2d', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', letterSpacing: '-0.03em' }}>&#x1F6E0; Admin Control Panel</h1>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.85rem' }}>
            {currentTab === 'analytics'
              ? analyticsMode === 'all'
                ? `All-time overview · ${audits.length} total events`
                : (selectedDate === todayStr
                    ? `Today · ${filteredAudits.length} events`
                    : `${new Date(selectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${filteredAudits.length} events`)
              : 'System Administration'
            }
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {currentTab === 'analytics' && (
            <>
              {/* Date picker — always visible; picking a date activates date filter */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <label style={{ fontSize: '0.7rem', color: '#52525b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Filter by Date</label>
                <input
                  type="date"
                  value={analyticsMode === 'date' ? selectedDate : ''}
                  max={todayStr}
                  onChange={e => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value)
                      setAnalyticsMode('date')
                    } else {
                      setAnalyticsMode('all')
                    }
                  }}
                  style={{ background: '#161616', color: analyticsMode === 'date' ? '#fff' : '#52525b', border: `1px solid ${analyticsMode === 'date' ? '#34d399' : '#2d2d2d'}`, borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', outline: 'none', transition: 'all 0.2s' }}
                />
              </div>
              {/* Clear pill — only shown when a date is active */}
              {analyticsMode === 'date' && (
                <button
                  onClick={() => setAnalyticsMode('all')}
                  style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)', borderRadius: '8px', padding: '0.4rem 0.85rem', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  × All Time
                </button>
              )}
            </>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => nav('/dashboard')} style={{ width: 'auto', borderRadius: '8px', padding: '0.5rem 1.25rem' }}>
            &#8592; Back to Dashboard
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
      {/* ─── Global Analytics Tab ─────────────────────────────────────────────── */}
      {currentTab === 'analytics' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '320px 1fr', 
          gap: '1rem', 
          paddingBottom: '2rem',
          alignItems: 'stretch'
        }}>

          {/* ── TOP LEFT: Stats + Endpoints ─────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', gridColumn: '1', gridRow: '1' }}>

            {/* Row 1: Lightning + Success Rate */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '2.8rem' }}>⚡</span>
              </div>
              <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '4px' }}>Success rate</div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#facc15' }}>{apiStats.successRate}%</div>
                <div style={{ marginTop: '6px', height: '6px', background: '#2d2d2d', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${apiStats.successRate}%`, background: 'linear-gradient(90deg, #34d399, #facc15)', borderRadius: '3px' }} />
                </div>
              </div>
            </div>

            {/* Row 2: Requests + Users */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Requests</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#fff', marginTop: '4px' }}>{apiStats.req.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#34d399', marginTop: '4px' }}>↑ API calls total</div>
              </div>
              <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Users</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: '#fff', marginTop: '4px' }}>{stats.total_users.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#34d399', marginTop: '4px' }}>↑ Registered</div>
              </div>
            </div>

            {/* Response Times */}
            <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '0.75rem' }}>Response times <span style={{ color: '#52525b' }}>(ms)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#34d399' }}>{apiStats.lq}</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>LQ</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#34d399' }}>{apiStats.median}</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Median</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#facc15' }}>{apiStats.uq}</div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>UQ</div>
                </div>
              </div>
              {/* Gradient bar: green → yellow → red */}
              <div style={{ height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #34d399 0%, #34d399 60%, #facc15 80%, #ef4444 100%)' }} />
            </div>

            {/* Endpoints List */}
            <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                {/* Animated Role Toggle */}
                <div style={{ 
                  display: 'flex', 
                  background: '#0a0a0a', 
                  borderRadius: '6px', 
                  padding: '2px', 
                  position: 'relative',
                  border: '1px solid #2d2d2d',
                  width: '120px',
                  height: '28px'
                }}>
                  {/* Sliding Background Indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '2px',
                    left: endpointRole === 'User' ? '2px' : 'calc(50% + 1px)',
                    width: 'calc(50% - 3px)',
                    height: 'calc(100% - 4px)',
                    background: '#34d399',
                    borderRadius: '4px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0,
                    boxShadow: '0 0 10px rgba(52, 211, 153, 0.4)'
                  }} />
                  
                  <button 
                    onClick={() => setEndpointRole('User')} 
                    style={{ 
                      flex: 1,
                      background: 'none', 
                      border: 'none', 
                      color: endpointRole === 'User' ? '#000' : '#52525b', 
                      fontWeight: endpointRole === 'User' ? '800' : '600',
                      cursor: 'pointer', 
                      zIndex: 1,
                      fontSize: '0.75rem',
                      transition: 'color 0.2s'
                    }}
                  >
                    User
                  </button>
                  <button 
                    onClick={() => setEndpointRole('Admin')} 
                    style={{ 
                      flex: 1,
                      background: 'none', 
                      border: 'none', 
                      color: endpointRole === 'Admin' ? '#000' : '#52525b', 
                      fontWeight: endpointRole === 'Admin' ? '800' : '600',
                      cursor: 'pointer', 
                      zIndex: 1,
                      fontSize: '0.75rem',
                      transition: 'color 0.2s'
                    }}
                  >
                    Admin
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {['All', 'Success', 'Bad', 'Error'].map(f => {
                    const filterMap = { All: 'All', Success: 'Success', Bad: 'Client', Error: 'Server' }
                    const active = endpointFilter === filterMap[f]
                    const colors = { All: '#34d399', Success: '#34d399', Bad: '#3b82f6', Error: '#ef4444' }
                    return (
                      <button key={f} onClick={() => setEndpointFilter(filterMap[f])}
                        style={{ background: active ? colors[f] : '#242424', color: active ? '#000' : '#9ca3af', border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', cursor: 'pointer', fontWeight: active ? 'bold' : 'normal' }}>
                        {f}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '260px', overflowY: 'auto', paddingRight: '2px' }} className="custom-scrollbar">
                {endpointData.length === 0 && <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>No data yet — make some requests!</div>}
                {endpointData.map((d, i) => {
                  const max = Math.max(...endpointData.map(x => x.count)) || 1
                  const w = (d.count / max) * 100
                  return (
                    <div key={i} style={{ position: 'relative', height: '26px', background: '#242424', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${w}%`, background: d.color, opacity: 0.2 }} />
                      <div style={{ position: 'relative', zIndex: 1, padding: '0 8px', display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 'bold', color: d.color, minWidth: '28px' }}>{d.count}</span>
                        <span style={{ fontSize: '0.75rem', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.endpoint}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── BOTTOM LEFT: Event Composition Pie Chart ─────────────────── */}
          <div style={{ gridColumn: '1', gridRow: '2', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              flex: 1,
              background: '#161616',
              border: '1px solid #2d2d2d',
              borderRadius: '8px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '300px',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '600' }}>Event Composition</div>
                  <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '2px' }}>
                    {analyticsMode === 'all' ? 'All-time breakdown' : `Breakdown for ${selectedDate}`}
                  </div>
                </div>
                {(() => {
                  const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fff', lineHeight: 1 }}>{total}</div>
                      <div style={{ fontSize: '0.68rem', color: '#52525b', marginTop: '2px' }}>total events</div>
                    </div>
                  )
                })()}
              </div>

              {/* Donut chart */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {eventCompositionData.length > 0 ? (() => {
                    const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                    const PIE_COLORS = { Uploads: '#34d399', Downloads: '#3b82f6', Auth: '#facc15', Other: '#a855f7' }
                    return (
                      <PieChart>
                        <Pie
                          data={eventCompositionData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                          animationDuration={900}
                          animationEasing="ease-out"
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                            if (percent < 0.05) return null
                            const RADIAN = Math.PI / 180
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                            const x = cx + radius * Math.cos(-midAngle * RADIAN)
                            const y = cy + radius * Math.sin(-midAngle * RADIAN)
                            return (
                              <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
                                {`${(percent * 100).toFixed(0)}%`}
                              </text>
                            )
                          }}
                          labelLine={false}
                        >
                          {eventCompositionData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PIE_COLORS[entry.name] || COLORS[index % COLORS.length]} stroke="#161616" strokeWidth={2} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null
                            const entry = payload[0]
                            const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                            const pct = total > 0 ? ((entry.value / total) * 100).toFixed(1) : 0
                            const color = { Uploads: '#34d399', Downloads: '#3b82f6', Auth: '#facc15', Other: '#a855f7' }[entry.name] || '#fff'
                            return (
                              <div style={{ background: '#1e1e1e', border: `1px solid ${color}`, padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fff', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
                                <div style={{ color, fontWeight: 'bold', marginBottom: '4px' }}>{entry.name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                  <span style={{ color: '#9ca3af' }}>Count</span>
                                  <span style={{ fontWeight: 'bold' }}>{entry.value}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                                  <span style={{ color: '#9ca3af' }}>Share</span>
                                  <span style={{ fontWeight: 'bold' }}>{pct}%</span>
                                </div>
                              </div>
                            )
                          }}
                        />
                      </PieChart>
                    )
                  })() : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '0.8rem' }}>No events yet</div>
                  )}
                </ResponsiveContainer>
              </div>

              {/* Legend with values and percentages */}
              {(() => {
                const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                const PIE_COLORS = { Uploads: '#34d399', Downloads: '#3b82f6', Auth: '#facc15', Other: '#a855f7' }
                return (
                  <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {eventCompositionData.map((d, i) => {
                      const color = PIE_COLORS[d.name] || COLORS[i % COLORS.length]
                      const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : 0
                      const barW = total > 0 ? (d.value / total) * 100 : 0
                      return (
                        <div key={i}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: color, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.75rem', color: '#e5e7eb', fontWeight: '500' }}>{d.name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: '#52525b' }}>{pct}%</span>
                              <span style={{ fontSize: '0.75rem', color: color, fontWeight: 'bold', minWidth: '24px', textAlign: 'right' }}>{d.value}</span>
                            </div>
                          </div>
                          <div style={{ height: '3px', background: '#2d2d2d', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: color, borderRadius: '2px', transition: 'width 0.8s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* ── TOP RIGHT: API Performance ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gridColumn: '2', gridRow: '1', minWidth: 0 }}>
            {/* API Performance Block — stretches to fill row height */}
            <div style={{ flex: 1, background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Activity Chart */}
              <div>
                {/* Header with live stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '500' }}>Activity (Requests)</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>
                      ✓ {activityChartData.reduce((s, d) => s + (d.SuccessCount || 0), 0)} ok
                    </span>
                    <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                      ✗ {activityChartData.reduce((s, d) => s + (d.ErrorCount || 0), 0)} err
                    </span>
                  </div>
                </div>
                <div style={{ height: '140px', minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityChartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }} barCategoryGap={2}>
                      <YAxis stroke="#2d2d2d" tick={{ fill: '#fff', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0]?.payload
                        const total = (d?.SuccessCount || 0) + (d?.ErrorCount || 0)
                        const successRate = total > 0 ? ((d?.SuccessCount / total) * 100).toFixed(0) : 0
                        const fullTime = d?.ts ? new Date(d.ts).toLocaleString('en-US', {
                          month: 'numeric', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
                        }) : d?.timeLabel
                        return (
                          <div style={{ background: '#1e1e1e', border: '1px solid #2d2d2d', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#fff', minWidth: '170px' }}>
                            <div style={{ color: '#9ca3af', marginBottom: '6px', fontSize: '0.75rem' }}>{fullTime}</div>
                            <div style={{ color: '#34d399', fontWeight: 'bold', marginBottom: '2px' }}>{d?.SuccessCount || 0} Success</div>
                            {(d?.ErrorCount || 0) > 0 && <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '2px' }}>{d?.ErrorCount} Errors</div>}
                            <div style={{ color: '#fff', marginTop: '4px', borderTop: '1px solid #2d2d2d', paddingTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Total: <strong>{total}</strong></span>
                              <span style={{ color: successRate >= 90 ? '#34d399' : successRate >= 70 ? '#facc15' : '#ef4444' }}>{successRate}% ok</span>
                            </div>
                          </div>
                        )
                      }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="SuccessCount" stackId="a" fill="#34d399" radius={[0,0,0,0]} animationDuration={1000} />
                      <Bar dataKey="ErrorCount" stackId="a" fill="#ef4444" radius={[2,2,0,0]} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.72rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                    <span style={{ width: '10px', height: '10px', background: '#34d399', borderRadius: '2px', display: 'inline-block' }} /> Success
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                    <span style={{ width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', display: 'inline-block' }} /> Errors
                  </span>
                </div>
              </div>

              {/* Response Time Chart */}
              <div>
                <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '500', marginBottom: '0.5rem' }}>Response time</div>
                <div style={{ height: '140px', minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }} barCategoryGap={2}>
                      <YAxis stroke="#2d2d2d" tick={{ fill: '#fff', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={({ active, payload }) => active && payload?.length ? (
                        <div style={{ background: '#1e1e1e', border: '1px solid #2d2d2d', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#fff' }}>
                          <div style={{ color: '#9ca3af', marginBottom: '4px' }}>{payload[0]?.payload?.timeLabel}</div>
                          <div style={{ color: '#3b82f6', fontWeight: 'bold', marginBottom: '2px' }}>{payload[0]?.payload?.ResponseTime}ms</div>
                          <div style={{ color: '#34d399' }}>Status: {payload[0]?.payload?.Status}</div>
                          <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{payload[0]?.payload?.Endpoint}</div>
                        </div>
                      ) : null} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="ResponseTime" fill="#3b82f6" radius={[2,2,0,0]} animationDuration={800} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Success Rate Strip */}
              <div>
                <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '500', marginBottom: '0.5rem' }}>Success rate</div>
                <div style={{ display: 'flex', width: '100%', height: '28px', gap: '1px', borderRadius: '4px', overflow: 'hidden' }}>
                  {apiChartData.length === 0 && <div style={{ color: '#52525b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', paddingLeft: '8px' }}>Waiting for requests...</div>}
                  {apiChartData.map((d, i) => {
                    let bg = '#34d399'
                    if (d.Status >= 500) bg = '#ef4444'
                    else if (d.Status >= 400) bg = '#facc15'
                    else if (d.Status >= 300) bg = '#3b82f6'
                    return <div key={i} style={{ flex: 1, background: bg }} title={`${d.Status} · ${d.Endpoint} · ${d.ResponseTime}ms`} />
                  })}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  {[['#34d399','2xx Success'],['#3b82f6','3xx Redirect'],['#facc15','4xx Client'],['#ef4444','5xx Server']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: c }} />
                      <span style={{ fontSize: '0.7rem', color: '#fff' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── BOTTOM RIGHT: User Engagement + 14-day Trend ──────────────── */}
          <div style={{ gridColumn: '2', gridRow: '2', display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>

            {/* 14-day Activity Trend */}
            <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '600' }}>14-Day Activity Trend</div>
                  <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '2px' }}>Per-day file operations and auth events</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem' }}>
                  {[
                    ['#34d399', 'Uploads'],
                    ['#3b82f6', 'Downloads'],
                    ['#facc15', 'Auth'],
                    ['#a855f7', 'Other']
                  ].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#9ca3af' }}>
                      <span style={{ width: '10px', height: '10px', background: c, borderRadius: '3px', display: 'inline-block', flexShrink: 0 }} />
                      <span>{l}</span>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ height: '150px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {activityData.some(d => d.Uploads + d.Downloads + d.Auth + d.Other > 0) ? (
                    <BarChart data={activityData} margin={{ top: 4, right: 0, left: -20, bottom: 0 }} barCategoryGap="20%" barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#52525b', fontSize: 10 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#52525b', fontSize: 10 }} allowDecimals={false} />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const total = payload.reduce((s, p) => s + (p.value || 0), 0)
                          return (
                            <div style={{ background: '#1e1e1e', border: '1px solid #2d2d2d', padding: '10px 14px', borderRadius: '8px', fontSize: '0.78rem', color: '#fff', minWidth: '140px' }}>
                              <div style={{ color: '#9ca3af', marginBottom: '6px', fontWeight: 'bold', borderBottom: '1px solid #2d2d2d', paddingBottom: '4px' }}>{label}</div>
                              {payload.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '3px' }}>
                                  <span style={{ color: p.fill, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ width: '8px', height: '8px', background: p.fill, borderRadius: '2px', display: 'inline-block' }} />
                                    {p.name}
                                  </span>
                                  <span style={{ fontWeight: 'bold' }}>{p.value}</span>
                                </div>
                              ))}
                              <div style={{ borderTop: '1px solid #2d2d2d', marginTop: '4px', paddingTop: '4px', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Total</span><span style={{ fontWeight: 'bold' }}>{total}</span>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="Uploads" fill="#34d399" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Downloads" fill="#3b82f6" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Auth" fill="#facc15" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Other" fill="#a855f7" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                    </BarChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '0.8rem' }}>No events in the last 14 days</div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Engagement (Grouped Bar Chart) */}
            <div style={{ 
                flex: 1,
                background: '#161616', 
                border: '1px solid #2d2d2d', 
                borderRadius: '12px', 
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease',
                minHeight: '220px'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', letterSpacing: '-0.02em' }}>User Engagement</h3>
                  <p style={{ margin: '3px 0 0', color: '#71717a', fontSize: '0.75rem' }}>
                    {analyticsMode === 'all' ? 'All-time per-user breakdown' : `Breakdown for ${selectedDate}`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', background: '#0a0a0a', padding: '6px 12px', borderRadius: '8px', border: '1px solid #2d2d2d' }}>
                  {[['#34d399','API'],['#3b82f6','Uploads'],['#a855f7','Downloads']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '7px', height: '7px', background: c, borderRadius: '50%' }} />
                      <span style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {userActivityData.length > 0 ? (
                    <BarChart data={userActivityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71717a', fontSize: 10 }} />
                      <RechartsTooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div style={{ background: '#1e1e1e', border: '1px solid #3b82f6', padding: '10px', borderRadius: '8px', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
                                <p style={{ margin: '0 0 8px', fontWeight: '600', color: '#fff', fontSize: '0.85rem', borderBottom: '1px solid #2d2d2d', paddingBottom: '5px' }}>{label}</p>
                                {[['API Hits','#34d399',0],['Uploads','#3b82f6',1],['Downloads','#a855f7',2]].map(([name, color, idx]) => (
                                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '3px' }}>
                                    <span style={{ color, fontSize: '0.78rem' }}>{name}</span>
                                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.78rem' }}>{payload[idx]?.value ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="api" fill="#34d399" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                      <Bar dataKey="uploads" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                      <Bar dataKey="downloads" fill="#a855f7" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                    </BarChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', border: '1px dashed #2d2d2d', borderRadius: '8px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
                        <div style={{ fontSize: '0.85rem' }}>
                          {analyticsMode === 'date' ? `No activity on ${selectedDate}` : 'No user activity logged yet'}
                        </div>
                        {analyticsMode === 'date' && (
                          <button onClick={() => setAnalyticsMode('all')} style={{ marginTop: '8px', background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)', borderRadius: '6px', padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer' }}>Switch to All Time</button>
                        )}
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
    )}

      {/* ─── API Gateway Tab ──────────────────────────────────────────────────── */}

      {currentTab === 'api' && (
        <div className="supa-dashboard">
          <div className="supa-grid" style={{ gridTemplateColumns: '400px 1fr' }}>
            
            {/* Left side: Endpoints List */}
            <div className="supa-card" style={{ padding: '1rem', background: '#18181b', border: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#e5e7eb', fontSize: '1.1rem', fontWeight: '500' }}>Endpoints</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['All', 'Success', 'Redirect', 'Client', 'Server'].map(f => (
                    <button 
                      key={f}
                      onClick={() => setEndpointFilter(f)}
                      style={{ 
                        background: endpointFilter === f ? (f === 'All' ? '#34d399' : '#27272a') : '#1e1e1e',
                        color: endpointFilter === f ? (f === 'All' ? '#000' : '#fff') : '#71717a',
                        border: 'none', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', cursor: 'pointer',
                        fontWeight: endpointFilter === f ? 'bold' : 'normal'
                      }}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {endpointData.length > 0 ? endpointData.map((d, i) => {
                  const maxCount = Math.max(...endpointData.map(x => x.count)) || 1;
                  const widthPct = (d.count / maxCount) * 100;
                  return (
                    <div key={i} style={{ position: 'relative', width: '100%', height: '30px', background: '#242424', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${widthPct}%`, background: d.color, opacity: 0.85 }} />
                      <div style={{ position: 'relative', zIndex: 1, padding: '0 10px', color: '#000', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', gap: '8px', width: '100%' }}>
                        <span style={{ minWidth: '25px', color: widthPct > 15 ? '#000' : d.color }}>{d.count}</span>
                        <span style={{ color: widthPct > 15 ? 'rgba(0,0,0,0.7)' : '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.endpoint}</span>
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ color: '#52525b', fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>No endpoints found for this filter.</div>
                )}
              </div>
            </div>

            {/* Right side: Stats & Charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Stat Boxes Row */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="supa-stat" style={{ background: '#1e1e1e', alignItems: 'center', padding: '1rem', flex: '0 0 100px' }}>
                  <div style={{ fontSize: '2.5rem', color: '#34d399' }}>⚡</div>
                </div>
                <div className="supa-stat" style={{ background: '#1e1e1e', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Success rate</div>
                  <div className="supa-stat-value" style={{ color: '#34d399', fontSize: '1.5rem' }}>{apiStats.successRate}%</div>
                </div>
                <div className="supa-stat" style={{ background: '#1e1e1e', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Requests</div>
                  <div className="supa-stat-value" style={{ color: '#fff', fontSize: '1.5rem' }}>{apiStats.req}</div>
                </div>
                <div className="supa-stat" style={{ background: '#1e1e1e', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Users</div>
                  <div className="supa-stat-value" style={{ color: '#fff', fontSize: '1.5rem' }}>{stats.total_users}</div>
                </div>
              </div>

              {/* Response Time Stats Row */}
              <div className="supa-card" style={{ padding: '1rem' }}>
                <div className="supa-stat-label">Response times (ms)</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>{apiStats.lq}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>LQ</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>{apiStats.median}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Median</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#34d399' }}>{apiStats.uq}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>UQ</div>
                  </div>
                </div>
              </div>
              
              {/* Activity Chart Row */}
              <div className="supa-card" style={{ padding: '1rem' }}>
                <div className="supa-stat-label">Activity</div>
                <div style={{ height: '120px', width: '100%', marginTop: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <XAxis dataKey="name" hide />
                      <YAxis stroke="#52525b" tick={{fill: '#9ca3af', fontSize: 10}} axisLine={false} tickLine={false} allowDecimals={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#242424' }} />
                      <Bar dataKey="Requests" fill="#34d399" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Response Time Chart Row */}
              <div className="supa-card" style={{ padding: '1rem' }}>
                <div className="supa-stat-label">Response time (ms)</div>
                <div style={{ height: '120px', width: '100%', marginTop: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <XAxis dataKey="name" hide />
                      <YAxis stroke="#52525b" tick={{fill: '#9ca3af', fontSize: 10}} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#242424' }} />
                      <Bar dataKey="ResponseTime" fill="#6b7280" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Success Rate Row */}
              <div className="supa-card" style={{ padding: '1rem' }}>
                <div className="supa-stat-label">Success rate</div>
                <div style={{ display: 'flex', width: '100%', height: '24px', gap: '1px', marginTop: '0.5rem' }}>
                  {apiChartData.map((d, i) => (
                    <div key={i} style={{ flex: 1, background: d.Status < 400 ? '#34d399' : '#facc15' }} title={`${d.Status} - ${d.Endpoint} (${d.ResponseTime}ms)`} />
                  ))}
                  {apiChartData.length === 0 && <div style={{ color: '#52525b', fontSize: '0.8rem', fontStyle: 'italic' }}>Waiting for requests...</div>}
                </div>
              </div>

            </div>
            
            {/* Supabase-style Log Explorer */}
            <div className="supa-card" style={{ gridColumn: '1 / -1', padding: '0', background: '#161616', overflow: 'hidden', border: '1px solid #2d2d2d' }}>
              {/* Stacked Chart Top */}
              <div style={{ height: '120px', width: '100%', padding: '1rem 1rem 0 1rem', borderBottom: '1px solid #2d2d2d' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Bar dataKey="ErrorCount" stackId="a" fill="#facc15" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="SuccessCount" stackId="a" fill="#34d399" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              
              {/* Log List Bottom */}
              <div style={{ maxHeight: '450px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  <tbody>
                    {[...apiLogs].reverse().map((log, i) => {
                       let method = "GET"; let path = log.endpoint || "Unknown";
                       if (log.endpoint && log.endpoint.includes(' ')) {
                          const parts = log.endpoint.split(' ');
                          method = parts[0]; path = parts.slice(1).join(' ');
                       }
                       const sCode = log.status || 200;
                       let sColor = '#34d399'; let sBg = 'rgba(52, 211, 153, 0.15)';
                       if (sCode >= 500) { sColor = '#ef4444'; sBg = 'rgba(239, 68, 68, 0.15)'; }
                       else if (sCode >= 400) { sColor = '#facc15'; sBg = 'rgba(250, 204, 21, 0.15)'; }
                       else if (sCode >= 300) { sColor = '#3b82f6'; sBg = 'rgba(59, 130, 246, 0.15)'; }
                       
                       const logDate = log.timestamp ? new Date(log.timestamp) : new Date();
                       const formattedDate = `${logDate.getDate()} ${logDate.toLocaleString('default', {month: 'short'})} ${logDate.getFullYear().toString().substr(-2)} ${logDate.getHours().toString().padStart(2,'0')}:${logDate.getMinutes().toString().padStart(2,'0')}:${logDate.getSeconds().toString().padStart(2,'0')}`;
                       
                       return (
                        <tr key={i} style={{ borderBottom: '1px solid #242424', color: '#a1a1aa' }}>
                          <td style={{ padding: '8px 16px', width: '220px', whiteSpace: 'nowrap' }}>
                             {formattedDate}
                          </td>
                          <td style={{ padding: '8px', width: '80px', textAlign: 'center' }}>
                             <span style={{ color: sColor, background: sBg, padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{sCode}</span>
                          </td>
                          <td style={{ padding: '8px', width: '60px', color: '#d4d4d8', fontWeight: 'bold' }}>{method}</td>
                          <td style={{ padding: '8px' }}>{path}</td>
                        </tr>
                       )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}



      {/* ─── Manage Users Tab ─────────────────────────────────────────────────── */}
      {currentTab === 'users' && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>User Management</h2>
              <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.85rem' }}>Detailed user activity and resource allocation</p>
            </div>
            <button className="btn btn-outline btn-sm" onClick={fetchUsers} disabled={userLoading} style={{ borderRadius: '8px' }}>
              {userLoading ? 'Refreshing...' : '🔄 Refresh Data'}
            </button>
          </div>

          <div style={{ 
            position: 'relative', 
            borderRadius: '16px', 
            overflow: 'hidden', 
            height: '600px', 
            display: 'flex', 
            flexDirection: 'column' 
          }}>
            <GlassSurface width="100%" height="100%" borderRadius={16} blur={20} opacity={0.03} brightness={110}>
              <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }} className="custom-scrollbar">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ 
                  borderBottom: '1.5px solid rgba(255,255,255,1)', 
                  background: 'rgba(255,255,255,0.05)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10
                }}>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Files</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Requests</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Uploads</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Downloads</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quota</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Storage Usage</th>
                  <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((user, idx) => (
                  <tr key={idx} style={{ borderBottom: '0.6px solid rgba(255,255,255,0.3)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '700', fontSize: '1rem' }}>{user.username}</div>
                      <div style={{ color: '#a3a3a3', fontSize: '0.75rem' }}>{user.email}</div>
                    </td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.files_count}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.total_requests}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.uploads}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.downloads}</td>
                    <td style={{ padding: '1.2rem', color: '#a3a3a3', fontWeight: '600' }}>50.00 MB</td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '700', marginBottom: '8px', fontSize: '0.9rem' }}>{(user.storage_used / (1024 * 1024)).toFixed(2)} MB</div>
                      <div style={{ 
                        height: '10px', 
                        width: '100px', 
                        background: '#000000', 
                        borderRadius: '5px', 
                        border: '0.6px solid #ffffff',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        <div style={{ 
                          height: '100%', 
                          width: `${Math.min(100, (user.storage_used / user.storage_limit) * 100)}%`, 
                          background: '#ffffff',
                          borderRadius: '0'
                        }} />
                      </div>
                    </td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleToggleBlock(user.id, user.is_blocked)}
                          style={{ 
                            background: 'rgba(255,255,255,0.05)', 
                            backdropFilter: 'blur(10px)',
                            border: '1px solid #ffffff', 
                            color: '#fff', 
                            padding: '8px 14px', 
                            borderRadius: '8px', 
                            fontSize: '0.75rem', 
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                          {user.is_blocked ? '🔓 UNBLOCK' : '🚫 BLOCK'}
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          style={{ 
                            background: 'rgba(239, 68, 68, 0.1)', 
                            border: '1px solid #ef4444', 
                            color: '#ef4444', 
                            padding: '8px 14px', 
                            borderRadius: '8px', 
                            fontSize: '0.75rem', 
                            fontWeight: '700',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                        >
                          🗑️ DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            </GlassSurface>
          </div>
        </div>
      )}
      {/* ─── Audit Logs Tab ─────────────────────────────────────────────────── */}
      {currentTab === 'audits' && (
        <div style={{ marginTop: '0.5rem' }}>
          {/* ── Toolbar ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Audit Trail</h2>
              <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.85rem' }}>Immutable record of all system operations and security events</p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

              {/* Mode toggle pill */}
              <div style={{ display: 'flex', background: '#0a0a0a', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                {[['all', '📋 All Logs'], ['date', '📅 By Date']].map(([mode, label]) => (
                  <button
                    key={mode}
                    onClick={() => setAuditDateMode(mode)}
                    style={{
                      background: auditDateMode === mode ? '#34d399' : 'transparent',
                      color: auditDateMode === mode ? '#000' : '#71717a',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '0.8rem',
                      fontWeight: auditDateMode === mode ? '700' : '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Date picker — visible only in 'date' mode */}
              {auditDateMode === 'date' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                  <label style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Date</label>
                  <input
                    type="date"
                    value={auditDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={e => setAuditDate(e.target.value)}
                    style={{ background: '#161616', color: '#fff', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.85rem', cursor: 'pointer', outline: 'none' }}
                  />
                </div>
              )}

              <button className="btn btn-outline btn-sm" onClick={() => window.location.reload()} style={{ borderRadius: '8px' }}>
                &#x1F504; Refresh
              </button>
            </div>
          </div>

          {/* Live count badge */}
          {(() => {
            const filteredAuditLogs = auditDateMode === 'date'
              ? audits.filter(a => a.timestamp && new Date(a.timestamp).toISOString().split('T')[0] === auditDate)
              : audits
            const showEmpty = filteredAuditLogs.length === 0
            return (
              <>
                <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#52525b' }}>
                    {auditDateMode === 'date'
                      ? `Showing logs for ${new Date(auditDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`
                      : 'Showing all audit logs'}
                  </span>
                  <span style={{ background: '#27272a', color: '#a1a1aa', fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', border: '1px solid #3d3d3d' }}>
                    {filteredAuditLogs.length} records
                  </span>
                </div>

                <div style={{ 
                  position: 'relative', 
                  borderRadius: '16px', 
                  overflow: 'hidden', 
                  height: '600px', // Fixed height to prevent SVG filter bloat
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <GlassSurface width="100%" height="100%" borderRadius={16} blur={20} opacity={0.03} brightness={110}>
                    <div style={{ 
                      width: '100%', 
                      height: '100%',
                      boxSizing: 'border-box', 
                      overflowY: 'auto', // Internal scrolling
                      display: 'flex',
                      flexDirection: 'column'
                    }} className="custom-scrollbar">
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ 
                            borderBottom: '1.5px solid #ffffff', 
                            background: 'rgba(255,255,255,0.05)',
                            position: 'sticky',
                            top: 0,
                            zIndex: 10
                          }}>
                            <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', width: '200px', letterSpacing: '0.05em' }}>Timestamp</th>
                            <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', width: '150px', letterSpacing: '0.05em' }}>User</th>
                            <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', width: '150px', letterSpacing: '0.05em' }}>Action</th>
                            <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', width: '120px', letterSpacing: '0.05em' }}>Status</th>
                            <th style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Context</th>
                          </tr>
                        </thead>
                        <tbody>
                    {filteredAuditLogs.map((log, idx) => {
                  let displayAction = log.action;
                  let context = "-";
                  let statusColor = "#34d399";
                  let statusBg = "rgba(52, 211, 153, 0.1)";
                  let displayStatus = log.status || "SUCCESS";
                  
                  try {
                    const d = JSON.parse(log.details || "{}");
                    
                    // 1. Extract Method for API_REQUEST
                    if (log.action === "API_REQUEST") {
                      if (d.endpoint && d.endpoint.includes(' ')) {
                        displayAction = d.endpoint.split(' ')[0];
                      } else if (d.method) {
                        displayAction = d.method;
                      } else if (d.endpoint) {
                        // Infer from path if missing
                        const p = d.endpoint.toLowerCase();
                        if (p.includes('/list') || p.includes('/analytics') || p.includes('/get')) displayAction = "GET";
                        else if (p.includes('/upload') || p.includes('/login') || p.includes('/sync')) displayAction = "POST";
                        else displayAction = "API_REQUEST";
                      }
                    }

                    // Rename OPTIONS noise to API_REQUEST
                    if (displayAction === "OPTIONS") {
                      displayAction = "API_REQUEST";
                    }

                    // 2. Better Context Extraction
                    if (d.file_info) {
                      context = `📄 ${d.file_info.file_name} (${(d.file_info.file_size_bytes / 1024).toFixed(1)} KB)`;
                    } else if (d.endpoint) {
                      const path = d.endpoint.includes(' ') ? d.endpoint.split(' ')[1] : d.endpoint;
                      context = `🔗 ${path}`;
                    } else if (d.reason) {
                      context = `⚠️ ${d.reason}`;
                    } else if (d.ip || d.ip_address) {
                      context = `🌐 IP: ${d.ip || d.ip_address}`;
                    }
                    
                    // 3. Robust Status Color Logic
                    const sCode = d.status || log.status;
                    if (sCode === "FAILURE" || (typeof sCode === 'number' && sCode >= 400)) {
                      statusColor = "#ffffff";
                      statusBg = "rgba(239, 68, 68, 0.3)";
                      displayStatus = sCode === "FAILURE" ? "FAILURE" : `ERROR ${sCode}`;
                    } else if (typeof sCode === 'number' && sCode < 400) {
                      statusColor = "#ffffff";
                      statusBg = "rgba(255, 255, 255, 0.1)";
                      displayStatus = `OK ${sCode}`;
                    } else {
                      statusColor = "#ffffff";
                      statusBg = "rgba(255, 255, 255, 0.1)";
                    }
                  } catch(e) {}

                  return (
                    <tr key={idx} style={{ borderBottom: '0.6px solid rgba(255,255,255,0.3)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '1.2rem', color: '#a3a3a3', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '1.2rem' }}>
                        <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.9rem' }}>{log.username}</div>
                      </td>
                      <td style={{ padding: '1.2rem' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          background: 'rgba(255,255,255,0.05)', 
                          borderRadius: '6px', 
                          fontSize: '0.7rem', 
                          fontWeight: '800', 
                          color: '#ffffff',
                          border: '0.6px solid #ffffff'
                        }}>
                          {displayAction}
                        </span>
                      </td>
                      <td style={{ padding: '1.2rem' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '6px', 
                          fontSize: '0.7rem', 
                          fontWeight: '800',
                          background: statusBg,
                          color: statusColor,
                          border: statusBg.includes('239') ? '1px solid #ef4444' : '1px solid #ffffff'
                        }}>
                          {displayStatus}
                        </span>
                      </td>
                      <td style={{ padding: '1.2rem', color: '#ffffff', fontSize: '0.85rem', fontWeight: '500' }}>
                        {context}
                      </td>
                    </tr>
                  )
                    })}
                    </tbody>
                  </table>
                </div>
              </GlassSurface>
            </div>
              </>
            )
          })()}
        </div>
      )}
      </div>
    </div>
  )
}
