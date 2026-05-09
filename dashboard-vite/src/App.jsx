import { useState, useEffect, useRef } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const WS_URL = API_URL.replace('http', 'ws')

function useRoom(roomId, defaultUrl) {
  const [url, setUrl] = useState(defaultUrl)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [fps, setFps] = useState(0)
  const [frame, setFrame] = useState(null)
  const [rawFrame, setRawFrame] = useState(null)
  
  const [personCount, setPersonCount] = useState(0)
  const [lightStatus, setLightStatus] = useState('OFF')
  const [fanStatus, setFanStatus] = useState('OFF')
  const [monitorStatus, setMonitorStatus] = useState('OFF')
  const [roomStatus, setRoomStatus] = useState('secure')
  const [processingTime, setProcessingTime] = useState(0)
  const [avgBrightness, setAvgBrightness] = useState(0)
  
  const [microzoneData, setMicrozoneData] = useState(null)
  
  const wsRef = useRef(null)
  const fpsCounter = useRef({ count: 0, lastTime: Date.now() })
  
  const connect = async () => {
    setConnecting(true)
    try {
      const response = await fetch(`${API_URL}/api/camera/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, room_id: roomId })
      })
      if (!response.ok) { setConnecting(false); return; }
      
      setConnected(true)
      setConnecting(false)
      const ws = new WebSocket(`${WS_URL}/ws/stream/${roomId}`)
      wsRef.current = ws
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.frame) setFrame(data.frame)
          if (data.raw_frame) setRawFrame(data.raw_frame)
          setPersonCount(data.person_count)
          setLightStatus(data.light_status)
          setFanStatus(data.fan_status)
          setMonitorStatus(data.monitor_status || 'OFF')
          
          if (data.processing_time_ms !== undefined) {
            const serverTime = data.timestamp * 1000
            const now = Date.now()
            const realLatency = Math.max(0, now - serverTime)
            setProcessingTime(realLatency)
          }
          if (data.avg_brightness !== undefined) setAvgBrightness(data.avg_brightness)
          if (data.microzone) setMicrozoneData(data.microzone)
          
          const isWaste = data.person_count === 0 && (data.light_status === 'ON' || data.fan_status === 'ON' || data.monitor_status === 'ON')
          setRoomStatus(isWaste ? 'waste' : 'secure')
          
          fpsCounter.current.count++
          const now = Date.now()
          if (now - fpsCounter.current.lastTime >= 1000) {
            setFps(fpsCounter.current.count)
            fpsCounter.current.count = 0
            fpsCounter.current.lastTime = now
          }
        } catch (err) {}
      }
      ws.onclose = () => setConnected(false)
    } catch (err) { setConnecting(false) }
  }

  const disconnect = async () => {
    if (wsRef.current) wsRef.current.close()
    try { 
      await fetch(`${API_URL}/api/camera/disconnect`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId })
      }) 
    } catch (e) {}
    setConnected(false)
    setFrame(null)
  }

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  return {
    roomId, url, setUrl, connected, connecting, fps, frame, rawFrame,
    personCount, lightStatus, fanStatus, monitorStatus, roomStatus, setRoomStatus, 
    processingTime, avgBrightness, microzoneData, connect, disconnect
  }
}


function CalibrationStudio({ room1, room2, calibrationData, onUpdate, onRefresh, loading }) {
  const [selectedRoomId, setSelectedRoomId] = useState('room-101')
  const [mode, setMode] = useState('day') // 'day' or 'night'
  
  const currentRoom = selectedRoomId === 'room-101' ? room1 : room2
  const roomCalib = (calibrationData.rooms || {})[selectedRoomId] || {}
  
  const [dark, setDark] = useState(80)
  const [medium, setMedium] = useState(160)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const data = mode === 'day' ? roomCalib.day : roomCalib.night
    setDark(data?.dark_threshold || (mode === 'day' ? 80 : 40))
    setMedium(data?.medium_threshold || (mode === 'day' ? 160 : 100))
  }, [roomCalib, mode])

  const handleSave = () => {
    const dDark = mode === 'day' ? dark : (roomCalib.day?.dark_threshold || 80)
    const dMed = mode === 'day' ? medium : (roomCalib.day?.medium_threshold || 160)
    const nDark = mode === 'night' ? dark : (roomCalib.night?.dark_threshold || 40)
    const nMed = mode === 'night' ? medium : (roomCalib.night?.medium_threshold || 100)
    
    onUpdate(selectedRoomId, dDark, dMed, nDark, nMed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const luminancePercent = (currentRoom.avgBrightness / 255) * 100

  return (
    <div className="calib-studio">
      <div className="calib-preview-panel">
        <header>
          <h2 className="studio-title">LUMINANCE_STUDIO_V1</h2>
          <p className="studio-subtitle">REAL_TIME_THRESHOLD_CALIBRATION // {selectedRoomId.toUpperCase()}</p>
        </header>

        <div className="video-container" style={{ flex: 1, maxHeight: '60%' }}>
          <div className="video-header">
            <span className="v-tag">LIVE_FEED // CALIBRATION_REFERENCE</span>
            <span className="v-alert secure">LUM: {currentRoom.avgBrightness?.toFixed(1)}</span>
          </div>
          <div className="video-frame">
            {currentRoom.frame ? (
              <img src={currentRoom.frame} alt="Calibration feed" className="pixel-stream" />
            ) : (
              <div className="placeholder">CONNECT CAMERA TO VIEW LIVE LUMINANCE</div>
            )}
            <div className="scanline" />
          </div>
        </div>

        <div className="glass-card">
          <h4 className="card-title">◈ LIVE_LUMINANCE_METER</h4>
          <div style={{ padding: '20px 0 10px 0' }}>
            <div className="meter-strip">
              <div className="meter-fill" style={{ width: `${luminancePercent}%` }} />
              <div className="meter-cursor" style={{ left: `${luminancePercent}%` }} />
              
              {/* Threshold Markers */}
              <div className="threshold-marker dark" style={{ left: `${(dark/255)*100}%` }}>
                <span className="threshold-label" style={{ color: '#f87171' }}>DARK_{dark}</span>
              </div>
              <div className="threshold-marker medium" style={{ left: `${(medium/255)*100}%` }}>
                <span className="threshold-label" style={{ color: '#60a5fa' }}>MED_{medium}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.5, marginTop: '5px' }}>
            <span>0 (TOTAL_DARK)</span>
            <span>128</span>
            <span>255 (BLINDING)</span>
          </div>
        </div>
      </div>

      <div className="sidebar-right" style={{ background: 'transparent', border: 'none', padding: 0 }}>
        <div className="calib-controls-scroll">
          <section className="glass-card">
            <h4 className="card-title">◈ SELECT_ROOM</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                className={`btn ${selectedRoomId === 'room-101' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelectedRoomId('room-101')}
              >
                ROOM_101
              </button>
              <button 
                className={`btn ${selectedRoomId === 'room-102' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setSelectedRoomId('room-102')}
              >
                ROOM_102
              </button>
            </div>
          </section>

          <section className="glass-card">
            <h4 className="card-title">◈ CALIBRATION_MODE</h4>
            <div className="mode-selector">
              <button className={`mode-btn ${mode === 'day' ? 'active' : ''}`} onClick={() => setMode('day')}>DAY_SET</button>
              <button className={`mode-btn ${mode === 'night' ? 'active' : ''}`} onClick={() => setMode('night')}>NIGHT_SET</button>
            </div>
            
            <div className="range-wrap">
              <div className="range-header">
                <span className="l">DARK_THRESHOLD</span>
                <span className="v">{dark}</span>
              </div>
              <input 
                type="range" className="custom-slider" 
                min="0" max="255" value={dark} 
                onChange={(e) => setDark(parseInt(e.target.value))} 
              />
            </div>

            <div className="range-wrap">
              <div className="range-header">
                <span className="l">MEDIUM_THRESHOLD</span>
                <span className="v">{medium}</span>
              </div>
              <input 
                type="range" className="custom-slider" 
                min="0" max="255" value={medium} 
                onChange={(e) => setMedium(parseInt(e.target.value))} 
              />
            </div>

            <button 
              className={`btn ${saved ? 'btn-primary' : 'btn-danger'}`} 
              onClick={handleSave}
              style={{ background: saved ? '' : '#ff003c', color: '#fff' }}
            >
              {saved ? 'SETTINGS_APPLIED' : 'COMMIT_CHANGES'}
            </button>
          </section>

          <section className="glass-card">
            <h4 className="card-title">◈ SYSTEM_STATUS</h4>
            <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Current Lum:</span>
                <span style={{ color: 'var(--accent-neon)' }}>{currentRoom.avgBrightness?.toFixed(1)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.6 }}>Classification:</span>
                <span style={{ color: currentRoom.avgBrightness < dark ? '#f87171' : currentRoom.avgBrightness < medium ? '#60a5fa' : '#4ade80' }}>
                  {currentRoom.avgBrightness < dark ? 'DARK' : currentRoom.avgBrightness < medium ? 'MEDIUM' : 'BRIGHT'}
                </span>
              </div>
              <button 
                className="btn btn-outline" 
                onClick={onRefresh} 
                style={{ marginTop: '12px', fontSize: '9px' }}
                disabled={loading}
              >
                {loading ? 'RE-SYNCING...' : 'SYNC_FROM_HARDWARE'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}


function App() {
  const [activeTab, setActiveTab] = useState('monitor')
  const [runningTime, setRunningTime] = useState(0)
  const [calibrationData, setCalibrationData] = useState({})
  const [calibrationLoading, setCalibrationLoading] = useState(false)
  const [energyDashboard, setEnergyDashboard] = useState({})
  const [privacyAssurance, setPrivacyAssurance] = useState({})
  const [dbInfo, setDbInfo] = useState({})
  const [dbSchema, setDbSchema] = useState({ tables: [] })
  const [browsedTable, setBrowsedTable] = useState(null)
  const [browsedRows, setBrowsedRows] = useState([])
  const [browsing, setBrowsing] = useState(false)
  
  const room1 = useRoom('room-101', 'http://192.168.0.154:8080/video')
  const room2 = useRoom('room-102', 'http://192.168.0.155:8080/video')
  
  const [demoMode, setDemoMode] = useState(false)
  const [privacyEnabled, setPrivacyEnabled] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  
  const [alertEvents, setAlertEvents] = useState([])
  const [energyMetrics, setEnergyMetrics] = useState({})
  
  const startTime = useRef(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setRunningTime(Math.floor((Date.now() - startTime.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activeTab === 'calibration') {
      fetchCalibration()
    }
    if (activeTab === 'dashboard') {
      fetchEnergyDashboard()
    }
    if (activeTab === 'privacy') {
      fetchPrivacyAssurance()
    }
    if (activeTab === 'database') {
      fetchDatabaseData()
    }
  }, [activeTab])

  const fetchEnergyDashboard = async () => {
    try {
      const res = await fetch(`${API_URL}/api/energy/dashboard`)
      const data = await res.json()
      setEnergyDashboard(data)
    } catch (err) {
      console.error('Failed to fetch energy dashboard:', err)
    }
  }

  const fetchPrivacyAssurance = async () => {
    try {
      const res = await fetch(`${API_URL}/api/privacy/assurance`)
      const data = await res.json()
      setPrivacyAssurance(data)
    } catch (err) {
      console.error('Failed to fetch privacy assurance:', err)
    }
  }

  const fetchDatabaseData = async () => {
    try {
      const [infoRes, schemaRes] = await Promise.all([
        fetch(`${API_URL}/api/database/info`),
        fetch(`${API_URL}/api/database/schema`)
      ])
      const info = await infoRes.json()
      const schema = await schemaRes.json()
      setDbInfo(info)
      setDbSchema(schema)
    } catch (err) {
      console.error('Failed to fetch database data:', err)
    }
  }

  const fetchDatabaseRows = async (tableName) => {
    setBrowsing(true)
    setBrowsedTable(tableName)
    try {
      const res = await fetch(`${API_URL}/api/database/rows/${tableName}`)
      const data = await res.json()
      setBrowsedRows(data.rows || [])
    } catch (err) {
      console.error('Failed to browse table:', err)
    } finally {
      setBrowsing(false)
    }
  }

  const fetchCalibration = async () => {
    setCalibrationLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/calibration`)
      const data = await res.json()
      setCalibrationData(data)
    } catch (err) {
      console.error('Failed to fetch calibration:', err)
    }
    setCalibrationLoading(false)
  }

  const updateCalibration = async (roomId, dayDark, dayMedium, nightDark, nightMedium) => {
    try {
      const res = await fetch(`${API_URL}/api/calibration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          day_dark: dayDark,
          day_medium: dayMedium,
          night_dark: nightDark,
          night_medium: nightMedium
        })
      })
      const data = await res.json()
      if (data.status === 'success') {
        fetchCalibration()
      }
    } catch (err) {
      console.error('Failed to update calibration:', err)
    }
  }

  useEffect(() => {
    // Only fetch alerts/metrics if at least one room is connected
    if (!room1.connected && !room2.connected) return
    const fetchData = async () => {
      try {
        const [eventsRes, metricsRes] = await Promise.all([
          fetch(`${API_URL}/api/alerts/events?limit=8`),
          fetch(`${API_URL}/api/energy/metrics`)
        ])
        const eventsData = await eventsRes.json()
        setAlertEvents(eventsData.events || [])
        const metricsData = await metricsRes.json()
        setEnergyMetrics(metricsData.rooms || {})
      } catch (err) {}
    }
    fetchData()
    const interval = setInterval(fetchData, 4000)
    return () => clearInterval(interval)
  }, [room1.connected, room2.connected])

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startDemo = (scenario) => {
    setDemoMode(true)
    const stat = scenario === 'empty-room-appliances-on' ? 'waste' : 'secure'
    room1.setRoomStatus(stat)
    room2.setRoomStatus(stat)
  }

  const stopDemo = () => setDemoMode(false)

  const renderRoomControls = (room, nameLabel) => (
    <section className="ctrl-group">
      <h4 className="section-title">{nameLabel}</h4>
      <div className="input-row">
        <input type="text" value={room.url} onChange={(e) => room.setUrl(e.target.value)} disabled={room.connected} />
        {!room.connected ? (
          <button className="btn btn-primary" onClick={room.connect} disabled={room.connecting}>{room.connecting ? '...' : 'CONNECT'}</button>
        ) : (
          <button className="btn btn-danger" onClick={room.disconnect}>DISCONNECT</button>
        )}
      </div>
    </section>
  )

  const renderVideoContainer = (room, title) => {
    const isEnergyWaste = room.roomStatus === 'waste'
    const rMetrics = energyMetrics[room.roomId] || {}
    const potentialWatts = isEnergyWaste && rMetrics.estimated_watts ? rMetrics.estimated_watts : 0

    return (
      <div className="video-container">
        <div className="video-header">
          <span className="v-tag">{title}</span>
          <span className={`v-alert ${room.roomStatus}`}>{room.roomStatus === 'waste' ? '!!! WASTE_DETECTED !!!' : 'SECURE'}</span>
        </div>
        <div className="video-frame">
          {room.frame || demoMode ? (
            <img src={showRaw && room.rawFrame ? room.rawFrame : room.frame} alt={`${title} feed`} className="pixel-stream" />
          ) : (
            <div className="placeholder">OFFLINE</div>
          )}
          <div className="scanline" />
          <div className="corner tl" /><div className="corner tr" />
          <div className="corner bl" /><div className="corner br" />
        </div>
        {isEnergyWaste && (
          <div className="ticker-wrap">
            <div className="ticker-text">WASTE_DETECTION_ACTIVE: REDUCE LOAD BY {potentialWatts}W IMMEDIATELY // TERM_IDLE_APPLIANCES</div>
          </div>
        )}
      </div>
    )
  }

  const renderRoomAnalytics = (room, title) => {
    const rMetrics = energyMetrics[room.roomId] || {}
    const estimatedWatts = room.connected && rMetrics.estimated_watts ? rMetrics.estimated_watts : 0
    const cumulativeCost = room.connected && rMetrics.cumulative_cost ? rMetrics.cumulative_cost : 0
    
    return (
      <div className="glass-card" style={{ marginBottom: '12px' }}>
        <h4 className="card-title">◈ {title} STATS</h4>
        <div className="obj-grid" style={{ marginBottom: '8px' }}>
          <div className="obj-item major"><span className="l">OCCUPANTS</span><span className="v">{room.personCount.toString().padStart(2, '0')}</span></div>
          <div className="obj-item"><span className="l">LUMINANCE</span><span className={`v ${room.lightStatus === 'ON' ? 'on' : ''}`}>{room.lightStatus}</span></div>
          <div className="obj-item"><span className="l">VENTILATION</span><span className={`v ${room.fanStatus === 'ON' ? 'on' : ''}`}>{room.fanStatus}</span></div>
        </div>
        <div className="metrics-stack">
          <div className="m-row"><span className="l">LOAD</span><span className="v">{estimatedWatts}W</span></div>
          <div className={`m-row waste ${cumulativeCost > 0 ? 'active' : ''}`}><span className="l">CUMULATIVE_WASTE</span><span className="v">₹{cumulativeCost.toFixed(4)}</span></div>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="main-header">
        <div className="branding">
          <div className="logo-section">
            <span className="logo-main">CAM SENSE</span>
            <span className="logo-sub">INTEL_MONITORING V2.0</span>
          </div>
          <div className="status-badge pulse">SYSTEM_ACTIVE</div>
        </div>

        <div className="telemetry">
          <div className="tele-item">
            <span className="label">UPTIME</span>
            <span className="val">{formatTime(runningTime)}</span>
          </div>
          <div className="tele-item">
            <span className="label">AVG_FPS</span>
            <span className="val">{Math.max(room1.fps, room2.fps)}</span>
          </div>
          <div className="tele-item">
            <span className="label">LATENCY</span>
            <span className="val">{(room1.connected || room2.connected) ? `${Math.max(room1.processingTime, room2.processingTime).toFixed(0)}ms` : '---'}</span>
          </div>
        </div>

        <nav className="header-nav">
          <button className={`nav-btn ${activeTab === 'monitor' ? 'active' : ''}`} onClick={() => setActiveTab('monitor')}>◈ MONITOR</button>
          <button className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>◈ SUMMARY</button>
          <button className={`nav-btn ${activeTab === 'privacy' ? 'active' : ''}`} onClick={() => setActiveTab('privacy')}>◈ PRIVACY</button>
          <button className={`nav-btn ${activeTab === 'calibration' ? 'active' : ''}`} onClick={() => setActiveTab('calibration')}>◈ CALIBRATE</button>
          <button className={`nav-btn ${activeTab === 'database' ? 'active' : ''}`} onClick={() => setActiveTab('database')}>◈ DATABASE</button>
        </nav>
      </header>

      {activeTab === 'monitor' && (
        <div className="dashboard-grid">
          <aside className="sidebar-left">
            {renderRoomControls(room1, 'SOURCE // ROOM_101')}
            {renderRoomControls(room2, 'SOURCE // ROOM_102')}

            <section className="ctrl-group">
              <h4 className="section-title">SECURE_FILTERS</h4>
              <div className={`filter-card ${privacyEnabled ? 'active' : ''}`}>
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={privacyEnabled} onChange={(e) => setPrivacyEnabled(e.target.checked)} />
                  <span className="check-label">GHOST_MODE</span>
                </label>
                <p className="filter-desc">{privacyEnabled ? 'PIXEL_PROTECT_ENABLED' : 'RAW_FEED_EXPOSED'}</p>
              </div>
            </section>

            <section className="ctrl-group">
              <h4 className="section-title">TEST_SEQUENCES</h4>
              <div className="demo-btns">
                <button className="btn btn-outline" onClick={() => startDemo('empty-room-appliances-on')}>EMIT_WASTE</button>
                <button className="btn btn-outline" onClick={() => startDemo('occupied-normal')}>EMIT_NORMAL</button>
              </div>
            </section>
          </aside>

          <main className="main-viewport multi-room">
            {renderVideoContainer(room1, 'ROOM_101 // WEST_WING')}
            {renderVideoContainer(room2, 'ROOM_102 // EAST_WING')}
          </main>

          <aside className="sidebar-right">
            {renderRoomAnalytics(room1, 'ROOM_101')}
            {renderRoomAnalytics(room2, 'ROOM_102')}

            <div className="glass-card history">
              <h4 className="card-title">◈ RECENT_ALERTS</h4>
              <div className="event-list">
                {alertEvents.length > 0 ? alertEvents.map((e, i) => (
                  <div key={i} className="event-item">
                    <span className="t">[{new Date(e.timestamp * 1000).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false})}] {e.room_id}</span>
                    <span className="d">{Math.floor(e.duration_seconds)}S</span>
                  </div>
                )) : (
                  <div className="event-item" style={{ borderLeftColor: 'transparent', textAlign: 'center' }}>
                    <span className="t" style={{width: '100%', opacity: 0.5}}>NO ALERTS DETECTED</span>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'calibration' && (
        <CalibrationStudio 
          room1={room1} 
          room2={room2} 
          calibrationData={calibrationData} 
          onUpdate={updateCalibration}
          onRefresh={fetchCalibration}
          loading={calibrationLoading}
        />
      )}

      {activeTab === 'dashboard' && (
        <div className="dashboard-grid">
          <aside className="sidebar-left">
            <section className="ctrl-group">
              <h4 className="section-title">ENERGY_SUMMARY</h4>
              <p style={{ fontSize: '11px', opacity: 0.7, marginBottom: '12px' }}>
                Stakeholder one-slide energy impact report
              </p>
              <button className="btn btn-primary" onClick={fetchEnergyDashboard} style={{ width: '100%' }}>
                REFRESH
              </button>
            </section>
          </aside>

          <main className="main-viewport">
            <div style={{ padding: '20px' }}>
              <div className="glass-card" style={{ background: 'linear-gradient(135deg, #1a3a2a 0%, #0d2818 100%)' }}>
                <h4 className="card-title">◈ ANNUAL_PROJECTIONS</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '16px' }}>
                  <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4ade80' }}>
                      {energyDashboard.projections?.kwh_per_day || 0}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>kWh / DAY</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#fbbf24' }}>
                      ₹{energyDashboard.projections?.inr_per_year || 0}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>SAVINGS / YEAR (INR)</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#60a5fa' }}>
                      {energyDashboard.projections?.co2_per_year_kg || 0}
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '8px' }}>kg CO₂ / YEAR</div>
                  </div>
                </div>
              </div>

              <div className="glass-card" style={{ marginTop: '16px' }}>
                <h4 className="card-title">◈ LAST_30_DAYS</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '12px' }}>
                  <div><span className="l">ENERGY_SAVED</span><span className="v">{energyDashboard.total_energy_saved_kwh || 0} kWh</span></div>
                  <div><span className="l">COST_(INR)</span><span className="v">₹{energyDashboard.total_cost_saved_inr || 0}</span></div>
                  <div><span className="l">COST_(INR)</span><span className="v">₹{energyDashboard.total_cost_saved_inr || 0}</span></div>
                  <div><span className="l">CO2_SAVED</span><span className="v">{energyDashboard.total_co2_saved_kg || 0} kg</span></div>
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <h4 className="section-title" style={{ marginBottom: '12px' }}>◈ BY_ROOM</h4>
                {Object.keys(energyDashboard.rooms || {}).length > 0 ? (
                  Object.entries(energyDashboard.rooms).map(([roomId, data]) => (
                    <div key={roomId} className="glass-card" style={{ marginBottom: '8px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold' }}>{roomId.toUpperCase()}</span>
                        <div style={{ display: 'flex', gap: '20px', fontSize: '11px' }}>
                          <span><span style={{ opacity: 0.6 }}>kWh/d:</span> {data.kwh_per_day}</span>
                          <span><span style={{ opacity: 0.6 }}>₹/yr:</span> ₹{data.inr_per_year}</span>
                          <span><span style={{ opacity: 0.6 }}>CO₂/yr:</span> {data.co2_per_year_kg}kg</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="glass-card" style={{ textAlign: 'center', opacity: 0.6 }}>
                    No room data available yet
                  </div>
                )}
              </div>
            </div>
          </main>

          <aside className="sidebar-right">
            <div className="glass-card">
              <h4 className="card-title">◈ CONFIG</h4>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                <p><span style={{ opacity: 0.6 }}>Rate (INR):</span> ₹{energyDashboard.config?.electricity_rate_inr || 6.50}/kWh</p>
                <p><span style={{ opacity: 0.6 }}>Rate (INR):</span> ₹{energyDashboard.config?.electricity_rate_inr || 6.50}/kWh</p>
                <p><span style={{ opacity: 0.6 }}>CO₂ Factor:</span> {energyDashboard.config?.co2_factor_kg_per_kwh || 0.71} kg/kWh</p>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
                <p><span style={{ opacity: 0.6 }}>Total Load:</span> {energyDashboard.config?.total_appliance_watts || 140}W</p>
                <p style={{ fontSize: '10px', opacity: 0.5 }}>Light: {energyDashboard.config?.wattage_breakdown?.light || 40}W | Fan: {energyDashboard.config?.wattage_breakdown?.ceiling_fan || 65}W | Monitor: {energyDashboard.config?.wattage_breakdown?.monitor || 35}W</p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'privacy' && (
        <div className="dashboard-grid">
          <aside className="sidebar-left">
            <section className="ctrl-group">
              <h4 className="section-title">PRIVACY_ASSURANCE</h4>
              <p style={{ fontSize: '11px', opacity: 0.7, marginBottom: '12px' }}>
                Stakeholder privacy commitment report
              </p>
              <button className="btn btn-primary" onClick={fetchPrivacyAssurance} style={{ width: '100%' }}>
                REFRESH
              </button>
            </section>
          </aside>

          <main className="main-viewport">
            <div style={{ padding: '20px' }}>
              <div className="glass-card" style={{ background: 'linear-gradient(135deg, #1a2a3a 0%, #0d1828 100%)' }}>
                <h4 className="card-title">◈ PRIVACY_MEASURES</h4>
                <div style={{ marginTop: '16px' }}>
                  {Object.entries(privacyAssurance.measures || {}).map(([key, measure]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', marginBottom: '8px' }}>
                      <span style={{ 
                        width: '10px', height: '10px', borderRadius: '50%', 
                        background: measure.status === 'active' || measure.status === 'enabled' ? '#4ade80' : '#f87171',
                        marginRight: '12px'
                      }} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{key.replace('_', ' ').toUpperCase()}</div>
                        <div style={{ fontSize: '11px', opacity: 0.7 }}>{measure.description || measure.status}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card" style={{ marginTop: '16px' }}>
                <h4 className="card-title">◈ STAKEHOLDER_COMMITMENTS</h4>
                <ul style={{ marginTop: '12px', paddingLeft: '20px', fontSize: '12px', lineHeight: '2' }}>
                  {(privacyAssurance.stakeholder_commitments || []).map((commitment, idx) => (
                    <li key={idx} style={{ color: '#4ade80' }}>✓ {commitment}</li>
                  ))}
                </ul>
              </div>

              <div className="glass-card" style={{ marginTop: '16px' }}>
                <h4 className="card-title">◈ COMPLIANCE</h4>
                <div style={{ display: 'flex', gap: '20px', marginTop: '12px' }}>
                  {Object.entries(privacyAssurance.compliance || {}).map(([key, value]) => (
                    <div key={key} style={{ 
                      padding: '12px 20px', 
                      background: value ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)',
                      borderRadius: '6px',
                      border: `1px solid ${value ? '#4ade80' : '#f87171'}`
                    }}>
                      <span style={{ fontSize: '12px' }}>{key.replace('_', ' ').toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card" style={{ marginTop: '16px', background: 'rgba(0,0,0,0.3)' }}>
                <h4 className="card-title">◈ DATA_RETENTION</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '12px', fontSize: '11px' }}>
                  <div><span style={{ opacity: 0.6 }}>Raw Images:</span><br /><span style={{ color: '#4ade80' }}>{privacyAssurance.measures?.data_retention?.config?.raw_images || 'Never stored'}</span></div>
                  <div><span style={{ opacity: 0.6 }}>Thumbnails:</span><br /><span>{privacyAssurance.measures?.data_retention?.config?.anonymized_thumbnails || '30 days'}</span></div>
                  <div><span style={{ opacity: 0.6 }}>Detection Logs:</span><br /><span>90 days</span></div>
                </div>
              </div>
            </div>
          </main>

          <aside className="sidebar-right">
            <div className="glass-card">
              <h4 className="card-title">◈ VERIFICATION</h4>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                <p><span style={{ opacity: 0.6 }}>Status:</span> <span style={{ color: '#4ade80' }}>VERIFIED</span></p>
                <p><span style={{ opacity: 0.6 }}>Last Checked:</span><br />{privacyAssurance.last_verified || 'N/A'}</p>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
                <p style={{ fontSize: '10px', opacity: 0.7 }}>
                  This system processes all data locally with no cloud transmission. 
                  All faces are automatically anonymized before any storage.
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}
      {activeTab === 'database' && (
        <div className="dashboard-grid">
          <aside className="sidebar-left">
            <section className="ctrl-group">
              <h4 className="section-title">DATABASE_EXPLORER</h4>
              <button 
                className={`btn ${!browsedTable ? 'btn-primary' : 'btn-outline'}`} 
                onClick={() => {setBrowsedTable(null); fetchDatabaseData()}}
                style={{ width: '100%', marginBottom: '8px' }}
              >
                SCHEMA_VIEW
              </button>
              <p style={{ fontSize: '10px', opacity: 0.6 }}>SELECT_TABLE_TO_BROWSE:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {(dbSchema.tables || []).map(t => (
                  <button 
                    key={t.name}
                    className={`btn ${browsedTable === t.name ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => fetchDatabaseRows(t.name)}
                    style={{ fontSize: '9px', textAlign: 'left', padding: '8px' }}
                  >
                    {t.name.toUpperCase()}
                  </button>
                ))}
              </div>
            </section>
          </aside>

          <main className="main-viewport">
            {!browsedTable ? (
              /* Schema View */
              <div style={{ padding: '20px' }}>
                <div className="glass-card" style={{ borderLeft: '3px solid var(--accent-neon)' }}>
                  <h4 className="card-title">◈ ACTIVE_STORAGE_LOCATION</h4>
                  <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--accent-neon)' }}>
                    {dbInfo.db_path || 'data/wattwatch.db'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginTop: '20px' }}>
                  {Object.entries(dbInfo.tables || {}).map(([name, count]) => (
                    <div key={name} className="glass-card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => fetchDatabaseRows(name)}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{count}</div>
                      <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '4px' }}>{name.toUpperCase()}</div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '20px' }}>
                  <h4 className="section-title">◈ SCHEMA_MAP</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    {(dbSchema.tables || []).map((table) => (
                      <div key={table.name} className="glass-card" style={{ padding: '0' }}>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', fontSize: '10px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                          <span>TABLE: {table.name.toUpperCase()}</span>
                        </div>
                        <div style={{ padding: '10px' }}>
                          {table.columns.slice(0, 5).map((col) => (
                            <div key={col.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px', opacity: 0.8 }}>
                              <span>{col.name}</span>
                              <span style={{ opacity: 0.4 }}>{col.type}</span>
                            </div>
                          ))}
                          {table.columns.length > 5 && <div style={{ fontSize: '9px', opacity: 0.3, textAlign: 'center' }}>+ {table.columns.length - 5} MORE</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Data Browser View */
              <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h4 className="section-title" style={{ margin: 0 }}>◈ BROWSER // {browsedTable.toUpperCase()}</h4>
                  <button className="btn btn-outline" style={{ fontSize: '9px' }} onClick={() => fetchDatabaseRows(browsedTable)}>REFRESH_ROWS</button>
                </div>

                <div className="glass-card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {browsing ? (
                    <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>FETCHING_RECORDS...</div>
                  ) : browsedRows.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', opacity: 0.5 }}>NO_RECORDS_FOUND</div>
                  ) : (
                    <div style={{ overflow: 'auto', flex: 1 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#111', zIndex: 10 }}>
                          <tr>
                            {Object.keys(browsedRows[0] || {}).map(k => (
                              <th key={k} style={{ padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: 0.6 }}>{k.toUpperCase()}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {browsedRows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                              {Object.values(row).map((v, j) => (
                                <td key={j} style={{ padding: '8px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                                  {typeof v === 'number' && v > 1000000000 ? new Date(v * 1000).toLocaleTimeString() : String(v)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          <aside className="sidebar-right">
            <div className="glass-card">
              <h4 className="card-title">◈ DB_HEALTH</h4>
              <div style={{ fontSize: '11px', lineHeight: '1.8' }}>
                <p><span style={{ opacity: 0.6 }}>IO_STATUS:</span> <span style={{ color: '#4ade80' }}>OPTIMIZED</span></p>
                <p><span style={{ opacity: 0.6 }}>JOURNAL:</span> {dbInfo.journal_mode}</p>
                <hr style={{ borderColor: 'rgba(255,255,255,0.1)', margin: '12px 0' }} />
                <p style={{ fontSize: '9px', opacity: 0.5 }}>
                  The browser displays the last 50 entries. Timestamps are automatically converted to local time for readability.
                </p>
              </div>
            </div>
            {browsedTable && (
              <div className="glass-card" style={{ marginTop: '15px' }}>
                <h4 className="card-title">◈ TABLE_INFO</h4>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                  <p>NAME: {browsedTable}</p>
                  <p>RECORDS_LOADED: {browsedRows.length}</p>
                  <button className="btn btn-outline" style={{ width: '100%', marginTop: '10px', fontSize: '9px' }} onClick={() => setBrowsedTable(null)}>CLOSE_BROWSER</button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

export default App