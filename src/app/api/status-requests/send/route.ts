import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

type Schedule = 'morning' | 'midday' | 'evening';

const GREETINGS: Record<Schedule, string> = {
  morning: 'Good Morning',
  midday: 'Good Afternoon',
  evening: 'Good Evening',
};

const SCHEDULE_TIMES: Record<Schedule, string> = {
  morning: '10:00',
  midday: '13:00',
  evening: '18:00',
};

function detectSchedule(): Schedule {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istHour = new Date(now.getTime() + istOffset).getUTCHours();

  if (istHour < 11) return 'morning';
  if (istHour < 16) return 'midday';
  return 'evening';
}

function buildStatusMessage(employeeName: string, schedule: Schedule, project: string): string {
  const greeting = GREETINGS[schedule];
  const projectLine = project ? `\n📂 *Project:* ${project}` : '';

  return (
    `${greeting} ${employeeName} 👋\n\n` +
    `Please provide your current project status.${projectLine}\n\n` +
    `⏰ Kindly reply within the next *30 minutes*.\n\n` +
    `📊 Your update will automatically be shared with your manager.`
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scheduleParam = url.searchParams.get('schedule') as Schedule | null;
    const schedule: Schedule = scheduleParam && ['morning', 'midday', 'evening'].includes(scheduleParam)
      ? scheduleParam
      : detectSchedule();

    console.log(`[status-requests/send] Sending ${schedule} status requests...`);

    // Load employees from Supabase
    const { data: docData } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'documents')
      .single();

    const documents = docData?.data || [];
    const activeEmployees = documents.filter((doc: any) =>
      doc.type === 'employee' &&
      String(doc.fields?.status || '').toLowerCase() === 'active' &&
      doc.fields?.phone
    );

    if (activeEmployees.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No active employees with phone numbers found.',
        sent: 0,
      });
    }

    // Load tasks to find assigned projects
    const { data: tasksData } = await supabase.from('tasks').select('*');
    const tasks = tasksData || [];

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0];
    const scheduledTime = `${todayIST}T${SCHEDULE_TIMES[schedule]}:00+05:30`;

    const force = url.searchParams.get('force') === 'true';

    // Check if requests for this schedule today already exist
    if (!force) {
      const { data: existing } = await supabase
        .from('status_requests')
        .select('id')
        .eq('schedule_label', schedule)
        .gte('scheduled_time', `${todayIST}T00:00:00+05:30`)
        .lte('scheduled_time', `${todayIST}T23:59:59+05:30`);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          message: `Status requests for ${schedule} today have already been sent.`,
          sent: 0,
          alreadySent: existing.length,
        });
      }
    }

    let sentCount = 0;
    let failedCount = 0;
    const replyDeadline = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

    for (const emp of activeEmployees) {
      const empName = emp.fields?.name || emp.title || 'Team Member';
      const empPhone = emp.fields?.phone || '';
      const department = emp.fields?.department || emp.fields?.role || '';

      // Find active project for this employee
      const empTask = tasks.find((t: any) =>
        t.status !== 'Completed' &&
        (t.assigned_employee_ids || []).includes(emp.id)
      );

      if (!empTask) {
        continue;
      }

      const project = empTask.title || '';

      const requestId = `sr-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // 1. Insert status request row
      const { error: insertError } = await supabase
        .from('status_requests')
        .insert({
          id: requestId,
          employee_id: emp.id,
          employee_name: empName,
          employee_phone: empPhone.replace(/\D/g, ''),
          project,
          department,
          schedule_label: schedule,
          scheduled_time: scheduledTime,
          sent_at: now.toISOString(),
          reply_deadline: replyDeadline,
          status: 'sent',
        });

      if (insertError) {
        console.error(`[status-requests/send] Failed to insert request for ${empName}:`, insertError);
        failedCount++;
        continue;
      }

      // 2. Send WhatsApp message
      const message = buildStatusMessage(empName, schedule, project);
      try {
        const sendRes = await fetch(new URL('/api/whatsapp/send', request.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: empPhone, body: message }),
        });

        if (sendRes.ok) {
          sentCount++;
          console.log(`[status-requests/send] ✓ Sent to ${empName} (${empPhone})`);
        } else {
          failedCount++;
          console.error(`[status-requests/send] ✗ Failed to send to ${empName}`);
        }
      } catch (err) {
        failedCount++;
        console.error(`[status-requests/send] ✗ Error sending to ${empName}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      schedule,
      sent: sentCount,
      failed: failedCount,
      total: activeEmployees.length,
    });
  } catch (error: any) {
    console.error('[status-requests/send] Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 });
  }
}
