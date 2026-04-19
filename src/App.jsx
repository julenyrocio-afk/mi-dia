import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "planner-data-v2";

const getTodayStr = () => new Date().toISOString().slice(0, 10);

const formatDate = (dateStr) => {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

const formatMoney = (n) => {
  const abs = Math.abs(n).toFixed(2);
  const parts = abs.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + parts.join(",") + " €";
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const CATEGORIES = {
  expense: ["🛒 Compras", "🍽️ Comida", "🚗 Transporte", "🏠 Hogar", "🎮 Ocio", "💊 Salud", "📦 Otros"],
  income: ["💼 Salario", "🎁 Regalo", "💰 Freelance", "📈 Inversión", "📦 Otros"],
};

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("tasks");
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [showTxForm, setShowTxForm] = useState(false);
  const [txType, setTxType] = useState("expense");
  const [newTask, setNewTask] = useState("");
  const taskInputRef = useRef(null);

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result) {
          const parsed = JSON.parse(result.value);
          setData(parsed);
        } else {
          setData({ tasks: {}, transactions: {} });
        }
      } catch {
        setData({ tasks: {}, transactions: {} });
      }
      setLoading(false);
    })();
  }, []);

  // Save data
  const save = useCallback(async (newData) => {
    setData(newData);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(newData));
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, []);

  // Carry over uncompleted tasks from previous days
  useEffect(() => {
    if (!data) return;
    const today = selectedDate;
    const allDates = Object.keys(data.tasks).filter(d => d < today).sort();
    let carried = [];
    for (const d of allDates) {
      const pending = (data.tasks[d] || []).filter(t => !t.done);
      carried = [...carried, ...pending.map(t => ({ ...t, carriedFrom: t.carriedFrom || d }))];
    }
    if (carried.length === 0) return;
    const existing = data.tasks[today] || [];
    const existingIds = new Set(existing.map(t => t.id));
    const toAdd = carried.filter(t => !existingIds.has(t.id));
    if (toAdd.length === 0) return;

    // Remove from old days and add to today
    const newTasks = { ...data.tasks };
    for (const d of allDates) {
      newTasks[d] = (newTasks[d] || []).filter(t => t.done);
    }
    newTasks[today] = [...toAdd, ...existing];
    save({ ...data, tasks: newTasks });
  }, [data, selectedDate, save]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0f", color: "#e0ddd5" }}>
      <p style={{ fontFamily: "'DM Mono', monospace", letterSpacing: "0.15em" }}>Cargando...</p>
    </div>
  );

  const todayTasks = (data.tasks[selectedDate] || []);
  const todayTx = (data.transactions[selectedDate] || []);

  const addTask = () => {
    if (!newTask.trim()) return;
    const task = { id: uid(), text: newTask.trim(), done: false, createdAt: selectedDate };
    const newTasks = { ...data.tasks };
    newTasks[selectedDate] = [...(newTasks[selectedDate] || []), task];
    save({ ...data, tasks: newTasks });
    setNewTask("");
    taskInputRef.current?.focus();
  };

  const toggleTask = (id) => {
    const newTasks = { ...data.tasks };
    newTasks[selectedDate] = (newTasks[selectedDate] || []).map(t =>
      t.id === id ? { ...t, done: !t.done } : t
    );
    save({ ...data, tasks: newTasks });
  };

  const deleteTask = (id) => {
    const newTasks = { ...data.tasks };
    newTasks[selectedDate] = (newTasks[selectedDate] || []).filter(t => t.id !== id);
    save({ ...data, tasks: newTasks });
  };

  const addTransaction = (tx) => {
    const newTx = { ...data.transactions };
    newTx[selectedDate] = [...(newTx[selectedDate] || []), { ...tx, id: uid() }];
    save({ ...data, transactions: newTx });
    setShowTxForm(false);
  };

  const deleteTransaction = (id) => {
    const newTx = { ...data.transactions };
    newTx[selectedDate] = (newTx[selectedDate] || []).filter(t => t.id !== id);
    save({ ...data, transactions: newTx });
  };

  const navigateDate = (dir) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + dir);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const isToday = selectedDate === getTodayStr();

  const totalIncome = todayTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = todayTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // Monthly summary
  const monthKey = selectedDate.slice(0, 7);
  const monthTx = Object.entries(data.transactions)
    .filter(([d]) => d.startsWith(monthKey))
    .flatMap(([, txs]) => txs);
  const monthIncome = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const completedCount = todayTasks.filter(t => t.done).length;
  const totalTasks = todayTasks.length;

  return (
    <div style={styles.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logo}>
            <span style={styles.logoIcon}>▣</span>
            <span style={styles.logoText}>mi día</span>
          </div>
          <div style={styles.dateNav}>
            <button onClick={() => navigateDate(-1)} style={styles.navBtn}>◂</button>
            <div style={styles.dateBlock}>
              <span style={styles.dateLabel}>{formatDate(selectedDate)}</span>
              {isToday && <span style={styles.todayBadge}>HOY</span>}
            </div>
            <button onClick={() => navigateDate(1)} style={styles.navBtn}>▸</button>
          </div>
          {!isToday && (
            <button onClick={() => setSelectedDate(getTodayStr())} style={styles.goToday}>Ir a hoy</button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab("tasks")}
          style={{ ...styles.tab, ...(activeTab === "tasks" ? styles.tabActive : {}) }}
        >
          <span style={styles.tabIcon}>☐</span> Tareas
          {totalTasks > 0 && (
            <span style={styles.tabCount}>{completedCount}/{totalTasks}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("finance")}
          style={{ ...styles.tab, ...(activeTab === "finance" ? styles.tabActive : {}) }}
        >
          <span style={styles.tabIcon}>€</span> Finanzas
        </button>
      </div>

      {/* Content */}
      <main style={styles.main}>
        {activeTab === "tasks" ? (
          <TasksView
            tasks={todayTasks}
            newTask={newTask}
            setNewTask={setNewTask}
            addTask={addTask}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            taskInputRef={taskInputRef}
            selectedDate={selectedDate}
          />
        ) : (
          <FinanceView
            transactions={todayTx}
            totalIncome={totalIncome}
            totalExpense={totalExpense}
            balance={balance}
            monthIncome={monthIncome}
            monthExpense={monthExpense}
            monthKey={monthKey}
            showTxForm={showTxForm}
            setShowTxForm={setShowTxForm}
            txType={txType}
            setTxType={setTxType}
            addTransaction={addTransaction}
            deleteTransaction={deleteTransaction}
          />
        )}
      </main>
    </div>
  );
}

function TasksView({ tasks, newTask, setNewTask, addTask, toggleTask, deleteTask, taskInputRef, selectedDate }) {
  const pending = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  return (
    <div>
      {/* Add task */}
      <div style={styles.addTaskRow}>
        <input
          ref={taskInputRef}
          type="text"
          placeholder="Añadir tarea..."
          value={newTask}
          onChange={e => setNewTask(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTask()}
          style={styles.addTaskInput}
        />
        <button onClick={addTask} style={styles.addBtn}>+</button>
      </div>

      {/* Progress */}
      {tasks.length > 0 && (
        <div style={styles.progressArea}>
          <div style={styles.progressBar}>
            <div style={{
              ...styles.progressFill,
              width: `${tasks.length ? (done.length / tasks.length) * 100 : 0}%`,
            }} />
          </div>
          <span style={styles.progressText}>
            {done.length === tasks.length && tasks.length > 0
              ? "✓ ¡Todo completado!"
              : `${done.length} de ${tasks.length} completadas`}
          </span>
        </div>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div style={styles.taskSection}>
          <h3 style={styles.taskSectionTitle}>Pendientes</h3>
          {pending.map(t => (
            <TaskItem key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div style={styles.taskSection}>
          <h3 style={{ ...styles.taskSectionTitle, opacity: 0.5 }}>Completadas</h3>
          {done.map(t => (
            <TaskItem key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>
      )}

      {tasks.length === 0 && (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>📋</span>
          <p style={styles.emptyText}>Sin tareas para este día</p>
          <p style={styles.emptySubtext}>Añade tu primera tarea arriba</p>
        </div>
      )}
    </div>
  );
}

function TaskItem({ task, onToggle, onDelete }) {
  const [hovering, setHovering] = useState(false);

  return (
    <div
      style={{
        ...styles.taskItem,
        ...(task.done ? styles.taskDone : {}),
        ...(hovering ? { background: "rgba(255,255,255,0.04)" } : {}),
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <button onClick={() => onToggle(task.id)} style={styles.checkbox}>
        {task.done ? (
          <span style={styles.checked}>✓</span>
        ) : (
          <span style={styles.unchecked} />
        )}
      </button>
      <div style={styles.taskContent}>
        <span style={{
          ...styles.taskText,
          ...(task.done ? { textDecoration: "line-through", opacity: 0.4 } : {}),
        }}>
          {task.text}
        </span>
        {task.carriedFrom && (
          <span style={styles.carriedBadge}>⟲ desde {task.carriedFrom.slice(5)}</span>
        )}
      </div>
      {hovering && (
        <button onClick={() => onDelete(task.id)} style={styles.deleteBtn}>×</button>
      )}
    </div>
  );
}

function FinanceView({
  transactions, totalIncome, totalExpense, balance,
  monthIncome, monthExpense, monthKey,
  showTxForm, setShowTxForm, txType, setTxType,
  addTransaction, deleteTransaction
}) {
  return (
    <div>
      {/* Summary cards */}
      <div style={styles.financeCards}>
        <div style={{ ...styles.fCard, borderLeft: "3px solid #4ade80" }}>
          <span style={styles.fCardLabel}>Ingresos hoy</span>
          <span style={{ ...styles.fCardValue, color: "#4ade80" }}>{formatMoney(totalIncome)}</span>
        </div>
        <div style={{ ...styles.fCard, borderLeft: "3px solid #f87171" }}>
          <span style={styles.fCardLabel}>Gastos hoy</span>
          <span style={{ ...styles.fCardValue, color: "#f87171" }}>{formatMoney(totalExpense)}</span>
        </div>
        <div style={{ ...styles.fCard, borderLeft: `3px solid ${balance >= 0 ? "#60a5fa" : "#fbbf24"}` }}>
          <span style={styles.fCardLabel}>Balance hoy</span>
          <span style={{ ...styles.fCardValue, color: balance >= 0 ? "#60a5fa" : "#fbbf24" }}>{formatMoney(balance)}</span>
        </div>
      </div>

      {/* Monthly mini summary */}
      <div style={styles.monthSummary}>
        <span style={styles.monthLabel}>Resumen {monthKey}</span>
        <div style={styles.monthRow}>
          <span style={{ color: "#4ade80" }}>▲ {formatMoney(monthIncome)}</span>
          <span style={{ color: "#f87171" }}>▼ {formatMoney(monthExpense)}</span>
          <span style={{ color: monthIncome - monthExpense >= 0 ? "#60a5fa" : "#fbbf24", fontWeight: 600 }}>
            = {formatMoney(monthIncome - monthExpense)}
          </span>
        </div>
      </div>

      {/* Add button */}
      {!showTxForm && (
        <div style={styles.addTxBtns}>
          <button onClick={() => { setTxType("expense"); setShowTxForm(true); }} style={styles.addExpenseBtn}>
            − Gasto
          </button>
          <button onClick={() => { setTxType("income"); setShowTxForm(true); }} style={styles.addIncomeBtn}>
            + Ingreso
          </button>
        </div>
      )}

      {showTxForm && (
        <TransactionForm
          type={txType}
          onAdd={addTransaction}
          onCancel={() => setShowTxForm(false)}
        />
      )}

      {/* Transaction list */}
      {transactions.length > 0 ? (
        <div style={styles.txList}>
          {transactions.map(tx => (
            <div key={tx.id} style={styles.txItem}>
              <div style={styles.txLeft}>
                <span style={styles.txCat}>{tx.category}</span>
                {tx.description && <span style={styles.txDesc}>{tx.description}</span>}
              </div>
              <div style={styles.txRight}>
                <span style={{
                  ...styles.txAmount,
                  color: tx.type === "income" ? "#4ade80" : "#f87171"
                }}>
                  {tx.type === "income" ? "+" : "−"}{formatMoney(tx.amount)}
                </span>
                <button onClick={() => deleteTransaction(tx.id)} style={styles.txDelete}>×</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>💶</span>
          <p style={styles.emptyText}>Sin movimientos este día</p>
        </div>
      )}
    </div>
  );
}

function TransactionForm({ type, onAdd, onCancel }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[type][0]);
  const [description, setDescription] = useState("");

  const submit = () => {
    const val = parseFloat(amount.replace(",", "."));
    if (!val || val <= 0) return;
    onAdd({ type, amount: val, category, description: description.trim() });
  };

  const cats = CATEGORIES[type];
  const isExpense = type === "expense";

  return (
    <div style={{
      ...styles.txForm,
      borderColor: isExpense ? "#f8717133" : "#4ade8033",
    }}>
      <div style={styles.txFormHeader}>
        <span style={{ fontWeight: 600, color: isExpense ? "#f87171" : "#4ade80" }}>
          {isExpense ? "Nuevo gasto" : "Nuevo ingreso"}
        </span>
        <button onClick={onCancel} style={styles.txFormClose}>×</button>
      </div>

      <input
        type="text"
        inputMode="decimal"
        placeholder="Cantidad (€)"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={styles.txInput}
        autoFocus
      />

      <div style={styles.catGrid}>
        {cats.map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            style={{
              ...styles.catBtn,
              ...(category === c ? {
                background: isExpense ? "#f8717122" : "#4ade8022",
                borderColor: isExpense ? "#f87171" : "#4ade80",
              } : {}),
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Descripción (opcional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        style={styles.txInput}
      />

      <button onClick={submit} style={{
        ...styles.txSubmitBtn,
        background: isExpense ? "#f87171" : "#4ade80",
        color: isExpense ? "#fff" : "#0a0a0f",
      }}>
        Guardar
      </button>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#e0ddd5",
    fontFamily: "'Outfit', sans-serif",
    maxWidth: 520,
    margin: "0 auto",
    padding: "0 0 80px 0",
  },
  header: {
    background: "linear-gradient(135deg, #0f0f18 0%, #151520 100%)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    padding: "20px 20px 16px",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  logoIcon: {
    fontSize: 22,
    color: "#c9a0ff",
  },
  logoText: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 18,
    fontWeight: 500,
    letterSpacing: "0.08em",
    color: "#c9a0ff",
  },
  dateNav: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  navBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e0ddd5",
    borderRadius: 8,
    width: 36,
    height: 36,
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dateBlock: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  dateLabel: {
    fontSize: 15,
    fontWeight: 500,
    letterSpacing: "0.02em",
  },
  todayBadge: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.15em",
    background: "#c9a0ff22",
    color: "#c9a0ff",
    padding: "2px 8px",
    borderRadius: 4,
  },
  goToday: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#888",
    padding: "4px 12px",
    borderRadius: 6,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  tabs: {
    display: "flex",
    gap: 0,
    padding: "0 20px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#0c0c14",
  },
  tab: {
    flex: 1,
    padding: "14px 0",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "#666",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Outfit', sans-serif",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    transition: "all 0.2s",
  },
  tabActive: {
    color: "#e0ddd5",
    borderBottomColor: "#c9a0ff",
  },
  tabIcon: {
    fontSize: 15,
  },
  tabCount: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    background: "rgba(255,255,255,0.06)",
    padding: "1px 6px",
    borderRadius: 4,
  },
  main: {
    padding: "20px",
  },
  addTaskRow: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
  },
  addTaskInput: {
    flex: 1,
    padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    color: "#e0ddd5",
    fontSize: 14,
    fontFamily: "'Outfit', sans-serif",
    outline: "none",
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    background: "#c9a0ff",
    border: "none",
    color: "#0a0a0f",
    fontSize: 22,
    fontWeight: 700,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  progressArea: {
    marginBottom: 24,
  },
  progressBar: {
    height: 4,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #c9a0ff, #a0d0ff)",
    borderRadius: 2,
    transition: "width 0.4s ease",
  },
  progressText: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#888",
    letterSpacing: "0.03em",
  },
  taskSection: {
    marginBottom: 20,
  },
  taskSectionTitle: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    fontWeight: 400,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#666",
    marginBottom: 8,
    padding: "0 4px",
  },
  taskItem: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
    transition: "background 0.15s",
    position: "relative",
  },
  taskDone: {},
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  unchecked: {
    width: 20,
    height: 20,
    borderRadius: 6,
    border: "2px solid rgba(255,255,255,0.15)",
    display: "block",
  },
  checked: {
    width: 20,
    height: 20,
    borderRadius: 6,
    background: "#c9a0ff",
    color: "#0a0a0f",
    fontSize: 13,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  taskContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  taskText: {
    fontSize: 14,
    lineHeight: 1.4,
  },
  carriedBadge: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 10,
    color: "#c9a0ff88",
    letterSpacing: "0.03em",
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "#f8717188",
    fontSize: 18,
    cursor: "pointer",
    padding: "0 4px",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 20px",
    opacity: 0.6,
  },
  emptyIcon: {
    fontSize: 36,
    display: "block",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: 500,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#888",
  },
  financeCards: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 16,
  },
  fCard: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fCardLabel: {
    fontSize: 13,
    color: "#888",
  },
  fCardValue: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 15,
    fontWeight: 500,
  },
  monthSummary: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 20,
  },
  monthLabel: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11,
    color: "#666",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 8,
  },
  monthRow: {
    display: "flex",
    justifyContent: "space-between",
    fontFamily: "'DM Mono', monospace",
    fontSize: 12,
  },
  addTxBtns: {
    display: "flex",
    gap: 8,
    marginBottom: 20,
  },
  addExpenseBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: 10,
    border: "1px solid #f8717133",
    background: "#f8717111",
    color: "#f87171",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    cursor: "pointer",
  },
  addIncomeBtn: {
    flex: 1,
    padding: "12px",
    borderRadius: 10,
    border: "1px solid #4ade8033",
    background: "#4ade8011",
    color: "#4ade80",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    cursor: "pointer",
  },
  txForm: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  txFormHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txFormClose: {
    background: "transparent",
    border: "none",
    color: "#888",
    fontSize: 20,
    cursor: "pointer",
  },
  txInput: {
    padding: "10px 14px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    color: "#e0ddd5",
    fontSize: 14,
    fontFamily: "'Outfit', sans-serif",
    outline: "none",
  },
  catGrid: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  catBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#e0ddd5",
    fontSize: 12,
    fontFamily: "'Outfit', sans-serif",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  txSubmitBtn: {
    padding: "12px",
    borderRadius: 10,
    border: "none",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Outfit', sans-serif",
    cursor: "pointer",
  },
  txList: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  txItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.02)",
  },
  txLeft: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  txCat: {
    fontSize: 13,
    fontWeight: 500,
  },
  txDesc: {
    fontSize: 11,
    color: "#888",
  },
  txRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  txAmount: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 14,
    fontWeight: 500,
  },
  txDelete: {
    background: "transparent",
    border: "none",
    color: "#666",
    fontSize: 16,
    cursor: "pointer",
  },
};

export default App;
