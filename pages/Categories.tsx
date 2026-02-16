
import React, { useContext, useState } from 'react';
import { CRMContext } from '../App';
import { UserRole, Category } from '../types';
import { Icons } from '../constants';
import { db } from '../services/db';

const Categories: React.FC = () => {
  const ctx = useContext(CRMContext);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  if (!ctx) return null;
  const { categories, setCategories, currentUser } = ctx;

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN;
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const canEditCategories = isSuperAdmin || isAdmin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    const newCategory: Category = {
      id: Math.random().toString(36).substr(2, 9),
      name: formData.name,
      description: formData.description,
    };

    await db.upsertCategory(newCategory);
    setCategories([...categories, newCategory]);
    setShowAddModal(false);
    setFormData({ name: '', description: '' });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    await db.deleteCategory(id);
    setCategories(categories.filter(c => c.id !== id));
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Categories</h1>
          <p className="text-sm text-slate-500 mt-1">Product classification</p>
        </div>
        {canEditCategories && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 text-sm w-full md:w-auto"
          >
            <Icons.Plus />
            Add Category
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {categories.map(cat => (
          <div key={cat.id} className="bg-white p-5 md:p-8 rounded-2xl md:rounded-[32px] border border-slate-200 shadow-sm hover:border-indigo-300 transition-all group flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-slate-50 rounded-xl md:rounded-2xl flex items-center justify-center text-slate-400 mb-4 md:mb-6 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                <Icons.Category />
              </div>
              <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">{cat.name}</h3>
              <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                {cat.description || 'No description provided.'}
              </p>
            </div>
            <div className="mt-4 md:mt-8 pt-4 md:pt-6 border-t border-slate-100 flex items-center justify-between">
               <span className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-wider">ID: {cat.id}</span>
               {canEditCategories && (
                 <div className="flex items-center gap-3">
                   <button onClick={() => setEditingCategory(cat)} className="text-[10px] md:text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">Edit</button>
                   <button onClick={() => handleDelete(cat.id)} className="text-[10px] md:text-xs font-bold text-slate-400 hover:text-red-600 transition-colors">Delete</button>
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
                <h2 className="text-lg md:text-xl font-bold">New Category</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2} /></svg></button>
             </div>
             <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category Name*</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({...prev, name: e.target.value}))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
                    placeholder="e.g. Specialized Inserts"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({...prev, description: e.target.value}))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none text-sm font-bold"
                    placeholder="Describe what items fall under this category..."
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Save Category
                </button>
             </form>
          </div>
        </div>
      )}

      {editingCategory && (
        <EditCategoryModal
          category={editingCategory}
          onClose={() => setEditingCategory(null)}
          onSave={async (updated) => {
            await db.upsertCategory(updated);
            setCategories(categories.map(c => c.id === updated.id ? updated : c));
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
};

// Edit Category Modal Component
const EditCategoryModal: React.FC<{
  category: Category;
  onClose: () => void;
  onSave: (updated: Category) => void;
}> = ({ category, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: category.name,
    description: category.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    onSave({
      ...category,
      name: formData.name,
      description: formData.description,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-2 md:p-4">
      <div className="bg-white rounded-2xl md:rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-bold">Edit Category</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M6 18L18 6M6 6l12 12" strokeWidth={2} /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-8 space-y-4 md:space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category Name*</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-bold"
              placeholder="e.g. Specialized Inserts"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none text-sm font-bold"
              placeholder="Describe what items fall under this category..."
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

export default Categories;
