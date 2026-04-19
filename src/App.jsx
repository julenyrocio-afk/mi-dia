import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "planner-data-v4";

// ── DATE HELPERS ──────────────────────────────────────────────────────────────
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateStrToDate = (s) => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };
const dateToStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const addDays = (s,n) => { const d=dateStrToDate(s); d.setDate(d.getDate()+n); return dateToStr(d); };
const formatDate = (s) => {
  const d=dateStrToDate(s);
  const days=["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const months=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return { day: days[d.getDay()], date: d.getDate(), month: months[d.getMonth()], year: d.getFullYear() };
};
const daysUntil = (s) => Math.round((dateStrToDate(s)-dateStrToDate(getTodayStr()))/(864e5));
const formatMoney = (n) => {
  const abs = Math.abs(n).toFixed(2);
  const [int,dec] = abs.split(".");
  return (n<0?"-":"")+int.replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+(dec||"00")+" €";
};
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

const formatNoteDate = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return `Hace ${diff} días`;
  return d.toLocaleDateString("es-ES", { day:"numeric", month:"short", year: d.getFullYear()!==today.getFullYear()?"numeric":undefined });
};

const CATEGORIES = {
  expense:["🛒 Compras","🍽️ Comida","🚗 Transporte","🏠 Hogar","🎮 Ocio","💊 Salud","📦 Otros"],
  income:["💼 Salario","🎁 Regalo","💰 Freelance","📈 Inversión","📦 Otros"],
};
const EVENT_ICONS = ["📅","🏥","💼","🎂","✈️","🎓","🦷","💇","🎭","🏋️","🍽️","⭐"];

const googleCalendarLink = (ev) => {
  const d=dateStrToDate(ev.date); let s,e;
  if(ev.time){
    const [h,m]=ev.time.split(":").map(Number);
    const st=new Date(d); st.setHours(h,m,0);
    const en=new Date(st); en.setHours(h+1,m,0);
    const f=(dt)=>dt.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
    s=f(st); e=f(en);
  } else {
    const f=(dt)=>dateToStr(dt).replace(/-/g,"");
    const en=new Date(d); en.setDate(en.getDate()+1);
    s=f(d); e=f(en);
  }
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({action:"TEMPLATE",text:ev.title,dates:`${s}/${e}`,details:ev.notes||""}).toString()}`;
};

// ── APP ROOT ──────────────────────────────────────────────────────────────────
export default function App() {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [activeTab,setActiveTab]=useState("tasks");
  const [selectedDate,setSelectedDate]=useState(getTodayStr());
  const [showTxForm,setShowTxForm]=useState(false);
  const [txType,setTxType]=useState("expense");
  const [newTask,setNewTask]=useState("");
  const [showEventForm,setShowEventForm]=useState(false);
  const [editingEvent,setEditingEvent]=useState(null);
  const [activeNote,setActiveNote]=useState(null); // null=list, id=editing
  const taskInputRef=useRef(null);

  useEffect(()=>{
    (async()=>{
      try{
        const r=await window.storage.get(STORAGE_KEY);
        if(r){
          const p=JSON.parse(r.value);
          if(!p.events) p.events=[];
          if(!p.notes) p.notes=[];
          setData(p);
        } else {
          setData({tasks:{},transactions:{},events:[],notes:[]});
        }
      }catch{ setData({tasks:{},transactions:{},events:[],notes:[]}); }
      setLoading(false);
    })();
  },[]);

  const save=useCallback(async(nd)=>{
    setData(nd);
    try{ await window.storage.set(STORAGE_KEY,JSON.stringify(nd)); }catch(e){ console.error(e); }
  },[]);

  // CARRY-OVER: every time data changes, collect all pending tasks from REAL past
  // days (strictly before today) and move them to today if not already there.
  // This intentionally runs on every data change so adding a task to a past day
  // while navigating gets picked up immediately when returning to today.
  useEffect(()=>{
    if(!data) return;
    const today = getTodayStr();

    // Only consider dates strictly before today (real date, not selected date)
    const pastDates = Object.keys(data.tasks).filter(d => d < today).sort();
    let carried = [];
    for(const d of pastDates){
      const pending = (data.tasks[d]||[]).filter(t=>!t.done);
      carried = [...carried, ...pending.map(t=>({...t, carriedFrom: t.carriedFrom||d}))];
    }
    if(!carried.length) return;

    const existing = data.tasks[today]||[];
    const existingIds = new Set(existing.map(t=>t.id));
    const toAdd = carried.filter(t=>!existingIds.has(t.id));
    if(!toAdd.length) return;

    const newTasks = {...data.tasks};
    for(const d of pastDates) newTasks[d] = (newTasks[d]||[]).filter(t=>t.done);
    newTasks[today] = [...toAdd, ...existing];

    // Use functional update to avoid stale closure loop
    save({...data, tasks: newTasks});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[JSON.stringify(data?.tasks)]);

  if(loading) return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100svh",background:"#09080a"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
        <div style={{width:28,height:28,borderRadius:"50%",border:"2px solid rgba(240,168,50,0.2)",borderTopColor:"#f0a832",animation:"spin 1s linear infinite"}}/>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:"0.2em",color:"#3a3630"}}>CARGANDO</span>
      </div>
    </div>
  );

  const todayTasks=(data.tasks[selectedDate]||[]);
  const todayTx=(data.transactions[selectedDate]||[]);

  const addTask=()=>{
    if(!newTask.trim()) return;
    const task={id:uid(),text:newTask.trim(),done:false,createdAt:selectedDate};
    const nt={...data.tasks};
    nt[selectedDate]=[...(nt[selectedDate]||[]),task];
    save({...data,tasks:nt});
    setNewTask(""); taskInputRef.current?.focus();
  };
  const toggleTask=(id)=>{
    const nt={...data.tasks};
    nt[selectedDate]=(nt[selectedDate]||[]).map(t=>t.id===id?{...t,done:!t.done}:t);
    save({...data,tasks:nt});
  };
  const deleteTask=(id)=>{
    const nt={...data.tasks};
    nt[selectedDate]=(nt[selectedDate]||[]).filter(t=>t.id!==id);
    save({...data,tasks:nt});
  };
  const addTransaction=(tx)=>{
    const ntx={...data.transactions};
    ntx[selectedDate]=[...(ntx[selectedDate]||[]),{...tx,id:uid()}];
    save({...data,transactions:ntx}); setShowTxForm(false);
  };
  const deleteTransaction=(id)=>{
    const ntx={...data.transactions};
    ntx[selectedDate]=(ntx[selectedDate]||[]).filter(t=>t.id!==id);
    save({...data,transactions:ntx});
  };
  const saveEvent=(event)=>{
    const ne=editingEvent
      ?data.events.map(e=>e.id===editingEvent.id?{...event,id:editingEvent.id}:e)
      :[...data.events,{...event,id:uid()}];
    save({...data,events:ne}); setShowEventForm(false); setEditingEvent(null);
  };
  const deleteEvent=(id)=>save({...data,events:data.events.filter(e=>e.id!==id)});

  // Notes CRUD
  const createNote=()=>{
    const note={id:uid(),title:"",body:"",updatedAt:Date.now()};
    const newNotes=[note,...(data.notes||[])];
    save({...data,notes:newNotes});
    setActiveNote(note.id);
  };
  const updateNote=(id,fields)=>{
    const newNotes=(data.notes||[]).map(n=>n.id===id?{...n,...fields,updatedAt:Date.now()}:n);
    save({...data,notes:newNotes});
  };
  const deleteNote=(id)=>{
    save({...data,notes:(data.notes||[]).filter(n=>n.id!==id)});
    setActiveNote(null);
  };

  const navigateDate=(dir)=>setSelectedDate(addDays(selectedDate,dir));
  const isToday=selectedDate===getTodayStr();

  const totalIncome=todayTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const totalExpense=todayTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const balance=totalIncome-totalExpense;
  const monthKey=selectedDate.slice(0,7);
  const monthTx=Object.entries(data.transactions).filter(([d])=>d.startsWith(monthKey)).flatMap(([,txs])=>txs);
  const monthIncome=monthTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
  const monthExpense=monthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
  const completedCount=todayTasks.filter(t=>t.done).length;
  const upcomingEvents=data.events.filter(e=>e.date>=getTodayStr()).length;
  const fmt=formatDate(selectedDate);
  const showDateHeader = activeTab!=="agenda" && activeTab!=="notes";

  return (
    <div className="app-root">
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="app-header">
        <div className="header-row1">
          <div className="logo">
            <span className="logo-dot"/>
            <span className="logo-text">mi día</span>
          </div>
          <span className="header-meta">{fmt.year}</span>
        </div>

        {showDateHeader && (
          <div className="date-hero">
            <button className="date-nav-btn" onClick={()=>navigateDate(-1)}>‹</button>
            <div className="date-center">
              <div className="date-big">{fmt.day}, {fmt.date} {fmt.month.slice(0,3)}</div>
              <div className="date-sub">
                {isToday
                  ? <span className="today-pip">Hoy</span>
                  : <span>{fmt.month} {fmt.year}</span>
                }
                {!isToday && (
                  <button className="today-chip" onClick={()=>setSelectedDate(getTodayStr())}>↩ hoy</button>
                )}
              </div>
            </div>
            <button className="date-nav-btn" onClick={()=>navigateDate(1)}>›</button>
          </div>
        )}
        {activeTab==="agenda" && (
          <div style={{paddingBottom:4}}>
            <div className="date-big" style={{fontSize:22}}>Agenda</div>
            <div className="date-sub">{upcomingEvents>0?`${upcomingEvents} próximos`:"Sin eventos próximos"}</div>
          </div>
        )}
        {activeTab==="notes" && (
          <div style={{paddingBottom:4}}>
            <div className="date-big" style={{fontSize:22}}>
              {activeNote ? (data.notes||[]).find(n=>n.id===activeNote)?.title||"Nueva nota" : "Notas"}
            </div>
            <div className="date-sub">
              {activeNote
                ? <button className="today-chip" onClick={()=>setActiveNote(null)}>← Volver</button>
                : `${(data.notes||[]).length} nota${(data.notes||[]).length!==1?"s":""}`
              }
            </div>
          </div>
        )}
        <div className="header-divider"/>
      </header>

      {/* CONTENT */}
      <main className="app-scroll" key={activeTab+(activeNote||"")}>
        {activeTab==="tasks" && (
          <TasksView tasks={todayTasks} newTask={newTask} setNewTask={setNewTask}
            addTask={addTask} toggleTask={toggleTask} deleteTask={deleteTask} taskInputRef={taskInputRef}/>
        )}
        {activeTab==="agenda" && (
          <AgendaView events={data.events}
            onAdd={()=>{setEditingEvent(null);setShowEventForm(true);}}
            onEdit={(ev)=>{setEditingEvent(ev);setShowEventForm(true);}}
            onDelete={deleteEvent}
            showForm={showEventForm} editingEvent={editingEvent}
            onSave={saveEvent} onCancel={()=>{setShowEventForm(false);setEditingEvent(null);}}/>
        )}
        {activeTab==="finance" && (
          <FinanceView transactions={todayTx} totalIncome={totalIncome} totalExpense={totalExpense}
            balance={balance} monthIncome={monthIncome} monthExpense={monthExpense} monthKey={monthKey}
            showTxForm={showTxForm} setShowTxForm={setShowTxForm} txType={txType} setTxType={setTxType}
            addTransaction={addTransaction} deleteTransaction={deleteTransaction}/>
        )}
        {activeTab==="notes" && (
          activeNote
            ? <NoteEditor
                note={(data.notes||[]).find(n=>n.id===activeNote)}
                onUpdate={updateNote}
                onDelete={deleteNote}
                onBack={()=>setActiveNote(null)}/>
            : <NotesListView
                notes={data.notes||[]}
                onCreate={createNote}
                onOpen={setActiveNote}
                onDelete={deleteNote}/>
        )}
      </main>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        <NavBtn id="tasks" label="Tareas" icon="✦" active={activeTab==="tasks"} onClick={(id)=>{setActiveTab(id);}}
          badge={todayTasks.length>0?`${completedCount}/${todayTasks.length}`:null}/>
        <NavBtn id="agenda" label="Agenda" icon="◈" active={activeTab==="agenda"} onClick={(id)=>{setActiveTab(id);}}
          badge={upcomingEvents>0?upcomingEvents:null}/>
        <NavBtn id="notes" label="Notas" icon="✎" active={activeTab==="notes"} onClick={(id)=>{setActiveTab(id);setActiveNote(null);}}
          badge={(data.notes||[]).length>0?(data.notes||[]).length:null}/>
        <NavBtn id="finance" label="Finanzas" icon="◎" active={activeTab==="finance"} onClick={(id)=>{setActiveTab(id);}}/>
      </nav>
    </div>
  );
}

function NavBtn({id,label,icon,active,onClick,badge}){
  return(
    <button className={`nav-btn${active?" active":""}`} onClick={()=>onClick(id)}>
      {badge && <span className="nav-badge">{badge}</span>}
      <div className="nav-icon-wrap">{icon}</div>
      <span className="nav-label">{label}</span>
    </button>
  );
}

// ── TASKS VIEW ────────────────────────────────────────────────────────────────
function TasksView({tasks,newTask,setNewTask,addTask,toggleTask,deleteTask,taskInputRef}){
  const pending=tasks.filter(t=>!t.done);
  const done=tasks.filter(t=>t.done);
  const pct=tasks.length?(done.length/tasks.length)*100:0;
  const allDone=tasks.length>0&&done.length===tasks.length;
  return(
    <div style={{width:"100%"}}>
      <div className="task-input-wrap">
        <input ref={taskInputRef} className="task-input" type="text"
          placeholder="Nueva tarea…" value={newTask}
          onChange={e=>setNewTask(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&addTask()}/>
        <button className={`task-add-btn${newTask.trim()?" active":""}`} onClick={addTask}>+</button>
      </div>
      {tasks.length>0&&(
        <div className="progress-row">
          <div className="prog-track">
            <div className="prog-fill" style={{width:`${pct}%`}}/>
          </div>
          <span className="prog-label">
            {allDone?"✦ completado":`${done.length}/${tasks.length}`}
          </span>
        </div>
      )}
      {pending.length>0&&(
        <section className="task-section">
          <h3 className="sec-label">Pendientes</h3>
          {pending.map(t=><TaskCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask}/>)}
        </section>
      )}
      {done.length>0&&(
        <section className="task-section" style={{opacity:0.55}}>
          <h3 className="sec-label">Completadas</h3>
          {done.map(t=><TaskCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask}/>)}
        </section>
      )}
      {tasks.length===0&&<Empty glyph="—" txt="Sin tareas para hoy" sub="Escribe arriba y pulsa Enter"/>}
    </div>
  );
}

function TaskCard({task,onToggle,onDelete}){
  return(
    <div className="task-card">
      <button className="check-btn" onClick={()=>onToggle(task.id)}>
        <div className={`check-ring${task.done?" done":""}`}/>
      </button>
      <div className="task-body">
        <span className={`task-txt${task.done?" done":""}`}>{task.text}</span>
        {task.carriedFrom&&<span className="carry-tag">⟲ {task.carriedFrom.slice(5)}</span>}
      </div>
      <button className="task-del" onClick={()=>onDelete(task.id)}>×</button>
    </div>
  );
}

// ── NOTES VIEW ────────────────────────────────────────────────────────────────
function NotesListView({notes,onCreate,onOpen,onDelete}){
  const sorted=[...notes].sort((a,b)=>b.updatedAt-a.updatedAt);
  return(
    <div style={{width:"100%"}}>
      <button className="add-event-btn" style={{borderColor:"rgba(240,168,50,0.2)",color:"#f0a832",background:"rgba(240,168,50,0.08)"}} onClick={onCreate}>
        + Nueva nota
      </button>
      {sorted.length>0 ? (
        <div className="notes-list">
          {sorted.map(note=>(
            <div key={note.id} className="note-card" onClick={()=>onOpen(note.id)}>
              <div className="note-card-inner">
                <div className="note-card-title">{note.title||"Sin título"}</div>
                <div className="note-card-preview">{note.body ? note.body.split("\n")[0].slice(0,80) : "Toca para editar…"}</div>
                <div className="note-card-date">{formatNoteDate(note.updatedAt)}</div>
              </div>
              <button className="note-del-btn" onClick={e=>{e.stopPropagation();onDelete(note.id);}}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <Empty glyph="✎" txt="Sin notas" sub="Crea tu primera nota arriba"/>
      )}
    </div>
  );
}

function NoteEditor({note,onUpdate,onDelete,onBack}){
  const [title,setTitle]=useState(note?.title||"");
  const [body,setBody]=useState(note?.body||"");
  const saveTimeout=useRef(null);

  const handleTitle=(v)=>{
    setTitle(v);
    clearTimeout(saveTimeout.current);
    saveTimeout.current=setTimeout(()=>onUpdate(note.id,{title:v,body}),600);
  };
  const handleBody=(v)=>{
    setBody(v);
    clearTimeout(saveTimeout.current);
    saveTimeout.current=setTimeout(()=>onUpdate(note.id,{title,body:v}),600);
  };

  const handleSave=()=>{
    clearTimeout(saveTimeout.current);
    onUpdate(note.id,{title,body});
    onBack();
  };

  if(!note) return null;
  return(
    <div style={{width:"100%",display:"flex",flexDirection:"column",gap:12}}>
      <input
        className="note-title-input"
        type="text"
        placeholder="Título…"
        value={title}
        onChange={e=>handleTitle(e.target.value)}
        autoFocus
      />
      <textarea
        className="note-body-input"
        placeholder="Escribe aquí tu nota…"
        value={body}
        onChange={e=>handleBody(e.target.value)}
      />
      <div style={{display:"flex",gap:8}}>
        <button
          onClick={handleSave}
          style={{flex:1,padding:"11px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#f0a832,#e08820)",color:"#09080a",fontSize:14,fontWeight:600,fontFamily:"'Outfit',sans-serif",cursor:"pointer"}}
        >
          Guardar nota
        </button>
        <button
          onClick={()=>{ if(window.confirm("¿Eliminar esta nota?")) onDelete(note.id); }}
          style={{padding:"11px 14px",borderRadius:8,border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.06)",color:"#f87171",fontSize:18,fontFamily:"'Outfit',sans-serif",cursor:"pointer"}}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

// ── AGENDA VIEW ───────────────────────────────────────────────────────────────
function AgendaView({events,onAdd,onEdit,onDelete,showForm,editingEvent,onSave,onCancel}){
  const today=getTodayStr();
  const upcoming=events.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||(a.time||"").localeCompare(b.time||""));
  const past=events.filter(e=>e.date<today).sort((a,b)=>b.date.localeCompare(a.date));
  const grouped={};
  for(const ev of upcoming){if(!grouped[ev.date])grouped[ev.date]=[];grouped[ev.date].push(ev);}
  return(
    <div style={{width:"100%"}}>
      {showForm
        ?<EventForm event={editingEvent} onSave={onSave} onCancel={onCancel}/>
        :<button className="add-event-btn" onClick={onAdd}>Nuevo evento</button>
      }
      {upcoming.length>0&&(
        <section className="task-section">
          <h3 className="sec-label">Próximos</h3>
          {Object.keys(grouped).map(date=>(
            <div key={date} className="agenda-group">
              <div className="agenda-date-row">
                <span className="agenda-date-txt">{formatDate(date).day}, {formatDate(date).date} {formatDate(date).month.slice(0,3)}</span>
                <span className="agenda-days-tag">
                  {daysUntil(date)===0?"hoy":daysUntil(date)===1?"mañana":`${daysUntil(date)}d`}
                </span>
              </div>
              {grouped[date].map(ev=><EventCard key={ev.id} event={ev} onEdit={onEdit} onDelete={onDelete}/>)}
            </div>
          ))}
        </section>
      )}
      {past.length>0&&(
        <section className="task-section" style={{opacity:0.5}}>
          <h3 className="sec-label">Pasados</h3>
          {past.slice(0,8).map(ev=><EventCard key={ev.id} event={ev} onEdit={onEdit} onDelete={onDelete}/>)}
        </section>
      )}
      {events.length===0&&<Empty glyph="◈" txt="Sin eventos" sub="Añade tu primer evento"/>}
    </div>
  );
}

function EventCard({event,onEdit,onDelete}){
  return(
    <div className="event-card">
      <span className="ev-icon">{event.icon||"📅"}</span>
      <div className="ev-body">
        <span className="ev-title">{event.title}</span>
        <div className="ev-meta">
          {event.time&&<span className="ev-chip">🕐 {event.time}</span>}
          {event.notes&&<span className="ev-chip">{event.notes}</span>}
        </div>
      </div>
      <div className="ev-actions">
        <a href={googleCalendarLink(event)} target="_blank" rel="noreferrer" className="ev-act" title="Google Cal">📆</a>
        <button className="ev-act" onClick={()=>onEdit(event)}>✎</button>
        <button className="ev-act del" onClick={()=>onDelete(event.id)}>×</button>
      </div>
    </div>
  );
}

function EventForm({event,onSave,onCancel}){
  const [title,setTitle]=useState(event?.title||"");
  const [date,setDate]=useState(event?.date||getTodayStr());
  const [time,setTime]=useState(event?.time||"");
  const [icon,setIcon]=useState(event?.icon||"📅");
  const [notes,setNotes]=useState(event?.notes||"");
  const submit=()=>{if(!title.trim()||!date)return;onSave({title:title.trim(),date,time,icon,notes:notes.trim()});};
  return(
    <div className="form-card" style={{borderColor:"rgba(240,168,50,0.18)"}}>
      <div className="form-hdr">
        <span className="form-title" style={{color:"#f0a832"}}>{event?"Editar evento":"Nuevo evento"}</span>
        <button className="form-close" onClick={onCancel}>×</button>
      </div>
      <input className="g-input" type="text" placeholder="Título del evento…" value={title} onChange={e=>setTitle(e.target.value)} autoFocus/>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}><label className="field-lbl">Fecha</label><input className="g-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div style={{flex:1}}><label className="field-lbl">Hora</label><input className="g-input" type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>
      </div>
      <div><label className="field-lbl">Icono</label>
        <div className="icon-grid">
          {EVENT_ICONS.map(i=>(
            <button key={i} className={`icon-btn${icon===i?" sel":""}`} onClick={()=>setIcon(i)}>{i}</button>
          ))}
        </div>
      </div>
      <textarea className="g-input" placeholder="Notas (opcional)" value={notes} onChange={e=>setNotes(e.target.value)}/>
      <button className="submit-btn" style={{background:"linear-gradient(135deg,#f0a832,#e08820)",color:"#09080a"}} onClick={submit}>Guardar evento</button>
    </div>
  );
}

// ── FINANCE VIEW ──────────────────────────────────────────────────────────────
function FinanceView({transactions,totalIncome,totalExpense,balance,monthIncome,monthExpense,monthKey,showTxForm,setShowTxForm,txType,setTxType,addTransaction,deleteTransaction}){
  const monthNet=monthIncome-monthExpense;
  const mx=Math.max(monthIncome,monthExpense)||1;
  const balColor=balance>=0?"#60b8f0":"#fbbf24";
  return(
    <div style={{width:"100%"}}>
      <div className="kpi-row">
        <div className="kpi-card" style={{"--c":"#2dd4a0"}}>
          <div className="kpi-arrow" style={{color:"#2dd4a0"}}>▲</div>
          <div className="kpi-label">Ingresos</div>
          <div className="kpi-val" style={{color:"#2dd4a0"}}>{formatMoney(totalIncome)}</div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"#2dd4a0",opacity:0.5,borderRadius:"0 0 10px 10px"}}/>
        </div>
        <div className="kpi-card">
          <div className="kpi-arrow" style={{color:"#f87171"}}>▼</div>
          <div className="kpi-label">Gastos</div>
          <div className="kpi-val" style={{color:"#f87171"}}>{formatMoney(totalExpense)}</div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:"#f87171",opacity:0.5,borderRadius:"0 0 10px 10px"}}/>
        </div>
        <div className="kpi-card">
          <div className="kpi-arrow" style={{color:balColor}}>=</div>
          <div className="kpi-label">Balance</div>
          <div className="kpi-val" style={{color:balColor}}>{formatMoney(balance)}</div>
          <div style={{position:"absolute",bottom:0,left:0,right:0,height:2,background:balColor,opacity:0.5,borderRadius:"0 0 10px 10px"}}/>
        </div>
      </div>
      <div className="month-card">
        <div className="month-top">
          <span className="month-title">Resumen {monthKey}</span>
          <span className="month-net" style={{color:monthNet>=0?"#60b8f0":"#fbbf24"}}>{formatMoney(monthNet)}</span>
        </div>
        <div className="bar-row">
          <span className="bar-label" style={{color:"#2dd4a0"}}>▲ {formatMoney(monthIncome)}</span>
          <div className="bar-track"><div className="bar-fill" style={{width:`${(monthIncome/mx)*100}%`,background:"#2dd4a0",opacity:0.7}}/></div>
        </div>
        <div className="bar-row" style={{marginBottom:0}}>
          <span className="bar-label" style={{color:"#f87171"}}>▼ {formatMoney(monthExpense)}</span>
          <div className="bar-track"><div className="bar-fill" style={{width:`${(monthExpense/mx)*100}%`,background:"#f87171",opacity:0.7}}/></div>
        </div>
      </div>
      {!showTxForm&&(
        <div className="tx-btns">
          <button className="tx-btn tx-exp" onClick={()=>{setTxType("expense");setShowTxForm(true);}}>− Gasto</button>
          <button className="tx-btn tx-inc" onClick={()=>{setTxType("income");setShowTxForm(true);}}>+ Ingreso</button>
        </div>
      )}
      {showTxForm&&<TransactionForm type={txType} onAdd={addTransaction} onCancel={()=>setShowTxForm(false)}/>}
      {transactions.length>0?(
        <div className="tx-list">
          {transactions.map(tx=>(
            <div key={tx.id} className="tx-row">
              <div className="tx-l">
                <span className="tx-cat">{tx.category}</span>
                {tx.description&&<span className="tx-desc">{tx.description}</span>}
              </div>
              <div className="tx-r">
                <span className="tx-amt" style={{color:tx.type==="income"?"#2dd4a0":"#f87171"}}>
                  {tx.type==="income"?"+":"−"}{formatMoney(tx.amount)}
                </span>
                <button className="tx-del" onClick={()=>deleteTransaction(tx.id)}>×</button>
              </div>
            </div>
          ))}
        </div>
      ):<Empty glyph="—" txt="Sin movimientos" sub="Registra tu primer gasto o ingreso"/>}
    </div>
  );
}

function TransactionForm({type,onAdd,onCancel}){
  const [amount,setAmount]=useState("");
  const [category,setCategory]=useState(CATEGORIES[type][0]);
  const [description,setDescription]=useState("");
  const isExp=type==="expense";
  const ac=isExp?"#f87171":"#2dd4a0";
  const submit=()=>{
    const val=parseFloat(amount.replace(",","."));
    if(!val||val<=0)return;
    onAdd({type,amount:val,category,description:description.trim()});
  };
  return(
    <div className="form-card" style={{borderColor:isExp?"rgba(248,113,113,0.2)":"rgba(45,212,160,0.2)"}}>
      <div className="form-hdr">
        <span className="form-title" style={{color:ac}}>{isExp?"Nuevo gasto":"Nuevo ingreso"}</span>
        <button className="form-close" onClick={onCancel}>×</button>
      </div>
      <input className="g-input" type="text" inputMode="decimal" placeholder="Cantidad en €"
        value={amount} onChange={e=>setAmount(e.target.value)} autoFocus/>
      <div className="cat-grid">
        {CATEGORIES[type].map(c=>(
          <button key={c} className="cat-btn"
            style={category===c?{borderColor:ac,color:ac,background:`${ac}18`}:{}}
            onClick={()=>setCategory(c)}>{c}</button>
        ))}
      </div>
      <input className="g-input" type="text" placeholder="Descripción (opcional)"
        value={description} onChange={e=>setDescription(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}/>
      <button className="submit-btn" onClick={submit}
        style={isExp
          ?{background:"linear-gradient(135deg,#f87171,#ef4444)",color:"#fff"}
          :{background:"linear-gradient(135deg,#2dd4a0,#10b981)",color:"#022c22"}}>
        Guardar
      </button>
    </div>
  );
}

function Empty({glyph,txt,sub}){
  return(
    <div className="empty">
      <span className="empty-glyph">{glyph}</span>
      <p className="empty-txt">{txt}</p>
      <p className="empty-sub">{sub}</p>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Outfit:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #09080a;
    color: #c8c0b0;
    font-family: 'Outfit', sans-serif;
    -webkit-font-smoothing: antialiased;
    width: 100%;
  }

  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

  .app-root {
    width: 100%;
    max-width: 480px;
    margin: 0 auto;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background: #09080a;
  }

  /* HEADER */
  .app-header {
    width: 100%;
    padding: 20px 20px 0;
    background: #09080a;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .header-row1 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #f0a832;
    box-shadow: 0 0 8px #f0a83288;
  }
  .logo-text {
    font-family: 'DM Mono', monospace;
    font-size: 16px; font-weight: 500;
    letter-spacing: 0.06em; color: #e8dcc8;
  }
  .header-meta {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #3a3630;
    letter-spacing: 0.1em;
  }
  .date-hero {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 16px; width: 100%;
  }
  .date-nav-btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    color: #c8c0b0; border-radius: 8px;
    width: 36px; height: 36px;
    font-size: 20px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .date-center { flex: 1; text-align: center; }
  .date-big {
    font-size: 20px; font-weight: 600;
    color: #e8dcc8; letter-spacing: -0.01em;
  }
  .date-sub {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin-top: 2px;
    font-size: 12px; color: #5a5248;
  }
  .today-pip {
    background: rgba(240,168,50,0.15);
    color: #f0a832;
    padding: 1px 8px; border-radius: 20px;
    font-size: 11px; font-weight: 500;
  }
  .today-chip {
    background: transparent; border: 1px solid rgba(255,255,255,0.08);
    color: #7a7068; font-size: 11px;
    padding: 2px 8px; border-radius: 6px; cursor: pointer;
    font-family: 'Outfit', sans-serif;
  }
  .header-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 30%, rgba(255,255,255,0.06) 70%, transparent);
  }

  /* SCROLL AREA */
  .app-scroll {
    flex: 1;
    width: 100%;
    padding: 20px 20px 100px;
    overflow-y: auto;
    animation: fadein 0.2s ease;
  }

  /* BOTTOM NAV */
  .bottom-nav {
    position: fixed; bottom: 0; left: 50%;
    transform: translateX(-50%);
    width: 100%; max-width: 480px;
    display: flex;
    background: rgba(9,8,10,0.92);
    backdrop-filter: blur(20px);
    border-top: 1px solid rgba(255,255,255,0.06);
    padding: 8px 0 max(8px, env(safe-area-inset-bottom));
    z-index: 30;
  }
  .nav-btn {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; gap: 3px;
    background: none; border: none;
    color: #3a3630; cursor: pointer;
    position: relative; padding: 4px 0;
    transition: color 0.2s;
  }
  .nav-btn.active { color: #f0a832; }
  .nav-icon-wrap { font-size: 18px; line-height: 1; }
  .nav-label { font-size: 10px; letter-spacing: 0.05em; font-weight: 500; }
  .nav-badge {
    position: absolute; top: 0; right: 18%;
    background: #f0a832; color: #09080a;
    font-size: 9px; font-weight: 700;
    padding: 1px 5px; border-radius: 10px;
    font-family: 'DM Mono', monospace;
  }

  /* TASKS */
  .task-input-wrap {
    display: flex; gap: 8px; margin-bottom: 16px; width: 100%;
  }
  .task-input {
    flex: 1; padding: 12px 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px; color: #e8dcc8;
    font-size: 14px; font-family: 'Outfit', sans-serif;
    outline: none; min-width: 0;
  }
  .task-input::placeholder { color: #3a3630; }
  .task-add-btn {
    width: 44px; height: 44px; border-radius: 10px;
    background: rgba(240,168,50,0.12);
    border: 1px solid rgba(240,168,50,0.2);
    color: #f0a832; font-size: 22px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; flex-shrink: 0;
  }
  .task-add-btn.active {
    background: #f0a832; color: #09080a;
    border-color: #f0a832;
  }
  .progress-row {
    display: flex; align-items: center; gap: 10px;
    margin-bottom: 20px; width: 100%;
  }
  .prog-track {
    flex: 1; height: 3px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px; overflow: hidden;
  }
  .prog-fill {
    height: 100%;
    background: linear-gradient(90deg, #f0a832, #fbbf24);
    border-radius: 2px;
    transition: width 0.4s ease;
  }
  .prog-label {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #5a5248;
    white-space: nowrap;
  }
  .task-section { margin-bottom: 24px; width: 100%; }
  .sec-label {
    font-family: 'DM Mono', monospace;
    font-size: 10px; font-weight: 400;
    letter-spacing: 0.15em; text-transform: uppercase;
    color: #3a3630; margin-bottom: 10px; padding-left: 2px;
  }
  .task-card {
    display: flex; align-items: center; gap: 12px;
    padding: 11px 12px; border-radius: 10px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
    margin-bottom: 6px; width: 100%;
  }
  .check-btn {
    background: none; border: none; cursor: pointer;
    padding: 2px; flex-shrink: 0;
  }
  .check-ring {
    width: 20px; height: 20px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.15);
    transition: all 0.2s;
  }
  .check-ring.done {
    background: #f0a832;
    border-color: #f0a832;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 12 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 5l3 3 7-7' stroke='%2309080a' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 10px;
  }
  .task-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .task-txt { font-size: 14px; color: #c8c0b0; line-height: 1.4; }
  .task-txt.done { text-decoration: line-through; color: #3a3630; }
  .carry-tag {
    font-family: 'DM Mono', monospace;
    font-size: 10px; color: #f0a83255;
  }
  .task-del {
    background: none; border: none; color: #2a2620;
    font-size: 18px; cursor: pointer; padding: 0 4px;
    transition: color 0.15s; flex-shrink: 0;
  }
  .task-del:hover { color: #f87171; }

  /* NOTES */
  .notes-list { display: flex; flex-direction: column; gap: 8px; width: 100%; }
  .note-card {
    display: flex; align-items: stretch;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
    border-radius: 10px; overflow: hidden;
    cursor: pointer; transition: background 0.15s; width: 100%;
  }
  .note-card:hover { background: rgba(255,255,255,0.04); }
  .note-card-inner {
    flex: 1; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 3px; min-width: 0;
  }
  .note-card-title {
    font-size: 14px; font-weight: 600; color: #e8dcc8;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .note-card-preview {
    font-size: 12px; color: #5a5248;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .note-card-date {
    font-family: 'DM Mono', monospace;
    font-size: 10px; color: #3a3630; margin-top: 2px;
  }
  .note-del-btn {
    background: none; border: none; border-left: 1px solid rgba(255,255,255,0.04);
    color: #2a2620; font-size: 18px; cursor: pointer;
    padding: 0 14px; transition: color 0.15s; flex-shrink: 0;
  }
  .note-del-btn:hover { color: #f87171; background: rgba(248,113,113,0.06); }
  .note-title-input {
    width: 100%; padding: 10px 0;
    background: transparent;
    border: none; border-bottom: 1px solid rgba(255,255,255,0.08);
    color: #e8dcc8; font-size: 20px; font-weight: 600;
    font-family: 'Outfit', sans-serif; outline: none;
  }
  .note-title-input::placeholder { color: #3a3630; }
  .note-body-input {
    width: 100%; min-height: 55vh;
    padding: 14px 0;
    background: transparent; border: none;
    color: #c8c0b0; font-size: 15px; line-height: 1.7;
    font-family: 'Outfit', sans-serif; outline: none;
    resize: none;
  }
  .note-body-input::placeholder { color: #3a3630; }

  /* AGENDA */
  .add-event-btn {
    width: 100%; padding: 12px;
    background: rgba(240,168,50,0.08);
    border: 1px solid rgba(240,168,50,0.2);
    border-radius: 10px; color: #f0a832;
    font-size: 14px; font-weight: 600;
    font-family: 'Outfit', sans-serif;
    cursor: pointer; margin-bottom: 20px;
    letter-spacing: 0.02em;
  }
  .agenda-group { margin-bottom: 16px; width: 100%; }
  .agenda-date-row {
    display: flex; justify-content: space-between;
    align-items: center; padding: 4px 2px 6px;
  }
  .agenda-date-txt { font-size: 13px; font-weight: 600; color: #f0a832; }
  .agenda-days-tag {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #5a5248;
    background: rgba(240,168,50,0.08);
    padding: 2px 8px; border-radius: 10px;
  }
  .event-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px; border-radius: 10px;
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.04);
    margin-bottom: 6px; width: 100%;
  }
  .ev-icon { font-size: 22px; flex-shrink: 0; }
  .ev-body { flex: 1; min-width: 0; }
  .ev-title { font-size: 14px; font-weight: 500; color: #e8dcc8; display: block; }
  .ev-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 3px; }
  .ev-chip {
    font-size: 11px; color: #7a7068;
    background: rgba(255,255,255,0.04);
    padding: 1px 7px; border-radius: 6px;
  }
  .ev-actions { display: flex; gap: 2px; align-items: center; flex-shrink: 0; }
  .ev-act {
    background: none; border: none;
    font-size: 15px; cursor: pointer;
    color: #5a5248; padding: 4px 5px;
    border-radius: 6px; text-decoration: none;
    transition: color 0.15s;
  }
  .ev-act:hover { color: #c8c0b0; }
  .ev-act.del:hover { color: #f87171; }

  /* FORMS */
  .form-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid;
    border-radius: 12px; padding: 16px;
    margin-bottom: 20px; width: 100%;
    display: flex; flex-direction: column; gap: 12px;
  }
  .form-hdr {
    display: flex; justify-content: space-between; align-items: center;
  }
  .form-title { font-size: 14px; font-weight: 600; }
  .form-close {
    background: none; border: none;
    color: #5a5248; font-size: 20px; cursor: pointer;
  }
  .field-lbl {
    font-family: 'DM Mono', monospace;
    font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: #5a5248;
    display: block; margin-bottom: 4px;
  }
  .g-input {
    width: 100%; padding: 10px 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 8px; color: #e8dcc8;
    font-size: 14px; font-family: 'Outfit', sans-serif;
    outline: none; resize: vertical;
  }
  .g-input::placeholder { color: #3a3630; }
  .icon-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .icon-btn {
    width: 38px; height: 38px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.07);
    background: rgba(255,255,255,0.03);
    font-size: 17px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s;
  }
  .icon-btn.sel {
    border-color: rgba(240,168,50,0.5);
    background: rgba(240,168,50,0.12);
  }
  .submit-btn {
    padding: 12px; border-radius: 10px; border: none;
    font-size: 14px; font-weight: 600;
    font-family: 'Outfit', sans-serif; cursor: pointer;
    letter-spacing: 0.02em; width: 100%;
  }

  /* FINANCE */
  .kpi-row { display: flex; gap: 8px; margin-bottom: 14px; width: 100%; }
  .kpi-card {
    flex: 1; padding: 12px 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 10px;
    position: relative; overflow: hidden;
  }
  .kpi-arrow { font-size: 12px; margin-bottom: 4px; }
  .kpi-label { font-size: 11px; color: #5a5248; margin-bottom: 4px; }
  .kpi-val { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; }
  .month-card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 10px; padding: 14px;
    margin-bottom: 18px; width: 100%;
  }
  .month-top {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 12px;
  }
  .month-title {
    font-family: 'DM Mono', monospace;
    font-size: 11px; color: #5a5248;
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .month-net { font-family: 'DM Mono', monospace; font-size: 14px; font-weight: 500; }
  .bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; width: 100%; }
  .bar-label { font-family: 'DM Mono', monospace; font-size: 11px; width: 90px; flex-shrink: 0; }
  .bar-track {
    flex: 1; height: 4px;
    background: rgba(255,255,255,0.06);
    border-radius: 2px; overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 2px; transition: width 0.4s ease; }
  .tx-btns { display: flex; gap: 8px; margin-bottom: 18px; width: 100%; }
  .tx-btn {
    flex: 1; padding: 12px; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    font-family: 'Outfit', sans-serif; cursor: pointer; border: 1px solid;
  }
  .tx-exp { background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); color: #f87171; }
  .tx-inc { background: rgba(45,212,160,0.08); border-color: rgba(45,212,160,0.2); color: #2dd4a0; }
  .cat-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .cat-btn {
    padding: 5px 11px; border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: #7a7068; font-size: 12px;
    font-family: 'Outfit', sans-serif; cursor: pointer;
    transition: all 0.15s;
  }
  .tx-list { display: flex; flex-direction: column; gap: 4px; width: 100%; }
  .tx-row {
    display: flex; justify-content: space-between;
    align-items: center; padding: 10px 12px;
    border-radius: 8px; background: rgba(255,255,255,0.02); width: 100%;
  }
  .tx-l { display: flex; flex-direction: column; gap: 2px; }
  .tx-cat { font-size: 13px; font-weight: 500; color: #c8c0b0; }
  .tx-desc { font-size: 11px; color: #5a5248; }
  .tx-r { display: flex; align-items: center; gap: 8px; }
  .tx-amt { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; }
  .tx-del {
    background: none; border: none;
    color: #3a3630; font-size: 16px; cursor: pointer;
    transition: color 0.15s;
  }
  .tx-del:hover { color: #f87171; }

  /* EMPTY STATE */
  .empty { text-align: center; padding: 48px 20px; opacity: 0.5; width: 100%; }
  .empty-glyph { font-size: 32px; display: block; margin-bottom: 12px; color: #3a3630; font-family: 'DM Mono', monospace; }
  .empty-txt { font-size: 15px; font-weight: 500; color: #7a7068; margin-bottom: 4px; }
  .empty-sub { font-size: 12px; color: #3a3630; }
`;