import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: string;
  assignedEmployeeIds: string[];
}

interface Employee {
  id: string;
  title: string;
  type: string;
  fields: { name?: string; phone?: string; [key: string]: any };
}

interface ReminderResult {
  taskId: string;
  taskTitle: string;
  urgency: 'overdue' | 'due-today' | 'due-tomorrow';
  sentTo: string[];
  skipped: string[];
}

const tasksFile = path.join(process.cwd(), 'src', 'data', 'tasks.json');
const documentsFile = path.join(process.cwd(), 'src', 'data', 'documents.json');

function migrateTasks(raw: any[]): Task[] {
  return raw.map((t) => {
    if (t.assignedEmployeeIds) return t;
    return { ...t, assignedEmployeeIds: t.assignedEmployeeId ? [t.assignedEmployeeId] : [] };
  });
}

/** Classify urgency of a task relative to today */
function getUrgency(dueDateStr: string): 'overdue' | 'due-today' | 'due-tomorrow' | null {
  if (!dueDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateStr);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due-today';
  if (diffDays === 1) return 'due-tomorrow';
  return null;
}

function buildMessage(
  urgency: 'overdue' | 'due-today' | 'due-tomorrow',
  task: Task,
  employeeName: string,
): string {
  const formattedDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'No due date';

  const icon = urgency === 'overdue' ? '🚨' : urgency === 'due-today' ? '⏰' : '📅';
  const heading =
    urgency === 'overdue'
      ? `*OVERDUE TASK ALERT*`
      : urgency === 'due-today'
      ? `*Task Due TODAY*`
      : `*Heads Up – Task Due Tomorrow*`;

  return (
    `${icon} ${heading}\n\n` +
    `Hi ${employeeName}! Here's a reminder about your task:\n\n` +
    `📋 *Title:* ${task.title}\n` +
    `📝 *Description:* ${task.description || 'No description provided.'}\n` +
    `📆 *Due Date:* ${formattedDate}\n` +
    `🔖 *Current Status:* ${task.status}\n\n` +
    (urgency === 'overdue'
      ? `⚠️ This task is *overdue*. Please update the status or reach out to your manager.`
      : urgency === 'due-today'
      ? `⚡ Please make sure to complete this task by end of day today!`
      : `📌 This task is due *tomorrow*. Please plan accordingly.`)
  );
}

async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  try {
    const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

    // Format destination number for Meta
    let cleanTo = to.trim();
    if (cleanTo.startsWith('whatsapp:')) {
      cleanTo = cleanTo.substring('whatsapp:'.length);
    }
    const digits = cleanTo.replace(/\D/g, '');
    let formattedTo = digits;
    
    // If it's a 10-digit number, prepend '91' (default to India country code)
    if (digits.length === 10) {
      formattedTo = `91${digits}`;
    }

    // 1. Try Meta WhatsApp Cloud API first
    if (whatsappToken && phoneId && !whatsappToken.includes('your_meta_access_token')) {
      const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
      console.log('[tasks/remind] Dispatching via Meta Cloud API to:', formattedTo);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: formattedTo,
          type: 'text',
          text: {
            preview_url: false,
            body: body,
          },
        }),
      });

      const data = await res.json();
      console.log('[tasks/remind] Meta response:', data);
      return res.ok;
    }

    // 2. Simulation fallback if Meta API is unconfigured
    console.log('-----------------------------------------');
    console.log('SIMULATED WHATSAPP MESSAGE (No API Keys)');
    console.log(`To: ${formattedTo}`);
    console.log(`Body:\n${body}`);
    console.log('-----------------------------------------');
    return true;
  } catch (error) {
    console.error('[tasks/remind] sendWhatsApp error:', error);
    return false;
  }
}

/**
 * GET /api/tasks/remind
 * Optional query params:
 *   - taskId: only send reminder for this specific task
 * Sends WhatsApp reminders for tasks that are overdue, due today, or due tomorrow.
 * Skips tasks with status "Completed".
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const specificTaskId = url.searchParams.get('taskId');

    // Load tasks from Supabase
    const { data: tasksData, error: tasksError } = await supabase.from('tasks').select('*');
    if (tasksError) throw tasksError;

    const allTasks: Task[] = (tasksData || []).map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dueDate: row.due_date,
      status: row.status,
      assignedEmployeeIds: row.assigned_employee_ids || [],
    }));

    // Load employees from Supabase app_data
    const { data: docsData, error: docsError } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'documents')
      .single();
      
    const docsRaw = docsError || !docsData ? [] : docsData.data;
    const employees: Employee[] = Array.isArray(docsRaw) ? docsRaw.filter((d: any) => d.type === 'employee') : [];

    // Build employee lookup map
    const employeeMap = new Map<string, Employee>();
    employees.forEach((e) => employeeMap.set(e.id, e));

    // Filter tasks
    const tasksToProcess = allTasks.filter((t) => {
      if (t.status === 'Completed') return false;
      if (specificTaskId) return t.id === specificTaskId;
      return getUrgency(t.dueDate) !== null;
    });

    const results: ReminderResult[] = [];
    let totalSent = 0;

    for (const task of tasksToProcess) {
      const urgency = specificTaskId
        ? getUrgency(task.dueDate) || 'due-today' // for manual single-task reminder, still send
        : getUrgency(task.dueDate)!;

      const sentTo: string[] = [];
      const skipped: string[] = [];

      for (const empId of task.assignedEmployeeIds) {
        const emp = employeeMap.get(empId);
        if (!emp) { skipped.push(empId); continue; }

        const phone = emp.fields?.phone;
        if (!phone) { skipped.push(emp.fields?.name || emp.title || empId); continue; }

        const name = emp.fields?.name || emp.title || 'there';
        const message = buildMessage(urgency, task, name);
        const ok = await sendWhatsApp(phone, message);

        if (ok) {
          sentTo.push(name);
          totalSent++;
        } else {
          skipped.push(name);
        }
      }

      results.push({ taskId: task.id, taskTitle: task.title, urgency, sentTo, skipped });
    }

    return NextResponse.json({
      success: true,
      totalTasksProcessed: tasksToProcess.length,
      totalRemindersSent: totalSent,
      results,
    });
  } catch (error: any) {
    console.error('[tasks/remind] Error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Internal error' }, { status: 500 });
  }
}
