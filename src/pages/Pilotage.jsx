import React, { useMemo } from 'react';
import { BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer,CartesianGrid } from 'recharts';
import { SectionHeader, LoadingScreen } from '../components/UI';

export default function Pilotage({ sales, production, loading }) {
  const stats=useMemo(()=>{const ca=sales.reduce((s,v)=>s+Number(v.total_amount||0),0);const margin=sales.reduce((s,v)=>s+Number(v.margin||0),0);const paid=sales.filter(v=>v.status==='Payé').reduce((s,v)=>s+Number(v.total_amount||0),0);const byProduct={};sales.forEach(v=>{byProduct[v.variety_name]??={name:v.variety_name,ca:0,marge:0};byProduct[v.variety_name].ca+=Number(v.total_amount||0);byProduct[v.variety_name].marge+=Number(v.margin||0)});return{ca,margin,paid,receivable:ca-paid,chart:Object.values(byProduct)}},[sales]);
  if(loading)return <LoadingScreen/>;
  return <div className="page-inner"><SectionHeader title="Pilotage" subtitle="Analyser la performance sans encombrer les opérations quotidiennes"/>
    <div className="kpi-grid"><div className="kpi-card accent"><div className="kpi-label">Chiffre d’affaires</div><div className="kpi-value">{stats.ca.toFixed(2)}</div><div className="kpi-sub">DT</div></div><div className="kpi-card success"><div className="kpi-label">Marge brute</div><div className="kpi-value">{stats.margin.toFixed(2)}</div><div className="kpi-sub">{stats.ca?Math.round(stats.margin/stats.ca*100):0}% du CA</div></div><div className="kpi-card"><div className="kpi-label">Encaissé</div><div className="kpi-value">{stats.paid.toFixed(2)}</div><div className="kpi-sub">DT reçus</div></div><div className="kpi-card"><div className="kpi-label">À encaisser</div><div className="kpi-value">{stats.receivable.toFixed(2)}</div><div className="kpi-sub">DT</div></div></div>
    <div className="card"><div className="card-header"><div className="card-title">CA et marge par produit</div></div><div className="card-body" style={{height:340}}>{stats.chart.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={stats.chart}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip formatter={v=>`${Number(v).toFixed(2)} DT`}/><Bar dataKey="ca" fill="#FF5477" radius={[4,4,0,0]}/><Bar dataKey="marge" fill="#3BC4AE" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>:<div className="empty-inline">Aucune vente à analyser.</div>}</div></div>
  </div>;
}

