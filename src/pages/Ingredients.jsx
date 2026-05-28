import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ingredientsAPI } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, StockBadge, ConfirmModal } from '../components/UI';

const UNITS = ['g', 'kg', 'L', 'unité(s)', 'cl', 'ml'];

// Convertit price_per_unit (DT/g) → DT/kg selon l'unité
function getPricePerKg(price_per_unit, unit) {
  if (!price_per_unit || price_per_unit === 0) return null;
  const p = parseFloat(price_per_unit);
  switch (unit) {
    case 'g':   return p * 1000;          // DT/g → DT/kg
    case 'kg':  return p;                 // déjà en DT/kg
    case 'L':   return p * 1000;          // DT/L → DT/kg (≈ eau, approximatif)
    case 'cl':  return p * 100000;        // DT/cl → DT/kg
    case 'ml':  return p * 1000000;       // non pertinent mais calculé
    default:    return null;              // unité(s) → pas de prix/kg
  }
}

function formatPriceKg(price_per_unit, unit) {
  if (unit === 'unité(s)') return '—';
  const pkg = getPricePerKg(price_per_unit, unit);
  if (pkg === null) return '—';
  return pkg.toFixed(3) + ' DT/kg';
}

export default function Ingredients({ ingredients, onRefresh, loading }) {
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [showEntreeModal, setShowEntreeModal] = useState(false);
  const [showDelModal,    setShowDelModal]    = useState(false);
  const [target, setTarget] = useState(null);
  const [saving, setSaving]  = useState(false);

  const [addForm, setAddForm]   = useState({ name: '', stock_qty: 0, unit: 'g', alert_threshold: 50, price_per_unit: 0 });
  const [editForm, setEditForm] = useState({});
  const [entreeQty, setEntreeQty]     = useState('');
  const [entreeNotes, setEntreeNotes] = useState('');

  const openEdit   = (ing) => { setTarget(ing); setEditForm({ ...ing }); setShowEditModal(true); };
  const openEntree = (ing) => { setTarget(ing); setEntreeQty(''); setEntreeNotes(''); setShowEntreeModal(true); };

  const handleAdd = async () => {
    if (!addForm.name.trim()) return toast.error('Nom requis');
    setSaving(true);
    try {
      await ingredientsAPI.upsert(addForm);
      toast.success(`${addForm.name} ajouté ✓`);
      setShowAddModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await ingredientsAPI.upsert(editForm);
      toast.success('Ingrédient mis à jour ✓');
      setShowEditModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleEntree = async () => {
    const qty = parseFloat(entreeQty);
    if (!qty || qty <= 0) return toast.error('Quantité invalide');
    setSaving(true);
    try {
      const newQty = await ingredientsAPI.addEntry(target.id, qty, entreeNotes);
      toast.success(`+${qty} ${target.unit} de ${target.name} ✓ (nouveau : ${newQty})`);
      setShowEntreeModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await ingredientsAPI.delete(target.id);
      toast.success('Ingrédient supprimé');
      setShowDelModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Matières premières"
        subtitle={`${ingredients.length} ingrédient(s) — ${ingredients.filter(i => i.stock_qty <= i.alert_threshold).length} alerte(s)`}
        actions={[
          <button key="add" className="btn btn-primary"
            onClick={() => { setAddForm({ name:'', stock_qty:0, unit:'g', alert_threshold:50, price_per_unit:0 }); setShowAddModal(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter ingrédient
          </button>
        ]}
      />

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th style={{ textAlign: 'right' }}>Stock actuel</th>
                <th>Unité</th>
                <th style={{ textAlign: 'right' }}>Seuil alerte</th>
                <th style={{ textAlign: 'right' }}>Prix/unité (DT)</th>
                <th style={{ textAlign: 'right' }}>Prix au kg (DT)</th>
                <th>Statut</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map(ing => {
                const pkgLabel = formatPriceKg(ing.price_per_unit, ing.unit);
                return (
                  <tr key={ing.id}>
                    <td style={{ fontWeight: 500 }}>{ing.name}</td>
                    <td style={{
                      textAlign: 'right', fontWeight: 600, fontSize: '15px',
                      color: ing.stock_qty <= 0 ? 'var(--red)' : ing.stock_qty <= ing.alert_threshold ? 'var(--amber)' : 'inherit'
                    }}>
                      {ing.stock_qty}
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{ing.unit}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>{ing.alert_threshold}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-3)', fontSize: '12px' }}>
                      {parseFloat(ing.price_per_unit || 0).toFixed(5)} DT
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500, color: pkgLabel === '—' ? 'var(--text-3)' : 'var(--gold-d)' }}>
                      {pkgLabel}
                    </td>
                    <td><StockBadge qty={ing.stock_qty} threshold={ing.alert_threshold} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => openEntree(ing)}
                          style={{ color: 'var(--green)' }} title="Entrée de stock">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 5v14M5 12h14"/></svg>
                          Entrée
                        </button>
                        <button className="btn btn-icon btn-ghost btn-sm" onClick={() => openEdit(ing)} title="Modifier">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                          onClick={() => { setTarget(ing); setShowDelModal(true); }} title="Supprimer">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal ajouter */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)}
        title="Ajouter un ingrédient"
        footer={<>
          <button className="btn" onClick={() => setShowAddModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? '...' : 'Ajouter'}</button>
        </>}>
        <IngredientForm form={addForm} setForm={setAddForm} />
      </Modal>

      {/* Modal modifier */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)}
        title={`Modifier — ${target?.name}`}
        footer={<>
          <button className="btn" onClick={() => setShowEditModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </>}>
        {target && <IngredientForm form={editForm} setForm={setEditForm} edit />}
      </Modal>

      {/* Modal entrée de stock */}
      <Modal open={showEntreeModal} onClose={() => setShowEntreeModal(false)}
        title={<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Entrée de stock — {target?.name}</>}
        footer={<>
          <button className="btn" onClick={() => setShowEntreeModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleEntree} disabled={saving}>{saving ? '...' : 'Ajouter au stock'}</button>
        </>}>
        <div style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: '14px', fontSize: '13px' }}>
          Stock actuel : <strong>{target?.stock_qty} {target?.unit}</strong>
          {target && formatPriceKg(target.price_per_unit, target.unit) !== '—' && (
            <span style={{ marginLeft: 12, color: 'var(--gold-d)' }}>
              {formatPriceKg(target.price_per_unit, target.unit)}
            </span>
          )}
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Quantité à ajouter ({target?.unit}) *</label>
            <input className="form-input" type="number" min="0.01" step="0.01" placeholder="0"
              value={entreeQty} onChange={e => setEntreeQty(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input className="form-input" type="text" placeholder="Fournisseur, lot..."
              value={entreeNotes} onChange={e => setEntreeNotes(e.target.value)} />
          </div>
        </div>
        {entreeQty && (
          <div style={{ background: 'var(--green-l)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: '13px', color: 'var(--green)' }}>
            Nouveau stock : <strong>{parseFloat((parseFloat(target?.stock_qty || 0) + parseFloat(entreeQty || 0)).toFixed(2))} {target?.unit}</strong>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={showDelModal}
        onClose={() => setShowDelModal(false)}
        onConfirm={handleDelete}
        title="Supprimer l'ingrédient"
        message={`Supprimer ${target?.name} ? Attention : cela peut affecter les recettes existantes.`}
        danger
      />
    </div>
  );
}

function IngredientForm({ form, setForm, edit }) {
  const priceKg = getPricePerKg(form.price_per_unit, form.unit);

  return (
    <>
      <div className="form-group">
        <label className="form-label">Nom *</label>
        <input className="form-input" type="text" placeholder="ex: Caramel beurre salé"
          value={form.name || ''} disabled={edit}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Stock actuel</label>
          <input className="form-input" type="number" min="0" step="0.01"
            value={form.stock_qty || 0}
            onChange={e => setForm(f => ({ ...f, stock_qty: parseFloat(e.target.value) }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Unité</label>
          <select className="form-select" value={form.unit || 'g'}
            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Seuil d'alerte</label>
          <input className="form-input" type="number" min="0"
            value={form.alert_threshold || 0}
            onChange={e => setForm(f => ({ ...f, alert_threshold: parseFloat(e.target.value) }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Prix par unité (DT/{form.unit || 'g'})</label>
          <input className="form-input" type="number" min="0" step="0.00001"
            value={form.price_per_unit || 0}
            onChange={e => setForm(f => ({ ...f, price_per_unit: parseFloat(e.target.value) }))} />
          {priceKg !== null && form.unit !== 'unité(s)' && (
            <div className="form-hint" style={{ color: 'var(--gold-d)', fontWeight: 500 }}>
              → {priceKg.toFixed(3)} DT/kg
            </div>
          )}
        </div>
      </div>
    </>
  );
}
