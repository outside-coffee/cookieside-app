import React, { useEffect, useMemo, useState } from 'react';
import { financeAPI, getVarietyStockBreakdown, purchasePlansAPI } from '../lib/api';
import { SectionHeader, LoadingScreen, Alert, VarietyDot } from '../components/UI';
import { unitLabel } from '../lib/products';

export default function Dashboard({ varieties, ingredients, production, sales, orders, loading, onNavigate }) {
  const [followUp, setFollowUp] = useState({ orderedPlans:[], dueEntries:[] });
  useEffect(() => {
    Promise.all([purchasePlansAPI.getAll(), financeAPI.getAll()])
      .then(([plans, entries]) => setFollowUp({
        orderedPlans:plans.filter(plan => plan.status === 'ordered'),
        dueEntries:entries.filter(entry => entry.payment_status === 'due')
      }))
      .catch(() => setFollowUp({ orderedPlans:[], dueEntries:[] }));
  }, []);
  const today=new Date().toISOString().split('T')[0];
  const dueOrders=orders.filter(o=>o.status==='Vendu').sort((a,b)=>a.delivery_date.localeCompare(b.delivery_date));
  const urgent=dueOrders.filter(o=>o.delivery_date<=today);
  const ingredientAlerts=ingredients.filter(i=>Number(i.stock_qty)<=Number(i.alert_threshold));
  const stocks=useMemo(()=>varieties.filter(v=>v.product_status!=='draft').map(v=>({v,...getVarietyStockBreakdown(v.id,production,sales)})),[varieties,production,sales]);
  const productionNeeds=stocks.filter(s=>s.available<Number(s.v.min_stock||0));
  const dueAmount=followUp.dueEntries.reduce((sum,entry)=>sum+Number(entry.amount||0),0);
  if(loading)return <LoadingScreen text="Préparation de la journée..."/>;
  return <div className="page-inner">
    <SectionHeader title="Aujourd'hui" subtitle="Une seule feuille pour exécuter la journée"
      actions={[<button key="order" className="btn btn-primary" onClick={()=>onNavigate('sales')}>+ Commande</button>,<button key="prod" className="btn btn-gold" onClick={()=>onNavigate('production')}>+ Production</button>,<button key="stock" className="btn" onClick={()=>onNavigate('mouvements')}>+ Réception</button>]}/>
    {urgent.length>0&&<Alert variant="danger"><strong>{urgent.length} commande(s)</strong> à préparer ou livrer aujourd’hui.</Alert>}
    {ingredientAlerts.length>0&&<Alert variant="warning"><strong>{ingredientAlerts.length} matière(s)</strong> sous le seuil : {ingredientAlerts.map(i=>i.name).join(', ')}</Alert>}
    <div className="kpi-grid dashboard-kpis">
      <div className="kpi-card accent"><div className="kpi-label">À préparer</div><div className="kpi-value">{dueOrders.length}</div><div className="kpi-sub">commandes ouvertes</div></div>
      <div className="kpi-card"><div className="kpi-label">À produire</div><div className="kpi-value">{productionNeeds.length}</div><div className="kpi-sub">produits sous leur cible</div></div>
      <div className="kpi-card danger"><div className="kpi-label">Matières en alerte</div><div className="kpi-value">{ingredientAlerts.length}</div><div className="kpi-sub">à acheter ou réceptionner</div></div>
      <div className="kpi-card"><div className="kpi-label">Achats commandés</div><div className="kpi-value">{followUp.orderedPlans.length}</div><div className="kpi-sub">à réceptionner</div></div>
      <div className="kpi-card"><div className="kpi-label">À payer</div><div className="kpi-value">{dueAmount.toFixed(0)} <small>DT</small></div><div className="kpi-sub">{followUp.dueEntries.length} charge(s)</div></div>
    </div>
    <div className="today-actions card">
      <div className="card-header"><div><div className="card-title">Actions à traiter</div><div className="form-hint">Uniquement ce qui demande une action</div></div></div>
      <div className="today-action-list">
        {urgent.length > 0 && <button onClick={()=>onNavigate('sales')}><span className="danger">{urgent.length}</span><div><strong>Préparer les commandes urgentes</strong><small>Échéance aujourd’hui ou dépassée</small></div><b>→</b></button>}
        {productionNeeds.length > 0 && <button onClick={()=>onNavigate('production')}><span>{productionNeeds.length}</span><div><strong>Planifier la production</strong><small>Produits sous leur stock cible</small></div><b>→</b></button>}
        {ingredientAlerts.length > 0 && <button onClick={()=>onNavigate('achats')}><span className="warning">{ingredientAlerts.length}</span><div><strong>Préparer les achats</strong><small>Matières ou consommables sous le seuil</small></div><b>→</b></button>}
        {followUp.orderedPlans.length > 0 && <button onClick={()=>onNavigate('mouvements')}><span>{followUp.orderedPlans.length}</span><div><strong>Réceptionner les achats commandés</strong><small>La réception mettra à jour Stock et Finance</small></div><b>→</b></button>}
        {followUp.dueEntries.length > 0 && <button onClick={()=>onNavigate('finance')}><span className="warning">{followUp.dueEntries.length}</span><div><strong>Traiter les paiements fournisseurs</strong><small>{dueAmount.toFixed(2)} DT à payer</small></div><b>→</b></button>}
        {!urgent.length&&!productionNeeds.length&&!ingredientAlerts.length&&!followUp.orderedPlans.length&&!followUp.dueEntries.length&&<div className="empty-inline">Aucune action prioritaire. La journée est à jour.</div>}
      </div>
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

