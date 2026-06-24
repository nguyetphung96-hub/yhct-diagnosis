/**
 * API Route: POST /api/reason
 * Bước 3–6: Tính điểm, chọn hội chứng tối ưu, tạo câu hỏi disambiguation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { runReasoning, parseRawAnswerToFeatures } from '@/lib/reasoning';
import { ReasonRequest, ReasonResponse, DisambiguationQuestion } from '@/types';

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

    // Reasoning Engine: parse raw_answer → observed_features (KHÔNG dùng LLM)
    // Theo Bảng 2.1: "So khớp đặc điểm" thuộc Reasoning engine, không phải LLM
    const normalizedAnswers = feature_answers.map(fa => {
      if (fa.raw_answer && fa.observed_features.length === 0) {
        // Lấy danh sách đặc điểm từ KB cho triệu chứng này
        const relevantRows = allRows.filter(
          r => r.symptom.toLowerCase() === fa.symptom.toLowerCase() && r.feature
        );
        const knownFeatures = [
          ...new Set(
            relevantRows.flatMap(r => r.feature!.split(';').map(f => f.trim())).filter(Boolean)
          ),
        ];
        // Reasoning: so khớp chuỗi (không gọi LLM)
        const confirmedFeatures = parseRawAnswerToFeatures(fa.raw_answer, knownFeatures);
        return { ...fa, observed_features: confirmedFeatures };
      }
      return fa;
    });

    // Chạy Reasoning Engine (Bước 3–5)
    const result = await runReasoning(symptoms, normalizedAnswers, allRows);

    // Bước 6: Tạo câu hỏi disambiguation bằng template (không dùng LLM để tránh timeout)
    // Reasoning engine đã chọn triệu chứng phân biệt; template đủ để hỏi bác sĩ
    const disambiguationQuestions: DisambiguationQuestion[] = result.has_overlap
      ? result.discriminating_symptoms.map(symptom => ({
          symptom,
          question: `Bệnh nhân có biểu hiện "${symptom}" không?`,
          related_syndromes: result.optimal_syndromes.map(s => s.syndrome),
        }))
      : [];

    // Giải thích tự nhiên được sinh ở finalize route (tránh timeout Vercel 10s)
    const response: ReasonResponse = {
      result,
      disambiguation_questions: disambiguationQuestions,
      explanation_narrative: '',
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
