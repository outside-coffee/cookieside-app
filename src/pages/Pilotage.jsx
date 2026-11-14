import React, { useEffect, useMemo, useState } from 'react';
import { financeAPI } from '../lib/api';
import { Modal, SectionHeader, SopGuide, LoadingScreen } from '../components/UI';

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
const customerKey = order => order.customer_id || (order.client ? `name:${String(order.client).trim().toLowerCase()}` : null);
const customerMetrics = orderList => {
  const counts={};
  orderList.forEach(order=>{
    const key=customerKey(order);
    if(key) counts[key]=(counts[key]||0)+1;
  });
  const values=Object.values(counts);
  const customers=values.length;
  const identifiedOrders=values.reduce((sum,value)=>sum+value,0);
  const repeatCustomers=values.filter(value=>value>=2).length;
  return {
    customers,
    identifiedOrders,
    purchaseFrequency:customers?identifiedOrders/customers:0,
    repeatCustomers,
    repeatRate:customers?repeatCustomers/customers*100:0
  };
};

export default function Pilotage({ sales = [], orders = [], onNavigate, loading }) {
  const [period, setPeriod] = useState('30');
  const [channel, setChannel] = useState('all');
  const [customDates, setCustomDates] = useState({ from:daysAgo(30), to:today() });
  const [financeEntries, setFinanceEntries] = useState([]);
  const [financeLoading, setFinanceLoading] = useState(true);
  const [monthlyReportOpen, setMonthlyReportOpen] = useState(false);
  const [monthlyReportMonth, setMonthlyReportMonth] = useState(today().slice(0,7));

  useEffect(() => {
    financeAPI.getAll()
      .then(setFinanceEntries)
      .catch(error=>console.error('Finance KPI load failed',error))
      .finally(()=>setFinanceLoading(false));
  }, []);

  const handlePrintMonthlyReport = () => {
    document.body.classList.add('print-performance-report');
    const cleanup=()=>document.body.classList.remove('print-performance-report');
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
    setTimeout(cleanup,1000);
  };

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
    const customerStats=customerMetrics(deliveredOrders);

    const fixedExpenses=periodFinanceEntries.filter(entry=>entry.cost_nature==='fixed')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const marketingExpenses=periodFinanceEntries.filter(entry=>entry.category==='Marketing')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const otherVariableExpenses=periodFinanceEntries.filter(entry=>entry.cost_nature!=='fixed' && entry.category!=='Marketing')
      .reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const operatingExpenses=fixedExpenses+marketingExpenses+otherVariableExpenses;
    const contributionMargin=marginAfterDelivery-marketingExpenses-otherVariableExpenses;
    const netOperatingMargin=channel==='all' ? marginAfterDelivery-operatingExpenses : null;

    return {
      ca,subtotal,discount,deliveryRevenue,deliveryCost,marginAfterDelivery,paid,units,productRevenue,productMargin,productCost,orderCount,
      customerCount:customerStats.customers,purchaseFrequency:customerStats.purchaseFrequency,repeatCustomers:customerStats.repeatCustomers,repeatRate:customerStats.repeatRate,
      fixedExpenses,marketingExpenses,otherVariableExpenses,operatingExpenses,contributionMargin,netOperatingMargin,
      receivable:ca-paid,
      marginAfterDeliveryRate:ca?marginAfterDelivery/ca*100:0,
      netOperatingMarginRate:ca&&netOperatingMargin!=null?netOperatingMargin/ca*100:0,
      markRate:productRevenue?productMargin/productRevenue*100:0,
      averageBasket:orderCount?ca/orderCount:0,
      idv:orderCount?units/orderCount:0,
      averageSellingPrice:units?productRevenue/units:0,
      discountRate:subtotal?discount/subtotal*100:0,
      foodCostRate:productRevenue?productCost/productRevenue*100:0,
      deliveryCostRate:ca?deliveryCost/ca*100:0,
      marketingCostRate:ca?marketingExpenses/ca*100:0,
      otherVariableCostRate:ca?otherVariableExpenses/ca*100:0,
      fixedCostRate:ca?fixedExpenses/ca*100:0,
      operatingCostRate:ca?operatingExpenses/ca*100:0
    };
  }, [deliveredOrders, filteredSales, periodFinanceEntries, channel]);

  const monthlyReport = useMemo(() => {
    const [year,month]=monthlyReportMonth.split('-').map(Number);
    const from=`${monthlyReportMonth}-01`;
    const lastDay=new Date(year,month,0).getDate();
    const to=`${monthlyReportMonth}-${String(lastDay).padStart(2,'0')}`;
    const reportBounds={from,to};
    const reportOrders=orders.filter(order=>
      ['Livré','Payé'].includes(order.status) &&
      inBounds(order.delivered_at || order.delivery_date || order.created_at, reportBounds)
    );
    const orderIds=new Set(reportOrders.map(order=>order.id));
    const reportSales=sales.filter(sale=>orderIds.has(sale.order_id));
    const reportEntries=financeEntries.filter(entry=>
      entry.entry_type==='expense' &&
      entry.category!=='Achats matières' &&
      inBounds(entry.entry_date,reportBounds)
    );

    const ca=reportOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const subtotal=reportOrders.reduce((sum,row)=>sum+Number(row.subtotal_amount||0),0);
    const discount=reportOrders.reduce((sum,row)=>sum+Number(row.discount_amount||0),0);
    const deliveryRevenue=reportOrders.reduce((sum,row)=>sum+Number(row.delivery_fee||0),0);
    const deliveryCost=reportOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const marginAfterDelivery=reportOrders.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const units=reportSales.reduce((sum,row)=>sum+Number(row.qty||0),0);
    const productRevenue=reportSales.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const productMargin=reportSales.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const productCost=Math.max(0,productRevenue-productMargin);
    const fixedExpenses=reportEntries.filter(entry=>entry.cost_nature==='fixed').reduce((sum,row)=>sum+Number(row.amount||0),0);
    const marketingExpenses=reportEntries.filter(entry=>entry.category==='Marketing').reduce((sum,row)=>sum+Number(row.amount||0),0);
    const otherVariableExpenses=reportEntries.filter(entry=>entry.cost_nature!=='fixed' && entry.category!=='Marketing').reduce((sum,row)=>sum+Number(row.amount||0),0);
    const contributionMargin=marginAfterDelivery-marketingExpenses-otherVariableExpenses;
    const netMargin=contributionMargin-fixedExpenses;
    const orderCount=reportOrders.length;
    const customerStats=customerMetrics(reportOrders);

    const byDay={};
    reportOrders.forEach(order=>{
      const date=String(order.delivered_at || order.delivery_date || order.created_at || '').slice(0,10);
      if(!date) return;
      byDay[date]??={date,ca:0,orders:0,units:0,margin:0};
      byDay[date].ca+=Number(order.total_amount||0);
      byDay[date].orders+=1;
      byDay[date].margin+=Number(order.margin||0);
    });
    reportSales.forEach(sale=>{
      const order=reportOrders.find(item=>item.id===sale.order_id);
      const date=String(order?.delivered_at || order?.delivery_date || order?.created_at || '').slice(0,10);
      if(date&&byDay[date]) byDay[date].units+=Number(sale.qty||0);
    });

    return {
      from,to,
      label:new Date(`${from}T12:00:00`).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}),
      ca,subtotal,discount,deliveryRevenue,deliveryCost,marginAfterDelivery,units,productRevenue,productMargin,productCost,
      fixedExpenses,marketingExpenses,otherVariableExpenses,contributionMargin,netMargin,orderCount,
      customerCount:customerStats.customers,purchaseFrequency:customerStats.purchaseFrequency,repeatCustomers:customerStats.repeatCustomers,repeatRate:customerStats.repeatRate,
      idv:orderCount?units/orderCount:0,
      pm:orderCount?ca/orderCount:0,
      pvm:units?productRevenue/units:0,
      discountRate:subtotal?discount/subtotal*100:0,
      markRate:productRevenue?productMargin/productRevenue*100:0,
      netMarginRate:ca?netMargin/ca*100:0,
      foodCostRate:productRevenue?productCost/productRevenue*100:0,
      deliveryCostRate:ca?deliveryCost/ca*100:0,
      marketingCostRate:ca?marketingExpenses/ca*100:0,
      otherVariableCostRate:ca?otherVariableExpenses/ca*100:0,
      fixedCostRate:ca?fixedExpenses/ca*100:0,
      operatingCostRate:ca?(fixedExpenses+marketingExpenses+otherVariableExpenses)/ca*100:0,
      daily:Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date))
    };
  }, [monthlyReportMonth, orders, sales, financeEntries]);

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
    <SectionHeader title="Analyse & performance" subtitle="Piloter CA, commandes, panier, remise, coûts et rentabilité"
      actions={[<button key="pdf" className="btn" onClick={()=>setMonthlyReportOpen(true)}>Rapport PDF mensuel</button>]} />
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
        <div className="finance-kpi"><small>Clients acheteurs</small><strong>{stats.customerCount}</strong><span>clients identifiés sur la période</span></div>
        <div className="finance-kpi"><small>Fréquence d'achat</small><strong>{stats.purchaseFrequency.toFixed(2)}</strong><span>commandes / client</span></div>
        <div className="finance-kpi"><small>Clients récurrents</small><strong>{stats.repeatCustomers}</strong><span>{stats.repeatRate.toFixed(1)}% des clients</span></div>
        <div className="finance-kpi"><small>IDV</small><strong>{stats.idv.toFixed(2)}</strong><span>unités / commande · {stats.units} unités</span></div>
        <div className="finance-kpi"><small>PM</small><strong>{stats.averageBasket.toFixed(2)} DT</strong><span>CA / commande</span></div>
        <div className="finance-kpi"><small>PVM</small><strong>{stats.averageSellingPrice.toFixed(2)} DT</strong><span>CA produit net / unité</span></div>
        <div className="finance-kpi warning"><small>Tx de remise</small><strong>{stats.discountRate.toFixed(1)}%</strong><span>{stats.discount.toFixed(2)} DT de remise</span></div>
        <div className="finance-kpi"><small>Coût produit</small><strong>{stats.productCost.toFixed(2)} DT</strong><span>Food cost {stats.foodCostRate.toFixed(1)}%</span></div>
        <div className="finance-kpi success"><small>MACV</small><strong>{stats.productMargin.toFixed(2)} DT</strong><span>CA produit net − coût produit</span></div>
        <div className="finance-kpi success"><small>Tx de marque</small><strong>{stats.markRate.toFixed(1)}%</strong><span>MACV / CA produit net</span></div>
        <div className="finance-kpi"><small>Coût livraison</small><strong>{stats.deliveryCost.toFixed(2)} DT</strong><span>{stats.deliveryCostRate.toFixed(1)}% du CA · facturé {stats.deliveryRevenue.toFixed(2)} DT</span></div>
        <div className="finance-kpi warning"><small>Coût marketing</small><strong>{stats.marketingExpenses.toFixed(2)} DT</strong><span>{stats.marketingCostRate.toFixed(1)}% du CA</span></div>
        <div className="finance-kpi"><small>Autres coûts variables</small><strong>{stats.otherVariableExpenses.toFixed(2)} DT</strong><span>{stats.otherVariableCostRate.toFixed(1)}% du CA</span></div>
        <div className="finance-kpi"><small>Coûts fixes</small><strong>{stats.fixedExpenses.toFixed(2)} DT</strong><span>{stats.fixedCostRate.toFixed(1)}% du CA</span></div>
        <div className="finance-kpi"><small>Poids charges exploitation</small><strong>{stats.operatingCostRate.toFixed(1)}%</strong><span>{stats.operatingExpenses.toFixed(2)} DT</span></div>
        <div className={`finance-kpi ${stats.contributionMargin>=0?'success':'danger'}`}><small>Marge contributive</small><strong>{stats.contributionMargin.toFixed(2)} DT</strong><span>après coûts variables</span></div>
        {channel==='all'
          ? <div className={`finance-kpi ${stats.netOperatingMargin>=0?'success':'danger'}`}><small>Marge nette</small><strong>{stats.netOperatingMargin.toFixed(2)} DT</strong><span>{stats.netOperatingMarginRate.toFixed(1)}% du CA · après coûts fixes</span></div>
          : <div className="finance-kpi"><small>Marge nette</small><strong>—</strong><span>charges communes non ventilées par canal</span></div>}
        <div className="finance-kpi"><small>À encaisser</small><strong>{stats.receivable.toFixed(2)} DT</strong><span>encaissé : {stats.paid.toFixed(2)} DT</span></div>
      </div>
    </div>

    <Modal open={monthlyReportOpen} onClose={()=>setMonthlyReportOpen(false)} size="lg" title="Rapport mensuel de performance"
      footer={<>
        <button className="btn" onClick={()=>setMonthlyReportOpen(false)}>Fermer</button>
        <button className="btn btn-primary" onClick={handlePrintMonthlyReport}>Imprimer / Enregistrer PDF</button>
      </>}>
      <div className="no-print" style={{marginBottom:16}}>
        <label className="form-label">Mois du rapport</label>
        <input className="form-input" type="month" value={monthlyReportMonth} onChange={e=>setMonthlyReportMonth(e.target.value)} />
      </div>

      <div className="performance-report-print">
        <div className="performance-report-brand">
          <img src="/inside-wordmark-blue.svg" alt="Inside"/>
          <div><h1>RAPPORT MENSUEL DE PERFORMANCE</h1><strong>{monthlyReport.label}</strong><span>Inside · Cookieside</span></div>
        </div>

        <section className="performance-report-kpis">
          <div><small>CA</small><strong>{monthlyReport.ca.toFixed(2)} DT</strong></div>
          <div><small>Commandes</small><strong>{monthlyReport.orderCount}</strong></div>
          <div><small>Clients acheteurs</small><strong>{monthlyReport.customerCount}</strong></div>
          <div><small>Fréquence achat</small><strong>{monthlyReport.purchaseFrequency.toFixed(2)}</strong></div>
          <div><small>Clients récurrents</small><strong>{monthlyReport.repeatCustomers}</strong><span>{monthlyReport.repeatRate.toFixed(1)}%</span></div>
          <div><small>IDV</small><strong>{monthlyReport.idv.toFixed(2)}</strong></div>
          <div><small>PM</small><strong>{monthlyReport.pm.toFixed(2)} DT</strong></div>
          <div><small>PVM</small><strong>{monthlyReport.pvm.toFixed(2)} DT</strong></div>
          <div><small>Tx remise</small><strong>{monthlyReport.discountRate.toFixed(1)}%</strong></div>
          <div><small>Coût produit</small><strong>{monthlyReport.productCost.toFixed(2)} DT</strong><span>Food cost {monthlyReport.foodCostRate.toFixed(1)}%</span></div>
          <div><small>MACV</small><strong>{monthlyReport.productMargin.toFixed(2)} DT</strong></div>
          <div><small>Tx marque</small><strong>{monthlyReport.markRate.toFixed(1)}%</strong></div>
          <div><small>Coût livraison</small><strong>{monthlyReport.deliveryCost.toFixed(2)} DT</strong><span>{monthlyReport.deliveryCostRate.toFixed(1)}% du CA</span></div>
          <div><small>Marketing</small><strong>{monthlyReport.marketingExpenses.toFixed(2)} DT</strong><span>{monthlyReport.marketingCostRate.toFixed(1)}% du CA</span></div>
          <div><small>Autres variables</small><strong>{monthlyReport.otherVariableExpenses.toFixed(2)} DT</strong><span>{monthlyReport.otherVariableCostRate.toFixed(1)}% du CA</span></div>
          <div><small>Coûts fixes</small><strong>{monthlyReport.fixedExpenses.toFixed(2)} DT</strong><span>{monthlyReport.fixedCostRate.toFixed(1)}% du CA</span></div>
          <div><small>Marge contributive</small><strong>{monthlyReport.contributionMargin.toFixed(2)} DT</strong></div>
          <div><small>Marge nette</small><strong>{monthlyReport.netMargin.toFixed(2)} DT</strong><span>{monthlyReport.netMarginRate.toFixed(1)}% du CA</span></div>
        </section>

        <section className="performance-report-summary">
          <h2>Lecture du mois</h2>
          <div><span>Clients acheteurs / fréquence</span><strong>{monthlyReport.customerCount} / {monthlyReport.purchaseFrequency.toFixed(2)}</strong></div>
          <div><span>Clients récurrents</span><strong>{monthlyReport.repeatCustomers} · {monthlyReport.repeatRate.toFixed(1)}%</strong></div>
          <div><span>CA produit net</span><strong>{monthlyReport.productRevenue.toFixed(2)} DT</strong></div>
          <div><span>Food cost</span><strong>{monthlyReport.productCost.toFixed(2)} DT · {monthlyReport.foodCostRate.toFixed(1)}%</strong></div>
          <div><span>Remises accordées</span><strong>{monthlyReport.discount.toFixed(2)} DT</strong></div>
          <div><span>Livraison facturée / coût</span><strong>{monthlyReport.deliveryRevenue.toFixed(2)} / {monthlyReport.deliveryCost.toFixed(2)} DT</strong></div>
          <div><span>Marge après livraison</span><strong>{monthlyReport.marginAfterDelivery.toFixed(2)} DT</strong></div>
          <div><span>Poids livraison</span><strong>{monthlyReport.deliveryCostRate.toFixed(1)}% du CA</strong></div>
          <div><span>Poids marketing</span><strong>{monthlyReport.marketingCostRate.toFixed(1)}% du CA</strong></div>
          <div><span>Poids autres variables</span><strong>{monthlyReport.otherVariableCostRate.toFixed(1)}% du CA</strong></div>
          <div><span>Poids coûts fixes</span><strong>{monthlyReport.fixedCostRate.toFixed(1)}% du CA</strong></div>
          <div><span>Charges d'exploitation</span><strong>{(monthlyReport.fixedExpenses+monthlyReport.marketingExpenses+monthlyReport.otherVariableExpenses).toFixed(2)} DT · {monthlyReport.operatingCostRate.toFixed(1)}% du CA</strong></div>
        </section>

        <section className="performance-report-daily">
          <h2>Performance journalière</h2>
          {monthlyReport.daily.length===0?<p>Aucune commande livrée ou payée sur ce mois.</p>:
          <table><thead><tr><th>Date</th><th>CA</th><th>Commandes</th><th>Unités</th><th>Marge après livraison</th></tr></thead>
          <tbody>{monthlyReport.daily.map(row=><tr key={row.date}><td>{formatDay(row.date)}</td><td>{row.ca.toFixed(2)} DT</td><td>{row.orders}</td><td>{row.units}</td><td>{row.margin.toFixed(2)} DT</td></tr>)}</tbody></table>}
        </section>

        <div className="performance-report-footer">Rapport généré depuis Inside · données livrées/payées et écritures Finance du mois.</div>
      </div>
    </Modal>

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
