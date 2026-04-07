import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Таблица транслитерации: латиница → кириллица
const LAT_TO_CYR: [string, string][] = [
  ['zh', 'ж'], ['ch', 'ч'], ['sh', 'ш'], ['kh', 'х'],
  ['ts', 'ц'], ['yu', 'ю'], ['ya', 'я'], ['yo', 'ё'],
  ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'],
  ['d', 'д'], ['e', 'е'], ['z', 'з'], ['i', 'и'],
  ['j', 'дж'], ['k', 'к'], ['l', 'л'], ['m', 'м'],
  ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'],
  ['s', 'с'], ['t', 'т'], ['u', 'у'], ['f', 'ф'],
  ['h', 'ҳ'], ['c', 'к'], ['x', 'ҳ'], ['y', 'й'],
  ['q', 'қ'], ['w', 'в'],
]

export function latinToCyrillic(text: string): string {
  if (!text || !/[a-zA-Z]/.test(text)) return text
  let result = text.toLowerCase()
  for (const [lat, cyr] of LAT_TO_CYR) {
    result = result.split(lat).join(cyr)
  }
  return result
}

/** Проверяет совпадение строки с поисковым запросом (кириллица + латиница, поддержка нескольких слов) */
export function matchesSearch(text: string, query: string): boolean {
  if (!query) return true
  const t = text.toLowerCase()
  const words = query.trim().split(/\s+/).filter(Boolean)
  return words.every(word => {
    const w = word.toLowerCase()
    return t.includes(w) || t.includes(latinToCyrillic(w))
  })
}
