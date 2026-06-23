/**
 * API Route: POST /api/reason
 * Bước 3–6: Tính điểm, chọn hội chứng tối ưu, tạo câu hỏi disambiguation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { generateDisambiguationQuestions, generateExplanationNarrative, normalizeFeatureAnswer } from '@/lib/openai';
import { runReasoning } from '@/lib/reasoning';
import { ReasonRequest, ReasonResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: ReasonRequest = await req.json();
    const { symptoms, feature_answers } = body;

    if (!symptoms || symptoms.length === 0) {
      return NextResponse.json(
        { error: 'Danh sách triệu chứng trống' },
        { status: 400 }
      );
    }

    // Lấy toàn bộ KB
    const allRows = await getAllKnowledge();

    // Chuẩn hóa câu trả lời đặc điểm qua LLM (nếu có raw_answer)
    const normalizedAnswers = await Promise.all(
      feature_answers.map(async fa => {
        if (fa.raw_answer && fa.observed_features.length === 0) {
          // Tìm các đặc điểm cần khớp của triệu chứng này
          const relevantRows = allRows.filter(
            r => r.symptom.toLowerCase() === fa.symptom.toLowerCase() && r.feature
          );
          const featuresToMatch = [
            ...new Set(
              relevantRows.flatMap(r => r.feature!.split(';').map(f => f.trim())).filter(Boolean)
            ),
          ];

          const confirmed = await normalizeFeatureAnswer(
            fa.symptom,
            fa.raw_answer,
            featuresToMatch
          );
          return { ...fa, observed_features: confirmed };
        }
        return fa;
      })
    );

    // Chạy Reasoning Engine (Bước 3–5)
    const result = await runReasoning(symptoms, normalizedAnswers, allRows);

    // Bước 6: Tạo câu hỏi disambiguation nếu có chồng lấp
    let disambiguationQuestions: DisambiguationQuestion[] = [];
    if (result.has_overlap && result.discriminating_symptoms.length > 0) {
      disambiguationQuestions = await generateDisambiguationQuestions(
        result.discriminating_symptoms,
        result.optimal_syndromes.map(s => s.syndrome)
      );
    }

    // Tạo giải thích tự nhiên (chỉ nếu là kết quả cuối)
    let explanation_narrative = '';
    if (result.is_final && result.optimal_syndromes.length > 0) {
      explanation_narrative = await generateExplanationNarrative(
        result.optimal_syndromes,
        normalizedAnswers
      );
    }

    const response: ReasonResponse = {
      result,
      disambiguation_questions: disambiguationQuestions,
      explanation_narrative,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/reason] Error:', error);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi suy luận. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
