import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { promoCodesAPI } from '../lib/api';
import { LoadingScreen, Modal, SectionHeader, EmptyState } from '../components/UI';

const today = () => new Date().toISOString().slice(0,10);
const emptyForm = () => ({
  code:'',
  name:'',
  source:'Concours',
  promo_type:'percent',
  promo_value:'20',
  channel:'B2C',
  starts_at:today(),
  ends_at:'',
  max_uses:'1',
  free_delivery:false,
  active:true,
  notes:'',
});

const promoLabel = promo => promo.promo_type==='percent'
  ? `-${Number(promo.promo_value||0)}%`
  : promo.promo_type==='fixed'
    ? `-${Number(promo.promo_value||0).toFixed(2)} DT`
    : '1 acheté = 1 offert';

const getState = promo => {
  const now=today();
  if (!promo.active) return {label:'Inactif',className:'badge-out',eligible:false};
  if (promo.starts_at && promo.starts_at>now) return {label:'À venir',className:'badge-pending',eligible:false};
  if (promo.ends_at && promo.ends_at<now) return {label:'Expiré',className:'badge-out',eligible:false};
  if (promo.max_uses!=null && Number(promo.used_count||0)>=Number(promo.max_uses)) return {label:'Épuisé',className:'badge-out',eligible:false};
  return {label:'Actif',className:'badge-ok',eligible:true};
};

const generateCode = () => `WIN-${Math.random().toString(36).slice(2,8).toUpperCase()}`;

export default function PromoCodes({ promoCodes = [], loading, onRefresh }) {
  const [filter,setFilter]=useState('all');
  const [modalOpen,setModalOpen]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(emptyForm());
  const [saving,setSaving]=useState(false);

  const rows=useMemo(()=>promoCodes.filter(promo=>{
    if(filter==='all') return true;
    const state=getState(promo);
    if(filter==='active') return state.eligible;
    if(filter==='used') return Number(promo.used_count||0)>0;
    if(filter==='inactive') return !state.eligible;
    return true;
  }),[promoCodes,filter]);

  const stats=useMemo(()=>({
    total:promoCodes.length,
    active:promoCodes.filter(p=>getState(p).eligible).length,
    uses:promoCodes.reduce((sum,p)=>sum+Number(p.used_count||0),0),
    remaining:promoCodes.reduce((sum,p)=>{
      if(p.max_uses==null) return sum;
      return sum+Math.max(0,Number(p.max_uses)-Number(p.used_count||0));
    },0),
  }),[promoCodes]);

  const openCreate=()=>{setEditing(null);setForm({...emptyForm(),code:generateCode()});setModalOpen(true);};
  const openEdit=promo=>{setEditing(promo);setForm({
    id:promo.id,
    code:promo.code||'',
    name:promo.name||'',
    source:promo.source||'Concours',
    promo_type:promo.promo_type||'percent',
    promo_value:String(promo.promo_value??''),
    channel:promo.channel||'ALL',
    starts_at:promo.starts_at||'',
    ends_at:promo.ends_at||'',
    max_uses:promo.max_uses==null?'':String(promo.max_uses),
    free_delivery:Boolean(promo.free_delivery),
    active:promo.active!==false,
    notes:promo.notes||'',
  });setModalOpen(true);};

  const save=async()=>{
    if(!form.code.trim()||!form.name.trim()) return toast.error('Code et nom de campagne requis');
    if(form.promo_type==='percent'&&(Number(form.promo_value)<=0||Number(form.promo_value)>100)) return toast.error('Pourcentage entre 1 et 100 requis');
    if(form.promo_type==='fixed'&&Number(form.promo_value)<=0) return toast.error('Montant de remise requis');
    if(form.max_uses!==''&&Number(form.max_uses)<=0) return toast.error('Nombre d’utilisations invalide');
    if(form.starts_at&&form.ends_at&&form.ends_at<form.starts_at) return toast.error('La date de fin doit être après la date de début');
    setSaving(true);
    try{
      await promoCodesAPI.save(form);
      toast.success(editing?'Code promo modifié':'Code promo créé');
      setModalOpen(false);
      setEditing(null);
      await onRefresh();
    }catch(error){toast.error(error.message);}
    finally{setSaving(false);}
  };

  const toggle=async promo=>{
    try{
      await promoCodesAPI.setActive(promo.id,!promo.active);
      toast.success(promo.active?'Code désactivé':'Code réactivé');
      await onRefresh();
    }catch(error){toast.error(error.message);}
  };

  const copy=async code=>{
    try{await navigator.clipboard.writeText(code);toast.success('Code copié');}
    catch{toast.error('Impossible de copier le code');}
  };

  if(loading) return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Codes promo" subtitle="Créer et piloter les codes concours, remises et avantages"
      actions={[<button key="new" className="btn btn-primary" onClick={openCreate}>+ Nouveau code</button>]} />

    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">Codes</div><div className="kpi-value">{stats.total}</div><div className="kpi-sub">créés</div></div>
      <div className="kpi-card success"><div className="kpi-label">Actifs</div><div className="kpi-value">{stats.active}</div><div className="kpi-sub">utilisables maintenant</div></div>
      <div className="kpi-card"><div className="kpi-label">Utilisations</div><div className="kpi-value">{stats.uses}</div><div className="kpi-sub">commandes non annulées</div></div>
      <div className="kpi-card"><div className="kpi-label">Utilisations restantes</div><div className="kpi-value">{stats.remaining}</div><div className="kpi-sub">codes avec limite</div></div>
    </div>

    <div style={{display:'flex',gap:7,marginBottom:'1rem',flexWrap:'wrap'}}>
      {[['all','Tous'],['active','Actifs'],['used','Utilisés'],['inactive','Inactifs / expirés']].map(([key,label])=>
        <button key={key} className={`btn btn-sm ${filter===key?'btn-primary':''}`} onClick={()=>setFilter(key)}>{label}</button>
      )}
    </div>

    <div className="card"><div className="table-container">
      {rows.length===0?<EmptyState text="Aucun code promo"/>:<table>
        <thead><tr><th>Code</th><th>Campagne</th><th>Avantage</th><th>Canal</th><th>Validité</th><th>Usage</th><th>Statut</th><th></th></tr></thead>
        <tbody>{rows.map(promo=>{const state=getState(promo);return <tr key={promo.id}>
          <td><strong>{promo.code}</strong><div className="form-hint">{promo.source||'Concours'}</div></td>
          <td><strong>{promo.name}</strong>{promo.notes&&<div className="form-hint">{promo.notes}</div>}</td>
          <td><span className="badge badge-b2c">{promoLabel(promo)}</span>{promo.free_delivery&&<div style={{marginTop:4}}><span className="badge badge-b2b">+ Livraison offerte</span></div>}</td>
          <td>{promo.channel==='ALL'?'Tous':promo.channel}</td>
          <td><div>{promo.starts_at||'Immédiat'}</div><div className="form-hint">→ {promo.ends_at||'sans fin'}</div></td>
          <td><strong>{Number(promo.used_count||0)}</strong> / {promo.max_uses==null?'∞':promo.max_uses}</td>
          <td><span className={`badge ${state.className}`}>{state.label}</span></td>
          <td><div style={{display:'flex',gap:6,justifyContent:'flex-end',flexWrap:'wrap'}}>
            <button className="btn btn-sm" onClick={()=>copy(promo.code)}>Copier</button>
            <button className="btn btn-sm" onClick={()=>openEdit(promo)}>Modifier</button>
            <button className={`btn btn-sm ${promo.active?'btn-danger':''}`} onClick={()=>toggle(promo)}>{promo.active?'Désactiver':'Réactiver'}</button>
          </div></td>
        </tr>})}</tbody>
      </table>}
    </div></div>

    <Modal open={modalOpen} onClose={()=>setModalOpen(false)} size="lg" title={editing?'Modifier le code promo':'Nouveau code promo'}
      footer={<><button className="btn" onClick={()=>setModalOpen(false)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Enregistrement...':'Enregistrer'}</button></>}>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Code *</label><div style={{display:'flex',gap:6}}><input className="form-input" value={form.code} onChange={e=>setForm(v=>({...v,code:e.target.value.toUpperCase().replace(/\s+/g,'')}))} placeholder="WIN-SARAH24"/><button className="btn btn-sm" type="button" onClick={()=>setForm(v=>({...v,code:generateCode()}))}>Générer</button></div></div>
        <div className="form-group"><label className="form-label">Nom / campagne *</label><input className="form-input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Concours Instagram novembre"/></div>
      </div>
      <div className="form-row form-row-3">
        <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.promo_type} onChange={e=>setForm(v=>({...v,promo_type:e.target.value,promo_value:e.target.value==='bogo'?'0':v.promo_value}))}><option value="percent">Remise %</option><option value="fixed">Remise fixe</option><option value="bogo">1 acheté = 1 offert</option></select></div>
        <div className="form-group"><label className="form-label">{form.promo_type==='percent'?'Valeur (%)':form.promo_type==='fixed'?'Montant (DT)':'Valeur'}</label><input className="form-input" type="number" min="0" step="0.001" disabled={form.promo_type==='bogo'} value={form.promo_value} onChange={e=>setForm(v=>({...v,promo_value:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Canal</label><select className="form-select" value={form.channel} onChange={e=>setForm(v=>({...v,channel:e.target.value}))}><option value="ALL">Tous</option><option value="B2C">B2C</option><option value="B2B">B2B</option></select></div>
      </div>
      <div className="form-row form-row-3">
        <div className="form-group"><label className="form-label">Début</label><input className="form-input" type="date" value={form.starts_at} onChange={e=>setForm(v=>({...v,starts_at:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Fin</label><input className="form-input" type="date" value={form.ends_at} onChange={e=>setForm(v=>({...v,ends_at:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Max utilisations</label><input className="form-input" type="number" min="1" value={form.max_uses} onChange={e=>setForm(v=>({...v,max_uses:e.target.value}))} placeholder="Vide = illimité"/></div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Source</label><input className="form-input" value={form.source} onChange={e=>setForm(v=>({...v,source:e.target.value}))} placeholder="Concours Instagram"/></div>
        <label style={{display:'flex',alignItems:'center',gap:9,paddingTop:24,cursor:'pointer'}}><input type="checkbox" checked={form.free_delivery} onChange={e=>setForm(v=>({...v,free_delivery:e.target.checked}))}/><span><strong>Livraison offerte avec ce code</strong></span></label>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" rows="2" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} placeholder="Ex : gagnante concours Instagram"/></div>
      <label style={{display:'flex',alignItems:'center',gap:9,cursor:'pointer'}}><input type="checkbox" checked={form.active} onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/><span>Code actif</span></label>
    </Modal>
  </div>;
}
