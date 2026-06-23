'use client';

import { useState } from 'react';
import {
  AppState,
  ExtractedSymptom,
  FeatureQuestion,
  SymptomFeatures,
  DisambiguationQuestion,
  ReasoningResult,
  SyndromeStat,
} from '@/types';

// ============================================================
// Khởi tạo state ban đầu
// ============================================================
const initialState: AppState = {
  step: 1,
  clinical_text: '',
  extracted_symptoms: [],
  feature_questions: [],
  feature_answers: [],
  temp_syndromes: [],
  disambiguation_questions: [],
  disambiguation_answers: [],
  final_result: null,
  doctor_selected_syndromes: [],
  loading: false,
  error: null,
};

// ============================================================
// Component chính
// ============================================================
export default function DiagnosisApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [featureInputs, setFeatureInputs] = useState<Record<string, string>>({});
  const [disambiguationChecked, setDisambiguationChecked] = useState<Record<string, boolean>>({});

  const setLoading = (loading: boolean) =>
    setState(s => ({ ...s, loading, error: null }));
  const setError = (error: string) =>
    setState(s => ({ ...s, loading: false, error }));

  // ============================================================
  // Bước 1 → 2: Trích xuất triệu chứng
  // ============================================================
  const handleExtract = async () => {
    if (!state.clinical_text.trim()) {
      setError('Vui lòng nhập mô tả lâm sàng');
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinical_text: state.clinical_text }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi hệ thống');

      // Khởi tạo feature_answers trống
      const emptyAnswers: SymptomFeatures[] = data.feature_questions.map(
        (q: FeatureQuestion) => ({ symptom: q.symptom, observed_features: [], raw_answer: '' })
      );

      setState(s => ({
        ...s,
        step: 2,
        extracted_symptoms: data.extracted_symptoms,
        feature_questions: data.feature_questions,
        feature_answers: emptyAnswers,
        loading: false,
      }));
      setFeatureInputs({});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định');
    }
  };

  // ============================================================
  // Bước 2 → 3 hoặc 4: Reasoning sau khi trả lời Level 1
  // ============================================================
  const handleReason = async () => {
    setLoading(true);

    // Thu thập câu trả lời Level 1
    const answersWithRaw: SymptomFeatures[] = state.feature_questions.map(q => ({
      symptom: q.symptom,
      observed_features: [],
      raw_answer: featureInputs[q.symptom] || '',
    }));

    const symptoms = state.extracted_symptoms
      .filter(s => s.found_in_kb)
      .map(s => s.normalized);

    try {
      const res = await fetch('/api/reason', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, feature_answers: answersWithRaw }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi suy luận');

      if (data.result.is_final || data.disambiguation_questions.length === 0) {
        // Kết quả cuối ngay
        setState(s => ({
          ...s,
          step: 4,
          feature_answers: answersWithRaw,
          final_result: data.result,
          loading: false,
        }));
      } else {
        // Cần hỏi thêm Level 2
        setState(s => ({
          ...s,
          step: 3,
          feature_answers: answersWithRaw,
          temp_syndromes: data.result.optimal_syndromes,
          disambiguation_questions: data.disambiguation_questions,
          loading: false,
        }));
        setDisambiguationChecked({});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định');
    }
  };

  // ============================================================
  // Bước 3 → 4: Finalize sau disambiguation Level 2
  // ============================================================
  const handleFinalize = async () => {
    setLoading(true);

    const confirmedDisambiguation = state.disambiguation_questions
      .filter(q => disambiguationChecked[q.symptom])
      .map(q => q.symptom);

    const symptoms = state.extracted_symptoms
      .filter(s => s.found_in_kb)
      .map(s => s.normalized);

    try {
      const res = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms,
          feature_answers: state.feature_answers,
          confirmed_disambiguation: confirmedDisambiguation,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Lỗi hoàn tất chẩn đoán');

      setState(s => ({
        ...s,
        step: 4,
        final_result: data.result,
        disambiguation_answers: confirmedDisambiguation,
        loading: false,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi không xác định');
    }
  };

  // Reset toàn bộ
  const handleReset = () => {
    setState(initialState);
    setFeatureInputs({});
    setDisambiguationChecked({});
  };

  // ============================================================
  // Render UI
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50">
      {/* Header */}
      <header className="bg-white border-b border-teal-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow">
            <span className="text-white text-lg font-bold">Y</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 leading-tight">
              Hệ thống Hỗ trợ Chẩn đoán YHCT
            </h1>
            <p className="text-xs text-teal-600 font-medium">
              Dựa trên cơ sở tri thức kết hợp AI có khả năng giải thích
            </p>
          </div>
          {state.step > 1 && (
            <button
              onClick={handleReset}
              className="ml-auto text-sm text-gray-500 hover:text-teal-600 border border-gray-200 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              ↩ Bắt đầu lại
            </button>
          )}
        </div>
      </header>

      {/* Progress Steps */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <StepIndicator currentStep={state.step} />
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 pb-12 space-y-4">
        {/* Thông báo lỗi */}
        {state.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
            <span className="text-red-500 mt-0.5">⚠️</span>
            <span>{state.error}</span>
          </div>
        )}

        {/* === BƯỚC 1: Nhập mô tả lâm sàng === */}
        {state.step === 1 && (
          <Step1Input
            value={state.clinical_text}
            onChange={v => setState(s => ({ ...s, clinical_text: v }))}
            onSubmit={handleExtract}
            loading={state.loading}
          />
        )}

        {/* === BƯỚC 2: Triệu chứng + Câu hỏi Level 1 === */}
        {state.step === 2 && (
          <Step2FeatureQuestions
            symptoms={state.extracted_symptoms}
            questions={state.feature_questions}
            featureInputs={featureInputs}
            onInputChange={(symptom, val) =>
              setFeatureInputs(prev => ({ ...prev, [symptom]: val }))
            }
            onSubmit={handleReason}
            loading={state.loading}
          />
        )}

        {/* === BƯỚC 3: Disambiguation Level 2 === */}
        {state.step === 3 && (
          <Step3Disambiguation
            tempSyndromes={state.temp_syndromes}
            questions={state.disambiguation_questions}
            checked={disambiguationChecked}
            onCheck={(symptom, val) =>
              setDisambiguationChecked(prev => ({ ...prev, [symptom]: val }))
            }
            onSubmit={handleFinalize}
            loading={state.loading}
          />
        )}

        {/* === BƯỚC 4: Kết quả cuối === */}
        {state.step === 4 && state.final_result && (
          <Step4Results
            result={state.final_result}
            selectedSyndromes={state.doctor_selected_syndromes}
            onSelect={syndromes =>
              setState(s => ({ ...s, doctor_selected_syndromes: syndromes }))
            }
          />
        )}
      </main>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = [
    { n: 1, label: 'Mô tả lâm sàng' },
    { n: 2, label: 'Khai thác triệu chứng' },
    { n: 3, label: 'Phân biệt hội chứng' },
    { n: 4, label: 'Kết quả chẩn đoán' },
  ];

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => (
        <div key={step.n} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                currentStep > step.n
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : currentStep === step.n
                  ? 'bg-white border-teal-600 text-teal-600 shadow-md'
                  : 'bg-white border-gray-200 text-gray-400'
              }`}
            >
              {currentStep > step.n ? '✓' : step.n}
            </div>
            <span
              className={`text-xs mt-1 font-medium hidden sm:block ${
                currentStep === step.n
                  ? 'text-teal-600'
                  : currentStep > step.n
                  ? 'text-teal-500'
                  : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 flex-1 mx-1 transition-all ${
                currentStep > step.n ? 'bg-teal-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// --- Bước 1 ---
function Step1Input({
  value,
  onChange,
  onSubmit,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
            <span className="text-teal-700 text-sm">📋</span>
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            Nhập mô tả lâm sàng
          </h2>
        </div>

        <p className="text-sm text-gray-500 mb-3">
          Mô tả triệu chứng, dấu hiệu của bệnh nhân theo ngôn ngữ tự nhiên. Hệ thống sẽ
          tự động trích xuất và chuẩn hóa sang thuật ngữ YHCT.
        </p>

        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Ví dụ: Bệnh nhân nữ 45 tuổi, mất ngủ kéo dài 3 tháng, hay quên, hồi hộp, sắc mặt nhợt nhạt, đôi khi chóng mặt nhẹ, môi nhợt, mệt mỏi..."
          rows={5}
          className="w-full rounded-xl border border-gray-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 p-3 text-sm text-gray-800 placeholder-gray-400 outline-none resize-none transition"
        />

        <div className="mt-4 flex justify-end">
          <button
            onClick={onSubmit}
            disabled={loading || !value.trim()}
            className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner /> Đang phân tích...
              </>
            ) : (
              <>Phân tích triệu chứng →</>
            )}
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 text-xs text-teal-700 space-y-1">
        <p className="font-semibold">💡 Hướng dẫn nhập liệu</p>
        <p>• Mô tả càng chi tiết càng tốt (tính chất, thời gian, yếu tố tăng giảm)</p>
        <p>• Bao gồm kết quả quan sát: sắc mặt, lưỡi, mạch nếu có</p>
        <p>• Hệ thống sẽ hỏi thêm để làm rõ các đặc điểm cần thiết</p>
      </div>
    </div>
  );
}

// --- Bước 2 ---
function Step2FeatureQuestions({
  symptoms,
  questions,
  featureInputs,
  onInputChange,
  onSubmit,
  loading,
}: {
  symptoms: ExtractedSymptom[];
  questions: FeatureQuestion[];
  featureInputs: Record<string, string>;
  onInputChange: (symptom: string, val: string) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const foundSymptoms = symptoms.filter(s => s.found_in_kb);
  const unknownSymptoms = symptoms.filter(s => !s.found_in_kb);

  return (
    <div className="space-y-4">
      {/* Triệu chứng đã trích xuất */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <span className="text-green-700 text-sm">✓</span>
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            Triệu chứng đã trích xuất
          </h2>
          <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {foundSymptoms.length} khớp KB
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {foundSymptoms.map(s => (
            <span
              key={s.normalized}
              className="bg-teal-50 text-teal-800 border border-teal-200 px-3 py-1 rounded-full text-sm font-medium"
            >
              {s.normalized}
              {s.original !== s.normalized && (
                <span className="text-teal-500 ml-1 text-xs">
                  ({s.original})
                </span>
              )}
            </span>
          ))}
          {unknownSymptoms.map(s => (
            <span
              key={s.original}
              className="bg-gray-50 text-gray-500 border border-dashed border-gray-300 px-3 py-1 rounded-full text-sm"
              title="Chưa có trong cơ sở tri thức"
            >
              {s.original} ⚠
            </span>
          ))}
        </div>

        {unknownSymptoms.length > 0 && (
          <p className="mt-3 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            ⚠ {unknownSymptoms.length} triệu chứng chưa có trong cơ sở tri thức (ký hiệu ⚠). Bạn có thể bổ sung vào KB sau.
          </p>
        )}
      </div>

      {/* Câu hỏi khai thác đặc điểm */}
      {questions.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <span className="text-blue-700 text-sm">❓</span>
            </div>
            <h2 className="text-base font-semibold text-gray-800">
              Khai thác đặc điểm triệu chứng
            </h2>
            <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {questions.length} câu hỏi
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Trả lời để hệ thống tính điểm phù hợp chính xác hơn. Bỏ qua nếu không có thông tin.
          </p>

          <div className="space-y-4">
            {questions.map(q => (
              <div key={q.symptom} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                <div className="flex items-start gap-2 mb-2">
                  <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap mt-0.5">
                    {q.symptom}
                  </span>
                  <p className="text-sm text-gray-700 font-medium">{q.question}</p>
                </div>
                <input
                  type="text"
                  value={featureInputs[q.symptom] || ''}
                  onChange={e => onInputChange(q.symptom, e.target.value)}
                  placeholder="Nhập mô tả đặc điểm (hoặc để trống nếu không rõ)..."
                  className="w-full rounded-lg border border-gray-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 px-3 py-2 text-sm text-gray-700 outline-none transition"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {q.features_to_ask.map(f => (
                    <button
                      key={f}
                      onClick={() => {
                        const current = featureInputs[q.symptom] || '';
                        const newVal = current ? `${current}; ${f}` : f;
                        onInputChange(q.symptom, newVal);
                      }}
                      className="text-xs bg-white border border-gray-200 hover:border-teal-300 hover:text-teal-700 text-gray-600 px-2 py-0.5 rounded-full transition"
                    >
                      + {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onSubmit}
          disabled={loading}
          className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><Spinner /> Đang suy luận...</>
          ) : (
            <>Suy luận hội chứng →</>
          )}
        </button>
      </div>
    </div>
  );
}

// --- Bước 3 ---
function Step3Disambiguation({
  tempSyndromes,
  questions,
  checked,
  onCheck,
  onSubmit,
  loading,
}: {
  tempSyndromes: SyndromeStat[];
  questions: DisambiguationQuestion[];
  checked: Record<string, boolean>;
  onCheck: (symptom: string, val: boolean) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Hội chứng tạm thời */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <span className="text-amber-700 text-sm">⚖</span>
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            Hội chứng cạnh tranh (cần phân biệt)
          </h2>
        </div>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg mb-4">
          Hệ thống phát hiện các hội chứng có triệu chứng chồng lấp nhau. Cần thêm thông tin để phân biệt chính xác.
        </p>

        <div className="grid gap-3">
          {tempSyndromes.map((s, i) => (
            <div
              key={s.syndrome}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                i === 0
                  ? 'border-teal-200 bg-teal-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div>
                <span className="font-medium text-gray-800 text-sm">
                  {s.syndrome}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {s.matched_count}/{s.total_syndrome_symptoms} triệu chứng
                </span>
              </div>
              <ScoreBadge score={s.score} />
            </div>
          ))}
        </div>
      </div>

      {/* Câu hỏi phân biệt */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
            <span className="text-purple-700 text-sm">🔍</span>
          </div>
          <h2 className="text-base font-semibold text-gray-800">
            Triệu chứng phân biệt
          </h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Đánh dấu các triệu chứng hiện diện ở bệnh nhân để hệ thống phân biệt chính xác hội chứng.
        </p>

        <div className="space-y-3">
          {questions.map(q => (
            <label
              key={q.symptom}
              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                checked[q.symptom]
                  ? 'border-teal-300 bg-teal-50'
                  : 'border-gray-100 bg-gray-50 hover:border-gray-200'
              }`}
            >
              <input
                type="checkbox"
                checked={checked[q.symptom] || false}
                onChange={e => onCheck(q.symptom, e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-teal-600"
              />
              <div>
                <p className="text-sm text-gray-800">{q.question}</p>
                {q.related_syndromes.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Liên quan: {q.related_syndromes.join(', ')}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSubmit}
          disabled={loading}
          className="bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white px-6 py-2.5 rounded-xl font-medium text-sm transition-all shadow-sm hover:shadow disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><Spinner /> Đang hoàn tất...</>
          ) : (
            <>Hoàn tất chẩn đoán →</>
          )}
        </button>
      </div>
    </div>
  );
}

// --- Bước 4 ---
function Step4Results({
  result,
  selectedSyndromes,
  onSelect,
}: {
  result: ReasoningResult;
  selectedSyndromes: string[];
  onSelect: (s: string[]) => void;
}) {
  const { optimal_syndromes, covered_symptoms, uncovered_symptoms, confidence } = result;

  const toggleSelect = (syndrome: string) => {
    if (selectedSyndromes.includes(syndrome)) {
      onSelect(selectedSyndromes.filter(s => s !== syndrome));
    } else {
      onSelect([...selectedSyndromes, syndrome]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Kết quả chính */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-700 text-sm">🏥</span>
            </div>
            <h2 className="text-base font-semibold text-gray-800">
              Kết quả chẩn đoán
            </h2>
          </div>
          <ConfidenceBadge confidence={confidence} />
        </div>

        {optimal_syndromes.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-3xl mb-2">🔍</p>
            <p className="font-medium">Chưa xác định được hội chứng</p>
            <p className="text-sm mt-1">Cần thu thập thêm thông tin lâm sàng</p>
          </div>
        ) : (
          <div className="space-y-3">
            {optimal_syndromes.map((s, i) => (
              <SyndromeCard
                key={s.syndrome}
                stat={s}
                isPrimary={i === 0}
                isSelected={selectedSyndromes.includes(s.syndrome)}
                onToggle={() => toggleSelect(s.syndrome)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Triệu chứng đã/chưa giải thích */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
            <span className="text-green-500">✓</span> Triệu chứng đã giải thích
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {covered_symptoms.map(s => (
              <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                {s}
              </span>
            ))}
          </div>
        </div>

        {uncovered_symptoms.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1">
              <span className="text-amber-500">○</span> Cần đánh giá thêm
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {uncovered_symptoms.map(s => (
                <span key={s} className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lựa chọn của bác sĩ */}
      <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Xác nhận chẩn đoán của bác sĩ
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Chọn hội chứng phù hợp nhất theo đánh giá lâm sàng của bạn
        </p>
        <div className="flex flex-wrap gap-2">
          {optimal_syndromes.map(s => (
            <button
              key={s.syndrome}
              onClick={() => toggleSelect(s.syndrome)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                selectedSyndromes.includes(s.syndrome)
                  ? 'bg-teal-600 text-white border-teal-600 shadow'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              {s.syndrome}
            </button>
          ))}
        </div>
        {selectedSyndromes.length > 0 && (
          <div className="mt-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-teal-800">
              ✅ Bác sĩ chọn: {selectedSyndromes.join(' + ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helper Components
// ============================================================

function SyndromeCard({
  stat,
  isPrimary,
  isSelected,
  onToggle,
}: {
  stat: SyndromeStat;
  isPrimary: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-all ${
        isPrimary
          ? 'border-teal-300 bg-gradient-to-r from-teal-50 to-white'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-center gap-3 p-4">
        {isPrimary && (
          <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap">
            Chính
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm">{stat.syndrome}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {stat.matched_count}/{stat.total_syndrome_symptoms} triệu chứng khớp
          </p>
        </div>
        <ScoreBadge score={stat.score} large />
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-teal-600 text-xs px-2 py-1 rounded-lg hover:bg-teal-50 transition ml-1"
        >
          {expanded ? '▲' : '▼'} Giải thích
        </button>
      </div>

      {/* Chuỗi giải thích */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-600 mb-2">
            Chuỗi suy luận: Triệu chứng → Đặc điểm → Cơ chế → Hội chứng
          </p>
          {stat.matched_symptoms.map((ms, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-100"
            >
              <span className="text-teal-600 font-bold mt-0.5 text-base leading-none">·</span>
              <div>
                <span className="font-semibold text-teal-700">{ms.symptom}</span>
                {ms.feature && (
                  <span className="text-gray-500 mx-1">
                    [{ms.feature.split(';')[0].trim()}]
                  </span>
                )}
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-gray-600">{ms.mechanism}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="font-medium text-gray-700">{stat.syndrome}</span>
                <span className="ml-1.5 text-gray-400">
                  (fit: {(ms.fit_score * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score, large }: { score: number; large?: boolean }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 65
      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
      : pct >= 35
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-600 border-red-100';

  return (
    <span
      className={`border rounded-full font-bold ${large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'} ${color}`}
    >
      {pct}%
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: 'cao' | 'trung_bình' | 'thấp' }) {
  const map = {
    cao: { label: 'Độ tin cậy cao', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    trung_bình: { label: 'Độ tin cậy trung bình', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    thấp: { label: 'Độ tin cậy thấp', cls: 'bg-red-50 text-red-600 border-red-100' },
  };
  const { label, cls } = map[confidence];
  return (
    <span className={`border text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin w-4 h-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
