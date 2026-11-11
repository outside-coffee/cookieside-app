import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { customersAPI } from '../lib/api';
import { Modal, SectionHeader, LoadingScreen, EmptyState } from '../components/UI';

const emptyForm = { id:null, name:'', customer_type:'B2C', phone:'', instagram:'', address:'', notes:'', active:true };

export default function Customers({ customers = [], orders = [], onRefresh, loading }) {
  const [showModal,setShowModal]=useState(false);
  const [form,setForm]=useState(emptyForm);
  const [saving,setSaving]=useState(false);
  const [query,setQuery]=useState('');
  const [historyCustomer,setHistoryCustomer]=useState(null);

  const stats=useMemo(()=>customers.map(customer=>{
    const linked=orders.filter(o=>o.customer_id===customer.id && o.status!=='Annulée');
    const ca=linked.reduce((sum,o)=>sum+Number(o.total_amount||0),0);
    const last=linked.map(o=>o.delivery_date).filter(Boolean).sort().reverse()[0] || null;
    return {...customer,order_count:linked.length,ca,last};
  }),[customers,orders]);

  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return stats.filter(c=>c.active!==false && (!q || [c.name,c.phone,c.instagram,c.address].some(v=>String(v||'').toLowerCase().includes(q))));
  },[stats,query]);

  const customerOrders=useMemo(()=>{
    if(!historyCustomer) return [];
    return orders
      .filter(order=>order.customer_id===historyCustomer.id)
      .sort((a,b)=>String(b.delivery_date||b.created_at||'').localeCompare(String(a.delivery_date||a.created_at||'')));
  },[orders,historyCustomer]);

  const historyTotals=useMemo(()=>({
    orders:customerOrders.filter(order=>order.status!=='Annulée').length,
    ca:customerOrders.filter(order=>order.status!=='Annulée').reduce((sum,order)=>sum+Number(order.total_amount||0),0),
    paid:customerOrders.filter(order=>order.status==='Payé').reduce((sum,order)=>sum+Number(order.total_amount||0),0),
  }),[customerOrders]);

  const openNew=()=>{setForm(emptyForm);setShowModal(true);};
  const openEdit=customer=>{setForm({...emptyForm,...customer});setShowModal(true);};

  const save=async()=>{
    if(!form.name.trim()) return toast.error('Le nom du client est obligatoire');
    setSaving(true);
    try{
      await customersAPI.save(form);
      toast.success(form.id?'Client mis à jour':'Client ajouté');
      setShowModal(false);
      onRefresh();
    }catch(e){toast.error(e.message);}finally{setSaving(false);}
  };

  const archive=async customer=>{
    if(!window.confirm(`Archiver ${customer.name} ?`)) return;
    try{await customersAPI.archive(customer.id);toast.success('Client archivé');onRefresh();}
    catch(e){toast.error(e.message);}
  };

  if(loading) return <LoadingScreen />;
  return <div className="page-inner">
    <SectionHeader title="Clients" subtitle={`${visible.length} client(s) actif(s) · base B2C & B2B`}
      actions={[<button key="new" className="btn btn-primary" onClick={openNew}>+ Nouveau client</button>]} />

    <div className="card" style={{padding:14,marginBottom:14}}>
      <input className="form-input" placeholder="Rechercher nom, téléphone, Instagram, adresse…" value={query} onChange={e=>setQuery(e.target.value)} />
    </div>

    <div className="card"><div className="table-container">
      {visible.length===0 ? <EmptyState text="Aucun client" /> :
      <table><thead><tr><th>Client</th><th>Contact</th><th>Adresse</th><th style={{textAlign:'right'}}>Commandes</th><th style={{textAlign:'right'}}>CA</th><th>Dernière commande</th><th></th></tr></thead>
      <tbody>{visible.map(customer=><tr key={customer.id}>
        <td><strong>{customer.name}</strong><div><span className={`badge badge-${customer.customer_type.toLowerCase()}`}>{customer.customer_type}</span></div></td>
        <td>{customer.phone||'—'}{customer.instagram&&<div className="form-hint">@{customer.instagram.replace(/^@/,'')}</div>}</td>
        <td>{customer.address||'—'}</td>
        <td style={{textAlign:'right'}}>{customer.order_count}</td>
        <td style={{textAlign:'right',fontWeight:700}}>{customer.ca.toFixed(3)} DT</td>
        <td>{customer.last||'—'}</td>
        <td><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
          <button className="btn btn-sm" onClick={()=>setHistoryCustomer(customer)}>Voir les commandes</button>
          <button className="btn btn-sm" onClick={()=>openEdit(customer)}>Modifier</button>
          <button className="btn btn-sm btn-danger" onClick={()=>archive(customer)}>Archiver</button>
        </div></td>
      </tr>)}</tbody></table>}
    </div></div>

    <Modal open={!!historyCustomer} onClose={()=>setHistoryCustomer(null)} size="lg" title={historyCustomer?`Commandes · ${historyCustomer.name}`:'Commandes client'}
      footer={<button className="btn" onClick={()=>setHistoryCustomer(null)}>Fermer</button>}>
      {historyCustomer&&<>
        <div className="kpi-grid" style={{marginBottom:14}}>
          <div className="kpi-card"><div className="kpi-label">Commandes</div><div className="kpi-value">{historyTotals.orders}</div></div>
          <div className="kpi-card accent"><div className="kpi-label">CA client</div><div className="kpi-value">{historyTotals.ca.toFixed(3)}</div><div className="kpi-sub">DT</div></div>
          <div className="kpi-card success"><div className="kpi-label">Encaissé</div><div className="kpi-value">{historyTotals.paid.toFixed(3)}</div><div className="kpi-sub">DT</div></div>
        </div>
        {customerOrders.length===0?<EmptyState text="Aucune commande pour ce client" />:
        <div className="table-container">
          <table>
            <thead><tr><th>Commande</th><th>Date</th><th>Produits</th><th>Remise</th><th>Statut</th><th style={{textAlign:'right'}}>Total</th></tr></thead>
            <tbody>{customerOrders.map(order=><tr key={order.id}>
              <td><strong>INS-{String(order.order_number||'').padStart(4,'0')}</strong><div className="form-hint">{order.fulfillment_type==='pickup'?'Retrait':'Livraison'}{order.canal?' · '+order.canal:''}</div></td>
              <td>{order.delivery_date||'—'}{order.delivery_time&&<div className="form-hint">{String(order.delivery_time).slice(0,5)}</div>}</td>
              <td>{(order.sales||[]).length?order.sales.map(line=><div key={line.id||`${line.variety_id}-${line.format_id}`}><strong>{line.qty} × {line.variety_name||'Produit'}</strong></div>):'—'}</td>
              <td>{Number(order.discount_amount||0)>0?<><strong>-{Number(order.discount_amount||0).toFixed(3)} DT</strong>{order.promo_label&&<div className="form-hint">{order.promo_label}</div>}</>:'—'}</td>
              <td><span className={`badge ${order.status==='Payé'?'badge-paid':order.status==='Livré'?'badge-delivered':order.status==='Annulée'?'badge-out':'badge-sold'}`}>{order.status||'—'}</span></td>
              <td style={{textAlign:'right',fontWeight:700}}>{Number(order.total_amount||0).toFixed(3)} DT</td>
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
    </Modal>

    <Modal open={showModal} onClose={()=>setShowModal(false)} title={form.id?'Modifier le client':'Nouveau client'}
      footer={<><button className="btn" onClick={()=>setShowModal(false)}>Fermer</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Enregistrement…':'Enregistrer'}</button></>}>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Nom *</label><input className="form-input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.customer_type} onChange={e=>setForm(f=>({...f,customer_type:e.target.value}))}><option>B2C</option><option>B2B</option></select></div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Téléphone</label><input className="form-input" value={form.phone||''} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Instagram</label><input className="form-input" placeholder="@..." value={form.instagram||''} onChange={e=>setForm(f=>({...f,instagram:e.target.value}))}/></div>
      </div>
      <div className="form-group"><label className="form-label">Adresse</label><textarea className="form-textarea" rows="2" value={form.address||''} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows="3" value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
    </Modal>
  </div>;
}
