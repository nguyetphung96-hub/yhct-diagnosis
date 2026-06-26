/**
 * Reasoning Engine — Hệ thống Hỗ trợ Chẩn đoán YHCT
 *
 * Triển khai thuật toán suy luận 8 bước theo đề cương luận văn.
 * Toàn bộ logic là XAI nội tại (Intrinsic XAI) — không dùng LLM.
 *
 * Cấu trúc KB: mỗi hàng = (syndrome, symptom, synonym, feature, mechanism)
 *   - Một symptom có thể xuất hiện ở nhiều syndrome (nhiều hàng)
 *   - Một (syndrome, symptom) có thể có nhiều hàng nếu có nhiều tổ hợp feature
 */

import { KnowledgeRow, SyndromeStat, MatchedSymptom, ReasoningResult, SymptomFeatures } from '@/types';

// ============================================================
// TIỆN ÍCH
// ============================================================

/**
 * Chuẩn hóa chuỗi để so sánh mờ:
 * lowercase → chuẩn hóa khoảng trắng → bỏ dấu tiếng Việt
 */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC');
}

/**
 * Kiểm tra triệu chứng bệnh nhân có khớp với một mục KB không.
 * Khớp theo: tên chuẩn (exact / substring) HOẶC bất kỳ synonym nào.
 *
 * Export để dùng trong extract route khi tìm canonical name.
 */
export function symptomsMatch(
  patientSymptom: string,
  kbSymptom: string,
  synonym: string | null
): boolean {
  const p = norm(patientSymptom);
  const s = norm(kbSymptom);

  // So khớp tên chuẩn
  if (p === s) return true;
  if (p.length >= 4 && (p.includes(s) || s.includes(p))) return true;

  // So khớp synonym (phân cách bởi ';')
  if (synonym) {
    for (const syn of synonym.split(';').map(x => norm(x.trim())).filter(Boolean)) {
      if (p === syn) return true;
      if (syn.length >= 4 && (p.includes(syn) || syn.includes(p))) return true;
    }
  }

  return false;
}

// ============================================================
// BƯỚC 3 — Tính điểm phù hợp fit(p, r)
//
// Với mỗi dòng r trong KB:
//   - r.feature = NULL/rỗng  → fit = 1  (triệu chứng khớp, không cần đặc điểm)
//   - r.feature có giá trị
//       + observedFeatures rỗng  → fit = 0  (có đặc điểm nhưng không có thông tin)
//       + observedFeatures có giá trị → fit = số_đặc_điểm_khớp / tổng_đặc_điểm_dòng
// ============================================================

function computeFitScore(
  observedFeatures: string[],  // đặc điểm bác sĩ đã xác nhận cho triệu chứng này
  rowFeature: string | null    // cột feature của dòng KB
): number {
  // Dòng KB không có đặc điểm → fit = 1
  if (!rowFeature || rowFeature.trim() === '') return 1;

  // Parse đặc điểm KB (phân cách bởi ';' hoặc ',')
  const kbFeatures = rowFeature
    .split(/[;,]/)
    .map(f => f.trim())
    .filter(f => f.length >= 2);

  if (kbFeatures.length === 0) return 1;

  // Có đặc điểm KB nhưng không có thông tin bác sĩ → fit = 0
  if (observedFeatures.length === 0) return 0;

  // Đếm đặc điểm KB khớp với observedFeatures (so sánh mờ)
  const normObs = observedFeatures.map(norm);
  let matched = 0;
  for (const kf of kbFeatures) {
    const nkf = norm(kf);
    if (normObs.some(no => no.includes(nkf) || nkf.includes(no))) matched++;
  }

  return matched / kbFeatures.length;
}

// ============================================================
// BƯỚC 4 — Tính điểm hội chứng score(s)
//
// score(s) = Σ symptomScore(p) / |T_s|
//
// T_s = tập triệu chứng duy nhất của hội chứng s
// Với mỗi p ∈ T_s:
//   - Bệnh nhân không có p → symptomScore(p) = 0 (không cộng vào Σ, nhưng vẫn tính vào mẫu |T_s|)
//   - Bệnh nhân có p       → symptomScore(p) = trung bình fit của tất cả dòng (s, p) trong KB
// ============================================================

function computeSyndromeScore(
  patientSymptoms: string[],
  featuresMap: Map<string, string[]>,  // norm(canonical symptom name) → observed features
  syndromeRows: KnowledgeRow[]         // tất cả dòng KB của hội chứng này
): {
  score: number;
  matchedSymptoms: MatchedSymptom[];
  totalSymptoms: number;  // |T_s|
  matchedCount: number;   // số triệu chứng bệnh nhân khớp
} {
  // Lấy tập triệu chứng duy nhất T_s
  const uniqueKBSymptoms = [...new Set(syndromeRows.map(r => r.symptom))];
  const totalSymptoms = uniqueKBSymptoms.length;

  let totalFit = 0;
  let matchedCount = 0;
  const matchedSymptoms: MatchedSymptom[] = [];

  for (const kbSym of uniqueKBSymptoms) {
    // Lấy tất cả dòng KB của (syndrome, symptom) này
    const rows = syndromeRows.filter(r => r.symptom === kbSym);
    const synonym = rows[0]?.synonym ?? null;

    // Tìm triệu chứng bệnh nhân khớp với kbSym (qua tên hoặc synonym)
    const patientSym = patientSymptoms.find(ps => symptomsMatch(ps, kbSym, synonym));

    // Bệnh nhân không có triệu chứng này → symptomScore = 0, bỏ qua (mẫu vẫn là |T_s|)
    if (!patientSym) continue;

    // Lấy đặc điểm bác sĩ đã cung cấp
    // Ưu tiên tra theo canonical KB name, fallback sang patient term
    const observed =
      featuresMap.get(norm(kbSym)) ??
      featuresMap.get(norm(patientSym)) ??
      [];

    // Tính fit cho TẤT CẢ dòng của (s, p), rồi lấy trung bình
    const fits = rows.map(r => computeFitScore(observed, r.feature));
    const symptomScore = fits.reduce((a, b) => a + b, 0) / fits.length;

    totalFit += symptomScore;

    if (symptomScore > 0) {
      matchedCount++;
      // Lấy dòng có fit cao nhất để hiển thị giải thích
      const bestIdx = fits.indexOf(Math.max(...fits));
      matchedSymptoms.push({
        symptom: kbSym,
        feature: rows[bestIdx].feature,
        mechanism: rows[bestIdx].mechanism,
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
// BƯỚC 5 — Greedy Set Cover
//
// Tìm tập K ⊆ {hội chứng có điểm > 0} sao cho:
//   - Giải thích được tối đa triệu chứng bệnh nhân
//   - Với số lượng hội chứng ít nhất
//
// Thuật toán:
//   1. Sắp xếp hội chứng theo điểm giảm dần
//   2. Chọn hội chứng điểm cao nhất vào K
//   3. Với mỗi hội chứng còn lại: thêm vào K nếu và chỉ nếu
//      giải thích được ít nhất 1 triệu chứng bệnh nhân MỚI
//      (chưa được hội chứng nào trong K giải thích)
//   4. Dừng khi đã giải thích hết P hoặc không còn hội chứng nào bổ sung
//
// Sau khi có K: kiểm tra chồng lấp triệu chứng KB giữa các cặp hội chứng
//   → hasOverlap = true  → cần bước 6, 7
//   → hasOverlap = false → bỏ qua bước 6, 7, đến bước 8
// ============================================================

function greedySetCover(
  patientSymptoms: string[],
  syndromeScores: SyndromeStat[],
  syndromeSymptomMap: Map<string, string[]>,
  allRows: KnowledgeRow[]
): { selectedSyndromes: SyndromeStat[]; hasOverlap: boolean } {
  if (syndromeScores.length === 0) return { selectedSyndromes: [], hasOverlap: false };

  // Sắp xếp theo điểm giảm dần
  const sorted = [...syndromeScores].sort((a, b) => b.score - a.score);

  const K: SyndromeStat[] = [];
  const covered = new Set<string>(); // norm(patient_symptom) đã được giải thích

  /**
   * Trả về danh sách triệu chứng bệnh nhân mà syndrome này giải thích được
   * và chưa có trong covered (triệu chứng MỚI)
   */
  const getNewCoverage = (syndromeName: string): string[] => {
    const rows = allRows.filter(r => r.syndrome === syndromeName);
    return patientSymptoms.filter(ps => {
      if (covered.has(norm(ps))) return false; // đã được giải thích rồi
      return rows.some(r => symptomsMatch(ps, r.symptom, r.synonym));
    });
  };

  for (const s of sorted) {
    const newCoverage = getNewCoverage(s.syndrome);

    if (K.length === 0) {
      // Luôn chọn hội chứng điểm cao nhất làm điểm khởi đầu
      K.push(s);
      newCoverage.forEach(ps => covered.add(norm(ps)));
    } else if (newCoverage.length > 0) {
      // Chỉ thêm nếu giải thích được ít nhất 1 triệu chứng MỚI
      K.push(s);
      newCoverage.forEach(ps => covered.add(norm(ps)));
    }

    // Dừng sớm nếu đã giải thích hết tất cả triệu chứng bệnh nhân
    if (covered.size >= patientSymptoms.length) break;
  }

  // Kiểm tra chồng lấp: có cặp (Si, Sj) nào chia sẻ triệu chứng KB không?
  let hasOverlap = false;
  if (K.length > 1) {
    const symptomSets = K.map(s => {
      const syms = syndromeSymptomMap.get(s.syndrome) || [];
      return new Set(syms.map(norm));
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

  return { selectedSyndromes: K, hasOverlap };
}

// ============================================================
// BƯỚC 6 — Tìm tập triệu chứng phân biệt
//
// Chỉ chạy khi hasOverlap = true (K có hội chứng chia sẻ triệu chứng)
//
// Với mỗi Si ∈ K:
//   Di = { sym ∈ T_Si | sym ∉ T_Sj ∀ Sj ∈ K, j ≠ i }
//   (triệu chứng đặc trưng riêng của Si, không chia sẻ với hội chứng nào khác trong K)
//
// Loại bỏ từ Di những triệu chứng bệnh nhân đã có trong P
// (dùng symptomsMatch với synonym để tránh hỏi lại VD "chóng mặt" = "Váng đầu mắt hoa")
//
// Trả về ∪ Di (tất cả triệu chứng phân biệt cần hỏi)
// ============================================================

function findDiscriminatingSymptoms(
  K: SyndromeStat[],
  syndromeSymptomMap: Map<string, string[]>,
  patientSymptoms: string[],
  allRows: KnowledgeRow[]
): string[] {
  const discriminating: string[] = [];

  for (const si of K) {
    const siSyms = syndromeSymptomMap.get(si.syndrome) || [];

    // Di: triệu chứng chỉ thuộc Si, không thuộc bất kỳ Sj nào khác trong K
    const Di = siSyms.filter(sym => {
      const nSym = norm(sym);
      return !K.some(
        sj =>
          sj.syndrome !== si.syndrome &&
          (syndromeSymptomMap.get(sj.syndrome) || []).some(s => norm(s) === nSym)
      );
    });

    // Loại bỏ những gì bệnh nhân đã có trong P
    for (const sym of Di) {
      // Tra synonym từ KB để so sánh chính xác
      const kbRow = allRows.find(r => r.symptom === sym);
      const synonym = kbRow?.synonym ?? null;
      const patientAlreadyHas = patientSymptoms.some(ps => symptomsMatch(ps, sym, synonym));

      if (!patientAlreadyHas && !discriminating.includes(sym)) {
        discriminating.push(sym);
      }
    }
  }

  return discriminating;
}

// ============================================================
// HÀM PHỤ TRỢ — Parse câu trả lời thô → observed features
//
// Dùng trong route handler để chuyển raw_answer (text của bác sĩ)
// thành danh sách đặc điểm khớp với KB (không dùng LLM)
// ============================================================

export function parseRawAnswerToFeatures(
  rawAnswer: string,
  knownFeatures: string[]  // đặc điểm từ KB cho triệu chứng này
): string[] {
  if (!rawAnswer.trim()) return [];

  const normAnswer = norm(rawAnswer);
  const matched: string[] = [];

  for (const feat of knownFeatures) {
    const nFeat = norm(feat);
    // Khớp nếu đặc điểm KB xuất hiện trong câu trả lời của bác sĩ
    if (normAnswer.includes(nFeat)) {
      matched.push(feat);
      continue;
    }
    // Khớp ngược: từng từ trong đặc điểm KB đều có trong câu trả lời
    if (nFeat.length >= 4) {
      const words = nFeat.split(' ').filter(w => w.length >= 3);
      if (words.length > 0 && words.every(w => normAnswer.includes(w))) {
        matched.push(feat);
      }
    }
  }

  // Nếu không khớp term nào nhưng bác sĩ đã nhập → giữ raw text
  // (để computeFitScore có thể tính partial match)
  if (matched.length === 0 && rawAnswer.trim().length >= 2) {
    return [rawAnswer.trim()];
  }

  return matched;
}

// ============================================================
// HÀM CHÍNH — runReasoning (Bước 3 → 6)
// ============================================================

export async function runReasoning(
  patientSymptoms: string[],       // triệu chứng bệnh nhân đã được chuẩn hóa (canonical KB names)
  featureAnswers: SymptomFeatures[], // đặc điểm đã parse (observed_features đã có)
  allKnowledgeRows: KnowledgeRow[]
): Promise<ReasoningResult> {

  // Xây dựng featuresMap: norm(canonical_symptom) → observed_features
  const featuresMap = new Map<string, string[]>();
  for (const fa of featureAnswers) {
    featuresMap.set(norm(fa.symptom), fa.observed_features);
  }

  // Nhóm KB theo hội chứng
  const bySyndrome = new Map<string, KnowledgeRow[]>();
  for (const row of allKnowledgeRows) {
    if (!bySyndrome.has(row.syndrome)) bySyndrome.set(row.syndrome, []);
    bySyndrome.get(row.syndrome)!.push(row);
  }

  // Map: syndrome → danh sách triệu chứng duy nhất (T_s)
  const syndromeSymptomMap = new Map<string, string[]>();
  for (const [syndrome, rows] of bySyndrome) {
    syndromeSymptomMap.set(syndrome, [...new Set(rows.map(r => r.symptom))]);
  }

  // ── Bước 3 & 4: Tính điểm tất cả hội chứng ──────────────────
  const allSyndromeStats: SyndromeStat[] = [];

  for (const [syndrome, rows] of bySyndrome) {
    // Bỏ qua nếu không có triệu chứng nào của bệnh nhân khớp
    const anyMatch = patientSymptoms.some(ps =>
      rows.some(r => symptomsMatch(ps, r.symptom, r.synonym))
    );
    if (!anyMatch) continue;

    const { score, matchedSymptoms, totalSymptoms, matchedCount } =
      computeSyndromeScore(patientSymptoms, featuresMap, rows);

    // Chỉ đưa vào danh sách nếu có điểm > 0
    if (score > 0) {
      allSyndromeStats.push({ syndrome, score, matched_symptoms: matchedSymptoms, total_syndrome_symptoms: totalSymptoms, matched_count: matchedCount });
    }
  }

  // Sắp xếp theo điểm giảm dần
  allSyndromeStats.sort((a, b) => b.score - a.score);

  // ── Bước 5: Greedy Set Cover → K ────────────────────────────
  const { selectedSyndromes, hasOverlap } = greedySetCover(
    patientSymptoms,
    allSyndromeStats,
    syndromeSymptomMap,
    allKnowledgeRows
  );

  // ── Bước 6: Triệu chứng phân biệt (chỉ khi có chồng lấp) ───
  // Nếu không có chồng lấp → bỏ qua bước 6 & 7, đến thẳng bước 8
  const discriminatingSymptoms = hasOverlap
    ? findDiscriminatingSymptoms(selectedSyndromes, syndromeSymptomMap, patientSymptoms, allKnowledgeRows)
    : [];

  // ── Xác định triệu chứng đã/chưa giải thích ──────────────────
  const coveredSet = new Set<string>();
  for (const ss of selectedSyndromes) {
    const rows = allKnowledgeRows.filter(r => r.syndrome === ss.syndrome);
    for (const ps of patientSymptoms) {
      if (rows.some(r => symptomsMatch(ps, r.symptom, r.synonym))) {
        coveredSet.add(ps);
      }
    }
  }
  const coveredSymptoms = patientSymptoms.filter(ps => coveredSet.has(ps));
  const uncoveredSymptoms = patientSymptoms.filter(ps => !coveredSet.has(ps));

  // ── Độ tin cậy ────────────────────────────────────────────────
  let confidence: 'cao' | 'trung_bình' | 'thấp' = 'thấp';
  if (selectedSyndromes.length > 0) {
    const top = selectedSyndromes[0].score;
    if (top >= 0.65) confidence = 'cao';
    else if (top >= 0.35) confidence = 'trung_bình';
  }

  // is_final: không cần hỏi thêm (không chồng lấp, hoặc không có triệu chứng phân biệt)
  const is_final = !hasOverlap || discriminatingSymptoms.length === 0;

  return {
    syndrome_scores: allSyndromeStats,
    optimal_syndromes: selectedSyndromes,
    has_overlap: hasOverlap,
    discriminating_symptoms: discriminatingSymptoms,
    is_final,
    covered_symptoms: coveredSymptoms,
    uncovered_symptoms: uncoveredSymptoms,
    confidence,
  };
}

// ============================================================
// BƯỚC 7 — Cập nhật và suy luận lại
//
// Sau khi bác sĩ trả lời câu hỏi phân biệt (Level 2):
//   - Thêm triệu chứng bác sĩ xác nhận "Có" vào P
//   - Chạy lại Bước 3→6 với P đã cập nhật
//   - Kết quả lần này là kết quả cuối (is_final = true)
// ============================================================

export async function updateAndRereason(
  patientSymptoms: string[],
  featureAnswers: SymptomFeatures[],
  confirmedDisambiguation: string[],  // triệu chứng bác sĩ xác nhận "Có" từ bước 6
  allKnowledgeRows: KnowledgeRow[]
): Promise<ReasoningResult> {
  // Bổ sung triệu chứng mới đã xác nhận vào P (tránh trùng)
  const updatedSymptoms = [
    ...patientSymptoms,
    ...confirmedDisambiguation.filter(
      s => !patientSymptoms.some(ps => norm(ps) === norm(s))
    ),
  ];

  // Chạy lại toàn bộ bước 3→6 với P đã cập nhật
  const result = await runReasoning(updatedSymptoms, featureAnswers, allKnowledgeRows);

  // Kết quả sau bước 7 là kết quả cuối
  return { ...result, is_final: true };
}
