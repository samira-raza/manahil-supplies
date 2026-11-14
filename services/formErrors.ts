import { useState } from 'react';

// D39 (agreed 13 Nov 2026): when a save is refused, every field that blocks it is outlined in red,
// its reason shows under it, and the cursor jumps to the first one. The red clears as soon as the field changes.
// Usage: const fe = useFieldErrors();  <input {...fe.field('itemName', inputCls)} ... />  <FieldMessage msg={fe.errors.itemName} />
//        if (fe.show({ itemName: 'Enter the item name.' })) return;

export type FieldErrors = Record<string, string>;

// Added to a field's own classes; "!" wins over the field's normal border and background
export const invalidCls = ' !border-red-500 !bg-red-50';

export function useFieldErrors() {
  const [errors, setErrors] = useState<FieldErrors>({});

  // Shows the errors and moves the cursor to the first failing field on screen. Returns true when there is any error.
  const show = (errs: FieldErrors) => {
    setErrors(errs);
    const keys = Object.keys(errs);
    if (keys.length === 0) return false;
    // Wait for the red outline to render, then focus the first failing field in screen order
    requestAnimationFrame(() => {
      const first = Array.from(document.querySelectorAll<HTMLElement>('[data-field]'))
        .find(el => keys.includes(el.dataset.field || ''));
      if (first) {
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
        first.focus({ preventScroll: true });
      }
    });
    return true;
  };

  const clear = (key: string) => setErrors(prev => {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });

  // Props for a field: marks it for focusing, outlines it when it has an error, clears the error when it changes
  const field = (key: string, cls: string) => ({
    'data-field': key,
    'aria-invalid': errors[key] ? true : undefined,
    className: errors[key] ? cls + invalidCls : cls,
    onInput: () => clear(key),
  });

  return { errors, show, clear, field, reset: () => setErrors({}) };
}
