import React, { useMemo } from 'react';
import { getVarietyStockBreakdown } from '../lib/api';
import { SectionHeader, LoadingScreen, Alert, VarietyDot } from '../components/UI';
import { unitLabel } from '../lib/products';

export default function Dashboard({ varieties, ingredients, production, sales, orders, loading, onNavigate }) {
  const today=new Date().toISOString().split('T')[0];
  const dueOrders=orders.filter(o=>o.status==='Vendu').sort((a,b)=>a.delivery_date.localeCompare(b.delivery_date));
  const urgent=dueOrders.filter(o=>o.delivery_date<=today);
  const ingredientAlerts=ingredients.filter(i=>Number(i.stock_qty)<=Number(i.alert_threshold));
  const stocks=useMemo(()=>varieties.filter(v=>v.product_status!=='draft').map(v=>({v,...getVarietyStockBreakdown(v.id,production,sales)})),[varieties,production,sales]);
  const productionNeeds=stocks.filter(s=>s.available<Number(s.v.min_stock||0));
  if(loading)return <LoadingScreen text="Préparation de la journée..."/>;
  return <div className="page-inner">
    <SectionHeader title="Aujourd'hui" subtitle="Une seule feuille pour exécuter la journée"
      actions={[<button key="order" className="btn btn-primary" onClick={()=>onNavigate('sales')}>+ Commande</button>,<button key="prod" className="btn btn-gold" onClick={()=>onNavigate('production')}>+ Production</button>,<button key="stock" className="btn" onClick={()=>onNavigate('ingredients')}>+ Réception</button>]}/>
    {urgent.length>0&&<Alert variant="danger"><strong>{urgent.length} commande(s)</strong> à préparer ou livrer aujourd’hui.</Alert>}
    {ingredientAlerts.length>0&&<Alert variant="warning"><strong>{ingredientAlerts.length} matière(s)</strong> sous le seuil : {ingredientAlerts.map(i=>i.name).join(', ')}</Alert>}
    <div className="kpi-grid">
      <div className="kpi-card accent"><div className="kpi-label">À préparer</div><div className="kpi-value">{dueOrders.length}</div><div className="kpi-sub">commandes ouvertes</div></div>
      <div className="kpi-card"><div className="kpi-label">À produire</div><div className="kpi-value">{productionNeeds.length}</div><div className="kpi-sub">produits sous leur cible</div></div>
      <div className="kpi-card danger"><div className="kpi-label">Matières en alerte</div><div className="kpi-value">{ingredientAlerts.length}</div><div className="kpi-sub">à acheter ou réceptionner</div></div>
    </div>
    <div className="grid-2">
      <div className="card"><div className="card-header"><div className="card-title">Ordre de préparation</div><button className="btn btn-sm" onClick={()=>onNavigate('sales')}>Voir les commandes</button></div><div className="card-body">
        {dueOrders.length===0?<div className="empty-inline">Aucune commande à préparer.</div>:dueOrders.slice(0,8).map(o=><div className="sop-row" key={o.id}><div><strong>INS-{String(o.order_number).padStart(4,'0')}</strong><small>{o.client||'Client non renseigné'} · {o.delivery_date}</small></div><span>{o.sales?.reduce((n,l)=>n+Number(l.qty||0),0)} unité(s)</span></div>)}
      </div></div>
      <div className="card"><div className="card-header"><div className="card-title">Stock produits finis</div><button className="btn btn-sm" onClick={()=>onNavigate('production')}>Planifier</button></div><div className="card-body">
        {stocks.map(({v,physical,reserved,available})=><div className="stock-snapshot" key={v.id}><div><VarietyDot color={v.color}/><strong>{v.name}</strong><small>{unitLabel(v)}</small></div><span><small>Physique</small>{physical}</span><span><small>Réservé</small>{reserved}</span><span className={available<Number(v.min_stock||0)?'stock-danger':''}><small>Disponible</small>{available}</span></div>)}
      </div></div>
    </div>
  </div>;
}

