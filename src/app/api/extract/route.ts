/**
 * API Route: POST /api/extract
 *
 * BƯỚC 1 — Trích xuất và chuẩn hóa triệu chứng (LLM)
 *   Input : văn bản lâm sàng tự do
 *   Output: danh sách triệu chứng đã chuẩn hóa về canonical KB name
 *
 * BƯỚC 2 — Tạo câu hỏi đặc điểm Level 1 (LLM)
 *   Với mỗi triệu chứng found_in_kb:
 *     - Lấy tất cả đặc điểm (feature) từ KB (qua tất cả hội chứng)
 *     - LLM sinh câu hỏi tự nhiên để bác sĩ xác nhận đặc điểm
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllKnowledge } from '@/lib/supabase';
import { symptomsMatch } from '@/lib/reasoning';
import { extractSymptoms, generateFeatureQuestions } from '@/lib/openai';
import { ExtractRequest, ExtractResponse } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: ExtractRequest = await req.json();
    const { clinical_text } = body;

    if (!clinical_text?.trim()) {
      return NextResponse.json({ error: 'Vui lòng nhập mô tả lâm sàng' }, { status: 400 });
    }

    // Lấy toàn bộ KB
    const allRows = await getAllKnowledge();

    // Danh sách canonical symptom names từ KB (duy nhất)
    const knownSymptoms = [...new Set(allRows.map(r => r.symptom))];

    // Build synonym map: canonical name → synonym string
    const synonymMap = new Map<string, string | null>();
    for (const row of allRows) {
      if (!synonymMap.has(row.symptom)) {
        synonymMap.set(row.symptom, row.synonym);
      }
    }

    // ── BƯỚC 1: LLM trích xuất và chuẩn hóa triệu chứng ─────────────────────
    // LLM nhận danh sách knownSymptoms để chuẩn hóa về tên KB
    const extractedRaw = await extractSymptoms(clinical_text, knownSymptoms);

    if (extractedRaw.length === 0) {
      return NextResponse.json(
        { error: 'Không trích xuất được triệu chứng. Vui lòng mô tả chi tiết hơn.' },
        { status: 422 }
      );
    }

    // ── Server-side canonicalization ──────────────────────────────────────────
    // LLM đôi khi trả về synonym thay vì canonical name
    // VD: "Đổ mồ hôi trộm" thay vì "Triều nhiệt đạo hãn"
    // Dùng symptomsMatch (kể cả synonym) để:
    //   1. Tìm canonical KB name khớp với tên LLM trả về
    //   2. Ghi đè normalized = canonical name để reasoning dùng đúng key
    //   3. found_in_kb chính xác hơn (không chỉ exact match)
    const extracted = extractedRaw.map(s => {
      const canonicalMatch = knownSymptoms.find(ks =>
        symptomsMatch(s.normalized, ks, synonymMap.get(ks) ?? null)
      );
      return {
        ...s,
        normalized: canonicalMatch ?? s.normalized,
        found_in_kb: !!canonicalMatch,
      };
    });

    // ── BƯỚC 2: Tạo câu hỏi đặc điểm Level 1 ────────────────────────────────
    // Chỉ hỏi với triệu chứng tìm thấy trong KB
    const featureQuestions = [];

    for (const symptom of extracted.filter(s => s.found_in_kb)) {
      // Lấy tất cả đặc điểm của triệu chứng này trong KB (qua tất cả hội chứng)
      const relevantRows = allRows.filter(
        r => r.symptom === symptom.normalized && r.feature && r.feature.trim() !== ''
      );

      if (relevantRows.length === 0) continue; // triệu chứng không có đặc điểm

      // Thu thập đặc điểm duy nhất
      const allFeatures = [
        ...new Set(
          relevantRows
            .flatMap(r => r.feature!.split(/[;,]/).map(f => f.trim()))
            .filter(f => f.length >= 2)
        ),
      ];

      if (allFeatures.length > 0) {
        const question = await generateFeatureQuestions(symptom.normalized, allFeatures);
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
    return NextResponse.json({ error: 'Lỗi hệ thống. Vui lòng thử lại.' }, { status: 500 });
  }
}
