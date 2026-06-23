// ============================================================
// Types cho Hệ thống Hỗ trợ Chẩn đoán YHCT
// ============================================================

/** Một hàng trong cơ sở tri thức */
export interface KnowledgeRow {
  id: number;
  symptom: string;       // Tên triệu chứng chuẩn hóa
  synonym: string | null; // Tên đồng nghĩa, phân cách bởi ;
  feature: string | null; // Đặc điểm triệu chứng, phân cách bởi ;
  mechanism: string;     // Cơ chế bệnh sinh
  syndrome: string;      // Tên hội chứng
  category?: string;     // Phân loại hội chứng
}

/** Triệu chứng được trích xuất từ văn bản lâm sàng */
export interface ExtractedSymptom {
  original: string;      // Cách diễn đạt trong văn bản gốc
  normalized: string;    // Tên chuẩn hóa khớp với KB
  found_in_kb: boolean;  // Có tìm thấy trong cơ sở tri thức không
}

/** Câu hỏi khai thác đặc điểm triệu chứng (Level 1) */
export interface FeatureQuestion {
  symptom: string;       // Tên triệu chứng
  features_to_ask: string[]; // Các đặc điểm cần hỏi
  question: string;      // Câu hỏi tự nhiên bằng tiếng Việt
}

/** Đặc điểm triệu chứng đã quan sát được */
export interface SymptomFeatures {
  symptom: string;
  observed_features: string[]; // Các đặc điểm đã xác nhận
  raw_answer?: string;         // Câu trả lời thô từ bác sĩ
}

/** Triệu chứng đã khớp với hội chứng + giải thích */
export interface MatchedSymptom {
  symptom: string;
  feature: string | null;
  mechanism: string;
  fit_score: number;     // 0–1, điểm phù hợp
}

/** Điểm số và chi tiết của một hội chứng */
export interface SyndromeStat {
  syndrome: string;
  score: number;                          // 0–1
  matched_symptoms: MatchedSymptom[];
  total_syndrome_symptoms: number;        // Tổng số triệu chứng trong hội chứng
  matched_count: number;                  // Số triệu chứng bệnh nhân khớp
}

/** Kết quả reasoning Engine */
export interface ReasoningResult {
  syndrome_scores: SyndromeStat[];        // Tất cả hội chứng có điểm > 0, sắp xếp giảm dần
  optimal_syndromes: SyndromeStat[];      // Tập hội chứng tối ưu (greedy set cover)
  has_overlap: boolean;                   // Có chồng lấp triệu chứng không
  discriminating_symptoms: string[];      // Triệu chứng phân biệt cần hỏi (Level 2)
  is_final: boolean;                      // Kết quả cuối hay còn cần hỏi thêm
  covered_symptoms: string[];             // Triệu chứng đã được giải thích
  uncovered_symptoms: string[];           // Triệu chứng chưa giải thích được
  confidence: 'cao' | 'trung_bình' | 'thấp';
}

/** Câu hỏi disambiguation Level 2 */
export interface DisambiguationQuestion {
  symptom: string;       // Triệu chứng cần hỏi
  question: string;      // Câu hỏi tự nhiên tiếng Việt
  related_syndromes: string[]; // Liên quan đến hội chứng nào
}

/** Chuỗi giải thích cho bác sĩ */
export interface ExplanationChain {
  syndrome: string;
  score: number;
  score_percent: string;  // "72%"
  steps: ExplanationStep[];
}

export interface ExplanationStep {
  symptom: string;
  feature: string | null;
  mechanism: string;
  fit_score: number;
}

// ============================================================
// App State - trạng thái của toàn bộ ứng dụng
// ============================================================

export type AppStep = 1 | 2 | 3 | 4;

export interface AppState {
  step: AppStep;

  // Bước 1: Nhập liệu
  clinical_text: string;

  // Bước 2: Kết quả trích xuất + câu hỏi Level 1
  extracted_symptoms: ExtractedSymptom[];
  feature_questions: FeatureQuestion[];
  feature_answers: SymptomFeatures[];

  // Bước 3 (tùy chọn): Disambiguation Level 2
  temp_syndromes: SyndromeStat[];
  disambiguation_questions: DisambiguationQuestion[];
  disambiguation_answers: string[];   // triệu chứng bác sĩ xác nhận có

  // Bước 4: Kết quả cuối
  final_result: ReasoningResult | null;
  doctor_selected_syndromes: string[];

  // Trạng thái UI
  loading: boolean;
  error: string | null;
}

// ============================================================
// API Request/Response types
// ============================================================

export interface ExtractRequest {
  clinical_text: string;
}

export interface ExtractResponse {
  extracted_symptoms: ExtractedSymptom[];
  feature_questions: FeatureQuestion[];
  message: string;
}

export interface ReasonRequest {
  symptoms: string[];
  feature_answers: SymptomFeatures[];
}

export interface ReasonResponse {
  result: ReasoningResult;
  disambiguation_questions: DisambiguationQuestion[];
  explanation_narrative: string;  // Tóm tắt bằng tiếng Việt từ LLM
}

export interface FinalizeRequest {
  symptoms: string[];
  feature_answers: SymptomFeatures[];
  confirmed_disambiguation: string[];  // triệu chứng phân biệt đã xác nhận
}

export interface FinalizeResponse {
  result: ReasoningResult;
  explanation_narrative: string;
}
