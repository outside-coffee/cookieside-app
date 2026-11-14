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

const channelReportMetrics = (orderList, saleList, sharedCosts={fixed:0,marketing:0,otherVariable:0}, totalCa=0) => {
  const ids=new Set(orderList.map(order=>order.id));
  const lines=saleList.filter(sale=>ids.has(sale.order_id));
  const ca=orderList.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const subtotal=orderList.reduce((sum,row)=>sum+Number(row.subtotal_amount||0),0);
  const discount=orderList.reduce((sum,row)=>sum+Number(row.discount_amount||0),0);
  const deliveryCost=orderList.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
  const marginAfterDelivery=orderList.reduce((sum,row)=>sum+Number(row.margin||0),0);
  const units=lines.reduce((sum,row)=>sum+Number(row.qty||0),0);
  const productRevenue=lines.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const productMargin=lines.reduce((sum,row)=>sum+Number(row.margin||0),0);
  const productCost=Math.max(0,productRevenue-productMargin);
  const share=totalCa>0?ca/totalCa:0;
  const fixed=sharedCosts.fixed*share;
  const marketing=sharedCosts.marketing*share;
  const otherVariable=sharedCosts.otherVariable*share;
  const netMargin=marginAfterDelivery-fixed-marketing-otherVariable;
  const customers=customerMetrics(orderList);
  return {
    ca,orders:orderList.length,units,customers:customers.customers,frequency:customers.purchaseFrequency,
    idv:orderList.length?units/orderList.length:0,
    pm:orderList.length?ca/orderList.length:0,
    pvm:units?productRevenue/units:0,
    discountRate:subtotal?discount/subtotal*100:0,
    foodCostRate:productRevenue?productCost/productRevenue*100:0,
    netMargin,netMarginRate:ca?netMargin/ca*100:0
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
    const previousTitle=document.title;
    const [year,month]=monthlyReportMonth.split('-').map(Number);
    const monthLabel=new Date(year,month-1,1)
      .toLocaleDateString('fr-FR',{month:'long',year:'numeric'})
      .replace(/\s+/g,'_');
    document.title=`Inside_Rapport_Performance_${monthLabel}`;
    document.body.classList.add('print-performance-report');
    const cleanup=()=>{
      document.body.classList.remove('print-performance-report');
      document.title=previousTitle;
    };
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
    setTimeout(cleanup,1000);
  };

  const bounds = useMemo(
    () => period === 'all' ? { from:'', to:'' } : period === 'custom' ? customDates : { from:daysAgo(Number(period)), to:today() },
    [period, customDates]
  );

  const orderedOrdersAll = useMemo(() => orders.filter(order =>
    order.status!=='Annulée' &&
    inBounds(order.created_at, bounds)
  ), [orders, bounds]);

  const orderedOrders = useMemo(
    () => orderedOrdersAll.filter(order => channel==='all' || order.canal===channel),
    [orderedOrdersAll, channel]
  );

  const orderedIds = useMemo(() => new Set(orderedOrders.map(order=>order.id)), [orderedOrders]);
  const filteredSales = useMemo(() => sales.filter(sale => orderedIds.has(sale.order_id)), [sales, orderedIds]);

  const periodFinanceEntries = useMemo(() => financeEntries.filter(entry =>
    entry.entry_type==='expense' &&
    inBounds(entry.entry_date, bounds) &&
    entry.category!=='Achats matières'
  ), [financeEntries, bounds]);

  const stats = useMemo(() => {
    const ca=orderedOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const subtotal=orderedOrders.reduce((sum,row)=>sum+Number(row.subtotal_amount||0),0);
    const discount=orderedOrders.reduce((sum,row)=>sum+Number(row.discount_amount||0),0);
    const deliveryRevenue=orderedOrders.reduce((sum,row)=>sum+Number(row.delivery_fee||0),0);
    const deliveryCost=orderedOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const marginAfterDelivery=orderedOrders.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const paid=orderedOrders.filter(row=>row.status==='Payé').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const units=filteredSales.reduce((sum,row)=>sum+Number(row.qty||0),0);
    const productRevenue=filteredSales.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const productMargin=filteredSales.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const productCost=Math.max(0,productRevenue-productMargin);
    const orderCount=orderedOrders.length;
    const customerStats=customerMetrics(orderedOrders);

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
  }, [orderedOrders, filteredSales, periodFinanceEntries, channel]);

  const monthlyReport = useMemo(() => {
    const [year,month]=monthlyReportMonth.split('-').map(Number);
    const from=`${monthlyReportMonth}-01`;
    const lastDay=new Date(year,month,0).getDate();
    const monthEnd=`${monthlyReportMonth}-${String(lastDay).padStart(2,'0')}`;
    const currentMonth=today().slice(0,7);
    const to=monthlyReportMonth===currentMonth ? today() : monthEnd;
    const reportBounds={from,to};
    const reportOrders=orders.filter(order=>
      order.status!=='Annulée' &&
      inBounds(order.created_at, reportBounds)
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
      const date=String(order.created_at || '').slice(0,10);
      if(!date) return;
      byDay[date]??={date,ca:0,orders:0,units:0,margin:0};
      byDay[date].ca+=Number(order.total_amount||0);
      byDay[date].orders+=1;
      byDay[date].margin+=Number(order.margin||0);
    });
    reportSales.forEach(sale=>{
      const order=reportOrders.find(item=>item.id===sale.order_id);
      const date=String(order?.created_at || '').slice(0,10);
      if(date&&byDay[date]) byDay[date].units+=Number(sale.qty||0);
    });

    const daily=Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date));
    const elapsedDays=Math.max(1,Math.round((new Date(`${to}T12:00:00`)-new Date(`${from}T12:00:00`))/86400000)+1);
    const activeDays=daily.filter(row=>row.ca>0).length;
    const avgDailyCa=ca/elapsedDays;
    const bestDay=daily.reduce((best,row)=>!best||row.ca>best.ca?row:best,null);
    const isCurrentMonth=monthlyReportMonth===currentMonth;
    const projectedCa=isCurrentMonth&&to<monthEnd ? avgDailyCa*lastDay : ca;
    const b2cCa=reportOrders.filter(order=>order.canal==='B2C').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const b2bCa=reportOrders.filter(order=>order.canal==='B2B').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const b2cShare=ca?b2cCa/ca*100:0;
    const b2bShare=ca?b2bCa/ca*100:0;
    const costStructure=[
      {label:'Food cost',value:productCost,rate:productRevenue?productCost/productRevenue*100:0},
      {label:'Livraison',value:deliveryCost,rate:ca?deliveryCost/ca*100:0},
      {label:'Marketing',value:marketingExpenses,rate:ca?marketingExpenses/ca*100:0},
      {label:'Autres variables',value:otherVariableExpenses,rate:ca?otherVariableExpenses/ca*100:0},
      {label:'Coûts fixes',value:fixedExpenses,rate:ca?fixedExpenses/ca*100:0}
    ];
    const insights=[
      `Le canal ${b2cShare>=b2bShare?'B2C':'B2B'} représente ${Math.max(b2cShare,b2bShare).toFixed(1)}% du CA commandé.`,
      `Le panier moyen est de ${(orderCount?ca/orderCount:0).toFixed(2)} DT pour ${orderCount} commande(s).`,
      `Le food cost pèse ${(productRevenue?productCost/productRevenue*100:0).toFixed(1)}% du CA produit.`,
      `La marge nette représente ${(ca?netMargin/ca*100:0).toFixed(1)}% du CA.`,
      bestDay?`Meilleur jour : ${formatDay(bestDay.date)} avec ${bestDay.ca.toFixed(2)} DT de CA.`:'Aucune journée active sur la période.'
    ];

    const sharedCosts={fixed:fixedExpenses,marketing:marketingExpenses,otherVariable:otherVariableExpenses};
    const totalMetrics=channelReportMetrics(reportOrders,reportSales,sharedCosts,ca);
    const b2cMetrics=channelReportMetrics(reportOrders.filter(order=>order.canal==='B2C'),reportSales,sharedCosts,ca);
    const b2bMetrics=channelReportMetrics(reportOrders.filter(order=>order.canal==='B2B'),reportSales,sharedCosts,ca);

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
      channels:{total:totalMetrics,b2c:b2cMetrics,b2b:b2bMetrics},
      elapsedDays,activeDays,avgDailyCa,bestDay,isCurrentMonth,monthEnd,projectedCa,b2cShare,b2bShare,costStructure,insights,
      daily
    };
  }, [monthlyReportMonth, orders, sales, financeEntries]);

  const dailyRows = useMemo(() => {
    const byDay={};
    const allOrderIds=new Set(orderedOrdersAll.map(order=>order.id));
    const unitsByOrder={};
    sales.forEach(sale=>{
      if(!allOrderIds.has(sale.order_id)) return;
      unitsByOrder[sale.order_id]=(unitsByOrder[sale.order_id]||0)+Number(sale.qty||0);
    });

    orderedOrdersAll.forEach(order=>{
      const date=String(order.created_at || '').slice(0,10);
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
  }, [orderedOrdersAll, sales]);

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

    <div className="performance-overview">
      <div className="performance-hero">
        <small>CA commandé sur la période</small><strong>{stats.ca.toFixed(2)} DT</strong>
        <span>{stats.orderCount} commandes · PM {stats.averageBasket.toFixed(2)} DT</span>
      </div>
      <div className={`performance-hero ${stats.netOperatingMargin!=null&&stats.netOperatingMargin<0?'negative':'positive'}`}>
        <small>Marge nette</small><strong>{stats.netOperatingMargin==null?'—':`${stats.netOperatingMargin.toFixed(2)} DT`}</strong>
        <span>{stats.netOperatingMargin==null?'Vue canal : charges communes non ventilées':`${stats.netOperatingMarginRate.toFixed(1)}% du CA`}</span>
      </div>
    </div>

    <PerformanceGroup title="Ventes" hint="Volume, panier et prix">
      <PerfKpi label="Commandes" value={stats.orderCount} sub="commandées"/>
      <PerfKpi label="IDV" value={stats.idv.toFixed(2)} sub={`${stats.units} unités vendues`}/>
      <PerfKpi label="PM" value={`${stats.averageBasket.toFixed(2)} DT`} sub="par commande"/>
      <PerfKpi label="PVM" value={`${stats.averageSellingPrice.toFixed(2)} DT`} sub="par unité"/>
      <PerfKpi label="Remise" value={`${stats.discountRate.toFixed(1)}%`} sub={`${stats.discount.toFixed(2)} DT`} tone="warning"/>
    </PerformanceGroup>

    <PerformanceGroup title="Clients" hint="Taille et fidélité de la clientèle">
      <PerfKpi label="Clients acheteurs" value={stats.customerCount} sub="clients identifiés"/>
      <PerfKpi label="Fréquence" value={stats.purchaseFrequency.toFixed(2)} sub="commandes / client"/>
      <PerfKpi label="Clients récurrents" value={stats.repeatCustomers} sub={`${stats.repeatRate.toFixed(1)}% des clients`}/>
    </PerformanceGroup>

    <PerformanceGroup title="Coûts" hint="Montant et poids dans l'activité">
      <PerfKpi label="Food cost" value={`${stats.productCost.toFixed(2)} DT`} sub={`${stats.foodCostRate.toFixed(1)}% du CA produit`}/>
      <PerfKpi label="Livraison" value={`${stats.deliveryCost.toFixed(2)} DT`} sub={`${stats.deliveryCostRate.toFixed(1)}% du CA`}/>
      <PerfKpi label="Marketing" value={`${stats.marketingExpenses.toFixed(2)} DT`} sub={`${stats.marketingCostRate.toFixed(1)}% du CA`} tone="warning"/>
      <PerfKpi label="Autres variables" value={`${stats.otherVariableExpenses.toFixed(2)} DT`} sub={`${stats.otherVariableCostRate.toFixed(1)}% du CA`}/>
      <PerfKpi label="Coûts fixes" value={`${stats.fixedExpenses.toFixed(2)} DT`} sub={`${stats.fixedCostRate.toFixed(1)}% du CA`}/>
      <PerfKpi label="Charges exploitation" value={`${stats.operatingExpenses.toFixed(2)} DT`} sub={`${stats.operatingCostRate.toFixed(1)}% du CA`}/>
    </PerformanceGroup>

    <PerformanceGroup title="Rentabilité" hint="Ce qu'il reste après les coûts">
      <PerfKpi label="MACV" value={`${stats.productMargin.toFixed(2)} DT`} sub={`Tx marque ${stats.markRate.toFixed(1)}%`} tone="success"/>
      <PerfKpi label="Marge contributive" value={`${stats.contributionMargin.toFixed(2)} DT`} sub="après coûts variables" tone={stats.contributionMargin>=0?'success':'danger'}/>
      <PerfKpi label="Marge nette" value={stats.netOperatingMargin==null?'—':`${stats.netOperatingMargin.toFixed(2)} DT`} sub={stats.netOperatingMargin==null?'charges communes non ventilées':`${stats.netOperatingMarginRate.toFixed(1)}% du CA`} tone={stats.netOperatingMargin!=null?(stats.netOperatingMargin>=0?'success':'danger'):null}/>
      <PerfKpi label="À encaisser" value={`${stats.receivable.toFixed(2)} DT`} sub={`encaissé ${stats.paid.toFixed(2)} DT`}/>
    </PerformanceGroup>

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
          <div><h1>RAPPORT MENSUEL DE PERFORMANCE</h1><strong>{monthlyReport.label}</strong><span>Période : {formatDay(monthlyReport.from)} → {formatDay(monthlyReport.to)}</span><span>Inside · Cookieside</span></div>
        </div>

        <section className="performance-report-analytics">
          <div className="performance-report-analytics-head">
            <div><small>Rythme CA</small><strong>{monthlyReport.avgDailyCa.toFixed(2)} DT / jour</strong><span>{monthlyReport.activeDays} jour(s) actif(s) sur {monthlyReport.elapsedDays}</span></div>
            <div><small>Mix CA</small><strong>B2C {monthlyReport.b2cShare.toFixed(1)}% · B2B {monthlyReport.b2bShare.toFixed(1)}%</strong><span>CA commandé par canal</span></div>
            <div><small>Meilleur jour</small><strong>{monthlyReport.bestDay?monthlyReport.bestDay.ca.toFixed(2)+' DT':'—'}</strong><span>{monthlyReport.bestDay?formatDay(monthlyReport.bestDay.date):'Aucune activité'}</span></div>
            <div><small>{monthlyReport.isCurrentMonth&&monthlyReport.to<monthlyReport.monthEnd?'Projection fin de mois':'CA période'}</small><strong>{monthlyReport.projectedCa.toFixed(2)} DT</strong><span>{monthlyReport.isCurrentMonth&&monthlyReport.to<monthlyReport.monthEnd?'projection au rythme actuel':'réalisé sur la période'}</span></div>
          </div>
          <div className="performance-report-insights">
            <h2>Lecture analytique</h2>
            {monthlyReport.insights.map((insight,index)=><p key={index}>• {insight}</p>)}
          </div>
          <div className="performance-report-costmix">
            <h2>Structure des coûts</h2>
            {monthlyReport.costStructure.map(item=><div key={item.label}><span>{item.label}</span><div><i style={{width:`${Math.min(100,item.rate)}%`}}/></div><strong>{item.rate.toFixed(1)}%</strong><em>{item.value.toFixed(2)} DT</em></div>)}
          </div>
        </section>

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

        <section className="performance-report-compare">
          <h2>Total vs B2C vs B2B</h2>
          <table><thead><tr><th>Indicateur</th><th>Total</th><th>B2C</th><th>B2B</th></tr></thead>
          <tbody>
            <tr><td>CA</td><td>{monthlyReport.channels.total.ca.toFixed(2)} DT</td><td>{monthlyReport.channels.b2c.ca.toFixed(2)} DT</td><td>{monthlyReport.channels.b2b.ca.toFixed(2)} DT</td></tr>
            <tr><td>Commandes</td><td>{monthlyReport.channels.total.orders}</td><td>{monthlyReport.channels.b2c.orders}</td><td>{monthlyReport.channels.b2b.orders}</td></tr>
            <tr><td>Clients</td><td>{monthlyReport.channels.total.customers}</td><td>{monthlyReport.channels.b2c.customers}</td><td>{monthlyReport.channels.b2b.customers}</td></tr>
            <tr><td>Fréquence</td><td>{monthlyReport.channels.total.frequency.toFixed(2)}</td><td>{monthlyReport.channels.b2c.frequency.toFixed(2)}</td><td>{monthlyReport.channels.b2b.frequency.toFixed(2)}</td></tr>
            <tr><td>IDV</td><td>{monthlyReport.channels.total.idv.toFixed(2)}</td><td>{monthlyReport.channels.b2c.idv.toFixed(2)}</td><td>{monthlyReport.channels.b2b.idv.toFixed(2)}</td></tr>
            <tr><td>PM</td><td>{monthlyReport.channels.total.pm.toFixed(2)} DT</td><td>{monthlyReport.channels.b2c.pm.toFixed(2)} DT</td><td>{monthlyReport.channels.b2b.pm.toFixed(2)} DT</td></tr>
            <tr><td>PVM</td><td>{monthlyReport.channels.total.pvm.toFixed(2)} DT</td><td>{monthlyReport.channels.b2c.pvm.toFixed(2)} DT</td><td>{monthlyReport.channels.b2b.pvm.toFixed(2)} DT</td></tr>
            <tr><td>Tx remise</td><td>{monthlyReport.channels.total.discountRate.toFixed(1)}%</td><td>{monthlyReport.channels.b2c.discountRate.toFixed(1)}%</td><td>{monthlyReport.channels.b2b.discountRate.toFixed(1)}%</td></tr>
            <tr><td>Food cost</td><td>{monthlyReport.channels.total.foodCostRate.toFixed(1)}%</td><td>{monthlyReport.channels.b2c.foodCostRate.toFixed(1)}%</td><td>{monthlyReport.channels.b2b.foodCostRate.toFixed(1)}%</td></tr>
            <tr><td>Marge nette*</td><td>{monthlyReport.channels.total.netMargin.toFixed(2)} DT</td><td>{monthlyReport.channels.b2c.netMargin.toFixed(2)} DT</td><td>{monthlyReport.channels.b2b.netMargin.toFixed(2)} DT</td></tr>
          </tbody></table>
          <p>* Les charges communes B2C/B2B sont ventilées au prorata du CA du canal.</p>
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
          {monthlyReport.daily.length===0?<p>Aucune commande non annulée sur ce mois.</p>:
          <table><thead><tr><th>Date</th><th>CA</th><th>Commandes</th><th>Unités</th><th>Marge après livraison</th></tr></thead>
          <tbody>{monthlyReport.daily.map(row=><tr key={row.date}><td>{formatDay(row.date)}</td><td>{row.ca.toFixed(2)} DT</td><td>{row.orders}</td><td>{row.units}</td><td>{row.margin.toFixed(2)} DT</td></tr>)}</tbody></table>}
        </section>

        <div className="performance-report-footer">Rapport généré depuis Inside · commandes non annulées et écritures Finance du mois.</div>
      </div>
    </Modal>

    <div className="card">
      <div className="card-header"><div><div className="card-title">Performance journalière</div><div className="form-hint">CA commandé par jour · total, B2C et B2B · commandes non annulées</div></div></div>
      {dailyRows.length===0 ? <div className="empty-inline" style={{padding:'2rem'}}>Aucune commande sur cette période.</div> :
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


function PerformanceGroup({title,hint,children}) {
  return <section className="performance-group"><div className="performance-group-head"><div><h3>{title}</h3><small>{hint}</small></div></div><div className="performance-kpi-grid">{children}</div></section>;
}
function PerfKpi({label,value,sub,tone}) {
  return <div className={`performance-kpi ${tone||''}`}><small>{label}</small><strong>{value}</strong>{sub&&<span>{sub}</span>}</div>;
}
