/**
 * Reasoning Engine - Bộ suy luận YHCT
 * Triển khai thuật toán 8 bước theo đề cương luận văn
 * Đây là XAI nội tại (Intrinsic XAI) - toàn bộ logic minh bạch và traceable
 */

import {
  KnowledgeRow,
  SyndromeStat,
  MatchedSymptom,
  ReasoningResult,
  SymptomFeatures,
} from '@/types';

// ============================================================
// Hàm tiện ích
// ============================================================

/** Chuẩn hóa văn bản để so sánh */
function norm(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD') // Tách dấu thanh
    .replace(/[̀-ͯ]/g, '') // Bỏ dấu để so sánh mờ
    .normalize('NFC');
}

/**
 * Kiểm tra xem triệu chứng bệnh nhân có khớp với một hàng KB không
 * Khớp theo: tên chuẩn hoặc bất kỳ synonym nào
 */
function symptomsMatch(
  patientSymptom: string,
  kbSymptom: string,
  synonyms: string | null
): boolean {
  const pNorm = norm(patientSymptom);
  const sNorm = norm(kbSymptom);

  // Khớp trực tiếp
  if (pNorm === sNorm) return true;
  if (pNorm.includes(sNorm) || sNorm.includes(pNorm)) return true;

  // Khớp theo synonym
  if (synonyms) {
    const synList = synonyms
      .split(';')
      .map(s => norm(s.trim()))
      .filter(Boolean);
    if (synList.some(syn => pNorm === syn || pNorm.includes(syn) || syn.includes(pNorm))) {
      return true;
    }
  }

  return false;
}

/** Lấy danh sách triệu chứng duy nhất của một hội chứng */
function getUniqueSymptoms(rows: KnowledgeRow[]): string[] {
  return [...new Set(rows.map(r => r.symptom))];
}

/** Nhóm các hàng KB theo hội chứng */
function groupBySyndrome(rows: KnowledgeRow[]): Map<string, KnowledgeRow[]> {
  const map = new Map<string, KnowledgeRow[]>();
  for (const row of rows) {
    if (!map.has(row.syndrome)) map.set(row.syndrome, []);
    map.get(row.syndrome)!.push(row);
  }
  return map;
}

// ============================================================
// Bước 3: Tính điểm phù hợp (fit score)
// fit(p, r) theo công thức trong đề cương
// ============================================================

function computeFitScore(
  observedFeatures: string[],
  rowFeature: string | null
): number {
  // Trường hợp 1: Hàng không có đặc điểm → fit = 1
  if (!rowFeature || rowFeature.trim() === '') {
    return 1;
  }

  // Trường hợp 2: Hàng có đặc điểm
  const rowFeatures = rowFeature
    .split(';')
    .map(f => norm(f.trim()))
    .filter(Boolean);

  if (rowFeatures.length === 0) return 1;

  // Không có đặc điểm nào được quan sát → fit = 0
  if (observedFeatures.length === 0) return 0;

  const normalizedObserved = observedFeatures.map(norm);

  // Đếm số đặc điểm khớp
  let matchCount = 0;
  for (const rf of rowFeatures) {
    const matched = normalizedObserved.some(
      of => of.includes(rf) || rf.includes(of)
    );
    if (matched) matchCount++;
  }

  return matchCount / rowFeatures.length;
}

// ============================================================
// Bước 4: Tính điểm hội chứng
// Score(s) = Σ best_fit(p) / |T_S|
// Với mỗi triệu chứng duy nhất p trong hội chứng s:
//   - Nếu bệnh nhân có p → lấy fit cao nhất trong các dòng KB chứa p
//   - Nếu bệnh nhân không có p → fit = 0
// Chia tổng cho |T_S| (số triệu chứng duy nhất của hội chứng) → score ∈ [0, 1]
// ============================================================

function computeSyndromeScore(
  patientSymptoms: string[],
  featuresMap: Map<string, string[]>, // symptom → observed features
  syndromeRows: KnowledgeRow[]
): { score: number; matchedSymptoms: MatchedSymptom[]; totalSymptoms: number; matchedCount: number } {
  const syndromeUniqueSymptoms = getUniqueSymptoms(syndromeRows);
  const totalSymptoms = syndromeUniqueSymptoms.length;

  let totalFit = 0;
  const matchedSymptoms: MatchedSymptom[] = [];
  let matchedCount = 0;

  // Lặp qua từng triệu chứng DUY NHẤT của hội chứng
  for (const kbSymptom of syndromeUniqueSymptoms) {
    // Lấy tất cả dòng KB cho triệu chứng này trong hội chứng
    const symptomRows = syndromeRows.filter(r => r.symptom === kbSymptom);
    const synonyms = symptomRows[0]?.synonym || null;

    // Tìm triệu chứng bệnh nhân khớp
    const matchingPatientSymptom = patientSymptoms.find(ps =>
      symptomsMatch(ps, kbSymptom, synonyms)
    );

    // Triệu chứng vắng mặt → điểm triệu chứng = 0 (không cộng)
    if (!matchingPatientSymptom) continue;

    // Lấy đặc điểm đã quan sát (từ bước hỏi đặc điểm trước)
    const observedFeatures =
      featuresMap.get(norm(kbSymptom)) ||
      featuresMap.get(norm(matchingPatientSymptom)) ||
      [];

    // Tính fit cho TẤT CẢ dòng của triệu chứng này
    // (mỗi dòng là một tổ hợp đặc điểm khác nhau của cùng một triệu chứng)
    const rowFits = symptomRows.map(row => computeFitScore(observedFeatures, row.feature));

    // Điểm triệu chứng = TRUNG BÌNH fit của tất cả dòng → [0, 1]
    const symptomScore = rowFits.reduce((a, b) => a + b, 0) / rowFits.length;

    totalFit += symptomScore;

    if (symptomScore > 0) {
      matchedCount++;
      // Dùng dòng có fit cao nhất để hiển thị giải thích
      const bestIdx = rowFits.indexOf(Math.max(...rowFits));
      const bestRow = symptomRows[bestIdx];
      matchedSymptoms.push({
        symptom: kbSymptom,
        feature: bestRow.feature,
        mechanism: bestRow.mechanism,
        fit_score: symptomScore,
      });
    }
  }

  return {
    score: totalSymptoms > 0 ? totalFit / totalSymptoms : 0,
    matchedSymptoms,
    totalSymptoms,
    matchedCount,
  };
}

// ============================================================
// Bước 5: Chọn tập hội chứng tối ưu (Greedy Set Cover)
// ============================================================

function greedySetCover(
  patientSymptoms: string[],
  syndromeScores: SyndromeStat[],
  syndromeSymptomMap: Map<string, string[]>,
  allRows: KnowledgeRow[]
): { selectedSyndromes: SyndromeStat[]; hasOverlap: boolean } {
  if (syndromeScores.length === 0) {
    return { selectedSyndromes: [], hasOverlap: false };
  }

  // Sắp xếp theo điểm giảm dần
  const sorted = [...syndromeScores].sort((a, b) => b.score - a.score);

  const selected: SyndromeStat[] = [];
  const coveredPatientSymptoms = new Set<string>();

  // Hàm kiểm tra hội chứng có bao phủ triệu chứng bệnh nhân nào mới không
  const getNewlyCovered = (syndrome: string): string[] => {
    const sRows = allRows.filter(r => r.syndrome === syndrome);
    return patientSymptoms.filter(ps => {
      const matchesKB = sRows.some(r => symptomsMatch(ps, r.symptom, r.synonym));
      return matchesKB && !coveredPatientSymptoms.has(norm(ps));
    });
  };

  // Thêm hội chứng đầu tiên (điểm cao nhất)
  selected.push(sorted[0]);
  const firstNewlyCovered = getNewlyCovered(sorted[0].syndrome);
  firstNewlyCovered.forEach(s => coveredPatientSymptoms.add(norm(s)));

  // Thêm các hội chứng tiếp theo nếu giải thích được triệu chứng mới
  for (let i = 1; i < sorted.length; i++) {
    const candidate = sorted[i];
    // Ngưỡng tối thiểu: điểm > 0.1 để loại bỏ hội chứng không liên quan
    if (candidate.score < 0.05) break;

    const newlyCovered = getNewlyCovered(candidate.syndrome);
    if (newlyCovered.length > 0) {
      selected.push(candidate);
      newlyCovered.forEach(s => coveredPatientSymptoms.add(norm(s)));
    }

    // Dừng khi đã bao phủ hết triệu chứng bệnh nhân
    if (coveredPatientSymptoms.size >= patientSymptoms.length) break;

    // Giới hạn tối đa 4 hội chứng để tránh phân tán
    if (selected.length >= 4) break;
  }

  // Kiểm tra chồng lấp: có cặp hội chứng nào chia sẻ triệu chứng không?
  let hasOverlap = false;
  if (selected.length > 1) {
    const symptomSets = selected.map(s => {
      const sSymptoms = syndromeSymptomMap.get(s.syndrome) || [];
      return new Set(sSymptoms.map(sym => norm(sym)));
    });

    outer: for (let i = 0; i < symptomSets.length; i++) {
      for (let j = i + 1; j < symptomSets.length; j++) {
        for (const sym of symptomSets[i]) {
          if (symptomSets[j].has(sym)) {
            hasOverlap = true;
            break outer;
          }
        }
      }
    }
  }

  return { selectedSyndromes: selected, hasOverlap };
}

// ============================================================
// Bước 6: Tính triệu chứng phân biệt (Discriminating Symptoms)
// ============================================================

function findDiscriminatingSymptoms(
  selectedSyndromes: SyndromeStat[],
  syndromeSymptomMap: Map<string, string[]>,
  patientSymptoms: string[]
): string[] {
  if (selectedSyndromes.length <= 1) return [];

  const allDiscriminating: string[] = [];

  for (const ss of selectedSyndromes) {
    const sSymptoms = syndromeSymptomMap.get(ss.syndrome) || [];

    // Triệu chứng duy nhất của hội chứng này (không chia sẻ với hội chứng khác)
    const uniqueToThis = sSymptoms.filter(sym => {
      const normSym = norm(sym);
      return !selectedSyndromes.some(
        other =>
          other.syndrome !== ss.syndrome &&
          (syndromeSymptomMap.get(other.syndrome) || []).some(
            otherSym => norm(otherSym) === normSym
          )
      );
    });

    // Lọc ra triệu chứng chưa có ở bệnh nhân
    for (const uniqueSym of uniqueToThis) {
      const patientHas = patientSymptoms.some(ps =>
        symptomsMatch(ps, uniqueSym, null)
      );
      if (!patientHas && !allDiscriminating.includes(uniqueSym)) {
        allDiscriminating.push(uniqueSym);
      }
    }
  }

  return allDiscriminating;
}

// ============================================================
// Bước 1 (phần Reasoning): Kiểm tra tồn tại trong KB & loại trùng
// ============================================================

/** Kiểm tra server-side: triệu chứng có trong KB không (không dùng LLM) */
export function verifyInKB(normalizedSymptom: string, knownSymptoms: string[]): boolean {
  const n = norm(normalizedSymptom);
  return knownSymptoms.some(s => norm(s) === n);
}

/** Reasoning: parse raw_answer của người dùng thành danh sách đặc điểm khớp KB
 *  KHÔNG dùng LLM — chỉ so khớp chuỗi với danh sách đặc điểm từ KB
 */
export function parseRawAnswerToFeatures(rawAnswer: string, knownFeatures: string[]): string[] {
  if (!rawAnswer.trim()) return [];
  const normAnswer = norm(rawAnswer);

  const matched: string[] = [];
  for (const feature of knownFeatures) {
    const normFeat = norm(feature);
    // Khớp khi đặc điểm KB xuất hiện trong câu trả lời (hoặc ngược lại nếu câu ngắn)
    if (normAnswer.includes(normFeat) || (normFeat.length >= 4 && normFeat.includes(normAnswer.split(' ')[0]))) {
      matched.push(feature);
    }
  }

  // Nếu không khớp term nào nhưng user đã nhập → giữ raw text để tính fit một phần
  if (matched.length === 0 && rawAnswer.trim().length >= 2) {
    return [rawAnswer.trim()];
  }
  return matched;
}

// ============================================================
// HÀM CHÍNH: Chạy toàn bộ Reasoning Engine
// ============================================================

export async function runReasoning(
  patientSymptoms: string[],
  featureAnswers: SymptomFeatures[],
  allKnowledgeRows: KnowledgeRow[]
): Promise<ReasoningResult> {
  // Xây dựng map đặc điểm: tên triệu chứng → danh sách đặc điểm quan sát
  const featuresMap = new Map<string, string[]>();
  for (const fa of featureAnswers) {
    featuresMap.set(norm(fa.symptom), fa.observed_features);
  }

  // Nhóm KB theo hội chứng
  const bySyndrome = groupBySyndrome(allKnowledgeRows);

  // Xây dựng map: hội chứng → danh sách triệu chứng duy nhất
  const syndromeSymptomMap = new Map<string, string[]>();
  for (const [syndrome, rows] of bySyndrome) {
    syndromeSymptomMap.set(syndrome, getUniqueSymptoms(rows));
  }

  // --- Bước 3 & 4: Tính điểm cho tất cả hội chứng ---
  const allSyndromeStats: SyndromeStat[] = [];

  for (const [syndrome, rows] of bySyndrome) {
    // Chỉ tính hội chứng có ít nhất 1 triệu chứng khớp với bệnh nhân
    const hasAnyMatch = patientSymptoms.some(ps =>
      rows.some(r => symptomsMatch(ps, r.symptom, r.synonym))
    );
    if (!hasAnyMatch) continue;

    const { score, matchedSymptoms, totalSymptoms, matchedCount } =
      computeSyndromeScore(patientSymptoms, featuresMap, rows);

    if (score > 0) {
      allSyndromeStats.push({
        syndrome,
        score,
        matched_symptoms: matchedSymptoms,
        total_syndrome_symptoms: totalSymptoms,
        matched_count: matchedCount,
      });
    }
  }

  // Sắp xếp theo điểm giảm dần
  allSyndromeStats.sort((a, b) => b.score - a.score);

  // --- Bước 5: Greedy Set Cover ---
  const { selectedSyndromes, hasOverlap } = greedySetCover(
    patientSymptoms,
    allSyndromeStats,
    syndromeSymptomMap,
    allKnowledgeRows
  );

  // --- Bước 6: Tính triệu chứng phân biệt (nếu có chồng lấp) ---
  const discriminatingSymptoms = hasOverlap
    ? findDiscriminatingSymptoms(selectedSyndromes, syndromeSymptomMap, patientSymptoms)
    : [];

  // Xác định độ tin cậy
  let confidence: 'cao' | 'trung_bình' | 'thấp' = 'thấp';
  if (selectedSyndromes.length > 0) {
    const topScore = selectedSyndromes[0].score;
    if (topScore >= 0.65) confidence = 'cao';
    else if (topScore >= 0.35) confidence = 'trung_bình';
  }

  // Tính triệu chứng đã/chưa giải thích
  const coveredSet = new Set<string>();
  for (const ss of selectedSyndromes) {
    const sRows = allKnowledgeRows.filter(r => r.syndrome === ss.syndrome);
    for (const ps of patientSymptoms) {
      if (sRows.some(r => symptomsMatch(ps, r.symptom, r.synonym))) {
        coveredSet.add(ps);
      }
    }
  }
  const coveredSymptoms = patientSymptoms.filter(ps => coveredSet.has(ps));
  const uncoveredSymptoms = patientSymptoms.filter(ps => !coveredSet.has(ps));

  return {
    syndrome_scores: allSyndromeStats,
    optimal_syndromes: selectedSyndromes,
    has_overlap: hasOverlap,
    discriminating_symptoms: discriminatingSymptoms,
    is_final: !hasOverlap || discriminatingSymptoms.length === 0,
    covered_symptoms: coveredSymptoms,
    uncovered_symptoms: uncoveredSymptoms,
    confidence,
  };
}

// ============================================================
// Bước 7: Cập nhật và suy luận lại sau Level-2
// ============================================================

export async function updateAndRereason(
  patientSymptoms: string[],
  featureAnswers: SymptomFeatures[],
  confirmedDisambiguation: string[], // Triệu chứng phân biệt được xác nhận
  allKnowledgeRows: KnowledgeRow[]
): Promise<ReasoningResult> {
  // Bổ sung triệu chứng phân biệt đã xác nhận vào danh sách bệnh nhân
  const updatedSymptoms = [
    ...patientSymptoms,
    ...confirmedDisambiguation.filter(
      s => !patientSymptoms.some(ps => norm(ps) === norm(s))
    ),
  ];

  // Chạy lại reasoning với danh sách triệu chứng đã cập nhật
  const result = await runReasoning(
    updatedSymptoms,
    featureAnswers,
    allKnowledgeRows
  );

  // Kết quả sau bước 7 luôn là final
  return { ...result, is_final: true };
}

// ============================================================
// Xây dựng chuỗi giải thích cho UI
// ============================================================

export function buildExplanationChains(
  syndromes: SyndromeStat[]
): { syndrome: string; score: number; score_percent: string; steps: { symptom: string; feature: string | null; mechanism: string; fit_score: number }[] }[] {
  return syndromes.map(ss => ({
    syndrome: ss.syndrome,
    score: ss.score,
    score_percent: `${(ss.score * 100).toFixed(0)}%`,
    steps: ss.matched_symptoms.map(ms => ({
      symptom: ms.symptom,
      feature: ms.feature,
      mechanism: ms.mechanism,
      fit_score: ms.fit_score,
    })),
  }));
}
