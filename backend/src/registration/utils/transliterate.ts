const map: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  // Таджикские буквы
  'ғ': 'gh', 'ӣ': 'i', 'ҷ': 'j', 'ӯ': 'u', 'ҳ': 'h', 'қ': 'q',
};

export function transliterate(text: string): string {
  return text
    .split('')
    .map((char) => {
      const lower = char.toLowerCase();
      const mapped = map[lower];
      if (mapped !== undefined) {
        return char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
      }
      return char;
    })
    .join('');
}
