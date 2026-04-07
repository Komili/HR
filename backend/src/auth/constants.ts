if (!process.env.JWT_SECRET) {
  throw new Error('КРИТИЧЕСКАЯ ОШИБКА: переменная JWT_SECRET не задана. Установите JWT_SECRET в .env файле.');
}

export const jwtConstants = {
  secret: process.env.JWT_SECRET,
};
