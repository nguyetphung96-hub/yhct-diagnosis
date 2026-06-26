/**
 * API Route: POST /api/reason
 *
 * BƯỚC 3 → 6: Chạy Reasoning Engine
 *
 * Luồng:
 *   1. Parse raw_answer → observed_features (không dùng LLM, chỉ so khớp chuỗi)
 *   2. Tính điểm hội chứng (Bước 3 & 4)
 *   3. Chọn tập hội chứng tối ưu K (Bước 5 — Greedy Set Cover)
 *   4. Tìm triệu chứng phân biệt nếu K có chồng lấp (Bước 6)
 *   5. Trả về kết quả + câu hỏi disambiguation Level 2 (nếu cần)
 *   6. Trả về processed_feature_answers để client lưu lại
 *      (finalize sẽ dùng lại, tránh parse lại từ raw_answer)
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
      return NextResponse.json({ error: 'Danh sách triệu chứng trống' }, { status: 400 });
    }

    // Lấy toàn bộ KB
    const allRows = await getAllKnowledge();

    // ── Parse raw_answer → observed_features ─────────────────────────────────
    // feature_answers từ client có raw_answer (text bác sĩ nhập) và observed_features = []
    // Dùng so khớp chuỗi với danh sách đặc điểm từ KB (không dùng LLM)
    const processedAnswers = feature_answers.map(fa => {
      // Nếu đã có observed_features (từ lần reason trước) → dùng luôn
      if (fa.observed_features.length > 0) return fa;
      // Nếu bác sĩ không nhập gì → observed_features = []
      if (!fa.raw_answer || !fa.raw_answer.trim()) return fa;

      // Lấy tất cả đặc điểm từ KB cho triệu chứng này
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

    // ── Bước 3 → 6: Chạy Reasoning Engine ───────────────────────────────────
    const result = await runReasoning(symptoms, processedAnswers, allRows);

    // ── Bước 6: Sinh câu hỏi phân biệt (template, không dùng LLM) ────────────
    // hasOverlap = true → cần hỏi thêm để phân biệt các hội chứng trong K
    const disambiguationQuestions: DisambiguationQuestion[] = result.has_overlap
      ? result.discriminating_symptoms.map(symptom => ({
          symptom,
          question: `Bệnh nhân có biểu hiện "${symptom}" không?`,
          related_syndromes: result.optimal_syndromes.map(s => s.syndrome),
        }))
      : [];

    const response: ReasonResponse = {
      result,
      disambiguation_questions: disambiguationQuestions,
      explanation_narrative: '',
      // Trả về feature_answers đã parse để client lưu lại vào state
      // → finalize sẽ nhận observed_features đã có, không cần parse lại
      processed_feature_answers: processedAnswers,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/reason] Error:', error);
    return NextResponse.json({ error: 'Lỗi hệ thống khi suy luận. Vui lòng thử lại.' }, { status: 500 });
  }
}
