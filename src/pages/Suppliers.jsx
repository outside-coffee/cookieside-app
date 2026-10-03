import React,{useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {suppliersAPI} from '../lib/api';
import {LoadingScreen,Modal,SectionHeader} from '../components/UI';

const empty={name:'',phone:'',email:'',notes:'',lead_time_days:'',minimum_order:''};
export default function Suppliers({ingredients}){
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[form,setForm]=useState(empty),[materialIds,setMaterialIds]=useState([]),[open,setOpen]=useState(false),[saving,setSaving]=useState(false);
  const load=async()=>{setLoading(true);try{setRows(await suppliersAPI.getAll());}catch(e){toast.error(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const edit=row=>{setForm({id:row.id,name:row.name,phone:row.phone||'',email:row.email||'',notes:row.notes||'',lead_time_days:row.lead_time_days??'',minimum_order:row.minimum_order??''});setMaterialIds((row.supplier_ingredients||[]).map(x=>x.ingredient_id));setOpen(true);};
  const save=async()=>{if(!form.name.trim())return toast.error('Nom requis');setSaving(true);try{await suppliersAPI.save({...form,name:form.name.trim(),lead_time_days:form.lead_time_days===''?null:Number(form.lead_time_days),minimum_order:form.minimum_order===''?null:Number(form.minimum_order),phone:form.phone||null,email:form.email||null,notes:form.notes||null},materialIds);toast.success('Fournisseur enregistré');setOpen(false);await load();}catch(e){toast.error(e.message);}finally{setSaving(false);}};
  if(loading)return <LoadingScreen/>;
  return <div className="page-inner"><SectionHeader title="Fournisseurs" subtitle="Contacts, matières habituelles et conditions d’achat" actions={[<button key="add" className="btn btn-primary" onClick={()=>{setForm(empty);setMaterialIds([]);setOpen(true);}}>+ Fournisseur</button>]}/>
    <div className="supplier-grid">{rows.map(row=><article className="card supplier-card" key={row.id}><div><strong>{row.name}</strong><small>{row.email||row.phone||'Contact non renseigné'}</small></div><div className="supplier-facts"><span><small>Délai</small><b>{row.lead_time_days!=null?`${row.lead_time_days} j`:'—'}</b></span><span><small>Minimum</small><b>{row.minimum_order!=null?`${Number(row.minimum_order).toFixed(2)} DT`:'—'}</b></span></div><div className="supplier-materials">{(row.supplier_ingredients||[]).map(link=><span key={link.ingredient_id}>{link.ingredients?.name}</span>)}</div><button className="btn btn-sm" onClick={()=>edit(row)}>Modifier</button></article>)}</div>
    {!rows.length&&<div className="empty-inline card">Aucun fournisseur. Ajoutez uniquement vos fournisseurs réguliers.</div>}
    <Modal open={open} onClose={()=>setOpen(false)} title={form.id?'Modifier le fournisseur':'Nouveau fournisseur'} footer={<><button className="btn" onClick={()=>setOpen(false)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving?'Enregistrement...':'Enregistrer'}</button></>}>
      <div className="form-group"><label className="form-label">Nom *</label><input className="form-input" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></div>
      <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Téléphone</label><input className="form-input" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></div><div className="form-group"><label className="form-label">E-mail</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))}/></div></div>
      <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Délai habituel (jours)</label><input className="form-input" type="number" min="0" value={form.lead_time_days} onChange={e=>setForm(v=>({...v,lead_time_days:e.target.value}))}/></div><div className="form-group"><label className="form-label">Minimum de commande (DT)</label><input className="form-input" type="number" min="0" step="0.001" value={form.minimum_order} onChange={e=>setForm(v=>({...v,minimum_order:e.target.value}))}/></div></div>
      <div className="form-group"><label className="form-label">Matières fournies</label><div className="supplier-checks">{ingredients.map(item=><label key={item.id}><input type="checkbox" checked={materialIds.includes(item.id)} onChange={e=>setMaterialIds(ids=>e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{item.name}</label>)}</div></div>
      <div className="form-group"><label className="form-label">Note</label><textarea className="form-textarea" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))}/></div>
    </Modal>
  </div>;
}
