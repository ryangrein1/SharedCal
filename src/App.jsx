import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://isrtzkuatmidbabtzpwv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcnR6a3VhdG1pZGJhYnR6cHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDk5MDMsImV4cCI6MjA4ODM4NTkwM30.FqB8nUgE5tumu5OcTKyhfcSYCUB0w1jPUzP9MVRECqo";

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(opts.headers || {}) }
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  return res.status === 204 ? null : res.json();
};
const dbGet = (table, query = "") => sb(`${table}?${query}`);
const dbInsert = (table, data) => sb(table, { method: "POST", body: JSON.stringify(data) });
const dbUpdate = (table, query, data) => sb(`${table}?${query}`, { method: "PATCH", body: JSON.stringify(data) });
const dbDelete = (table, query) => sb(`${table}?${query}`, { method: "DELETE", headers: { "Prefer": "return=minimal" } });

const subscribeToTable = (table, groupId, onChange) => {
  const ws = new WebSocket(`${SUPABASE_URL.replace("https","wss")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`);
  ws.onopen = () => {
    ws.send(JSON.stringify({ topic:"realtime:public", event:"phx_join", payload:{ config:{ broadcast:{ self:false }, presence:{ key:"" } } }, ref:"1" }));
    ws.send(JSON.stringify({ topic:`realtime:public:${table}:group_id=eq.${groupId}`, event:"phx_join", payload:{ config:{ postgres_changes:[{ event:"*", schema:"public", table, filter:`group_id=eq.${groupId}` }] } }, ref:"2" }));
  };
  ws.onmessage = e => { try { const msg = JSON.parse(e.data); if (msg.event==="postgres_changes"||(msg.payload?.data?.type)) onChange(); } catch {} };
  return () => ws.close();
};

const genId = () => Math.random().toString(36).slice(2, 10);
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = d => { const [y,m,day] = d.split("-"); return new Date(y,m-1,day).toLocaleDateString("en-US",{ weekday:"short", month:"short", day:"numeric", year:"numeric" }); };
const fmtTime = t => { if (!t) return ""; const [h,m] = t.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; };
const COLORS = ["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#db2777"];
const getMemberColor = (members, uid) => COLORS[members.findIndex(m => m.id===uid) % COLORS.length] || "#6b7280";

const SESSION_KEY = "sharedcal_user";
const saveSession = u => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch {} };
const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} };

// Mobile-friendly styles
const S = {
  input: {
    display:"block", width:"100%", padding:"12px 14px", borderRadius:10,
    border:"1px solid #cbd5e1", marginBottom:12, fontSize:16,
    boxSizing:"border-box", outline:"none", fontFamily:"inherit",
    background:"#fff", color:"#1e293b", WebkitAppearance:"none",
    appearance:"none"
  },
  primaryBtn: {
    display:"block", width:"100%", padding:"13px 0", background:"#4f46e5",
    color:"#fff", border:"none", borderRadius:10, fontWeight:700,
    fontSize:16, cursor:"pointer", marginBottom:10, WebkitTapHighlightColor:"transparent"
  },
  smallBtn: {
    padding:"8px 14px", borderRadius:8, border:"1px solid #e2e8f0",
    background:"#fff", cursor:"pointer", fontSize:14, fontWeight:500,
    WebkitTapHighlightColor:"transparent"
  },
  nav: {
    background:"#fff", borderBottom:"1px solid #e2e8f0",
    padding:"12px 16px", display:"flex", alignItems:"center",
    justifyContent:"space-between", gap:8, position:"sticky", top:0, zIndex:50
  },
  card: { background:"#fff", borderRadius:12, padding:20, boxShadow:"0 1px 4px #0001" },
  empty: { textAlign:"center", color:"#94a3b8", padding:"32px 0", fontSize:15 },
  label: { display:"block", fontSize:13, fontWeight:600, color:"#475569", marginBottom:6 },
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(loadSession);
  const [currentGroup, setCurrentGroup] = useState(null);
  const [groupMembers, setGroupMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name:"", email:"", password:"" });
  const [authErr, setAuthErr] = useState("");
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y:n.getFullYear(), m:n.getMonth() }; });
  const [selectedDay, setSelectedDay] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [eventForm, setEventForm] = useState({ title:"", date:todayStr(), time:"", notes:"", attendees:[] });
  const [formErr, setFormErr] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [notification, setNotification] = useState(null);
  const [globalErr, setGlobalErr] = useState(null);

  const notify = msg => { setNotification(msg); setTimeout(() => setNotification(null), 2500); };

  const refreshGroup = useCallback(async (user) => {
    if (!user?.group_id) { setCurrentGroup(null); setGroupMembers([]); setEvents([]); return; }
    try {
      const [grps, members, evs] = await Promise.all([
        dbGet("groups", `id=eq.${user.group_id}`),
        dbGet("users", `group_id=eq.${user.group_id}&select=id,name,email,group_id`),
        dbGet("events", `group_id=eq.${user.group_id}&order=date.asc,time.asc`)
      ]);
      setCurrentGroup(grps[0] || null);
      setGroupMembers(members || []);
      setEvents((evs||[]).map(e => ({ ...e, attendees: e.attendees||[] })));
    } catch(e) { setGlobalErr("Failed to load: " + e.message); }
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!currentUser?.group_id) return;
    try {
      const evs = await dbGet("events", `group_id=eq.${currentUser.group_id}&order=date.asc,time.asc`);
      setEvents((evs||[]).map(e => ({ ...e, attendees: e.attendees||[] })));
    } catch {}
  }, [currentUser]);

  useEffect(() => { if (currentUser) refreshGroup(currentUser); }, [currentUser, refreshGroup]);
  useEffect(() => {
    if (!currentUser?.group_id) return;
    const unsub = subscribeToTable("events", currentUser.group_id, refreshEvents);
    return unsub;
  }, [currentUser?.group_id, refreshEvents]);

  const handleAuth = async () => {
    setAuthErr(""); setLoading(true);
    try {
      if (authMode==="signup") {
        if (!authForm.name) { setAuthErr("Name required."); return; }
        if (!authForm.email||!authForm.password) { setAuthErr("Email and password required."); return; }
        const existing = await dbGet("users", `email=eq.${encodeURIComponent(authForm.email)}&select=id`);
        if (existing?.length) { setAuthErr("Email already registered."); return; }
        const u = { id:genId(), name:authForm.name, email:authForm.email, password:authForm.password, group_id:null };
        const res = await dbInsert("users", u);
        saveSession(res[0]); setCurrentUser(res[0]);
      } else {
        if (!authForm.email||!authForm.password) { setAuthErr("Email and password required."); return; }
        const res = await dbGet("users", `email=eq.${encodeURIComponent(authForm.email)}&password=eq.${encodeURIComponent(authForm.password)}`);
        if (!res?.length) { setAuthErr("Invalid email or password."); return; }
        saveSession(res[0]); setCurrentUser(res[0]);
      }
    } catch(e) { setAuthErr("Error: " + e.message); }
    finally { setLoading(false); }
  };

  const handleLogout = () => { clearSession(); setCurrentUser(null); setCurrentGroup(null); setGroupMembers([]); setEvents([]); };

  const createGroup = async () => {
    if (!createGroupName.trim()) return;
    setLoading(true);
    try {
      const grp = { id:genId(), name:createGroupName.trim(), owner_id:currentUser.id, code:genCode() };
      await dbInsert("groups", grp);
      await dbUpdate("users", `id=eq.${currentUser.id}`, { group_id:grp.id });
      const updated = { ...currentUser, group_id:grp.id };
      saveSession(updated); setCurrentUser(updated); setCreateGroupName(""); notify("Group created!");
    } catch(e) { notify("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const handleJoinByCode = async () => {
    setLoading(true); setJoinMsg("");
    try {
      const grps = await dbGet("groups", `code=eq.${joinCode.trim().toUpperCase()}`);
      if (!grps?.length) { setJoinMsg("Invalid code."); return; }
      await dbUpdate("users", `id=eq.${currentUser.id}`, { group_id:grps[0].id });
      const updated = { ...currentUser, group_id:grps[0].id };
      saveSession(updated); setCurrentUser(updated); setJoinCode(""); notify(`Joined "${grps[0].name}"!`);
    } catch(e) { setJoinMsg("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const handleInviteByEmail = async () => {
    setLoading(true); setInviteMsg("");
    try {
      const res = await dbGet("users", `email=eq.${encodeURIComponent(inviteEmail.trim())}&select=id,name,group_id`);
      if (!res?.length) { setInviteMsg("No user found. They must sign up first."); return; }
      if (res[0].group_id) { setInviteMsg("That user is already in a group."); return; }
      await dbUpdate("users", `id=eq.${res[0].id}`, { group_id:currentGroup.id });
      setInviteEmail(""); notify(`${res[0].name} added!`); await refreshGroup(currentUser);
    } catch(e) { setInviteMsg("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const leaveGroup = async () => {
    setLoading(true);
    try {
      await dbUpdate("users", `id=eq.${currentUser.id}`, { group_id:null });
      const updated = { ...currentUser, group_id:null };
      saveSession(updated); setCurrentUser(updated); notify("Left group.");
    } catch(e) { notify("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const openAddEvent = date => {
    setEventForm({ title:"", date:date||todayStr(), time:"", notes:"", attendees:currentUser?[currentUser.id]:[] });
    setEditEvent(null); setFormErr(""); setShowAddEvent(true);
  };
  const openEditEvent = ev => {
    setEventForm({ title:ev.title, date:ev.date, time:ev.time||"", notes:ev.notes||"", attendees:ev.attendees });
    setEditEvent(ev); setFormErr(""); setShowAddEvent(true);
  };

  const saveEvent = async () => {
    if (!eventForm.title.trim()) return setFormErr("Title required.");
    if (!eventForm.date) return setFormErr("Date required.");
    setLoading(true);
    try {
      if (editEvent) {
        await dbUpdate("events", `id=eq.${editEvent.id}`, { title:eventForm.title, date:eventForm.date, time:eventForm.time, notes:eventForm.notes, attendees:eventForm.attendees });
        setEvents(evs => evs.map(e => e.id===editEvent.id ? { ...e, ...eventForm } : e));
        notify("Event updated!");
      } else {
        const ev = { id:genId(), group_id:currentGroup.id, title:eventForm.title, date:eventForm.date, time:eventForm.time, notes:eventForm.notes, attendees:eventForm.attendees, completed:false, created_by:currentUser.id };
        await dbInsert("events", ev);
        setEvents(evs => [...evs, ev]);
        notify("Event added!");
      }
      setShowAddEvent(false);
    } catch(e) { setFormErr("Error saving: "+e.message); }
    finally { setLoading(false); }
  };

  const toggleComplete = async id => {
    const ev = events.find(e => e.id===id); if (!ev) return;
    setEvents(evs => evs.map(e => e.id===id ? { ...e, completed:!e.completed } : e));
    try { await dbUpdate("events", `id=eq.${id}`, { completed:!ev.completed }); }
    catch { setEvents(evs => evs.map(e => e.id===id ? { ...e, completed:ev.completed } : e)); }
  };

  const deleteEvent = async id => {
    setEvents(evs => evs.filter(e => e.id!==id));
    try { await dbDelete("events", `id=eq.${id}`); notify("Event deleted."); }
    catch(e) { notify("Delete failed: "+e.message); await refreshEvents(); }
  };

  const toggleAttendee = id => setEventForm(f => ({ ...f, attendees: f.attendees.includes(id) ? f.attendees.filter(a=>a!==id) : [...f.attendees,id] }));

  const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
  const firstDayOfMonth = (y,m) => new Date(y,m,1).getDay();
  const eventsByDay = {};
  events.forEach(e => { if (!eventsByDay[e.date]) eventsByDay[e.date]=[]; eventsByDay[e.date].push(e); });
  const sortedEvents = [...events].sort((a,b) => (a.date+(a.time||""))<(b.date+(b.time||""))?-1:1);
  const visibleEvents = sortedEvents.filter(e => showCompleted||!e.completed);
  const upcomingEvents = visibleEvents.filter(e => e.date>=todayStr());
  const pastEvents = visibleEvents.filter(e => e.date<todayStr());
  const monthStr = `${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}`;
  const monthEvents = sortedEvents.filter(e => e.date.startsWith(monthStr)&&(showCompleted||!e.completed));

  // ── Auth screen ─────────────────────────────────────────────────────────────
  if (!currentUser) return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"system-ui,sans-serif", padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:"28px 24px", width:"100%", maxWidth:380, boxShadow:"0 2px 16px #0001" }}>
        <h1 style={{ margin:"0 0 4px", fontSize:24, fontWeight:700 }}>📅 Plannr</h1>
        <p style={{ margin:"0 0 20px", color:"#64748b", fontSize:15 }}>Your shared calendar, together.</p>

        <div style={{ display:"flex", gap:8, marginBottom:20 }}>
          {["login","signup"].map(m => <button key={m} onClick={() => { setAuthMode(m); setAuthErr(""); }} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", background:authMode===m?"#4f46e5":"#f1f5f9", color:authMode===m?"#fff":"#374151", fontWeight:700, cursor:"pointer", fontSize:15 }}>{m==="login"?"Log In":"Sign Up"}</button>)}
        </div>
        {authMode==="signup" && (
          <>
            <label style={S.label}>Your name</label>
            <input placeholder="e.g. Alex" value={authForm.name} onChange={e => setAuthForm(f=>({...f,name:e.target.value}))} style={S.input} />
          </>
        )}
        <label style={S.label}>Email address</label>
        <input placeholder="you@email.com" type="email" autoCapitalize="none" value={authForm.email} onChange={e => setAuthForm(f=>({...f,email:e.target.value}))} style={S.input} />
        <label style={S.label}>Password</label>
        <input placeholder="••••••••" type="password" value={authForm.password} onChange={e => setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e => e.key==="Enter"&&handleAuth()} style={S.input} />
        {authErr && <p style={{ color:"#dc2626", fontSize:14, margin:"0 0 12px" }}>{authErr}</p>}
        <button onClick={handleAuth} disabled={loading} style={{ ...S.primaryBtn, opacity:loading?0.7:1 }}>{loading?"Please wait…":authMode==="login"?"Log In":"Create Account"}</button>
      </div>
    </div>
  );

  // ── No group screen ─────────────────────────────────────────────────────────
  if (!currentGroup) return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"system-ui,sans-serif" }}>
      <nav style={S.nav}>
        <span style={{ fontWeight:700, fontSize:17 }}>📅 SharedCal</span>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ color:"#94a3b8", fontSize:13 }}>Hi, {currentUser.name}</span>
          <button onClick={handleLogout} style={S.smallBtn}>Log out</button>
        </div>
      </nav>
      <div style={{ maxWidth:440, margin:"40px auto", padding:"0 16px" }}>
        {globalErr && <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#dc2626" }}>{globalErr}</div>}
        <div style={S.card}>
          <h2 style={{ margin:"0 0 16px", fontSize:18 }}>Create a Group</h2>
          <label style={S.label}>Group name</label>
          <input placeholder="e.g. Me & Jordan" value={createGroupName} onChange={e => setCreateGroupName(e.target.value)} style={S.input} />
          <button onClick={createGroup} disabled={loading} style={{ ...S.primaryBtn, opacity:loading?0.7:1 }}>Create Group</button>
        </div>
        <div style={{ ...S.card, marginTop:16 }}>
          <h2 style={{ margin:"0 0 16px", fontSize:18 }}>Join a Group</h2>
          <label style={S.label}>Join code</label>
          <input placeholder="e.g. AB12CD" value={joinCode} onChange={e => setJoinCode(e.target.value)} autoCapitalize="characters" style={S.input} />
          {joinMsg && <p style={{ color:"#dc2626", fontSize:14, margin:"0 0 8px" }}>{joinMsg}</p>}
          <button onClick={handleJoinByCode} disabled={loading} style={{ ...S.primaryBtn, opacity:loading?0.7:1 }}>Join</button>
        </div>
      </div>
    </div>
  );

  // ── Main app ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#f1f5f9", fontFamily:"system-ui,sans-serif" }}>
      {notification && <div style={{ position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#fff", padding:"10px 20px", borderRadius:8, zIndex:999, fontSize:14, fontWeight:500, whiteSpace:"nowrap" }}>{notification}</div>}

      <nav style={S.nav}>
        <span style={{ fontWeight:700, fontSize:16 }}>📅 Plannr — {currentGroup.name}</span>
        <div style={{ display:"flex", gap:6, alignItems:"center", position:"relative" }}>
          <button onClick={() => setShowGroupMenu(v=>!v)} style={S.smallBtn}>⚙</button>
          {showGroupMenu && (
            <div style={{ position:"absolute", right:0, top:44, background:"#fff", borderRadius:12, boxShadow:"0 4px 24px #0002", padding:20, width:280, zIndex:100 }}>
              <p style={{ margin:"0 0 6px", fontWeight:600, fontSize:12, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>Join Code</p>
              <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:18 }}>
                <code style={{ background:"#f1f5f9", padding:"8px 14px", borderRadius:8, fontWeight:700, letterSpacing:4, fontSize:18, flex:1, textAlign:"center" }}>{currentGroup.code}</code>
                <button onClick={() => { navigator.clipboard.writeText(currentGroup.code); notify("Code copied!"); }} style={S.smallBtn}>Copy</button>
              </div>
              <p style={{ margin:"0 0 6px", fontWeight:600, fontSize:12, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>Invite by Email</p>
              <label style={S.label}>Their email address</label>
              <input placeholder="friend@email.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={S.input} autoCapitalize="none" />
              {inviteMsg && <p style={{ color:"#dc2626", fontSize:13, margin:"0 0 8px" }}>{inviteMsg}</p>}
              <button onClick={handleInviteByEmail} disabled={loading} style={{ ...S.primaryBtn, marginBottom:16, opacity:loading?0.7:1 }}>Add to Group</button>
              <p style={{ margin:"0 0 10px", fontWeight:600, fontSize:12, color:"#64748b", textTransform:"uppercase", letterSpacing:1 }}>Members</p>
              {groupMembers.map(m => (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                  <div style={{ width:32, height:32, borderRadius:"50%", background:getMemberColor(groupMembers,m.id), color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>{m.name[0].toUpperCase()}</div>
                  <span style={{ fontSize:14 }}>{m.name}{m.id===currentUser.id?" (you)":""}</span>
                </div>
              ))}
              <button onClick={() => { leaveGroup(); setShowGroupMenu(false); }} style={{ ...S.smallBtn, marginTop:12, color:"#dc2626", borderColor:"#fca5a5", width:"100%" }}>Leave Group</button>
            </div>
          )}
          <button onClick={handleLogout} style={S.smallBtn}>Log out</button>
        </div>
      </nav>

      {/* Tab bar */}
      <div style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"0 16px", display:"flex", gap:0 }}>
        {["list","calendar"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{ padding:"12px 20px", border:"none", borderBottom: view===v?"3px solid #4f46e5":"3px solid transparent", background:"transparent", color:view===v?"#4f46e5":"#64748b", fontWeight:view===v?700:500, cursor:"pointer", fontSize:15, WebkitTapHighlightColor:"transparent" }}>
            {v==="list"?"📋 List":"📆 Calendar"}
          </button>
        ))}
        <button onClick={() => openAddEvent()} style={{ marginLeft:"auto", padding:"8px 14px", margin:"6px 0 6px auto", borderRadius:8, border:"none", background:"#4f46e5", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:14, alignSelf:"center" }}>+ Add</button>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"16px 12px 80px" }}>

        {/* LIST VIEW */}
        {view==="list" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <h2 style={{ margin:0, fontSize:16, color:"#374151" }}>Upcoming ({upcomingEvents.length})</h2>
              <label style={{ fontSize:13, color:"#64748b", display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
                <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Past
              </label>
            </div>
            {upcomingEvents.length===0 && <div style={S.empty}>No upcoming events. Tap + Add!</div>}
            {upcomingEvents.map(ev => <EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
            {showCompleted && pastEvents.length>0 && (
              <>
                <h2 style={{ margin:"24px 0 12px", fontSize:16, color:"#94a3b8" }}>Past ({pastEvents.length})</h2>
                {pastEvents.map(ev => <EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
              </>
            )}
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view==="calendar" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
              <button onClick={() => setCalMonth(({y,m}) => m===0?{y:y-1,m:11}:{y,m:m-1})} style={{ ...S.smallBtn, fontSize:18, padding:"6px 14px" }}>‹</button>
              <span style={{ fontWeight:700, fontSize:15, flex:1, textAlign:"center" }}>{new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
              <button onClick={() => setCalMonth(({y,m}) => m===11?{y:y+1,m:0}:{y,m:m+1})} style={{ ...S.smallBtn, fontSize:18, padding:"6px 14px" }}>›</button>
            </div>

            <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px #0001" }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
                {["S","M","T","W","T","F","S"].map((d,i) => (
                  <div key={i} style={{ padding:"8px 0", textAlign:"center", fontSize:12, fontWeight:600, color:"#94a3b8", borderBottom:"1px solid #f1f5f9" }}>{d}</div>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
                {Array.from({ length:firstDayOfMonth(calMonth.y,calMonth.m) }).map((_,i) => (
                  <div key={`pad-${i}`} style={{ minHeight:56, borderRight:"1px solid #f8fafc", borderBottom:"1px solid #f8fafc", background:"#fafafa" }} />
                ))}
                {Array.from({ length:daysInMonth(calMonth.y,calMonth.m) }).map((_,i) => {
                  const day = i+1;
                  const dateStr = `${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayEvs = (eventsByDay[dateStr]||[]).filter(e => showCompleted||!e.completed);
                  const isToday = dateStr===todayStr();
                  const isSel = selectedDay===dateStr;
                  return (
                    <div key={day} onClick={() => setSelectedDay(isSel?null:dateStr)}
                      style={{ minHeight:56, padding:"3px 2px", borderRight:"1px solid #f8fafc", borderBottom:"1px solid #f8fafc", cursor:"pointer", background:isSel?"#eef2ff":isToday?"#fafafe":"transparent" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:isToday?"#4f46e5":"transparent", color:isToday?"#fff":"#374151", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:isToday?700:400, fontSize:12, margin:"0 auto 2px" }}>{day}</div>
                      {dayEvs.slice(0,2).map(ev => <CalChip key={ev.id} ev={ev} members={groupMembers} />)}
                      {dayEvs.length>2 && <div style={{ fontSize:9, color:"#94a3b8", textAlign:"center" }}>+{dayEvs.length-2}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <label style={{ fontSize:13, color:"#64748b", display:"flex", alignItems:"center", gap:6, cursor:"pointer", margin:"12px 0" }}>
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} /> Show completed
            </label>

            {selectedDay && (
              <div style={{ marginTop:4, marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <h3 style={{ margin:0, fontSize:15, color:"#374151" }}>{fmtDate(selectedDay)}</h3>
                  <button onClick={() => openAddEvent(selectedDay)} style={{ padding:"7px 14px", background:"#4f46e5", color:"#fff", border:"none", borderRadius:8, fontWeight:600, cursor:"pointer", fontSize:14 }}>+ Add</button>
                </div>
                {(eventsByDay[selectedDay]||[]).length===0
                  ? <div style={S.empty}>No events this day.</div>
                  : (eventsByDay[selectedDay]||[]).map(ev => <EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
              </div>
            )}

            <div style={{ marginTop:8, paddingBottom:16 }}>
              <h3 style={{ margin:"0 0 12px", fontSize:15, color:"#374151" }}>
                {new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long",year:"numeric"})} — All Events ({monthEvents.length})
              </h3>
              {monthEvents.length===0
                ? <div style={S.empty}>No events this month.</div>
                : monthEvents.map(ev => <EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddEvent && (
        <div style={{ position:"fixed", inset:0, background:"#0006", display:"flex", alignItems:"flex-end", justifyContent:"center", zIndex:200 }} onClick={e => e.target===e.currentTarget&&setShowAddEvent(false)}>
          <div style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:500, boxShadow:"0 -4px 32px #0002", maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ width:40, height:4, background:"#e2e8f0", borderRadius:4, margin:"0 auto 20px" }} />
            <h2 style={{ margin:"0 0 20px", fontSize:19 }}>{editEvent?"Edit Event":"New Event"}</h2>

            <label style={S.label}>Event title *</label>
            <input placeholder="e.g. Dinner with friends" value={eventForm.title} onChange={e => setEventForm(f=>({...f,title:e.target.value}))} style={S.input} />

            <label style={S.label}>Date *</label>
            <input type="date" value={eventForm.date} onChange={e => setEventForm(f=>({...f,date:e.target.value}))} style={S.input} />

            <label style={S.label}>Time (optional)</label>
            <input type="time" value={eventForm.time} onChange={e => setEventForm(f=>({...f,time:e.target.value}))} style={S.input} />

            <label style={S.label}>Notes (optional)</label>
            <textarea placeholder="Any extra details…" value={eventForm.notes} onChange={e => setEventForm(f=>({...f,notes:e.target.value}))} style={{ ...S.input, minHeight:80, resize:"vertical" }} />

            <label style={S.label}>Attendees</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
              {groupMembers.map(m => {
                const sel = eventForm.attendees.includes(m.id);
                const col = getMemberColor(groupMembers, m.id);
                return <button key={m.id} onClick={() => toggleAttendee(m.id)} style={{ padding:"8px 16px", borderRadius:20, border:`2px solid ${col}`, background:sel?col:"#fff", color:sel?"#fff":col, fontWeight:600, cursor:"pointer", fontSize:14 }}>{m.name}</button>;
              })}
            </div>

            {formErr && <p style={{ color:"#dc2626", fontSize:14, margin:"0 0 12px" }}>{formErr}</p>}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowAddEvent(false)} style={{ flex:1, padding:"12px 0", borderRadius:10, border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontWeight:600, fontSize:15 }}>Cancel</button>
              <button onClick={saveEvent} disabled={loading} style={{ flex:2, padding:"12px 0", borderRadius:10, border:"none", background:"#4f46e5", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:15, opacity:loading?0.7:1 }}>{loading?"Saving…":editEvent?"Save Changes":"Add Event"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalChip({ ev, members }) {
  const [hovered, setHovered] = useState(false);
  const color = getMemberColor(members, ev.attendees[0]);
  const names = ev.attendees.map(id => members.find(m=>m.id===id)?.name).filter(Boolean).join(", ");
  return (
    <div style={{ position:"relative" }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={{ fontSize:9, background:color, color:"#fff", borderRadius:3, padding:"1px 3px", marginBottom:1, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", opacity:ev.completed?0.5:1 }}>
        {ev.completed?"✓ ":""}{ev.title}
      </div>
      {hovered && (
        <div style={{ position:"absolute", left:0, top:"100%", zIndex:300, background:"#1e293b", color:"#fff", borderRadius:8, padding:"8px 10px", minWidth:160, maxWidth:220, boxShadow:"0 4px 16px #0003", pointerEvents:"none" }}>
          <div style={{ fontWeight:700, fontSize:12, marginBottom:4 }}>{ev.title}</div>
          {ev.time && <div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>🕐 {fmtTime(ev.time)}</div>}
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:ev.notes?3:0 }}>👤 {names||"No attendees"}</div>
          {ev.notes && <div style={{ fontSize:11, color:"#cbd5e1", borderTop:"1px solid #334155", paddingTop:4, marginTop:3 }}>{ev.notes}</div>}
          {ev.completed && <div style={{ fontSize:10, color:"#4ade80", marginTop:4 }}>✓ Completed</div>}
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, members, onToggle, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const color = getMemberColor(members, ev.attendees[0]);
  return (
    <div style={{ background:"#fff", borderRadius:12, padding:"14px 14px", marginBottom:10, boxShadow:"0 1px 3px #0001", opacity:ev.completed?0.6:1, borderLeft:`4px solid ${color}` }}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
        <input type="checkbox" checked={ev.completed} onChange={() => onToggle(ev.id)} style={{ marginTop:4, cursor:"pointer", accentColor:"#4f46e5", width:18, height:18, flexShrink:0 }} />
        <div style={{ flex:1, cursor:"pointer" }} onClick={() => setExpanded(v=>!v)}>
          <div style={{ fontWeight:600, fontSize:15, textDecoration:ev.completed?"line-through":"none", color:ev.completed?"#94a3b8":"#1e293b" }}>{ev.title}</div>
          <div style={{ fontSize:13, color:"#64748b", marginTop:3 }}>{fmtDate(ev.date)}{ev.time?` · ${fmtTime(ev.time)}`:""}</div>
          <div style={{ display:"flex", gap:5, marginTop:6, flexWrap:"wrap" }}>
            {ev.attendees.map(aid => { const m=members.find(x=>x.id===aid); return m?<span key={aid} style={{ fontSize:12, background:getMemberColor(members,aid), color:"#fff", borderRadius:10, padding:"2px 10px", fontWeight:500 }}>{m.name}</span>:null; })}
          </div>
        </div>
        <div style={{ display:"flex", gap:4, flexShrink:0 }}>
          <button onClick={() => onEdit(ev)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8", padding:"4px 6px" }}>✏️</button>
          <button onClick={() => onDelete(ev.id)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#94a3b8", padding:"4px 6px" }}>🗑️</button>
        </div>
      </div>
      {expanded && ev.notes && <div style={{ marginTop:10, marginLeft:28, fontSize:14, color:"#475569", background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}>{ev.notes}</div>}
    </div>
  );
}