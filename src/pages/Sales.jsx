import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ordersAPI, computeCostPerCookie, getVarietyStockBreakdown } from '../lib/api';
import { unitLabel } from '../lib/products';
import { Modal, SectionHeader, SopGuide, LoadingScreen, EmptyState, VarietyDot } from '../components/UI';

const STATUS_META = {
  Vendu: { label:'À préparer', badge:'badge-sold', next:'Livré' },
  Livré: { label:'Livrée', badge:'badge-delivered', next:'Payé' },
  Payé: { label:'Payée', badge:'badge-paid', next:null },
};

const emptyLine = () => ({ variety_id:'', qty:1, price:'' });

export default function Sales({ varieties, production, sales, orders, onRefresh, onNavigate, loading }) {
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({ client:'', canal:'B2C', delivery_date:new Date().toISOString().split('T')[0], notes:'', items:[emptyLine()] });

  const visibleOrders = useMemo(() => filter === 'all' ? orders : orders.filter(order => order.status === filter), [orders, filter]);
  const totals = useMemo(() => ({
    ca:orders.reduce((sum,o)=>sum+Number(o.total_amount||0),0),
    pending:orders.filter(o=>o.status==='Vendu').length,
    receivable:orders.filter(o=>o.status==='Livré').reduce((sum,o)=>sum+Number(o.total_amount||0),0),
  }), [orders]);

  const openModal = () => {
    setForm({ client:'', canal:'B2C', delivery_date:new Date().toISOString().split('T')[0], notes:'', items:[emptyLine()] });
    setShowModal(true);
  };

  const updateLine = (index, patch) => setForm(current => ({ ...current, items:current.items.map((line,i)=>i===index?{...line,...patch}:line) }));
  const chooseProduct = (index, varietyId) => {
    const variety = varieties.find(v=>v.id===varietyId);
    const suggested = variety?.sale_prices?.find(p=>p.canal===form.canal)?.price;
    updateLine(index, { variety_id:varietyId, price:suggested ?? '' });
  };

  const orderPreview = useMemo(() => form.items.reduce((acc,line) => {
    const variety=varieties.find(v=>v.id===line.variety_id); const qty=Number(line.qty||0); const price=Number(line.price||0);
    const cost=variety?computeCostPerCookie(variety):0;
    acc.total += qty*price; acc.margin += qty*(price-cost); return acc;
  }, {total:0,margin:0}), [form.items,varieties]);

  const handleSave = async () => {
    const items=form.items.filter(line=>line.variety_id && Number(line.qty)>0 && line.price!=='');
    if (!form.delivery_date || items.length===0) return toast.error('Ajoutez au moins un produit valide');
    for (const line of items) {
      const stock=getVarietyStockBreakdown(line.variety_id,production,sales);
      const totalRequested=items.filter(i=>i.variety_id===line.variety_id).reduce((sum,i)=>sum+Number(i.qty),0);
      if (totalRequested>stock.available) return toast.error(`Stock disponible insuffisant pour ${varieties.find(v=>v.id===line.variety_id)?.name}`);
    }
    setSaving(true);
    try {
      await ordersAPI.create({ ...form, items:items.map(line=>({ variety_id:line.variety_id, qty:Number(line.qty), price:Number(line.price) })) });
      toast.success('Commande multi-produits enregistrée'); setShowModal(false); onRefresh();
    } catch(e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const advance = async order => {
    const next=STATUS_META[order.status]?.next; if(!next)return;
    try { await ordersAPI.updateStatus(order,next); toast.success(`Commande marquée ${STATUS_META[next]?.label || next}`); onRefresh(); }
    catch(e){ toast.error(e.message); }
  };

  if (loading) return <LoadingScreen />;
  return <div className="page-inner">
    <SectionHeader title="Commandes" subtitle={`${orders.length} commande(s) · plusieurs produits par commande · stock réservé automatiquement`}
      actions={[<button key="new" className="btn btn-primary" onClick={openModal}>+ Nouvelle commande</button>]} />
    <SopGuide steps={[{title:'Saisir',detail:'Client, date et produits'},{title:'Préparer',detail:'Le stock est réservé'},{title:'Clôturer',detail:'Livrer puis encaisser'}]} actions={[<button key="production" className="btn btn-sm" onClick={()=>onNavigate('production')}>Voir la production →</button>]} />

    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">CA commandes</div><div className="kpi-value">{totals.ca.toFixed(2)}</div><div className="kpi-sub">DT</div></div>
      <div className="kpi-card"><div className="kpi-label">À préparer</div><div className="kpi-value">{totals.pending}</div><div className="kpi-sub">commandes réservées</div></div>
      <div className="kpi-card success"><div className="kpi-label">À encaisser</div><div className="kpi-value">{totals.receivable.toFixed(2)}</div><div className="kpi-sub">DT livrés</div></div>
    </div>

    <div className="stock-legend"><span><i className="physical"/>Physique : produit en laboratoire</span><span><i className="reserved"/>Réservé : commandes à préparer</span><span><i className="available"/>Disponible : encore vendable</span></div>
    <div style={{display:'flex',gap:7,marginBottom:'1rem',flexWrap:'wrap'}}>
      {[['all','Toutes'],['Vendu','À préparer'],['Livré','Livrées'],['Payé','Payées']].map(([key,label])=><button key={key} className={`btn btn-sm ${filter===key?'btn-primary':''}`} onClick={()=>setFilter(key)}>{label}</button>)}
    </div>

    <div className="card"><div className="table-container">
      {visibleOrders.length===0 ? <EmptyState text="Aucune commande" /> : <table><thead><tr><th>N° / Livraison</th><th>Client</th><th>Produits</th><th style={{textAlign:'right'}}>Total</th><th>Statut</th><th></th></tr></thead>
      <tbody>{visibleOrders.map(order=>{const meta=STATUS_META[order.status]||STATUS_META.Vendu; return <tr key={order.id}>
        <td><strong>INS-{String(order.order_number).padStart(4,'0')}</strong><div className="form-hint">{order.delivery_date}</div></td>
        <td>{order.client||'—'}{order.canal&&<div><span className={`badge badge-${order.canal.toLowerCase()}`}>{order.canal}</span></div>}</td>
        <td><div className="order-lines">{order.sales?.map(line=>{const v=varieties.find(x=>x.id===line.variety_id);return <span key={line.id}><VarietyDot color={v?.color||'#999'}/>{line.qty} × {line.variety_name}</span>})}</div></td>
        <td style={{textAlign:'right',fontWeight:700}}>{Number(order.total_amount||0).toFixed(3)} DT</td>
        <td><span className={`badge ${meta.badge}`}>{meta.label}</span></td>
        <td>{meta.next&&<button className="btn btn-sm" onClick={()=>advance(order)}>{meta.next==='Livré'?'Livrer':'Encaisser'}</button>}</td>
      </tr>})}</tbody></table>}
    </div></div>

    <Modal open={showModal} onClose={()=>setShowModal(false)} size="lg" title="Nouvelle commande multi-produits" footer={<><button className="btn" onClick={()=>setShowModal(false)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={handleSave}>{saving?'Enregistrement...':'Enregistrer la commande'}</button></>}>
      <div className="form-row form-row-3"><div className="form-group"><label className="form-label">Client</label><input className="form-input" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))}/></div><div className="form-group"><label className="form-label">Canal</label><select className="form-select" value={form.canal} onChange={e=>setForm(f=>({...f,canal:e.target.value}))}><option>B2C</option><option>B2B</option></select></div><div className="form-group"><label className="form-label">Date de livraison *</label><input className="form-input" type="date" value={form.delivery_date} onChange={e=>setForm(f=>({...f,delivery_date:e.target.value}))}/></div></div>
      <div className="order-editor"><div className="order-editor-head"><strong>Produits</strong><button className="btn btn-sm" onClick={()=>setForm(f=>({...f,items:[...f.items,emptyLine()]}))}>+ Ajouter un produit</button></div>
      {form.items.map((line,index)=>{const v=varieties.find(x=>x.id===line.variety_id);const stock=v?getVarietyStockBreakdown(v.id,production,sales):null;return <div className="order-editor-line" key={index}><select className="form-select" value={line.variety_id} onChange={e=>chooseProduct(index,e.target.value)}><option value="">Choisir...</option>{varieties.filter(x=>x.product_status!=='draft').map(x=><option key={x.id} value={x.id}>{x.product_families?.name||x.family} · {x.name}</option>)}</select><input className="form-input" type="number" min="1" value={line.qty} onChange={e=>updateLine(index,{qty:e.target.value})}/><input className="form-input" type="number" min="0" step="0.001" value={line.price} placeholder="Prix/u" onChange={e=>updateLine(index,{price:e.target.value})}/><button className="btn btn-icon btn-ghost" onClick={()=>setForm(f=>({...f,items:f.items.filter((_,i)=>i!==index)}))}>×</button>{stock&&<small>Physique {stock.physical} · Réservé {stock.reserved} · Disponible {stock.available} {unitLabel(v)}</small>}</div>})}</div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows="2" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
      <div className="order-total"><span>Total <strong>{orderPreview.total.toFixed(3)} DT</strong></span><span>Marge estimée <strong>{orderPreview.margin.toFixed(3)} DT</strong></span></div>
    </Modal>
  </div>;
}

