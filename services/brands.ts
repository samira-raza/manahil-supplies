import { Brand, BrandSet, Product, User, UserRole } from '../types';

// Brands rules agreed 12 Nov 2026 (Decisions Log D37)

export const parentBrands = (brands: Brand[]) => brands.filter(b => !b.parentId).sort((a, b) => a.name.localeCompare(b.name));
export const childBrandsOf = (parentId: string, brands: Brand[]) =>
  brands.filter(b => b.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name));
export const setsOf = (parentId: string, sets: BrandSet[]) => sets.filter(s => s.parentId === parentId);

// Child brand names of a set, A to Z
export const setChildNames = (set: BrandSet | undefined, brands: Brand[]) =>
  (set?.childIds || [])
    .map(id => brands.find(b => b.id === id)?.name)
    .filter((n): n is string => !!n)
    .sort((a, b) => a.localeCompare(b));

// "Bodyworks Charcoal [Smoky Rose, Spicy Lime]" or "Hemani"
export const entryText = (parentName: string, childNames: string[]) =>
  childNames.length > 0 ? `${parentName} [${childNames.join(', ')}]` : parentName;

export const setText = (set: BrandSet, brands: Brand[]) =>
  entryText(brands.find(b => b.id === set.parentId)?.name || '', setChildNames(set, brands));

// Product name = Category + Parent brand + [child brands A-Z] + Item name + Packing
// D42: the end of the name, "30 ML X 26 Bottles"; the X only when both parts are filled
export const contentsPart = (capacity?: number | string, unit?: string, packing?: string) =>
  [capacity !== undefined && capacity !== null && String(capacity).trim() !== '' ? `${String(capacity).trim()} ${unit || ''}`.trim() : '', (packing || '').trim()]
    .filter(Boolean)
    .join(' X ');

// Name = Category word + Parent brand + [child brands] + Item name + contents (D37, D42)
export const buildProductTitle = (category: string, parentName: string, childNames: string[], itemName: string, packing: string) =>
  [category, parentName ? entryText(parentName, childNames) : '', itemName, packing]
    .map(s => (s || '').trim())
    .filter(Boolean)
    .join(' ');

// The brand part of a product, from its brand entry (falls back to the old typed brand)
export const productBrandParts = (p: Pick<Product, 'brandParentId' | 'brandSetId' | 'brand'>, brands: Brand[], sets: BrandSet[]) => {
  const parent = brands.find(b => b.id === p.brandParentId);
  const set = sets.find(s => s.id === p.brandSetId);
  return {
    parent,
    set,
    parentName: parent?.name || p.brand || '',
    childNames: setChildNames(set, brands),
    label: parent?.label,
  };
};

export const productTitleFor = (p: Pick<Product, 'brandParentId' | 'brandSetId' | 'brand' | 'category' | 'itemName' | 'packing' | 'itemCapacity' | 'itemCapacityUnit'>, brands: Brand[], sets: BrandSet[]) => {
  const parts = productBrandParts(p, brands, sets);
  return buildProductTitle(p.category, parts.parentName, parts.childNames, p.itemName, contentsPart(p.itemCapacity, p.itemCapacityUnit, p.packing));
};

// Names of the disabled brands on a product: its parent, its set, or any child in the set
export const disabledBrandNames = (p: Pick<Product, 'brandParentId' | 'brandSetId'>, brands: Brand[], sets: BrandSet[]) => {
  const names: string[] = [];
  const parent = brands.find(b => b.id === p.brandParentId);
  if (parent && !parent.isActive) names.push(parent.name);
  const set = sets.find(s => s.id === p.brandSetId);
  if (set) {
    if (!set.isActive) names.push(`the brand set ${setText(set, brands)}`);
    set.childIds.forEach(id => {
      const c = brands.find(b => b.id === id);
      if (c && !c.isActive) names.push(c.name);
    });
  }
  return names;
};

// Entries a new product can pick: active parents alone, and active sets whose parent and children are all active
export type BrandEntry = { key: string; parentId: string; setId?: string; text: string; usable: boolean };
export const brandEntries = (brands: Brand[], sets: BrandSet[]): BrandEntry[] => {
  const out: BrandEntry[] = [];
  parentBrands(brands).forEach(parent => {
    out.push({ key: parent.id, parentId: parent.id, text: parent.name, usable: parent.isActive });
    setsOf(parent.id, sets)
      .map(s => ({ s, text: setText(s, brands) }))
      .sort((a, b) => a.text.localeCompare(b.text))
      .forEach(({ s, text }) => out.push({
        key: `${parent.id}|${s.id}`,
        parentId: parent.id,
        setId: s.id,
        text,
        usable: parent.isActive && s.isActive && s.childIds.every(id => brands.find(b => b.id === id)?.isActive !== false),
      }));
  });
  return out;
};
export const entryKey = (parentId?: string, setId?: string) => (parentId ? (setId ? `${parentId}|${setId}` : parentId) : '');

// Initials: first + last letter of the parent's name; if taken, try first + second + last, then other letters
const lettersOf = (name: string) => name.replace(/[^A-Za-z]/g, '').toUpperCase();
export const defaultInitials = (name: string) => {
  const l = lettersOf(name);
  return l.length >= 2 ? l[0] + l[l.length - 1] : l;
};
export const suggestInitials = (name: string, taken: string[]) => {
  const l = lettersOf(name);
  if (l.length < 2) return '';
  const candidates = [l[0] + l[l.length - 1]];
  for (let i = 1; i < l.length - 1; i++) candidates.push(l[0] + l[i] + l[l.length - 1]);
  for (let i = 1; i < l.length; i++) candidates.push(l[0] + l[i]);
  return candidates.find(c => !taken.includes(c)) || '';
};
export const validInitials = (s: string) => /^[A-Z]{2,3}$/.test(s);

// Who can do what in Brands (D34, D37). The admin-like user does not exist yet.
export const brandPermissions = (u?: User | null) => {
  const sa = u?.role === UserRole.SUPER_ADMIN;
  const admin = u?.role === UserRole.ADMIN;
  return {
    manage: sa || admin,        // add parents, child brands and sets; fix spelling; labels
    changeInitials: sa,         // after a parent brand is saved
    disable: sa,
    remove: sa,                 // delete, only when nothing uses it
  };
};
