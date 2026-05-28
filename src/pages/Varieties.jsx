import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { varietiesAPI, computeCostPerCookie } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, VarietyDot, ConfirmModal } from '../components/UI';

const PALETTE = ['#C8951A','#3498DB','#27AE60','#E74C3C','#9B59B6','#1ABC9C','#F39C12','#E91E63','#00BCD4','#8BC34A'];

export default function Varieties({ varieties, ingredients, onRefresh, loading }) {
  const [showModal,    setShowModal]    = useState(false);
  const [showDelModal, setShowDelModal] = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [delTarget,    setDelTarget]    = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: '', color: '#C8951A', active: true });
  const [recipes, setRecipes] = useState([]); // [{ingredient_id, ingredient_name, qty_per_cookie}]
  const [prices,  setPrices]  = useState({ B2B: '', B2C: '' });

  const openAdd = () => {
    setEditTarget(null);
    setForm({ name: '', color: '#C8951A', active: true });
    setRecipes([]);
    setPrices({ B2B: '', B2C: '' });
    setShowModal(true);
  };

  const openEdit = (v) => {
    setEditTarget(v);
    setForm({ id: v.id, name: v.name, color: v.color, active: v.active });
    setRecipes(v.recipes.map(r => ({
      ingredient_id: r.ingredient_id,
      ingredient_name: r.ingredients?.name || '',
      qty_per_cookie: r.qty_per_cookie,
    })));
    const b2b = v.sale_prices?.find(p => p.canal === 'B2B');
    const b2c = v.sale_prices?.find(p => p.canal === 'B2C');
    setPrices({ B2B: b2b?.price || '', B2C: b2c?.price || '' });
    setShowModal(true);
  };

  const addRecipeRow = () => {
    setRecipes(r => [...r, { ingredient_id: '', ingredient_name: '', qty_per_cookie: '' }]);
  };

  const updateRecipe = (idx, field, value) => {
    setRecipes(r => r.map((row, i) => {
      if (i !== idx) return row;
      if (field === 'ingredient_id') {
        const ing = ingredients.find(x => x.id === value);
        return { ...row, ingredient_id: value, ingredient_name: ing?.name || '' };
      }
      return { ...row, [field]: value };
    }));
  };

  const removeRecipe = (idx) => setRecipes(r => r.filter((_, i) => i !== idx));

  const costPreview = useMemo(() => {
    return recipes.reduce((sum, r) => {
      const ing = ingredients.find(i => i.id === r.ingredient_id);
      return sum + (parseFloat(r.qty_per_cookie || 0) * (ing?.price_per_unit || 0));
    }, 0);
  }, [recipes, ingredients]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Nom requis');
    const validRecipes = recipes.filter(r => r.ingredient_id && r.qty_per_cookie > 0);
    if (validRecipes.length === 0) return toast.error('Ajoutez au moins un ingrédient à la recette');
    setSaving(true);
    try {
      // Upsert variety
      const saved = await varietiesAPI.upsert(form);
      const vid = saved.id;

      // Clear & rebuild recipes if editing
      if (editTarget) {
        for (const r of editTarget.recipes) {
          await varietiesAPI.deleteRecipeIngredient(vid, r.ingredient_id);
        }
      }
      for (const r of validRecipes) {
        await varietiesAPI.upsertRecipe(vid, r.ingredient_id, parseFloat(r.qty_per_cookie));
      }

      // Upsert prices
      if (prices.B2B) await varietiesAPI.upsertPrice(vid, 'B2B', parseFloat(prices.B2B));
      if (prices.B2C) await varietiesAPI.upsertPrice(vid, 'B2C', parseFloat(prices.B2C));

      toast.success(`${form.name} ${editTarget ? 'mis à jour' : 'créé'} ✓`);
      setShowModal(false);
      onRefresh();
    } catch (e) { toast.error('Erreur : ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await varietiesAPI.delete(delTarget.id);
      toast.success(`${delTarget.name} archivé`);
      setShowDelModal(false);
      onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Recettes & Variétés"
        subtitle={`${varieties.length} variété(s) active(s)`}
        actions={[
          <button key="add" className="btn btn-primary" onClick={openAdd}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>
            Nouvelle variété
          </button>
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
        {varieties.map(v => {
          const cost = computeCostPerCookie(v);
          const b2b  = v.sale_prices?.find(p => p.canal === 'B2B');
          const b2c  = v.sale_prices?.find(p => p.canal === 'B2C');
          const mb2b = b2b && b2b.price > 0 ? Math.round((b2b.price - cost) / b2b.price * 100) : 0;
          const mb2c = b2c && b2c.price > 0 ? Math.round((b2c.price - cost) / b2c.price * 100) : 0;

          return (
            <div className="card" key={v.id}>
              <div className="card-header">
                <div className="card-title" style={{ fontSize: '15px' }}>
                  <VarietyDot color={v.color} />
                  {v.name}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-icon btn-ghost btn-sm" onClick={() => openEdit(v)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                    onClick={() => { setDelTarget(v); setShowDelModal(true); }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Prix */}
                <div style={{ display: 'flex', gap: 6, marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>Coût revient : <strong style={{ color: 'var(--gold-d)' }}>{cost.toFixed(3)} DT</strong></span>
                  {b2b && <span className="badge badge-b2b">B2B {b2b.price} DT ({mb2b}%)</span>}
                  {b2c && <span className="badge badge-b2c">B2C {b2c.price} DT ({mb2c}%)</span>}
                </div>
                {/* Ingrédients */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {v.recipes.map(r => (
                    <div key={r.ingredient_id} className="ing-chip">
                      <span className="ing-chip-name">{r.ingredients?.name}</span>
                      <span className="ing-chip-qty">{r.qty_per_cookie}g</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {varieties.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ color: 'var(--text-3)', fontSize: '14px' }}>Aucune variété. Créez votre premier cookie !</p>
        </div>
      )}

      {/* Modal create/edit */}
      <Modal open={showModal} onClose={() => setShowModal(false)} size="lg"
        title={editTarget ? `Modifier — ${editTarget.name}` : 'Nouvelle variété de cookie'}
        footer={<>
          <button className="btn" onClick={() => setShowModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : editTarget ? 'Mettre à jour' : 'Créer'}
          </button>
        </>}>

        {/* Infos de base */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Informations</div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Nom de la variété *</label>
              <input className="form-input" type="text" placeholder="ex: Nutella Crunch"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Couleur</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
                {PALETTE.map(c => (
                  <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: form.color === c ? '3px solid var(--navy-800)' : '2px solid transparent',
                      outline: form.color === c ? '2px solid white' : 'none' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Prix de vente */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Prix de vente</div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Prix B2B (DT)</label>
              <input className="form-input" type="number" step="0.1" placeholder="2.50"
                value={prices.B2B} onChange={e => setPrices(p => ({ ...p, B2B: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Prix B2C (DT)</label>
              <input className="form-input" type="number" step="0.1" placeholder="3.50"
                value={prices.B2C} onChange={e => setPrices(p => ({ ...p, B2C: e.target.value }))} />
            </div>
          </div>
          {costPreview > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-3)' }}>
              Coût de revient estimé : <strong style={{ color: 'var(--gold-d)' }}>{costPreview.toFixed(3)} DT</strong>
              {prices.B2B && <> — Marge B2B : <strong style={{ color: 'var(--green)' }}>{Math.round((parseFloat(prices.B2B) - costPreview) / parseFloat(prices.B2B) * 100)}%</strong></>}
              {prices.B2C && <> — Marge B2C : <strong style={{ color: 'var(--green)' }}>{Math.round((parseFloat(prices.B2C) - costPreview) / parseFloat(prices.B2C) * 100)}%</strong></>}
            </div>
          )}
        </div>

        {/* Recette */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recette — ingrédients par cookie
            </div>
            <button className="btn btn-sm" onClick={addRecipeRow}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
              Ajouter
            </button>
          </div>
          {recipes.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-3)', padding: '8px 0' }}>Aucun ingrédient ajouté</p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recipes.map((r, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: '8px', alignItems: 'center' }}>
                <select className="form-select" value={r.ingredient_id}
                  onChange={e => updateRecipe(idx, 'ingredient_id', e.target.value)}>
                  <option value="">Choisir un ingrédient...</option>
                  {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type="number" min="0" step="0.01"
                    placeholder="qtité/cookie"
                    value={r.qty_per_cookie}
                    onChange={e => updateRecipe(idx, 'qty_per_cookie', e.target.value)}
                    style={{ paddingRight: '28px' }} />
                  <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-3)' }}>
                    {ingredients.find(i => i.id === r.ingredient_id)?.unit || 'g'}
                  </span>
                </div>
                <button className="btn btn-icon btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                  onClick={() => removeRecipe(idx)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={showDelModal}
        onClose={() => setShowDelModal(false)}
        onConfirm={handleDelete}
        title="Archiver la variété"
        message={`Archiver ${delTarget?.name} ? La variété sera masquée mais les données historiques seront conservées.`}
        danger
      />
    </div>
  );
}
