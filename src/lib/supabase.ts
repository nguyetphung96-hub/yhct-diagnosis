import { createClient } from '@supabase/supabase-js';
import { KnowledgeRow } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Dùng service role key ở server-side để bypass RLS
export const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// Hàm truy vấn cơ sở tri thức
// ============================================================

// Cache KB trong memory để tránh query lại 1577 rows mỗi request (giảm ~2-3s/call)
let _kbCache: KnowledgeRow[] | null = null;
let _kbCacheTime = 0;
const KB_CACHE_TTL = 10 * 60 * 1000; // 10 phút

/** Lấy toàn bộ cơ sở tri thức (có cache memory) */
export async function getAllKnowledge(): Promise<KnowledgeRow[]> {
  const now = Date.now();
  if (_kbCache && now - _kbCacheTime < KB_CACHE_TTL) {
    return _kbCache;
  }

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .order('syndrome')
    .order('symptom');

  if (error) throw new Error(`Lỗi truy vấn KB: ${error.message}`);
  _kbCache = data as KnowledgeRow[];
  _kbCacheTime = now;
  return _kbCache;
}

/** Tìm các hàng tri thức liên quan đến danh sách triệu chứng */
export async function getKnowledgeForSymptoms(
  symptoms: string[]
): Promise<KnowledgeRow[]> {
  if (symptoms.length === 0) return [];

  // Tạo điều kiện tìm kiếm: khớp symptom hoặc synonym
  const conditions = symptoms
    .map(s => `symptom.ilike.%${s}%,synonym.ilike.%${s}%`)
    .join(',');

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .or(conditions);

  if (error) throw new Error(`Lỗi truy vấn KB theo triệu chứng: ${error.message}`);
  return data as KnowledgeRow[];
}

/** Tìm kiếm full-text trong cơ sở tri thức */
export async function searchKnowledge(query: string): Promise<KnowledgeRow[]> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .or(
      `symptom.ilike.%${query}%,synonym.ilike.%${query}%,syndrome.ilike.%${query}%`
    )
    .limit(50);

  if (error) throw new Error(`Lỗi tìm kiếm KB: ${error.message}`);
  return data as KnowledgeRow[];
}

/** Lấy danh sách tất cả hội chứng */
export async function getAllSyndromes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('syndrome')
    .order('syndrome');

  if (error) throw new Error(`Lỗi lấy danh sách hội chứng: ${error.message}`);

  const syndromes = [...new Set((data as { syndrome: string }[]).map(r => r.syndrome))];
  return syndromes;
}

/** Lấy tất cả hàng tri thức của một hội chứng */
export async function getKnowledgeBySyndrome(
  syndrome: string
): Promise<KnowledgeRow[]> {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('syndrome', syndrome);

  if (error) throw new Error(`Lỗi lấy KB theo hội chứng: ${error.message}`);
  return data as KnowledgeRow[];
}
