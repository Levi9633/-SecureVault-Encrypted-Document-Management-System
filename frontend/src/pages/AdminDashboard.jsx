import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import api, { getAnalytics, getUsers, getAudits, getSupabaseAudits } from '../services/api'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'

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
  const rtScrollRef = useRef(null)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

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
        if (action.includes('upload')) counts[key].Uploads++
        else if (action.includes('download')) counts[key].Downloads++
        else if (action.includes('auth') || action.includes('login') || action.includes('signup')) counts[key].Auth++
        else counts[key].Other++
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
    
    audits.forEach(a => {
      const finalUser = cleanUser(a.username)
      
      const lower = finalUser.toLowerCase()
      const isSystem = ['system', 'admin', 'guest', 'unknown', 'gateway', 'service_role', 'supabase_admin'].some(s => lower.includes(s))
      if (isSystem) return
      
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
      }
    })
    
    return Object.values(data)
      .sort((a, b) => (b.api + b.uploads + b.downloads) - (a.api + a.uploads + a.downloads))
      .slice(0, 12)
  }, [audits, userMapping])

  const userActivityTimeData = useMemo(() => {
    const userBuckets = {} 
    
    audits.forEach(a => {
      const finalUser = cleanUser(a.username)

      if (['system', 'admin', 'guest', 'unknown', 'service_role'].some(s => finalUser.toLowerCase().includes(s))) return
      
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
  }, [audits, userMapping])


  // ─── API Gateway Processors (API Tab) ────────────────────────────────────────

  const apiLogs = useMemo(() => {
    return audits.map(a => {
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
  }, [audits])

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
    
    // Performance optimization: Render max 500 individual bars to avoid SVG lag
    return apiLogs
      .filter(a => a.action === 'API_REQUEST' && (a.ms ?? 0) > 0)
      .slice(-500) 
      .map((a, i) => {
        const isError = (a.status || 200) >= 400;
        return {
          name: i,
          timeLabel: new Date(a.timestamp).toLocaleString(),
          Requests: 1,
          SuccessCount: isError ? 0 : 1,
          ErrorCount: isError ? 1 : 0,
          ResponseTime: a.ms,
          Status: a.status || 200,
          Endpoint: a.endpoint || 'Unknown'
        }
      })
  }, [apiLogs])

  // Auto-scroll response time chart to the RIGHT so newest data is always visible
  useEffect(() => {
    if (rtScrollRef.current) {
      rtScrollRef.current.scrollLeft = rtScrollRef.current.scrollWidth
    }
  }, [apiChartData])

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
          <h1 style={{ margin: 0, fontSize: '1.6rem', letterSpacing: '-0.03em' }}>🛠️ Admin Control Panel</h1>
          <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.85rem' }}>Real-time system health and user engagement intelligence</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => nav('/dashboard')} style={{ width: 'auto', borderRadius: '8px', padding: '0.5rem 1.25rem' }}>
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
      {/* ─── Global Analytics Tab ─────────────────────────────────────────────── */}
      {currentTab === 'analytics' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '320px 1fr', 
          gridTemplateRows: 'auto auto',
          gap: '1rem', 
          alignItems: 'start', 
          paddingBottom: '2rem' 
        }}>

          {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '300px', overflowY: 'auto' }}>
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

          {/* ── BOTTOM LEFT: Pie Chart ────────────────────────────────────── */}
          <div style={{ gridColumn: '1', gridRow: '2' }}>
            {/* User Activity Time Pie Chart */}
            <div style={{ 
              background: '#161616', 
              border: '1px solid #2d2d2d', 
              borderRadius: '8px', 
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              height: '420px', 
              transition: 'all 0.3s ease'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#e5e7eb', fontWeight: '600', marginBottom: '1rem' }}>Active Duration <span style={{ color: '#52525b', fontWeight: '400' }}>(min)</span></div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {userActivityTimeData.length > 0 ? (
                    <PieChart>
                      <Pie
                        data={userActivityTimeData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                        animationDuration={1000}
                        animationEasing="ease-out"
                      >
                        {userActivityTimeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div style={{ background: '#1e1e1e', border: '1px solid #2d2d2d', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#fff', boxShadow: '0 10px 15px rgba(0,0,0,0.5)' }}>
                                <div style={{ color: payload[0].payload.fill, fontWeight: 'bold' }}>{payload[0].name}</div>
                                <div style={{ marginTop: '4px' }}>{payload[0].value} active minutes</div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                    </PieChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '0.8rem' }}>No session data</div>
                  )}
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {userActivityTimeData.slice(0, 6).map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── TOP RIGHT: API Performance ───────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', gridColumn: '2', gridRow: '1' }}>
            {/* API Performance Block */}
            <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '8px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
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
                <div ref={rtScrollRef} style={{ height: '140px', overflowX: 'auto', overflowY: 'hidden' }}>
                  <div style={{ width: Math.max(apiChartData.length * 8, 300), height: '140px' }}>
                    <BarChart width={Math.max(apiChartData.length * 8, 300)} height={140} data={apiChartData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }} barCategoryGap={1}>
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
                  </div>
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

          {/* ── BOTTOM RIGHT: User Engagement ─────────────────────────────── */}
            <div style={{ gridColumn: '2', gridRow: '2' }}>
              {/* User Activity Section (Grouped Bar Chart) */}
              <div style={{ 
                background: '#161616', 
                border: '1px solid #2d2d2d', 
                borderRadius: '12px', 
                padding: '1.5rem',
                height: '420px', 
                display: 'flex',
                flexDirection: 'column',
                transition: 'all 0.3s ease'
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', letterSpacing: '-0.02em' }}>User Engagement</h3>
                  <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.8rem' }}>Per-user breakdown of API interaction vs File operations</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', background: '#0a0a0a', padding: '8px 16px', borderRadius: '8px', border: '1px solid #2d2d2d' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', background: '#34d399', borderRadius: '50%' }} />
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>API</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', background: '#3b82f6', borderRadius: '50%' }} />
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Uploads</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '8px', height: '8px', background: '#a855f7', borderRadius: '50%' }} />
                    <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>Downloads</span>
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, width: '100%', minHeight: 0, overflowX: 'auto', overflowY: 'hidden' }} className="custom-scrollbar">
                <div style={{ width: Math.max(userActivityData.length * 80, 400), height: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                  {userActivityData.length > 0 ? (
                    <BarChart data={userActivityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#71717a', fontSize: 11, fontWeight: '500' }} 
                        dy={10} 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#71717a', fontSize: 11 }} 
                      />
                      <RechartsTooltip 
                        cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div style={{ 
                                background: '#1e1e1e', 
                                border: '1px solid #3b82f6', 
                                padding: '12px', 
                                borderRadius: '8px', 
                                boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' 
                              }}>
                                <p style={{ margin: '0 0 10px', fontWeight: '600', color: '#fff', fontSize: '0.9rem', borderBottom: '1px solid #2d2d2d', paddingBottom: '6px' }}>{label}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '4px' }}>
                                  <span style={{ color: '#34d399', fontSize: '0.8rem' }}>API Hits</span>
                                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem' }}>{payload[0].value}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem', marginBottom: '4px' }}>
                                  <span style={{ color: '#3b82f6', fontSize: '0.8rem' }}>Uploads</span>
                                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem' }}>{payload[1].value}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '2rem' }}>
                                  <span style={{ color: '#a855f7', fontSize: '0.8rem' }}>Downloads</span>
                                  <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '0.8rem' }}>{payload[2].value}</span>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                      />
                      <Bar dataKey="api" fill="#34d399" radius={[4, 4, 0, 0]} barSize={20} animationDuration={1200} />
                      <Bar dataKey="uploads" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} animationDuration={1200} />
                      <Bar dataKey="downloads" fill="#a855f7" radius={[4, 4, 0, 0]} barSize={20} animationDuration={1200} />
                    </BarChart>
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', border: '1px dashed #2d2d2d', borderRadius: '12px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📊</div>
                        <div style={{ fontSize: '0.9rem' }}>Waiting for user activity logs...</div>
                      </div>
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
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

          <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d2d2d', background: '#1c1c1c' }}>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Username</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Files Saved</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Total Req</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Uploads</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Downloads</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Allocated</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Storage Used</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((user, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #262626', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#1c1c1c'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.95rem' }}>{user.username}</div>
                      <div style={{ color: '#52525b', fontSize: '0.75rem' }}>{user.email}</div>
                    </td>
                    <td style={{ padding: '1.2rem', color: '#3b82f6', fontWeight: '600' }}>{user.files_count}</td>
                    <td style={{ padding: '1.2rem', color: '#fff' }}>{user.total_requests}</td>
                    <td style={{ padding: '1.2rem', color: '#34d399' }}>{user.uploads}</td>
                    <td style={{ padding: '1.2rem', color: '#a855f7' }}>{user.downloads}</td>
                    <td style={{ padding: '1.2rem', color: '#71717a' }}>50.00 MB</td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ color: '#fff', fontWeight: '600' }}>{(user.storage_used / (1024 * 1024)).toFixed(2)} MB</div>
                      <div style={{ height: '4px', width: '60px', background: '#2d2d2d', borderRadius: '2px', marginTop: '6px' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, (user.storage_used / user.storage_limit) * 100)}%`, background: user.storage_used > user.storage_limit * 0.9 ? '#ef4444' : '#3b82f6', borderRadius: '2px' }} />
                      </div>
                    </td>
                    <td style={{ padding: '1.2rem' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          onClick={() => handleToggleBlock(user.id, user.is_blocked)}
                          style={{ background: '#262626', border: '1px solid #3d3d3d', color: '#fff', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          {user.is_blocked ? '🔓 Unblock' : '🚫 Block'}
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user.id)}
                          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {usersList.length === 0 && !userLoading && (
              <div style={{ padding: '5rem', textAlign: 'center', color: '#71717a' }}>No data available. Refresh to try again.</div>
            )}
          </div>
        </div>
      )}
      {/* ─── Audit Logs Tab ─────────────────────────────────────────────────── */}
      {currentTab === 'audits' && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Audit Trail</h2>
              <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: '0.85rem' }}>Immutable record of all system operations and security events</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-outline btn-sm" onClick={() => window.location.reload()} style={{ borderRadius: '8px' }}>
                🔄 Refresh Logs
              </button>
            </div>
          </div>

          <div style={{ background: '#161616', border: '1px solid #2d2d2d', borderRadius: '12px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2d2d2d', background: '#1c1c1c' }}>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', width: '200px' }}>Timestamp</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', width: '150px' }}>User</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', width: '150px' }}>Action</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', width: '120px' }}>Status</th>
                  <th style={{ padding: '1.2rem', color: '#9ca3af', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase' }}>Details / Context</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((log, idx) => {
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
                      statusColor = "#f87171";
                      statusBg = "rgba(239, 68, 68, 0.1)";
                      displayStatus = sCode === "FAILURE" ? "FAILURE" : `ERROR ${sCode}`;
                    } else if (typeof sCode === 'number' && sCode < 400) {
                      displayStatus = `OK ${sCode}`;
                    }
                  } catch(e) {}

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #262626', transition: 'background 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#1c1c1c'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding: '1rem 1.2rem', color: '#a1a1aa', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '1rem 1.2rem' }}>
                        <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.9rem' }}>{log.username}</div>
                      </td>
                      <td style={{ padding: '1rem 1.2rem' }}>
                        <span style={{ 
                          padding: '4px 8px', 
                          background: '#2d2d2d', 
                          borderRadius: '4px', 
                          fontSize: '0.7rem', 
                          fontWeight: '700', 
                          color: '#d1d5db',
                          border: '1px solid #3d3d3d'
                        }}>
                          {displayAction}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.2rem' }}>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '6px', 
                          fontSize: '0.7rem', 
                          fontWeight: '700',
                          background: statusBg,
                          color: statusColor,
                          border: `1px solid ${statusColor}33`
                        }}>
                          {displayStatus}
                        </span>
                      </td>
                      <td style={{ padding: '1rem 1.2rem', color: '#d4d4d8', fontSize: '0.85rem' }}>
                        {context}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {audits.length === 0 && (
              <div style={{ padding: '5rem', textAlign: 'center', color: '#71717a' }}>
                No audit logs found. Actions will appear here as they occur.
              </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
