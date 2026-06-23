-- ============================================================
-- YHCT Diagnosis System - Supabase/PostgreSQL Schema
-- Hệ thống hỗ trợ chẩn đoán hội chứng Y học cổ truyền
-- ============================================================

-- Bảng cơ sở tri thức chính
CREATE TABLE IF NOT EXISTS knowledge_base (
  id          BIGSERIAL PRIMARY KEY,
  symptom     TEXT NOT NULL,          -- Tên triệu chứng (đã chuẩn hóa)
  synonym     TEXT,                    -- Tên đồng nghĩa (phân cách bởi dấu ;)
  feature     TEXT,                    -- Đặc điểm triệu chứng (phân cách bởi dấu ;)
  mechanism   TEXT NOT NULL,           -- Cơ chế bệnh sinh
  syndrome    TEXT NOT NULL,           -- Tên hội chứng
  category    TEXT,                    -- Phân loại: toàn_thân | tạng_phủ | thương_hàn | ôn_bệnh
  source      TEXT,                    -- Nguồn tài liệu tham khảo
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes để tăng tốc độ truy vấn
CREATE INDEX IF NOT EXISTS idx_kb_symptom   ON knowledge_base(symptom);
CREATE INDEX IF NOT EXISTS idx_kb_syndrome  ON knowledge_base(syndrome);
CREATE INDEX IF NOT EXISTS idx_kb_category  ON knowledge_base(category);

-- Full-text search indexes (tiếng Việt dùng 'simple')
CREATE INDEX IF NOT EXISTS idx_kb_symptom_fts
  ON knowledge_base USING GIN(to_tsvector('simple', symptom));

CREATE INDEX IF NOT EXISTS idx_kb_synonym_fts
  ON knowledge_base USING GIN(to_tsvector('simple', COALESCE(synonym, '')));

CREATE INDEX IF NOT EXISTS idx_kb_syndrome_fts
  ON knowledge_base USING GIN(to_tsvector('simple', syndrome));

-- Trigger cập nhật updated_at tự động
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kb_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DỮ LIỆU MẪU (ví dụ minh họa - bạn thay bằng dữ liệu thực)
-- ============================================================

INSERT INTO knowledge_base (symptom, synonym, feature, mechanism, syndrome, category) VALUES
-- Hội chứng Tâm huyết hư
('mất ngủ', 'khó ngủ; không ngủ được', 'khó đi vào giấc ngủ; thức giấc nhiều lần; mơ nhiều', 'Tâm huyết hư không dưỡng thần, thần không an', 'Tâm huyết hư', 'tạng_phủ'),
('hồi hộp', 'đánh trống ngực; tim đập mạnh', NULL, 'Tâm huyết hư, Tâm thần bất an', 'Tâm huyết hư', 'tạng_phủ'),
('hay quên', 'giảm trí nhớ; đãng trí', NULL, 'Huyết không nuôi dưỡng tâm thần', 'Tâm huyết hư', 'tạng_phủ'),
('chóng mặt', 'đầu váng; hoa mắt', 'nhẹ; khi thay đổi tư thế', 'Huyết hư không lên nuôi não', 'Tâm huyết hư', 'tạng_phủ'),
('sắc mặt nhợt nhạt', 'mặt nhợt; da xanh xao', NULL, 'Huyết hư không vinh nhuận cơ nhục', 'Tâm huyết hư', 'tạng_phủ'),
('môi nhợt', 'môi nhạt màu; môi trắng', NULL, 'Huyết hư không vinh nhuận', 'Tâm huyết hư', 'tạng_phủ'),
('lưỡi nhợt', NULL, 'lưỡi màu nhợt; ít rêu', 'Huyết hư', 'Tâm huyết hư', 'tạng_phủ'),
('mạch tế', NULL, 'mạch tế sác hoặc tế nhược', 'Huyết hư mạch không đầy', 'Tâm huyết hư', 'tạng_phủ'),

-- Hội chứng Tâm âm hư
('mất ngủ', 'khó ngủ; không ngủ được', 'khó ngủ; hay thức giấc; chiêm bao nhiều; ngủ không sâu', 'Âm hư hỏa vượng nhiễu loạn tâm thần', 'Tâm âm hư', 'tạng_phủ'),
('hồi hộp', 'đánh trống ngực', 'xuất hiện về đêm hoặc khi xúc động', 'Tâm âm bất túc, tâm thần bất an', 'Tâm âm hư', 'tạng_phủ'),
('miệng khô', 'khô miệng; khát nước', 'về chiều tối hoặc ban đêm', 'Âm dịch bất túc không nhuận miệng họng', 'Tâm âm hư', 'tạng_phủ'),
('ra mồ hôi trộm', 'đạo hãn; mồ hôi ban đêm', NULL, 'Âm hư hỏa vượng bức tân dịch ra ngoài', 'Tâm âm hư', 'tạng_phủ'),
('nóng trong người', 'phiền nhiệt; bứt rứt nóng nảy', 'ngũ tâm phiền nhiệt; về chiều tối', 'Âm hư sinh nội nhiệt', 'Tâm âm hư', 'tạng_phủ'),
('lưỡi đỏ', NULL, 'lưỡi đỏ; ít rêu hoặc không rêu', 'Âm hư hỏa vượng', 'Tâm âm hư', 'tạng_phủ'),
('mạch tế sác', NULL, NULL, 'Âm hư nội nhiệt', 'Tâm âm hư', 'tạng_phủ'),

-- Hội chứng Phế khí hư
('ho', NULL, 'ho nhẹ; ít đờm; tiếng ho yếu; ho kéo dài', 'Phế khí hư, chức năng tuyên giáng giảm', 'Phế khí hư', 'tạng_phủ'),
('thở ngắn', 'khó thở; hơi thở yếu', 'vận động nhẹ đã khó thở; không muốn nói', 'Phế khí bất túc không nuôi dưỡng hô hấp', 'Phế khí hư', 'tạng_phủ'),
('mệt mỏi', 'thần kiệt; uể oải', NULL, 'Phế khí hư không sinh khí', 'Phế khí hư', 'tạng_phủ'),
('hay bị cảm', 'dễ cảm lạnh; hay ốm vặt', NULL, 'Phế khí hư vệ khí không cố biểu', 'Phế khí hư', 'tạng_phủ'),
('ra mồ hôi tự nhiên', 'tự hãn; đổ mồ hôi không vận động', NULL, 'Phế khí hư vệ khí không cố biểu', 'Phế khí hư', 'tạng_phủ'),
('lưỡi nhợt', NULL, 'lưỡi nhợt bệu; rêu trắng', 'Khí hư', 'Phế khí hư', 'tạng_phủ'),
('mạch hư nhược', 'mạch nhược; mạch vô lực', NULL, 'Khí hư mạch không đầy', 'Phế khí hư', 'tạng_phủ'),

-- Hội chứng Can huyết hư
('chóng mặt', 'đầu váng; hoa mắt', 'nặng hơn khi mệt; thoáng qua', 'Can huyết hư không lên nuôi não', 'Can huyết hư', 'tạng_phủ'),
('mắt mờ', 'thị lực giảm; nhìn không rõ', 'khô mắt; mỏi mắt', 'Can huyết hư không nuôi dưỡng mắt', 'Can huyết hư', 'tạng_phủ'),
('móng tay chân khô giòn', 'móng giòn; móng dễ gãy', NULL, 'Huyết hư không nuôi dưỡng gân cân móng', 'Can huyết hư', 'tạng_phủ'),
('chuột rút', 'co rút cơ; vọp bẻ', 'về đêm; khi vận động', 'Can huyết hư không nuôi gân', 'Can huyết hư', 'tạng_phủ'),
('kinh nguyệt ít', 'kinh ít; bế kinh', 'màu nhạt; kinh chậm', 'Huyết hư không đầy xung nhâm', 'Can huyết hư', 'tạng_phủ'),
('sắc mặt nhợt nhạt', 'mặt nhợt; da xanh xao', NULL, 'Huyết hư không vinh nhuận', 'Can huyết hư', 'tạng_phủ'),
('lưỡi nhợt', NULL, NULL, 'Huyết hư', 'Can huyết hư', 'tạng_phủ'),
('mạch tế', NULL, NULL, 'Huyết hư', 'Can huyết hư', 'tạng_phủ'),

-- Hội chứng Thận dương hư
('lưng đau', 'đau lưng; mỏi lưng', 'âm ỉ; liên tục; nặng hơn khi mệt và lạnh', 'Thận dương hư không ôn dưỡng lưng', 'Thận dương hư', 'tạng_phủ'),
('lạnh lưng gối', 'lưng gối lạnh; tứ chi lạnh', 'cảm giác lạnh sâu từ bên trong', 'Thận dương hư không ôn ấm tứ chi', 'Thận dương hư', 'tạng_phủ'),
('tiểu đêm nhiều', 'đái đêm; tiểu nhiều lần đêm', 'tiểu trong dài; lượng nhiều', 'Thận dương hư không cố nhiếp bàng quang', 'Thận dương hư', 'tạng_phủ'),
('tinh thần uể oải', 'thần kiệt; mệt mỏi; không có sức', NULL, 'Thận dương hư không sinh khí', 'Thận dương hư', 'tạng_phủ'),
('liệt dương', 'rối loạn cương dương; bất lực', NULL, 'Thận dương hư không nuôi dưỡng tông cân', 'Thận dương hư', 'tạng_phủ'),
('lưỡi nhợt bệu', NULL, 'lưỡi nhợt bệu; rêu trắng', 'Dương hư hàn thịnh', 'Thận dương hư', 'tạng_phủ'),
('mạch trầm trì', 'mạch trầm; mạch trì', NULL, 'Dương hư hàn thịnh', 'Thận dương hư', 'tạng_phủ'),

-- Hội chứng Thận âm hư
('lưng đau', 'đau lưng; mỏi lưng', 'âm ỉ; về chiều tối; nặng hơn khi mệt', 'Thận âm hư không nuôi dưỡng lưng', 'Thận âm hư', 'tạng_phủ'),
('ra mồ hôi trộm', 'đạo hãn', NULL, 'Âm hư hỏa vượng bức tân dịch', 'Thận âm hư', 'tạng_phủ'),
('nóng trong người', 'phiền nhiệt; ngũ tâm phiền nhiệt', 'về chiều tối; lòng bàn tay bàn chân nóng', 'Thận âm hư sinh nội nhiệt', 'Thận âm hư', 'tạng_phủ'),
('ù tai', 'tiếng kêu trong tai; nghe kém', 'âm thanh cao; liên tục; giảm khi nghỉ', 'Thận âm hư không nuôi tai', 'Thận âm hư', 'tạng_phủ'),
('miệng khô', 'khô họng; khát nước', 'về chiều tối', 'Âm hư tân dịch bất túc', 'Thận âm hư', 'tạng_phủ'),
('di tinh', NULL, NULL, 'Âm hư hỏa vượng nhiễu tinh thất', 'Thận âm hư', 'tạng_phủ'),
('lưỡi đỏ', NULL, 'lưỡi đỏ; ít rêu; không rêu', 'Âm hư hỏa vượng', 'Thận âm hư', 'tạng_phủ'),
('mạch tế sác', NULL, NULL, 'Âm hư nội nhiệt', 'Thận âm hư', 'tạng_phủ');

-- ============================================================
-- VIEW hữu ích để truy vấn
-- ============================================================

-- Danh sách hội chứng và số lượng triệu chứng
CREATE OR REPLACE VIEW v_syndrome_summary AS
SELECT
  syndrome,
  category,
  COUNT(DISTINCT symptom) AS total_symptoms,
  COUNT(*) AS total_rows
FROM knowledge_base
GROUP BY syndrome, category
ORDER BY category, syndrome;

-- Danh sách triệu chứng có thể thuộc nhiều hội chứng
CREATE OR REPLACE VIEW v_shared_symptoms AS
SELECT
  symptom,
  COUNT(DISTINCT syndrome) AS syndrome_count,
  STRING_AGG(DISTINCT syndrome, ' | ' ORDER BY syndrome) AS syndromes
FROM knowledge_base
GROUP BY symptom
HAVING COUNT(DISTINCT syndrome) > 1
ORDER BY syndrome_count DESC;
