import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { SectionHeader, SopGuide, LoadingScreen } from '../components/UI';

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = days => {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().split('T')[0];
};

export default function Pilotage({ sales, onNavigate, loading }) {
  const [period, setPeriod] = useState('30');
  const [customDates, setCustomDates] = useState({ from:daysAgo(30), to:today() });
  const bounds = useMemo(() => period === 'all' ? { from:'', to:'' } : period === 'custom' ? customDates : { from:daysAgo(Number(period)), to:today() }, [period, customDates]);
  const filteredSales = useMemo(() => sales.filter(sale => {
    if (sale.status === 'Annulée') return false;
    const date = String(sale.sold_at || sale.created_at || '').slice(0,10);
    return (!bounds.from || date >= bounds.from) && (!bounds.to || date <= bounds.to);
  }), [sales, bounds]);
  const stats = useMemo(() => {
    const ca = filteredSales.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const margin = filteredSales.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const paid = filteredSales.filter(row=>row.status==='Payé').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const orderKeys = new Set(filteredSales.map((row,index)=>row.order_id || row.id || index));
    const units = filteredSales.reduce((sum,row)=>sum+Number(row.qty||0),0);
    const byProduct = {};
    filteredSales.forEach(row => {
      const name = row.variety_name || 'Sans produit';
      byProduct[name] ??= { name, ca:0, marge:0 };
      byProduct[name].ca += Number(row.total_amount||0);
      byProduct[name].marge += Number(row.margin||0);
    });
    return { ca, margin, paid, units, receivable:ca-paid, marginRate:ca ? margin/ca*100 : 0, averageBasket:orderKeys.size ? ca/orderKeys.size : 0, orderCount:orderKeys.size, chart:Object.values(byProduct).sort((a,b)=>b.ca-a.ca) };
  }, [filteredSales]);

  if (loading) return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Analyse & performance" subtitle="Les indicateurs utiles pour piloter les ventes et la rentabilité"/>
    <SopGuide steps={[{title:'Choisir',detail:'Sélectionner une période'},{title:'Comprendre',detail:'Lire ventes et rentabilité'},{title:'Décider',detail:'Ajuster offre et prix'}]} actions={[<button key="operations" className="btn btn-sm" onClick={()=>onNavigate('dashboard')}>← Retour aux opérations</button>]} />
    <div className="card" style={{marginBottom:'1rem'}}><div className="card-body"><div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}}>
      <div><div className="form-label">Période</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['7','7 jours'],['30','30 jours'],['90','90 jours'],['all','Tout'],['custom','Personnalisée']].map(([key,label])=><button key={key} className={`btn btn-sm ${period===key?'btn-primary':''}`} onClick={()=>setPeriod(key)}>{label}</button>)}</div></div>
      {period==='custom'&&<><div className="form-group" style={{margin:0}}><label className="form-label">Du</label><input className="form-input" type="date" value={customDates.from} onChange={e=>setCustomDates(v=>({...v,from:e.target.value}))}/></div><div className="form-group" style={{margin:0}}><label className="form-label">Au</label><input className="form-input" type="date" value={customDates.to} onChange={e=>setCustomDates(v=>({...v,to:e.target.value}))}/></div></>}
    </div></div></div>
    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">Chiffre d’affaires</div><div className="kpi-value">{stats.ca.toFixed(2)}</div><div className="kpi-sub">DT · {stats.orderCount} commande(s)</div></div>
      <div className="kpi-card success"><div className="kpi-label">Marge brute</div><div className="kpi-value">{stats.margin.toFixed(2)}</div><div className="kpi-sub">DT</div></div>
      <div className="kpi-card success"><div className="kpi-label">Taux de marge</div><div className="kpi-value">{stats.marginRate.toFixed(1)}%</div><div className="kpi-sub">marge / CA</div></div>
      <div className="kpi-card"><div className="kpi-label">Panier moyen</div><div className="kpi-value">{stats.averageBasket.toFixed(2)}</div><div className="kpi-sub">DT par commande</div></div>
      <div className="kpi-card"><div className="kpi-label">Encaissé</div><div className="kpi-value">{stats.paid.toFixed(2)}</div><div className="kpi-sub">DT reçus</div></div>
      <div className="kpi-card"><div className="kpi-label">À encaisser</div><div className="kpi-value">{stats.receivable.toFixed(2)}</div><div className="kpi-sub">DT · {stats.units} unité(s)</div></div>
    </div>
    <div className="card"><div className="card-header"><div><div className="card-title">CA et marge par produit</div><div className="form-hint">Commandes annulées exclues</div></div></div><div className="card-body" style={{height:360}}>{stats.chart.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={stats.chart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={value=>`${Number(value).toFixed(2)} DT`}/><Legend/><Bar name="Chiffre d’affaires" dataKey="ca" fill="#FF5477" radius={[4,4,0,0]}/><Bar name="Marge brute" dataKey="marge" fill="#3BC4AE" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty-inline">Aucune vente sur cette période.</div>}</div></div>
  </div>;
}
