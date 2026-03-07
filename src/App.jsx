import React, { useState, useEffect, useCallback, useRef } from "react";

const SUPABASE_URL = "https://isrtzkuatmidbabtzpwv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcnR6a3VhdG1pZGJhYnR6cHd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDk5MDMsImV4cCI6MjA4ODM4NTkwM30.FqB8nUgE5tumu5OcTKyhfcSYCUB0w1jPUzP9MVRECqo";

const sb=async(path,opts={})=>{
  const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...opts,headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${SUPABASE_ANON_KEY}`,"Content-Type":"application/json","Prefer":"return=representation",...(opts.headers||{})}});
  if(!res.ok){const e=await res.text();throw new Error(e);}
  return res.status===204?null:res.json();
};
const dbGet=(t,q="")=>sb(`${t}?${q}`);
const dbInsert=(t,d)=>sb(t,{method:"POST",body:JSON.stringify(d)});
const dbUpdate=(t,q,d)=>sb(`${t}?${q}`,{method:"PATCH",body:JSON.stringify(d)});
const dbDelete=(t,q)=>sb(`${t}?${q}`,{method:"DELETE",headers:{"Prefer":"return=minimal"}});

const subscribeToTable=(table,groupId,onChange)=>{
  const ws=new WebSocket(`${SUPABASE_URL.replace("https","wss")}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`);
  ws.onopen=()=>{
    ws.send(JSON.stringify({topic:"realtime:public",event:"phx_join",payload:{config:{broadcast:{self:false},presence:{key:""}}},ref:"1"}));
    ws.send(JSON.stringify({topic:`realtime:public:${table}:group_id=eq.${groupId}`,event:"phx_join",payload:{config:{postgres_changes:[{event:"*",schema:"public",table,filter:`group_id=eq.${groupId}`}]}},ref:"2"}));
  };
  ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m.event==="postgres_changes"||(m.payload?.data?.type))onChange();}catch{}};
  return()=>ws.close();
};

const genId=()=>Math.random().toString(36).slice(2,10);
const genCode=()=>Math.random().toString(36).slice(2,8).toUpperCase();
const todayStr=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>{const[y,m,day]=d.split("-");return new Date(y,m-1,day).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"});};
const fmtTime=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);return`${h%12||12}:${String(m).padStart(2,"0")} ${h>=12?"PM":"AM"}`;};
const COLORS=["#6366f1","#06b6d4","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];
const getMemberColor=(members,uid)=>COLORS[members.findIndex(m=>m.id===uid)%COLORS.length]||"#94a3b8";

const getDateRange=(start,end)=>{
  if(!start||!end||end<start)return start?[start]:[];
  const dates=[];const cur=new Date(start+"T00:00:00");const last=new Date(end+"T00:00:00");
  while(cur<=last){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);}
  return dates;
};
const isMultiDay=ev=>ev.end_date&&ev.end_date!==ev.date;
const evSpansDays=(ev,dateStr)=>isMultiDay(ev)?dateStr>=ev.date&&dateStr<=ev.end_date:ev.date===dateStr;

const SESSION_KEY="sharedcal_user";
const saveSession=u=>{try{localStorage.setItem(SESSION_KEY,JSON.stringify(u));}catch{}};
const loadSession=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY));}catch{return null;}};
const clearSession=()=>{try{localStorage.removeItem(SESSION_KEY);}catch{}};

const CELL_H=80;
const DAY_NUM_H=24;
const BAR_H=14;
const BAR_GAP=2;
const BAR_TOP=DAY_NUM_H+2;

const injectStyles=()=>{
  if(document.getElementById("plannr-styles"))return;
  const el=document.createElement("style");
  el.id="plannr-styles";
  el.textContent=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
    :root{
      --bg:#f0f2f7;
      --surface:#ffffff;
      --surface2:#f7f8fc;
      --border:#e4e7ef;
      --text:#111827;
      --text2:#4b5563;
      --text3:#9ca3af;
      --input-bg:#ffffff;
      --nav-bg:#ffffff;
      --chip-bg:#f0f2f7;
      --code-bg:#f0f2f7;
      --modal-bg:#ffffff;
      --pad-bg:#f7f8fc;
      --today-bg:#eef0ff;
      --sel-bg:#e8eaff;
      --danger:#ef4444;
      --accent:#4f46e5;
      --accent2:#6366f1;
      --radius:14px;
      --shadow:0 2px 12px rgba(79,70,229,0.08);
      --shadow-lg:0 8px 32px rgba(79,70,229,0.14);
    }
    @media(prefers-color-scheme:dark){:root{
      --bg:#0d1117;
      --surface:#161b27;
      --surface2:#1c2333;
      --border:#2d3748;
      --text:#f0f4ff;
      --text2:#8892b0;
      --text3:#4a5568;
      --input-bg:#1c2333;
      --nav-bg:#161b27;
      --chip-bg:#2d3748;
      --code-bg:#0d1117;
      --modal-bg:#161b27;
      --pad-bg:#0f1420;
      --today-bg:#1a2040;
      --sel-bg:#1e2354;
      --danger:#f87171;
      --accent:#6366f1;
      --accent2:#818cf8;
      --shadow:0 2px 12px rgba(0,0,0,0.3);
      --shadow-lg:0 8px 32px rgba(0,0,0,0.4);
    }}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;}
    input:not([type="checkbox"]):not([type="radio"]),textarea,select{
      background:var(--input-bg)!important;
      color:var(--text)!important;
      border:1.5px solid var(--border)!important;
      border-radius:10px;
      font-size:15px;
      font-family:'DM Sans',inherit;
      outline:none;
      width:100%;
      padding:11px 14px;
      display:block;
      margin-bottom:12px;
      -webkit-appearance:none;
      appearance:none;
      transition:border-color 0.15s,box-shadow 0.15s;
    }
    input:focus,textarea:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(99,102,241,0.12)!important;}
    input::placeholder,textarea::placeholder{color:var(--text3)!important;opacity:1;}
    .plannr-btn-primary{
      display:block;width:100%;padding:13px 0;
      background:var(--accent);color:#fff;border:none;
      border-radius:10px;font-weight:600;font-size:15px;
      cursor:pointer;margin-bottom:10px;
      -webkit-tap-highlight-color:transparent;
      font-family:'DM Sans',inherit;
      transition:opacity 0.15s,transform 0.1s;
      letter-spacing:0.01em;
    }
    .plannr-btn-primary:active{transform:scale(0.98);}
    .plannr-btn-small{
      padding:7px 13px;border-radius:8px;
      border:1.5px solid var(--border);
      background:var(--surface);color:var(--text);
      cursor:pointer;font-size:13px;font-weight:500;
      -webkit-tap-highlight-color:transparent;
      font-family:'DM Sans',inherit;
      transition:border-color 0.15s,background 0.15s;
    }
    .plannr-btn-small:hover{border-color:var(--accent);background:var(--sel-bg);}
    .plannr-card{
      background:var(--surface);
      border-radius:var(--radius);
      padding:22px;
      box-shadow:var(--shadow);
      border:1px solid var(--border);
    }
    .plannr-input-label{display:block;font-size:12px;font-weight:600;color:var(--text3);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.06em;}
    .plannr-event-card{
      background:var(--surface);
      border-radius:12px;
      padding:14px 16px;
      margin-bottom:8px;
      box-shadow:var(--shadow);
      border:1px solid var(--border);
      transition:box-shadow 0.15s;
    }
    .plannr-event-card:hover{box-shadow:var(--shadow-lg);}
    .plannr-nav{
      background:var(--nav-bg);
      border-bottom:1px solid var(--border);
      padding:0 20px;
      display:flex;align-items:center;justify-content:space-between;gap:8px;
      position:sticky;top:0;z-index:50;
      height:56px;
    }
    .plannr-cal-grid{background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow);border:1px solid var(--border);}
    .plannr-cal-header-cell{padding:10px 0;text-align:center;font-size:11px;font-weight:600;color:var(--text3);border-bottom:1px solid var(--border);background:var(--surface2);letter-spacing:0.08em;text-transform:uppercase;}
    .plannr-cal-cell{
      height:${CELL_H}px;
      border-right:1px solid var(--border);
      border-bottom:1px solid var(--border);
      cursor:pointer;
      overflow:hidden;
      position:relative;
      padding:2px;
      transition:background 0.1s;
    }
    .plannr-cal-cell:hover{background:var(--sel-bg)!important;}
    .plannr-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:200;}
    .plannr-modal{
      background:var(--modal-bg);
      border-radius:20px 20px 0 0;
      padding:24px 22px 40px;
      width:100%;max-width:520px;
      box-shadow:0 -8px 40px rgba(0,0,0,0.2);
      max-height:92vh;overflow-y:auto;
      border-top:1px solid var(--border);
    }
    .plannr-group-menu{
      position:absolute;right:0;top:48px;
      background:var(--surface);
      border-radius:var(--radius);
      box-shadow:var(--shadow-lg);
      padding:20px;width:290px;z-index:100;
      border:1px solid var(--border);
    }
    .plannr-code{
      background:var(--code-bg);color:var(--text);
      padding:8px 14px;border-radius:8px;
      font-weight:700;letter-spacing:5px;font-size:17px;
      flex:1;text-align:center;
      font-family:'DM Mono',monospace;
      border:1.5px solid var(--border);
    }
    .plannr-tag{font-size:11px;color:#fff;border-radius:20px;padding:3px 10px;font-weight:600;letter-spacing:0.01em;}
    .plannr-avatar{width:30px;height:30px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;}
    .plannr-empty{text-align:center;color:var(--text3);padding:40px 0;font-size:14px;}
    .plannr-tab{
      padding:14px 18px;border:none;background:transparent;
      cursor:pointer;font-size:14px;font-family:'DM Sans',inherit;
      -webkit-tap-highlight-color:transparent;
      transition:color 0.15s;
    }
    .plannr-section-title{font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;}
    .plannr-notes-box{margin-top:10px;margin-left:28px;font-size:13px;color:var(--text2);background:var(--surface2);border-radius:8px;padding:10px 13px;line-height:1.6;border:1px solid var(--border);}
    .plannr-confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:300;padding:16px;}
    .plannr-confirm-box{background:var(--modal-bg);border-radius:18px;padding:28px 24px;width:100%;max-width:320px;box-shadow:var(--shadow-lg);text-align:center;border:1px solid var(--border);}
    .plannr-checkbox{width:20px;height:20px;border-radius:6px;flex-shrink:0;border:2px solid var(--border);background:var(--input-bg);display:flex;align-items:center;justify-content:center;transition:background 0.15s,border-color 0.15s;cursor:pointer;}
    .plannr-checkbox.checked{background:var(--accent);border-color:var(--accent);}
    .plannr-checkbox svg{display:none;}
    .plannr-checkbox.checked svg{display:block;}
    .multiday-badge{display:inline-block;font-size:10px;background:var(--accent);color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle;font-weight:600;font-family:'DM Mono',monospace;}
    .logo-text{font-size:17px;font-weight:700;color:var(--text);letter-spacing:-0.02em;}
    .logo-dot{color:var(--accent);}
    .tab-bar{background:var(--nav-bg);border-bottom:1px solid var(--border);padding:0 20px;display:flex;align-items:center;}
    .add-btn{
      padding:8px 16px;margin:7px 0 7px auto;
      border-radius:20px;border:none;
      background:var(--accent);color:#fff;
      font-weight:600;cursor:pointer;font-size:13px;
      font-family:'DM Sans',inherit;
      display:flex;align-items:center;gap:6px;
      transition:opacity 0.15s,transform 0.1s;
      letter-spacing:0.01em;
    }
    .add-btn:active{transform:scale(0.96);}
    ::-webkit-scrollbar{width:6px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
  `;
  document.head.appendChild(el);
};

function Toggle({checked,onChange,label}){
  return(
    <div style={{cursor:"pointer",userSelect:"none",display:"inline-flex",alignItems:"center",gap:9,WebkitTapHighlightColor:"transparent"}}
      onPointerDown={e=>{e.preventDefault();onChange(!checked);}}>
      <div style={{position:"relative",width:40,height:22,flexShrink:0}}>
        <div style={{position:"absolute",inset:0,borderRadius:11,background:checked?"var(--accent)":"var(--border)",transition:"background 0.2s"}}/>
        <div style={{position:"absolute",top:3,left:checked?21:3,width:16,height:16,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,0.2)",transition:"left 0.2s"}}/>
      </div>
      <span style={{fontSize:13,color:"var(--text2)"}}>{label}</span>
    </div>
  );
}

function Checkbox({checked,onChange}){
  return(
    <span className={`plannr-checkbox${checked?" checked":""}`} onClick={onChange}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
        <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

function LogoutConfirm({onConfirm,onCancel}){
  return(
    <div className="plannr-confirm-overlay">
      <div className="plannr-confirm-box">
        <div style={{fontSize:32,marginBottom:12}}>👋</div>
        <h3 style={{margin:"0 0 8px",fontSize:17,color:"var(--text)",fontWeight:700}}>Log out of Plannr?</h3>
        <p style={{margin:"0 0 22px",fontSize:13,color:"var(--text2)",lineHeight:1.5}}>You'll need to log back in to see your events.</p>
        <div style={{display:"flex",gap:10}}>
          <button onClick={onCancel} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid var(--border)",background:"transparent",color:"var(--text)",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Cancel</button>
          <button onClick={onConfirm} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"var(--danger)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Log Out</button>
        </div>
      </div>
    </div>
  );
}

function CalendarGrid({calMonth,events,showCompleted,today,selectedDay,setSelectedDay,groupMembers}){
  const gridRef=useRef(null);
  const[cellRects,setCellRects]=useState({});
  const Y=calMonth.y,M=calMonth.m;
  const daysInMonth=new Date(Y,M+1,0).getDate();
  const firstDow=new Date(Y,M,1).getDay();
  const ds=day=>`${Y}-${String(M+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  useEffect(()=>{
    if(!gridRef.current)return;
    const measure=()=>{
      const parent=gridRef.current.getBoundingClientRect();
      const rects={};
      gridRef.current.querySelectorAll("[data-day]").forEach(el=>{
        const r=el.getBoundingClientRect();
        rects[el.dataset.day]={left:r.left-parent.left,top:r.top-parent.top,w:r.width,h:r.height};
      });
      setCellRects(rects);
    };
    measure();
    const ro=new ResizeObserver(measure);
    ro.observe(gridRef.current);
    return()=>ro.disconnect();
  },[calMonth]);

  const filtered=events.filter(e=>showCompleted||!e.completed);
  const singleByDay={};
  filtered.filter(e=>!isMultiDay(e)).forEach(e=>{
    if(!singleByDay[e.date])singleByDay[e.date]=[];
    singleByDay[e.date].push(e);
  });

  const segments=[];
  filtered.filter(e=>isMultiDay(e)).forEach(ev=>{
    const all=getDateRange(ev.date,ev.end_date);
    let seg=[];
    all.forEach(d=>{
      const dow=new Date(d+"T00:00:00").getDay();
      seg.push(d);
      if(dow===6||d===all[all.length-1]){segments.push({ev,days:[...seg]});seg=[];}
    });
  });

  const weekLanes={};
  const segLane={};
  segments.forEach(({ev,days})=>{
    const startD=days[0],endD=days[days.length-1];
    const[y,mo,d]=startD.split("-").map(Number);
    const dow=new Date(y,mo-1,d).getDay();
    const wkKey=`${y}-${mo}-${d-dow}`;
    if(!weekLanes[wkKey])weekLanes[wkKey]=[];
    const used=weekLanes[wkKey];
    let lane=0;
    while(used.some(u=>u.lane===lane&&u.endD>=startD))lane++;
    used.push({evId:ev.id,endD,lane});
    segLane[ev.id+startD]=lane;
  });

  return(
    <div className="plannr-cal-grid">
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
          <div key={i} className="plannr-cal-header-cell">{d}</div>
        ))}
      </div>
      <div ref={gridRef} style={{position:"relative"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {Array.from({length:firstDow}).map((_,i)=>(
            <div key={`pad${i}`} className="plannr-cal-cell" style={{background:"var(--pad-bg)",cursor:"default"}}/>
          ))}
          {Array.from({length:daysInMonth}).map((_,i)=>{
            const day=i+1,date=ds(day);
            const isToday=date===today,isSel=selectedDay===date;
            const singles=singleByDay[date]||[];
            const multiLanesUsed=segments.filter(s=>s.days.includes(date)).length;
            const maxSingle=Math.max(0,Math.floor((CELL_H-BAR_TOP-multiLanesUsed*(BAR_H+BAR_GAP))/(BAR_H+BAR_GAP)));
            return(
              <div key={day} data-day={date} className="plannr-cal-cell"
                onClick={()=>setSelectedDay(isSel?null:date)}
                style={{background:isSel?"var(--sel-bg)":isToday?"var(--today-bg)":"transparent"}}>
                <div style={{display:"flex",justifyContent:"center",height:DAY_NUM_H,alignItems:"center"}}>
                  <div style={{
                    width:22,height:22,borderRadius:"50%",
                    background:isToday?"var(--accent)":"transparent",
                    color:isToday?"#fff":"var(--text)",
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontWeight:isToday?700:400,fontSize:11,
                  }}>{day}</div>
                </div>
                {segments.filter(s=>s.days.includes(date)).map((_,li)=>(
                  <div key={li} style={{height:BAR_H+BAR_GAP}}/>
                ))}
                {singles.slice(0,Math.max(1,maxSingle)).map(ev=>(
                  <div key={ev.id} style={{
                    fontSize:9,fontWeight:600,color:"#fff",
                    background:getMemberColor(groupMembers,ev.attendees[0]),
                    opacity:ev.completed?0.5:1,
                    borderRadius:3,padding:"1px 4px",
                    marginBottom:BAR_GAP,
                    overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",
                    height:BAR_H,lineHeight:`${BAR_H}px`,
                  }}>{ev.completed?"✓ ":""}{ev.title}</div>
                ))}
                {singles.length>Math.max(1,maxSingle)&&(
                  <div style={{fontSize:8,color:"var(--text3)",textAlign:"center"}}>+{singles.length-Math.max(1,maxSingle)}</div>
                )}
              </div>
            );
          })}
        </div>
        {segments.map(({ev,days})=>{
          const startD=days[0],endD=days[days.length-1];
          const startRect=cellRects[startD],endRect=cellRects[endD];
          if(!startRect||!endRect)return null;
          const lane=segLane[ev.id+startD]||0;
          const color=getMemberColor(groupMembers,ev.attendees[0]);
          const top=startRect.top+BAR_TOP+lane*(BAR_H+BAR_GAP);
          const left=startRect.left+1;
          const width=(endRect.left+endRect.w)-startRect.left-2;
          const isSegStart=startD===ev.date;
          const isSegEnd=endD===ev.end_date;
          return(
            <div key={ev.id+startD}
              onClick={e=>{e.stopPropagation();setSelectedDay(startD);}}
              style={{
                position:"absolute",top,left,width,height:BAR_H,
                borderRadius:`${isSegStart?4:0}px ${isSegEnd?4:0}px ${isSegEnd?4:0}px ${isSegStart?4:0}px`,
                background:color,opacity:ev.completed?0.5:1,
                display:"flex",alignItems:"center",
                paddingLeft:isSegStart?5:2,
                overflow:"hidden",cursor:"pointer",zIndex:5,
              }}
              title={ev.title}>
              {isSegStart&&(
                <span style={{fontSize:9,fontWeight:600,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",pointerEvents:"none"}}>
                  {ev.completed?"✓ ":""}{ev.title}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App(){
  useEffect(()=>{injectStyles();},[]);

  const[currentUser,setCurrentUser]=useState(loadSession);
  const[currentGroup,setCurrentGroup]=useState(null);
  const[groupMembers,setGroupMembers]=useState([]);
  const[events,setEvents]=useState([]);
  const[loading,setLoading]=useState(false);
  const[view,setView]=useState("list");
  const[authMode,setAuthMode]=useState("login");
  const[authForm,setAuthForm]=useState({name:"",email:"",password:""});
  const[authErr,setAuthErr]=useState("");
  const[showAddEvent,setShowAddEvent]=useState(false);
  const[showCompleted,setShowCompleted]=useState(false);
  const[calMonth,setCalMonth]=useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const[selectedDay,setSelectedDay]=useState(null);
  const[editEvent,setEditEvent]=useState(null);
  const[eventForm,setEventForm]=useState({title:"",date:todayStr(),end_date:"",time:"",notes:"",attendees:[],multi:false});
  const[formErr,setFormErr]=useState("");
  const[inviteEmail,setInviteEmail]=useState("");
  const[inviteMsg,setInviteMsg]=useState("");
  const[joinCode,setJoinCode]=useState("");
  const[joinMsg,setJoinMsg]=useState("");
  const[showGroupMenu,setShowGroupMenu]=useState(false);
  const[createGroupName,setCreateGroupName]=useState("");
  const[notification,setNotification]=useState(null);
  const[globalErr,setGlobalErr]=useState(null);
  const[showLogoutConfirm,setShowLogoutConfirm]=useState(false);
  const[calendarFilter,setCalendarFilter]=useState([]);
  const[listFilter,setListFilter]=useState("7days");
  const groupMenuRef=useRef(null);

  useEffect(()=>{
    if(!showGroupMenu)return;
    const h=e=>{if(groupMenuRef.current&&!groupMenuRef.current.contains(e.target))setShowGroupMenu(false);};
    document.addEventListener("mousedown",h);document.addEventListener("touchstart",h);
    return()=>{document.removeEventListener("mousedown",h);document.removeEventListener("touchstart",h);};
  },[showGroupMenu]);

  const notify=msg=>{setNotification(msg);setTimeout(()=>setNotification(null),2500);};

  const refreshGroup=useCallback(async user=>{
    if(!user?.group_id){setCurrentGroup(null);setGroupMembers([]);setEvents([]);return;}
    try{
      const[grps,members,evs]=await Promise.all([
        dbGet("groups",`id=eq.${user.group_id}`),
        dbGet("users",`group_id=eq.${user.group_id}&select=id,name,email,group_id`),
        dbGet("events",`group_id=eq.${user.group_id}&order=date.asc,time.asc`)
      ]);
      setCurrentGroup(grps[0]||null);setGroupMembers(members||[]);
      setEvents((evs||[]).map(e=>({...e,attendees:e.attendees||[]})));
    }catch(e){setGlobalErr("Failed to load: "+e.message);}
  },[]);

  const refreshEvents=useCallback(async()=>{
    if(!currentUser?.group_id)return;
    try{const evs=await dbGet("events",`group_id=eq.${currentUser.group_id}&order=date.asc,time.asc`);
      setEvents((evs||[]).map(e=>({...e,attendees:e.attendees||[]})));
    }catch{}
  },[currentUser]);

  useEffect(()=>{if(currentUser)refreshGroup(currentUser);},[currentUser,refreshGroup]);
  useEffect(()=>{
    if(!currentUser?.group_id)return;
    return subscribeToTable("events",currentUser.group_id,refreshEvents);
  },[currentUser?.group_id,refreshEvents]);

  const handleAuth=async()=>{
    setAuthErr("");setLoading(true);
    try{
      if(authMode==="signup"){
        if(!authForm.name){setAuthErr("Name required.");return;}
        if(!authForm.email||!authForm.password){setAuthErr("Email and password required.");return;}
        const ex=await dbGet("users",`email=eq.${encodeURIComponent(authForm.email)}&select=id`);
        if(ex?.length){setAuthErr("Email already registered.");return;}
        const u={id:genId(),name:authForm.name,email:authForm.email,password:authForm.password,group_id:null};
        const res=await dbInsert("users",u);saveSession(res[0]);setCurrentUser(res[0]);
      }else{
        if(!authForm.email||!authForm.password){setAuthErr("Email and password required.");return;}
        const res=await dbGet("users",`email=eq.${encodeURIComponent(authForm.email)}&password=eq.${encodeURIComponent(authForm.password)}`);
        if(!res?.length){setAuthErr("Invalid email or password.");return;}
        saveSession(res[0]);setCurrentUser(res[0]);
      }
    }catch(e){setAuthErr("Error: "+e.message);}
    finally{setLoading(false);}
  };

  const confirmLogout=()=>setShowLogoutConfirm(true);
  const doLogout=()=>{clearSession();setCurrentUser(null);setCurrentGroup(null);setGroupMembers([]);setEvents([]);setShowLogoutConfirm(false);setAuthForm({name:"",email:"",password:""});setAuthErr("");};

  const createGroup=async()=>{
    if(!createGroupName.trim())return;setLoading(true);
    try{
      const grp={id:genId(),name:createGroupName.trim(),owner_id:currentUser.id,code:genCode()};
      await dbInsert("groups",grp);await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:grp.id});
      const u={...currentUser,group_id:grp.id};saveSession(u);setCurrentUser(u);setCreateGroupName("");notify("Group created!");
    }catch(e){notify("Error: "+e.message);}finally{setLoading(false);}
  };

  const handleJoinByCode=async()=>{
    setLoading(true);setJoinMsg("");
    try{
      const grps=await dbGet("groups",`code=eq.${joinCode.trim().toUpperCase()}`);
      if(!grps?.length){setJoinMsg("Invalid code.");return;}
      await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:grps[0].id});
      const u={...currentUser,group_id:grps[0].id};saveSession(u);setCurrentUser(u);setJoinCode("");notify(`Joined "${grps[0].name}"!`);
    }catch(e){setJoinMsg("Error: "+e.message);}finally{setLoading(false);}
  };

  const handleInviteByEmail=async()=>{
    setLoading(true);setInviteMsg("");
    try{
      const res=await dbGet("users",`email=eq.${encodeURIComponent(inviteEmail.trim())}&select=id,name,group_id`);
      if(!res?.length){setInviteMsg("No user found. They must sign up first.");return;}
      if(res[0].group_id){setInviteMsg("That user is already in a group.");return;}
      await dbUpdate("users",`id=eq.${res[0].id}`,{group_id:currentGroup.id});
      setInviteEmail("");notify(`${res[0].name} added!`);await refreshGroup(currentUser);
    }catch(e){setInviteMsg("Error: "+e.message);}finally{setLoading(false);}
  };

  const leaveGroup=async()=>{
    setLoading(true);
    try{
      await dbUpdate("users",`id=eq.${currentUser.id}`,{group_id:null});
      const u={...currentUser,group_id:null};saveSession(u);setCurrentUser(u);notify("Left group.");
    }catch(e){notify("Error: "+e.message);}finally{setLoading(false);}
  };

  const openAddEvent=date=>{
    setEventForm({title:"",date:date||todayStr(),end_date:"",time:"",notes:"",attendees:currentUser?[currentUser.id]:[],multi:false});
    setEditEvent(null);setFormErr("");setShowAddEvent(true);
  };
  const openEditEvent=ev=>{
    const multi=isMultiDay(ev);
    setEventForm({title:ev.title,date:ev.date,end_date:ev.end_date||"",time:ev.time||"",notes:ev.notes||"",attendees:ev.attendees,multi});
    setEditEvent(ev);setFormErr("");setShowAddEvent(true);
  };
  const saveEvent=async()=>{
    if(!eventForm.title.trim())return setFormErr("Title required.");
    if(!eventForm.date)return setFormErr("Date required.");
    if(eventForm.multi&&eventForm.end_date&&eventForm.end_date<eventForm.date)return setFormErr("End date must be after start date.");
    setLoading(true);
    const end_date=eventForm.multi&&eventForm.end_date?eventForm.end_date:null;
    try{
      if(editEvent){
        await dbUpdate("events",`id=eq.${editEvent.id}`,{title:eventForm.title,date:eventForm.date,end_date,time:eventForm.time,notes:eventForm.notes,attendees:eventForm.attendees});
        setEvents(evs=>evs.map(e=>e.id===editEvent.id?{...e,...eventForm,end_date}:e));notify("Event updated!");
      }else{
        const ev={id:genId(),group_id:currentGroup.id,title:eventForm.title,date:eventForm.date,end_date,time:eventForm.time,notes:eventForm.notes,attendees:eventForm.attendees,completed:false,created_by:currentUser.id};
        await dbInsert("events",ev);setEvents(evs=>[...evs,ev]);notify("Event added!");
      }
      setShowAddEvent(false);
    }catch(e){setFormErr("Error: "+e.message);}finally{setLoading(false);}
  };
  const toggleComplete=async id=>{
    const ev=events.find(e=>e.id===id);if(!ev)return;
    setEvents(evs=>evs.map(e=>e.id===id?{...e,completed:!e.completed}:e));
    try{await dbUpdate("events",`id=eq.${id}`,{completed:!ev.completed});}
    catch{setEvents(evs=>evs.map(e=>e.id===id?{...e,completed:ev.completed}:e));}
  };
  const deleteEvent=async id=>{
    setEvents(evs=>evs.filter(e=>e.id!==id));
    try{await dbDelete("events",`id=eq.${id}`);notify("Deleted.");}
    catch{notify("Delete failed.");await refreshEvents();}
  };
  const toggleAttendee=id=>setEventForm(f=>({...f,attendees:f.attendees.includes(id)?f.attendees.filter(a=>a!==id):[...f.attendees,id]}));

  const sorted=[...events].sort((a,b)=>(a.date+(a.time||""))<(b.date+(b.time||""))?-1:1);
  const visible=sorted.filter(e=>showCompleted||!e.completed);
  const next7=new Date();next7.setDate(next7.getDate()+7);const next7Str=next7.toISOString().slice(0,10);
  const thisMonthStr=`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const nextMonthDate=new Date();nextMonthDate.setMonth(nextMonthDate.getMonth()+1);
  const nextMonthStr=`${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth()+1).padStart(2,"0")}`;
  const upcoming=visible.filter(e=>{
    if(e.date<todayStr())return false;
    if(listFilter==="7days")return e.date<=next7Str;
    if(listFilter==="month")return e.date.startsWith(thisMonthStr)||(isMultiDay(e)&&e.end_date>=thisMonthStr+"-01"&&e.date<=thisMonthStr+"-31");
    if(listFilter==="nextmonth")return e.date.startsWith(nextMonthStr)||(isMultiDay(e)&&e.end_date>=nextMonthStr+"-01"&&e.date<=nextMonthStr+"-31");
    return true;
  });
  const past=visible.filter(e=>e.date<todayStr());
  const monthStr=`${calMonth.y}-${String(calMonth.m+1).padStart(2,"0")}`;
  const monthEvents=sorted.filter(e=>{
    if(!showCompleted&&e.completed)return false;
    if(e.date.startsWith(monthStr))return true;
    if(isMultiDay(e)&&e.end_date>=monthStr+"-01"&&e.date<=monthStr+"-31")return true;
    return false;
  });
  const selectedDayEvents=selectedDay?events.filter(ev=>evSpansDays(ev,selectedDay)):[];

  // ── Auth screen ──────────────────────────────────────────────────────────────
  if(!currentUser)return(
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{width:"100%",maxWidth:380}}>
        {/* Brand */}
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src="/apple-touch-icon.png" style={{width:80,height:80,borderRadius:18,margin:"0 auto 14px",display:"block",boxShadow:"0 4px 20px rgba(99,102,241,0.35)"}}/>
          <h1 style={{fontSize:26,fontWeight:800,color:"var(--text)",letterSpacing:"-0.03em",marginBottom:4}}>Plannr</h1>
          <p style={{color:"var(--text3)",fontSize:14}}>Your shared calendar, together.</p>
        </div>
        <div className="plannr-card" style={{padding:"28px 24px"}}>
          <div style={{display:"flex",gap:6,marginBottom:22,background:"var(--surface2)",borderRadius:10,padding:4}}>
            {["login","signup"].map(m=>(
              <button key={m} onClick={()=>{setAuthMode(m);setAuthErr("");}}
                style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",
                  background:authMode===m?"var(--surface)":"transparent",
                  color:authMode===m?"var(--text)":"var(--text3)",
                  fontWeight:authMode===m?700:500,cursor:"pointer",fontSize:14,
                  fontFamily:"'DM Sans',inherit",
                  boxShadow:authMode===m?"0 1px 4px rgba(0,0,0,0.1)":"none",
                  transition:"all 0.15s"
                }}>{m==="login"?"Log In":"Sign Up"}</button>
            ))}
          </div>
          {authMode==="signup"&&(
            <><label className="plannr-input-label">Your name</label>
            <input placeholder="e.g. Alex" value={authForm.name} onChange={e=>setAuthForm(f=>({...f,name:e.target.value}))}/></>
          )}
          <label className="plannr-input-label">Email address</label>
          <input placeholder="you@email.com" type="email" autoCapitalize="none" value={authForm.email} onChange={e=>setAuthForm(f=>({...f,email:e.target.value}))}/>
          <label className="plannr-input-label">Password</label>
          <input placeholder="••••••••" type="password" value={authForm.password} onChange={e=>setAuthForm(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleAuth()}/>
          {authErr&&<p style={{color:"var(--danger)",fontSize:13,margin:"0 0 12px",padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{authErr}</p>}
          <button className="plannr-btn-primary" onClick={handleAuth} disabled={loading} style={{opacity:loading?0.7:1,marginTop:4}}>
            {loading?"Please wait…":authMode==="login"?"Log In →":"Create Account →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── No-group screen ──────────────────────────────────────────────────────────
  if(!currentGroup)return(
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {showLogoutConfirm&&<LogoutConfirm onConfirm={doLogout} onCancel={()=>setShowLogoutConfirm(false)}/>}
      <nav className="plannr-nav">
        <span className="logo-text">Plannr<span className="logo-dot">.</span></span>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{color:"var(--text3)",fontSize:13}}>Hi, {currentUser.name}</span>
          <button className="plannr-btn-small" onClick={confirmLogout}>Log out</button>
        </div>
      </nav>
      <div style={{maxWidth:440,margin:"40px auto",padding:"0 16px"}}>
        {globalErr&&<div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:13,color:"var(--danger)"}}>{globalErr}</div>}
        <div className="plannr-card" style={{marginBottom:14}}>
          <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:700,color:"var(--text)"}}>Create a Group</h2>
          <label className="plannr-input-label">Group name</label>
          <input placeholder="e.g. Me & Jordan" value={createGroupName} onChange={e=>setCreateGroupName(e.target.value)}/>
          <button className="plannr-btn-primary" onClick={createGroup} disabled={loading} style={{opacity:loading?0.7:1}}>Create Group</button>
        </div>
        <div className="plannr-card">
          <h2 style={{margin:"0 0 16px",fontSize:16,fontWeight:700,color:"var(--text)"}}>Join a Group</h2>
          <label className="plannr-input-label">Join code</label>
          <input placeholder="e.g. AB12CD" value={joinCode} onChange={e=>setJoinCode(e.target.value)} autoCapitalize="characters"/>
          {joinMsg&&<p style={{color:"var(--danger)",fontSize:13,margin:"0 0 8px"}}>{joinMsg}</p>}
          <button className="plannr-btn-primary" onClick={handleJoinByCode} disabled={loading} style={{opacity:loading?0.7:1}}>Join Group</button>
        </div>
      </div>
    </div>
  );

  // ── Main app ─────────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      {showLogoutConfirm&&<LogoutConfirm onConfirm={doLogout} onCancel={()=>setShowLogoutConfirm(false)}/>}
      {notification&&(
        <div style={{
          position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",
          background:"var(--text)",color:window.matchMedia("(prefers-color-scheme:dark)").matches?"var(--bg)":"#fff",
          padding:"10px 18px",borderRadius:20,zIndex:999,fontSize:13,fontWeight:600,
          whiteSpace:"nowrap",boxShadow:"0 4px 16px rgba(0,0,0,0.2)",letterSpacing:"0.01em",
        }}>{notification}</div>
      )}

      {/* Top nav */}
      <nav className="plannr-nav">
        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
          <div style={{width:30,height:30,borderRadius:8,overflow:"hidden",flexShrink:0}}>
            <img src="/apple-touch-icon.png" style={{width:"100%",height:"100%",display:"block"}}/></div>
          <div style={{minWidth:0}}>
            <span className="logo-text" style={{fontSize:14}}>Plannr<span className="logo-dot">.</span></span>
            <span style={{color:"var(--text3)",fontSize:12,marginLeft:6}}>{currentGroup.name}</span>
          </div>
        </div>
        <div ref={groupMenuRef} style={{display:"flex",gap:6,alignItems:"center",position:"relative"}}>
          <button className="plannr-btn-small" onClick={()=>setShowGroupMenu(v=>!v)} style={{fontSize:14,padding:"6px 10px"}}>⚙️</button>
          {showGroupMenu&&(
            <div className="plannr-group-menu">
              <p className="plannr-section-title" style={{marginBottom:8}}>Join Code</p>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16}}>
                <span className="plannr-code">{currentGroup.code}</span>
                <button className="plannr-btn-small" onClick={()=>{navigator.clipboard.writeText(currentGroup.code);notify("Copied!");}}>Copy</button>
              </div>
              <p className="plannr-section-title">Share App</p>
              <div style={{background:"var(--surface2)",border:"1.5px solid var(--border)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <p style={{fontSize:12,color:"var(--text2)",margin:"0 0 10px",lineHeight:1.5}}>Share this link so others can sign up and join your group:</p>
                <div style={{background:"var(--code-bg)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 10px",fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:10,fontFamily:"'DM Mono',monospace"}}>{window.location.origin}</div>
                <div style={{display:"flex",gap:8}}>
                  <button className="plannr-btn-small" style={{flex:1,textAlign:"center",fontSize:12}} onClick={()=>{navigator.clipboard.writeText(window.location.origin);notify("Link copied!");}}>Copy Link</button>
                  <button className="plannr-btn-small" style={{flex:1,textAlign:"center",fontSize:12}} onClick={()=>{if(navigator.share){navigator.share({title:"Plannr",text:`Join me on Plannr! Use code: ${currentGroup.code}`,url:window.location.origin});}else{navigator.clipboard.writeText(window.location.origin);notify("Link copied!");}}}>↗ Share</button>
                </div>
              </div>
              <p className="plannr-section-title">Invite by Email</p>
              <input placeholder="friend@email.com" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} autoCapitalize="none" style={{marginBottom:8}}/>
              {inviteMsg&&<p style={{color:"var(--danger)",fontSize:12,margin:"0 0 8px"}}>{inviteMsg}</p>}
              <button className="plannr-btn-primary" onClick={handleInviteByEmail} disabled={loading} style={{marginBottom:16,opacity:loading?0.7:1,fontSize:13,padding:"10px 0"}}>Add to Group</button>
              <p className="plannr-section-title">Members</p>
              {groupMembers.map(m=>(
                <div key={m.id} style={{display:"flex",alignItems:"center",gap:9,marginBottom:9}}>
                  <div className="plannr-avatar" style={{background:getMemberColor(groupMembers,m.id),width:28,height:28,fontSize:11}}>{m.name[0].toUpperCase()}</div>
                  <span style={{fontSize:13,color:"var(--text)"}}>{m.name}{m.id===currentUser.id?" (you)":""}</span>
                </div>
              ))}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:14,marginTop:6}}>
                <button className="plannr-btn-small" onClick={()=>{leaveGroup();setShowGroupMenu(false);}} style={{color:"var(--danger)",borderColor:"var(--danger)",width:"100%",fontSize:13}}>Leave Group</button>
              </div>
            </div>
          )}
          <button className="plannr-btn-small" onClick={confirmLogout} style={{fontSize:13}}>Log out</button>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="tab-bar">
        {[{k:"list",label:"List"},{k:"calendar",label:"Calendar"}].map(({k,label})=>(
          <button key={k} className="plannr-tab" onClick={()=>setView(k)}
            style={{
              borderBottom:view===k?"2px solid var(--accent)":"2px solid transparent",
              color:view===k?"var(--accent)":"var(--text3)",
              fontWeight:view===k?700:400,
            }}>
            {label}
          </button>
        ))}
        <button className="add-btn" onClick={()=>openAddEvent()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Event
        </button>
      </div>

      {/* Content */}
      <div style={{maxWidth:900,margin:"0 auto",padding:"16px 14px 80px"}}>

        {/* LIST VIEW */}
        {view==="list"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div>
                <span style={{fontWeight:700,fontSize:15,color:"var(--text)"}}>Upcoming</span>
                <span style={{marginLeft:8,fontSize:13,color:"var(--text3)",fontFamily:"'DM Mono',monospace"}}>{upcoming.length}</span>
              </div>
              <Toggle checked={showCompleted} onChange={setShowCompleted} label="Show past"/>
            </div>
            {/* Time range filter */}
            <div style={{display:"flex",gap:6,marginBottom:16,background:"var(--surface2)",borderRadius:10,padding:4,border:"1px solid var(--border)"}}>
              {[{k:"7days",label:"7 Days"},{k:"month",label:"This Month"},{k:"nextmonth",label:"Next Month"},{k:"all",label:"All"}].map(({k,label})=>(
                <button key={k} onClick={()=>setListFilter(k)} style={{
                  flex:1,padding:"7px 0",borderRadius:8,border:"none",
                  background:listFilter===k?"var(--surface)":"transparent",
                  color:listFilter===k?"var(--text)":"var(--text3)",
                  fontWeight:listFilter===k?700:400,cursor:"pointer",fontSize:11,
                  fontFamily:"'DM Sans',inherit",
                  boxShadow:listFilter===k?"0 1px 4px rgba(0,0,0,0.1)":"none",
                  transition:"all 0.15s",
                }}>{label}</button>
              ))}
            </div>
            {upcoming.length===0&&<div className="plannr-empty">No events. Tap + Add Event!</div>}
            {upcoming.map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent}/>)}
            {showCompleted&&past.length>0&&(
              <>
                <div style={{margin:"24px 0 12px",display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:600,fontSize:14,color:"var(--text3)"}}>Past</span>
                  <span style={{fontSize:12,color:"var(--text3)",fontFamily:"'DM Mono',monospace"}}>{past.length}</span>
                </div>
                {past.map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent}/>)}
              </>
            )}
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view==="calendar"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <button className="plannr-btn-small" onClick={()=>setCalMonth(({y,m})=>m===0?{y:y-1,m:11}:{y,m:m-1})} style={{fontSize:16,padding:"5px 12px"}}>‹</button>
              <span style={{fontWeight:700,fontSize:14,flex:1,textAlign:"center",color:"var(--text)"}}>
                {new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long",year:"numeric"})}
              </span>
              <button className="plannr-btn-small" onClick={()=>setCalMonth(({y,m})=>m===11?{y:y+1,m:0}:{y,m:m+1})} style={{fontSize:16,padding:"5px 12px"}}>›</button>
            </div>

            {/* Member filter chips */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
              <span style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginRight:2}}>Filter:</span>
              {groupMembers.map(m=>{
                const active=calendarFilter.includes(m.id);
                const col=getMemberColor(groupMembers,m.id);
                return(
                  <button key={m.id} onClick={()=>setCalendarFilter(f=>active?f.filter(id=>id!==m.id):[...f,m.id])}
                    style={{padding:"5px 12px",borderRadius:20,border:`2px solid ${col}`,
                      background:active?col:"transparent",color:active?"#fff":col,
                      fontWeight:600,cursor:"pointer",fontSize:12,
                      fontFamily:"'DM Sans',inherit",transition:"all 0.15s",
                    }}>{m.name}</button>
                );
              })}
              {calendarFilter.length>0&&(
                <button onClick={()=>setCalendarFilter([])}
                  style={{padding:"5px 10px",borderRadius:20,border:"1.5px solid var(--border)",
                    background:"transparent",color:"var(--text3)",cursor:"pointer",fontSize:11,
                    fontFamily:"'DM Sans',inherit",
                  }}>✕ Clear</button>
              )}
            </div>

            <CalendarGrid
              calMonth={calMonth}
              events={calendarFilter.length>0?events.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):events}
              showCompleted={showCompleted}
              today={todayStr()}
              selectedDay={selectedDay}
              setSelectedDay={setSelectedDay}
              groupMembers={groupMembers}
            />
            <div style={{margin:"12px 0 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <Toggle checked={showCompleted} onChange={setShowCompleted} label="Show completed"/>
            </div>

            {selectedDay&&(
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <h3 style={{margin:0,fontSize:14,fontWeight:700,color:"var(--text)"}}>{fmtDate(selectedDay)}</h3>
                  <button onClick={()=>openAddEvent(selectedDay)} className="add-btn" style={{fontSize:12,padding:"6px 12px"}}>+ Add</button>
                </div>
                {(calendarFilter.length>0?selectedDayEvents.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):selectedDayEvents).length===0
                  ?<div className="plannr-empty" style={{padding:"20px 0"}}>No events this day.</div>
                  :(calendarFilter.length>0?selectedDayEvents.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):selectedDayEvents).map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent}/>)}
              </div>
            )}

            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:14,color:"var(--text)"}}>
                  {new Date(calMonth.y,calMonth.m).toLocaleDateString("en-US",{month:"long"})}
                </span>
                <span style={{fontSize:12,color:"var(--text3)",fontFamily:"'DM Mono',monospace"}}>{(calendarFilter.length>0?monthEvents.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):monthEvents).length} events</span>
              </div>
              {(calendarFilter.length>0?monthEvents.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):monthEvents).length===0
                ?<div className="plannr-empty">No events this month.</div>
                :(calendarFilter.length>0?monthEvents.filter(e=>e.attendees.some(a=>calendarFilter.includes(a))):monthEvents).map(ev=><EventCard key={ev.id} ev={ev} members={groupMembers} onToggle={toggleComplete} onEdit={openEditEvent} onDelete={deleteEvent}/>)}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Event Modal */}
      {showAddEvent&&(
        <div className="plannr-modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddEvent(false)}>
          <div className="plannr-modal">
            <div style={{width:36,height:4,background:"var(--border)",borderRadius:4,margin:"0 auto 20px"}}/>
            <h2 style={{margin:"0 0 20px",fontSize:18,color:"var(--text)",fontWeight:700,letterSpacing:"-0.02em"}}>{editEvent?"Edit Event":"New Event"}</h2>
            <label className="plannr-input-label">Event title *</label>
            <input placeholder="e.g. Family trip to Miami" value={eventForm.title} onChange={e=>setEventForm(f=>({...f,title:e.target.value}))}/>
            <div style={{marginBottom:16}}>
              <Toggle checked={eventForm.multi} onChange={v=>setEventForm(f=>({...f,multi:v,end_date:""}))} label="Multi-day event"/>
            </div>
            {!eventForm.multi?(
              <><label className="plannr-input-label">Date *</label>
              <input type="date" value={eventForm.date} onChange={e=>setEventForm(f=>({...f,date:e.target.value}))}/></>
            ):(
              <div style={{display:"flex",gap:12}}>
                <div style={{flex:1}}><label className="plannr-input-label">Start *</label><input type="date" value={eventForm.date} onChange={e=>setEventForm(f=>({...f,date:e.target.value}))}/></div>
                <div style={{flex:1}}><label className="plannr-input-label">End *</label><input type="date" value={eventForm.end_date} min={eventForm.date} onChange={e=>setEventForm(f=>({...f,end_date:e.target.value}))}/></div>
              </div>
            )}
            <label className="plannr-input-label">Time (optional)</label>
            <input type="time" value={eventForm.time} onChange={e=>setEventForm(f=>({...f,time:e.target.value}))}/>
            <label className="plannr-input-label">Notes (optional)</label>
            <textarea placeholder="Any extra details…" value={eventForm.notes} onChange={e=>setEventForm(f=>({...f,notes:e.target.value}))} style={{minHeight:70,resize:"vertical"}}/>
            <label className="plannr-input-label">Attendees</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
              {groupMembers.map(m=>{
                const sel=eventForm.attendees.includes(m.id),col=getMemberColor(groupMembers,m.id);
                return(
                  <button key={m.id} onClick={()=>toggleAttendee(m.id)} style={{
                    padding:"7px 15px",borderRadius:20,
                    border:`2px solid ${col}`,
                    background:sel?col:"transparent",
                    color:sel?"#fff":col,
                    fontWeight:600,cursor:"pointer",fontSize:13,
                    fontFamily:"'DM Sans',inherit",
                    transition:"all 0.15s",
                  }}>{m.name}</button>
                );
              })}
            </div>
            {formErr&&<p style={{color:"var(--danger)",fontSize:13,margin:"0 0 12px",padding:"8px 12px",background:"rgba(239,68,68,0.08)",borderRadius:8}}>{formErr}</p>}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowAddEvent(false)} style={{flex:1,padding:"12px 0",borderRadius:10,border:"1.5px solid var(--border)",background:"transparent",color:"var(--text)",cursor:"pointer",fontWeight:600,fontSize:14,fontFamily:"'DM Sans',inherit"}}>Cancel</button>
              <button onClick={saveEvent} disabled={loading} style={{flex:2,padding:"12px 0",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"'DM Sans',inherit",opacity:loading?0.7:1}}>
                {loading?"Saving…":editEvent?"Save Changes":"Add Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventCard({ev,members,onToggle,onDelete,onEdit}){
  const[confirmingDelete,setConfirmingDelete]=useState(false);
  const[confirmingFuture,setConfirmingFuture]=useState(false);
  const color=getMemberColor(members,ev.attendees[0]);
  const multi=isMultiDay(ev);

  const handleCheckbox=()=>{
    if(!ev.completed&&ev.date>todayStr()){
      setConfirmingFuture(true);
    } else {
      onToggle(ev.id);
    }
  };

  const[y,mo,d]=ev.date.split("-").map(Number);
  const dateObj=new Date(y,mo-1,d);
  const weekday=dateObj.toLocaleDateString("en-US",{weekday:"short"});
  const monthDay=dateObj.toLocaleDateString("en-US",{month:"short",day:"numeric"});

  const[y2,mo2,d2]=multi?ev.end_date.split("-").map(Number):[y,mo,d];
  const endDateObj=multi?new Date(y2,mo2-1,d2):null;
  const endMonthDay=endDateObj?endDateObj.toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";

  return(
    <>
    {confirmingFuture&&(
      <div className="plannr-confirm-overlay">
        <div className="plannr-confirm-box">
          <div style={{fontSize:32,marginBottom:12}}>📅</div>
          <h3 style={{margin:"0 0 8px",fontSize:17,color:"var(--text)",fontWeight:700}}>This event hasn't happened yet</h3>
          <p style={{margin:"0 0 22px",fontSize:13,color:"var(--text2)",lineHeight:1.6}}>
            <strong>{ev.title}</strong> is scheduled for {fmtDate(ev.date)}. Are you sure you want to mark it as complete?
          </p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmingFuture(false)} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid var(--border)",background:"transparent",color:"var(--text)",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Cancel</button>
            <button onClick={()=>{setConfirmingFuture(false);onToggle(ev.id);}} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Mark Complete</button>
          </div>
        </div>
      </div>
    )}
      <div className="plannr-confirm-overlay">
        <div className="plannr-confirm-box">
          <div style={{fontSize:28,marginBottom:12}}>🗑️</div>
          <h3 style={{margin:"0 0 8px",fontSize:17,color:"var(--text)",fontWeight:700}}>Delete this event?</h3>
          <p style={{margin:"0 0 22px",fontSize:13,color:"var(--text2)"}}>This can't be undone.</p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setConfirmingDelete(false)} style={{flex:1,padding:"11px 0",borderRadius:10,border:"1.5px solid var(--border)",background:"transparent",color:"var(--text)",fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Cancel</button>
            <button onClick={()=>{setConfirmingDelete(false);onDelete(ev.id);}} style={{flex:1,padding:"11px 0",borderRadius:10,border:"none",background:"var(--danger)",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"'DM Sans',inherit"}}>Delete</button>
          </div>
        </div>
      </div>
    )}

    <div style={{display:"flex",alignItems:"stretch",gap:10,marginBottom:8}}>

      {/* Date column — outside the card */}
      <div style={{width:52,flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",paddingTop:2}}>
        {multi?(
          <>
            <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.05em",lineHeight:1.2,textAlign:"center"}}>{monthDay}</span>
            <span style={{fontSize:10,fontWeight:500,color:"var(--text3)",lineHeight:1.4}}>—</span>
            <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.05em",lineHeight:1.2,textAlign:"center"}}>{endMonthDay}</span>
          </>
        ):(
          <>
            <span style={{fontSize:11,fontWeight:700,color:"var(--text2)",textTransform:"uppercase",letterSpacing:"0.06em",lineHeight:1.2}}>{weekday}</span>
            <span style={{fontSize:13,fontWeight:800,color:"var(--text)",lineHeight:1.3,textAlign:"center"}}>{monthDay}</span>
            {ev.time&&<span style={{fontSize:9,color:"var(--text3)",marginTop:1,lineHeight:1,textAlign:"center"}}>{fmtTime(ev.time)}</span>}
          </>
        )}
      </div>

      {/* Card */}
      <div className="plannr-event-card" style={{flex:1,opacity:ev.completed?0.55:1,borderLeft:`3px solid ${color}`,marginBottom:0}}>
        <div style={{display:"flex",alignItems:"stretch",gap:10}}>

          {/* Checkbox */}
          <div style={{display:"flex",alignItems:"flex-start",paddingTop:3,flexShrink:0}}>
            <Checkbox checked={ev.completed} onChange={handleCheckbox}/>
          </div>

          {/* Event details */}
          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:4,justifyContent:"center"}}>
            <div style={{fontWeight:700,fontSize:15,textDecoration:ev.completed?"line-through":"none",color:ev.completed?"var(--text3)":"var(--text)",lineHeight:1.3}}>
              {ev.title}
            </div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {ev.attendees.map(aid=>{const m=members.find(x=>x.id===aid);return m?<span key={aid} className="plannr-tag" style={{background:getMemberColor(members,aid)}}>{m.name}</span>:null;})}
            </div>
            {ev.notes&&(
              <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5,background:"var(--surface2)",borderRadius:6,padding:"5px 8px",border:"1px solid var(--border)"}}>
                {ev.notes}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0,justifyContent:"flex-start"}}>
            <button onClick={()=>onEdit(ev)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",padding:"5px 7px",borderRadius:7,transition:"background 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--surface2)"}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button onClick={()=>setConfirmingDelete(true)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--danger)",padding:"5px 7px",borderRadius:7,opacity:0.7,transition:"opacity 0.15s,background 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.background="rgba(239,68,68,0.08)";}}
              onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.background="none";}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>

        </div>
      </div>
    </div>
    </>
  );
}