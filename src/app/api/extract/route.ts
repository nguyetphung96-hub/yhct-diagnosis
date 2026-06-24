/**
 * API Route: POST /api/extract
 * Bước 1 & 2: Trích xuất triệu chứng + tạo câu hỏi Level 1
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { extractSymptoms, generateFeatureQuestions } from '@/lib/openai';
import { ExtractRequest, ExtractResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: ExtractRequest = await req.json();
    const { clinical_text } = body;

    if (!clinical_text?.trim()) {
      return NextResponse.json(
        { error: 'Vui lòng nhập mô tả lâm sàng' },
        { status: 400 }
      );
    }

    // Lấy danh sách triệu chứng chuẩn từ KB để cung cấp cho LLM
    const allRows = await getAllKnowledge();
    const knownSymptoms = [...new Set(allRows.map(r => r.symptom))];

    // Bước 1: Trích xuất và chuẩn hóa triệu chứng
    const extractedRaw = await extractSymptoms(clinical_text, knownSymptoms);

    if (extractedRaw.length === 0) {
      return NextResponse.json(
        { error: 'Không trích xuất được triệu chứng. Vui lòng mô tả chi tiết hơn.' },
        { status: 422 }
      );
    }

    // Kiểm tra found_in_kb phía server (không dựa vào LLM) để tránh sai sót
    const knownSet = new Set(knownSymptoms.map(s => s.toLowerCase().trim()));
    const extracted = extractedRaw.map(s => ({
      ...s,
      found_in_kb: knownSet.has(s.normalized.toLowerCase().trim()),
    }));

    // Bước 2: Với mỗi triệu chứng tìm thấy trong KB, tạo câu hỏi về đặc điểm
    const featureQuestions = [];

    for (const symptom of extracted.filter(s => s.found_in_kb)) {
      // Tìm các đặc điểm cần hỏi của triệu chứng này trong KB
      const relevantRows = allRows.filter(
        r =>
          r.symptom.toLowerCase() === symptom.normalized.toLowerCase() &&
          r.feature &&
          r.feature.trim() !== ''
      );

      if (relevantRows.length === 0) continue;

      // Thu thập tất cả đặc điểm duy nhất cần hỏi
      const allFeatures = relevantRows
        .flatMap(r => r.feature!.split(';').map(f => f.trim()))
        .filter(Boolean);
      const uniqueFeatures = [...new Set(allFeatures)];

      if (uniqueFeatures.length > 0) {
        const question = await generateFeatureQuestions(
          symptom.normalized,
          uniqueFeatures
        );
        featureQuestions.push(question);
      }
    }

    const response: ExtractResponse = {
      extracted_symptoms: extracted,
      feature_questions: featureQuestions,
      message: `Đã trích xuất ${extracted.length} triệu chứng, ${extracted.filter(s => s.found_in_kb).length} khớp với cơ sở tri thức.`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[/api/extract] Error:', error);
    return NextResponse.json(
      { error: 'Lỗi hệ thống. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
