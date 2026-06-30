import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date'); // YYYY-MM-DD

    // Default to today (IST)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = dateParam || istNow.toISOString().split('T')[0];

    const dayStart = `${todayIST}T00:00:00+05:30`;
    const dayEnd = `${todayIST}T23:59:59+05:30`;

    const { data, error } = await supabase
      .from('status_requests')
      .select('*')
      .gte('scheduled_time', dayStart)
      .lte('scheduled_time', dayEnd)
      .order('scheduled_time', { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      date: todayIST,
      requests: data || [],
    });
  } catch (error: any) {
    console.error('[status-requests] Error fetching:', error);
    return NextResponse.json({ error: error?.message || 'Failed to fetch status requests' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing status request id' }, { status: 400 });
    }

    const { error } = await supabase
      .from('status_requests')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[status-requests] Error deleting:', error);
    return NextResponse.json({ error: error?.message || 'Failed to delete status request' }, { status: 500 });
  }
}
