import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { promoCodesAPI } from '../lib/api';
import { LoadingScreen, Modal, SectionHeader } from '../components/UI';

const today=()=>new Date().toISOString().slice(0,10);
const emptyForm=()=>({
  id:null,code:'',name:'',source:'Concours',promo_type:'percent',promo_value:'10',
  channel:'ALL',starts_at:today(),ends_at:'',max_uses:'1',active:true,notes:''
});
const benefitLabel=promo=>{
  if(promo.promo_type==='percent') return `-${Number(promo.promo_value||0)}%`;
  if(promo.promo_type==='fixed') return `-${Number(promo.promo_value||0).toFixed(2)} DT`;
  return '1 acheté = 1 offert';
};
const statusOf=promo=>{
  const now=today();
  if(!promo.active) return {label:'Inactif',className:'badge-pending'};
  if(promo.starts_at && promo.starts_at>now) return {label:'À venir',className:'badge-b2b'};
  if(promo.ends_at && promo.ends_at<now) return {label:'Expiré',className:'badge-danger'};
  if(promo.max_uses && Number(promo.used_count||0)>=Number(promo.max_uses)) return {label:'Épuisé',className:'badge-danger'};
  return {label:'Actif',className:'badge-low'};
};
const generateCode=()=>{
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix='';
  for(let i=0;i<6;i+=1) suffix+=chars[Math.floor(Math.random()*chars.length)];
  return `WIN-${suffix}`;
};

export default function PromoCodes(){
  const [codes,setCodes]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [modalOpen,setModalOpen]=useState(false);
  const [form,setForm]=useState(emptyForm());
  const [search,setSearch]=useState('');

  const load=async()=>{
    setLoading(true);
    try{setCodes(await promoCodesAPI.getAll());}
    catch(error){toast.error(error.message);}
    finally{setLoading(false);}
  };
  useEffect(()=>{load();},[]);

  const stats=useMemo(()=>{
    const active=codes.filter(c=>statusOf(c).label==='Actif').length;
    const upcoming=codes.filter(c=>statusOf(c).label==='À venir').length;
    const used=codes.reduce((sum,c)=>sum+Number(c.used_count||0),0);
    return {total:codes.length,active,upcoming,used};
  },[codes]);

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    if(!q) return codes;
    return codes.filter(c=>[c.code,c.name,c.source,c.channel].some(v=>String(v||'').toLowerCase().includes(q)));
  },[codes,search]);

  const openCreate=()=>{setForm(emptyForm());setModalOpen(true);};
  const openEdit=promo=>setForm({
    id:promo.id,code:promo.code||'',name:promo.name||'',source:promo.source||'Concours',
    promo_type:promo.promo_type||'percent',promo_value:String(promo.promo_value||0),
    channel:promo.channel||'ALL',starts_at:promo.starts_at||'',ends_at:promo.ends_at||'',
    max_uses:promo.max_uses==null?'':String(promo.max_uses),active:promo.active!==false,notes:promo.notes||''
  })||setModalOpen(true);

  const save=async()=>{
    if(!form.code.trim()||!form.name.trim()) return toast.error('Code et nom de campagne requis');
    if(form.promo_type==='percent'&&(Number(form.promo_value)<=0||Number(form.promo_value)>100)) return toast.error('Pourcentage entre 1 et 100');
    if(form.promo_type==='fixed'&&Number(form.promo_value)<=0) return toast.error('Montant de remise requis');
    if(form.ends_at&&form.starts_at&&form.ends_at<form.starts_at) return toast.error('La date de fin doit être après la date de début');
    setSaving(true);
    try{
      await promoCodesAPI.save({
        ...form,
        code:form.code.trim().toUpperCase(),
        promo_value:form.promo_type==='bogo'?0:Number(form.promo_value||0),
        max_uses:form.max_uses===''?null:Number(form.max_uses)
      });
      toast.success(form.id?'Code promo modifié':'Code promo créé');
      setModalOpen(false);
      await load();
    }catch(error){
      toast.error(error.code==='23505'?'Ce code promo existe déjà':error.message);
    }finally{setSaving(false);}
  };

  const toggle=async promo=>{
    try{
      await promoCodesAPI.setActive(promo.id,!promo.active);
      toast.success(!promo.active?'Code activé':'Code désactivé');
      await load();
    }catch(error){toast.error(error.message);}
  };

  if(loading) return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Codes promo" subtitle="Créer et piloter les codes concours et opérations commerciales" />

    <div className="kpi-grid" style={{marginBottom:'1rem'}}>
      <div className="kpi-card accent"><div className="kpi-label">Codes créés</div><div className="kpi-value">{stats.total}</div></div>
      <div className="kpi-card success"><div className="kpi-label">Actifs</div><div className="kpi-value">{stats.active}</div></div>
      <div className="kpi-card"><div className="kpi-label">À venir</div><div className="kpi-value">{stats.upcoming}</div></div>
      <div className="kpi-card"><div className="kpi-label">Utilisations</div><div className="kpi-value">{stats.used}</div></div>
    </div>

    <div className="card">
      <div className="card-header" style={{gap:12,flexWrap:'wrap'}}>
        <div><div className="card-title">Bibliothèque des codes</div><div className="form-hint">Concours, influence, CRM et opérations ponctuelles</div></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <input className="form-input" style={{minWidth:210}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un code…" />
          <button className="btn btn-primary" onClick={openCreate}>+ Nouveau code</button>
        </div>
      </div>

      {visible.length===0?<div className="empty-inline" style={{padding:'2rem'}}>Aucun code promo.</div>:
      <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr><th>Code</th><th>Campagne</th><th>Avantage</th><th>Canal</th><th>Validité</th><th>Utilisations</th><th>Statut</th><th></th></tr></thead>
          <tbody>{visible.map(promo=>{
            const status=statusOf(promo);
            return <tr key={promo.id}>
              <td><strong style={{letterSpacing:'.04em'}}>{promo.code}</strong><div className="form-hint">{promo.source}</div></td>
              <td>{promo.name}</td>
              <td><strong>{benefitLabel(promo)}</strong></td>
              <td><span className={`badge ${promo.channel==='B2B'?'badge-b2b':'badge-b2c'}`}>{promo.channel==='ALL'?'Tous':promo.channel}</span></td>
              <td>{promo.starts_at||'—'} → {promo.ends_at||'∞'}</td>
              <td>{Number(promo.used_count||0)} / {promo.max_uses??'∞'}</td>
              <td><span className={`badge ${status.className}`}>{status.label}</span></td>
              <td><div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                <button className="btn btn-sm" onClick={()=>{openEdit(promo);setModalOpen(true);}}>Modifier</button>
                <button className={`btn btn-sm ${promo.active?'btn-danger':''}`} onClick={()=>toggle(promo)}>{promo.active?'Désactiver':'Activer'}</button>
              </div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </div>

    <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title={form.id?'Modifier le code promo':'Nouveau code promo'}
      footer={<><button className="btn" onClick={()=>setModalOpen(false)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Enregistrement…':'Enregistrer'}</button></>}>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Code *</label><div style={{display:'flex',gap:6}}><input className="form-input" value={form.code} onChange={e=>setForm(v=>({...v,code:e.target.value.toUpperCase().replace(/\s+/g,'')}))} placeholder="WIN-ABC123"/><button className="btn btn-sm" type="button" onClick={()=>setForm(v=>({...v,code:generateCode()}))}>Générer</button></div></div>
        <div className="form-group"><label className="form-label">Campagne *</label><input className="form-input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="Concours Instagram Novembre"/></div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Source</label><input className="form-input" value={form.source} onChange={e=>setForm(v=>({...v,source:e.target.value}))} placeholder="Concours"/></div>
        <div className="form-group"><label className="form-label">Canal</label><select className="form-select" value={form.channel} onChange={e=>setForm(v=>({...v,channel:e.target.value}))}><option value="ALL">Tous</option><option value="B2C">B2C</option><option value="B2B">B2B</option></select></div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Type d’offre</label><select className="form-select" value={form.promo_type} onChange={e=>setForm(v=>({...v,promo_type:e.target.value}))}><option value="percent">Remise %</option><option value="fixed">Remise fixe DT</option><option value="bogo">1 acheté = 1 offert</option></select></div>
        {form.promo_type!=='bogo'&&<div className="form-group"><label className="form-label">{form.promo_type==='percent'?'Pourcentage':'Montant DT'}</label><input className="form-input" type="number" min="0" step="0.5" value={form.promo_value} onChange={e=>setForm(v=>({...v,promo_value:e.target.value}))}/></div>}
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Début</label><input className="form-input" type="date" value={form.starts_at} onChange={e=>setForm(v=>({...v,starts_at:e.target.value}))}/></div>
        <div className="form-group"><label className="form-label">Fin</label><input className="form-input" type="date" value={form.ends_at} onChange={e=>setForm(v=>({...v,ends_at:e.target.value}))}/></div>
      </div>
      <div className="form-row form-row-2">
        <div className="form-group"><label className="form-label">Nombre max d’utilisations</label><input className="form-input" type="number" min="1" value={form.max_uses} onChange={e=>setForm(v=>({...v,max_uses:e.target.value}))} placeholder="Vide = illimité"/></div>
        <div className="form-group"><label className="form-label">Statut</label><select className="form-select" value={form.active?'active':'inactive'} onChange={e=>setForm(v=>({...v,active:e.target.value==='active'}))}><option value="active">Actif</option><option value="inactive">Inactif</option></select></div>
      </div>
      <div className="form-group"><label className="form-label">Notes</label><textarea className="form-textarea" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} placeholder="Ex : 10 gagnants, code envoyé par DM…"/></div>
    </Modal>
  </div>;
}
