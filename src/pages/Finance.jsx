import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { attachmentsAPI, financeAPI } from '../lib/api';
import { LoadingScreen, Modal, SectionHeader } from '../components/UI';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = days => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
};
const CATEGORIES = {
  expense: ['Achats matières', 'Consommables · Hygiène et nettoyage', 'Consommables · Production', 'Consommables · Emballages', 'Consommables · Bureau et divers', 'Loyer', 'Énergie', 'Transport', 'Marketing', 'Services', 'Salaires', 'Autre charge'],
  investment: ['Matériel de production', 'Mobilier', 'Informatique', 'Aménagement', 'Véhicule', 'Autre investissement']
};
const FIXED_CATEGORIES = ['Loyer','Salaires'];
const emptyForm = type => ({ entry_type:type, category:CATEGORIES[type][0], cost_nature:'variable', label:'', amount:'', entry_date:today(), payment_status:'paid', paid_at:today(), supplier:'', notes:'' });
const inPeriod = (date, dates) => {
  const value = String(date || '').slice(0, 10);
  return value && (!dates.from || value >= dates.from) && (!dates.to || value <= dates.to);
};
const formatDate = date => date.toISOString().slice(0,10);
const monthRange = offset => {
  const now=new Date();
  const first=new Date(now.getFullYear(),now.getMonth()+offset,1);
  const last=offset===0 ? now : new Date(now.getFullYear(),now.getMonth()+offset+1,0);
  return {from:formatDate(first),to:formatDate(last)};
};
const weekRange = offset => {
  const now=new Date();
  const day=now.getDay() || 7;
  const monday=new Date(now);
  monday.setDate(now.getDate()-day+1+(offset*7));
  const sunday=new Date(monday);
  sunday.setDate(monday.getDate()+6);
  return {from:formatDate(monday),to:formatDate(sunday)};
};
const isMarketingOrder = order => {
  const label=String(order.promo_label || '').toLowerCase();
  const notes=String(order.notes || '').toLowerCase();
  return label.includes('photo') || label.includes('marketing') || notes.includes('photo image') || notes.includes('opération marketing');
};

export default function Finance({ sales = [], orders = [], loading }) {
  const [tab, setTab] = useState('result');
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [dates, setDates] = useState({ from:daysAgo(30), to:today() });
  const [channel, setChannel] = useState('all');
  const [modalType, setModalType] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(emptyForm('expense'));
  const [saving, setSaving] = useState(false);
  const [attachment,setAttachment]=useState(null);

  const loadEntries = async () => {
    setEntriesLoading(true);
    try { setEntries(await financeAPI.getAll()); }
    catch (error) { toast.error(error.message); }
    finally { setEntriesLoading(false); }
  };
  useEffect(() => { loadEntries(); }, []);

  const filteredEntries = useMemo(() => entries.filter(entry => inPeriod(entry.entry_date, dates)), [entries, dates]);
  const receivedPurchases = useMemo(() => filteredEntries.filter(entry => entry.entry_type === 'expense' && (entry.category === 'Achats matières' || entry.category.startsWith('Consommables ·'))), [filteredEntries]);
  const receivedPurchasesTotal = useMemo(() => receivedPurchases.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), [receivedPurchases]);

  const recognizedOrders = useMemo(() => orders.filter(order =>
    order.status !== 'Annulée' &&
    (channel === 'all' || order.canal === channel) &&
    inPeriod(order.created_at, dates)
  ), [orders, dates, channel]);
  const pendingOrders = useMemo(() => orders.filter(order =>
    ['Vendu','Prête'].includes(order.status) &&
    (channel === 'all' || order.canal === channel) &&
    inPeriod(order.delivery_date || order.created_at, dates)
  ), [orders, dates, channel]);
  const recognizedOrderIds = useMemo(() => new Set(recognizedOrders.map(order=>order.id)), [recognizedOrders]);
  const recognizedSales = useMemo(() => sales.filter(sale => recognizedOrderIds.has(sale.order_id)), [sales, recognizedOrderIds]);
  const paidOrders = useMemo(() => orders.filter(order =>
    order.status === 'Payé' &&
    (channel === 'all' || order.canal === channel) &&
    inPeriod(order.paid_at || order.delivered_at || order.delivery_date || order.created_at, dates)
  ), [orders, dates, channel]);

  const stats = useMemo(() => {
    const revenue = recognizedOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const discounts = recognizedOrders.reduce((sum,row)=>sum+Number(row.discount_amount||0),0);
    const productRevenue = recognizedSales.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const productMargin = recognizedSales.reduce((sum,row)=>sum+Number(row.margin||0),0);
    const materialCost = recognizedSales.reduce((sum,row)=>sum+Math.max(0,Number(row.total_amount||0)-Number(row.margin||0)),0);

    const deliveryRevenue = recognizedOrders.reduce((sum,row)=>sum+Number(row.delivery_fee||0),0);
    const deliveryCost = recognizedOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const freeDeliveryCost = recognizedOrders.filter(row=>row.free_delivery).reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const deliveryNet = deliveryRevenue-deliveryCost;
    const pendingDeliveryCost = pendingOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const pendingFreeDeliveryCost = pendingOrders.filter(row=>row.free_delivery).reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);

    const grossMargin = recognizedOrders.reduce((sum,row)=>sum+Number(row.margin||0),0);

    const marketingOrders = recognizedOrders.filter(isMarketingOrder);
    const marketingIds = new Set(marketingOrders.map(row=>row.id));
    const marketingMaterialCost = recognizedSales.filter(row=>marketingIds.has(row.order_id))
      .reduce((sum,row)=>sum+Math.max(0,Number(row.total_amount||0)-Number(row.margin||0)),0);
    const marketingDeliveryCost = marketingOrders.reduce((sum,row)=>sum+Number(row.delivery_cost||0),0);
    const marketingProductCost = marketingMaterialCost+marketingDeliveryCost;

    const operatingEntries = filteredEntries.filter(e => e.entry_type === 'expense' && e.category !== 'Achats matières');
    const fixedEntries = operatingEntries.filter(e => e.cost_nature === 'fixed');
    const fixedExpenses = fixedEntries.reduce((sum,e)=>sum+Number(e.amount||0),0);
    const rentExpenses = fixedEntries.filter(e=>e.category==='Loyer').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const salaryExpenses = fixedEntries.filter(e=>e.category==='Salaires').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const otherFixedExpenses = Math.max(0,fixedExpenses-rentExpenses-salaryExpenses);
    const variableExpenses = operatingEntries.filter(e => e.cost_nature !== 'fixed').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const marketingExpenses = operatingEntries.filter(e=>e.category==='Marketing').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const operatingExpenses = fixedExpenses + variableExpenses;
    const investments = filteredEntries.filter(e => e.entry_type === 'investment').reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const paidEntries = entries.filter(e => e.payment_status === 'paid' && inPeriod(e.paid_at || e.entry_date, dates));
    const cashIn = paidOrders.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
    const cashOut = paidEntries.reduce((sum,e)=>sum+Number(e.amount||0),0);

    const contributionMargin = grossMargin-variableExpenses;
    const contributionRate = revenue>0?contributionMargin/revenue:0;
    const breakEvenRevenue = contributionRate>0?fixedExpenses/contributionRate:0;
    const marginRate = materialCost>0?grossMargin/materialCost*100:0;
    const markupRate = revenue>0?grossMargin/revenue*100:0;
    const days=Math.max(1,Math.round((new Date(`${dates.to||today()}T12:00:00`)-new Date(`${dates.from||dates.to||today()}T12:00:00`))/86400000)+1);
    const breakEvenDays=revenue>0&&breakEvenRevenue>0?Math.ceil(days*breakEvenRevenue/revenue):0;
    const pointMort=breakEvenDays?new Date(new Date(`${dates.from||dates.to||today()}T12:00:00`).getTime()+(breakEvenDays-1)*86400000):null;
    const operatingResult = channel==='all' ? grossMargin-operatingExpenses : null;

    return {
      revenue,discounts,productRevenue,productMargin,materialCost,
      deliveryRevenue,deliveryCost,freeDeliveryCost,deliveryNet,pendingDeliveryCost,pendingFreeDeliveryCost,grossMargin,
      marketingMaterialCost,marketingDeliveryCost,marketingProductCost,marketingExpenses,totalMarketingCost:channel==='all'?marketingProductCost+marketingExpenses:marketingProductCost,
      fixedExpenses,rentExpenses,salaryExpenses,otherFixedExpenses,variableExpenses,operatingExpenses,investments,
      contributionMargin,contributionRate,breakEvenRevenue,marginRate,markupRate,
      breakEvenDays,pointMort,periodDays:days,operatingResult,
      cashIn,cashOut,netCashFlow:channel==='all'?cashIn-cashOut:null,
      deliveredOrders:recognizedOrders.length,freeDeliveryOrders:recognizedOrders.filter(row=>row.free_delivery).length,
      marketingOrders:marketingOrders.length
    };
  }, [recognizedOrders, recognizedSales, pendingOrders, paidOrders, filteredEntries, entries, dates, channel]);

  const openCreate = type => { setEditId(null); setForm(emptyForm(type)); setAttachment(null); setModalType(type); };
  const openEdit = entry => {
    setEditId(entry.id);
    setForm({ entry_type:entry.entry_type, category:entry.category, cost_nature:entry.cost_nature || 'variable', label:entry.label, amount:String(entry.amount), entry_date:entry.entry_date, payment_status:entry.payment_status || 'paid', paid_at:entry.paid_at || entry.entry_date, supplier:entry.supplier || '', notes:entry.notes || '' });
    setModalType(entry.entry_type);
  };
  const closeModal = () => { setModalType(null); setEditId(null); };
  const save = async () => {
    if (!form.label.trim() || !form.category || Number(form.amount) <= 0) return toast.error('Libellé, catégorie et montant sont requis');
    setSaving(true);
    const payload = { ...form, amount:Number(form.amount), paid_at:form.payment_status === 'paid' ? (form.paid_at || form.entry_date) : null, supplier:form.supplier.trim() || null, notes:form.notes.trim() || null };
    try {
      const saved=editId ? await financeAPI.update(editId, payload) : await financeAPI.create(payload);
      if(attachment&&saved?.id)await attachmentsAPI.upload(modalType==='investment'?'investment':'finance_entry',saved.id,attachment);
      toast.success(editId ? 'Écriture modifiée' : modalType === 'expense' ? 'Charge ajoutée' : 'Investissement ajouté');
      closeModal(); await loadEntries();
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  const archive = async entry => {
    if (!window.confirm(`Annuler l’écriture « ${entry.label} » ? Elle ne sera plus prise en compte.`)) return;
    try { await financeAPI.archive(entry.id); toast.success('Écriture annulée'); await loadEntries(); }
    catch (error) { toast.error(error.message); }
  };
  const openAttachment=async entry=>{try{const files=await attachmentsAPI.getFor(entry.entry_type==='investment'?'investment':'finance_entry',entry.id);if(!files.length)return toast('Aucun justificatif');const url=await attachmentsAPI.signedUrl(files[0].storage_path);window.open(url,'_blank','noopener,noreferrer');}catch(error){toast.error(error.message);}};
  const list = type => filteredEntries.filter(entry => entry.entry_type === type);

  if (loading || entriesLoading) return <LoadingScreen />;
  return <div className="page-inner">
    <SectionHeader title="Finance" subtitle="CA commandé, marges, livraison, marketing, charges et trésorerie" />
    <div className="finance-tabs">
      <button className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>Synthèse</button>
      <button className={tab === 'expense' ? 'active' : ''} onClick={() => setTab('expense')}>Charges</button>
      <button className={tab === 'investment' ? 'active' : ''} onClick={() => setTab('investment')}>Investissements</button>
    </div>
    <div className="finance-period card finance-filter-card"><div><label className="form-label">Du</label><input className="form-input" type="date" value={dates.from} onChange={e => setDates(v => ({...v, from:e.target.value}))} /></div><div><label className="form-label">Au</label><input className="form-input" type="date" value={dates.to} onChange={e => setDates(v => ({...v, to:e.target.value}))} /></div><div className="finance-period-shortcuts">
  <button className="btn btn-sm" onClick={() => setDates(monthRange(0))}>M</button>
  <button className="btn btn-sm" onClick={() => setDates(monthRange(-1))}>M-1</button>
  <button className="btn btn-sm" onClick={() => setDates(weekRange(0))}>S</button>
  <button className="btn btn-sm" onClick={() => setDates(weekRange(-1))}>S-1</button>
  <button className="btn btn-sm" onClick={() => setDates({from:daysAgo(30),to:today()})}>30 jours</button>
  <button className="btn btn-sm" onClick={() => setDates({from:'',to:today()})}>Tout</button>
</div><div><label className="form-label">Canal</label><div className="finance-period-shortcuts">
  <button className={`btn btn-sm ${channel==='all'?'btn-primary':''}`} onClick={()=>setChannel('all')}>Tous</button>
  <button className={`btn btn-sm ${channel==='B2C'?'btn-primary':''}`} onClick={()=>setChannel('B2C')}>B2C</button>
  <button className={`btn btn-sm ${channel==='B2B'?'btn-primary':''}`} onClick={()=>setChannel('B2B')}>B2B</button>
</div></div></div>

    {tab === 'result' && <>
      <div className="finance-overview">
        <div className="finance-overview-card primary"><small>CA commandé</small><strong>{stats.revenue.toFixed(2)} DT</strong><span>{stats.deliveredOrders} commandes</span></div>
        <div className={`finance-overview-card ${(channel==='all'?stats.operatingResult:stats.grossMargin)>=0?'positive':'negative'}`}><small>{channel==='all'?'Résultat exploitation':'Contribution canal'}</small><strong>{(channel==='all'?stats.operatingResult:stats.grossMargin).toFixed(2)} DT</strong><span>{channel==='all'?'après charges d’exploitation':'avant charges communes'}</span></div>
        <div className="finance-overview-card"><small>Marge après livraison</small><strong>{stats.grossMargin.toFixed(2)} DT</strong><span>{stats.revenue>0?(stats.grossMargin/stats.revenue*100).toFixed(1):'0.0'}% du CA</span></div>
        <div className="finance-overview-card"><small>Charges exploitation</small><strong>{stats.operatingExpenses.toFixed(2)} DT</strong><span>{stats.revenue>0?(stats.operatingExpenses/stats.revenue*100).toFixed(1):'0.0'}% du CA</span></div>
      </div>

      <FinanceSection title="Ventes" hint={`${stats.deliveredOrders} commande(s) non annulée(s)`}>
        <FinanceKpi label="CA commandé" value={stats.revenue} />
        <FinanceKpi label="Remises accordées" value={stats.discounts} tone={stats.discounts>0?'warning':null} />
        <FinanceKpi label="Coût matières vendu/offert" value={stats.materialCost} />
        <FinanceKpi label="Marge produits" value={stats.productMargin} tone={stats.productMargin<0?'danger':'success'} />
      </FinanceSection>

      <FinanceSection title="Livraison" hint="Coût automatique des commandes · ne pas ressaisir en charge Transport">
        <FinanceKpi label="Livraison facturée" value={stats.deliveryRevenue} />
        <FinanceKpi label="Coût livraison Inside" value={stats.deliveryCost} tone={stats.deliveryCost>0?'warning':null} />
        <FinanceKpi label="Dont livraison offerte" value={stats.freeDeliveryCost} sub={`${stats.freeDeliveryOrders} commande(s)`} tone={stats.freeDeliveryCost>0?'danger':null} />
        <FinanceKpi label="Impact net livraison" value={stats.deliveryNet} tone={stats.deliveryNet<0?'danger':'success'} signed />
        <FinanceKpi label="Coût livraison engagé" value={stats.pendingDeliveryCost} sub={stats.pendingFreeDeliveryCost>0?`dont ${stats.pendingFreeDeliveryCost.toFixed(2)} DT offerts`:'Commandes à préparer / prêtes'} tone={stats.pendingDeliveryCost>0?'warning':null} />
      </FinanceSection>

      <FinanceSection title="Marketing" hint="Produits offerts / shooting + dépenses marketing saisies">
        <FinanceKpi label="Coût produits marketing" value={stats.marketingProductCost} sub={`${stats.marketingOrders} opération(s)`} tone={stats.marketingProductCost>0?'warning':null} />
        <FinanceKpi label="Dont matières marketing" value={stats.marketingMaterialCost} />
        <FinanceKpi label={channel==='all'?'Dépenses marketing':'Dépenses marketing communes'} value={stats.marketingExpenses} sub={channel==='all'?null:'Non ventilées B2C/B2B'} />
        <FinanceKpi label={channel==='all'?'Coût marketing total':'Coût marketing du canal'} value={stats.totalMarketingCost} tone={stats.totalMarketingCost>0?'danger':null} />
      </FinanceSection>

      <FinanceSection title="Charges d’exploitation" hint={channel==='all'?'Séparation claire entre charges fixes et charges variables':'Charges communes non ventilées par canal'}>
        <FinanceKpi label="Loyer · fixe" value={stats.rentExpenses} />
        <FinanceKpi label="Salaires · fixe" value={stats.salaryExpenses} />
        {stats.otherFixedExpenses>0 && <FinanceKpi label="Autres charges fixes" value={stats.otherFixedExpenses} />}
        <FinanceKpi label="Charges variables" value={stats.variableExpenses} />
        <FinanceKpi label="Total charges fixes" value={stats.fixedExpenses} />
      </FinanceSection>

      <FinanceSection title="Résultat & trésorerie" hint="La marge après livraison inclut déjà les coûts produits offerts et les livraisons">
        <FinanceKpi label="Marge après livraison" value={stats.grossMargin} tone={stats.grossMargin<0?'danger':'success'} />
        <FinanceKpi label="Charges d’exploitation" value={stats.operatingExpenses} />
        <FinanceKpi label="Investissements" value={stats.investments} />
        <FinanceKpi label={channel==='all'?"Résultat exploitation":"Contribution du canal"} value={channel==='all'?stats.operatingResult:stats.grossMargin} sub={channel==='all'?null:'Avant charges communes'} tone={(channel==='all'?stats.operatingResult:stats.grossMargin)<0?'danger':'success'} />
      </FinanceSection>

      <div className="finance-results">
        <div className={(channel==='all'?stats.operatingResult:stats.grossMargin) >= 0 ? 'positive' : 'negative'}><span>{channel==='all'?"Résultat d'exploitation":"Contribution du canal"}<small>{channel==='all'?'Marge après livraison − autres charges d’exploitation':'Marge après livraison · charges communes non allouées'}</small></span><strong>{(channel==='all'?stats.operatingResult:stats.grossMargin).toFixed(2)} DT</strong></div>
        <div className={channel==='all'?(stats.netCashFlow >= 0 ? 'positive' : 'negative'):'positive'}><span>{channel==='all'?'Flux net de trésorerie':'Encaissements du canal'}<small>{channel==='all'?stats.cashIn.toFixed(2)+' encaissés − '+stats.cashOut.toFixed(2)+' payés':'Charges communes non ventilées'}</small></span><strong>{channel==='all'?stats.netCashFlow.toFixed(2):stats.cashIn.toFixed(2)} DT</strong></div>
      </div>

      <div className="card finance-bridge">
        <div className="card-header"><div><div className="card-title">Pont de marge</div><div className="form-hint">Comprendre où part la valeur créée</div></div></div>
        <div className="finance-bridge-grid">
          <span><small>CA produits</small><strong>{stats.productRevenue.toFixed(2)} DT</strong></span>
          <b>−</b><span><small>Coût matières</small><strong>{stats.materialCost.toFixed(2)} DT</strong></span>
          <b>+</b><span><small>Livraison facturée</small><strong>{stats.deliveryRevenue.toFixed(2)} DT</strong></span>
          <b>−</b><span><small>Coût livraison</small><strong>{stats.deliveryCost.toFixed(2)} DT</strong></span>
          <b>=</b><span className={stats.grossMargin>=0?'positive':'negative'}><small>Marge après livraison</small><strong>{stats.grossMargin.toFixed(2)} DT</strong></span>
        </div>
      </div>

      {channel==='all' && <div className="card break-even-card">
        <div className="break-even-head"><div><small>Seuil de rentabilité</small><strong>{stats.breakEvenRevenue>0?`${stats.breakEvenRevenue.toFixed(2)} DT`:'Non calculable'}</strong><span>CA nécessaire pour couvrir les charges fixes</span></div><div className={stats.revenue>=stats.breakEvenRevenue&&stats.breakEvenRevenue>0?'reached':'pending'}><small>{stats.breakEvenRevenue>0&&stats.revenue>=stats.breakEvenRevenue?'Seuil atteint':'CA restant'}</small><strong>{stats.breakEvenRevenue>0?`${Math.max(0,stats.breakEvenRevenue-stats.revenue).toFixed(2)} DT`:'—'}</strong></div></div>
        <div className="break-even-progress"><span style={{width:`${stats.breakEvenRevenue>0?Math.min(100,stats.revenue/stats.breakEvenRevenue*100):0}%`}}/></div>
        <div className="break-even-details"><span><small>Point mort estimé</small><b>{stats.pointMort?stats.pointMort.toLocaleDateString('fr-FR'):'—'}</b></span><span><small>Jours estimés</small><b>{stats.breakEvenDays||'—'} / {stats.periodDays}</b></span><span><small>Marge contributive</small><b>{stats.contributionMargin.toFixed(2)} DT</b></span></div>
      </div>}

      <div className="finance-note">{channel==='all'?'Les coûts matières des produits offerts (ex. shooting photo) et les coûts de livraison sont intégrés automatiquement dans la marge des commandes. Les achats de matières affectent la trésorerie mais ne sont pas redéduits du résultat. Évite de saisir à nouveau les livraisons de commandes dans « Transport » pour ne pas compter deux fois le même coût.':`Vue ${channel} : ventes, marge, livraison, marketing produit et encaissements sont filtrés sur ce canal. Loyer, salaires et autres charges saisies restent communs car aucune clé de répartition B2C/B2B n’est définie.`}</div>

      <div className="card finance-purchases">
        <div className="card-header"><div><div className="card-title">Achats reçus</div><div className="form-hint">Réceptions de matières et consommables sur la période</div></div><button className="btn btn-sm" onClick={() => setTab('expense')}>Voir toutes les charges</button></div>
        <div className="finance-purchases-total"><span>{receivedPurchases.length} réception(s)</span><strong>{receivedPurchasesTotal.toFixed(2)} DT</strong></div>
        {receivedPurchases.length === 0 ? <div className="empty-inline">Aucun achat reçu sur cette période.</div> : <div>{receivedPurchases.slice(0, 5).map(entry => <article key={entry.id}><div><strong>{entry.label}</strong><small>{entry.category}{entry.supplier ? ` · ${entry.supplier}` : ''}</small></div><time>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</time><strong>{Number(entry.amount).toFixed(2)} DT</strong></article>)}</div>}
      </div>
    </>}

    {tab !== 'result' && <FinanceList type={tab} entries={list(tab)} onAdd={() => openCreate(tab)} onEdit={openEdit} onArchive={archive} onAttachment={openAttachment} />}
    <FinanceModal type={modalType} editId={editId} form={form} setForm={setForm} saving={saving} onClose={closeModal} onSave={save} setAttachment={setAttachment} />
  </div>;
}

function FinanceSection({ title, hint, children }) {
  return <section className="finance-section"><div className="finance-section-head"><div><h3>{title}</h3><small>{hint}</small></div></div><div className="finance-section-grid">{children}</div></section>;
}

function FinanceKpi({ label, value, sub, tone, signed=false }) {
  const prefix=signed&&value>0?'+':'';
  return <div className={`finance-kpi ${tone||''}`}><small>{label}</small><strong>{prefix}{Number(value||0).toFixed(2)} DT</strong>{sub&&<span>{sub}</span>}</div>;
}

function FinanceModal({ type, editId, form, setForm, saving, onClose, onSave, setAttachment }) {
  const title = editId ? (type === 'expense' ? 'Modifier la charge' : "Modifier l’investissement") : (type === 'expense' ? 'Nouvelle charge' : 'Nouvel investissement');
  return <Modal open={!!type} onClose={onClose} title={title} footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? 'Enregistrement...' : editId ? 'Modifier' : 'Enregistrer'}</button></>}>
    <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Libellé *</label><input className="form-input" value={form.label} onChange={e => setForm(v => ({...v,label:e.target.value}))} placeholder={type === 'expense' ? 'Ex : Facture électricité' : 'Ex : Four professionnel'} /></div><div className="form-group"><label className="form-label">Catégorie *</label><select className="form-select" value={form.category} onChange={e => setForm(v => ({...v,category:e.target.value,cost_nature:FIXED_CATEGORIES.includes(e.target.value)?'fixed':'variable'}))}>{(CATEGORIES[type] || []).map(c => <option key={c}>{c}</option>)}</select></div></div>
    {type==='expense'&&<div className="form-group"><label className="form-label">Nature de la charge</label><select className="form-select" value={form.cost_nature} onChange={e=>setForm(v=>({...v,cost_nature:e.target.value}))}><option value="fixed">Fixe · ne dépend pas directement du volume</option><option value="variable">Variable · évolue avec l’activité</option></select><div className="form-hint">Exemples : loyer et salaires = fixes ; emballages et transport = variables.</div></div>}
    <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Montant (DT) *</label><input className="form-input" type="number" min="0" step="0.001" value={form.amount} onChange={e => setForm(v => ({...v,amount:e.target.value}))} /></div><div className="form-group"><label className="form-label">Date de l’écriture *</label><input className="form-input" type="date" value={form.entry_date} onChange={e => setForm(v => ({...v,entry_date:e.target.value,paid_at:v.payment_status === 'paid' ? e.target.value : v.paid_at}))} /></div></div>
    <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Paiement</label><select className="form-select" value={form.payment_status} onChange={e => setForm(v => ({...v,payment_status:e.target.value,paid_at:e.target.value === 'paid' ? (v.paid_at || v.entry_date) : ''}))}><option value="paid">Payé</option><option value="due">À payer</option></select></div>{form.payment_status === 'paid' && <div className="form-group"><label className="form-label">Date de paiement</label><input className="form-input" type="date" value={form.paid_at} onChange={e => setForm(v => ({...v,paid_at:e.target.value}))} /></div>}</div>
    <div className="form-group"><label className="form-label">Fournisseur</label><input className="form-input" value={form.supplier} onChange={e => setForm(v => ({...v,supplier:e.target.value}))} /></div><div className="form-group"><label className="form-label">Note</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm(v => ({...v,notes:e.target.value}))} /></div><div className="form-group"><label className="form-label">Justificatif <span className="form-hint">PDF ou image, 10 Mo max.</span></label><input className="form-input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/></div>
  </Modal>;
}

function FinanceList({ type, entries, onAdd, onEdit, onArchive, onAttachment }) {
  const title = type === 'expense' ? 'Charges' : 'Investissements';
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  if(type==='expense'){
    const fixed=entries.filter(entry=>entry.cost_nature==='fixed');
    const purchases=entries.filter(entry=>entry.category==='Achats matières' || entry.category.startsWith('Consommables ·'));
    const purchaseIds=new Set(purchases.map(entry=>entry.id));
    const variable=entries.filter(entry=>entry.cost_nature!=='fixed' && !purchaseIds.has(entry.id));
    const fixedTotal=fixed.reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const variableTotal=variable.reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const purchasesTotal=purchases.reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const rentTotal=fixed.filter(entry=>entry.category==='Loyer').reduce((sum,entry)=>sum+Number(entry.amount||0),0);
    const salaryTotal=fixed.filter(entry=>entry.category==='Salaires').reduce((sum,entry)=>sum+Number(entry.amount||0),0);

    const renderEntries = rows => rows.length===0
      ? <div className="empty-inline" style={{padding:'1rem'}}>Aucune charge sur cette période.</div>
      : <div>{rows.map(entry => <article key={entry.id}><div className="finance-entry-main"><strong>{entry.label}</strong><small>{entry.category}{entry.supplier ? ` · ${entry.supplier}` : ''}</small></div><time>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</time><div className="finance-entry-amount"><strong>{Number(entry.amount).toFixed(2)} DT</strong><small className={entry.payment_status === 'due' ? 'due' : 'paid'}>{entry.payment_status === 'due' ? 'À payer' : 'Payé'}</small></div><div className="finance-entry-actions"><button className="btn btn-sm" onClick={() => onAttachment(entry)}>Justificatif</button><button className="btn btn-sm" onClick={() => onEdit(entry)}>Modifier</button><button className="btn btn-icon btn-ghost" onClick={() => onArchive(entry)} aria-label={`Annuler ${entry.label}`}>×</button></div></article>)}</div>;

    return <div>
      <div className="card finance-list" style={{marginBottom:12}}>
        <div className="card-header"><div><div className="card-title">Charges fixes</div><div className="form-hint">{fixed.length} écriture(s) · {fixedTotal.toFixed(2)} DT · Loyer {rentTotal.toFixed(2)} DT · Salaires {salaryTotal.toFixed(2)} DT</div></div><button className="btn btn-primary" onClick={onAdd}>＋ Ajouter</button></div>
        {renderEntries(fixed)}
      </div>
      <div className="card finance-list" style={{marginBottom:12}}>
        <div className="card-header"><div><div className="card-title">Charges variables d’exploitation</div><div className="form-hint">{variable.length} écriture(s) · {variableTotal.toFixed(2)} DT</div></div></div>
        {renderEntries(variable)}
      </div>
      <div className="card finance-list">
        <div className="card-header"><div><div className="card-title">Achats matières & consommables</div><div className="form-hint">{purchases.length} écriture(s) · {purchasesTotal.toFixed(2)} DT · suivi trésorerie / stock</div></div></div>
        {renderEntries(purchases)}
      </div>
    </div>;
  }

  return <div className="card finance-list"><div className="card-header"><div><div className="card-title">{title}</div><div className="form-hint">{entries.length} écriture(s) · {total.toFixed(2)} DT</div></div><button className="btn btn-primary" onClick={onAdd}>＋ Ajouter</button></div>
    {entries.length === 0 ? <div className="empty-inline" style={{padding:'2rem'}}>Aucune écriture sur cette période.</div> : <div>{entries.map(entry => <article key={entry.id}><div className="finance-entry-main"><strong>{entry.label}</strong><small>{entry.category}{entry.supplier ? ` · ${entry.supplier}` : ''}</small></div><time>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</time><div className="finance-entry-amount"><strong>{Number(entry.amount).toFixed(2)} DT</strong><small className={entry.payment_status === 'due' ? 'due' : 'paid'}>{entry.payment_status === 'due' ? 'À payer' : 'Payé'}</small></div><div className="finance-entry-actions"><button className="btn btn-sm" onClick={() => onAttachment(entry)}>Justificatif</button><button className="btn btn-sm" onClick={() => onEdit(entry)}>Modifier</button><button className="btn btn-icon btn-ghost" onClick={() => onArchive(entry)} aria-label={`Annuler ${entry.label}`}>×</button></div></article>)}</div>}
  </div>;
}
