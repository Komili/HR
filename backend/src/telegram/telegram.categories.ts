// Категории Telegram-уведомлений. key — хранится в TelegramChat.categories (CSV),
// label — отображается в админ-интерфейсе.
export const TELEGRAM_CATEGORIES = [
  { key: 'attendance', label: 'Посещаемость (вход/выход, опоздания)' },
  { key: 'correction', label: 'Корректировки посещаемости' },
  { key: 'registration', label: 'Регистрация сотрудников' },
  { key: 'access', label: 'СКУД / двери (доступы, ошибки)' },
  { key: 'system', label: 'Системные (старт/стоп сервера, СКУД-алерты)' },
] as const;

export type TelegramCategory = (typeof TELEGRAM_CATEGORIES)[number]['key'];

export const TELEGRAM_CATEGORY_KEYS = TELEGRAM_CATEGORIES.map((c) => c.key) as string[];
