import OpenAI from 'openai';
import { ExtractedSymptom, FeatureQuestion, SymptomFeatures, DisambiguationQuestion, SyndromeStat } from '@/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  fetch: globalThis.fetch, // Dùng native fetch của Node.js 18+ thay vì node-fetch
});

const MODEL = 'gpt-4o-mini'; // Nhanh hơn và ổn định hơn gpt-4o

export async function extractSymptoms(
  clinicalText: string,
  knownSymptoms: string[]
): Promise<ExtractedSymptom[]> {
  const knownList = knownSymptoms.slice(0, 200).join(', ');

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    max_tokens: 800,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Bạn là chuyên gia Y học cổ truyền (YHCT). Nhiệm vụ: trích xuất triệu chứng từ mô tả lâm sàng và chuẩn hóa sang thuật ngữ YHCT chuẩn.

Danh sách thuật ngữ chuẩn trong hệ thống:
${knownList}

Quy tắc:
1. Chỉ trích xuất các triệu chứng, dấu hiệu lâm sàng thực sự
2. Ánh xạ sang tên chuẩn trong danh sách nếu có thể
3. Nếu không có trong danh sách, giữ nguyên tên chuẩn YHCT
4. KHÔNG bịa thêm triệu chứng không có trong văn bản

Trả về JSON: { "symptoms": [{ "original": "...", "normalized": "...", "found_in_kb": true/false }] }`,
      },
      {
        role: 'user',
        content: `Mô tả lâm sàng:\n"${clinicalText}"\n\nTrích xuất triệu chứng:`,
      },
    ],
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return parsed.symptoms as ExtractedSymptom[];
}

export async function generateFeatureQuestions(
  symptom: string,
  featuresToAsk: string[]
): Promise<FeatureQuestion> {
  if (featuresToAsk.length === 0) {
    return { symptom, features_to_ask: [], question: '' };
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Bạn là bác sĩ YHCT. Tạo câu hỏi lâm sàng tự nhiên để khai thác đặc điểm của một triệu chứng.
Câu hỏi phải ngắn gọn, rõ ràng, bằng tiếng Việt.
Trả về JSON: { "question": "câu hỏi..." }`,
      },
      {
        role: 'user',
        content: `Triệu chứng: ${symptom}\nĐặc điểm cần khai thác: ${featuresToAsk.join(', ')}\n\nTạo câu hỏi:`,
      },
    ],
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return {
    symptom,
    features_to_ask: featuresToAsk,
    question: parsed.question,
  };
}

export async function generateDisambiguationQuestions(
  discriminatingSymptoms: string[],
  competingSyndromes: string[]
): Promise<DisambiguationQuestion[]> {
  if (discriminatingSymptoms.length === 0) return [];

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Bạn là bác sĩ YHCT. Tạo câu hỏi để phân biệt các hội chứng chồng lấp nhau.
Trả về JSON: { "questions": [{ "symptom": "...", "question": "Bệnh nhân có ... không?", "related_syndromes": [...] }] }`,
      },
      {
        role: 'user',
        content: `Các hội chứng đang cạnh tranh: ${competingSyndromes.join(', ')}
Triệu chứng phân biệt cần hỏi: ${discriminatingSymptoms.join(', ')}

Tạo câu hỏi phân biệt:`,
      },
    ],
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return parsed.questions as DisambiguationQuestion[];
}

export async function generateExplanationNarrative(
  syndromes: SyndromeStat[],
  featureAnswers: SymptomFeatures[]
): Promise<string> {
  if (syndromes.length === 0) {
    return 'Chưa đủ triệu chứng để xác định hội chứng. Cần thu thập thêm thông tin lâm sàng.';
  }

  const topSyndrome = syndromes[0];
  const symptomSummary = topSyndrome.matched_symptoms
    .map(m => `• ${m.symptom}${m.feature ? ` (${m.feature})` : ''} → ${m.mechanism}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.4,
    max_tokens: 300,
    messages: [
      {
        role: 'system',
        content: `Bạn là bác sĩ YHCT. Viết đoạn giải thích chẩn đoán ngắn gọn cho đồng nghiệp. Không quá 120 từ. Bằng tiếng Việt.`,
      },
      {
        role: 'user',
        content: `Hội chứng chính: ${topSyndrome.syndrome} (điểm: ${(topSyndrome.score * 100).toFixed(0)}%)
${syndromes.length > 1 ? `Hội chứng kèm: ${syndromes.slice(1).map(s => s.syndrome).join(', ')}` : ''}

Chuỗi suy luận:
${symptomSummary}

Viết giải thích chẩn đoán:`,
      },
    ],
  });

  return response.choices[0].message.content || '';
}

export async function normalizeFeatureAnswer(
  symptom: string,
  rawAnswer: string,
  featuresToMatch: string[]
): Promise<string[]> {
  if (!rawAnswer.trim() || featuresToMatch.length === 0) return [];

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `Phân tích câu trả lời và xác định đặc điểm nào được xác nhận.
Trả về JSON: { "confirmed_features": ["đặc điểm 1", "đặc điểm 2"] }`,
      },
      {
        role: 'user',
        content: `Triệu chứng: ${symptom}
Các đặc điểm cần xác nhận: ${featuresToMatch.join(', ')}
Câu trả lời: "${rawAnswer}"

Đặc điểm nào được xác nhận?`,
      },
    ],
  });

  const content = response.choices[0].message.content || '{}';
  const parsed = JSON.parse(content);
  return parsed.confirmed_features as string[] || [];
}
