import { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://isrtzkuatmidbabtzpwv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcnR6a3VhdG1pZGJhYnR6cHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDk5MDMsImV4cCI6MjA4ODM4NTkwM30.FqB8nUgE5tumu5OcTKyhfcSYCUB0w1jPUzP9MVRECqo";

const sb = async (path, opts = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json", "Prefer": "return=representation", ...(opts.headers||{}) }
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  return res.status===204 ? null : res.json();
};
const dbGet = (t,q="") => sb(`${t}?${q}`);
const dbInsert = (t,d) => sb(t,{method:"POST",body:JSON.stringify(d)});
const dbUpdate = (t,q,d) => sb(`${t}?${q}`,{method:"PATCH",body:JSON.stringify(d)});
const dbDelete = (t,q) => sb(`${t}?${q}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});

const subscribeToTable = (table, groupId, onChange) => {
  const ws = new WebSocket(`${SUPABASE_URL.replace("https","wss")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`);
  ws.onopen = () => {
    ws.send(JSON.stringify({topic:"realtime:public",event:"phx_join",payload:{config:{broadcast:{self:false},presence:{key:""}}},ref:"1"}));
    ws.send(JSON.stringify({topic:`realtime:public:${table}:group_id=eq.${groupId}`,event:"phx_join",payload:{config:{postgres_changes:[{event:"*",schema:"public",table,filter:`group_id=eq.${groupId}`}]}},ref:"2"}));
  };
  ws.onmessage = e => { try { const m=JSON.parse(e.data); if (m.event==="postgres_changes"||(m.payload?.data?.type)) onChange(); } catch {} };
  return () => ws.close();
};

const genId = () => Math.random().toString(36).slice(2,10);
const genCode = () => Math.random().toString(36).slice(2,8).toUpperCase();
const todayStr = () => new Date().toISOString().slice(0,10);
const fmtDate = d => { const [y,m,day]=d.split("-"); return new Date(y,m-1,day).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}); };
const fmtTime = t => { if (!t) return ""; const [h,m]=t.split(":").map(Number); return `${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`; };
const COLORS = ["#4f46e5","#0891b2","#059669","#d97706","#dc2626","#7c3aed","#db2777"];
const getMemberColor = (members,uid) => COLORS[members.findIndex(m=>m.id===uid)%COLORS.length]||"#6b7280";

const SESSION_KEY = "sharedcal_user";
const saveSession = u => { try { localStorage.setItem(SESSION_KEY,JSON.stringify(u)); } catch {} };
const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} };

const injectStyles = () => {
  if (document.getElementById("plannr-styles")) return;
  const el = document.createElement("style");
  el.id = "plannr-styles";
  el.textContent = `
    :root {
      --bg:#f1f5f9; --surface:#ffffff; --surface2:#f8fafc; --border:#e2e8f0;
      --border2:#f1f5f9; --text:#1e293b; --text2:#475569; --text3:#94a3b8;
      --input-bg:#ffffff; --nav-bg:#ffffff; --chip-bg:#f1f5f9; --code-bg:#f1f5f9;
      --code-text:#1e293b; --modal-bg:#ffffff; --pad-bg:#fafafa; --today-bg:#fafafe;
      --sel-bg:#eef2ff; --danger:#dc2626; --accent:#4f46e5; --accent-light:#eef2ff;
      --toggle-off:#cbd5e1; --toggle-on:#4f46e5;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg:#0f172a; --surface:#1e293b; --surface2:#263347; --border:#334155;
        --border2:#1e293b; --text:#f1f5f9; --text2:#94a3b8; --text3:#64748b;
        --input-bg:#1e293b; --nav-bg:#1e293b; --chip-bg:#334155; --code-bg:#0f172a;
        --code-text:#f1f5f9; --modal-bg:#1e293b; --pad-bg:#151f2e; --today-bg:#1e2d45;
        --sel-bg:#2d2f6b; --danger:#f87171; --accent:#6366f1; --accent-light:#1e1f4a;
        --toggle-off:#475569; --toggle-on:#6366f1;
      }
    }
    *{box-sizing:border-box;}
    body{background:var(--bg);color:var(--text);margin:0;font-family:system-ui,sans-serif;}
    input:not([type="checkbox"]):not([type="radio"]), textarea {
      background:var(--input-bg)!important; color:var(--text)!important;
      border:1.5px solid var(--border)!important; border-radius:10px;
      font-size:16px; font-family:inherit; outline:none;
      width:100%; padding:12px 14px; display:block; margin-bottom:12px;
      -webkit-appearance:none; appearance:none;
    }
    input::placeholder,textarea::placeholder{color:var(--text3)!important;opacity:1;}

    /* Custom toggle switch */
    .plannr-toggle-wrap {
      display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none;
    }
    .plannr-toggle {
      position:relative; width:44px; height:26px; flex-shrink:0;
    }
    .plannr-toggle input { opacity:0; width:0; height:0; position:absolute; }
    .plannr-toggle-track {
      position:absolute; inset:0; border-radius:13px;
      background:var(--toggle-off); transition:background 0.2s;
    }
    .plannr-toggle input:checked + .plannr-toggle-track { background:var(--toggle-on); }
    .plannr-toggle-thumb {
      position:absolute; top:3px; left:3px; width:20px; height:20px;
      border-radius:50%; background:#fff; transition:transform 0.2s;
      box-shadow:0 1px 4px rgba(0,0,0,0.2);
    }
    .plannr-toggle input:checked ~ .plannr-toggle-thumb { transform:translateX(18px); }

    /* Custom checkbox */
    .plannr-checkbox-wrap {
      display:inline-flex; align-items:center; cursor:pointer;
    }
    .plannr-checkbox {
      width:20px; height:20px; border-radius:6px; flex-shrink:0;
      border:2px solid var(--border); background:var(--input-bg);
      display:flex; align-items:center; justify-content:center;
      transition:background 0.15s, border-color 0.15s;
    }
    .plannr-checkbox.checked {
      background:var(--accent); border-color:var(--accent);
    }
    .plannr-checkbox svg { display:none; }
    .plannr-checkbox.checked svg { display:block; }

    .plannr-btn-primary {
      display:block; width:100%; padding:13px 0;
      background:var(--accent); color:#fff; border:none;
      border-radius:10px; font-weight:700; font-size:16px;
      cursor:pointer; margin-bottom:10px; -webkit-tap-highlight-color:transparent;
    }
    .plannr-btn-small {
      padding:8px 14px; border-radius:8px; border:1.5px solid var(--border);
      background:var(--surface); color:var(--text); cursor:pointer;
      font-size:14px; font-weight:500; -webkit-tap-highlight-color:transparent;
    }
    .plannr-card { background:var(--surface); border-radius:12px; padding:20px; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
    .plannr-input-label { display:block; font-size:13px; font-weight:600; color:var(--text2); margin-bottom:6px; }
    .plannr-event-card { background:var(--surface); border-radius:12px; padding:14px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }
    .plannr-nav { background:var(--nav-bg); border-bottom:1px solid var(--border); padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:8px; position:sticky; top:0; z-index:50; }
    .plannr-cal-grid { background:var(--surface); border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
    .plannr-cal-header-cell { padding:8px 0; text-align:center; font-size:12px; font-weight:600; color:var(--text3); border-bottom:1px solid var(--border2); }
    .plannr-cal-cell { min-height:56px; padding:3px 2px; border-right:1px solid var(--border2); border-bottom:1px solid var(--border2); cursor:pointer; }
    .plannr-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:flex-end; justify-content:center; z-index:200; }
    .plannr-modal { background:var(--modal-bg); border-radius:20px 20px 0 0; padding:24px 20px 36px; width:100%; max-width:500px; box-shadow:0 -4px 32px rgba(0,0,0,0.2); max-height:90vh; overflow-y:auto; }
    .plannr-group-menu { position:absolute; right:0; top:44px; background:var(--surface); border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.2); padding:20px; width:280px; z-index:100; border:1px solid var(--border); }
    .plannr-code { background:var(--code-bg); color:var(--code-text); padding:8px 14px; border-radius:8px; font-weight:700; letter-spacing:4px; font-size:18px; flex:1; text-align:center; font-family:monospace; border:1.5px solid var(--border); }
    .plannr-tag { font-size:12px; color:#fff; border-radius:10px; padding:2px 10px; font-weight:500; }
    .plannr-avatar { width:32px; height:32px; border-radius:50%; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .plannr-empty { text-align:center; color:var(--text3); padding:32px 0; font-size:15px; }
    .plannr-tab { padding:12px 20px; border:none; background:transparent; cursor:pointer; font-size:15px; -webkit-tap-highlight-color:transparent; }
    .plannr-section-title { font-size:12px; font-weight:600; color:var(--text3); text-transform:uppercase; letter-spacing:1px; margin:0 0 6px; }
    .plannr-notes-box { margin-top:10px; margin-left:28px; font-size:14px; color:var(--text2); background:var(--surface2); border-radius:8px; padding:10px 12px; }
    .plannr-confirm-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:300; padding:16px; }
    .plannr-confirm-box { background:var(--modal-bg); border-radius:16px; padding:28px 24px; width:100%; max-width:320px; box-shadow:0 8px 32px rgba(0,0,0,0.2); text-align:center; }
  `;
  document.head.appendChild(el);
};

// Reusable toggle switch
function Toggle({ checked, onChange, label }) {
  return (
    <div style={{cursor:"pointer",userSelect:"none",display:"inline-flex",alignItems:"center",gap:10,WebkitTapHighlightColor:"transparent"}}
      onPointerDown={e => { e.preventDefault(); onChange(!checked); }}>
      <div style={{position:"relative",width:44,height:26,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:13,background:checked?"#4f46e5":"#cbd5e1",transition:"background 0.2s"}} />
        <div style={{position:"absolute",top:3,left:checked?21:3,width:20,height:20,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.25)",transition:"left 0.2s"}} />
      </div>
      <span style={{fontSize:14,color:"var(--text2)"}}>{label}</span>
    </div>
  );
}

// Reusable custom checkbox


// Logout confirm dialog
function LogoutConfirm({ onConfirm, onCancel }) {
  return (
    <div className="plannr-confirm-overlay">
      <div className="plannr-confirm-box">
        <div style={{ fontSize:36, marginBottom:12 }}>👋</div>
        <h3 style={{ margin:"0 0 8px", fontSize:18, color:"var(--text)" }}>Log out of Plannr?</h3>
        <p style={{ margin:"0 0 24px", fontSize:14, color:"var(--text2)" }}>You'll need to log back in to see your events.</p>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:"11px 0", borderRadius:10, border:"1.5px solid var(--border)", background:"transparent", color:"var(--text)", fontWeight:600, fontSize:15, cursor:"pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1, padding:"11px 0", borderRadius:10, border:"none", background:"var(--danger)", color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }}>Log Out</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => { injectStyles(); }, []);

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
  const [calMonth, setCalMonth] = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()}; });
  const [selectedDay, setSelectedDay] = useState(null);
  const [editEvent, setEditEvent] = useState(null);
  const [eventForm, setEventForm] = useState({title:"",date:todayStr(),time:"",notes:"",attendees:[]});
  const [formErr, setFormErr] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinMsg, setJoinMsg] = useState("");
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [createGroupName, setCreateGroupName] = useState("");
  const [notification, setNotification] = useState(null);
  const [globalErr, setGlobalErr] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const groupMenuRef = useRef(null);

  // Close group menu when clicking outside
  useEffect(() => {
    if (!showGroupMenu) return;
    const handler = e => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("touchstart", handler); };
  }, [showGroupMenu]);

  const notify = msg => { setNotification(msg); setTimeout(()=>setNotification(null),2500); };

  const refreshGroup = useCallback(async user => {
    if (!user?.group_id) { setCurrentGroup(null); setGroupMembers([]); setEvents([]); return; }
    try {
      const [grps,members,evs] = await Promise.all([
        dbGet("groups",`id=eq.${user.group_id}`),
        dbGet("users",`group_id=eq.${user.group_id}&select=id,name,email,group_id`),
        dbGet("events",`group_id=eq.${user.group_id}&order=date.asc,time.asc`)
      ]);
      setCurrentGroup(grps[0]||null);
      setGroupMembers(members||[]);
      setEvents((evs||[]).map(e=>({...e,attendees:e.attendees||[]})));
    } catch(e) { setGlobalErr("Failed to load: "+e.message); }
  }, []);

  const refreshEvents = useCallback(async () => {
    if (!currentUser?.group_id) return;
    try {
      const evs = await dbGet("events",`group_id=eq.${currentUser.group_id}&order=date.asc,time.asc`);
      setEvents((evs||[]).map(e=>({...e,attendees:e.attendees||[]})));
    } catch {}
  }, [currentUser]);

  useEffect(() => { if (currentUser) refreshGroup(currentUser); }, [currentUser,refreshGroup]);
  useEffect(() => {
    if (!currentUser?.group_id) return;
    return subscribeToTable("events",currentUser.group_id,refreshEvents);
  }, [currentUser?.group_id,refreshEvents]);

  const handleAuth = async () => {
    setAuthErr(""); setLoading(true);
    try {
      if (authMode==="signup") {
        if (!authForm.name) { setAuthErr("Name required."); return; }
        if (!authForm.email||!authForm.password) { setAuthErr("Email and password required."); return; }
        const ex = await dbGet("users",`email=eq.${encodeURIComponent(authForm.email)}&select=id`);
        if (ex?.length) { setAuthErr("Email already registered."); return; }
        const u = {id:genId(),name:authForm.name,email:authForm.email,password:authForm.password,group_id:null};
        const res = await dbInsert("users",u);
        saveSession(res[0]); setCurrentUser(res[0]);
      } else {
        if (!authForm.email||!authForm.password) { setAuthErr("Email and password required."); return; }
        const res = await dbGet("users",`email=eq.${encodeURIComponent(authForm.email)}&password=eq.${encodeURIComponent(authForm.password)}`);
        if (!res?.length) { setAuthErr("Invalid email or password."); return; }
        saveSession(res[0]); setCurrentUser(res[0]);
      }
    } catch(e) { setAuthErr("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const confirmLogout = () => setShowLogoutConfirm(true);
  const doLogout = () => {
    clearSession();
    setCurrentUser(null); setCurrentGroup(null); setGroupMembers([]); setEvents([]);
    setShowLogoutConfirm(false);
    // Clear auth form
    setAuthForm({name:"",email:"",password:""});
    setAuthErr("");
  };

  const createGroup = async () => {
    if (!createGroupName.trim()) return; setLoading(true);
    try {
      const grp = {id:genId(),name:createGroupName.trim(),owner_id:currentUser.id,code:genCode()};
      await dbInsert("groups",grp);
      await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:grp.id});
      const u = {...currentUser,group_id:grp.id};
      saveSession(u); setCurrentUser(u); setCreateGroupName(""); notify("Group created!");
    } catch(e) { notify("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const handleJoinByCode = async () => {
    setLoading(true); setJoinMsg("");
    try {
      const grps = await dbGet("groups",`code=eq.${joinCode.trim().toUpperCase()}`);
      if (!grps?.length) { setJoinMsg("Invalid code."); return; }
      await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:grps[0].id});
      const u = {...currentUser,group_id:grps[0].id};
      saveSession(u); setCurrentUser(u); setJoinCode(""); notify(`Joined "${grps[0].name}"!`);
    } catch(e) { setJoinMsg("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const handleInviteByEmail = async () => {
    setLoading(true); setInviteMsg("");
    try {
      const res = await dbGet("users",`email=eq.${encodeURIComponent(inviteEmail.trim())}&select=id,name,group_id`);
      if (!res?.length) { setInviteMsg("No user found. They must sign up first."); return; }
      if (res[0].group_id) { setInviteMsg("That user is already in a group."); return; }
      await dbUpdate("users",`id=eq.${res[0].id}`,{group_id:currentGroup.id});
      setInviteEmail(""); notify(`${res[0].name} added!`); await refreshGroup(currentUser);
    } catch(e) { setInviteMsg("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const leaveGroup = async () => {
    setLoading(true);
    try {
      await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:null});
      const u = {...currentUser,group_id:null};
      saveSession(u); setCurrentUser(u); notify("Left group.");
    } catch(e) { notify("Error: "+e.message); }
    finally { setLoading(false); }
  };

  const openAddEvent = date => {
    setEventForm({title:"",date:date||todayStr(),time:"",notes:"",attendees:currentUser?[currentUser.id]:[]});
    setEditEvent(null); setFormErr(""); setShowAddEvent(true);
  };
  const openEditEvent = ev => {
    setEventForm({title:ev.title,date:ev.date,time:ev.time||"",notes:ev.notes||"",attendees:ev.attendees});
    setEditEvent(ev); setFormErr(""); setShowAddEvent(true);
  };
  const saveEvent = async () => {
    if (!eventForm.title.trim()) return setFormErr("Title required.");
    if (!eventForm.date) return setFormErr("Date required.");
    setLoading(true);
    try {
      if (editEvent) {
        await dbUpdate("events",`id=eq.${editEvent.id}`,{title:eventForm.title,date:eventForm.date,time:eventForm.time,notes:eventForm.notes,attendees:eventForm.attendees});
        setEvents(evs=>evs.map(e=>e.id===editEvent.id?{...e,...eventForm}:e));
        notify("Event updated!");
      } else {
        const ev = {id:genId(),group_id:currentGroup.id,title:eventForm.title,date:eventForm.date,time:eventForm.time,notes:eventForm.notes,attendees:eventForm.attendees,completed:false,created_by:currentUser.id};
        await dbInsert("events",ev); setEvents(evs=>[...evs,ev]); notify("Event added!");
      }
      setShowAddEvent(false);
    } catch(e) { setFormErr("Error: "+e.message); }
    finally { setLoading(false); }
  };
  const toggleComplete = async id => {
    const ev=events.find(e=>e.id===id); if (!ev) return;
    setEvents(evs=>evs.map(e=>e.id===id?{...e,completed:!e.completed}:e));
    try { await dbUpdate("events",`id=eq.${id}`,{completed:!ev.completed}); }
    catch { setEvents(evs=>evs.map(e=>e.id===id?{...e,completed:ev.completed}:e)); }
  };
  const deleteEvent = async id => {
    setEvents(evs=>evs.filter(e=>e.id!==id));
    try { await dbDelete("events",`id=eq.${id}`); notify("Deleted."); }
    catch { notify("Delete failed."); await refreshEvents(); }
  };
  const toggleAttendee = id => setEventForm(f=>({...f,attendees:f.attendees.includes(id)?f.attendees.filter(a=>a!==id):[...f.attendees,id]}));

  const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
  const firstDay = (y,m) => new Date(y,m,1).getDay();
  const eventsByDay = {};
  events.forEach(e=>{ if (!eventsByDay[e.date]) eventsByDay[e.date]=[]; eventsByDay[e.date].push(e); });
  const sorted = [...events].sort((a,b)=>(a.date+(a.time||""))<(b.date+(b.time||""))?-1:1);
  const visible = sorted.filter(e=>showCompleted||!e.completed);
  const upcoming = visible.filter(e=>e.date>=todayStr());
  const past = visible.filter(e=>e.date<todayStr());
  const monthStr = `${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}`;
  const monthEvents = sorted.filter(e=>e.date.startsWith(monthStr)&&(showCompleted||!e.completed));

  // ── Auth ─────────────────────────────────────────────────────────────────────
  if (!currentUser) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div className="plannr-card" style={{width:"100%",maxWidth:380,padding:"28px 24px"}}>
        <h1 style={{margin:"0 0 4px",fontSize:26,fontWeight:800,color:"var(--text)"}}>📅 Plannr</h1>
        <p style={{margin:"0 0 24px",color:"var(--text2)",fontSize:15}}>Your shared calendar, together.</p>
        <div style={{display:"flex",gap:8,marginBottom:20}}>
          {["login","signup"].map(m=><button key={m} onClick={()=>{setAuthMode(m);setAuthErr("");}} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",background:authMode===m?"var(--accent)":"var(--chip-bg)",color:authMode===m?"#fff":"var(--text)",fontWeight:700,cursor:"pointer",fontSize:15}}>{m==="login"?"Log In":"Sign Up"}</button>)}
        </div>
        {authMode==="signup" && <><label className="plannr-input-label">Your name</label><input placeholder="e.g. Alex" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))} /></>}
        <label className="plannr-input-label">Email address</label>
        <input placeholder="you@email.com" type="email" autoCapitalize="none" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))} />
        <label className="plannr-input-label">Password</label>
        <input placeholder="••••••••" type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAuth()} />
        {authErr && <p style={{color:"var(--danger)",fontSize:14,margin:"0 0 12px"}}>{authErr}</p>}
        <button className="plannr-btn-primary" onClick={handleAuth} disabled={loading} style={{opacity:loading?0.7:1}}>{loading?"Please wait…":authMode==="login"?"Log In":"Create Account"}</button>
      </div>
    </div>
  );

  // ── No group ──────────────────────────────────────────────────────────────────
  if (!currentGroup) return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {showLogoutConfirm && <LogoutConfirm onConfirm={doLogout} onCancel={()=>setShowLogoutConfirm(false)} />}
      <nav className="plannr-nav">
        <span style={{fontWeight:800,fontSize:18,color:"var(--text)"}}>📅 Plannr</span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:"var(--text3)",fontSize:13}}>Hi, {currentUser.name}</span>
          <button className="plannr-btn-small" onClick={confirmLogout}>Log out</button>
        </div>
      </nav>
      <div style={{maxWidth:440,margin:"40px auto",padding:"0 16px"}}>
        {globalErr && <div style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:13,color:"var(--danger)"}}>{globalErr}</div>}
        <div className="plannr-card">
          <h2 style={{margin:"0 0 16px",fontSize:18,color:"var(--text)"}}>Create a Group</h2>
          <label className="plannr-input-label">Group name</label>
          <input placeholder="e.g. Me & Jordan" value={createGroupName} onChange={e=>setCreateGroupName(e.target.value)} />
          <button className="plannr-btn-primary" onClick={createGroup} disabled={loading} style={{opacity:loading?0.7:1}}>Create Group</button>
        </div>
        <div className="plannr-card" style={{marginTop:16}}>
          <h2 style={{margin:"0 0 16px",fontSize:18,color:"var(--text)"}}>Join a Group</h2>
          <label className="plannr-input-label">Join code</label>
          <input placeholder="e.g. AB12CD" value={joinCode} onChange={e=>setJoinCode(e.target.value)} autoCapitalize="characters" />
          {joinMsg && <p style={{color:"var(--danger)",fontSize:14,margin:"0 0 8px"}}>{joinMsg}</p>}
          <button className="plannr-btn-primary" onClick={handleJoinByCode} disabled={loading} style={{opacity:loading?0.7:1}}>Join</button>
        </div>
      </div>
    </div>
  );

  // ── Main app ──────────────────────────────────────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {showLogoutConfirm && <LogoutConfirm onConfirm={doLogout} onCancel={()=>setShowLogoutConfirm(false)} />}
      {notification && <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"#fff",padding:"10px 20px",borderRadius:8,zIndex:999,fontSize:14,fontWeight:500,whiteSpace:"nowrap"}}>{notification}</div>}

      <nav className="plannr-nav">
        <span style={{fontWeight:800,fontSize:16,color:"var(--text)"}}>📅 Plannr — {currentGroup.name}</span>
        <div ref={groupMenuRef} style={{display:"flex",gap:6,alignItems:"center",position:"relative"}}>
          <button className="plannr-btn-small" onClick={()=>setShowGroupMenu(v=>!v)}>⚙</button>
          {showGroupMenu && (
            <div className="plannr-group-menu">
              <p className="plannr-section-title">Join Code</p>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:18}}>
                <span className="plannr-code">{currentGroup.code}</span>
                <button className="plannr-btn-small" onClick={()=>{navigator.clipboard.writeText(currentGroup.code);notify("Copied!");}}>Copy</button>
              </div>
              <p className="plannr-section-title">Invite by Email</p>
              <label className="plannr-input-label">Their email</label>
              <input placeholder="friend@email.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} autoCapitalize="none" />
              {inviteMsg && <p style={{color:"var(--danger)",fontSize:13,margin:"0 0 8px"}}>{inviteMsg}</p>}
              <button className="plannr-btn-primary" onClick={handleInviteByEmail} disabled={loading} style={{marginBottom:16,opacity:loading?0.7:1}}>Add to Group</button>
              <p className="plannr-section-title">Members</p>
              {groupMembers.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div className="plannr-avatar" style={{background:getMemberColor(groupMembers,m.id)}}>{m.name[0].toUpperCase()}</div>
                  <span style={{fontSize:14,color:"var(--text)"}}>{m.name}{m.id===currentUser.id?" (you)":""}</span>
                </div>
              ))}
              <button className="plannr-btn-small" onClick={()=>{leaveGroup();setShowGroupMenu(false);}} style={{marginTop:12,color:"var(--danger)",borderColor:"var(--danger)",width:"100%"}}>Leave Group</button>
              <p style={{margin:"16px 0 0",fontSize:11,color:"var(--text3)",textAlign:"center"}}>Plannr v1.7</p>
            </div>
          )}
          <button className="plannr-btn-small" onClick={confirmLogout}>Log out</button>
        </div>
      </nav>

      <div style={{background:"var(--nav-bg)",borderBottom:"1px solid var(--border)",padding:"0 16px",display:"flex"}}>
        {["list","calendar"].map(v=>(
          <button key={v} className="plannr-tab" onClick={()=>setView(v)} style={{borderBottom:view===v?"3px solid var(--accent)":"3px solid transparent",color:view===v?"var(--accent)":"var(--text3)",fontWeight:view===v?700:500}}>
            {v==="list"?"📋 List":"📆 Calendar"}
          </button>
        ))}
        <button onClick={()=>openAddEvent()} style={{marginLeft:"auto",padding:"8px 14px",margin:"6px 0 6px auto",borderRadius:8,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,alignSelf:"center"}}>+ Add</button>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"16px 12px 80px"}}>

        {view==="list" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h2 style={{margin:0,fontSize:16,color:"var(--text)"}}>Upcoming ({upcoming.length})</h2>
              <Toggle checked={showCompleted} onChange={setShowCompleted} label="Show past" />
            </div>
            {upcoming.length===0 && <div className="plannr-empty">No upcoming events. Tap + Add!</div>}
            {upcoming.map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
            {showCompleted && past.length>0 && (
              <>
                <h2 style={{margin:"24px 0 12px",fontSize:16,color:"var(--text3)"}}>Past ({past.length})</h2>
                {past.map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
              </>
            )}
          </div>
        )}

        {view==="calendar" && (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
              <button className="plannr-btn-small" onClick={()=>setCalMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})} style={{fontSize:18,padding:"6px 14px"}}>‹</button>
              <span style={{fontWeight:700,fontSize:15,flex:1,textAlign:"center",color:"var(--text)"}}>{new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
              <button className="plannr-btn-small" onClick={()=>setCalMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})} style={{fontSize:18,padding:"6px 14px"}}>›</button>
            </div>
            <div className="plannr-cal-grid">
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} className="plannr-cal-header-cell">{d}</div>)}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                {Array.from({length:firstDay(calMonth.y,calMonth.m)}).map((_,i)=>(
                  <div key={`p${i}`} className="plannr-cal-cell" style={{background:"var(--pad-bg)",cursor:"default"}} />
                ))}
                {Array.from({length:daysInMonth(calMonth.y,calMonth.m)}).map((_,i)=>{
                  const day=i+1;
                  const ds=`${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayEvs=(eventsByDay[ds]||[]).filter(e=>showCompleted||!e.completed);
                  const isToday=ds===todayStr(), isSel=selectedDay===ds;
                  return (
                    <div key={day} className="plannr-cal-cell" onClick={()=>setSelectedDay(isSel?null:ds)}
                      style={{background:isSel?"var(--sel-bg)":isToday?"var(--today-bg)":"transparent"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:isToday?"var(--accent)":"transparent",color:isToday?"#fff":"var(--text)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:isToday?700:400,fontSize:12,margin:"0 auto 2px"}}>{day}</div>
                      {dayEvs.slice(0,2).map(ev=><CalChip key={ev.id} ev={ev} members={groupMembers} />)}
                      {dayEvs.length>2 && <div style={{fontSize:9,color:"var(--text3)",textAlign:"center"}}>+{dayEvs.length-2}</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{margin:"12px 0"}}>
              <Toggle checked={showCompleted} onChange={setShowCompleted} label="Show completed" />
            </div>

            {selectedDay && (
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <h3 style={{margin:0,fontSize:15,color:"var(--text)"}}>{fmtDate(selectedDay)}</h3>
                  <button onClick={()=>openAddEvent(selectedDay)} style={{padding:"7px 14px",background:"var(--accent)",color:"#fff",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:14}}>+ Add</button>
                </div>
                {!(eventsByDay[selectedDay]||[]).length
                  ? <div className="plannr-empty">No events this day.</div>
                  : (eventsByDay[selectedDay]||[]).map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
              </div>
            )}

            <div style={{paddingBottom:16}}>
              <h3 style={{margin:"0 0 12px",fontSize:15,color:"var(--text)"}}>
                {new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long",year:"numeric"})} — All Events ({monthEvents.length})
              </h3>
              {monthEvents.length===0
                ? <div className="plannr-empty">No events this month.</div>
                : monthEvents.map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent} />)}
            </div>
          </div>
        )}
      </div>

      {showAddEvent && (
        <div className="plannr-modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddEvent(false)}>
          <div className="plannr-modal">
            <div style={{width:40,height:4,background:"var(--border)",borderRadius:4,margin:"0 auto 20px"}} />
            <h2 style={{margin:"0 0 20px",fontSize:19,color:"var(--text)"}}>{editEvent?"Edit Event":"New Event"}</h2>
            <label className="plannr-input-label">Event title *</label>
            <input placeholder="e.g. Dinner with friends" value={eventForm.title} onChange={e=>setEventForm(f=>({...f,title:e.target.value}))} />
            <label className="plannr-input-label">Date *</label>
            <input type="date" value={eventForm.date} onChange={e=>setEventForm(f=>({...f,date:e.target.value}))} />
            <label className="plannr-input-label">Time (optional)</label>
            <input type="time" value={eventForm.time} onChange={e=>setEventForm(f=>({...f,time:e.target.value}))} />
            <label className="plannr-input-label">Notes (optional)</label>
            <textarea placeholder="Any extra details…" value={eventForm.notes} onChange={e=>setEventForm(f=>({...f,notes:e.target.value}))} style={{minHeight:80,resize:"vertical"}} />
            <label className="plannr-input-label">Attendees</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {groupMembers.map(m=>{ const sel=eventForm.attendees.includes(m.id),col=getMemberColor(groupMembers,m.id); return <button key={m.id} onClick={()=>toggleAttendee(m.id)} style={{padding:"8px 16px",borderRadius:20,border:`2px solid ${col}`,background:sel?col:"transparent",color:sel?"#fff":col,fontWeight:600,cursor:"pointer",fontSize:14}}>{m.name}</button>; })}
            </div>
            {formErr && <p style={{color:"var(--danger)",fontSize:14,margin:"0 0 12px"}}>{formErr}</p>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowAddEvent(false)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1.5px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer",fontWeight:600,fontSize:15}}>Cancel</button>
              <button onClick={saveEvent} disabled={loading} style={{flex:2,padding:"12px 0",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:15,opacity:loading?0.7:1}}>{loading?"Saving…":editEvent?"Save Changes":"Add Event"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalChip({ ev, members }) {
  const [hovered, setHovered] = useState(false);
  const color = getMemberColor(members,ev.attendees[0]);
  const names = ev.attendees.map(id=>members.find(m=>m.id===id)?.name).filter(Boolean).join(", ");
  return (
    <div style={{position:"relative"}} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}>
      <div style={{fontSize:9,background:color,color:"#fff",borderRadius:3,padding:"1px 3px",marginBottom:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",opacity:ev.completed?0.5:1}}>
        {ev.completed?"✓ ":""}{ev.title}
      </div>
      {hovered && (
        <div style={{position:"absolute",left:0,top:"100%",zIndex:300,background:"#1e293b",color:"#fff",borderRadius:8,padding:"8px 10px",minWidth:160,maxWidth:220,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",pointerEvents:"none"}}>
          <div style={{fontWeight:700,fontSize:12,marginBottom:4}}>{ev.title}</div>
          {ev.time && <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>🕐 {fmtTime(ev.time)}</div>}
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:ev.notes?3:0}}>👤 {names||"No attendees"}</div>
          {ev.notes && <div style={{fontSize:11,color:"#cbd5e1",borderTop:"1px solid #334155",paddingTop:4,marginTop:3}}>{ev.notes}</div>}
          {ev.completed && <div style={{fontSize:10,color:"#4ade80",marginTop:4}}>✓ Completed</div>}
        </div>
      )}
    </div>
  );
}

function EventCard({ ev, members, onToggle, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const color = getMemberColor(members,ev.attendees[0]);
  return (
    <div className="plannr-event-card" style={{opacity:ev.completed?0.6:1,borderLeft:`4px solid ${color}`}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{marginTop:2,flexShrink:0}}>
          <Checkbox checked={ev.completed} onChange={()=>onToggle(ev.id)} />
        </div>
        <div style={{flex:1,cursor:"pointer"}} onClick={()=>setExpanded(v=>!v)}>
          <div style={{fontWeight:600,fontSize:15,textDecoration:ev.completed?"line-through":"none",color:ev.completed?"var(--text3)":"var(--text)"}}>{ev.title}</div>
          <div style={{fontSize:13,color:"var(--text2)",marginTop:3}}>{fmtDate(ev.date)}{ev.time?` · ${fmtTime(ev.time)}`:""}</div>
          <div style={{display:"flex",gap:5,marginTop:6,flexWrap:"wrap"}}>
            {ev.attendees.map(aid=>{ const m=members.find(x=>x.id===aid); return m?<span key={aid} className="plannr-tag" style={{background:getMemberColor(members,aid)}}>{m.name}</span>:null; })}
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          <button onClick={()=>onEdit(ev)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--text3)",padding:"4px 6px"}}>✏️</button>
          <button onClick={()=>onDelete(ev.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:"var(--text3)",padding:"4px 6px"}}>🗑️</button>
        </div>
      </div>
      {expanded && ev.notes && <div className="plannr-notes-box">{ev.notes}</div>}
    </div>
  );
}

function Checkbox({ checked, onChange }) {
  return (
    <span className={`plannr-checkbox${checked?" checked":""}`} onClick={onChange}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}