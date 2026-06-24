import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase";
import { brainDocuments } from "../../../lib/demo-documents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('data')
      .eq('key', 'documents')
      .single();

    if (error) {
      // PGRST116 means no rows found (single() expects exactly 1 row)
      if (error.code === 'PGRST116') {
        // Initialize with mock data
        await supabase
          .from('app_data')
          .insert({ key: 'documents', data: brainDocuments });
        return NextResponse.json(brainDocuments);
      }
      throw error;
    }

    return NextResponse.json(data.data);
  } catch (error) {
    console.error("Failed to read documents from Supabase:", error);
    return NextResponse.json({ error: "Failed to read documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const documents = await request.json();
    
    const { error } = await supabase
      .from('app_data')
      .upsert({ key: 'documents', data: documents });
      
    if (error) throw error;
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save documents to Supabase:", error);
    return NextResponse.json({ error: "Failed to save documents" }, { status: 500 });
  }
}
