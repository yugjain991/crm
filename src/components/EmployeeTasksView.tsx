import React, { useEffect, useState } from 'react';
import { Bell, BellRing, Trash2, RefreshCw, Pencil, Plus } from 'lucide-react';
import TaskAssignmentModal, { TaskData } from './TaskAssignmentModal';

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Blocked';
  assignedEmployeeIds: string[];
}

interface Employee {
  id: string;
  fields: { name?: string; phone?: string };
  title: string;
}

interface Props {
  employees: Employee[];
  onAssignClick?: () => void;
  onShowToast?: (message: string, type: 'success' | 'error') => void;
}

function isOverdue(dueDate: string, status: string): boolean {
  if (!dueDate || status === 'Completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function isDueToday(dueDate: string, status: string): boolean {
  if (!dueDate || status === 'Completed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  return due.getTime() === today.getTime();
}

export default function EmployeeTasksView({ employees, onAssignClick, onShowToast }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskData | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?_t=${Date.now()}`);
      const data = await res.json();
      // Migrate old tasks that may still have single assignedEmployeeId
      const migrated = data.map((t: any) => ({
        ...t,
        assignedEmployeeIds: t.assignedEmployeeIds ?? (t.assignedEmployeeId ? [t.assignedEmployeeId] : []),
      }));
      setTasks(migrated);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const deleteTask = async (id: string) => {
    await fetch('/api/tasks', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const updateStatus = async (id: string, newStatus: Task['status']) => {
    await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, updates: { status: newStatus } }),
    });
    load();
  };

  const sendReminder = async (taskId: string) => {
    setSendingReminder(taskId);
    try {
      const res = await fetch(`/api/tasks/remind?taskId=${taskId}`);
      const data = await res.json();
      const sent = data.totalRemindersSent ?? 0;
      if (sent > 0) {
        onShowToast?.(`🔔 Reminder sent to ${sent} employee${sent > 1 ? 's' : ''}!`, 'success');
      } else {
        onShowToast?.('No reminders sent — employees may not have phone numbers.', 'error');
      }
    } catch {
      onShowToast?.('Failed to send reminder.', 'error');
    } finally {
      setSendingReminder(null);
    }
  };

  const sendAllReminders = async () => {
    setSendingAll(true);
    try {
      const res = await fetch('/api/tasks/remind');
      const data = await res.json();
      const sent = data.totalRemindersSent ?? 0;
      const processed = data.totalTasksProcessed ?? 0;
      if (processed === 0) {
        onShowToast?.('No tasks are overdue or due soon — nothing to remind!', 'success');
      } else if (sent > 0) {
        onShowToast?.(`🔔 ${sent} reminder${sent > 1 ? 's' : ''} sent across ${processed} task${processed > 1 ? 's' : ''}!`, 'success');
      } else {
        onShowToast?.('Tasks found but no reminders sent — check phone numbers.', 'error');
      }
    } catch {
      onShowToast?.('Failed to send reminders.', 'error');
    } finally {
      setSendingAll(false);
    }
  };

  const getEmployeeNames = (ids: string[]) =>
    ids.map((id) => {
      const emp = employees.find((e) => e.id === id);
      return emp?.fields?.name || emp?.title || id;
    });

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>
        <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', display: 'inline' }} />
        <span style={{ marginLeft: '10px' }}>Loading tasks…</span>
      </div>
    );
  }

  const pendingCount = tasks.filter((t) => t.status !== 'Completed').length;
  const overdueCount = tasks.filter((t) => isOverdue(t.dueDate, t.status)).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--line)',
          paddingBottom: '16px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            🗂️ Employee Tasks
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--muted)' }}>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} total
            {overdueCount > 0 && (
              <span style={{ marginLeft: '10px', color: '#e53e3e', fontWeight: 700 }}>
                • {overdueCount} overdue
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Send All Reminders button */}
          <button
            type="button"
            className="secondary-button"
            onClick={sendAllReminders}
            disabled={sendingAll || pendingCount === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              height: '38px',
              padding: '0 14px',
              borderRadius: '8px',
              opacity: pendingCount === 0 ? 0.5 : 1,
            }}
            title="Send WhatsApp reminders for all overdue / due-today / due-tomorrow tasks"
          >
            <BellRing size={15} />
            {sendingAll ? 'Sending…' : 'Send Reminders'}
          </button>

          {onAssignClick && (
            <button
              className="primary-button"
              onClick={onAssignClick}
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 16px', borderRadius: '8px' }}
            >
              <Plus size={16} /> Assign Task
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="empty-state" style={{ padding: '40px 20px' }}>
          <strong>No tasks assigned yet.</strong>
          <span>Click the "Assign Task" button to create and assign tasks to employees.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            const dueToday = isDueToday(task.dueDate, task.status);
            const assigneeNames = getEmployeeNames(task.assignedEmployeeIds);

            return (
              <div
                key={task.id}
                className="panel"
                style={{
                  padding: '20px',
                  backgroundColor: 'var(--panel)',
                  borderColor: overdue ? '#fed7d7' : dueToday ? '#fef3c7' : 'var(--line)',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '240px',
                  boxShadow: overdue
                    ? '0 0 0 2px rgba(229,62,62,0.15)'
                    : 'var(--shadow)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  position: 'relative',
                }}
              >
                {/* Overdue / Due Today banner */}
                {(overdue || dueToday) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      borderRadius: '12px 12px 0 0',
                      background: overdue ? '#e53e3e' : '#d69e2e',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.07em',
                      textTransform: 'uppercase',
                      textAlign: 'center',
                      padding: '4px 0',
                    }}
                  >
                    {overdue ? '🚨 Overdue' : '⏰ Due Today'}
                  </div>
                )}

                <div style={{ marginTop: overdue || dueToday ? '22px' : '0' }}>
                  {/* Title + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '1.05rem', color: 'var(--ink)', margin: 0, fontWeight: 600, lineHeight: '1.3' }}>
                      {task.title || 'Untitled Task'}
                    </h3>
                    <span
                      className={`status-badge ${
                        task.status === 'Pending'
                          ? 'amber'
                          : task.status === 'In Progress'
                          ? 'teal'
                          : task.status === 'Completed'
                          ? 'green'
                          : task.status === 'Blocked'
                          ? 'red'
                          : 'neutral'
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>

                  <p style={{ color: 'var(--muted)', fontSize: '0.87rem', lineHeight: '1.45', margin: '8px 0 14px' }}>
                    {task.description || 'No description provided.'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--line)', paddingTop: '14px', marginTop: 'auto' }}>
                  {/* Due date + Assignees */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '14px' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 700, letterSpacing: '0.05em', color: '#888b86', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '2px' }}>
                        DUE DATE
                      </span>
                      <span style={{ color: overdue ? '#e53e3e' : 'var(--ink)', fontWeight: 600 }}>
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'No due date'}
                      </span>
                    </div>
                    <div>
                      <span style={{ display: 'block', fontWeight: 700, letterSpacing: '0.05em', color: '#888b86', fontSize: '0.7rem', textTransform: 'uppercase', marginBottom: '4px' }}>
                        ASSIGNEES
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {assigneeNames.length > 0 ? (
                          assigneeNames.map((name, i) => (
                            <span key={i} className="assignee-pill" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                              {name}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Unassigned</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <select
                      value={task.status}
                      onChange={(e) => updateStatus(task.id, e.target.value as any)}
                      className="input"
                      style={{ minHeight: '32px', flex: '1', padding: '0 8px', fontSize: '0.82rem', borderRadius: '6px' }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="Blocked">Blocked</option>
                    </select>

                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTask({
                          id: task.id,
                          title: task.title,
                          description: task.description,
                          dueDate: task.dueDate,
                          status: task.status,
                          assignedEmployeeIds: task.assignedEmployeeIds,
                        });
                        setEditModalOpen(true);
                      }}
                      className="icon-button"
                      title="Edit task"
                      style={{
                        minHeight: '32px',
                        width: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        color: 'var(--accent)',
                      }}
                    >
                      <Pencil size={14} />
                    </button>

                    {/* Per-task reminder button */}
                    <button
                      type="button"
                      onClick={() => sendReminder(task.id)}
                      disabled={sendingReminder === task.id || task.status === 'Completed'}
                      className="icon-button"
                      title="Send WhatsApp reminder for this task"
                      style={{
                        minHeight: '32px',
                        width: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        opacity: task.status === 'Completed' ? 0.4 : 1,
                        color: '#d69e2e',
                      }}
                    >
                      <Bell size={14} />
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteTask(task.id)}
                      className="icon-button"
                      title="Delete task"
                      style={{
                        minHeight: '32px',
                        width: '32px',
                        borderRadius: '6px',
                        border: '1px solid var(--line)',
                        color: '#e53e3e',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Task Modal */}
      <TaskAssignmentModal
        employees={employees}
        open={editModalOpen}
        setOpen={(v) => {
          setEditModalOpen(v);
          if (!v) setEditingTask(null);
        }}
        editTask={editingTask}
        onTaskCreated={() => {
          load();
          setEditingTask(null);
        }}
        onShowToast={onShowToast}
      />
    </div>
  );
}
