import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { movementsAPI, ingredientsAPI } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen } from '../components/UI';

const TYPE_META = {
  entry:          { label: 'Entrée',          color: '#1E6B3C', bg: '#E4F5EC', icon: '↑' },
  production_use: { label: 'Consommation',    color: '#1B2D5E', bg: '#EBF2FF', icon: '↓' },
  adjustment:     { label: 'Ajustement',      color: '#C47D10', bg: '#FEF3C7', icon: '±' },
  loss:           { label: 'Perte / Casse',   color: '#922B21', bg: '#FCECEA', icon: '✕' },
  inventory:      { label: 'Inventaire',      color: '#6B5CE7', bg: '#F0EEFF', icon: '≡' },
};

const ADJUST_TYPES = [
  { id: 'loss',      label: '🗑 Perte / Casse',   hint: 'Ex: produit tombé, périmé' },
  { id: 'adjustment',label: '📋 Correction inventaire', hint: 'Ex: recomptage après inventaire' },
  { id: 'entry',     label: '📦 Entrée de stock',  hint: 'Ex: livraison fournisseur' },
];

export default function Mouvements({ ingredients, onRefresh }) {
  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [filterIng, setFilterIng] = useState('');
  const [filterType,setFilterType]= useState('');

  const [form, setForm] = useState({
    ingredient_id: '', delta: '', type: 'loss', reason: '', date: ''
  });

  const loadMovements = async () => {
    setLoading(true);
    try {
      const data = await movementsAPI.getAll({ limit: 300 });
      setMovements(data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadMovements(); }, []);

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (filterIng  && m.ingredient_id !== filterIng)  return false;
      if (filterType && m.movement_type !== filterType)  return false;
      return true;
    });
  }, [movements, filterIng, filterType]);

  // Résumé par ingrédient (derniers 30 mouvements)
  const summary = useMemo(() => {
    const map = {};
    movements.forEach(m => {
      if (!map[m.ingredient_name]) map[m.ingredient_name] = { entries: 0, usage: 0, losses: 0 };
      if (m.movement_type === 'entry')           map[m.ingredient_name].entries += m.qty;
      if (m.movement_type === 'production_use')  map[m.ingredient_name].usage   += Math.abs(m.qty);
      if (m.movement_type === 'loss')            map[m.ingredient_name].losses  += Math.abs(m.qty);
    });
    return map;
  }, [movements]);

  const openModal = () => {
    setForm({ ingredient_id: '', delta: '', type: 'loss', reason: '', date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.ingredient_id || !form.delta || !form.reason.trim()) {
      return toast.error('Ingrédient, quantité et motif sont requis');
    }
    const rawDelta = parseFloat(form.delta);
    if (isNaN(rawDelta) || rawDelta === 0) return toast.error('Quantité invalide');

    // entrée = positif, perte/ajustement = négatif si utilisateur tape positif
    const delta = form.type === 'entry' ? Math.abs(rawDelta) : -Math.abs(rawDelta);

    setSaving(true);
    try {
      await ingredientsAPI.adjustStock(form.ingredient_id, delta, form.reason, form.type);
      toast.success('Mouvement enregistré ✓');
      setShowModal(false);
      loadMovements();
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const selectedIng = ingredients.find(i => i.id === form.ingredient_id);
  const adjustType  = ADJUST_TYPES.find(t => t.id === form.type);

  return (
    <div className="page-inner">
      <SectionHeader
        title="Mouvements de stock"
        subtitle={`${movements.length} mouvement(s) enregistré(s)`}
        actions={[
          <button key="adj" className="btn btn-primary" onClick={openModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Correction / Ajustement
          </button>
        ]}
      />

      {/* Filtres */}
      <div style={{ display:'flex', gap:8, marginBottom:'1rem', flexWrap:'wrap' }}>
        <select className="form-select" style={{ maxWidth:200, height:34, fontSize:12 }}
          value={filterIng} onChange={e => setFilterIng(e.target.value)}>
          <option value="">Tous les ingrédients</option>
          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth:180, height:34, fontSize:12 }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {(filterIng || filterType) && (
          <button className="btn btn-sm btn-ghost"
            onClick={() => { setFilterIng(''); setFilterType(''); }}>
            Effacer filtres
          </button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-3)', alignSelf:'center' }}>
          {filtered.length} résultat(s)
        </span>
      </div>

      {loading ? <LoadingScreen /> : (
        <div className="card">
          <div className="table-container">
            {filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-3)', fontSize:13 }}>
                Aucun mouvement{filterIng || filterType ? ' pour ces filtres' : ''}
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date & heure</th>
                    <th>Ingrédient</th>
                    <th>Type</th>
                    <th style={{ textAlign:'right' }}>Quantité</th>
                    <th>Motif / Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => {
                    const meta = TYPE_META[m.movement_type] || { label: m.movement_type, color:'#666', bg:'#eee', icon:'?' };
                    const ing  = ingredients.find(i => i.id === m.ingredient_id);
                    const qty  = parseFloat(m.qty);
                    const dt   = new Date(m.created_at);
                    return (
                      <tr key={m.id}>
                        <td style={{ fontSize:12, color:'var(--text-3)', whiteSpace:'nowrap' }}>
                          <div>{dt.toLocaleDateString('fr-FR')}</div>
                          <div style={{ opacity:0.6 }}>{dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</div>
                        </td>
                        <td style={{ fontWeight:500 }}>{m.ingredient_name}</td>
                        <td>
                          <span style={{
                            display:'inline-flex', alignItems:'center', gap:5,
                            background: meta.bg, color: meta.color,
                            fontSize:11, fontWeight:600, padding:'3px 9px',
                            borderRadius:20
                          }}>
                            <span>{meta.icon}</span> {meta.label}
                          </span>
                        </td>
                        <td style={{
                          textAlign:'right', fontWeight:700, fontSize:14,
                          color: qty > 0 ? 'var(--green)' : qty < 0 ? 'var(--red)' : 'var(--text-3)'
                        }}>
                          {qty > 0 ? '+' : ''}{qty} {ing?.unit || 'g'}
                        </td>
                        <td style={{ fontSize:12, color:'var(--text-2)', maxWidth:220 }}>
                          {m.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal correction */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={
          <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color:'var(--gold-mid)' }}>
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg> Correction de stock</>
        }
        footer={<>
          <button className="btn" onClick={() => setShowModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </>}
      >
        {/* Type d'ajustement */}
        <div className="form-group">
          <label className="form-label">Type de correction</label>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {ADJUST_TYPES.map(t => (
              <label key={t.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'10px 12px', borderRadius:'var(--radius)',
                border: `1.5px solid ${form.type === t.id ? 'var(--navy-500)' : 'var(--border-2)'}`,
                background: form.type === t.id ? 'var(--navy-50)' : 'var(--bg)',
                cursor:'pointer', transition:'all 0.15s'
              }}>
                <input type="radio" name="adj-type" value={t.id}
                  checked={form.type === t.id}
                  onChange={() => setForm(f => ({ ...f, type: t.id }))}
                  style={{ accentColor:'var(--navy-700)' }} />
                <div>
                  <div style={{ fontSize:13, fontWeight:500 }}>{t.label}</div>
                  <div style={{ fontSize:11, color:'var(--text-3)' }}>{t.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Ingrédient *</label>
            <select className="form-select" value={form.ingredient_id}
              onChange={e => setForm(f => ({ ...f, ingredient_id: e.target.value }))}>
              <option value="">Choisir...</option>
              {ingredients.map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.stock_qty} {i.unit})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">
              Quantité ({selectedIng?.unit || 'g'}) *
              <span style={{ fontSize:10, color:'var(--text-3)', fontWeight:400, marginLeft:4 }}>
                {form.type === 'entry' ? '→ sera ajoutée' : '→ sera déduite'}
              </span>
            </label>
            <input className="form-input" type="number" min="0.01" step="0.01"
              placeholder="0" value={form.delta}
              onChange={e => setForm(f => ({ ...f, delta: e.target.value }))} />
            {selectedIng && form.delta && (
              <div className="form-hint" style={{
                color: form.type === 'entry' ? 'var(--green)' : 'var(--red)', fontWeight:500
              }}>
                Nouveau stock : {Math.max(0,
                  parseFloat(form.type === 'entry'
                    ? selectedIng.stock_qty + parseFloat(form.delta||0)
                    : selectedIng.stock_qty - parseFloat(form.delta||0)
                  ).toFixed(2)
                )} {selectedIng.unit}
              </div>
            )}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Motif * <span style={{ fontSize:10, color:'var(--text-3)', fontWeight:400 }}>obligatoire pour traçabilité</span></label>
          <input className="form-input" type="text"
            placeholder={
              form.type === 'loss' ? 'Ex: Œufs cassés, farine renversée...' :
              form.type === 'inventory' ? 'Ex: Inventaire hebdomadaire du 12/06' :
              'Ex: Livraison fournisseur X'
            }
            value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
