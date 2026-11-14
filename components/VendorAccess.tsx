import React from 'react';
import FieldMessage from './FieldMessage';

// D43 (agreed 14 Nov 2026): for each Admin the Super Admin chooses "All vendors, including new ones"
// or "Only these vendors" with tick boxes. "All vendors" is stored as an empty list, which the app
// already treats as "no limit" (App.tsx visibleVendors), so suppliers added later are included.

// The one rule both Add User and the Admin's details check
export const vendorAccessError = (all: boolean, ids: string[]) =>
  !all && ids.length === 0 ? 'Tick at least one vendor, or choose All vendors, including new ones.' : '';

const VendorAccess: React.FC<{
  all: boolean;
  ids: string[];
  vendors: { id: string; name: string }[];
  onChange: (all: boolean, ids: string[]) => void;
  error?: string;
}> = ({ all, ids, vendors, onChange, error }) => {
  const toggle = (id: string) => onChange(false, ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const sorted = [...vendors].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-2 text-sm font-bold text-slate-700 cursor-pointer">
        <input type="radio" className="mt-1" style={{ minHeight: 0 }} checked={all} onChange={() => onChange(true, ids)} />
        <span>All vendors, including new ones<span className="block text-xs font-medium text-slate-500">Sees every vendor, also suppliers added later.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm font-bold text-slate-700 cursor-pointer">
        <input type="radio" className="mt-1" style={{ minHeight: 0 }} checked={!all} onChange={() => onChange(false, ids)} />
        <span>Only these vendors<span className="block text-xs font-medium text-slate-500">Tick the vendors this Admin looks after.</span></span>
      </label>
      {!all && (
        <div
          data-field="vendorAccess"
          tabIndex={-1}
          aria-invalid={error ? true : undefined}
          className={`max-h-52 overflow-y-auto rounded-xl border-2 p-2 space-y-1 outline-none ${error ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'}`}
        >
          {sorted.map(v => (
            <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm font-bold text-slate-700 cursor-pointer">
              <input type="checkbox" style={{ minHeight: 0 }} checked={ids.includes(v.id)} onChange={() => toggle(v.id)} />
              {v.name}
            </label>
          ))}
          {sorted.length === 0 && <p className="text-xs text-slate-400 italic px-2">No vendors yet.</p>}
        </div>
      )}
      <FieldMessage msg={error} />
    </div>
  );
};

export default VendorAccess;
