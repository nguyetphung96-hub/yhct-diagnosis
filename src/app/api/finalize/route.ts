/**
 * API Route: POST /api/finalize
 * Bước 7–8: Cập nhật sau disambiguation và xuất kết quả cuối
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { generateExplanationNarrative } from '@/lib/openai';
import { updateAndRereason } from '@/lib/reasoning';
import { FinalizeRequest, FinalizeResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: FinalizeRequest = await req.json();
    const { symptoms, feature_answers, confirmed_disambiguation } = body;

    if (!symptoms || symptoms.length === 0) {
      return NextResponse.json(
        { error: 'Danh sách triệu chứng trống' },
        { status: 400 }
      );
    }

    // Lấy toàn bộ KB
    const allRows = await getAllKnowledge();

    // Bước 7: Cập nhật và suy luận lại
    const result = await updateAndRereason(
      symptoms,
      feature_answers,
      confirmed_disambiguation,
      allRows
    );

    // Bước 8: Tạo giải thích tự nhiên
    const explanation_narrative = await generateExplanationNarrative(
      result.optimal_syndromes,
      feature_answers
    );

    const response: FinalizeResponse = {
      result,
      explanation_narrative,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/finalize] Error:', error);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi hoàn tất chẩn đoán. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
