import React, { useEffect, useMemo, useState } from 'react';
import { financeAPI } from '../lib/api';
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
  const [financeEntries, setFinanceEntries] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(true);

  useEffect(() => {
    financeAPI.getAll()
      .then(setFinanceEntries)
      .catch(error=>console.error('Finance KPI load failed',error))
      .finally(()=>setFinanceLoading(false));
  }, []);

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

  const periodFinanceEntries = useMemo(() => financeEntries.filter(entry =>
    entry.entry_type==='expense' &&
    inBounds(entry.entry_date, bounds) &&
    entry.category!=='Achats matières'
  ), [financeEntries, bounds]);

  const stats = useMemo(() => {
    const ca=deliveredOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const subtotal=deliveredOrders.reduce((sum,row)=>sum+Number(row.subtotal_amount||0),0);
    const discount=deliveredOrders.reduce((sum,row)=>sum+Number(row.discount_amount||0),0);
    const deliveryRevenue=deliveredOrders.reduce((sum,row)=>sum+Number(row.delivery_fee||0),0);
    const deliveryCost=deliveredOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const marginAfterDelivery=deliveredOrders.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const paid=deliveredOrders.filter(row=>row.status==='Payé').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const units=filteredSales.reduce((sum,row)=>sum+Number(row.qty||0),0);
    const productRevenue=filteredSales.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const productMargin=filteredSales.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const productCost=Math.max(0,productRevenue-productMargin);
    const orderCount=deliveredOrders.length;

    const totalPeriodCa=deliveredOrdersAll.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const channelShare=channel==='all' ? 1 : (totalPeriodCa>0 ? ca/totalPeriodCa : 0);

    const fixedExpensesTotal=periodFinanceEntries.filter(entry=>entry.cost_nature==='fixed')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const marketingExpensesTotal=periodFinanceEntries.filter(entry=>entry.category==='Marketing')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const otherVariableExpensesTotal=periodFinanceEntries.filter(entry=>entry.cost_nature!=='fixed' && entry.category!=='Marketing')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);

    const fixedExpenses=fixedExpensesTotal*channelShare;
    const marketingExpenses=marketingExpensesTotal*channelShare;
    const otherVariableExpenses=otherVariableExpensesTotal*channelShare;
    const operatingExpenses=fixedExpenses+marketingExpenses+otherVariableExpenses;
    const contributionMargin=marginAfterDelivery-marketingExpenses-otherVariableExpenses;
    const netOperatingMargin=marginAfterDelivery-operatingExpenses;

    return {
      ca,subtotal,discount,deliveryRevenue,deliveryCost,marginAfterDelivery,paid,units,productRevenue,productMargin,productCost,orderCount,
      fixedExpenses,marketingExpenses,otherVariableExpenses,operatingExpenses,contributionMargin,netOperatingMargin,channelShare,totalPeriodCa,
      receivable:ca-paid,
      marginAfterDeliveryRate:ca?marginAfterDelivery/ca*100:0,
      netOperatingMarginRate:ca?netOperatingMargin/ca*100:0,
      markRate:productRevenue?productMargin/productRevenue*100:0,
      averageBasket:orderCount?ca/orderCount:0,
      idv:orderCount?units/orderCount:0,
      averageSellingPrice:units?productRevenue/units:0,
      discountRate:subtotal?discount/subtotal*100:0
    };
  }, [deliveredOrders, deliveredOrdersAll, filteredSales, periodFinanceEntries, channel]);

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

  if (loading || financeLoading) return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Analyse & performance" subtitle="Piloter CA, commandes, panier, remise, coûts et rentabilité"/>
    <SopGuide steps={[{title:'Choisir',detail:'Sélectionner une période et un canal'},{title:'Comprendre',detail:'Lire CA, IDV, PM, PVM, remise et marge'},{title:'Décider',detail:'Ajuster offre, prix, promotions et acquisition'}]} actions={[<button key="operations" className="btn btn-sm" onClick={()=>onNavigate('dashboard')}>← Retour aux opérations</button>]} />

    <div className="card" style={{marginBottom:'1rem'}}><div className="card-body"><div style={{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}}>
      <div><div className="form-label">Période</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['7','7 jours'],['30','30 jours'],['90','90 jours'],['all','Tout'],['custom','Personnalisée']].map(([key,label])=><button key={key} className={`btn btn-sm ${period===key?'btn-primary':''}`} onClick={()=>setPeriod(key)}>{label}</button>)}</div></div>
      {period==='custom'&&<><div className="form-group" style={{margin:0}}><label className="form-label">Du</label><input className="form-input" type="date" value={customDates.from} onChange={e=>setCustomDates(v=>({...v,from:e.target.value}))}/></div><div className="form-group" style={{margin:0}}><label className="form-label">Au</label><input className="form-input" type="date" value={customDates.to} onChange={e=>setCustomDates(v=>({...v,to:e.target.value}))}/></div></>}
      <div><div className="form-label">Canal</div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{[['all','Tous'],['B2C','B2C'],['B2B','B2B']].map(([key,label])=><button key={key} className={`btn btn-sm ${channel===key?'btn-primary':''}`} onClick={()=>setChannel(key)}>{label}</button>)}</div></div>
    </div></div></div>

    <div className="finance-section">
      <div className="finance-section-head"><div><h3>Indicateurs business</h3><small>Commandes livrées / payées · période et canal sélectionnés</small></div></div>
      <div className="finance-section-grid">
        <div className="finance-kpi"><small>CA</small><strong>{stats.ca.toFixed(2)} DT</strong><span>CA total livré</span></div>
        <div className="finance-kpi"><small>Nb commandes</small><strong>{stats.orderCount}</strong><span>commandes livrées</span></div>
        <div className="finance-kpi"><small>IDV</small><strong>{stats.idv.toFixed(2)}</strong><span>unités / commande · {stats.units} unités</span></div>
        <div className="finance-kpi"><small>PM</small><strong>{stats.averageBasket.toFixed(2)} DT</strong><span>CA / commande</span></div>
        <div className="finance-kpi"><small>PVM</small><strong>{stats.averageSellingPrice.toFixed(2)} DT</strong><span>CA produit net / unité</span></div>
        <div className="finance-kpi warning"><small>Tx de remise</small><strong>{stats.discountRate.toFixed(1)}%</strong><span>{stats.discount.toFixed(2)} DT de remise</span></div>
        <div className="finance-kpi"><small>Coût produit</small><strong>{stats.productCost.toFixed(2)} DT</strong><span>matières / recettes vendues</span></div>
        <div className="finance-kpi success"><small>MACV</small><strong>{stats.productMargin.toFixed(2)} DT</strong><span>CA produit net − coût produit</span></div>
        <div className="finance-kpi success"><small>Tx de marque</small><strong>{stats.markRate.toFixed(1)}%</strong><span>MACV / CA produit net</span></div>
        <div className="finance-kpi"><small>Coût livraison</small><strong>{stats.deliveryCost.toFixed(2)} DT</strong><span>facturé client : {stats.deliveryRevenue.toFixed(2)} DT</span></div>
        <div className="finance-kpi warning"><small>Coût marketing</small><strong>{stats.marketingExpenses.toFixed(2)} DT</strong><span>{channel==='all'?'dépenses Marketing saisies':`alloué à ${Math.round(stats.channelShare*100)}% du CA`}</span></div>
        <div className="finance-kpi"><small>Autres coûts variables</small><strong>{stats.otherVariableExpenses.toFixed(2)} DT</strong><span>{channel==='all'?'hors matières et marketing':`alloués à ${Math.round(stats.channelShare*100)}% du CA`}</span></div>
        <div className="finance-kpi"><small>Coûts fixes</small><strong>{stats.fixedExpenses.toFixed(2)} DT</strong><span>{channel==='all'?'loyer, salaires et autres fixes':`alloués à ${Math.round(stats.channelShare*100)}% du CA`}</span></div>
        <div className={`finance-kpi ${stats.contributionMargin>=0?'success':'danger'}`}><small>Marge contributive</small><strong>{stats.contributionMargin.toFixed(2)} DT</strong><span>après coûts variables</span></div>
        <div className={`finance-kpi ${stats.netOperatingMargin>=0?'success':'danger'}`}><small>Marge nette</small><strong>{stats.netOperatingMargin.toFixed(2)} DT</strong><span>{stats.netOperatingMarginRate.toFixed(1)}% du CA{channel==='all'?' · après coûts fixes':` · coûts communs alloués à ${Math.round(stats.channelShare*100)}%`}</span></div>
        <div className="finance-kpi"><small>À encaisser</small><strong>{stats.receivable.toFixed(2)} DT</strong><span>encaissé : {stats.paid.toFixed(2)} DT</span></div>
      </div>
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
            <th style={{textAlign:'right'}}>Tx marque</th>
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
