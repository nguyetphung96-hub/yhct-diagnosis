/**
 * API Route: POST /api/finalize
 *
 * BƯỚC 7 — Cập nhật và suy luận lại sau câu hỏi phân biệt
 *   - Thêm triệu chứng bác sĩ xác nhận "Có" vào P
 *   - Chạy lại Reasoning Engine (Bước 3→6) với P đã cập nhật
 *   - Kết quả lần này là kết quả cuối (is_final = true)
 *
 * BƯỚC 8 — Sinh lời giải thích tự nhiên (LLM)
 *   - LLM tạo narrative từ chuỗi suy luận triệu chứng → cơ chế → hội chứng
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { updateAndRereason, parseRawAnswerToFeatures } from '@/lib/reasoning';
import { generateExplanationNarrative } from '@/lib/openai';
import { FinalizeRequest, FinalizeResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: FinalizeRequest = await req.json();
    const { symptoms, feature_answers, confirmed_disambiguation } = body;

    if (!symptoms || symptoms.length === 0) {
      return NextResponse.json({ error: 'Danh sách triệu chứng trống' }, { status: 400 });
    }

    // Lấy toàn bộ KB
    const allRows = await getAllKnowledge();

    // ── Đảm bảo feature_answers có observed_features đã parse ─────────────────
    // Client lưu processed_feature_answers từ reason route vào state
    // → observed_features.length > 0 → dùng luôn, không parse lại
    // Nếu client cũ gửi raw_answer chưa parse → parse lại (fallback an toàn)
    const processedAnswers = feature_answers.map(fa => {
      if (fa.observed_features.length > 0) return fa; // đã có rồi

      if (!fa.raw_answer || !fa.raw_answer.trim()) return fa; // không có thông tin

      const relevantRows = allRows.filter(
        r => r.symptom === fa.symptom && r.feature && r.feature.trim() !== ''
      );
      const knownFeatures = [
        ...new Set(
          relevantRows
            .flatMap(r => r.feature!.split(/[;,]/).map(f => f.trim()))
            .filter(f => f.length >= 2)
        ),
      ];

      const confirmedFeatures = parseRawAnswerToFeatures(fa.raw_answer, knownFeatures);
      return { ...fa, observed_features: confirmedFeatures };
    });

    // ── BƯỚC 7: Cập nhật P và suy luận lại ───────────────────────────────────
    const result = await updateAndRereason(
      symptoms,
      processedAnswers,
      confirmed_disambiguation,
      allRows
    );

    // ── BƯỚC 8: Sinh lời giải thích tự nhiên (LLM) ───────────────────────────
    const explanation_narrative = await generateExplanationNarrative(
      result.optimal_syndromes,
      processedAnswers
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
