const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// ============ ДАННЫЕ ДЛЯ ГЕНЕРАЦИИ ============

const TAJIK_MALES = [
  { firstName: 'Акрам', lastName: 'Рахимов', latin: ['Akram', 'Rahimov'], patronymic: 'Сафарович' },
  { firstName: 'Бахром', lastName: 'Каримов', latin: ['Bahrom', 'Karimov'], patronymic: 'Олимович' },
  { firstName: 'Восит', lastName: 'Назаров', latin: ['Vosit', 'Nazarov'], patronymic: 'Шерович' },
  { firstName: 'Голиб', lastName: 'Сафаров', latin: ['Golib', 'Safarov'], patronymic: 'Рустамович' },
  { firstName: 'Далер', lastName: 'Ахмедов', latin: ['Daler', 'Ahmedov'], patronymic: 'Камолович' },
  { firstName: 'Ёқуб', lastName: 'Холиков', latin: ['Yoqub', 'Holikov'], patronymic: 'Файзович' },
  { firstName: 'Зафар', lastName: 'Мирзоев', latin: ['Zafar', 'Mirzoev'], patronymic: 'Бахтиёрович' },
  { firstName: 'Икром', lastName: 'Содиков', latin: ['Ikrom', 'Sodikov'], patronymic: 'Нурович' },
  { firstName: 'Камол', lastName: 'Тошев', latin: ['Kamol', 'Toshev'], patronymic: 'Акбарович' },
  { firstName: 'Лутфулло', lastName: 'Расулов', latin: ['Lutfullo', 'Rasulov'], patronymic: 'Саидович' },
  { firstName: 'Манучехр', lastName: 'Давлатов', latin: ['Manuchehr', 'Davlatov'], patronymic: 'Джамолович' },
  { firstName: 'Наврӯз', lastName: 'Ғаниев', latin: ['Navruz', 'Ghaniev'], patronymic: 'Фарходович' },
  { firstName: 'Олимджон', lastName: 'Шарипов', latin: ['Olimjon', 'Sharipov'], patronymic: 'Сулаймонович' },
  { firstName: 'Парвиз', lastName: 'Алиев', latin: ['Parviz', 'Aliev'], patronymic: 'Ҳакимович' },
  { firstName: 'Рустам', lastName: 'Ибрагимов', latin: ['Rustam', 'Ibragimov'], patronymic: 'Абдуллоевич' },
  { firstName: 'Саидакбар', lastName: 'Қосимов', latin: ['Saidakbar', 'Qosimov'], patronymic: 'Маъмурович' },
  { firstName: 'Тимур', lastName: 'Усмонов', latin: ['Timur', 'Usmonov'], patronymic: 'Баходурович' },
  { firstName: 'Улуғбек', lastName: 'Хакимов', latin: ['Ulugbek', 'Hakimov'], patronymic: 'Шухратович' },
  { firstName: 'Фирдавс', lastName: 'Махмудов', latin: ['Firdavs', 'Mahmudov'], patronymic: 'Ильёсович' },
  { firstName: 'Ҳусайн', lastName: 'Зоиров', latin: ['Husayn', 'Zoirov'], patronymic: 'Анварович' },
  { firstName: 'Шерозджон', lastName: 'Набиев', latin: ['Sherozjon', 'Nabiev'], patronymic: 'Рахматович' },
  { firstName: 'Аббос', lastName: 'Муродов', latin: ['Abbos', 'Murodov'], patronymic: 'Зиёдуллоевич' },
  { firstName: 'Бобур', lastName: 'Турсунов', latin: ['Bobur', 'Tursunov'], patronymic: 'Файзалиевич' },
  { firstName: 'Джамшед', lastName: 'Раджабов', latin: ['Jamshed', 'Rajabov'], patronymic: 'Мирзоевич' },
  { firstName: 'Исмоил', lastName: 'Бобоев', latin: ['Ismoil', 'Boboev'], patronymic: 'Саидович' },
  { firstName: 'Комил', lastName: 'Ашуров', latin: ['Komil', 'Ashurov'], patronymic: 'Ғаниевич' },
  { firstName: 'Музаффар', lastName: 'Норматов', latin: ['Muzaffar', 'Normatov'], patronymic: 'Исломович' },
  { firstName: 'Нуриддин', lastName: 'Ёров', latin: ['Nuriddin', 'Yorov'], patronymic: 'Сайфиддинович' },
  { firstName: 'Сорбон', lastName: 'Олимов', latin: ['Sorbon', 'Olimov'], patronymic: 'Шодиевич' },
  { firstName: 'Фаррух', lastName: 'Шоев', latin: ['Farruh', 'Shoev'], patronymic: 'Толибович' },
];

const TAJIK_FEMALES = [
  { firstName: 'Санавбар', lastName: 'Комилова', latin: ['Sanavbar', 'Komilova'], patronymic: 'Ҳасановна' },
  { firstName: 'Тахмина', lastName: 'Ризоева', latin: ['Tahmina', 'Rizoeva'], patronymic: 'Файзуллоевна' },
  { firstName: 'Умеда', lastName: 'Рахматова', latin: ['Umeda', 'Rahmatova'], patronymic: 'Муродовна' },
  { firstName: 'Фарзона', lastName: 'Носирова', latin: ['Farzona', 'Nosirova'], patronymic: 'Сайфуллоевна' },
  { firstName: 'Шахло', lastName: 'Абдуллоева', latin: ['Shahlo', 'Abdulloeva'], patronymic: 'Равшановна' },
  { firstName: 'Мадина', lastName: 'Ҳайдарова', latin: ['Madina', 'Haydarova'], patronymic: 'Акрамовна' },
  { firstName: 'Нигора', lastName: 'Саидова', latin: ['Nigora', 'Saidova'], patronymic: 'Бахтиёровна' },
  { firstName: 'Зебо', lastName: 'Каримова', latin: ['Zebo', 'Karimova'], patronymic: 'Джамоловна' },
  { firstName: 'Гулнора', lastName: 'Мирзоева', latin: ['Gulnora', 'Mirzoeva'], patronymic: 'Сафаровна' },
  { firstName: 'Дилрабо', lastName: 'Турсунова', latin: ['Dilrabo', 'Tursunova'], patronymic: 'Файзовна' },
  { firstName: 'Манижа', lastName: 'Раджабова', latin: ['Manija', 'Rajabova'], patronymic: 'Наимовна' },
  { firstName: 'Парвина', lastName: 'Шарипова', latin: ['Parvina', 'Sharipova'], patronymic: 'Азизовна' },
  { firstName: 'Рухшона', lastName: 'Ибрагимова', latin: ['Ruhshona', 'Ibragimova'], patronymic: 'Олимовна' },
  { firstName: 'Ситора', lastName: 'Содикова', latin: ['Sitora', 'Sodikova'], patronymic: 'Ҳамидовна' },
  { firstName: 'Фотима', lastName: 'Назарова', latin: ['Fotima', 'Nazarova'], patronymic: 'Маликовна' },
];

const COMPANIES = [
  { name: 'Бунёд Интернешнл', shortName: 'Бунёд', inn: '123456789', address: 'г. Душанбе, ул. Рудаки 1', phone: '+992 372 123456', email: 'info@bunyod.tj' },
  { name: 'Дезинфекция', shortName: 'Дезинф.', inn: '234567890', address: 'г. Душанбе, ул. Сомони 15', phone: '+992 372 234567', email: 'info@dezinfection.tj' },
  { name: 'Макон', shortName: 'Макон', inn: '345678901', address: 'г. Душанбе, ул. Айни 45', phone: '+992 372 345678', email: 'info@makon.tj' },
  { name: 'Макон (Магазин)', shortName: 'Макон Маг.', inn: '456789012', address: 'г. Душанбе, пр. Исмоили Сомони 100', phone: '+992 372 456789', email: 'shop@makon.tj' },
  { name: 'Роҳҳои Фавз', shortName: 'Роҳҳои Ф.', inn: '567890123', address: 'г. Душанбе, ул. Мирзо Турсунзода 5', phone: '+992 372 567890', email: 'info@rohhoi-favz.tj' },
  { name: 'Фавз', shortName: 'Фавз', inn: '678901234', address: 'г. Душанбе, ул. Бохтар 20', phone: '+992 372 678901', email: 'info@favz.tj' },
  { name: 'Фавз Кемикал', shortName: 'Фавз Хим.', inn: '789012345', address: 'г. Душанбе, ул. Носири Хусрав 8', phone: '+992 372 789012', email: 'info@favz-chemical.tj' },
  { name: 'Фавз Климат', shortName: 'Фавз Клим.', inn: '890123456', address: 'г. Душанбе, ул. Фирдавси 30', phone: '+992 372 890123', email: 'info@favz-climat.tj' },
];

// Отделы зависят от типа компании
const COMPANY_DEPARTMENTS = {
  'Бунёд Интернешнл': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Отдел продаж', 'Логистика', 'IT отдел', 'Маркетинг', 'Юридический отдел'],
  'Дезинфекция': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Производство', 'Отдел качества', 'Логистика', 'Склад'],
  'Макон': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Строительный отдел', 'Проектный отдел', 'Отдел снабжения', 'Логистика'],
  'Макон (Магазин)': ['Администрация', 'Бухгалтерия', 'Торговый зал', 'Склад', 'Отдел закупок', 'Отдел кадров'],
  'Роҳҳои Фавз': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Транспортный отдел', 'Диспетчерская', 'Ремонтная мастерская', 'Логистика'],
  'Фавз': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Отдел продаж', 'Производство', 'Логистика', 'IT отдел', 'Маркетинг', 'Склад'],
  'Фавз Кемикал': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Производство', 'Лаборатория', 'Отдел качества', 'Склад', 'Логистика'],
  'Фавз Климат': ['Администрация', 'Бухгалтерия', 'Отдел кадров', 'Сервисный отдел', 'Отдел продаж', 'Монтажный отдел', 'Склад'],
};

const COMPANY_POSITIONS = {
  'Бунёд Интернешнл': ['Генеральный директор', 'Зам. директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Менеджер по продажам', 'Старший менеджер', 'Программист', 'Системный администратор', 'Маркетолог', 'Логист', 'Юрист', 'Секретарь', 'Водитель', 'Охранник'],
  'Дезинфекция': ['Директор', 'Зам. директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Технолог', 'Оператор', 'Дезинфектор', 'Контролёр качества', 'Кладовщик', 'Логист', 'Водитель', 'Охранник'],
  'Макон': ['Директор', 'Главный инженер', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Прораб', 'Инженер', 'Архитектор', 'Проектировщик', 'Снабженец', 'Логист', 'Водитель', 'Охранник'],
  'Макон (Магазин)': ['Директор магазина', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Старший продавец', 'Продавец-консультант', 'Кассир', 'Кладовщик', 'Менеджер по закупкам', 'Грузчик', 'Охранник'],
  'Роҳҳои Фавз': ['Директор', 'Зам. директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Диспетчер', 'Водитель', 'Механик', 'Автослесарь', 'Логист', 'Охранник'],
  'Фавз': ['Генеральный директор', 'Зам. директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Менеджер по продажам', 'Начальник производства', 'Инженер', 'Оператор', 'Программист', 'Маркетолог', 'Логист', 'Кладовщик', 'Водитель', 'Охранник', 'Секретарь'],
  'Фавз Кемикал': ['Директор', 'Главный технолог', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Химик-технолог', 'Лаборант', 'Оператор', 'Контролёр качества', 'Кладовщик', 'Логист', 'Водитель', 'Охранник'],
  'Фавз Климат': ['Директор', 'Зам. директора', 'Главный бухгалтер', 'Бухгалтер', 'Менеджер по кадрам', 'Менеджер по продажам', 'Монтажник', 'Сервисный инженер', 'Техник', 'Кладовщик', 'Водитель', 'Охранник'],
};

// Зарплаты зависят от должности
const SALARY_MAP = {
  'Генеральный директор': 15000, 'Директор': 12000, 'Директор магазина': 10000,
  'Зам. директора': 10000, 'Главный инженер': 10000, 'Главный технолог': 10000,
  'Главный бухгалтер': 8000, 'Юрист': 7000, 'Архитектор': 8000, 'Проектировщик': 7500,
  'Начальник производства': 8000, 'Прораб': 7500, 'Химик-технолог': 7000,
  'Бухгалтер': 5000, 'Менеджер по кадрам': 5500, 'Менеджер по продажам': 5500,
  'Старший менеджер': 6000, 'Менеджер по закупкам': 5500, 'Снабженец': 5000,
  'Программист': 7000, 'Системный администратор': 6000, 'Маркетолог': 5500,
  'Инженер': 6000, 'Сервисный инженер': 5500, 'Лаборант': 4000,
  'Контролёр качества': 4500, 'Технолог': 5500, 'Техник': 4000,
  'Логист': 5000, 'Диспетчер': 4500, 'Старший продавец': 4500,
  'Продавец-консультант': 3500, 'Кассир': 3500, 'Оператор': 4000,
  'Дезинфектор': 4000, 'Монтажник': 5000, 'Автослесарь': 4500, 'Механик': 5000,
  'Кладовщик': 3500, 'Секретарь': 3500, 'Водитель': 4000, 'Грузчик': 3000,
  'Охранник': 3000, 'Уборщик': 2500,
};

const INVENTORY_TEMPLATES = [
  { name: 'Ноутбук Dell', model: 'Latitude 5540', category: 'Компьютеры', price: 5500 },
  { name: 'Ноутбук Lenovo', model: 'ThinkPad E14', category: 'Компьютеры', price: 4800 },
  { name: 'ПК HP', model: 'ProDesk 400 G7', category: 'Компьютеры', price: 4200 },
  { name: 'Монитор Samsung', model: 'S24R350', category: 'Компьютеры', price: 1800 },
  { name: 'Монитор LG', model: '24MK430H', category: 'Компьютеры', price: 1600 },
  { name: 'Принтер HP', model: 'LaserJet Pro M404dn', category: 'Оргтехника', price: 2500 },
  { name: 'МФУ Canon', model: 'i-SENSYS MF445dw', category: 'Оргтехника', price: 3200 },
  { name: 'Сканер Epson', model: 'Perfection V39', category: 'Оргтехника', price: 900 },
  { name: 'Проектор BenQ', model: 'MS560', category: 'Оргтехника', price: 4500 },
  { name: 'Стол офисный', model: 'Ergo 120x60', category: 'Мебель', price: 800 },
  { name: 'Стол руководителя', model: 'Boss 180x90', category: 'Мебель', price: 2500 },
  { name: 'Кресло офисное', model: 'Chairman 699', category: 'Мебель', price: 1200 },
  { name: 'Кресло руководителя', model: 'Metta LK-11', category: 'Мебель', price: 3500 },
  { name: 'Шкаф для документов', model: 'AIKO SL-185', category: 'Мебель', price: 1500 },
  { name: 'Телефон Xiaomi', model: 'Redmi Note 13', category: 'Средства связи', price: 1500 },
  { name: 'Телефон Samsung', model: 'Galaxy A54', category: 'Средства связи', price: 2200 },
  { name: 'IP-телефон Grandstream', model: 'GRP2601', category: 'Средства связи', price: 600 },
  { name: 'Кондиционер Midea', model: 'MSMA-12HRN1', category: 'Климат', price: 3500 },
  { name: 'Кондиционер LG', model: 'P09SP', category: 'Климат', price: 4200 },
  { name: 'Источник бесперебойного питания', model: 'APC BR1500GI', category: 'Прочее', price: 2800 },
];

const OFFICE_TEMPLATES = [
  { name: 'Главный офис', suffix: 'Центральное здание' },
  { name: 'Склад', suffix: 'Складская зона' },
  { name: 'Филиал', suffix: 'Дополнительный офис' },
];

// ============ ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ============

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getWorkDaysInMonth(month, year) {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

let globalEmpIndex = 0;
function getNextName() {
  // 70% мужские, 30% женские
  const isFemale = globalEmpIndex % 10 >= 7;
  const pool = isFemale ? TAJIK_FEMALES : TAJIK_MALES;
  const name = pool[globalEmpIndex % pool.length];
  globalEmpIndex++;
  return name;
}

// ============ ОСНОВНАЯ ФУНКЦИЯ ============

async function main() {
  console.log('🚀 Начало заполнения базы данных холдинга...\n');

  // ========== ОЧИСТКА ==========
  await prisma.salary.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.attendanceEvent.deleteMany();
  await prisma.inventoryHistory.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.employeeDocument.deleteMany();
  await prisma.office.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.position.deleteMany();
  await prisma.department.deleteMany();
  await prisma.company.deleteMany();
  await prisma.role.deleteMany();
  await prisma.auditLog.deleteMany();
  console.log('🗑️  База данных очищена');

  // ========== 1. РОЛИ ==========
  const roleNames = ['Суперадмин', 'Кадровик', 'Руководитель', 'Бухгалтер', 'Сотрудник'];
  const roles = {};
  for (const name of roleNames) {
    roles[name] = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log('✅ Роли созданы (5)');

  // ========== 2. КОМПАНИИ ==========
  const createdCompanies = {};
  for (const c of COMPANIES) {
    createdCompanies[c.name] = await prisma.company.upsert({
      where: { name: c.name }, update: {}, create: c,
    });
  }
  console.log('✅ Компании созданы (8)');

  // ========== 3. ОТДЕЛЫ ==========
  const createdDepts = {};
  for (const [companyName, depts] of Object.entries(COMPANY_DEPARTMENTS)) {
    const company = createdCompanies[companyName];
    createdDepts[companyName] = [];
    for (const deptName of depts) {
      const dept = await prisma.department.upsert({
        where: { name_companyId: { name: deptName, companyId: company.id } },
        update: {}, create: { name: deptName, companyId: company.id },
      });
      createdDepts[companyName].push(dept);
    }
  }
  console.log('✅ Отделы созданы (специфичные для каждой компании)');

  // ========== 4. ДОЛЖНОСТИ ==========
  const createdPositions = {};
  for (const [companyName, positions] of Object.entries(COMPANY_POSITIONS)) {
    const company = createdCompanies[companyName];
    createdPositions[companyName] = [];
    for (const posName of positions) {
      const pos = await prisma.position.upsert({
        where: { name_companyId: { name: posName, companyId: company.id } },
        update: {}, create: { name: posName, companyId: company.id },
      });
      createdPositions[companyName].push(pos);
    }
  }
  console.log('✅ Должности созданы (специфичные для каждой компании)');

  // ========== 5. ЕДИНСТВЕННЫЙ СУПЕРАДМИН ==========
  const hashedPassword = await bcrypt.hash('password', 10);

  await prisma.user.upsert({
    where: { email: 'admin@holding.tj' },
    update: {},
    create: {
      email: 'admin@holding.tj',
      password: hashedPassword,
      firstName: 'Администратор',
      lastName: 'Холдинга',
      roleId: roles['Суперадмин'].id,
      isHoldingAdmin: true,
      companyId: null,
    },
  });
  console.log('✅ Суперадмин создан: admin@holding.tj / password');

  // ========== 6. ПОЛЬЗОВАТЕЛИ КОМПАНИЙ ==========
  const companyUsers = [
    { email: 'hr@bunyod.tj', firstName: 'Зарина', lastName: 'Раджабова', role: 'Кадровик', company: 'Бунёд Интернешнл' },
    { email: 'manager@bunyod.tj', firstName: 'Фаридун', lastName: 'Сафаров', role: 'Руководитель', company: 'Бунёд Интернешнл' },
    { email: 'accountant@bunyod.tj', firstName: 'Гулноз', lastName: 'Ахмедова', role: 'Бухгалтер', company: 'Бунёд Интернешнл' },
    { email: 'hr@favz.tj', firstName: 'Ситора', lastName: 'Каримова', role: 'Кадровик', company: 'Фавз' },
    { email: 'manager@favz.tj', firstName: 'Алишер', lastName: 'Муродов', role: 'Руководитель', company: 'Фавз' },
    { email: 'hr@dezinfection.tj', firstName: 'Нигина', lastName: 'Содикова', role: 'Кадровик', company: 'Дезинфекция' },
    { email: 'hr@makon.tj', firstName: 'Мухаммад', lastName: 'Олимов', role: 'Кадровик', company: 'Макон' },
    { email: 'hr@makon-shop.tj', firstName: 'Дилафрӯз', lastName: 'Ҳакимова', role: 'Кадровик', company: 'Макон (Магазин)' },
    { email: 'hr@rohhoi.tj', firstName: 'Бахтиёр', lastName: 'Набиев', role: 'Кадровик', company: 'Роҳҳои Фавз' },
    { email: 'hr@favz-chemical.tj', firstName: 'Рустам', lastName: 'Зоиров', role: 'Кадровик', company: 'Фавз Кемикал' },
    { email: 'hr@favz-climat.tj', firstName: 'Фируза', lastName: 'Давлатова', role: 'Кадровик', company: 'Фавз Климат' },
  ];

  for (const u of companyUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email, password: hashedPassword,
        firstName: u.firstName, lastName: u.lastName,
        roleId: roles[u.role].id,
        companyId: createdCompanies[u.company].id,
        isHoldingAdmin: false,
      },
    });
  }
  console.log(`✅ Пользователи компаний созданы (${companyUsers.length})`);

  // ========== 7. СОТРУДНИКИ (15-20 на компанию) ==========
  const streets = ['Рудаки', 'Сомони', 'Айни', 'Фирдавси', 'Носири Хусрав', 'Бохтар', 'Мирзо Турсунзода', 'Шотемур', 'Лоиқ Шерали', 'Дехоти'];
  let employeeCount = 0;
  const allEmployeesByCompany = {};

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    const depts = createdDepts[companyName];
    const positions = createdPositions[companyName];
    const empCount = rand(15, 20);
    allEmployeesByCompany[companyName] = [];

    for (let i = 0; i < empCount; i++) {
      const template = getNextName();
      const dept = depts[i % depts.length];
      const position = positions[i % positions.length];
      const salary = SALARY_MAP[position.name] || rand(3000, 6000);
      const status = i < empCount - 2 ? 'Активен' : (Math.random() > 0.5 ? 'В отпуске' : 'В командировке');
      const street = pick(streets);
      const birthYear = rand(1970, 2000);
      const hireYear = rand(2016, 2025);

      const emp = await prisma.employee.create({
        data: {
          firstName: template.firstName,
          lastName: template.lastName,
          patronymic: template.patronymic,
          latinFirstName: template.latin[0],
          latinLastName: template.latin[1],
          birthDate: new Date(birthYear, rand(0, 11), rand(1, 28)),
          passportSerial: pick(['А', 'Б', 'В']),
          passportNumber: String(rand(1000000, 9999999)),
          passportIssuedBy: 'ВКД МВД РТ',
          passportIssueDate: new Date(rand(2015, 2024), rand(0, 11), rand(1, 28)),
          inn: String(rand(100000000, 999999999)),
          address: `г. Душанбе, ул. ${street} ${rand(1, 150)}`,
          phone: `+992 ${pick(['90', '91', '92', '93', '98', '99'])} ${String(rand(1000000, 9999999))}`,
          email: `${template.latin[0].toLowerCase()}.${template.latin[1].toLowerCase()}${employeeCount}@${company.email?.split('@')[1] || 'company.tj'}`,
          salary,
          contractNumber: `ТД-${company.id}-${String(employeeCount + 1).padStart(4, '0')}`,
          contractDate: new Date(hireYear, rand(0, 11), rand(1, 28)),
          hireDate: new Date(hireYear, rand(0, 11), rand(1, 28)),
          status,
          departmentId: dept.id,
          positionId: position.id,
          companyId: company.id,
        },
      });
      allEmployeesByCompany[companyName].push(emp);
      employeeCount++;
    }
  }
  console.log(`✅ Сотрудники созданы (${employeeCount}, по 15-20 на компанию)`);

  // ========== 8. ОФИСЫ ==========
  const createdOffices = {};
  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    createdOffices[companyName] = [];
    for (const tmpl of OFFICE_TEMPLATES) {
      const office = await prisma.office.create({
        data: { name: tmpl.name, address: `${company.address} — ${tmpl.suffix}`, companyId: company.id },
      });
      createdOffices[companyName].push(office);
    }
  }
  console.log('✅ Офисы созданы (по 3 на компанию)');

  // ========== 9. ИНВЕНТАРЬ ==========
  let inventoryCount = 0;
  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    const emps = allEmployeesByCompany[companyName];
    const itemCount = rand(10, 15);

    for (let i = 0; i < itemCount; i++) {
      const template = INVENTORY_TEMPLATES[i % INVENTORY_TEMPLATES.length];
      const invNumber = `ИНВ-${String(company.id).padStart(2, '0')}-${String(inventoryCount + 1).padStart(4, '0')}`;
      const assignToEmp = i < 4 ? emps[i] : null;

      const item = await prisma.inventoryItem.create({
        data: {
          name: template.name, model: template.model, category: template.category,
          inventoryNumber: invNumber, price: template.price,
          acquisitionDate: new Date(rand(2022, 2025), rand(0, 11), rand(1, 28)),
          status: assignToEmp ? 'Выдан' : 'В наличии',
          companyId: company.id,
          employeeId: assignToEmp ? assignToEmp.id : null,
        },
      });

      await prisma.inventoryHistory.create({
        data: {
          inventoryItemId: item.id, action: 'Создан',
          details: `${template.name}, ${template.model}, ${invNumber}`,
          performedBy: 'admin@holding.tj',
        },
      });

      if (assignToEmp) {
        const empName = `${assignToEmp.lastName} ${assignToEmp.firstName}`;
        await prisma.inventoryHistory.create({
          data: {
            inventoryItemId: item.id, action: 'Выдан',
            details: `Выдан сотруднику ${empName}`,
            employeeName: empName, performedBy: 'admin@holding.tj',
          },
        });
      }
      inventoryCount++;
    }
  }
  console.log(`✅ Инвентарь создан (${inventoryCount} предметов)`);

  // ========== 10. ПОСЕЩАЕМОСТЬ (3 месяца) ==========
  let eventCount = 0;
  let attendanceCount = 0;

  // Генерируем за 3 последних месяца
  const now = new Date();
  const monthsToGenerate = [];
  for (let m = 0; m < 3; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    monthsToGenerate.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    const offices = createdOffices[companyName];
    const emps = allEmployeesByCompany[companyName].filter(e => e.status === 'Активен');

    for (const { month, year } of monthsToGenerate) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

      for (let day = 1; day <= daysInMonth; day++) {
        // В текущем месяце — только до сегодня
        if (isCurrentMonth && day > now.getDate()) break;

        const date = new Date(year, month - 1, day);
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue; // выходные

        const dateOnly = new Date(Date.UTC(year, month - 1, day));

        for (const emp of emps) {
          const r = Math.random();
          let status, firstEntry, lastExit, totalMinutes;
          const office = pick(offices);

          if (r < 0.04) {
            status = 'absent'; firstEntry = null; lastExit = null; totalMinutes = 0;
          } else if (r < 0.08) {
            status = 'excused'; firstEntry = null; lastExit = null; totalMinutes = 0;
          } else if (r < 0.18) {
            status = 'left';
            const eH = rand(8, 9), eM = rand(0, 59), xH = rand(14, 15), xM = rand(0, 59);
            firstEntry = new Date(dateOnly); firstEntry.setUTCHours(eH, eM);
            lastExit = new Date(dateOnly); lastExit.setUTCHours(xH, xM);
            totalMinutes = Math.round((lastExit - firstEntry) / 60000);
          } else {
            status = 'present';
            const eH = rand(8, 9), eM = rand(0, 29), xH = rand(17, 18), xM = rand(0, 59);
            firstEntry = new Date(dateOnly); firstEntry.setUTCHours(eH, eM);
            lastExit = new Date(dateOnly); lastExit.setUTCHours(xH, xM);
            totalMinutes = Math.round((lastExit - firstEntry) / 60000);
          }

          if (firstEntry) {
            await prisma.attendanceEvent.create({
              data: { employeeId: emp.id, companyId: company.id, timestamp: firstEntry, direction: 'IN', officeId: office.id },
            });
            eventCount++;
          }
          if (lastExit) {
            await prisma.attendanceEvent.create({
              data: { employeeId: emp.id, companyId: company.id, timestamp: lastExit, direction: 'OUT', officeId: office.id },
            });
            eventCount++;
          }

          // Корректировки (~ 3%)
          let correctionMinutes = 0, correctedBy = null, correctionNote = null;
          if (Math.random() < 0.03 && status === 'present') {
            correctionMinutes = pick([30, 60, -30, -60]);
            correctedBy = 'admin@holding.tj';
            correctionNote = correctionMinutes > 0 ? 'Переработка по указанию руководства' : 'Ранний уход по согласованию';
            totalMinutes = Math.max(0, totalMinutes + correctionMinutes);
          }

          await prisma.attendance.create({
            data: {
              employeeId: emp.id, companyId: company.id, date: dateOnly,
              firstEntry, lastExit, status,
              totalMinutes: totalMinutes || 0,
              correctionMinutes, correctedBy, correctionNote,
              officeName: office.name,
            },
          });
          attendanceCount++;
        }
      }
    }
  }
  console.log(`✅ Посещаемость за 3 месяца (${attendanceCount} записей, ${eventCount} событий)`);

  // ========== 11. ЗАРПЛАТЫ (за прошлые месяцы) ==========
  let salaryCount = 0;

  // Зарплаты за завершённые месяцы (не текущий)
  const salaryMonths = monthsToGenerate.filter(
    m => !(m.month === now.getMonth() + 1 && m.year === now.getFullYear())
  );

  for (const companyName of Object.keys(createdCompanies)) {
    const company = createdCompanies[companyName];
    const emps = allEmployeesByCompany[companyName].filter(e => e.status === 'Активен');

    for (const { month, year } of salaryMonths) {
      const totalWorkDays = getWorkDaysInMonth(month, year);
      const startDate = new Date(Date.UTC(year, month - 1, 1));
      const endDate = new Date(Date.UTC(year, month, 0));

      for (const emp of emps) {
        // Считаем дни присутствия из attendance
        const attendances = await prisma.attendance.findMany({
          where: {
            employeeId: emp.id,
            date: { gte: startDate, lte: endDate },
            status: { in: ['present', 'left'] },
          },
        });

        const workedDays = attendances.length;
        const workedMinutes = attendances.reduce((s, a) => s + a.totalMinutes, 0);
        const baseSalary = emp.salary || 3000;

        // Пропорциональный расчёт
        const calculated = totalWorkDays > 0
          ? Math.round((baseSalary / totalWorkDays) * workedDays * 100) / 100
          : 0;

        // Случайные премии и удержания (~20% получают премию, ~5% удержание)
        const bonus = Math.random() < 0.2 ? pick([500, 1000, 1500, 2000, 3000]) : 0;
        const deduction = Math.random() < 0.05 ? pick([200, 500, 1000]) : 0;
        const totalAmount = Math.round((calculated + bonus - deduction) * 100) / 100;

        const note = bonus > 0 ? pick(['За перевыполнение плана', 'Квартальная премия', 'За отличную работу', 'Премия по результатам']) : null;

        await prisma.salary.create({
          data: {
            employeeId: emp.id, companyId: company.id,
            month, year, baseSalary, workedDays,
            totalDays: totalWorkDays, workedHours: workedMinutes,
            bonus, deduction,
            note, totalAmount,
            calculatedBy: 'admin@holding.tj',
          },
        });
        salaryCount++;
      }
    }
  }
  console.log(`✅ Зарплаты рассчитаны (${salaryCount} записей за ${salaryMonths.length} месяцев)`);

  // ========== ИТОГ ==========
  console.log('\n══════════════════════════════════════════════');
  console.log('📋 ТЕСТОВЫЕ УЧЁТНЫЕ ЗАПИСИ:');
  console.log('══════════════════════════════════════════════\n');
  console.log('🔴 СУПЕРАДМИН ХОЛДИНГА:');
  console.log('   admin@holding.tj / password\n');
  console.log('🔵 БУНЁД ИНТЕРНЕШНЛ:');
  console.log('   hr@bunyod.tj / password (Кадровик)');
  console.log('   manager@bunyod.tj / password (Руководитель)');
  console.log('   accountant@bunyod.tj / password (Бухгалтер)');
  console.log('\n🟢 ФАВЗ:');
  console.log('   hr@favz.tj / password (Кадровик)');
  console.log('   manager@favz.tj / password (Руководитель)');
  console.log('\n🟡 Остальные компании: hr@{домен} / password\n');
  console.log('══════════════════════════════════════════════');
  console.log(`📊 ИТОГО: ${employeeCount} сотрудников, ${inventoryCount} инвентарь,`);
  console.log(`   ${attendanceCount} посещаемость, ${salaryCount} зарплатных записей`);
  console.log('══════════════════════════════════════════════\n');
  console.log('🎉 Заполнение базы данных завершено!');
}

main()
  .catch((e) => { console.error('❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
