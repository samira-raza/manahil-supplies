
import React, { useContext, useState } from 'react';
import { CRMContext } from '../App';
import { UserRole, MeasuringUnit } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const MeasuringUnits: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<MeasuringUnit | null>(null);
  const [formData, setFormData] = useState({ name: '', symbol: '' });

  if (!ctx) return null;
  const { measuringUnits, setMeasuringUnits, currentUser } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const canEdit = isSuperAdmin || isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.symbol) return;

    const newUnit: MeasuringUnit = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      symbol: formData.symbol,
    };

    await db.upsertMeasuringUnit(newUnit);
    setMeasuringUnits([...measuringUnits, newUnit]);
    setShowAddModal(false);
    setFormData({ name: '', symbol: '' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this measuring unit?')) return;
    await db.deleteMeasuringUnit(id);
    setMeasuringUnits(measuringUnits.filter(u => u.id !== id));
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Measuring Units</h1>
          <p className="text-sm text-slate-500 mt-1">Unit standards for product dimensions</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            Add Unit
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {measuringUnits.map(unit => (
          <div key={unit.id} className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400 mb-4 md:mb-6 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Icons.Ruler />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">{unit.name}</h3>
              <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                Symbol: <span className="font-bold text-indigo-600">{unit.symbol}</span>
              </p>
            </div>
            <div className="mt-4 md:mt-8 pt-4 md:pt-6 border-t border-slate-100 flex items-center justify-between">
               <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">ID: {unit.id}</span>
               {canEdit && (
                 <div className="flex items-center gap-3">
                   <button onClick={() => setEditingUnit(unit)} className="text-[10px] md:text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">Edit</button>
                   <button onClick={() => handleDelete(unit.id)} className="text-[10px] md:text-xs font-bold text-slate-400 hover:text-red-600 transition-colors">Delete</button>
                 </div>
               )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
          <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <h2 className="text-lg md:text-xl font-bold">New Measuring Unit</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2} /></svg></button>
             </div>
             <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unit Name*</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    placeholder="e.g. Millimeter"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Symbol*</label>
                  <input
                    type="text"
                    value={formData.symbol}
                    onChange={(e) => setFormData(prev => ({...prev, symbol: e.target.value}))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    placeholder="e.g. mm"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Save Unit
                </button>
             </form>
          </div>
        </div>
      )}

      {editingUnit && (
        <EditUnitModal
          unit={editingUnit}
          onClose={() => setEditingUnit(null)}
          onSave={async (updated) => {
            await db.upsertMeasuringUnit(updated);
            setMeasuringUnits(measuringUnits.map(u => u.id === updated.id ? updated : u));
            setEditingUnit(null);
          }}
        />
      )}
    </div>
  );
};

const EditUnitModal: React.FC<{
  unit: MeasuringUnit;
  onClose: () => void;
  onSave: (updated: MeasuringUnit) => void;
}> = ({ unit, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: unit.name,
    symbol: unit.symbol,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.symbol) return;
    onSave({
      ...unit,
      name: formData.name,
      symbol: formData.symbol,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-bold">Edit Measuring Unit</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2} /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Unit Name*</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
              placeholder="e.g. Millimeter"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Symbol*</label>
            <input
              type="text"
              value={formData.symbol}
              onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
              placeholder="e.g. mm"
              required
            />
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 md:py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 md:py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MeasuringUnits;
