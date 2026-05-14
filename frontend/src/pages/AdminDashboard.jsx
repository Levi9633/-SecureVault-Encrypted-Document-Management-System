import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import api, { getAnalytics, getUsers, getAudits, getSupabaseAudits, blockUser, deleteUser } from '../services/api'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import GlassSurface from '../components/GlassSurface'

const COLORS = ['#ffffff', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.1)']

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
  
  // Custom Calendar States
  const [showCalendar, setShowCalendar] = useState(false)
  const [calDate, setCalDate] = useState(new Date()) 
  const calendarRef = useRef(null)

  const [showAuditCalendar, setShowAuditCalendar] = useState(false)
  const [auditCalDate, setAuditCalDate] = useState(new Date())
  const auditCalendarRef = useRef(null)

  // ─── Confirm Modal + Toast ────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState(null) // { type: 'block'|'unblock'|'delete', user }
  const [toast, setToast] = useState(null) // { message, variant: 'success'|'error' }

  const showToast = (message, variant = 'success') => {
    setToast({ message, variant })
    setTimeout(() => setToast(null), 3200)
  }

  const handleConfirm = async () => {
    if (!confirmModal) return
    const { type, user } = confirmModal
    setConfirmModal(null)
    try {
      if (type === 'delete') {
        await deleteUser(user.id)
        showToast(`Deleted ${user.username} successfully`)
        // ── Optimistic: remove user from list instantly ──
        setUsers(prev => prev.filter(u => u.id !== user.id))
      } else {
        const blocking = type === 'block'
        await blockUser(user.id, blocking)
        showToast(`${blocking ? 'Blocked' : 'Unblocked'} ${user.username} successfully`)
        // ── Optimistic: flip is_blocked instantly so button swaps BLOCK ↔ UNBLOCK ──
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_blocked: blocking } : u))
      }
      fetchData() // background sync — keeps server state in sync
    } catch (err) {
      showToast(err.response?.data?.detail || 'Action failed', 'error')
      fetchData() // re-sync on error to restore correct state
    }
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false)
      }
      if (auditCalendarRef.current && !auditCalendarRef.current.contains(event.target)) {
        setShowAuditCalendar(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

      const sbAuditsFormatted = sbAuditsRaw.map(a => ({
        username: a.payload?.actor_username || a.payload?.actor_email || 'System',
        action: `Auth: ${a.payload?.action || 'Event'}`,
        details: a.payload?.log_type || '',
        timestamp: a.created_at
      }))

      // Sort ascending for charts (chronological order)
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
      const key = d.toISOString().split('T')[0] // Use ISO date (UTC) as bucket key
      const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      counts[key] = { name: label, Uploads: 0, Downloads: 0, Auth: 0, Other: 0 }
    }
    audits.forEach(a => {
      if (!a.timestamp || a.action === 'API_REQUEST') return
      const key = new Date(a.timestamp).toISOString().split('T')[0] // Match on UTC date
      if (counts[key]) {
        const action = a.action?.toLowerCase() || ''
        // FILE_ENCRYPT_UPLOAD, upload, encrypt
        if (action.includes('upload') || (action.includes('encrypt') && !action.includes('decrypt')))
          counts[key].Uploads++
        // FILE_DECRYPT, download, decrypt
        else if (action.includes('decrypt') || action.includes('download'))
          counts[key].Downloads++
        // Auth events from Supabase (action starts with 'auth:')
        else if (action.startsWith('auth:') || action.includes('login') || action.includes('signup') || action.includes('logout'))
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
    const counts = { Uploads: 0, Downloads: 0, Auth: 0 }
    audits.forEach(a => {
      if (a.action === 'API_REQUEST') return
      const action = a.action?.toLowerCase() || ''
      if (action.includes('upload') || (action.includes('encrypt') && !action.includes('decrypt')))
        counts.Uploads++
      else if (action.includes('decrypt') || action.includes('download'))
        counts.Downloads++
      else if (action.startsWith('auth:') || action.includes('login') || action.includes('signup') || action.includes('logout'))
        counts.Auth++
      // Everything else is ignored — no "Other" bucket
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

  // Duplicate usersList state removed — UI now uses global 'users' state


  // Deprecated handlers removed — using handleConfirm logic instead

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
      let color = '#ffffff' // White
      if (status >= 300 && status < 400) { type = 'Redirect'; color = 'rgba(255, 255, 255, 1)' } // Light gray
      else if (status >= 400 && status < 500) { type = 'Client'; color = 'rgba(255, 255, 255, 0.85)' } // Mid gray
      else if (status >= 500) { type = 'Server'; color = '#ef4444' } // Keep red for server errors
      
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
    <>
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
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.28); }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(1) brightness(1.5);
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        input[type="date"]::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
      `}</style>

      <div className="header" style={{ margin: '0.1rem 0', paddingBottom: '0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: '900', letterSpacing: '-0.04em', color: '#ffffff' }}>🛠 Admin Control Panel</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-end' }}>
          <button 
            onClick={() => nav('/dashboard')} 
            style={{ 
              marginTop: '4px',
              width: 'auto', 
              borderRadius: '8px', 
              padding: '0.4rem 1rem',
              background: 'rgba(255,255,255,0.06)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid #ffffff', 
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: '900',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseOver={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' }}
            onMouseOut={(e) => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none' }}
          >
            <span>&#8592;</span> Back to Dashboard
          </button>

          {currentTab === 'users' && (
            <button 
              onClick={fetchData} 
              disabled={loading}
              style={{ 
                width: 'auto', 
                borderRadius: '8px', 
                padding: '0.4rem 1rem',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid #ffffff', 
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '900',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: loading ? 0.6 : 1
              }}
              onMouseOver={(e) => { if(!loading) { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' } }}
              onMouseOut={(e) => { if(!loading) { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none' } }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              {loading ? 'Refreshing...' : 'Refresh Data'}
              <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              `}</style>
            </button>
          )}

          {currentTab === 'audits' && (
            <button 
              onClick={() => window.location.reload()} 
              style={{ 
                width: 'auto', 
                borderRadius: '8px', 
                padding: '0.4rem 1rem',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid #ffffff', 
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: '900',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
              onMouseOver={(e) => { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' }}
              onMouseOut={(e) => { e.target.style.background = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M1 20v-6h6"></path>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              Refresh Logs
            </button>
          )}

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {currentTab === 'analytics' && (
              <>
                {/* Date picker container */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', position: 'relative' }} ref={calendarRef}>
                  <div
                    onClick={() => setShowCalendar(!showCalendar)}
                    style={{ 
                      background: 'rgba(255,255,255,0.08)', 
                      backdropFilter: 'blur(24px)', 
                      WebkitBackdropFilter: 'blur(24px)',
                      color: '#ffffff', 
                      border: '1px solid #ffffff', 
                      borderRadius: '8px', 
                      padding: '0.4rem 0.75rem', 
                      fontSize: '0.85rem', 
                      fontWeight: '900',
                      cursor: 'pointer', 
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      minWidth: '140px',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 15px rgba(255,255,255,0.05)'
                    }}
                    onMouseOver={(e) => { e.target.style.background = 'rgba(255,255,255,0.15)'; e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' }}
                    onMouseOut={(e) => { e.target.style.background = 'rgba(255,255,255,0.08)'; e.target.style.boxShadow = '0 4px 15px rgba(255,255,255,0.05)' }}
                  >
                    <span style={{ color: '#ffffff' }}>{analyticsMode === 'date' ? new Date(selectedDate + 'T00:00:00').toLocaleDateString() : 'Select Date'}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                  </div>

                  {/* Custom Glassy Calendar Modal */}
                  {showCalendar && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 10px)',
                      right: 0,
                      zIndex: 1000,
                      width: '280px',
                      background: 'rgba(15, 15, 15, 0.95)',
                      backdropFilter: 'blur(32px)',
                      WebkitBackdropFilter: 'blur(32px)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '16px',
                      padding: '1.25rem',
                      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.1)',
                      animation: 'calendarAppear 0.2s cubic-bezier(0, 0, 0.2, 1)'
                    }}>
                      <style>{`
                        @keyframes calendarAppear {
                          from { opacity: 0; transform: translateY(-10px) scale(0.95); }
                          to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                      `}</style>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <button onClick={(e) => { e.stopPropagation(); setCalDate(new Date(calDate.setMonth(calDate.getMonth() - 1))) }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px' }}>←</button>
                        <div style={{ color: '#fff', fontWeight: '800', fontSize: '0.9rem' }}>
                          {calDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); setCalDate(new Date(calDate.setMonth(calDate.getMonth() + 1))) }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px' }}>→</button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '8px' }}>
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                          <div key={day} style={{ color: '#ffffff', opacity: 0.4, fontSize: '0.65rem', textAlign: 'center', fontWeight: '800' }}>{day}</div>
                        ))}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                        {(() => {
                          const days = [];
                          const firstDay = new Date(calDate.getFullYear(), calDate.getMonth(), 1).getDay();
                          const lastDate = new Date(calDate.getFullYear(), calDate.getMonth() + 1, 0).getDate();
                          for (let i = 0; i < firstDay; i++) { days.push(<div key={`pad-${i}`} />); }
                          for (let d = 1; d <= lastDate; d++) {
                            const currentStr = `${calDate.getFullYear()}-${String(calDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                            const isSelected = selectedDate === currentStr && analyticsMode === 'date';
                            const isToday = new Date().toISOString().split('T')[0] === currentStr;
                            const isFuture = currentStr > todayStr;
                            days.push(
                              <div key={d} onClick={(e) => { e.stopPropagation(); if (isFuture) return; setSelectedDate(currentStr); setAnalyticsMode('date'); setShowCalendar(false); }}
                                style={{ padding: '6px 0', textAlign: 'center', fontSize: '0.75rem', borderRadius: '6px', cursor: isFuture ? 'default' : 'pointer', color: isFuture ? 'rgba(255,255,255,0.15)' : '#ffffff', background: isSelected ? '#ffffff' : (isToday ? 'rgba(255,255,255,0.1)' : 'transparent'), color: isSelected ? '#000' : (isFuture ? 'rgba(255,255,255,0.15)' : '#ffffff'), fontWeight: isSelected || isToday ? '800' : '500', transition: 'all 0.2s' }}
                                onMouseOver={(e) => { if(!isSelected && !isFuture) e.target.style.background = 'rgba(255,255,255,0.15)' }}
                                onMouseOut={(e) => { if(!isSelected && !isFuture) e.target.style.background = (isToday ? 'rgba(255,255,255,0.1)' : 'transparent') }}
                              >{d}</div>
                            );
                          }
                          return days;
                        })()}
                      </div>

                      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                        <button onClick={(e) => { e.stopPropagation(); setAnalyticsMode('all'); setShowCalendar(false); }} style={{ background: 'none', border: 'none', color: '#ffffff', opacity: 0.6, fontSize: '0.7rem', cursor: 'pointer', fontWeight: '700' }}>Clear</button>
                        <button onClick={(e) => { e.stopPropagation(); setSelectedDate(todayStr); setAnalyticsMode('date'); setShowCalendar(false); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '800' }}>Today</button>
                      </div>
                    </div>
                  )}
                </div>
                {/* Clear pill */}
                {analyticsMode === 'date' && (
                  <button
                    onClick={() => setAnalyticsMode('all')}
                    style={{ 
                      background: 'rgba(255,255,255,0.08)', 
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      color: '#ffffff', 
                      border: '0.6px solid rgba(255,255,255,0.3)', 
                      borderRadius: '8px', 
                      padding: '0.5rem 1rem', 
                      fontSize: '0.8rem', 
                      fontWeight: '800',
                      cursor: 'pointer', 
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.12)'}
                    onMouseOut={(e) => e.target.style.background = 'rgba(255,255,255,0.08)'}
                  >
                    × All Time
                  </button>
                )}
              </>
            )}
          </div>
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
              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M12 11V14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="12" cy="8.5" r="0.5" fill="#ffffff" stroke="#ffffff" strokeWidth="1"/>
                </svg>
              </div>
              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#ffffff', marginBottom: '4px', fontWeight: '800' }}>Success rate</div>
                <div style={{ fontSize: '2rem', fontWeight: '900', color: '#ffffff' }}>{apiStats.successRate}%</div>
                <div style={{ marginTop: '6px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${apiStats.successRate}%`, background: '#ffffff', borderRadius: '3px', boxShadow: '0 0 8px rgba(255,255,255,0.4)' }} />
                </div>
              </div>
            </div>

            {/* Row 2: Requests + Users */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#ffffff', opacity: 0.8 }}>Requests</div>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ffffff', marginTop: '4px' }}>{apiStats.req.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.5, marginTop: '4px' }}>↑ API calls total</div>
              </div>
              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#ffffff', opacity: 0.8 }}>Users</div>
                <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ffffff', marginTop: '4px' }}>{stats.total_users.toLocaleString()}</div>
                <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.5, marginTop: '4px' }}>↑ Registered</div>
              </div>
            </div>

            {/* Response Times */}
            <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#ffffff', opacity: 0.8, marginBottom: '0.75rem' }}>Response times <span style={{ color: '#ffffff', opacity: 0.4 }}>(ms)</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '0.75rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ffffff' }}>{apiStats.lq}</div>
                  <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.6 }}>LQ</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#ffffff' }}>{apiStats.median}</div>
                  <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.6 }}>Median</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' }}>{apiStats.uq}</div>
                  <div style={{ fontSize: '0.7rem', color: '#ffffff', opacity: 0.6 }}>UQ</div>
                </div>
              </div>
              {/* Gradient bar: green → yellow → red */}
              <div style={{ height: '8px', borderRadius: '4px', background: 'linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,0.6) 60%, rgba(255,255,255,0.3) 80%, rgba(255,255,255,0.1) 100%)' }} />
            </div>

            {/* Endpoints List */}
            <div className="glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                {/* Animated Role Toggle */}
                <div style={{ 
                  display: 'flex', 
                  background: 'rgba(255,255,255,0.04)', 
                  backdropFilter: 'blur(12px)',
                  borderRadius: '6px', 
                  padding: '2px', 
                  position: 'relative',
                  border: '1px solid rgba(255,255,255,0.1)',
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
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    zIndex: 0,
                    boxShadow: '0 0 10px rgba(255,255,255,0.1)'
                  }} />
                  
                  <button 
                    onClick={() => setEndpointRole('User')} 
                    style={{ 
                      flex: 1,
                      background: 'none', 
                      border: 'none', 
                      color: '#ffffff', 
                      opacity: endpointRole === 'User' ? 1 : 0.5,
                      fontWeight: endpointRole === 'User' ? '800' : '500',
                      cursor: 'pointer', 
                      zIndex: 1,
                      fontSize: '0.75rem',
                      transition: 'all 0.2s'
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
                      color: '#ffffff', 
                      opacity: endpointRole === 'Admin' ? 1 : 0.5,
                      fontWeight: endpointRole === 'Admin' ? '800' : '500',
                      cursor: 'pointer', 
                      zIndex: 1,
                      fontSize: '0.75rem',
                      transition: 'all 0.2s'
                    }}
                  >
                    Admin
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '4px' }}>
                  {['All', 'Success', 'Bad', 'Error'].map(f => {
                    const filterMap = { All: 'All', Success: 'Success', Bad: 'Client', Error: 'Server' }
                    const active = endpointFilter === filterMap[f]
                    const colors = { All: '#ffffff', Success: '#ffffff', Bad: 'rgba(255,255,255,0.6)', Error: '#ef4444' }
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
                    <div key={i} className="glass-card" style={{ position: 'relative', height: '26px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${w}%`, background: d.color, opacity: 0.15 }} />
                      <div style={{ position: 'relative', zIndex: 1, padding: '0 8px', display: 'flex', gap: '6px', width: '100%', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#ffffff', minWidth: '28px' }}>{d.count}</span>
                        <span style={{ fontSize: '0.78rem', color: '#ffffff', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.endpoint}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── BOTTOM LEFT: Event Composition Pie Chart ─────────────────── */}
          <div style={{ gridColumn: '1', gridRow: '2', display: 'flex', flexDirection: 'column' }}>
            <div className="glass-card" style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '0.6px solid rgba(255,255,255,0.12)',
              borderRadius: '8px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '300px',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '1.25rem', color: '#ffffff', fontWeight: '900', letterSpacing: '-0.03em' }}>Event Composition</div>
                </div>
                {(() => {
                  const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                  return (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#ffffff', lineHeight: 1 }}>{total}</div>
                      <div style={{ fontSize: '0.68rem', color: '#ffffff', marginTop: '2px', fontWeight: '800' }}>total events</div>
                    </div>
                  )
                })()}
              </div>

              {/* Donut chart */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  {eventCompositionData.length > 0 ? (() => {
                    const total = eventCompositionData.reduce((s, d) => s + d.value, 0)
                    const PIE_COLORS = { Uploads: '#ffffff', Downloads: 'rgba(255,255,255,0.6)', Auth: 'rgba(255,255,255,0.25)' }
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
                            const color = { Uploads: '#ffffff', Downloads: 'rgba(255,255,255,0.7)', Auth: 'rgba(255,255,255,0.45)' }[entry.name] || '#fff'
                            return (
                              <div style={{ background: 'rgba(15,15,15,0.9)', backdropFilter: 'blur(8px)', border: `1px solid rgba(255,255,255,0.2)`, padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#fff', boxShadow: '0 10px 20px rgba(0,0,0,0.5)' }}>
                                <div style={{ color, fontWeight: '800', marginBottom: '6px', fontSize: '0.9rem' }}>{entry.name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '4px' }}>
                                  <span style={{ color: '#ffffff', opacity: 0.7, fontWeight: '600' }}>Count</span>
                                  <span style={{ fontWeight: '800', color: '#ffffff' }}>{entry.value}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem' }}>
                                  <span style={{ color: '#ffffff', opacity: 0.7, fontWeight: '600' }}>Share</span>
                                  <span style={{ fontWeight: '800', color: '#ffffff' }}>{pct}%</span>
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
                const PIE_COLORS = { Uploads: '#ffffff', Downloads: 'rgba(255,255,255,0.6)', Auth: 'rgba(255,255,255,0.35)', Other: 'rgba(255,255,255,0.18)' }
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
                              <span style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '800' }}>{d.name}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.72rem', color: '#ffffff', fontWeight: '800' }}>{pct}%</span>
                              <span style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: '900', minWidth: '24px', textAlign: 'right' }}>{d.value}</span>
                            </div>
                          </div>
                          <div style={{ height: '3px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${barW}%`, background: '#ffffff', borderRadius: '2px', transition: 'width 0.8s ease', boxShadow: '0 0 4px rgba(255,255,255,0.2)' }} />
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
            <div className="glass-card" style={{ flex: 1, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* Activity Chart */}
              <div>
                {/* Header with live stats */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '500' }}>Activity (Requests)</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#ffffff', fontWeight: 'bold' }}>
                      ✓ {activityChartData.reduce((s, d) => s + (d.SuccessCount || 0), 0)} ok
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>
                      ✗ {activityChartData.reduce((s, d) => s + (d.ErrorCount || 0), 0)} err
                    </span>
                  </div>
                </div>
                <div style={{ height: '140px', minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityChartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }} barCategoryGap={2}>
                      <YAxis stroke="#2d2d2d" tick={{ fill: '#ffffff', fontSize: 10, fontWeight: '500' }} axisLine={false} tickLine={false} />
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
                          <div className="glass-card" style={{ 
                            background: 'rgba(10, 10, 10, 0.85)', 
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255,255,255,0.25)', 
                            padding: '12px 16px', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            color: '#fff', 
                            minWidth: '200px',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)'
                          }}>
                            <div style={{ color: '#ffffff', opacity: 0.6, marginBottom: '10px', fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.02em' }}>{fullTime}</div>
                            <div style={{ color: '#ffffff', fontWeight: '800', marginBottom: '6px', fontSize: '1rem' }}>{d?.SuccessCount || 0} Success</div>
                            {(d?.ErrorCount || 0) > 0 && <div style={{ color: '#ef4444', fontWeight: '800', marginBottom: '6px', fontSize: '1rem' }}>{d?.ErrorCount} Errors</div>}
                            <div style={{ color: '#fff', marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ opacity: 0.85 }}>Total: <strong style={{ fontWeight: '900' }}>{total}</strong></span>
                              <span style={{ color: '#ffffff', fontWeight: '800', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{successRate}% ok</span>
                            </div>
                          </div>
                        )
                      }} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="SuccessCount" stackId="a" fill="#ffffff" radius={[0,0,0,0]} animationDuration={1000} />
                      <Bar dataKey="ErrorCount" stackId="a" fill="#ef4444" radius={[2,2,0,0]} animationDuration={1000} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.72rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                    <span style={{ width: '10px', height: '10px', background: '#ffffff', borderRadius: '2px', display: 'inline-block' }} /> Success
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#9ca3af' }}>
                    <span style={{ width: '10px', height: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '2px', display: 'inline-block' }} /> Errors
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
                        <div className="glass-card" style={{ 
                          background: 'rgba(10, 10, 10, 0.85)', 
                          backdropFilter: 'blur(24px)', 
                          WebkitBackdropFilter: 'blur(24px)', 
                          border: '1px solid rgba(255,255,255,0.25)', 
                          padding: '12px 16px', 
                          borderRadius: '10px', 
                          fontSize: '0.85rem', 
                          color: '#fff', 
                          boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)' 
                        }}>
                          <div style={{ color: '#ffffff', opacity: 0.6, marginBottom: '8px', fontSize: '0.75rem', fontWeight: '600' }}>{payload[0]?.payload?.timeLabel}</div>
                          <div style={{ color: '#ffffff', fontWeight: '800', marginBottom: '6px', fontSize: '1rem' }}>{payload[0]?.payload?.ResponseTime}ms</div>
                          <div style={{ color: '#ffffff', fontWeight: '700' }}>Status: {payload[0]?.payload?.Status}</div>
                          <div style={{ color: '#ffffff', opacity: 0.6, fontSize: '0.75rem', marginTop: '6px' }}>{payload[0]?.payload?.Endpoint}</div>
                        </div>
                      ) : null} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                      <Bar dataKey="ResponseTime" fill="rgba(255,255,255,0.55)" radius={[2,2,0,0]} animationDuration={800} />
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
                    let bg = '#ffffff'
                    if (d.Status >= 500) bg = '#ef4444' // Keep red for server error
                    else if (d.Status >= 400) bg = 'rgba(255,255,255,0.4)'
                    else if (d.Status >= 300) bg = 'rgba(255,255,255,0.7)'
                    return <div key={i} style={{ flex: 1, background: bg }} title={`${d.Status} · ${d.Endpoint} · ${d.ResponseTime}ms`} />
                  })}
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  {[['#ffffff','2xx Success'],['rgba(255,255,255,0.7)','3xx Redirect'],['rgba(255,255,255,0.4)','4xx Client'],['#ef4444','5xx Server']].map(([c,l]) => (
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
            <div className="glass-card" style={{ position: 'relative', zIndex: 10, background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '1.25rem', color: '#ffffff', fontWeight: '900', letterSpacing: '-0.03em' }}>14-Day Activity Trend</div>
                </div>
                <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem' }}>
                  {[
                    ['#ffffff', 'Uploads'],
                    ['#fbfbfee3', 'Downloads'],
                    ['#ffffffa0', 'Auth'],
                    ['#fdfdfd80', 'Other']
                  ].map(([c, l]) => (
                    <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ffffff', fontWeight: '800' }}>
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
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 10, fontWeight: '800' }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 10, fontWeight: '800' }} allowDecimals={false} />
                      <RechartsTooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        wrapperStyle={{ zIndex: 9999 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const total = payload.reduce((s, p) => s + (p.value || 0), 0)
                          return (
                            <div className="glass-card" style={{ 
                              background: 'rgba(10, 10, 10, 0.85)', 
                              backdropFilter: 'blur(24px)', 
                              WebkitBackdropFilter: 'blur(24px)', 
                              border: '1px solid rgba(255,255,255,0.25)', 
                              padding: '12px 16px', 
                              borderRadius: '10px', 
                              fontSize: '0.85rem', 
                              color: '#fff', 
                              minWidth: '160px', 
                              boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)' 
                            }}>
                              <div style={{ color: '#ffffff', opacity: 0.6, marginBottom: '10px', fontWeight: '800', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '8px' }}>{label}</div>
                              {payload.map((p, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '6px' }}>
                                  <span style={{ color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', background: p.fill, borderRadius: '2px', display: 'inline-block' }} />
                                    {p.name}
                                  </span>
                                  <span style={{ fontWeight: '800' }}>{p.value}</span>
                                </div>
                              ))}
                              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: '8px', paddingTop: '8px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ opacity: 0.85 }}>Total</span><span style={{ fontWeight: '900' }}>{total}</span>
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Bar dataKey="Uploads" fill="#ffffff" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Downloads" fill="rgba(255,255,255,0.45)" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Auth" fill="rgba(255,255,255,0.2)" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                      <Bar dataKey="Other" fill="rgba(255,255,255,0.08)" radius={[2,2,0,0]} maxBarSize={18} animationDuration={900} />
                    </BarChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', opacity: 0.4, fontSize: '0.8rem' }}>No events in the last 14 days</div>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* User Engagement (Grouped Bar Chart) */}
            <div className="glass-card" style={{ 
                flex: 1,
                background: 'rgba(255,255,255,0.04)', 
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '0.6px solid rgba(255,255,255,0.12)', 
                borderRadius: '12px', 
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '220px'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.5rem', letterSpacing: '-0.04em', fontWeight: '900' }}>User Engagement</h3>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  {[['#ffffff','API'],['#a1a1aa','Uploads'],['#52525b','Downloads']].map(([c,l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ width: '7px', height: '7px', background: c, borderRadius: '50%' }} />
                      <span style={{ fontSize: '0.68rem', color: '#ffffff', fontWeight: '800' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {userActivityData.length > 0 ? (
                    <BarChart data={userActivityData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 10, fontWeight: '800' }} dy={8} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#ffffff', fontSize: 10, fontWeight: '800' }} />
                      <RechartsTooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="glass-card" style={{ 
                                background: 'rgba(10, 10, 10, 0.85)', 
                                backdropFilter: 'blur(24px)', 
                                WebkitBackdropFilter: 'blur(24px)', 
                                border: '1px solid rgba(255,255,255,0.25)', 
                                padding: '12px 16px', 
                                borderRadius: '10px', 
                                boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1)', 
                                minWidth: '160px' 
                              }}>
                                <p style={{ margin: '0 0 10px', fontWeight: '800', color: '#fff', fontSize: '0.85rem', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: '8px', opacity: 0.75 }}>{label}</p>
                                {[['API Hits','#ffffff',0],['Uploads','#a1a1aa',1],['Downloads','#52525b',2]].map(([name, color, idx]) => (
                                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '6px' }}>
                                    <span style={{ color: '#ffffff', fontSize: '0.8rem', opacity: 0.9 }}>{name}</span>
                                    <span style={{ color: '#fff', fontWeight: '800', fontSize: '0.8rem' }}>{payload[idx]?.value ?? 0}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="api" fill="#ffffff" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                      <Bar dataKey="uploads" fill="#a1a1aa" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                      <Bar dataKey="downloads" fill="#52525b" radius={[3, 3, 0, 0]} barSize={16} animationDuration={1200} />
                    </BarChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', opacity: 0.4, border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '8px' }}>
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
            <div className="supa-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#ffffff', fontSize: '1.1rem', fontWeight: '500' }}>Endpoints</h3>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {['All', 'Success', 'Redirect', 'Client', 'Server'].map(f => (
                    <button 
                      key={f}
                      onClick={() => setEndpointFilter(f)}
                      style={{ 
                        background: endpointFilter === f ? '#ffffff' : 'rgba(255,255,255,0.06)',
                        color: endpointFilter === f ? '#000' : '#ffffff',
                        opacity: endpointFilter === f ? 1 : 0.6,
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
                    <div key={i} className="glass-card" style={{ position: 'relative', width: '100%', height: '30px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', transition: 'all 0.2s' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${widthPct}%`, background: d.color, opacity: 0.18 }} />
                      <div style={{ position: 'relative', zIndex: 1, padding: '0 10px', color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', gap: '8px', width: '100%' }}>
                        <span style={{ minWidth: '25px', color: '#ffffff', fontWeight: '800' }}>{d.count}</span>
                        <span style={{ color: '#ffffff', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.endpoint}</span>
                      </div>
                    </div>
                  )
                }) : (
                  <div style={{ color: '#ffffff', opacity: 0.5, fontSize: '0.85rem', marginTop: '1rem', textAlign: 'center' }}>No endpoints found for this filter.</div>
                )}
              </div>
            </div>

            {/* Right side: Stats & Charts */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              {/* Stat Boxes Row */}
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="supa-stat glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', alignItems: 'center', padding: '1rem', flex: '0 0 100px' }}>
                  <div style={{ fontSize: '2.5rem', color: '#ffffff' }}>⚡</div>
                </div>
                <div className="supa-stat glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Success rate</div>
                  <div className="supa-stat-value" style={{ color: '#ffffff', fontSize: '1.5rem' }}>{apiStats.successRate}%</div>
                </div>
                <div className="supa-stat glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Requests</div>
                  <div className="supa-stat-value" style={{ color: '#fff', fontSize: '1.5rem' }}>{apiStats.req}</div>
                </div>
                <div className="supa-stat glass-card" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)', padding: '1rem', flex: 1 }}>
                  <div className="supa-stat-label">Users</div>
                  <div className="supa-stat-value" style={{ color: '#fff', fontSize: '1.5rem' }}>{stats.total_users}</div>
                </div>
              </div>

              {/* Response Time Stats Row */}
              <div className="supa-card glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)' }}>
                <div className="supa-stat-label">Response times (ms)</div>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '0.5rem' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffffff' }}>{apiStats.lq}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>LQ</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffffff' }}>{apiStats.median}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Median</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'rgba(255,255,255,0.7)' }}>{apiStats.uq}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>UQ</div>
                  </div>
                </div>
              </div>
              
              {/* Activity Chart Row */}
              <div className="supa-card glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)' }}>
                <div className="supa-stat-label">Activity</div>
                <div style={{ height: '120px', width: '100%', marginTop: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <XAxis dataKey="name" hide />
                      <YAxis stroke="#52525b" tick={{fill: '#9ca3af', fontSize: 10}} axisLine={false} tickLine={false} allowDecimals={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#242424' }} />
                      <Bar dataKey="Requests" fill="#ffffff" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Response Time Chart Row */}
              <div className="supa-card glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '0.6px solid rgba(255,255,255,0.12)' }}>
                <div className="supa-stat-label">Response time (ms)</div>
                <div style={{ height: '120px', width: '100%', marginTop: '0.5rem' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
                      <XAxis dataKey="name" hide />
                      <YAxis stroke="#52525b" tick={{fill: '#9ca3af', fontSize: 10}} axisLine={false} tickLine={false} />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#242424' }} />
                      <Bar dataKey="ResponseTime" fill="rgba(255,255,255,0.45)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Success Rate Row */}
              <div className="supa-card glass-card" style={{ padding: '1rem' }}>
                <div className="supa-stat-label">Success rate</div>
                <div style={{ display: 'flex', width: '100%', height: '24px', gap: '1px', marginTop: '0.5rem' }}>
                  {apiChartData.map((d, i) => {
                    let bg = '#ffffff'
                    if (d.Status >= 500) bg = '#ef4444'
                    else if (d.Status >= 400) bg = 'rgba(255,255,255,0.4)'
                    else if (d.Status >= 300) bg = 'rgba(255,255,255,0.7)'
                    return <div key={i} style={{ flex: 1, background: bg }} title={`${d.Status} - ${d.Endpoint} (${d.ResponseTime}ms)`} />
                  })}
                  {apiChartData.length === 0 && <div style={{ color: '#52525b', fontSize: '0.8rem', fontStyle: 'italic' }}>Waiting for requests...</div>}
                </div>
              </div>

            </div>
            
            {/* Supabase-style Log Explorer */}
            <div className="supa-card" style={{ gridColumn: '1 / -1', padding: '0', background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', overflow: 'hidden', border: '0.6px solid rgba(255,255,255,0.12)' }}>
              {/* Stacked Chart Top */}
              <div style={{ height: '120px', width: '100%', padding: '1rem 1rem 0 1rem', borderBottom: '0.6px solid rgba(255,255,255,0.1)' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={apiChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Bar dataKey="ErrorCount" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="SuccessCount" stackId="a" fill="#ffffff" radius={[2, 2, 0, 0]} />
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
                       let sColor = '#ffffff'; let sBg = 'rgba(255, 255, 255, 0.1)';
                       if (sCode >= 500) { sColor = '#ef4444'; sBg = 'rgba(239, 68, 68, 0.15)'; }
                       else if (sCode >= 400) { sColor = 'rgba(255,255,255,0.6)'; sBg = 'rgba(255, 255, 255, 0.05)'; }
                       else if (sCode >= 300) { sColor = 'rgba(255,255,255,0.85)'; sBg = 'rgba(255, 255, 255, 0.08)'; }
                       
                       const logDate = log.timestamp ? new Date(log.timestamp) : new Date();
                       const formattedDate = `${logDate.getDate()} ${logDate.toLocaleString('default', {month: 'short'})} ${logDate.getFullYear().toString().substr(-2)} ${logDate.getHours().toString().padStart(2,'0')}:${logDate.getMinutes().toString().padStart(2,'0')}:${logDate.getSeconds().toString().padStart(2,'0')}`;
                       
                       return (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#ffffff', opacity: 0.7 }}>
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
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff', fontWeight: '900' }}>User Management</h2>
            </div>
          </div>

          <div style={{ 
            position: 'relative', 
            borderRadius: '16px', 
            overflow: 'hidden', 
            display: 'flex', 
            flexDirection: 'column',
            width: '100%'
          }}>
            <GlassSurface width="100%" height="auto" borderRadius={16} blur={20} opacity={0.03} brightness={110}>
              <div style={{ width: '100%', maxHeight: 'calc(100vh - 250px)', boxSizing: 'border-box', overflowY: 'auto' }} className="custom-scrollbar">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ 
                  borderBottom: '1px solid rgba(255,255,255,0.2)', 
                  background: '#18181b',
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
                {(Array.isArray(users) ? users : []).map((user, idx) => {
                  const storageBytes = user.storage_used || 0;
                  const storageUsedMB = (storageBytes / (1024 * 1024)).toFixed(2);
                  const storageLimitBytes = 50 * 1024 * 1024; // 50MB
                  const storagePercent = Math.min(100, (storageBytes / storageLimitBytes) * 100);

                  return (
                  <tr key={user.id || idx} style={{ borderBottom: '0.6px solid rgba(255,255,255,0.3)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '700', fontSize: '1rem' }}>{user.username || 'Unknown'}</div>
                      <div style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: '500' }}>{user.email || 'N/A'}</div>
                    </td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.files_count || 0}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.total_requests || 0}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.uploads || 0}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', fontWeight: '700' }}>{user.downloads || 0}</td>
                    <td style={{ padding: '1.2rem', color: '#ffffff', opacity: 0.6, fontWeight: '600' }}>50.00 MB</td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '700', marginBottom: '8px', fontSize: '0.9rem' }}>{storageUsedMB} MB</div>
                      <div style={{ 
                        height: '10px', 
                        width: '100px', 
                        background: 'transparent', 
                        borderRadius: '5px', 
                        border: '0.6px solid rgba(255,255,255,0.3)',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        <div style={{ 
                          height: '100%', 
                          width: `${storagePercent}%`, 
                          background: '#ffffff',
                          borderRadius: '0'
                        }} />
                      </div>
                    </td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => setConfirmModal({ type: user.is_blocked ? 'unblock' : 'block', user })}
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
                          {user.is_blocked ? 'UNBLOCK' : 'BLOCK'}
                        </button>
                        <button
                          onClick={() => setConfirmModal({ type: 'delete', user })}
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
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
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


          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '20px', marginBottom: '0.5rem' }}>
            {/* Mode toggle pill - Centered */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)', border: '0.6px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              {[['all', 'All Logs'], ['date', 'By Date']].map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setAuditDateMode(mode)}
                  style={{
                    background: auditDateMode === mode ? '#ffffff' : 'rgba(255,255,255,0.06)',
                    color: auditDateMode === mode ? '#000' : '#ffffff',
                    opacity: 1,
                    border: '1px solid #ffffff',
                    borderRadius: '8px',
                    padding: '8px 24px',
                    fontSize: '0.85rem',
                    fontWeight: '900',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                  }}
                  onMouseOver={(e) => { if(auditDateMode !== mode) e.target.style.background = 'rgba(255,255,255,0.12)' }}
                  onMouseOut={(e) => { if(auditDateMode !== mode) e.target.style.background = 'rgba(255,255,255,0.06)' }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date picker — visible only in 'date' mode, centered below toggle */}
            {auditDateMode === 'date' && (
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }} ref={auditCalendarRef}>
                <div
                  onClick={() => setShowAuditCalendar(!showAuditCalendar)}
                  style={{ 
                    background: 'rgba(255,255,255,0.06)', 
                    backdropFilter: 'blur(16px)', 
                    WebkitBackdropFilter: 'blur(16px)',
                    color: '#ffffff', 
                    border: '1px solid #ffffff', 
                    borderRadius: '8px', 
                    padding: '8px 16px', 
                    fontSize: '0.85rem', 
                    fontWeight: '900',
                    cursor: 'pointer', 
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: '140px',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 15px rgba(255,255,255,0.05)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(255,255,255,0.05)' }}
                >
                  <span style={{ color: '#ffffff' }}>{new Date(auditDate + 'T00:00:00').toLocaleDateString()}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                </div>

                {showAuditCalendar && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 10px)',
                    right: 0,
                    zIndex: 1000,
                    width: '280px',
                    background: 'rgba(15, 15, 15, 0.95)',
                    backdropFilter: 'blur(32px)',
                    WebkitBackdropFilter: 'blur(32px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '16px',
                    padding: '1.25rem',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.1)',
                    animation: 'calendarAppear 0.2s cubic-bezier(0, 0, 0.2, 1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <button onClick={(e) => { e.stopPropagation(); setAuditCalDate(new Date(auditCalDate.setMonth(auditCalDate.getMonth() - 1))) }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px' }}>←</button>
                      <div style={{ color: '#fff', fontWeight: '800', fontSize: '0.9rem' }}>
                        {auditCalDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setAuditCalDate(new Date(auditCalDate.setMonth(auditCalDate.getMonth() + 1))) }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '5px' }}>→</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '8px' }}>
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} style={{ color: '#ffffff', opacity: 0.4, fontSize: '0.65rem', textAlign: 'center', fontWeight: '800' }}>{day}</div>
                      ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                      {(() => {
                        const days = [];
                        const firstDay = new Date(auditCalDate.getFullYear(), auditCalDate.getMonth(), 1).getDay();
                        const lastDate = new Date(auditCalDate.getFullYear(), auditCalDate.getMonth() + 1, 0).getDate();
                        for (let i = 0; i < firstDay; i++) { days.push(<div key={`pad-${i}`} />); }
                        for (let d = 1; d <= lastDate; d++) {
                          const currentStr = `${auditCalDate.getFullYear()}-${String(auditCalDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                          const isSelected = auditDate === currentStr;
                          const isToday = todayStr === currentStr;
                          const isFuture = currentStr > todayStr;
                          days.push(
                            <div key={d} onClick={(e) => { e.stopPropagation(); if (isFuture) return; setAuditDate(currentStr); setShowAuditCalendar(false); }}
                              style={{ padding: '6px 0', textAlign: 'center', fontSize: '0.75rem', borderRadius: '6px', cursor: isFuture ? 'default' : 'pointer', color: isFuture ? 'rgba(255,255,255,0.15)' : '#ffffff', background: isSelected ? '#ffffff' : (isToday ? 'rgba(255,255,255,0.1)' : 'transparent'), color: isSelected ? '#000' : (isFuture ? 'rgba(255,255,255,0.15)' : '#ffffff'), fontWeight: isSelected || isToday ? '800' : '500', transition: 'all 0.2s' }}
                              onMouseOver={(e) => { if(!isSelected && !isFuture) e.target.style.background = 'rgba(255,255,255,0.15)' }}
                              onMouseOut={(e) => { if(!isSelected && !isFuture) e.target.style.background = (isToday ? 'rgba(255,255,255,0.1)' : 'transparent') }}
                            >{d}</div>
                          );
                        }
                        return days;
                      })()}
                    </div>

                    <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'center' }}>
                      <button onClick={(e) => { e.stopPropagation(); setAuditDate(todayStr); setShowAuditCalendar(false); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '800' }}>Today</button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Live count badge */}
          {(() => {
            const filteredAuditLogs = (() => {
              // Filter by date if date mode is active
              const base = auditDateMode === 'date'
                ? audits.filter(a => a.timestamp && new Date(a.timestamp).toISOString().split('T')[0] === auditDate)
                : audits
              // Always show newest first in the audit trail table
              return [...base].reverse()
            })()
            const showEmpty = filteredAuditLogs.length === 0
            return (
              <>
                <div style={{ marginBottom: '0.8rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <h2 style={{ margin: 0, fontSize: '1.6rem', color: '#fff', fontWeight: '900', letterSpacing: '-0.03em' }}>Audit Trail</h2>
                  <span style={{ 
                    background: 'rgba(255,255,255,0.1)', 
                    color: '#ffffff', 
                    fontSize: '0.72rem', 
                    fontWeight: '900', 
                    padding: '4px 12px', 
                    borderRadius: '999px', 
                    border: '1px solid #ffffff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    {filteredAuditLogs.length} records
                  </span>
                </div>

                <div style={{ 
                  position: 'relative', 
                  borderRadius: '16px', 
                  overflow: 'hidden', 
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%'
                }}>
                  <GlassSurface width="100%" height="auto" borderRadius={16} blur={20} opacity={0.03} brightness={110}>
                    <div style={{ 
                      width: '100%', 
                      maxHeight: 'calc(100vh - 250px)',
                      boxSizing: 'border-box', 
                      overflowY: 'auto', 
                      display: 'flex',
                      flexDirection: 'column'
                    }} className="custom-scrollbar">
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ 
                            borderBottom: '1px solid rgba(255,255,255,0.2)', 
                            background: '#18181b',
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
                      statusBg = "rgba(34, 197, 94, 0.2)";
                      displayStatus = `OK ${sCode}`;
                    } else if (log.status === "SUCCESS" || sCode === "SUCCESS") {
                      statusColor = "#ffffff";
                      statusBg = "rgba(34, 197, 94, 0.2)";
                      displayStatus = "SUCCESS";
                    } else {
                      statusColor = "#ffffff";
                      statusBg = "rgba(255, 255, 255, 0.08)";
                    }
                  } catch(e) {}

                  return (
                    <tr key={idx} style={{ borderBottom: '0.6px solid rgba(255,255,255,0.3)', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '1.2rem', color: '#ffffff', opacity: 0.5, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
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
                          whiteSpace: 'nowrap',
                          display: 'inline-block',
                          background: statusBg,
                          color: '#ffffff',
                          border: statusBg.includes('239') 
                            ? '1px solid rgba(239,68,68,0.6)' 
                            : statusBg.includes('34, 197') 
                              ? '1px solid rgba(34,197,94,0.5)' 
                              : '1px solid rgba(255,255,255,0.2)'
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

    {/* ─── Glassmorphic Confirm Modal ───────────────────────────────────────── */}
    {confirmModal && (
      <div
        onClick={() => setConfirmModal(null)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.2s ease'
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'rgba(15, 15, 15, 0.85)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '0.6px solid rgba(255,255,255,0.18)',
            borderRadius: '20px',
            padding: '2rem 2.5rem',
            width: '380px',
            boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)',
            animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* Icon */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: confirmModal.type === 'delete' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
              border: confirmModal.type === 'delete' ? '0.6px solid rgba(239,68,68,0.4)' : '0.6px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
            }}>
              {confirmModal.type === 'delete' ? '🗑' : confirmModal.type === 'block' ? '🔒' : '🔓'}
            </div>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#ffffff', letterSpacing: '-0.03em' }}>
              {confirmModal.type === 'delete' ? 'Delete User' :
               confirmModal.type === 'block' ? 'Block User' : 'Unblock User'}
            </div>
          </div>

          {/* Body */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <p style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.55)', fontWeight: '500', lineHeight: 1.6, margin: 0 }}>
              {confirmModal.type === 'delete'
                ? <>Are you sure you want to permanently delete <strong style={{ color: '#ffffff' }}>{confirmModal.user.username}</strong>? This cannot be undone.</>
                : confirmModal.type === 'block'
                  ? <>Block <strong style={{ color: '#ffffff' }}>{confirmModal.user.username}</strong>? They will lose access immediately.</>
                  : <>Unblock <strong style={{ color: '#ffffff' }}>{confirmModal.user.username}</strong>? They will regain full access.</>
              }
            </p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setConfirmModal(null)}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.06)',
                border: '0.6px solid rgba(255,255,255,0.15)',
                color: '#ffffff', fontWeight: '700', fontSize: '0.85rem',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              style={{
                flex: 1, padding: '12px', borderRadius: '10px',
                background: confirmModal.type === 'delete' ? 'rgba(239,68,68,0.2)' : '#ffffff',
                border: confirmModal.type === 'delete' ? '0.6px solid rgba(239,68,68,0.5)' : 'none',
                color: confirmModal.type === 'delete' ? '#ef4444' : '#000000',
                fontWeight: '900', fontSize: '0.85rem',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              {confirmModal.type === 'delete' ? 'Delete' :
               confirmModal.type === 'block' ? 'Block' : 'Unblock'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ─── Toast Notification ───────────────────────────────────────────────── */}
    {toast && (
      <div style={{
        position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 99999,
        background: 'rgba(15, 15, 15, 0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: toast.variant === 'error'
          ? '0.6px solid rgba(239,68,68,0.4)'
          : '0.6px solid rgba(255,255,255,0.18)',
        borderRadius: '14px',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: '12px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        maxWidth: '340px'
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
          background: toast.variant === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
          border: toast.variant === 'error' ? '0.6px solid rgba(239,68,68,0.3)' : '0.6px solid rgba(34,197,94,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
        }}>
          {toast.variant === 'error' ? '✗' : '✓'}
        </div>
        <span style={{ color: '#ffffff', fontWeight: '700', fontSize: '0.88rem', letterSpacing: '-0.01em' }}>
          {toast.message}
        </span>
      </div>
    )}

    <style>{`
      @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      @keyframes slideInRight { from { opacity: 0; transform: translateX(30px) } to { opacity: 1; transform: translateX(0) } }
    `}</style>
    </>
  )
}
