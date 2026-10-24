const IMAGE_TERMS = /(?:image|picture|photo|pic|img|illustration|poster|logo|wallpaper|thumbnail|artwork|visual|graphic|icon|banner|chobi|chhobi|imagen|foto|cartel|logotipo|imagem|cartaz|bild|immagine|изображение|картинк[ауи]|صورة|छवि|तस्वीर|चित्र|تصویر|عکس|图片|图像|照片|画像|写真|이미지|사진|resim|fotoğraf|gambar|ilustrasi|ảnh|hình|ছবি|ইমেজ|লোগো|পোস্টার|ওয়ালপেপার|ওয়ালপেপার|থাম্বনেইল)/i;

const IMAGE_CREATE_ACTION = /(?:\\bgenerat(?:e|es|ed|ing)\\b|\bgenarate\b|\\bcreat(?:e|es|ed|ing)\\b|\\bdraw(?:s|ing)?\\b|\bmak(?:e|ing)\b|\\bdesign(?:s|ed|ing)?\\b|\\billustrat(?:e|es|ed|ing)\\b|\\brender(?:s|ed|ing)?\\b|\\bproduc(?:e|es|ed|ing)\\b|\bdibuja\w*\b|\bdiseñ\w*\b|\bgenera\w*\b|\bcrear\b|\bcrea\b|\bhaz\b|\bhacer\b|\bcréer\b|\bgénér\w*\b|\bdessine\w*\b|\bconcevoir\b|\berstelle\w*\b|\bgeneriere\w*\b|\bzeichne\w*\b|\bgestalte\w*\b|\bcreare\b|\bdisegna\w*\b|\bgerar\b|\bcria\b|\bdesenha\w*\b|сгенериру\w*|создай|создать|нарисуй|нарисовать|сделай|изобрази|أنشئ|اصنع|ارسم|صمم|ولّد|انشئ|बनाओ|बनाएं|बनाना|तैयार करो|खींचो|ڈیزائن|بناؤ|بنائیں|画像生成|画像を作|写真を作|生成して|描いて|设计|生成|制作|画一张|画|만들어|생성|그려|디자인|oluştur|çiz|tasarla|buat|ciptakan|tạo|vẽ|thiết kế|তৈরি|বানাও|আঁক|জেনারেট|banao|banaw|banai|baniye|toiri|bana(?:\s+de|\s+do|o)?|koro|kor|kore\s+dao|dao)/i;

const IMAGE_EDIT_ACTION = /(?:\\bedit(?:s|ed|ing)?\\b|\bremove\b|\breplace\b|\bchange\b|\bmodify\b|\bretouch\w*\b|\bcambia\w*\b|\bcambiar\b|\beditar\b|\bmodifica\b|\bmodifier\b|ändern|bearbeiten|измен\w*|удали|замени|عدّل|عدل|غيّر|غير|تعديل|बदल\w*|संपादित\w*|बदलें|編集|修正|改变|修改|编辑|편집|수정|değiştir|ubah|sửa|পরিবর্তন|এডিট|change\s+kore\s+dao|edit\s+kore\s+dao)/i;

const CODE_REQUEST_TERMS = /\b(?:source\s+code|code|script|program(?:ming)?|function|snippet|html|css|javascript|typescript|python|java|sql|regex|api|endpoint|implementation|algorithm|debugging)\b|কোড|স্ক্রিপ্ট|প্রোগ্রাম/i;
const CODE_REQUEST_ACTION = /\b(?:write|give|show|provide|generate|create|make|fix|debug|explain|review|complete|implement|refactor|convert|run|test|write\s+me|help\s+me\s+with)\b|লিখে|লিখ|দাও|দিয়ে দাও|ঠিক কর|ব্যাখ্যা কর|চালাও|দেখাও|করিয়ে দাও|(?:code|script|program)\s+(?:dao|de|koro|kor|likhe|banao)/i;

function stripCodePayloads(prompt: string): string {
  return String(prompt || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, " ")
    .replace(/`[^`\n]*`/g, " ")
    .trim();
}

function looksLikeCodePayload(prompt: string): boolean {
  const text = String(prompt || "").trim();
  if (!text) return false;
  const firstLine = text.split(/\r?\n/, 1)[0].trim();
  const codeLead = /^(?:\/\/|\/\*|<!--|<!doctype\b|<html\b|<script\b|<style\b|<svg\b|<\?php|#include\b|import\s+[\w{*]|from\s+[\w.]+\s+import\b|const\s+\w+\s*=|let\s+\w+\s*=|var\s+\w+\s*=|(?:async\s+)?function\b|class\s+\w+\s*(?:[{(:]|$)|def\s+\w+\s*\(|export\s+(?:default|const|function|class)|public\s+(?:class|static)\b|package\s+[\w.]+;|SELECT\s+.+\s+FROM\b|[.#][\w-]+\s*\{|\{\s*["'][\w-]+["']\s*:)/i;
  if (codeLead.test(firstLine)) return true;
  const signals = (text.match(/(?:=>|\bconst\s+\w+\s*=|\blet\s+\w+\s*=|\bvar\s+\w+\s*=|\bfunction\s*\(|\bconsole\.(?:log|error|warn)|\bdocument\.|\bwindow\.|\breturn\s+|\bdef\s+\w+|<\/?[a-z][^>]*>|[{};]\s*$)/gi) || []).length;
  return signals >= 3 && text.split(/\s+/).length >= 8;
}

export function isImageGenerationTask(prompt: string): boolean {
  const original = String(prompt || "").trim();
  if (!original) return false;

  // If the user pasted source code, code comments/identifiers such as
  // generateImage, Image(), or "create an image" must not trigger image APIs.
  const text = stripCodePayloads(original);
  if (!text) return false;
  if (looksLikeCodePayload(original) && text === original) return false;

  const lower = text.toLowerCase();
  const mentionsVisual = IMAGE_TERMS.test(lower);
  if (!mentionsVisual) return false;

  // Explicit requests to write/fix/explain code take precedence over words
  // like "image" or "generate" inside the coding request.
  if (CODE_REQUEST_TERMS.test(text) && CODE_REQUEST_ACTION.test(text)) return false;

  const createFirst = new RegExp(IMAGE_CREATE_ACTION.source + "[\\s\\S]{0,90}" + IMAGE_TERMS.source, "i").test(text);
  const visualFirst = new RegExp(IMAGE_TERMS.source + "[\\s\\S]{0,45}" + IMAGE_CREATE_ACTION.source, "i").test(text);
  const editing = IMAGE_EDIT_ACTION.test(text) && mentionsVisual;

  // Require a close action/visual pairing rather than any mention of each
  // word anywhere in a long paragraph.
  return createFirst || visualFirst || editing;
}
