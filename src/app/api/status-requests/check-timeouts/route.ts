import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

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
      console.log('[check-timeouts] Dispatching via Meta Cloud API to:', formattedTo);
      
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
      console.log('[check-timeouts] Meta response:', data);
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
    console.error('[check-timeouts] sendWhatsApp error:', error);
    return false;
  }
}

function parseToISTDate(dateStr: string, timeStr?: string): Date | null {
  if (!dateStr) return null;
  try {
    let combined = dateStr;
    if (!combined.includes('T')) {
      const time = timeStr || '18:00';
      combined = `${combined}T${time}`;
    }
    
    // If it doesn't have Z or a timezone offset (like +05:30 or -08:00), append +05:30
    if (!combined.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(combined)) {
      if ((combined.match(/:/g) || []).length === 1) {
        combined = `${combined}:00`;
      }
      combined = `${combined}+05:30`;
    }
    
    return new Date(combined);
  } catch (e) {
    console.error('[check-timeouts] Error parsing IST date:', dateStr, timeStr, e);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const now = new Date();
    const nowTime = now.getTime();

    // 1. Batch update all expired requests to 'not_replied'
    const { data: expiredRequests, error: expiredError } = await supabase
      .from('status_requests')
      .select('id, employee_name')
      .eq('status', 'sent')
      .lt('reply_deadline', now.toISOString());

    if (expiredError) throw expiredError;

    let expiredCount = 0;
    if (expiredRequests && expiredRequests.length > 0) {
      const expiredIds = expiredRequests.map((r: any) => r.id);
      const { error: updateError } = await supabase
        .from('status_requests')
        .update({ status: 'not_replied' })
        .in('id', expiredIds);
        
      if (updateError) throw updateError;
      expiredCount = expiredIds.length;
      
      console.log(`[status-requests/check-timeouts] Marked ${expiredCount} requests as not_replied:`,
        expiredRequests.map((r: any) => r.employee_name).join(', ')
      );
    }

    // 2. Check for tasks due in less than 1 hour
    const oneHourMs = 60 * 60 * 1000;
    
    // Load sent reminders state from key-value store
    const { data: reminderState } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'task_reminders_sent')
      .single();
      
    const sentReminders = reminderState?.data || {};

    // Fetch all incomplete tasks
    const { data: tasksData, error: tasksError } = await supabase
      .from('tasks')
      .select('*')
      .neq('status', 'Completed');
      
    if (tasksError) throw tasksError;

    // Load active employees
    const { data: docsData } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'documents')
      .single();
      
    const docs = docsData?.data || [];
    const employees = docs.filter((d: any) => d.type === 'employee');
    const employeeMap = new Map();
    employees.forEach((e: any) => employeeMap.set(e.id, e));

    let tasksReminderSent = 0;
    let remindersLogged: string[] = [];

    for (const task of (tasksData || [])) {
      // Skip if reminder already sent
      if (sentReminders[task.id]) continue;

      const dueDateTime = parseToISTDate(task.due_date, task.due_time);
      if (!dueDateTime) continue;

      const diffMs = dueDateTime.getTime() - nowTime;

      // If task is due in <= 1 hour (and hasn't passed yet)
      if (diffMs > 0 && diffMs <= oneHourMs) {
        const formattedDate = dueDateTime.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const timeStr = task.due_time ? ` at ${task.due_time}` : '';
        
        const message = 
          `⏰ *DEADLINE IN 1 HOUR* ⏰\n\n` +
          `Hi {employeeName}! This is a friendly reminder that your task is due in 1 hour:\n\n` +
          `📋 *Title:* ${task.title}\n` +
          `📝 *Description:* ${task.description || 'No description provided.'}\n` +
          `📆 *Deadline:* ${formattedDate}${timeStr} (IST)\n` +
          `🔖 *Status:* ${task.status}\n\n` +
          `⚡ Please wrap up your task or update its status in the dashboard.`;

        let sentToAny = false;
        const assignees = task.assigned_employee_ids || [];
        
        for (const empId of assignees) {
          const emp = employeeMap.get(empId);
          if (!emp) continue;
          const phone = emp.fields?.phone;
          if (!phone) continue;
          const name = emp.fields?.name || emp.title || 'there';

          const personalizedMsg = message.replace('{employeeName}', name);
          const ok = await sendWhatsApp(phone, personalizedMsg);
          if (ok) {
            sentToAny = true;
            remindersLogged.push(`${task.title} -> ${name}`);
          }
        }

        if (sentToAny) {
          sentReminders[task.id] = new Date().toISOString();
          tasksReminderSent++;
        }
      }
    }

    // Save reminder state back to app_data
    if (tasksReminderSent > 0) {
      await supabase
        .from('app_data')
        .upsert({ key: 'task_reminders_sent', data: sentReminders });
    }

    // 3. Trigger daily check-ins (morning/midday/evening)
    const istNow = new Date(nowTime + 5.5 * 60 * 60 * 1000);
    const istHour = istNow.getUTCHours();
    const istMinute = istNow.getUTCMinutes();
    
    let targetSchedule: 'morning' | 'midday' | 'evening' | null = null;
    let scheduleTriggered = false;
    let scheduleMessage = '';

    // Check if current time is within a 10-minute window of the check-in time
    // 10:00 AM to 10:10 AM IST
    if (istHour === 10 && istMinute >= 0 && istMinute < 10) {
      targetSchedule = 'morning';
    }
    // 1:00 PM to 1:10 PM IST
    else if (istHour === 13 && istMinute >= 0 && istMinute < 10) {
      targetSchedule = 'midday';
    }
    // 6:00 PM to 6:10 PM IST
    else if (istHour === 18 && istMinute >= 0 && istMinute < 10) {
      targetSchedule = 'evening';
    }

    if (targetSchedule) {
      try {
        const requestUrl = new URL(request.url);
        const origin = requestUrl.origin;
        console.log(`[check-timeouts] Triggering check-in send for ${targetSchedule} at ${origin}`);
        
        const sendRes = await fetch(`${origin}/api/status-requests/send?schedule=${targetSchedule}`);
        const sendData = await sendRes.json();
        scheduleTriggered = true;
        scheduleMessage = sendData.message || 'Triggered check-in API';
      } catch (err: any) {
        console.error(`[check-timeouts] Failed to trigger check-in API:`, err);
        scheduleMessage = `Error: ${err.message}`;
      }
    }

    return NextResponse.json({
      success: true,
      expiredCount,
      tasksReminderSent,
      remindersLogged,
      scheduleCheck: {
        triggered: scheduleTriggered,
        schedule: targetSchedule,
        message: scheduleMessage
      }
    });

  } catch (error: any) {
    console.error('[status-requests/check-timeouts] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
