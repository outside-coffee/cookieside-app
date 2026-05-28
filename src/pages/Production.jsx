import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { productionAPI, computeCostPerCookie } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, EmptyState, VarietyDot, Alert, CostPreview, ConfirmModal } from '../components/UI';

export default function Production({ varieties, ingredients, production, onRefresh, loading }) {
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ variety_id: '', qty: 28, date: new Date().toISOString().split('T')[0], notes: '' });

  const selectedVariety = useMemo(() => varieties.find(v => v.id === form.variety_id), [varieties, form.variety_id]);
  const costPerCookie   = useMemo(() => selectedVariety ? computeCostPerCookie(selectedVariety) : 0, [selectedVariety]);

  const stockWarnings = useMemo(() => {
    if (!selectedVariety || !form.qty) return [];
    return selectedVariety.recipes
      .map(r => {
        const ing = r.ingredients;
        const needed = r.qty_per_cookie * parseInt(form.qty || 0);
        const avail = ing?.stock_qty || 0;
        return needed > avail ? { name: ing?.name, needed: needed.toFixed(1), avail: avail, unit: ing?.unit } : null;
      })
      .filter(Boolean);
  }, [selectedVariety, form.qty]);

  const openModal = () => {
    setForm({ variety_id: '', qty: 28, date: new Date().toISOString().split('T')[0], notes: '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.variety_id || !form.qty || !form.date) return toast.error('Remplissez tous les champs obligatoires');
    if (!selectedVariety) return;
    setSaving(true);
    try {
      const qty = parseInt(form.qty);
      await productionAPI.create({
        variety_id: selectedVariety.id,
        variety_name: selectedVariety.name,
        qty,
        cost_per_cookie: costPerCookie.toFixed(4),
        total_cost: (costPerCookie * qty).toFixed(3),
        notes: form.notes,
        produced_at: form.date,
      }, selectedVariety.recipes, ingredients);
      toast.success(`${qty} cookies ${selectedVariety.name} enregistrés ✓`);
      setShowModal(false);
      onRefresh();
    } catch (e) {
      toast.error('Erreur : ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await productionAPI.delete(deleteTarget.id);
      toast.success('Production supprimée');
      setShowDeleteModal(false);
      onRefresh();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Production"
        subtitle={`${production.length} lot(s) enregistré(s)`}
        actions={[
          <button key="new" className="btn btn-primary" onClick={openModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>
            Nouvelle production
          </button>
        ]}
      />

      <div className="card">
        <div className="table-container">
          {production.length === 0
            ? <EmptyState
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>}
                text="Aucune production enregistrée"
              />
            : <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Variété</th>
                    <th style={{ textAlign: 'center' }}>Quantité</th>
                    <th style={{ textAlign: 'right' }}>Coût/cookie</th>
                    <th style={{ textAlign: 'right' }}>Coût total</th>
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {production.map(p => {
                    const v = varieties.find(x => x.id === p.variety_id);
                    return (
                      <tr key={p.id}>
                        <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{p.produced_at}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <VarietyDot color={v?.color || '#999'} />
                            <span style={{ fontWeight: 500 }}>{p.variety_name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '15px' }}>{p.qty}</td>
                        <td style={{ textAlign: 'right', color: 'var(--gold-d)' }}>{parseFloat(p.cost_per_cookie || 0).toFixed(3)} DT</td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>{parseFloat(p.total_cost || 0).toFixed(3)} DT</td>
                        <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{p.notes || '—'}</td>
                        <td>
                          <button className="btn btn-icon btn-ghost btn-sm"
                            style={{ color: 'var(--red)' }}
                            onClick={() => { setDeleteTarget(p); setShowDeleteModal(true); }}
                            title="Supprimer">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      </div>

      {/* Modal nouvelle production */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> Nouvelle production</>}
        footer={<>
          <button className="btn" onClick={() => setShowModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </>}
      >
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Variété *</label>
            <select className="form-select" value={form.variety_id}
              onChange={e => setForm(f => ({ ...f, variety_id: e.target.value }))}>
              <option value="">Choisir une variété...</option>
              {varieties.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantité (cookies) *</label>
            <input className="form-input" type="number" min="1" value={form.qty}
              onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
            <div className="form-hint">Standard : 28 par fournée</div>
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-input" type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes / Numéro de lot</label>
            <input className="form-input" type="text" placeholder="Optionnel" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        {selectedVariety && form.qty > 0 && (
          <CostPreview>
            Coût par cookie : <strong>{costPerCookie.toFixed(3)} DT</strong> — Total {form.qty} cookies : <strong>{(costPerCookie * parseInt(form.qty || 0)).toFixed(3)} DT</strong>
          </CostPreview>
        )}
        {stockWarnings.length > 0 && (
          <Alert variant="warning" style={{ marginTop: '10px' }}>
            <div>
              <strong>Stock insuffisant pour :</strong>
              <ul style={{ marginTop: 4, paddingLeft: '16px' }}>
                {stockWarnings.map(w => (
                  <li key={w.name}>{w.name} — besoin {w.needed}{w.unit}, disponible {w.avail}{w.unit}</li>
                ))}
              </ul>
            </div>
          </Alert>
        )}
      </Modal>

      <ConfirmModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Supprimer la production"
        message={`Supprimer ${deleteTarget?.qty} × ${deleteTarget?.variety_name} du ${deleteTarget?.produced_at} ? Cette action est irréversible.`}
        danger
      />
    </div>
  );
}
