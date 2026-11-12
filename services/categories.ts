import { Category, Product, User, UserRole } from '../types';

// Categories rules agreed 12 Nov 2026 (Decisions Log D38).
// Each category has three names, each unique:
//   name      = the word used in product names, e.g. MTCN (the full word or a short form)
//   fullName  = shown in lists, filters and the product page, e.g. Master Carton
//   shortCode = 2-3 capital letters used in product codes, e.g. MC

const same = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

export const categoryFullName = (c?: Category) => (c ? c.fullName || c.name : '');

// "Master Carton (MTCN)", or just "Tray" when the full name and the word are the same
export const categoryLabel = (c: Category) => {
  const full = categoryFullName(c);
  return same(full, c.name) ? full : `${full} (${c.name})`;
};

export const sortCategories = (cats: Category[]) =>
  [...cats].sort((a, b) => categoryFullName(a).localeCompare(categoryFullName(b)));

// The category a product belongs to: by its link, or by the word (products saved before the link existed)
export const categoryOf = (p: Pick<Product, 'categoryId' | 'category'>, cats: Category[]) =>
  (p.categoryId && cats.find(c => c.id === p.categoryId)) || cats.find(c => same(c.name, p.category));

export const productsInCategory = (c: Category, products: Product[]) =>
  products.filter(p => (p.categoryId ? p.categoryId === c.id : same(p.category, c.name)));

// Short code suggestion: first letters of the words for longer names (Honey Comb = HC),
// the first two letters for one-word names (Sheet = SH). If taken, first letter + another letter.
const wordsOf = (name: string) => name.replace(/[^A-Za-z]+/g, ' ').trim().split(' ').filter(Boolean);
export const defaultShortCode = (fullName: string) => {
  const words = wordsOf(fullName);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || '').slice(0, 2).toUpperCase();
};
export const suggestShortCode = (fullName: string, taken: string[]) => {
  const words = wordsOf(fullName);
  const letters = words.join('').toUpperCase();
  if (letters.length < 2) return '';
  const candidates: string[] = [defaultShortCode(fullName)];
  if (words.length >= 3) candidates.push((words[0][0] + words[1][0] + words[2][0]).toUpperCase());
  for (let i = 1; i < letters.length; i++) candidates.push(letters[0] + letters[i]);
  for (let i = 1; i < letters.length - 1; i++) candidates.push(letters[0] + letters[i] + letters[letters.length - 1]);
  return candidates.find(c => c.length >= 2 && !taken.includes(c)) || '';
};
export const validShortCode = (s: string) => /^[A-Z]{2,3}$/.test(s);

// Who can do what in Categories (D38)
export const categoryPermissions = (u?: User | null) => {
  const sa = u?.role === UserRole.SUPER_ADMIN;
  const admin = u?.role === UserRole.ADMIN;
  return {
    add: sa || admin,
    editFullName: sa || admin,   // also the description
    editWord: sa,                // renames every product in the category
    editShortCode: sa,           // until product codes use it (product codes come later, BUG-38)
    remove: sa,                  // only when no product uses the category
  };
};
