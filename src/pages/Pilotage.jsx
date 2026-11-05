import React, { useMemo, useState } from 'react';
import { SectionHeader, SopGuide, LoadingScreen } from '../components/UI';

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = days => {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().split('T')[0];
};
const inBounds = (date, bounds) => {
  const value=String(date || '').slice(0,10);
  return value && (!bounds.from || value>=bounds.from) && (!bounds.to || value<=bounds.to);
};
const formatDay = value => new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

export default function Pilotage({ sales = [], orders = [], onNavigate, loading }) {
  const [period, setPeriod] = useState('30');
  const [channel, setChannel] = useState('all');
  const [customDates, setCustomDates] = useState({ from:daysAgo(30), to:today() });

  const bounds = useMemo(
    () => period === 'all' ? { from:'', to:'' } : period === 'custom' ? customDates : { from:daysAgo(Number(period)), to:today() },
    [period, customDates]
  );

  const deliveredOrdersAll = useMemo(() => orders.filter(order =>
    ['Livré','Payé'].includes(order.status) &&
    inBounds(order.delivered_at || order.delivery_date || order.created_at, bounds)
  ), [orders, bounds]);

  const deliveredOrders = useMemo(
    () => deliveredOrdersAll.filter(order => channel==='all' || order.canal===channel),
    [deliveredOrdersAll, channel]
  );

  const deliveredIds = useMemo(() => new Set(deliveredOrders.map(order=>order.id)), [deliveredOrders]);
  const filteredSales = useMemo(() => sales.filter(sale => deliveredIds.has(sale.order_id)), [sales, deliveredIds]);

  const stats = useMemo(() => {
    const ca=deliveredOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const margin=deliveredOrders.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const paid=deliveredOrders.filter(row=>row.status==='Payé').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const units=filteredSales.reduce((sum,row)=>sum+Number(row.qty||0),0);
    const orderCount=deliveredOrders.length;
    return {
      ca,margin,paid,units,orderCount,
      receivable:ca-paid,
      marginRate:ca?margin/ca*100:0,
      averageBasket:orderCount?ca/orderCount:0
    };
  }, [deliveredOrders, filteredSales]);

  const dailyRows = useMemo(() => {
    const byDay={};
    const allOrderIds=new Set(deliveredOrdersAll.map(order=>order.id));
    const unitsByOrder={};
    sales.forEach(sale=>{
      if(!allOrderIds.has(sale.order_id)) return;
      unitsByOrder[sale.order_id]=(unitsByOrder[sale.order_id]||0)+Number(sale.qty||0);
    });

    deliveredOrdersAll.forEach(order=>{
      const date=String(order.delivered_at || order.delivery_date || order.created_at || '').slice(0,10);
      if(!date) return;
      byDay[date]??={date,caTotal:0,caB2C:0,caB2B:0,orders:0,units:0,margin:0};
      const row=byDay[date];
      const amount=Number(order.total_amount||0);
      row.caTotal+=amount;
      if(order.canal==='B2C') row.caB2C+=amount;
      if(order.canal==='B2B') row.caB2B+=amount;
      row.orders+=1;
      row.units+=Number(unitsByOrder[order.id]||0);
      row.margin+=Number(order.margin||0);
    });

    return Object.values(byDay)
      .map(row=>({
        ...row,
        averageBasket:row.orders?row.caTotal/row.orders:0,
        marginRate:row.caTotal?row.margin/row.caTotal*100:0
      }))
      .sort((a,b)=>b.date.localeCompare(a.date));
  }, [deliveredOrdersAll, sales]);

  if (loading) return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Analyse & performance" subtitle="Suivre le CA livré, le mix B2C/B2B et la rentabilité"/>
    <SopGuide steps={[{title:'Choisir',detail:'Sélectionner une période et un canal'},{title:'Comprendre',detail:'Lire CA, marge et mix B2C/B2B'},{title:'Décider',detail:'Ajuster offre, prix et acquisition'}]} actions={[<button key="operations" className="btn btn-sm" onClick={()=>onNavigate('dashboard')}>← Retour aux opérations</button>]} />

    <div className="card" style={{marginBottom:'1rem'}}><div className="card-body"><div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}}>
      <div><div className="form-label">Période</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['7','7 jours'],['30','30 jours'],['90','90 jours'],['all','Tout'],['custom','Personnalisée']].map(([key,label])=><button key={key} className={`btn btn-sm ${period===key?'btn-primary':''}`} onClick={()=>setPeriod(key)}>{label}</button>)}</div></div>
      {period==='custom'&&<><div className="form-group" style={{margin:0}}><label className="form-label">Du</label><input className="form-input" type="date" value={customDates.from} onChange={e=>setCustomDates(v=>({...v,from:e.target.value}))}/></div><div className="form-group" style={{margin:0}}><label className="form-label">Au</label><input className="form-input" type="date" value={customDates.to} onChange={e=>setCustomDates(v=>({...v,to:e.target.value}))}/></div></>}
      <div><div className="form-label">Canal</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['all','Tous'],['B2C','B2C'],['B2B','B2B']].map(([key,label])=><button key={key} className={`btn btn-sm ${channel===key?'btn-primary':''}`} onClick={()=>setChannel(key)}>{label}</button>)}</div></div>
    </div></div></div>

    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">CA livré</div><div className="kpi-value">{stats.ca.toFixed(2)}</div><div className="kpi-sub">DT · {stats.orderCount} commande(s)</div></div>
      <div className="kpi-card success"><div className="kpi-label">Marge après livraison</div><div className="kpi-value">{stats.margin.toFixed(2)}</div><div className="kpi-sub">DT</div></div>
      <div className="kpi-card success"><div className="kpi-label">Taux de marge</div><div className="kpi-value">{stats.marginRate.toFixed(1)}%</div><div className="kpi-sub">marge / CA livré</div></div>
      <div className="kpi-card"><div className="kpi-label">Panier moyen</div><div className="kpi-value">{stats.averageBasket.toFixed(2)}</div><div className="kpi-sub">DT par commande</div></div>
      <div className="kpi-card"><div className="kpi-label">Encaissé</div><div className="kpi-value">{stats.paid.toFixed(2)}</div><div className="kpi-sub">DT reçus</div></div>
      <div className="kpi-card"><div className="kpi-label">À encaisser</div><div className="kpi-value">{stats.receivable.toFixed(2)}</div><div className="kpi-sub">DT · {stats.units} unité(s)</div></div>
    </div>

    <div className="card">
      <div className="card-header"><div><div className="card-title">Performance journalière</div><div className="form-hint">CA livré par jour · total, B2C et B2B · commandes livrées/payées uniquement</div></div></div>
      {dailyRows.length===0 ? <div className="empty-inline" style={{padding:'2rem'}}>Aucune commande livrée sur cette période.</div> :
      <div style={{overflowX:'auto'}}>
        <table>
          <thead><tr>
            <th>Date</th>
            <th style={{textAlign:'right'}}>CA total</th>
            <th style={{textAlign:'right'}}>CA B2C</th>
            <th style={{textAlign:'right'}}>CA B2B</th>
            <th style={{textAlign:'right'}}>Cmdes</th>
            <th style={{textAlign:'right'}}>Unités</th>
            <th style={{textAlign:'right'}}>Panier moy.</th>
            <th style={{textAlign:'right'}}>Marge</th>
            <th style={{textAlign:'right'}}>Tx marge</th>
          </tr></thead>
          <tbody>{dailyRows.map(row=><tr key={row.date}>
            <td><strong>{formatDay(row.date)}</strong></td>
            <td style={{textAlign:'right',fontWeight:700}}>{row.caTotal.toFixed(2)} DT</td>
            <td style={{textAlign:'right'}}>{row.caB2C.toFixed(2)} DT</td>
            <td style={{textAlign:'right'}}>{row.caB2B.toFixed(2)} DT</td>
            <td style={{textAlign:'right'}}>{row.orders}</td>
            <td style={{textAlign:'right'}}>{row.units}</td>
            <td style={{textAlign:'right'}}>{row.averageBasket.toFixed(2)} DT</td>
            <td style={{textAlign:'right'}}>{row.margin.toFixed(2)} DT</td>
            <td style={{textAlign:'right'}}>{row.marginRate.toFixed(1)}%</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>
  </div>;
}
