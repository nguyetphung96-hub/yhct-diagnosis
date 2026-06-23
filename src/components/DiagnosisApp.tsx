'use client';

import { useState } from 'react';
import {
  AppState, ExtractedSymptom, FeatureQuestion,
  SymptomFeatures, DisambiguationQuestion, ReasoningResult, SyndromeStat,
} from '@/types';

const initialState: AppState = {
  step: 1, clinical_text: '', extracted_symptoms: [], feature_questions: [],
  feature_answers: [], temp_syndromes: [], disambiguation_questions: [],
  disambiguation_answers: [], final_result: null, doctor_selected_syndromes: [],
  loading: false, error: null,
};

export default function DiagnosisApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [featureInputs, setFeatureInputs] = useState<Record<string, string>>({});
  const [disambigInputs, setDisambigInputs] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<1 | 2>(1);

  const setLoading = (loading: boolean) => setState(s => ({ ...s, loading, error: null }));
  const setError = (error: string) => setState(s => ({ ...s, loading: false, error }));

  // Step 1 → 2
  const handleExtract = async () => {
    if (!state.clinical_text.trim()) { setError('Vui lòng nhập mô tả lâm sàng'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinical_text: state.clinical_text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi hệ thống');
      const emptyAnswers: SymptomFeatures[] = data.feature_questions.map(
        (q: FeatureQuestion) => ({ symptom: q.symptom, observed_features: [], raw_answer: '' })
      );
      setState(s => ({ ...s, step: 2, extracted_symptoms: data.extracted_symptoms, feature_questions: data.feature_questions, feature_answers: emptyAnswers, loading: false }));
      setFeatureInputs({});
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Lỗi không xác định'); }
  };

  // Step 2 → 3 or 4
  const handleReason = async () => {
    setLoading(true);
    const answersWithRaw: SymptomFeatures[] = state.feature_questions.map(q => ({
      symptom: q.symptom, observed_features: [], raw_answer: featureInputs[q.symptom] || '',
    }));
    const symptoms = state.extracted_symptoms.filter(s => s.found_in_kb).map(s => s.normalized);
    try {
      const res = await fetch('/api/reason', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, feature_answers: answersWithRaw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi suy luận');
      if (data.result.is_final || data.disambiguation_questions.length === 0) {
        setState(s => ({ ...s, step: 4, feature_answers: answersWithRaw, final_result: data.result, loading: false }));
      } else {
        setState(s => ({ ...s, step: 3, feature_answers: answersWithRaw, temp_syndromes: data.result.optimal_syndromes, disambiguation_questions: data.disambiguation_questions, loading: false }));
        setDisambigInputs({});
      }
      setActiveTab(2);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Lỗi không xác định'); }
  };

  // Step 3 → 4
  const handleFinalize = async () => {
    setLoading(true);
    const confirmedDisambiguation = state.disambiguation_questions
      .filter(q => disambigInputs[q.symptom]?.trim())
      .map(q => q.symptom);
    const symptoms = state.extracted_symptoms.filter(s => s.found_in_kb).map(s => s.normalized);
    try {
      const res = await fetch('/api/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, feature_answers: state.feature_answers, confirmed_disambiguation: confirmedDisambiguation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi hoàn tất chẩn đoán');
      setState(s => ({ ...s, step: 4, final_result: data.result, disambiguation_answers: confirmedDisambiguation, loading: false }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Lỗi không xác định'); }
  };

  const handleReset = () => {
    setState(initialState); setFeatureInputs({}); setDisambigInputs({}); setActiveTab(1);
  };

  const toggleSelect = (syndrome: string) => {
    const sel = state.doctor_selected_syndromes;
    setState(s => ({ ...s, doctor_selected_syndromes: sel.includes(syndrome) ? sel.filter(x => x !== syndrome) : [...sel, syndrome] }));
  };

  const tab2Available = state.step >= 3 || state.step === 4;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-teal-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center shadow">
            <span className="text-white text-base font-bold">Y</span>
          </div>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900 leading-tight">Hệ thống Hỗ trợ Chẩn đoán Y học Cổ truyền (YHCT)</h1>
            <p className="text-xs text-teal-600">Dựa trên cơ sở tri thức kết hợp AI có khả năng giải thích</p>
          </div>
          {/* Disclaimer badge */}
          <div className="hidden sm:flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs px-3 py-1.5 rounded-full">
            <span>⚠️</span>
            <span className="font-medium">Hệ thống chỉ hỗ trợ bác sĩ, không thay thế chẩn đoán lâm sàng</span>
          </div>
          {state.step > 1 && (
            <button onClick={handleReset} className="text-sm text-gray-500 hover:text-teal-600 border border-gray-200 hover:border-teal-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ↩ Bắt đầu lại
            </button>
          )}
        </div>
        {/* Disclaimer mobile */}
        <div className="sm:hidden bg-amber-50 border-t border-amber-100 px-4 py-1.5 text-xs text-amber-700 text-center">
          ⚠️ Hệ thống chỉ hỗ trợ bác sĩ, không thay thế chẩn đoán lâm sàng
        </div>

        {/* Tabs */}
        <div className="max-w-screen-xl mx-auto px-6 flex border-t border-gray-100">
          <button onClick={() => setActiveTab(1)}
            className={`px-6 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 1 ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
            <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${activeTab === 1 ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {state.step > 2 ? '✓' : '1'}
            </span>
            Tiếp nhận & Khai thác thông tin
          </button>
          <button onClick={() => tab2Available && setActiveTab(2)} disabled={!tab2Available}
            className={`px-6 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${activeTab === 2 ? 'border-teal-600 text-teal-700' : tab2Available ? 'border-transparent text-gray-400 hover:text-gray-600' : 'border-transparent text-gray-300 cursor-not-allowed'}`}>
            <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${activeTab === 2 ? 'bg-teal-600 text-white' : tab2Available ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-300'}`}>
              {state.step === 4 ? '✓' : '2'}
            </span>
            Phân biệt hội chứng & Kết quả
            {!tab2Available && <span className="text-xs text-gray-300 ml-1">(chờ xử lý)</span>}
          </button>
        </div>
      </header>

      {/* Error */}
      {state.error && (
        <div className="max-w-screen-xl mx-auto px-6 pt-3 w-full">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
            <span>⚠️</span><span>{state.error}</span>
          </div>
        </div>
      )}

      {/* ======= TAB 1 ======= */}
      {activeTab === 1 && (
        <div className="flex-1 max-w-screen-xl mx-auto px-6 py-5 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">

            {/* KHUNG 1: Nhập mô tả lâm sàng */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center text-sm">📋</div>
                <h2 className="text-sm font-bold text-gray-800">Khung 1 — Nhập thông tin lâm sàng</h2>
                {state.step > 1 && <span className="ml-auto text-xs bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full">✓ Đã gửi</span>}
              </div>
              <p className="text-xs text-gray-500 mb-3">Nhập mô tả triệu chứng, dấu hiệu của bệnh nhân theo ngôn ngữ tự nhiên.</p>

              <textarea
                value={state.clinical_text}
                onChange={e => state.step === 1 && setState(s => ({ ...s, clinical_text: e.target.value }))}
                readOnly={state.step > 1}
                placeholder="Ví dụ: Bệnh nhân nữ 45 tuổi, mất ngủ kéo dài 3 tháng, hay quên, hồi hộp, sắc mặt nhợt nhạt, chóng mặt nhẹ, môi nhợt, mệt mỏi..."
                rows={8}
                className={`flex-1 w-full rounded-xl border p-3 text-sm outline-none resize-none transition ${state.step > 1 ? 'bg-gray-50 border-gray-100 text-gray-600 italic' : 'border-gray-200 focus:border-teal-400 focus:ring-2 focus:ring-teal-100 text-gray-800 placeholder-gray-400'}`}
              />

              <div className="mt-3 bg-teal-50 border border-teal-100 rounded-xl p-3 text-xs text-teal-700 space-y-0.5">
                <p className="font-semibold">💡 Hướng dẫn</p>
                <p>• Mô tả càng chi tiết càng tốt (tính chất, thời gian, yếu tố tăng/giảm)</p>
                <p>• Bao gồm kết quả quan sát: sắc mặt, lưỡi, mạch nếu có</p>
              </div>

              {state.step === 1 && (
                <button onClick={handleExtract} disabled={state.loading || !state.clinical_text.trim()}
                  className="mt-4 w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                  {state.loading ? <><Spinner /> Đang phân tích...</> : <>✓ Xác nhận & Phân tích triệu chứng</>}
                </button>
              )}
            </div>

            {/* KHUNG 2: Triệu chứng & Câu hỏi mức 1 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-sm">❓</div>
                <h2 className="text-sm font-bold text-gray-800">Khung 2 — Triệu chứng & Câu hỏi bổ sung mức 1</h2>
                {state.step > 2 && <span className="ml-auto text-xs bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full">✓ Đã gửi</span>}
              </div>

              {state.step < 2 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 border-2 border-dashed border-gray-200 rounded-xl py-12">
                  <span className="text-3xl">⏳</span>
                  <p>Chờ nhập và xác nhận thông tin lâm sàng</p>
                  <p className="text-xs text-gray-300">Kết quả trích xuất sẽ hiển thị tại đây</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                  {/* Triệu chứng */}
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                      <span className="text-green-600">●</span> Triệu chứng đã trích xuất & chuẩn hóa
                      <span className="ml-auto bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{state.extracted_symptoms.filter(s => s.found_in_kb).length} khớp KB</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {state.extracted_symptoms.filter(s => s.found_in_kb).map(s => (
                        <span key={s.normalized} className="bg-teal-50 text-teal-800 border border-teal-200 px-2.5 py-0.5 rounded-full text-xs font-medium">
                          {s.normalized}{s.original !== s.normalized && <span className="text-teal-400 ml-1">({s.original})</span>}
                        </span>
                      ))}
                      {state.extracted_symptoms.filter(s => !s.found_in_kb).map(s => (
                        <span key={s.original} className="bg-gray-100 text-gray-400 border border-dashed border-gray-300 px-2.5 py-0.5 rounded-full text-xs" title="Chưa có trong KB">
                          {s.original} ⚠
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Câu hỏi mức 1 */}
                  {state.feature_questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                        <span className="text-blue-500">●</span> Câu hỏi khai thác đặc điểm triệu chứng
                      </p>
                      {state.feature_questions.map(q => (
                        <div key={q.symptom} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                          <div className="flex items-start gap-2 mb-1.5">
                            <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">{q.symptom}</span>
                            <p className="text-xs text-gray-700 font-medium">{q.question}</p>
                          </div>
                          {state.step === 2 ? (
                            <>
                              <input type="text" value={featureInputs[q.symptom] || ''}
                                onChange={e => setFeatureInputs(prev => ({ ...prev, [q.symptom]: e.target.value }))}
                                placeholder="Nhập mô tả (để trống nếu không rõ)..."
                                className="w-full rounded-lg border border-gray-200 focus:border-teal-400 px-2.5 py-1.5 text-xs outline-none transition"
                              />
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {q.features_to_ask.map(f => (
                                  <button key={f} onClick={() => {
                                    const cur = featureInputs[q.symptom] || '';
                                    setFeatureInputs(prev => ({ ...prev, [q.symptom]: cur ? `${cur}; ${f}` : f }));
                                  }} className="text-xs bg-white border border-gray-200 hover:border-teal-300 hover:text-teal-700 text-gray-500 px-2 py-0.5 rounded-full transition">
                                    + {f}
                                  </button>
                                ))}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-gray-600 italic bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                              {featureInputs[q.symptom] || <span className="text-gray-400">Không có thông tin</span>}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {state.step === 2 && (
                    <button onClick={handleReason} disabled={state.loading}
                      className="mt-auto w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                      {state.loading ? <><Spinner /> Đang suy luận...</> : <>✓ Xác nhận & Suy luận hội chứng</>}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======= TAB 2 ======= */}
      {activeTab === 2 && tab2Available && (
        <div className="flex-1 max-w-screen-xl mx-auto px-6 py-5 w-full space-y-5">
          {/* Row 1: Khung 1 + Khung 2 (2 cột) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* KHUNG 1: Hội chứng tạm thời & câu hỏi mức 2 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center text-sm">⚖</div>
                <h2 className="text-sm font-bold text-gray-800">Khung 1 — Phân biệt hội chứng & Câu hỏi mức 2</h2>
                {state.step === 4 && state.disambiguation_questions.length > 0 && (
                  <span className="ml-auto text-xs bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full">✓ Đã gửi</span>
                )}
              </div>

              {state.step === 4 && state.disambiguation_questions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8">
                  <span className="text-2xl">✅</span>
                  <p className="text-center">Không cần phân biệt thêm</p>
                  <p className="text-xs text-gray-300 text-center">Hệ thống đã xác định hội chứng đủ tin cậy</p>
                </div>
              ) : state.step >= 3 ? (
                <div className="flex flex-col gap-3 flex-1">
                  {/* Hội chứng cạnh tranh */}
                  {state.temp_syndromes.length > 0 && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs font-semibold text-amber-700 mb-2">Hội chứng đang cạnh tranh (điểm tạm thời)</p>
                      <div className="space-y-1.5">
                        {state.temp_syndromes.map((s, i) => (
                          <div key={s.syndrome} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${i === 0 ? 'bg-teal-100 text-teal-800 font-semibold' : 'bg-white text-gray-700 border border-gray-100'}`}>
                            <span>{s.syndrome} <span className="text-gray-400 font-normal ml-1">{s.matched_count}/{s.total_syndrome_symptoms} TC</span></span>
                            <ScoreBadge score={s.score} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Câu hỏi mức 2 */}
                  {state.disambiguation_questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                        <span className="text-purple-500">●</span> Câu hỏi phân biệt hội chứng
                      </p>
                      {state.disambiguation_questions.map(q => (
                        <div key={q.symptom} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                          <p className="text-xs font-medium text-gray-700 mb-1.5">{q.question}</p>
                          {q.related_syndromes.length > 0 && (
                            <p className="text-xs text-gray-400 mb-1.5">Liên quan: {q.related_syndromes.join(', ')}</p>
                          )}
                          {state.step === 3 ? (
                            <input type="text" value={disambigInputs[q.symptom] || ''}
                              onChange={e => setDisambigInputs(prev => ({ ...prev, [q.symptom]: e.target.value }))}
                              placeholder="Nhập câu trả lời..."
                              className="w-full rounded-lg border border-gray-200 focus:border-teal-400 px-2.5 py-1.5 text-xs outline-none transition"
                            />
                          ) : (
                            <p className="text-xs text-gray-600 italic bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                              {disambigInputs[q.symptom] || <span className="text-gray-400">Không có thông tin</span>}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {state.step === 3 && (
                    <button onClick={handleFinalize} disabled={state.loading}
                      className="mt-auto w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                      {state.loading ? <><Spinner /> Đang hoàn tất...</> : <>✓ Xác nhận & Hoàn tất chẩn đoán</>}
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8">
                  <span className="text-2xl">⏳</span>
                  <p>Chờ kết quả suy luận từ Tab 1</p>
                </div>
              )}
            </div>

            {/* KHUNG 2: Kết quả chẩn đoán */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-sm">🏥</div>
                <h2 className="text-sm font-bold text-gray-800">Khung 2 — Kết quả chẩn đoán</h2>
                {state.final_result && <ConfidenceBadge confidence={state.final_result.confidence} />}
              </div>

              {!state.final_result ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 border-2 border-dashed border-gray-200 rounded-xl py-8">
                  <span className="text-2xl">⏳</span>
                  <p className="text-center">Kết quả sẽ hiển thị sau khi hoàn tất suy luận</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1">
                  {state.final_result.optimal_syndromes.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-3xl mb-2">🔍</p>
                      <p className="font-medium text-sm">Chưa xác định được hội chứng</p>
                      <p className="text-xs mt-1">Cần thu thập thêm thông tin lâm sàng</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {state.final_result.optimal_syndromes.map((s, i) => (
                        <SyndromeCard key={s.syndrome} stat={s} isPrimary={i === 0} isSelected={state.doctor_selected_syndromes.includes(s.syndrome)} onToggle={() => toggleSelect(s.syndrome)} />
                      ))}
                    </div>
                  )}

                  {/* Triệu chứng đã/chưa giải thích */}
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div className="bg-green-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1"><span>✓</span> Đã giải thích</p>
                      <div className="flex flex-wrap gap-1">
                        {state.final_result.covered_symptoms.map(s => (
                          <span key={s} className="text-xs bg-white text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    </div>
                    {state.final_result.uncovered_symptoms.length > 0 && (
                      <div className="bg-amber-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1"><span>○</span> Cần đánh giá thêm</p>
                        <div className="flex flex-wrap gap-1">
                          {state.final_result.uncovered_symptoms.map(s => (
                            <span key={s} className="text-xs bg-white text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: KHUNG 3 — Bác sĩ xác nhận (full width, chỉ hiện khi có kết quả) */}
          {state.final_result && state.final_result.optimal_syndromes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-teal-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center text-sm">👨‍⚕️</div>
                <h2 className="text-sm font-bold text-gray-800">Khung 3 — Xác nhận chẩn đoán của bác sĩ</h2>
                <div className="ml-auto text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full">
                  ⚠️ Quyết định cuối thuộc về bác sĩ lâm sàng
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">Chọn hội chứng phù hợp nhất theo đánh giá lâm sàng của bạn:</p>
              <div className="flex flex-wrap gap-2">
                {state.final_result.optimal_syndromes.map(s => (
                  <button key={s.syndrome} onClick={() => toggleSelect(s.syndrome)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${state.doctor_selected_syndromes.includes(s.syndrome) ? 'bg-teal-600 text-white border-teal-600 shadow' : 'bg-white text-gray-700 border-gray-200 hover:border-teal-300 hover:text-teal-700'}`}>
                    {s.syndrome} <span className="text-xs opacity-70 ml-1">{Math.round(s.score * 100)}%</span>
                  </button>
                ))}
              </div>
              {state.doctor_selected_syndromes.length > 0 && (
                <div className="mt-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-teal-600">✅</span>
                  <p className="text-sm font-semibold text-teal-800">Bác sĩ xác nhận: {state.doctor_selected_syndromes.join(' + ')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function SyndromeCard({ stat, isPrimary, isSelected, onToggle }: {
  stat: SyndromeStat; isPrimary: boolean; isSelected: boolean; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${isPrimary ? 'border-teal-300 bg-gradient-to-r from-teal-50 to-white' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 p-3">
        {isPrimary && <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded-full font-bold whitespace-nowrap">Chính</span>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm">{stat.syndrome}</p>
          <p className="text-xs text-gray-400">{stat.matched_count}/{stat.total_syndrome_symptoms} triệu chứng khớp</p>
        </div>
        <ScoreBadge score={stat.score} large />
        <button onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-teal-600 text-xs px-2 py-1 rounded-lg hover:bg-teal-50 transition whitespace-nowrap">
          {expanded ? '▲' : '▼'} Giải thích
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 mb-1">Chuỗi suy luận: Triệu chứng → Đặc điểm → Cơ chế → Hội chứng</p>
          {stat.matched_symptoms.map((ms, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-gray-600 bg-white p-2 rounded-lg border border-gray-100">
              <span className="text-teal-500 font-bold">·</span>
              <div className="flex-1">
                <span className="font-semibold text-teal-700">{ms.symptom}</span>
                {ms.feature && <span className="text-gray-400 mx-1">[{ms.feature.split(';')[0].trim()}]</span>}
                <span className="text-gray-300 mx-1">→</span>
                <span>{ms.mechanism}</span>
                <span className="text-gray-300 mx-1">→</span>
                <span className="font-medium">{stat.syndrome}</span>
                <span className="ml-1 text-gray-400">(fit: {(ms.fit_score * 100).toFixed(0)}%)</span>
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
  const color = pct >= 65 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : pct >= 35 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-red-50 text-red-600 border-red-100';
  return <span className={`border rounded-full font-bold ${large ? 'px-2.5 py-0.5 text-sm' : 'px-2 py-0.5 text-xs'} ${color}`}>{pct}%</span>;
}

function ConfidenceBadge({ confidence }: { confidence: 'cao' | 'trung_bình' | 'thấp' }) {
  const map = { cao: { label: 'Tin cậy cao', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }, trung_bình: { label: 'Tin cậy trung bình', cls: 'bg-amber-50 text-amber-700 border-amber-200' }, thấp: { label: 'Tin cậy thấp', cls: 'bg-red-50 text-red-600 border-red-100' } };
  const { label, cls } = map[confidence];
  return <span className={`ml-auto border text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
