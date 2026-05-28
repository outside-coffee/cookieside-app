import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { salesAPI, computeCostPerCookie, getVarietyStock } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, EmptyState, VarietyDot, CostPreview, StatusBadge, ConfirmModal } from '../components/UI';

export default function Sales({ varieties, production, sales, onRefresh, loading }) {
  const [showModal, setShowModal]         = useState(false);
  const [showDelModal, setShowDelModal]   = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [saving, setSaving]               = useState(false);
  const [filter, setFilter]               = useState('all'); // all | Vendu | Livré
  const [form, setForm] = useState({
    variety_id: '', qty: 1, price: '', canal: '', client: '',
    date: new Date().toISOString().split('T')[0]
  });

  const selectedVariety = useMemo(() => varieties.find(v => v.id === form.variety_id), [varieties, form.variety_id]);
  const costPerCookie   = useMemo(() => selectedVariety ? computeCostPerCookie(selectedVariety) : 0, [selectedVariety]);
  const available       = useMemo(() => selectedVariety ? getVarietyStock(selectedVariety.id, production, sales) : 0, [selectedVariety, production, sales]);

  const suggestedPrice = useMemo(() => {
    if (!selectedVariety || !form.canal) return null;
    const sp = selectedVariety.sale_prices?.find(p => p.canal === form.canal);
    return sp ? sp.price : null;
  }, [selectedVariety, form.canal]);

  const marge = useMemo(() => {
    const p = parseFloat(form.price);
    const q = parseInt(form.qty);
    if (!p || !q || !selectedVariety) return null;
    const m = (p - costPerCookie) * q;
    const pct = p > 0 ? Math.round(m / (p * q) * 100) : 0;
    return { amount: m, pct };
  }, [form.price, form.qty, costPerCookie, selectedVariety]);

  const filteredSales = useMemo(() =>
    filter === 'all' ? sales : sales.filter(s => s.status === filter),
    [sales, filter]);

  const openModal = () => {
    setForm({ variety_id: '', qty: 1, price: '', canal: '', client: '', date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const applyPrice = (canal, variety) => {
    const v = variety || selectedVariety;
    if (!v || !canal) return;
    const sp = v.sale_prices?.find(p => p.canal === canal);
    if (sp) setForm(f => ({ ...f, price: sp.price, canal }));
    else setForm(f => ({ ...f, canal }));
  };

  const handleSave = async () => {
    if (!form.variety_id || !form.qty || !form.price || !form.date) return toast.error('Remplissez tous les champs obligatoires');
    const qty = parseInt(form.qty);
    const price = parseFloat(form.price);
    if (qty > available) return toast.error(`Stock insuffisant — ${available} cookie(s) disponible(s)`);
    setSaving(true);
    try {
      const ca = price * qty;
      const m  = (price - costPerCookie) * qty;
      await salesAPI.create({
        variety_id: selectedVariety.id,
        variety_name: selectedVariety.name,
        qty, price_per_unit: price,
        total_amount: ca.toFixed(3),
        margin: m.toFixed(3),
        margin_pct: ca > 0 ? (m / ca * 100).toFixed(1) : 0,
        client: form.client, canal: form.canal,
        status: 'Vendu', sold_at: form.date,
      });
      toast.success(`Vente enregistrée : ${qty} × ${selectedVariety.name} ✓`);
      setShowModal(false);
      onRefresh();
    } catch (e) {
      toast.error('Erreur : ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const markDelivered = async (id) => {
    try {
      await salesAPI.markDelivered(id);
      toast.success('Marqué comme livré ✓');
      onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  const markAllDelivered = async () => {
    try {
      await salesAPI.markAllDelivered();
      toast.success('Toutes les ventes marquées livrées ✓');
      onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async () => {
    try {
      await salesAPI.delete(deleteTarget.id);
      toast.success('Vente supprimée');
      setShowDelModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  const pendingCount = sales.filter(s => s.status === 'Vendu').length;

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Ventes"
        subtitle={`${sales.length} vente(s) — ${pendingCount} en attente de livraison`}
        actions={[
          pendingCount > 0 && (
            <button key="all-delivered" className="btn" onClick={markAllDelivered}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M5 12l5 5L20 7"/></svg>
              Tout livrer
            </button>
          ),
          <button key="new" className="btn btn-primary" onClick={openModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>
            Nouvelle vente
          </button>
        ].filter(Boolean)}
      />

      {/* Filtres */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
        {['all', 'Vendu', 'Livré'].map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : ''}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'Toutes' : f}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="table-container">
          {filteredSales.length === 0
            ? <EmptyState
                icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>}
                text="Aucune vente enregistrée"
              />
            : <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Variété</th>
                    <th style={{ textAlign: 'center' }}>Qté</th>
                    <th style={{ textAlign: 'right' }}>Prix/u</th>
                    <th style={{ textAlign: 'right' }}>CA</th>
                    <th style={{ textAlign: 'right' }}>Marge</th>
                    <th>Client / Canal</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map(s => {
                    const v = varieties.find(x => x.id === s.variety_id);
                    const m = parseFloat(s.margin || 0);
                    return (
                      <tr key={s.id}>
                        <td style={{ color: 'var(--text-3)', fontSize: '12px' }}>{s.sold_at}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <VarietyDot color={v?.color || '#999'} />
                            <span style={{ fontWeight: 500 }}>{s.variety_name}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{s.qty}</td>
                        <td style={{ textAlign: 'right' }}>{parseFloat(s.price_per_unit).toFixed(3)} DT</td>
                        <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--gold-d)' }}>{parseFloat(s.total_amount || 0).toFixed(3)} DT</td>
                        <td style={{ textAlign: 'right' }} className={m >= 0 ? 'profit-pos' : 'profit-neg'}>
                          {m >= 0 ? '+' : ''}{m.toFixed(3)} DT
                          <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: 4 }}>({s.margin_pct}%)</span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                          <div>{s.client || '—'}</div>
                          {s.canal && <span className={`badge badge-${s.canal.toLowerCase()}`} style={{ marginTop: 2 }}>{s.canal}</span>}
                        </td>
                        <td><StatusBadge status={s.status} /></td>
                        <td style={{ display: 'flex', gap: 4 }}>
                          {s.status === 'Vendu' && (
                            <button className="btn btn-sm" style={{ color: 'var(--green)' }}
                              onClick={() => markDelivered(s.id)} title="Marquer livré">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M5 12l5 5L20 7"/></svg>
                            </button>
                          )}
                          <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                            onClick={() => { setDeleteTarget(s); setShowDelModal(true); }} title="Supprimer">
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

      {/* Modal nouvelle vente */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={<><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> Nouvelle vente</>}
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
              onChange={e => {
                const v = varieties.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, variety_id: e.target.value }));
                if (form.canal && v) applyPrice(form.canal, v);
              }}>
              <option value="">Choisir une variété...</option>
              {varieties.map(v => {
                const s = getVarietyStock(v.id, production, sales);
                return <option key={v.id} value={v.id}>{v.name} (stock: {s})</option>;
              })}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Quantité *</label>
            <input className="form-input" type="number" min="1" value={form.qty}
              onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} />
            {selectedVariety && <div className="form-hint">Disponible : {available} cookies</div>}
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Canal</label>
            <select className="form-select" value={form.canal}
              onChange={e => applyPrice(e.target.value)}>
              <option value="">—</option>
              <option value="B2B">B2B</option>
              <option value="B2C">B2C</option>
            </select>
            {suggestedPrice && <div className="form-hint">Prix conseillé : {suggestedPrice} DT</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Prix unitaire (DT) *</label>
            <input className="form-input" type="number" step="0.1" placeholder="0.000" value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            {selectedVariety && <div className="form-hint">Coût de revient : {costPerCookie.toFixed(3)} DT</div>}
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-input" type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Client</label>
            <input className="form-input" type="text" placeholder="Optionnel" value={form.client}
              onChange={e => setForm(f => ({ ...f, client: e.target.value }))} />
          </div>
        </div>
        {marge && (
          <CostPreview>
            CA : <strong>{(parseFloat(form.price || 0) * parseInt(form.qty || 0)).toFixed(3)} DT</strong>
            {' '}— Marge : <strong style={{ color: marge.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {marge.amount >= 0 ? '+' : ''}{marge.amount.toFixed(3)} DT ({marge.pct}%)
            </strong>
          </CostPreview>
        )}
      </Modal>

      <ConfirmModal
        open={showDelModal}
        onClose={() => setShowDelModal(false)}
        onConfirm={handleDelete}
        title="Supprimer la vente"
        message={`Supprimer la vente de ${deleteTarget?.qty} × ${deleteTarget?.variety_name} ?`}
        danger
      />
    </div>
  );
}
