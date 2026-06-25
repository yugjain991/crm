import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  console.log('[whatsapp webhook GET] incoming params:', { mode, token, challenge });

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'rd_3FWejpxocF2rjWq8z9ve1jKCq2z';

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[whatsapp webhook] Verification successful');
      return new Response(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    } else {
      console.warn('[whatsapp webhook] Verification failed');
      return new Response('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }
  return new Response('Bad Request', {
    status: 400,
    headers: { 'Content-Type': 'text/plain' }
  });
}

async function saveMessageToDB(from: string, employeeName: string, text: string, type: 'inbound' | 'outbound') {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'whatsapp_messages')
      .single();

    // Ignore PGRST116 (not found)
    const messages = (data?.data) || [];
    messages.push({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      from,
      employeeName,
      text,
      timestamp: new Date().toISOString(),
      type
    });

    await supabase
      .from('app_data')
      .upsert({ key: 'whatsapp_messages', data: messages });
  } catch (err) {
    console.error("[whatsapp webhook] Failed to save message to Supabase", err);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    console.log('[whatsapp webhook] Payload received:', JSON.stringify(payload, null, 2));

    // Extract message data
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const from = message.from; 
    const textBody = message.text?.body?.trim();

    if (!from || !textBody) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    console.log(`[whatsapp webhook] Inbound from ${from}: "${textBody}"`);

    // Fetch documents from Supabase
    const { data: docData } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'documents')
      .single();

    const documents = docData?.data || [];
    const cleanFrom = from.replace(/\D/g, ''); 

    // Find employee
    const employee = documents.find((doc: any) => {
      if (doc.type !== 'employee') return false;
      const phone = doc.fields?.phone;
      if (!phone) return false;
      const cleanPhone = phone.replace(/\D/g, '');
      return cleanPhone.includes(cleanFrom) || cleanFrom.includes(cleanPhone);
    });

    const employeeName = employee?.fields?.name || employee?.title || "Unknown User";

    // Save INBOUND message
    await saveMessageToDB(from, employeeName, textBody, 'inbound');

    if (!employee) {
      console.log(`[whatsapp webhook] Phone number ${from} not associated with any employee. Responding as generic AI.`);
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
          const prompt = `You are Enxt Brain, an AI assistant for Enxt. You are talking to a user whose phone number is not recognized in the employee database.
The user sent you this message: "${textBody}"
Reply to them in a helpful, professional, and concise manner. Let them know you are the Enxt Brain AI assistant.`;

          const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
          });
          
          const payload = await apiResponse.json();
          const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (answer) {
             await replyToWhatsApp(from, employeeName, answer);
             return NextResponse.json({ success: true }, { status: 200 });
          }
        } catch (error) { console.error('[whatsapp webhook] Error calling Gemini:', error); }
      }

      await replyToWhatsApp(from, employeeName, `Hi! I am Enxt Brain. Your phone number is not currently associated with any employee record in our system.`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    console.log(`[whatsapp webhook] Matched employee: ${employeeName}`);

    // Load tasks from Supabase
    let employeeTasks: any[] = [];
    try {
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .contains('assigned_employee_ids', [employee.id]);
        
      if (tasksData) {
        employeeTasks = tasksData;
      }
    } catch (e) {
      console.warn("[whatsapp webhook] Could not load tasks from Supabase", e);
    }

    const lowerText = textBody.toLowerCase();
    let newStatus: 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | null = null;

    if (/\b(completed|done|complete|finished|check)\b/i.test(lowerText)) {
      newStatus = 'Completed';
    } else if (/\b(in progress|progress|started|doing|run)\b/i.test(lowerText)) {
      newStatus = 'In Progress';
    } else if (/\b(pending|todo|hold|wait)\b/i.test(lowerText)) {
      newStatus = 'Pending';
    } else if (/\b(blocked|stuck|stop|cannot)\b/i.test(lowerText)) {
      newStatus = 'Blocked';
    }

    if (!newStatus) {
      console.log(`[whatsapp webhook] No status match in text "${textBody}". Forwarding to AI chatbot.`);
      const apiKey = process.env.GEMINI_API_KEY;
      if (apiKey) {
        try {
          const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
          const tasksContext = employeeTasks.length > 0 
            ? employeeTasks.map((t: any) => `- ${t.title} (Status: ${t.status})`).join('\n') 
            : 'No active tasks.';
            
          const prompt = `You are Enxt Brain, an AI assistant for Enxt. You are talking to an employee named ${employeeName}. 
Their current tasks are:
${tasksContext}

The employee sent you this message: "${textBody}"
Reply to them in a helpful, professional, and concise manner. If they are asking about their tasks, help them. If they want to update a task status, let them know they can reply with 'Completed', 'In Progress', 'Blocked', or 'Pending'.`;

          const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: "POST",
            headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
          });
          
          const payload = await apiResponse.json();
          const answer = payload.candidates?.[0]?.content?.parts?.[0]?.text;
          
          if (answer) {
             await replyToWhatsApp(from, employeeName, answer);
             return NextResponse.json({ success: true }, { status: 200 });
          }
        } catch (error) { console.error('[whatsapp webhook] Error calling Gemini:', error); }
      }
      
      await replyToWhatsApp(from, employeeName, `Hi ${employeeName}! I couldn't understand that command. Please reply with one of these keywords to update your task status:\n\n- *Completed* (or Done)\n- *In Progress*\n- *Blocked*\n- *Pending*`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (employeeTasks.length === 0) {
      await replyToWhatsApp(from, employeeName, `You have no tasks assigned to you right now.`);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    let taskToUpdate = employeeTasks.find((t: any) => {
      const words = t.title.toLowerCase().split(/\s+/);
      return words.some((word: string) => word.length > 2 && lowerText.includes(word));
    });

    if (!taskToUpdate) {
      taskToUpdate = employeeTasks.find((t: any) => t.status !== 'Completed') || employeeTasks[employeeTasks.length - 1];
    }

    if (taskToUpdate) {
      const oldStatus = taskToUpdate.status;
      
      // Save tasks to Supabase
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', taskToUpdate.id);
        
      if (updateError) {
        console.error("[whatsapp webhook] Failed to update task in Supabase", updateError);
      } else {
        console.log(`[whatsapp webhook] Updated task "${taskToUpdate.title}" from ${oldStatus} to ${newStatus}`);
      }

      let statusIcon = '⏳';
      if (newStatus === 'Completed') statusIcon = '✅';
      if (newStatus === 'In Progress') statusIcon = '⚡';
      if (newStatus === 'Blocked') statusIcon = '🛑';

      const replyMsg = `Task status updated successfully!\n\n📋 *Task:* ${taskToUpdate.title}\n${statusIcon} *New Status:* ${newStatus}`;
      await replyToWhatsApp(from, employeeName, replyMsg);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[whatsapp webhook] Error handling POST request:', error);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

async function replyToWhatsApp(to: string, employeeName: string, message: string) {
  // Save OUTBOUND message first
  await saveMessageToDB(to, employeeName, message, 'outbound');

  const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';

  if (!token || !phoneId || token.includes('your_meta_access_token')) {
    console.warn('[whatsapp webhook] Meta API credentials missing, skipping reply dispatch.');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }),
    });
    const data = await res.json();
    console.log('[whatsapp webhook] Dispatch reply response:', data);
  } catch (err) {
    console.error('[whatsapp webhook] Dispatch reply request failed:', err);
  }
}
