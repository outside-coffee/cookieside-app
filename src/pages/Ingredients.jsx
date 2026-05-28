import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ingredientsAPI } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, StockBadge, ConfirmModal } from '../components/UI';

const STOCK_UNITS = ['g', 'kg', 'L', 'cl', 'ml', 'unité(s)'];

// Formats d'achat prédéfinis (nom, qty en unité stock, exemple prix)
const FORMAT_PRESETS = [
  { label: 'Sac 1 kg',       qty: 1000, unit_hint: 'g' },
  { label: 'Sac 5 kg',       qty: 5000, unit_hint: 'g' },
  { label: 'Sac 25 kg',      qty: 25000, unit_hint: 'g' },
  { label: 'Boîte 500 g',    qty: 500,  unit_hint: 'g' },
  { label: 'Boîte 1 kg',     qty: 1000, unit_hint: 'g' },
  { label: 'Pot 750 g',      qty: 750,  unit_hint: 'g' },
  { label: 'Pot 3 kg',       qty: 3000, unit_hint: 'g' },
  { label: 'Bouteille 1 L',  qty: 1000, unit_hint: 'ml' },
  { label: 'Carton 12 u.',   qty: 12,   unit_hint: 'unité(s)' },
  { label: 'Plateau 30 u.',  qty: 30,   unit_hint: 'unité(s)' },
  { label: 'Personnalisé',   qty: null, unit_hint: null },
];

// Convertit price_per_unit (DT/g ou DT/unité) → DT/kg
function getPricePerKg(price_per_unit, unit) {
  if (!price_per_unit || price_per_unit === 0) return null;
  const p = parseFloat(price_per_unit);
  switch (unit) {
    case 'g':  return p * 1000;
    case 'kg': return p;
    case 'L':  return p * 1000;
    case 'cl': return p * 100;
    case 'ml': return p * 1000;
    default:   return null;
  }
}

function formatPriceKg(price_per_unit, unit) {
  if (unit === 'unité(s)') return null;
  const pkg = getPricePerKg(price_per_unit, unit);
  return pkg ? pkg.toFixed(3) + ' DT/kg' : null;
}

// Affichage du format d'achat d'un ingrédient
function formatAchat(ing) {
  if (!ing.purchase_format_name) return null;
  const parts = [ing.purchase_format_name];
  if (ing.purchase_format_qty) parts.push(`(${ing.purchase_format_qty} ${ing.unit})`);
  if (ing.purchase_format_price) parts.push(`— ${parseFloat(ing.purchase_format_price).toFixed(3)} DT`);
  return parts.join(' ');
}

export default function Ingredients({ ingredients, onRefresh, loading }) {
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [showEntreeModal, setShowEntreeModal] = useState(false);
  const [showDelModal,    setShowDelModal]    = useState(false);
  const [target,  setTarget]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');

  const emptyForm = { name:'', stock_qty:0, unit:'g', alert_threshold:50,
    price_per_unit:0, purchase_format_name:'', purchase_format_qty:'', purchase_format_price:'' };
  const [addForm,  setAddForm]  = useState(emptyForm);
  const [editForm, setEditForm] = useState({});

  // Entrée de stock : par format ou manuellement
  const [entreeMode,  setEntreeMode]  = useState('format'); // 'format' | 'manual'
  const [entreeNb,    setEntreeNb]    = useState(1);         // nb de formats
  const [entreeQty,   setEntreeQty]   = useState('');        // manuel
  const [entreeNotes, setEntreeNotes] = useState('');

  const filtered = useMemo(() =>
    ingredients.filter(i => i.name.toLowerCase().includes(search.toLowerCase())),
    [ingredients, search]);

  const openEdit   = (ing) => { setTarget(ing); setEditForm({ ...ing }); setShowEditModal(true); };
  const openEntree = (ing) => {
    setTarget(ing);
    setEntreeMode(ing.purchase_format_qty ? 'format' : 'manual');
    setEntreeNb(1); setEntreeQty(''); setEntreeNotes('');
    setShowEntreeModal(true);
  };

  // Quantité réelle qui sera ajoutée
  const entreeQtyReal = useMemo(() => {
    if (!target) return 0;
    if (entreeMode === 'format' && target.purchase_format_qty)
      return parseFloat(target.purchase_format_qty) * parseInt(entreeNb || 1);
    return parseFloat(entreeQty) || 0;
  }, [entreeMode, entreeNb, entreeQty, target]);

  const entreeCost = useMemo(() => {
    if (!target?.purchase_format_price) return null;
    if (entreeMode === 'format')
      return parseFloat(target.purchase_format_price) * parseInt(entreeNb || 1);
    return null;
  }, [entreeMode, entreeNb, target]);

  const handleAdd = async () => {
    if (!addForm.name.trim()) return toast.error('Nom requis');
    setSaving(true);
    try {
      // Calcul auto du prix/unité depuis le format si renseigné
      const form = computePricePerUnit({ ...addForm });
      await ingredientsAPI.upsert(form);
      toast.success(`${addForm.name} ajouté ✓`);
      setShowAddModal(false); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      const form = computePricePerUnit({ ...editForm });
      await ingredientsAPI.upsert(form);
      toast.success('Ingrédient mis à jour ✓');
      setShowEditModal(false); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleEntree = async () => {
    if (entreeQtyReal <= 0) return toast.error('Quantité invalide');
    setSaving(true);
    try {
      const notes = entreeNotes || (entreeMode === 'format' && target.purchase_format_name
        ? `${entreeNb}× ${target.purchase_format_name}` : '');
      const newQty = await ingredientsAPI.addEntry(target.id, entreeQtyReal, notes);
      toast.success(`+${entreeQtyReal} ${target.unit} de ${target.name} ✓ → ${newQty} ${target.unit}`);
      setShowEntreeModal(false); onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await ingredientsAPI.delete(target.id);
      toast.success('Ingrédient supprimé');
      setShowDelModal(false); onRefresh();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <LoadingScreen />;

  const alertCount = ingredients.filter(i => i.stock_qty <= i.alert_threshold).length;

  return (
    <div className="page-inner">
      <SectionHeader
        title="Matières premières"
        subtitle={`${ingredients.length} ingrédient(s) — ${alertCount} alerte(s)`}
        actions={[
          <button key="add" className="btn btn-primary"
            onClick={() => { setAddForm(emptyForm); setShowAddModal(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>
            Ajouter ingrédient
          </button>
        ]}
      />

      {/* Barre de recherche */}
      <div style={{ marginBottom:'1rem', position:'relative' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', width:15, height:15, color:'var(--text-3)' }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input className="form-input" placeholder="Rechercher un ingrédient..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft:34 }} />
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Ingrédient</th>
                <th style={{ textAlign:'right' }}>Stock</th>
                <th>Format d'achat</th>
                <th style={{ textAlign:'right' }}>Prix/format</th>
                <th style={{ textAlign:'right' }}>Prix/kg</th>
                <th style={{ textAlign:'right' }}>Seuil</th>
                <th>Statut</th>
                <th style={{ textAlign:'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ing => {
                const priceKgLabel = formatPriceKg(ing.price_per_unit, ing.unit);
                const achatLabel   = formatAchat(ing);
                return (
                  <tr key={ing.id}>
                    <td style={{ fontWeight:500 }}>{ing.name}</td>
                    <td style={{
                      textAlign:'right', fontWeight:700, fontSize:15,
                      color: ing.stock_qty <= 0 ? 'var(--red)'
                           : ing.stock_qty <= ing.alert_threshold ? 'var(--amber)' : 'inherit'
                    }}>
                      {ing.stock_qty}
                      <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:3 }}>{ing.unit}</span>
                    </td>
                    <td>
                      {achatLabel
                        ? <span style={{ fontSize:12, color:'var(--navy-700)', fontWeight:500 }}>{achatLabel}</span>
                        : <span style={{ fontSize:12, color:'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'right' }}>
                      {ing.purchase_format_price
                        ? <span style={{ fontWeight:500, color:'var(--gold-d)' }}>
                            {parseFloat(ing.purchase_format_price).toFixed(3)} DT
                          </span>
                        : <span style={{ color:'var(--text-3)', fontSize:12 }}>—</span>}
                    </td>
                    <td style={{ textAlign:'right', fontSize:12 }}>
                      {priceKgLabel
                        ? <span style={{ color:'var(--text-2)' }}>{priceKgLabel}</span>
                        : <span style={{ color:'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ textAlign:'right', color:'var(--text-3)', fontSize:12 }}>
                      {ing.alert_threshold} {ing.unit}
                    </td>
                    <td><StockBadge qty={ing.stock_qty} threshold={ing.alert_threshold} /></td>
                    <td>
                      <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => openEntree(ing)}
                          style={{ color:'var(--green)' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg>
                          Entrée
                        </button>
                        <button className="btn btn-icon btn-ghost btn-sm" onClick={() => openEdit(ing)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="btn btn-icon btn-ghost btn-sm" style={{ color:'var(--red)' }}
                          onClick={() => { setTarget(ing); setShowDelModal(true); }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign:'center', color:'var(--text-3)', padding:'2rem', fontSize:13 }}>
                  Aucun ingrédient trouvé
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal Ajouter ── */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} size="lg"
        title="Ajouter un ingrédient"
        footer={<>
          <button className="btn" onClick={() => setShowAddModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>{saving ? '...' : 'Ajouter'}</button>
        </>}>
        <IngredientForm form={addForm} setForm={setAddForm} />
      </Modal>

      {/* ── Modal Modifier ── */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} size="lg"
        title={`Modifier — ${target?.name}`}
        footer={<>
          <button className="btn" onClick={() => setShowEditModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleEdit} disabled={saving}>{saving ? '...' : 'Enregistrer'}</button>
        </>}>
        {target && <IngredientForm form={editForm} setForm={setEditForm} edit />}
      </Modal>

      {/* ── Modal Entrée de stock ── */}
      <Modal open={showEntreeModal} onClose={() => setShowEntreeModal(false)}
        title={<>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color:'var(--gold-mid)' }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Entrée de stock — {target?.name}
        </>}
        footer={<>
          <button className="btn" onClick={() => setShowEntreeModal(false)}>Annuler</button>
          <button className="btn btn-primary" onClick={handleEntree} disabled={saving || entreeQtyReal <= 0}>
            {saving ? '...' : `Ajouter ${entreeQtyReal > 0 ? entreeQtyReal + ' ' + target?.unit : ''}`}
          </button>
        </>}>

        {/* Infos stock actuel */}
        <div style={{
          background:'var(--navy-50)', borderRadius:'var(--radius)',
          padding:'10px 14px', marginBottom:14, fontSize:13,
          display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8
        }}>
          <div>Stock actuel : <strong>{target?.stock_qty} {target?.unit}</strong></div>
          {target && formatPriceKg(target.price_per_unit, target.unit) && (
            <div style={{ color:'var(--gold-d)', fontSize:12 }}>
              {formatPriceKg(target.price_per_unit, target.unit)}
            </div>
          )}
        </div>

        {/* Toggle mode si format configuré */}
        {target?.purchase_format_qty && (
          <div style={{ display:'flex', background:'#F1F5F9', borderRadius:10, padding:3, marginBottom:14, gap:3 }}>
            {[
              { id:'format', label:`📦 Par format (${target.purchase_format_name || 'Format'})` },
              { id:'manual', label:'✏️ Quantité manuelle' },
            ].map(m => (
              <button key={m.id}
                onClick={() => setEntreeMode(m.id)}
                style={{
                  flex:1, border:'none', borderRadius:8, padding:'8px 0',
                  fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:'inherit',
                  background: entreeMode === m.id ? '#fff' : 'transparent',
                  color: entreeMode === m.id ? 'var(--navy-800)' : '#9CA3AF',
                  boxShadow: entreeMode === m.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  transition:'all 0.15s',
                }}>
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Mode format */}
        {entreeMode === 'format' && target?.purchase_format_qty ? (
          <div>
            {/* Fiche format */}
            <div style={{
              background:'var(--sand)', border:'1px solid var(--cream-d)',
              borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:14
            }}>
              <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:6 }}>Format configuré</div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Nom</span><br/><strong style={{ fontSize:13 }}>{target.purchase_format_name || '—'}</strong></div>
                <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Contenu</span><br/><strong style={{ fontSize:13 }}>{target.purchase_format_qty} {target.unit}</strong></div>
                {target.purchase_format_price && (
                  <div><span style={{ fontSize:11, color:'var(--text-3)' }}>Prix</span><br/><strong style={{ fontSize:13, color:'var(--gold-d)' }}>{parseFloat(target.purchase_format_price).toFixed(3)} DT</strong></div>
                )}
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nombre de formats reçus *</label>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <button className="btn btn-sm" onClick={() => setEntreeNb(n => Math.max(1, n-1))}>−</button>
                  <input className="form-input" type="number" min="1" value={entreeNb}
                    onChange={e => setEntreeNb(Math.max(1, parseInt(e.target.value)||1))}
                    style={{ textAlign:'center', fontWeight:700, fontSize:16 }} />
                  <button className="btn btn-sm" onClick={() => setEntreeNb(n => n+1)}>+</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notes / Fournisseur</label>
                <input className="form-input" type="text" placeholder="Ex: Carrefour, lot 042"
                  value={entreeNotes} onChange={e => setEntreeNotes(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          /* Mode manuel */
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Quantité à ajouter ({target?.unit}) *</label>
              <input className="form-input" type="number" min="0.01" step="0.01" placeholder="0"
                value={entreeQty} onChange={e => setEntreeQty(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes / Fournisseur</label>
              <input className="form-input" type="text" placeholder="Ex: Carrefour, lot 042"
                value={entreeNotes} onChange={e => setEntreeNotes(e.target.value)} />
            </div>
          </div>
        )}

        {/* Récap */}
        {entreeQtyReal > 0 && (
          <div style={{
            background:'var(--green-l)', borderRadius:'var(--radius)',
            padding:'10px 14px', fontSize:13, color:'var(--green)',
            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8
          }}>
            <div>
              Ajout : <strong>+{entreeQtyReal} {target?.unit}</strong>
              {' '}→ Nouveau stock : <strong>{parseFloat(((target?.stock_qty||0) + entreeQtyReal).toFixed(2))} {target?.unit}</strong>
            </div>
            {entreeCost !== null && (
              <div style={{ color:'var(--gold-d)', fontWeight:600 }}>
                Coût : {entreeCost.toFixed(3)} DT
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal open={showDelModal} onClose={() => setShowDelModal(false)}
        onConfirm={handleDelete} title="Supprimer l'ingrédient"
        message={`Supprimer ${target?.name} ? Cela peut affecter les recettes existantes.`}
        danger />
    </div>
  );
}

// Calcule price_per_unit depuis le format si possible
function computePricePerUnit(form) {
  const fQty   = parseFloat(form.purchase_format_qty);
  const fPrice = parseFloat(form.purchase_format_price);
  if (fQty > 0 && fPrice > 0) {
    form.price_per_unit = parseFloat((fPrice / fQty).toFixed(8));
  }
  return form;
}

function IngredientForm({ form, setForm, edit }) {
  const priceKg = getPricePerKg(form.price_per_unit, form.unit);
  const [selectedPreset, setSelectedPreset] = useState('');

  const applyPreset = (presetLabel) => {
    setSelectedPreset(presetLabel);
    const p = FORMAT_PRESETS.find(x => x.label === presetLabel);
    if (!p) return;
    if (p.qty !== null) {
      setForm(f => ({ ...f, purchase_format_name: p.label, purchase_format_qty: p.qty }));
    }
  };

  // Prix/unité calculé depuis le format
  const priceFromFormat = useMemo(() => {
    const fQty   = parseFloat(form.purchase_format_qty);
    const fPrice = parseFloat(form.purchase_format_price);
    if (fQty > 0 && fPrice > 0) return (fPrice / fQty).toFixed(6);
    return null;
  }, [form.purchase_format_qty, form.purchase_format_price]);

  const priceKgFromFormat = useMemo(() => {
    if (!priceFromFormat) return null;
    return getPricePerKg(parseFloat(priceFromFormat), form.unit);
  }, [priceFromFormat, form.unit]);

  return (
    <>
      {/* ── Section 1 : Informations de base ── */}
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
          Informations de base
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Nom *</label>
            <input className="form-input" type="text" placeholder="ex: Farine de blé T45"
              value={form.name || ''} disabled={edit}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Unité de stock</label>
            <select className="form-select" value={form.unit || 'g'}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {STOCK_UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
            <div className="form-hint">Unité utilisée dans les recettes</div>
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Stock actuel ({form.unit || 'g'})</label>
            <input className="form-input" type="number" min="0" step="0.01"
              value={form.stock_qty ?? 0}
              onChange={e => setForm(f => ({ ...f, stock_qty: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Seuil d'alerte ({form.unit || 'g'})</label>
            <input className="form-input" type="number" min="0"
              value={form.alert_threshold ?? 50}
              onChange={e => setForm(f => ({ ...f, alert_threshold: parseFloat(e.target.value) || 0 }))} />
            <div className="form-hint">Alerte quand le stock passe sous ce seuil</div>
          </div>
        </div>
      </div>

      {/* ── Section 2 : Format d'achat ── */}
      <div style={{ marginBottom:'1.25rem' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
          Format d'achat fournisseur
        </div>

        {/* Presets rapides */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>
          {FORMAT_PRESETS.map(p => (
            <button key={p.label} type="button"
              onClick={() => applyPreset(p.label)}
              style={{
                padding:'4px 10px', fontSize:11, fontWeight:500,
                border: `1px solid ${form.purchase_format_name === p.label ? 'var(--navy-600)' : 'var(--border-2)'}`,
                borderRadius:20, background: form.purchase_format_name === p.label ? 'var(--navy-50)' : 'var(--bg)',
                color: form.purchase_format_name === p.label ? 'var(--navy-700)' : 'var(--text-3)',
                cursor:'pointer', transition:'all 0.12s',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Nom du format</label>
            <input className="form-input" type="text" placeholder="Ex: Sac 5kg, Boîte 1kg..."
              value={form.purchase_format_name || ''}
              onChange={e => setForm(f => ({ ...f, purchase_format_name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Contenu par format ({form.unit || 'g'})</label>
            <input className="form-input" type="number" min="0.01" step="0.01"
              placeholder={`Ex: 5000 pour un sac de 5kg`}
              value={form.purchase_format_qty || ''}
              onChange={e => setForm(f => ({ ...f, purchase_format_qty: e.target.value }))} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Prix par format (DT)</label>
            <input className="form-input" type="number" min="0" step="0.001"
              placeholder="Ex: 12.500"
              value={form.purchase_format_price || ''}
              onChange={e => setForm(f => ({ ...f, purchase_format_price: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom:0 }}>
            <label className="form-label">Prix par {form.unit || 'g'} (auto-calculé)</label>
            <input className="form-input" type="number" min="0" step="0.000001"
              placeholder="Calculé depuis format ou saisi manuellement"
              value={priceFromFormat ?? (form.price_per_unit || '')}
              onChange={e => setForm(f => ({ ...f, price_per_unit: parseFloat(e.target.value) || 0 }))}
              style={{ background: priceFromFormat ? 'var(--bg-2)' : 'var(--bg)', color:'var(--text-3)' }}
              readOnly={!!priceFromFormat}
            />
            {(priceFromFormat || form.price_per_unit > 0) && form.unit !== 'unité(s)' && (
              <div className="form-hint" style={{ color:'var(--gold-d)', fontWeight:600 }}>
                → {getPricePerKg(parseFloat(priceFromFormat || form.price_per_unit), form.unit)?.toFixed(3)} DT/kg
              </div>
            )}
          </div>
        </div>

        {/* Récap format */}
        {form.purchase_format_name && form.purchase_format_qty && form.purchase_format_price && (
          <div style={{
            marginTop:12, background:'var(--navy-50)', borderRadius:'var(--radius)',
            padding:'10px 14px', fontSize:12, color:'var(--navy-700)'
          }}>
            📦 <strong>{form.purchase_format_name}</strong> — {form.purchase_format_qty} {form.unit}
            {' '}à <strong style={{ color:'var(--gold-d)' }}>{parseFloat(form.purchase_format_price).toFixed(3)} DT</strong>
            {priceFromFormat && <span style={{ color:'var(--text-3)', marginLeft:8 }}>({parseFloat(priceFromFormat).toFixed(5)} DT/{form.unit})</span>}
          </div>
        )}
      </div>
    </>
  );
}
