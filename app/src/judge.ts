// 答えの判定。
// アプリが機械的に吸収するのは、全角と半角、ひらがなとカタカナ、空白と記号、旧字体と新字体、ヶ・ケの違いだけ。
// 別名・通称・号などは、パックの accept に出典で確かめたものだけを書く（姓だけ・名だけは書かない）。

// 旧字体→新字体（地名・人名・寺社名で出やすいもの）
const KYUJI: Record<string, string> = {
  國: '国', 萬: '万', 藏: '蔵', 遙: '遥', 學: '学', 會: '会', 澤: '沢', 濱: '浜', 邊: '辺', 邉: '辺',
  齋: '斎', 齊: '斉', 廣: '広', 櫻: '桜', 舊: '旧', 驛: '駅', 寳: '宝', 寶: '宝', 圓: '円', 龍: '竜',
  鐵: '鉄', 靜: '静', 德: '徳', 惠: '恵', 眞: '真', 髙: '高', 﨑: '崎', 曾: '曽', 條: '条', 莊: '荘',
  縣: '県', 區: '区', 豐: '豊', 禮: '礼', 傳: '伝', 對: '対', 兒: '児', 圖: '図', 團: '団', 臺: '台',
  樂: '楽', 戰: '戦', 實: '実', 體: '体', 營: '営', 榮: '栄', 黑: '黒', 澁: '渋', 嶋: '島', 嶌: '島',
  瀧: '滝', 增: '増', 淺: '浅', 邨: '村', 冨: '富',
};

export function normalize(s: string): string {
  let t = s.normalize('NFKC').toLowerCase();
  t = [...t].map((c) => KYUJI[c] ?? c).join('');
  // カタカナ→ひらがな（ヶ・ヵは「け」「か」にそろえる）
  t = t.replace(/[ヶヵ]/g, (c) => (c === 'ヶ' ? 'け' : 'か'));
  t = t.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  t = t.replace(/ゖ/g, 'け').replace(/ゕ/g, 'か');
  // 空白・中黒・句読点・かっこを除く
  t = t.replace(/[\s・･·、。,.「」『』（）()〈〉【】"'”“’‘-]/g, '');
  return t;
}

export function isCorrect(input: string, accept: string[]): boolean {
  const x = normalize(input);
  if (!x) return false;
  return accept.some((a) => normalize(a) === x);
}
