import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { attachmentsAPI, movementsAPI, ingredientsAPI, purchasePlansAPI, suppliersAPI } from '../lib/api';
import { Modal, SectionHeader, SopGuide, LoadingScreen } from '../components/UI';

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

const isoDate = (date = new Date()) => date.toISOString().split('T')[0];
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return isoDate(date);
};

export default function Mouvements({ ingredients, onRefresh, onNavigate }) {
  const [movements, setMovements] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [filterIng, setFilterIng] = useState('');
  const [filterType,setFilterType]= useState('');
  const [dateFrom,  setDateFrom]  = useState(daysAgo(29));
  const [dateTo,    setDateTo]    = useState(isoDate());
  const [purchasePlans,setPurchasePlans]=useState([]);
  const [suppliers,setSuppliers]=useState([]);
  const [attachment,setAttachment]=useState(null);
  const [editMovement,setEditMovement]=useState(null);
  const [editForm,setEditForm]=useState({qty:'',date:'',notes:'',purchaseTotal:'',reason:''});
  const [deleteTarget,setDeleteTarget]=useState(null);
  const [deleteReason,setDeleteReason]=useState('');
  const [preserveStock,setPreserveStock]=useState(false);
  const [preserveStockRequired,setPreserveStockRequired]=useState(false);

  const [form, setForm] = useState({
    ingredient_id:'', delta:'', type:'loss', reason:'', date:'',
    format_name:'', format_qty:'', format_price:'', format_count:'', supplier:'', supplier_id:'', payment_status:'paid', purchase_plan_item_id:''
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
  useEffect(()=>{Promise.all([purchasePlansAPI.getAll(),suppliersAPI.getAll()]).then(([plans,vendors])=>{setPurchasePlans(plans.filter(plan=>['ordered','partially_received'].includes(plan.status)));setSuppliers(vendors);}).catch(()=>{});},[]);

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (filterIng  && m.ingredient_id !== filterIng)  return false;
      if (filterType && m.movement_type !== filterType)  return false;
      const mDate = m.created_at?.split('T')[0];
      if (dateFrom && mDate < dateFrom) return false;
      if (dateTo   && mDate > dateTo)   return false;
      return true;
    });
  }, [movements, filterIng, filterType, dateFrom, dateTo]);

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

  const openModal = (type = 'loss') => {
    setForm({ ingredient_id:'', delta:'', type, reason:'', date:isoDate(), format_name:'', format_qty:'', format_price:'', format_count:'', supplier:'', supplier_id:'', payment_status:'paid', purchase_plan_item_id:'' });
    setAttachment(null);
    setShowModal(true);
  };
  const choosePlanItem=value=>{
    const item=purchasePlans.flatMap(plan=>(plan.purchase_plan_items||[]).map(line=>({...line,plan}))).find(line=>line.id===value);
    if(!item){setForm(f=>({...f,purchase_plan_item_id:''}));return;}
    const ingredient=ingredients.find(row=>row.id===item.ingredient_id);
    setForm(f=>({...f,purchase_plan_item_id:item.id,ingredient_id:item.ingredient_id,format_name:ingredient?.purchase_format_name||item.format_name||'',format_qty:ingredient?.purchase_format_qty||'',format_price:ingredient?.purchase_format_price||'',format_count:''}));
  };

  const chooseIngredient = ingredientId => {
    const ingredient = ingredients.find(item => item.id === ingredientId);
    setForm(current => ({
      ...current, ingredient_id:ingredientId, delta:'',
      format_name:ingredient?.purchase_format_name || '',
      format_qty:ingredient?.purchase_format_qty || '',
      format_price:ingredient?.purchase_format_price || '',
      format_count:''
    }));
  };

  const handleSave = async () => {
    if (!form.ingredient_id || (form.type !== 'entry' && (!form.delta || !form.reason.trim()))) {
      return toast.error(form.type === 'entry' ? 'Matière et quantité sont requises' : 'Matière, quantité et motif sont requis');
    }

    setSaving(true);
    try {
      if (form.type === 'entry') {
        if (!form.format_name.trim() || Number(form.format_qty) <= 0 || Number(form.format_price) <= 0 || Number(form.format_count) <= 0) {
          throw new Error('Format, contenu, prix et nombre reçu sont requis');
        }
        const result=await ingredientsAPI.receivePurchase({
          ingredientId:form.ingredient_id, formatName:form.format_name,
          formatQty:form.format_qty, formatPrice:form.format_price, formatCount:form.format_count,
          supplier:form.supplier, supplierId:form.supplier_id, purchasePlanItemId:form.purchase_plan_item_id,
          receivedAt:form.date, paymentStatus:form.payment_status, notes:form.reason
        });
        if(attachment&&result?.movement_id)await attachmentsAPI.upload('stock_movement',result.movement_id,attachment);
      } else {
        const parsed = parseFloat(form.delta);
        if (isNaN(parsed) || parsed <= 0) throw new Error('Quantité invalide');
        await ingredientsAPI.adjustStock(form.ingredient_id, -Math.abs(parsed), form.reason.trim(), form.type, form.date);
      }
      toast.success(form.type === 'entry' ? 'Réception enregistrée ✓' : 'Mouvement enregistré ✓');
      setShowModal(false);
      loadMovements();
      onRefresh();
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const canManage = movement => !['production_use','inventory'].includes(movement.movement_type);
  const openEdit = movement => {
    setEditMovement(movement);
    setEditForm({
      qty:String(movement.qty),
      date:String(movement.created_at || '').slice(0,10),
      notes:movement.notes || '',
      purchaseTotal:movement.movement_type === 'entry' ? String(movement.purchase_total ?? '') : '',
      reason:''
    });
  };
  const saveEdit = async () => {
    if (!editMovement || !editForm.date || !editForm.reason.trim() || !Number.isFinite(Number(editForm.qty)) || Number(editForm.qty) === 0) return toast.error('Quantité, date et motif de correction sont requis');
    if (editMovement.movement_type === 'entry' && Number(editForm.purchaseTotal) <= 0) return toast.error('Le coût total de la réception est requis');
    setSaving(true);
    try {
      await movementsAPI.update(editMovement.id,editForm);
      toast.success('Mouvement et stock synchronisés');
      setEditMovement(null);
      await loadMovements();
      await onRefresh();
    } catch(e) { toast.error(e.message); }
    finally { setSaving(false); }
  };
  const askDelete = movement => { setDeleteTarget(movement); setDeleteReason(''); setPreserveStock(false); setPreserveStockRequired(false); };
  const confirmDelete = async () => {
    if (!deleteTarget || !deleteReason.trim()) return toast.error('Indiquez le motif de suppression');
    setSaving(true);
    try {
      const result = await movementsAPI.delete(deleteTarget.id,deleteReason,preserveStock);
      toast.success(result?.stock_preserved ? 'Mouvement supprimé · stock physique conservé' : 'Mouvement supprimé et stock recalculé');
      setDeleteTarget(null);
      await loadMovements();
      await onRefresh();
    } catch(e) {
      if (e.message?.includes('déjà été consommée')) setPreserveStockRequired(true);
      toast.error(e.message);
    }
    finally { setSaving(false); }
  };

  const selectedIng  = ingredients.find(i => i.id === form.ingredient_id);
  const adjustType   = ADJUST_TYPES.find(t => t.id === form.type);
  const formatQty    = parseFloat(form.format_qty) || 0;
  const formatPrice  = parseFloat(form.format_price) || 0;
  const formatCount  = parseFloat(form.format_count) || 0;
  const totalFromFormats = form.type === 'entry' && formatCount > 0 && formatQty > 0
    ? formatCount * formatQty
    : null;
  const receiptTotal = form.type === 'entry' && formatCount > 0 && formatPrice > 0 ? formatCount * formatPrice : 0;

  const periodStats = useMemo(() => filtered.reduce((stats, movement) => {
    const qty = parseFloat(movement.qty) || 0;
    const ingredient = ingredients.find(item => item.id === movement.ingredient_id);
    if (movement.movement_type === 'entry') {
      stats.receptions += 1;
      stats.receivedValue += Number(movement.purchase_total ?? (Math.max(0, qty) * (parseFloat(ingredient?.price_per_unit) || 0)));
    }
    if (movement.movement_type === 'loss') stats.losses += 1;
    return stats;
  }, { receivedValue: 0, receptions: 0, losses: 0 }), [filtered, ingredients]);

  return (
    <div className="page-inner">
      <SectionHeader title="Mouvements de stock" subtitle="Réceptionner les achats, déclarer les pertes et retrouver chaque mouvement" />

      <div className="stock-tabs">
        <button onClick={() => onNavigate('ingredients')}>Stock</button>
        <button className="active">Mouvements</button>
        <button onClick={() => onNavigate('ingredients')}>Inventaire</button>
      </div>

      <div className="movement-primary-actions">
        <button className="receive" onClick={() => openModal('entry')}>＋ Réception</button>
        <button className="loss" onClick={() => openModal('loss')}>− Perte</button>
      </div>

      {/* Filtres */}
      <div className="movement-filters">
        <select className="form-select" style={{ maxWidth:200, height:34, fontSize:12 }}
          value={filterIng} onChange={e => setFilterIng(e.target.value)}>
          <option value="">Tous les articles</option>
          {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth:180, height:34, fontSize:12 }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous les types</option>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <input className="form-input" type="date" value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          style={{ height:34, fontSize:12, maxWidth:140 }} />
        <span style={{ fontSize:12, color:'var(--text-3)' }}>→</span>
        <input className="form-input" type="date" value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          style={{ height:34, fontSize:12, maxWidth:140 }} />

        {[7, 30, 90].map(d => (
          <button key={d} className="btn btn-sm"
            onClick={() => {
              const to = new Date();
              const from = new Date(); from.setDate(from.getDate() - d + 1);
              setDateFrom(from.toISOString().split('T')[0]);
              setDateTo(to.toISOString().split('T')[0]);
            }}>{d}j</button>
        ))}

        {(filterIng || filterType || dateFrom || dateTo) && (
          <button className="btn btn-sm btn-ghost"
            onClick={() => { setFilterIng(''); setFilterType(''); setDateFrom(''); setDateTo(''); }}>
            Effacer filtres
          </button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-3)', alignSelf:'center' }}>
          {filtered.length} résultat(s)
        </span>
      </div>

      <div className="movement-kpis">
        <div><strong>{periodStats.receivedValue.toFixed(2)} DT</strong><small>Valeur reçue</small></div>
        <div><strong>{periodStats.receptions}</strong><small>Réceptions</small></div>
        <div className={periodStats.losses > 0 ? 'alert' : ''}><strong>{periodStats.losses}</strong><small>Pertes</small></div>
      </div>

      <SopGuide steps={[{title:'Réceptionner',detail:'Ajouter ce qui arrive'},{title:'Signaler',detail:'Tracer les pertes'},{title:'Vérifier',detail:'Filtrer la période'}]} />

      {loading ? <LoadingScreen /> : (
        <>
        <div className="movement-mobile-list">
          {filtered.map(m => {
            const meta = TYPE_META[m.movement_type] || TYPE_META.adjustment;
            const ing = ingredients.find(i => i.id === m.ingredient_id);
            const qty = parseFloat(m.qty) || 0;
            return <article className="movement-mobile-card" key={`mobile-${m.id}`}>
              <span className="movement-kind" style={{color:meta.color,background:meta.bg}}>{meta.icon}</span>
              <div><strong>{m.ingredient_name}</strong><small>{meta.label}{m.purchase_format_name ? ` · ${m.purchase_format_count}× ${m.purchase_format_name}` : ''}{m.purchase_total != null ? ` · ${Number(m.purchase_total).toFixed(2)} DT` : ''}{m.notes ? ` · ${m.notes}` : ''}</small></div>
              <div className="movement-amount" style={{color:qty >= 0 ? 'var(--green)' : 'var(--red)'}}>
                <strong>{qty > 0 ? '+' : ''}{qty} <small>{ing?.unit || ''}</small></strong>
                <time>{new Date(m.created_at).toLocaleDateString('fr-FR', {day:'numeric',month:'short'})}</time>
              </div>
              <div className="movement-card-actions">{canManage(m)?<><button className="btn btn-sm" onClick={()=>openEdit(m)}>Modifier</button><button className="btn btn-sm btn-danger" onClick={()=>askDelete(m)}>Supprimer</button></>:<small>Corriger depuis {m.movement_type==='production_use'?'Production':'Inventaire'}</small>}</div>
            </article>;
          })}
          {filtered.length === 0 && <div className="movement-empty">Aucun mouvement sur cette période</div>}
        </div>
        <div className="card movement-desktop-table">
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
                    <th></th>
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
                          {m.purchase_format_name && <div><strong>{m.purchase_format_count}× {m.purchase_format_name}</strong>{m.purchase_total != null ? ` · ${Number(m.purchase_total).toFixed(3)} DT` : ''}</div>}
                          <div>{m.supplier || m.notes || '—'}</div>
                        </td>
                        <td><div className="movement-row-actions">{canManage(m)?<><button className="btn btn-sm" onClick={()=>openEdit(m)}>Modifier</button><button className="btn btn-sm btn-danger" onClick={()=>askDelete(m)}>Supprimer</button></>:<span className="form-hint">Action liée</span>}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
        </>
      )}

      {/* Modal correction */}
      <Modal open={showModal} onClose={() => setShowModal(false)}
        title={
          <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" style={{ color:'var(--gold-mid)' }}>
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg> {form.type === 'entry' ? 'Nouvelle réception' : form.type === 'loss' ? 'Nouvelle perte' : 'Correction de stock'}</>
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
          <label className="form-label">Type de mouvement</label>
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

        <div className="form-group">
          <label className="form-label">Date *</label>
          <input className="form-input" type="date" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))} />
        </div>

        <div className="form-group">
          <label className="form-label">Ingrédient *</label>
          <select className="form-select" value={form.ingredient_id}
            onChange={e => chooseIngredient(e.target.value)}>
            <option value="">Choisir...</option>
            {ingredients.map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.stock_qty} {i.unit})</option>
            ))}
          </select>
        </div>

        {form.type === 'entry' && selectedIng && (
          <div style={{
            background:'var(--navy-50)', border:'1px solid var(--navy-100)',
            borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:14
          }}>
            <div style={{ fontSize:11, color:'var(--text-3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
              Achat reçu · format et nouveau prix
            </div>
            {purchasePlans.length>0&&<div className="form-group"><label className="form-label">Plan d’achat <span className="form-hint">optionnel</span></label><select className="form-select" value={form.purchase_plan_item_id} onChange={e=>choosePlanItem(e.target.value)}><option value="">Réception hors plan</option>{purchasePlans.map(plan=><optgroup key={plan.id} label={plan.name}>{(plan.purchase_plan_items||[]).filter(line=>Number(line.received_qty)<Number(line.planned_qty)).map(line=><option key={line.id} value={line.id}>{line.ingredient_name} · reste {(Number(line.planned_qty)-Number(line.received_qty)).toFixed(1)} {line.unit}</option>)}</optgroup>)}</select></div>}
            <div className="form-group">
              <label className="form-label">Nom du format *</label>
              <input className="form-input" placeholder="Ex : Sac 25 kg, Carton 12 unités" value={form.format_name} onChange={e => setForm(f => ({...f,format_name:e.target.value}))}/>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Contenu par format ({selectedIng.unit}) *</label>
                <input className="form-input" type="number" min="0.001" step="0.001" value={form.format_qty} onChange={e => setForm(f => ({...f,format_qty:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Prix du format (DT) *</label>
                <input className="form-input" type="number" min="0.001" step="0.001" value={form.format_price} onChange={e => setForm(f => ({...f,format_price:e.target.value}))}/>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Nombre de formats reçus *</label>
                <input className="form-input" type="number" min="0.001" step="0.001" value={form.format_count} onChange={e => setForm(f => ({...f,format_count:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Paiement</label>
                <select className="form-select" value={form.payment_status} onChange={e => setForm(f => ({...f,payment_status:e.target.value}))}><option value="paid">Payé</option><option value="due">À payer</option></select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Fournisseur</label><select className="form-select" value={form.supplier_id} onChange={e=>{const vendor=suppliers.find(row=>row.id===e.target.value);setForm(f=>({...f,supplier_id:e.target.value,supplier:vendor?.name||''}));}}><option value="">Non renseigné</option>{suppliers.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <div className="form-group"><label className="form-label">Bon de livraison ou facture <span className="form-hint">PDF ou image, 10 Mo max.</span></label><input className="form-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/></div>
            {totalFromFormats != null && <div className="movement-receipt-summary">
              <span>Quantité reçue<strong>{Number(totalFromFormats.toFixed(3))} {selectedIng.unit}</strong></span>
              <span>Nouveau stock<strong>{Number((Number(selectedIng.stock_qty) + totalFromFormats).toFixed(3))} {selectedIng.unit}</strong></span>
              <span>Charge Finance<strong>{receiptTotal.toFixed(3)} DT</strong></span>
              <span>Nouveau prix unitaire<strong>{formatQty > 0 ? (formatPrice / formatQty).toFixed(5) : '0'} DT/{selectedIng.unit}</strong></span>
            </div>}
          </div>
        )}

        {form.type !== 'entry' && (
          <div className="form-group">
            <label className="form-label">
              Quantité ({selectedIng?.unit || 'g'}) *
              <span style={{ fontSize:10, color:'var(--text-3)', fontWeight:400, marginLeft:4 }}>
                → sera déduite
              </span>
            </label>
            <input className="form-input" type="number" min="0.01" step="0.01"
              placeholder="0" value={form.delta}
              onChange={e => setForm(f => ({ ...f, delta: e.target.value }))} />
            {selectedIng && form.delta && (
              <div className="form-hint" style={{
                color:'var(--red)', fontWeight:500
              }}>
                Nouveau stock : {Math.max(0,
                  parseFloat(selectedIng.stock_qty - parseFloat(form.delta||0)).toFixed(2)
                )} {selectedIng.unit}
              </div>
            )}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">{form.type === 'entry' ? 'Note de réception' : 'Motif *'} <span style={{ fontSize:10, color:'var(--text-3)', fontWeight:400 }}>{form.type === 'entry' ? 'optionnel' : 'obligatoire pour traçabilité'}</span></label>
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

      <Modal open={!!editMovement} onClose={()=>setEditMovement(null)} title="Modifier le mouvement"
        footer={<><button className="btn" onClick={()=>setEditMovement(null)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={saveEdit}>{saving?'Synchronisation...':'Enregistrer la correction'}</button></>}>
        {editMovement&&<div className="movement-edit-form">
          <div className="movement-edit-context"><strong>{editMovement.ingredient_name}</strong><span>{TYPE_META[editMovement.movement_type]?.label||editMovement.movement_type}</span><small>Stock actuel : {ingredients.find(i=>i.id===editMovement.ingredient_id)?.stock_qty} {ingredients.find(i=>i.id===editMovement.ingredient_id)?.unit}</small></div>
          <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Impact sur le stock *</label><input className="form-input" type="number" step="0.001" value={editForm.qty} onChange={e=>setEditForm(v=>({...v,qty:e.target.value}))}/><div className="form-hint">Entrée positive, perte négative.</div></div><div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={editForm.date} onChange={e=>setEditForm(v=>({...v,date:e.target.value}))}/></div></div>
          {editMovement.movement_type==='entry'&&<div className="form-group"><label className="form-label">Coût total de la réception (DT) *</label><input className="form-input" type="number" min="0.001" step="0.001" value={editForm.purchaseTotal} onChange={e=>setEditForm(v=>({...v,purchaseTotal:e.target.value}))}/><div className="form-hint">Met également à jour la charge Finance et le plan d’achat associés.</div></div>}
          <div className="form-group"><label className="form-label">Note</label><input className="form-input" value={editForm.notes} onChange={e=>setEditForm(v=>({...v,notes:e.target.value}))}/></div>
          <div className="form-group"><label className="form-label">Motif de la correction *</label><textarea className="form-textarea" rows="2" value={editForm.reason} onChange={e=>setEditForm(v=>({...v,reason:e.target.value}))} placeholder="Ex : erreur de saisie du bon de livraison"/></div>
        </div>}
      </Modal>

      <Modal open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} title="Supprimer le mouvement"
        footer={<><button className="btn" onClick={()=>setDeleteTarget(null)}>Annuler</button><button className="btn btn-danger" disabled={saving} onClick={confirmDelete}>{saving?'Synchronisation...':'Supprimer définitivement'}</button></>}>
        {deleteTarget&&<>
          <div className="alert alert-warning"><div><strong>{deleteTarget.ingredient_name} · {Number(deleteTarget.qty)>0?'+':''}{deleteTarget.qty}</strong><p>{preserveStock?'La réception et ses impacts Finance/achat seront supprimés, mais le stock physique actuel restera inchangé.':'Le mouvement sera supprimé et son impact sera automatiquement retiré du stock. La charge Finance et le plan d’achat liés seront corrigés.'}</p></div></div>
          {preserveStockRequired&&<label className="movement-preserve-stock"><input type="checkbox" checked={preserveStock} onChange={e=>setPreserveStock(e.target.checked)}/><span><strong>Conserver le stock physique actuel</strong><small>Uniquement si la réception erronée a déjà été consommée ou compensée par un comptage.</small></span></label>}
          <div className="form-group"><label className="form-label">Motif de suppression *</label><textarea className="form-textarea" rows="3" value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} placeholder="Ex : réception saisie en double"/></div>
        </>}
      </Modal>
    </div>
  );
}
