import type React from 'react';

// D39 for simple forms whose rules are the fields' own "required", "min" or "type" settings.
// On save it checks every field in the form; each one that blocks saving gets a red outline
// (index.html styles [aria-invalid="true"]), its reason under it (taken from the field's label),
// and the cursor goes to the first. Typing in a field clears its red.
// Usage: <form {...formCheckProps} onSubmit={e => { e.preventDefault(); if (!checkForm(e.currentTarget)) return; ... }}>

const MSG_ATTR = 'data-form-check-msg';

const labelOf = (el: HTMLElement): string => {
  let box: HTMLElement | null = el.parentElement;
  for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
    const label = box.querySelector('label');
    if (label && label.textContent) {
      return label.textContent.replace(/\*/g, '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    }
  }
  return 'this field';
};

const reasonFor = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
  if (el.dataset.msg) return el.dataset.msg;
  const label = labelOf(el);
  const v = el.validity;
  if (v.valueMissing) return el.tagName === 'SELECT' ? `Choose the ${label}.` : `Enter the ${label}.`;
  if (v.rangeUnderflow) return `The ${label} must be ${(el as HTMLInputElement).min} or more.`;
  if (v.rangeOverflow) return `The ${label} must be ${(el as HTMLInputElement).max} or less.`;
  if (v.tooShort) return `The ${label} must be at least ${(el as HTMLInputElement).minLength} characters.`;
  return `Check the ${label}.`;
};

const clearField = (el: Element) => {
  if (el.getAttribute('aria-invalid') !== 'true') return;
  el.removeAttribute('aria-invalid');
  const msg = el.parentElement?.querySelector(`[${MSG_ATTR}]`);
  // The message sits after the field, or after the row the field is in
  (msg || el.parentElement?.parentElement?.querySelector(`:scope > [${MSG_ATTR}]`))?.remove();
};

export const clearFormCheck = (form: HTMLFormElement | null) => {
  form?.querySelectorAll('[aria-invalid="true"]').forEach(clearField);
};

// Returns true when every field is fine; otherwise marks the failing fields and returns false
export const checkForm = (form: HTMLFormElement): boolean => {
  clearFormCheck(form);
  const fields = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea'))
    .filter(el => !el.disabled && el.offsetParent !== null && !el.checkValidity());
  fields.forEach(el => {
    el.setAttribute('aria-invalid', 'true');
    const p = document.createElement('p');
    p.setAttribute(MSG_ATTR, '');
    p.setAttribute('role', 'alert');
    p.className = 'text-xs font-bold text-red-600 mt-1';
    p.textContent = reasonFor(el);
    // Under the field; when the field shares a row with another (e.g. size + unit), under the row
    const row = el.parentElement;
    const target = row && getComputedStyle(row).display === 'flex' && row.parentElement ? row.parentElement : row;
    target?.appendChild(p);
  });
  if (fields.length > 0) {
    fields[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    fields[0].focus({ preventScroll: true });
    return false;
  }
  return true;
};

// Spread on the <form>: turns off the browser's own pop-ups and clears a field's red as soon as it changes
export const formCheckProps = {
  noValidate: true,
  onInputCapture: (e: React.FormEvent<HTMLFormElement>) => clearField(e.target as Element),
  onChangeCapture: (e: React.FormEvent<HTMLFormElement>) => clearField(e.target as Element),
};
