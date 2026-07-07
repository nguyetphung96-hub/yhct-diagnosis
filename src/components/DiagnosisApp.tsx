'use client';

import { useState } from 'react';
import {
  AppState, ExtractedSymptom, FeatureQuestion,
  SymptomFeatures, DisambiguationQuestion, ReasoningResult, SyndromeStat,
} from '@/types';

const initialState: AppState = {
  step: 1, clinical_text: '', extracted_symptoms: [], feature_questions: [],
  feature_answers: [], temp_syndromes: [], disambiguation_questions: [],
  disambiguation_answers: [], final_result: null, explanation_narrative: '',
  doctor_selected_syndromes: [], loading: false, error: null,
};

function hasChinese(str: string | null): boolean {
  if (!str) return false;
  return /[一-鿿]/.test(str);
}

export default function DiagnosisApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [featureInputs, setFeatureInputs] = useState<Record<string, string>>({});
  const [disambigAnswers, setDisambigAnswers] = useState<Record<string, 'có' | 'không' | ''>>({});
  const [activeTab, setActiveTab] = useState<1 | 2>(1);

  const setLoading = (loading: boolean) => setState(s => ({ ...s, loading, error: null }));
  const setError = (error: string) => setState(s => ({ ...s, loading: false, error }));

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
      const savedAnswers = data.processed_feature_answers ?? answersWithRaw;
      if (data.result.is_final || data.disambiguation_questions.length === 0) {
        setState(s => ({ ...s, step: 4, feature_answers: savedAnswers, final_result: data.result, explanation_narrative: data.explanation_narrative || '', loading: false }));
      } else {
        setState(s => ({ ...s, step: 3, feature_answers: savedAnswers, temp_syndromes: data.result.optimal_syndromes, disambiguation_questions: data.disambiguation_questions, loading: false }));
        setDisambigAnswers({});
      }
      setActiveTab(2);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Lỗi không xác định'); }
  };

  const handleFinalize = async () => {
    setLoading(true);
    const confirmedDisambiguation = state.disambiguation_questions
      .filter(q => disambigAnswers[q.symptom] === 'có')
      .map(q => q.symptom);
    const symptoms = state.extracted_symptoms.filter(s => s.found_in_kb).map(s => s.normalized);
    try {
      const res = await fetch('/api/finalize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, feature_answers: state.feature_answers, confirmed_disambiguation: confirmedDisambiguation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi hoàn tất chẩn đoán');
      setState(s => ({ ...s, step: 4, final_result: data.result, explanation_narrative: data.explanation_narrative || '', disambiguation_answers: confirmedDisambiguation, loading: false }));
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Lỗi không xác định'); }
  };

  const handleReset = () => {
    setState(initialState); setFeatureInputs({}); setDisambigAnswers({}); setActiveTab(1);
  };

  const toggleSelect = (syndrome: string) => {
    const sel = state.doctor_selected_syndromes;
    setState(s => ({ ...s, doctor_selected_syndromes: sel.includes(syndrome) ? sel.filter(x => x !== syndrome) : [...sel, syndrome] }));
  };

  const tab2Available = state.step >= 3 || state.step === 4;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-blue-800">

      {/* ── HEADER ── */}
      <header className="flex-shrink-0 bg-blue-900 shadow-md">
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
            <span className="text-teal-700 text-base font-black">Y</span>
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-white leading-tight">Hệ thống hỗ trợ chẩn đoán hội chứng Y học cổ truyền</h1>
            <p className="text-xs text-teal-200 mt-0.5">Dựa trên cơ sở tri thức kết hợp trí tuệ nhân tạo có khả năng giải thích</p>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 bg-amber-400 text-amber-900 text-xs px-3 py-1.5 rounded-full font-medium shadow-sm">
            <span>⚠</span>
            <span>Hệ thống chỉ hỗ trợ bác sĩ, không thay thế chẩn đoán lâm sàng</span>
          </div>
          {state.step > 1 && (
            <button onClick={handleReset} className="text-xs text-teal-100 hover:text-white border border-teal-500 hover:border-teal-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
              ↩ Bắt đầu lại
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="max-w-screen-xl mx-auto px-6 flex gap-1 pt-1">
          <TabBtn active={activeTab === 1} done={state.step > 2} num={1} label="Tiếp nhận & Khai thác thông tin" onClick={() => setActiveTab(1)} />
          <TabBtn active={activeTab === 2} done={state.step === 4} num={2} label="Phân biệt hội chứng & Kết quả" disabled={!tab2Available} onClick={() => tab2Available && setActiveTab(2)} />
        </div>
      </header>

      {/* Error */}
      {state.error && (
        <div className="flex-shrink-0 max-w-screen-xl mx-auto px-6 pt-3 w-full">
          <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-r-xl text-sm flex items-start gap-2">
            <span>⚠️</span><span>{state.error}</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════ TAB 1 ══════════════════════════════ */}
      {activeTab === 1 && (
        <div className="flex-1 overflow-hidden max-w-screen-xl mx-auto px-6 py-4 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">

            {/* Frame A: Nhập thông tin lâm sàng */}
            <Panel
              color="teal"
              icon="📋"
              title="Nhập thông tin lâm sàng"
              badge={state.step > 1 ? { label: '✓ Đã gửi', color: 'green' } : undefined}
            >
              <p className="text-xs text-gray-500 mb-2">Nhập mô tả triệu chứng, dấu hiệu của bệnh nhân theo ngôn ngữ tự nhiên.</p>
              <textarea
                value={state.clinical_text}
                onChange={e => state.step === 1 && setState(s => ({ ...s, clinical_text: e.target.value }))}
                readOnly={state.step > 1}
                placeholder="Ví dụ: Bệnh nhân nữ 45 tuổi, mất ngủ kéo dài 3 tháng, hay quên, hồi hộp, sắc mặt nhợt nhạt, chóng mặt nhẹ, môi nhợt, mệt mỏi..."
                rows={8}
                className={`w-full rounded-lg border p-3 text-sm outline-none resize-none transition ${state.step > 1 ? 'bg-gray-50 border-gray-200 text-gray-600 italic' : 'border-gray-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 text-gray-800 placeholder-gray-400'}`}
              />
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-xs text-teal-700 mt-2">
                <p className="font-semibold mb-1">💡 Hướng dẫn nhập liệu</p>
                <p>• Mô tả càng chi tiết càng tốt (tính chất, thời gian, yếu tố tăng/giảm)</p>
                <p>• Bao gồm kết quả quan sát: sắc mặt, lưỡi, mạch nếu có</p>
              </div>
              {state.step === 1 && (
                <button onClick={handleExtract} disabled={state.loading || !state.clinical_text.trim()}
                  className="mt-3 w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                  {state.loading ? <><Spinner /> Đang phân tích...</> : <>✓ Xác nhận & Phân tích triệu chứng</>}
                </button>
              )}
            </Panel>

            {/* Frame B: Triệu chứng & Câu hỏi mức 1 */}
            <Panel
              color="blue"
              icon="🔍"
              title="Triệu chứng & Câu hỏi bổ sung mức 1"
              badge={state.step > 2 ? { label: '✓ Đã gửi', color: 'green' } : undefined}
            >
              {state.step < 2 ? (
                <EmptyState icon="⏳" text="Chờ nhập và xác nhận thông tin lâm sàng" sub="Kết quả trích xuất sẽ hiển thị tại đây" />
              ) : (
                <div className="flex flex-col gap-3 h-full">
                  {/* Triệu chứng đã trích xuất */}
                  <div>
                    <SectionLabel color="teal" text="Triệu chứng đã trích xuất & chuẩn hóa" right={`${state.extracted_symptoms.filter(s => s.found_in_kb).length} khớp KB`} />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {state.extracted_symptoms.filter(s => s.found_in_kb).map(s => (
                        <span key={s.normalized} className="bg-teal-50 text-teal-800 border border-teal-300 px-2.5 py-0.5 rounded-full text-xs font-medium">
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
                    <div className="flex-1 overflow-y-auto">
                      <SectionLabel color="blue" text="Câu hỏi khai thác đặc điểm triệu chứng" />
                      <div className="space-y-2 mt-2">
                        {state.feature_questions.map(q => (
                          <div key={q.symptom} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                            <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-2">
                              <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded font-semibold">{q.symptom}</span>
                              <p className="text-xs text-gray-700">{q.question}</p>
                            </div>
                            <div className="p-2.5">
                              {state.step === 2 ? (
                                <>
                                  <input type="text" value={featureInputs[q.symptom] || ''}
                                    onChange={e => setFeatureInputs(prev => ({ ...prev, [q.symptom]: e.target.value }))}
                                    placeholder="Nhập mô tả (để trống nếu không rõ)..."
                                    className="w-full rounded-md border border-gray-200 focus:border-teal-400 focus:ring-1 focus:ring-teal-100 px-2.5 py-1.5 text-xs outline-none transition"
                                  />
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {q.features_to_ask.map(f => (
                                      <button key={f} onClick={() => {
                                        const cur = featureInputs[q.symptom] || '';
                                        setFeatureInputs(prev => ({ ...prev, [q.symptom]: cur ? `${cur}; ${f}` : f }));
                                      }} className="text-xs bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700 px-2 py-0.5 rounded transition">
                                        + {f}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-gray-600 italic">
                                  {featureInputs[q.symptom] || <span className="text-gray-400">Không có thông tin</span>}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {state.step === 2 && (
                    <button onClick={handleReason} disabled={state.loading}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                      {state.loading ? <><Spinner /> Đang suy luận...</> : <>✓ Xác nhận & Suy luận hội chứng</>}
                    </button>
                  )}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ══════════════════════════════ TAB 2 ══════════════════════════════ */}
      {activeTab === 2 && tab2Available && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-screen-xl mx-auto px-6 py-4 w-full space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 'calc(100vh - 220px)' }}>

              {/* Frame C: Phân biệt hội chứng */}
              <Panel
                color="purple"
                icon="⚖"
                title="Phân biệt hội chứng & Câu hỏi mức 2"
                badge={state.step === 4 && state.disambiguation_questions.length > 0 ? { label: '✓ Đã gửi', color: 'green' } : undefined}
              >
                {state.step === 4 && state.disambiguation_questions.length === 0 ? (
                  <EmptyState icon="✅" text="Không cần phân biệt thêm" sub="Hệ thống đã xác định hội chứng đủ tin cậy" />
                ) : state.step >= 3 ? (
                  <div className="flex flex-col gap-3 h-full">
                    {state.temp_syndromes.length > 0 && (
                      <div>
                        <SectionLabel color="amber" text="Hội chứng đang cạnh tranh (điểm tạm thời)" />
                        <div className="space-y-1.5 mt-2">
                          {state.temp_syndromes.map((s, i) => (
                            <div key={s.syndrome} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs border ${i === 0 ? 'bg-teal-50 border-teal-200 text-teal-800 font-semibold' : 'bg-white border-gray-200 text-gray-700'}`}>
                              <span>{s.syndrome} <span className="text-gray-400 font-normal ml-1">{s.matched_count}/{s.total_syndrome_symptoms} TC</span></span>
                              <ScoreBadge score={s.score} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {state.disambiguation_questions.length > 0 && (
                      <div className="flex-1 overflow-y-auto">
                        <SectionLabel color="purple" text="Câu hỏi phân biệt hội chứng" />
                        <div className="space-y-2 mt-2">
                          {state.disambiguation_questions.map(q => (
                            <div key={q.symptom} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                              <div className="bg-purple-50 border-b border-purple-100 px-3 py-2">
                                <p className="text-xs font-medium text-gray-800">{q.question}</p>
                                {q.related_syndromes.length > 0 && (
                                  <p className="text-xs text-gray-400 mt-0.5">Liên quan: {q.related_syndromes.join(', ')}</p>
                                )}
                              </div>
                              <div className="p-2">
                                {state.step === 3 ? (
                                  <div className="flex gap-2">
                                    <button onClick={() => setDisambigAnswers(prev => ({ ...prev, [q.symptom]: 'có' }))}
                                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all ${disambigAnswers[q.symptom] === 'có' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-700'}`}>
                                      ✓ Có
                                    </button>
                                    <button onClick={() => setDisambigAnswers(prev => ({ ...prev, [q.symptom]: 'không' }))}
                                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold border transition-all ${disambigAnswers[q.symptom] === 'không' ? 'bg-gray-500 text-white border-gray-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                      ✗ Không
                                    </button>
                                  </div>
                                ) : (
                                  <p className={`text-xs font-medium px-2.5 py-1.5 rounded-md ${disambigAnswers[q.symptom] === 'có' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {disambigAnswers[q.symptom] === 'có' ? '✓ Có' : '✗ Không'}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {state.step === 3 && (
                      <button onClick={handleFinalize} disabled={state.loading}
                        className="w-full bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2.5 rounded-lg font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 disabled:cursor-not-allowed">
                        {state.loading ? <><Spinner /> Đang hoàn tất...</> : <>✓ Xác nhận & Hoàn tất chẩn đoán</>}
                      </button>
                    )}
                  </div>
                ) : (
                  <EmptyState icon="⏳" text="Chờ kết quả suy luận từ Tab 1" />
                )}
              </Panel>

              {/* Frame D: Kết quả chẩn đoán */}
              <Panel color="emerald" icon="🏥" title="Kết quả chẩn đoán">
                {!state.final_result ? (
                  <EmptyState icon="⏳" text="Kết quả sẽ hiển thị sau khi hoàn tất suy luận" />
                ) : state.final_result.optimal_syndromes.length === 0 ? (
                  <EmptyState icon="🔍" text="Chưa xác định được hội chứng" sub="Cần thu thập thêm thông tin lâm sàng" />
                ) : (
                  <div className="flex flex-col gap-3 h-full overflow-y-auto">
                    {/* Syndrome cards */}
                    <div>
                      <SectionLabel color="emerald" text="Hội chứng được xác định" />
                      <div className="space-y-2 mt-2">
                        {state.final_result.optimal_syndromes.map((s, i) => (
                          <SyndromeCard key={s.syndrome} stat={s} isPrimary={i === 0} isSelected={state.doctor_selected_syndromes.includes(s.syndrome)} onToggle={() => toggleSelect(s.syndrome)} />
                        ))}
                      </div>
                    </div>

                    {/* LLM narrative */}
                    {state.explanation_narrative && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1.5 flex items-center gap-1.5">
                          <span>✦</span> Lời giải thích tổng hợp
                        </p>
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {state.explanation_narrative}
                        </p>
                      </div>
                    )}

                    {/* Covered / Uncovered */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-semibold text-green-700 mb-1.5">✓ Đã giải thích</p>
                        <div className="flex flex-wrap gap-1">
                          {state.final_result.covered_symptoms.map(s => (
                            <span key={s} className="text-xs bg-white text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{s}</span>
                          ))}
                        </div>
                      </div>
                      {state.final_result.uncovered_symptoms.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-amber-700 mb-1.5">○ Cần đánh giá thêm</p>
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
              </Panel>
            </div>

            {/* Frame E: Xác nhận bác sĩ */}
            {state.final_result && state.final_result.optimal_syndromes.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border-l-4 border-teal-500 border border-gray-200 overflow-hidden">
                <div className="bg-teal-50 border-b border-teal-100 px-5 py-3 flex items-center gap-3">
                  <span className="text-base">👨‍⚕️</span>
                  <h2 className="text-sm font-bold text-teal-800">Xác nhận chẩn đoán của bác sĩ</h2>
                  <div className="ml-auto text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full font-medium">
                    ⚠ Quyết định cuối thuộc về bác sĩ lâm sàng
                  </div>
                </div>
                <div className="px-5 py-4">
                  <p className="text-xs text-gray-500 mb-3">Chọn hội chứng phù hợp nhất theo đánh giá lâm sàng của bạn:</p>
                  <div className="flex flex-wrap gap-2">
                    {state.final_result.optimal_syndromes.map(s => (
                      <button key={s.syndrome} onClick={() => toggleSelect(s.syndrome)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${state.doctor_selected_syndromes.includes(s.syndrome) ? 'bg-teal-600 text-white border-teal-600 shadow' : 'bg-white text-gray-700 border-gray-300 hover:border-teal-400 hover:text-teal-700'}`}>
                        {s.syndrome} <span className="text-xs opacity-70 ml-1">{Math.round(s.score * 100)}%</span>
                      </button>
                    ))}
                  </div>
                  {state.doctor_selected_syndromes.length > 0 && (
                    <div className="mt-3 bg-teal-50 border border-teal-200 rounded-lg px-4 py-3 flex items-center gap-2">
                      <span className="text-teal-600">✅</span>
                      <p className="text-sm font-semibold text-teal-800">Bác sĩ xác nhận: {state.doctor_selected_syndromes.join(' + ')}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Layout components
// ══════════════════════════════════════════════════════════════

const PANEL_COLORS = {
  teal:   { border: 'border-l-teal-400',   header: 'bg-teal-50 border-b border-teal-200',   titleColor: 'text-teal-800' },
  blue:   { border: 'border-l-blue-400',   header: 'bg-blue-50 border-b border-blue-200',   titleColor: 'text-blue-800' },
  purple: { border: 'border-l-purple-400', header: 'bg-purple-50 border-b border-purple-200', titleColor: 'text-purple-800' },
  emerald:{ border: 'border-l-emerald-400',header: 'bg-emerald-50 border-b border-emerald-200', titleColor: 'text-emerald-800' },
};

function Panel({ color, icon, title, badge, children }: {
  color: keyof typeof PANEL_COLORS;
  icon: string;
  title: string;
  badge?: { label: string; color: string };
  children: React.ReactNode;
}) {
  const c = PANEL_COLORS[color];
  return (
    <div className={`bg-white rounded-xl shadow-md border border-gray-200 border-l-4 ${c.border} flex flex-col overflow-hidden`}>
      {/* Panel header */}
      <div className={`flex-shrink-0 ${c.header} px-4 py-2.5 flex items-center gap-2.5`}>
        <span className="text-sm">{icon}</span>
        <h2 className={`text-sm font-bold flex-1 ${c.titleColor}`}>{title}</h2>
        {badge && (
          <span className="text-xs bg-white text-green-700 border border-green-300 px-2 py-0.5 rounded-full font-medium">
            {badge.label}
          </span>
        )}
      </div>
      {/* Panel body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        {children}
      </div>
    </div>
  );
}

const LABEL_COLORS = {
  teal:   'bg-teal-100 text-teal-700 border-teal-200',
  blue:   'bg-blue-100 text-blue-700 border-blue-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
  emerald:'bg-emerald-100 text-emerald-700 border-emerald-200',
  amber:  'bg-amber-100 text-amber-700 border-amber-200',
};

function SectionLabel({ color, text, right }: { color: keyof typeof LABEL_COLORS; text: string; right?: string }) {
  return (
    <div className={`flex items-center justify-between px-2.5 py-1 rounded border text-xs font-semibold ${LABEL_COLORS[color]}`}>
      <span>{text}</span>
      {right && <span className="font-normal opacity-70">{right}</span>}
    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 border-2 border-dashed border-gray-200 rounded-lg py-10">
      <span className="text-3xl">{icon}</span>
      <p className="text-center font-medium text-gray-500">{text}</p>
      {sub && <p className="text-xs text-center">{sub}</p>}
    </div>
  );
}

function TabBtn({ active, done, num, label, disabled, onClick }: {
  active: boolean; done: boolean; num: number; label: string; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`px-5 py-2 text-xs font-semibold flex items-center gap-2 rounded-t-lg transition-all border-b-2
        ${active ? 'bg-white text-teal-700 border-teal-400' : disabled ? 'text-teal-300 border-transparent cursor-not-allowed' : 'text-teal-200 border-transparent hover:bg-teal-600 hover:text-white'}`}>
      <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${active ? 'bg-teal-600 text-white' : done ? 'bg-green-500 text-white' : 'bg-teal-500 text-teal-100'}`}>
        {done ? '✓' : num}
      </span>
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// Syndrome card
// ══════════════════════════════════════════════════════════════

function SyndromeCard({ stat, isPrimary, isSelected, onToggle }: {
  stat: SyndromeStat; isPrimary: boolean; isSelected: boolean; onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`border rounded-lg overflow-hidden shadow-sm transition-all ${isPrimary ? 'border-teal-300' : 'border-gray-200'}`}>
      <div className={`flex items-center gap-2.5 px-3 py-2.5 ${isPrimary ? 'bg-teal-50' : 'bg-gray-50'}`}>
        {isPrimary && <span className="bg-teal-600 text-white text-xs px-2 py-0.5 rounded font-bold whitespace-nowrap">Chính</span>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-tight">{stat.syndrome}</p>
          <p className="text-xs text-gray-400 mt-0.5">{stat.matched_count}/{stat.total_syndrome_symptoms} triệu chứng khớp</p>
        </div>
        <ScoreBadge score={stat.score} large />
        <button onClick={() => setExpanded(!expanded)}
          className="text-gray-400 hover:text-teal-600 text-xs px-2 py-1 rounded hover:bg-teal-50 transition whitespace-nowrap border border-gray-200 hover:border-teal-200">
          {expanded ? '▲' : '▼'} Giải thích
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 p-3 bg-white space-y-1.5">
          <p className="text-xs font-semibold text-gray-500 mb-2">Chuỗi suy luận: Triệu chứng → Đặc điểm → Cơ chế → Hội chứng</p>
          {stat.matched_symptoms.map((ms, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-gray-600 bg-gray-50 p-2 rounded-lg border border-gray-100">
              <span className="text-teal-500 font-bold mt-0.5">·</span>
              <div className="flex-1">
                <span className="font-semibold text-teal-700">{ms.symptom}</span>
                {ms.feature && (
                  <span className="text-gray-400 mx-1">
                    [{ms.feature.split(';').map(f => f.trim()).filter(f => !hasChinese(f)).join('; ')}]
                  </span>
                )}
                {!hasChinese(ms.mechanism) && ms.mechanism && (
                  <><span className="text-gray-300 mx-1">→</span><span>{ms.mechanism}</span></>
                )}
                <span className="text-gray-300 mx-1">→</span>
                <span className="font-medium text-gray-700">{stat.syndrome}</span>
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
  const color = pct >= 65 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
    : pct >= 35 ? 'bg-amber-100 text-amber-700 border-amber-300'
    : 'bg-red-50 text-red-600 border-red-200';
  return <span className={`border rounded-full font-bold ${large ? 'px-2.5 py-0.5 text-sm' : 'px-2 py-0.5 text-xs'} ${color}`}>{pct}%</span>;
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}
