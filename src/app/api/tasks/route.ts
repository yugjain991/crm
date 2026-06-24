import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Blocked';

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string; // ISO date string
  status: TaskStatus;
  assignedEmployeeIds: string[]; // supports multiple assignees
}

// Helper to map DB row to TS Task object
function mapRowToTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.due_date,
    status: row.status as TaskStatus,
    assignedEmployeeIds: row.assigned_employee_ids || [],
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const employeeId = url.searchParams.get('employeeId');
  
  try {
    let query = supabase.from('tasks').select('*');
    
    // If we only want tasks for a specific employee
    if (employeeId) {
      // Supabase supports querying arrays using the 'cs' (contains) operator
      query = query.contains('assigned_employee_ids', [employeeId]);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    
    return NextResponse.json(data.map(mapRowToTask));
  } catch (error) {
    console.error("Failed to fetch tasks from Supabase:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, description, dueDate, assignedEmployeeIds, status } = body;

    // Normalise: accept old single-id payload too
    let ids: string[] = [];
    if (Array.isArray(assignedEmployeeIds)) {
      ids = assignedEmployeeIds;
    } else if (body.assignedEmployeeId) {
      ids = [body.assignedEmployeeId];
    }

    const newTask = {
      id: `task-${Date.now()}`,
      title,
      description,
      due_date: dueDate,
      status: status || 'Pending',
      assigned_employee_ids: ids,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(newTask)
      .select()
      .single();

    if (error) throw error;
    
    return NextResponse.json(mapRowToTask(data));
  } catch (error) {
    console.error("Failed to create task in Supabase:", error);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, updates } = await request.json();
    
    const dbUpdates: any = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.assignedEmployeeIds !== undefined) dbUpdates.assigned_employee_ids = updates.assignedEmployeeIds;

    const { data, error } = await supabase
      .from('tasks')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return new Response('Task not found', { status: 404 });
      }
      throw error;
    }

    return NextResponse.json(mapRowToTask(data));
  } catch (error) {
    console.error("Failed to update task in Supabase:", error);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task in Supabase:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
