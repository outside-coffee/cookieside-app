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
const FIXED_CATEGORIES = ['Loyer','Salaires','Services'];
const emptyForm = type => ({ entry_type:type, category:CATEGORIES[type][0], cost_nature:'variable', label:'', amount:'', entry_date:today(), payment_status:'paid', paid_at:today(), supplier:'', notes:'' });
const inPeriod = (date, dates) => {
  const value = String(date || '').slice(0, 10);
  return value && (!dates.from || value >= dates.from) && (!dates.to || value <= dates.to);
};

export default function Finance({ sales, loading }) {
  const [tab, setTab] = useState('result');
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [dates, setDates] = useState({ from:daysAgo(30), to:today() });
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
  const recognizedSales = useMemo(() => sales.filter(sale => ['Livré', 'Payé'].includes(sale.status) && inPeriod(sale.delivered_at || sale.paid_at || sale.sold_at || sale.created_at, dates)), [sales, dates]);
  const paidSales = useMemo(() => sales.filter(sale => sale.status === 'Payé' && inPeriod(sale.paid_at || sale.delivered_at || sale.sold_at || sale.created_at, dates)), [sales, dates]);
  const stats = useMemo(() => {
    const revenue = recognizedSales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const grossMargin = recognizedSales.reduce((sum, row) => sum + Number(row.margin || 0), 0);
    const operatingEntries = filteredEntries.filter(e => e.entry_type === 'expense' && e.category !== 'Achats matières');
    const fixedExpenses = operatingEntries.filter(e => e.cost_nature === 'fixed').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const variableExpenses = operatingEntries.filter(e => e.cost_nature !== 'fixed').reduce((sum,e)=>sum+Number(e.amount||0),0);
    const operatingExpenses = fixedExpenses + variableExpenses;
    const investments = filteredEntries.filter(e => e.entry_type === 'investment').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const paidEntries = entries.filter(e => e.payment_status === 'paid' && inPeriod(e.paid_at || e.entry_date, dates));
    const cashIn = paidSales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const cashOut = paidEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const materialCost=Math.max(0,revenue-grossMargin);
    const contributionMargin=grossMargin-variableExpenses;
    const contributionRate=revenue>0?contributionMargin/revenue:0;
    const breakEvenRevenue=contributionRate>0?fixedExpenses/contributionRate:0;
    const marginRate=materialCost>0?grossMargin/materialCost*100:0;
    const markupRate=revenue>0?grossMargin/revenue*100:0;
    const days=Math.max(1,Math.round((new Date(`${dates.to||today()}T12:00:00`)-new Date(`${dates.from||dates.to||today()}T12:00:00`))/86400000)+1);
    const breakEvenDays=revenue>0&&breakEvenRevenue>0?Math.ceil(days*breakEvenRevenue/revenue):0;
    const pointMort=breakEvenDays?new Date(new Date(`${dates.from||dates.to||today()}T12:00:00`).getTime()+(breakEvenDays-1)*86400000):null;
    return { revenue,grossMargin,materialCost,fixedExpenses,variableExpenses,operatingExpenses,investments,contributionMargin,contributionRate,breakEvenRevenue,marginRate,markupRate,breakEvenDays,pointMort,periodDays:days,operatingResult:contributionMargin-fixedExpenses,cashIn,cashOut,netCashFlow:cashIn-cashOut };
  }, [recognizedSales, paidSales, filteredEntries, entries, dates]);

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
    <SectionHeader title="Finance" subtitle="Suivre les charges, les investissements, le résultat et la trésorerie" />
    <div className="finance-tabs">
      <button className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>Résultat</button>
      <button className={tab === 'expense' ? 'active' : ''} onClick={() => setTab('expense')}>Charges</button>
      <button className={tab === 'investment' ? 'active' : ''} onClick={() => setTab('investment')}>Investissements</button>
    </div>
    <div className="finance-period card"><div><label className="form-label">Du</label><input className="form-input" type="date" value={dates.from} onChange={e => setDates(v => ({...v, from:e.target.value}))} /></div><div><label className="form-label">Au</label><input className="form-input" type="date" value={dates.to} onChange={e => setDates(v => ({...v, to:e.target.value}))} /></div><div className="finance-period-shortcuts"><button className="btn btn-sm" onClick={() => setDates({from:daysAgo(30),to:today()})}>30 jours</button><button className="btn btn-sm" onClick={() => setDates({from:'',to:today()})}>Tout</button></div></div>
    {tab === 'result' && <>
      <div className="finance-kpis">
        <div><small>CA livré</small><strong>{stats.revenue.toFixed(2)} DT</strong></div><div><small>Coût matières</small><strong>{stats.materialCost.toFixed(2)} DT</strong></div><div><small>Marge brute</small><strong>{stats.grossMargin.toFixed(2)} DT</strong></div><div><small>Taux de marge</small><strong>{stats.marginRate.toFixed(1)} %</strong><em>Marge / coût matières</em></div><div><small>Taux de marque</small><strong>{stats.markupRate.toFixed(1)} %</strong><em>Marge / chiffre d’affaires</em></div><div><small>Charges variables</small><strong>{stats.variableExpenses.toFixed(2)} DT</strong></div><div><small>Charges fixes</small><strong>{stats.fixedExpenses.toFixed(2)} DT</strong></div><div><small>Marge contributive</small><strong>{stats.contributionMargin.toFixed(2)} DT</strong><em>{(stats.contributionRate*100).toFixed(1)} % du CA</em></div><div><small>Investissements</small><strong>{stats.investments.toFixed(2)} DT</strong></div>
      </div>
      <div className="finance-results">
        <div className={stats.operatingResult >= 0 ? 'positive' : 'negative'}><span>Résultat d'exploitation<small>Marge brute − charges hors achats matières</small></span><strong>{stats.operatingResult.toFixed(2)} DT</strong></div>
        <div className={stats.netCashFlow >= 0 ? 'positive' : 'negative'}><span>Flux net de trésorerie<small>{stats.cashIn.toFixed(2)} encaissés − {stats.cashOut.toFixed(2)} payés</small></span><strong>{stats.netCashFlow.toFixed(2)} DT</strong></div>
      </div>
      <div className="card break-even-card">
        <div className="break-even-head"><div><small>Seuil de rentabilité</small><strong>{stats.breakEvenRevenue>0?`${stats.breakEvenRevenue.toFixed(2)} DT`:'Non calculable'}</strong><span>CA nécessaire pour couvrir les charges fixes</span></div><div className={stats.revenue>=stats.breakEvenRevenue&&stats.breakEvenRevenue>0?'reached':'pending'}><small>{stats.breakEvenRevenue>0&&stats.revenue>=stats.breakEvenRevenue?'Seuil atteint':'CA restant'}</small><strong>{stats.breakEvenRevenue>0?`${Math.max(0,stats.breakEvenRevenue-stats.revenue).toFixed(2)} DT`:'—'}</strong></div></div>
        <div className="break-even-progress"><span style={{width:`${stats.breakEvenRevenue>0?Math.min(100,stats.revenue/stats.breakEvenRevenue*100):0}%`}}/></div>
        <div className="break-even-details"><span><small>Point mort estimé</small><b>{stats.pointMort?stats.pointMort.toLocaleDateString('fr-FR'):'—'}</b></span><span><small>Jours estimés</small><b>{stats.breakEvenDays||'—'} / {stats.periodDays}</b></span><span><small>Marge sur coûts variables</small><b>{stats.contributionMargin.toFixed(2)} DT</b></span></div>
      </div>
      <div className="finance-note">Le coût matières vient des recettes des ventes livrées. Les achats de matières affectent la trésorerie mais ne sont pas redéduits du résultat. Classez chaque autre charge en fixe ou variable pour fiabiliser le seuil de rentabilité.</div>
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
  return <div className="card finance-list"><div className="card-header"><div><div className="card-title">{title}</div><div className="form-hint">{entries.length} écriture(s) · {total.toFixed(2)} DT</div></div><button className="btn btn-primary" onClick={onAdd}>＋ Ajouter</button></div>
    {entries.length === 0 ? <div className="empty-inline" style={{padding:'2rem'}}>Aucune écriture sur cette période.</div> : <div>{entries.map(entry => <article key={entry.id}><div className="finance-entry-main"><strong>{entry.label}</strong><small>{entry.category}{entry.supplier ? ` · ${entry.supplier}` : ''}</small></div><time>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</time><div className="finance-entry-amount"><strong>{Number(entry.amount).toFixed(2)} DT</strong><small className={entry.payment_status === 'due' ? 'due' : 'paid'}>{entry.payment_status === 'due' ? 'À payer' : 'Payé'}</small></div><div className="finance-entry-actions"><button className="btn btn-sm" onClick={() => onAttachment(entry)}>Justificatif</button><button className="btn btn-sm" onClick={() => onEdit(entry)}>Modifier</button><button className="btn btn-icon btn-ghost" onClick={() => onArchive(entry)} aria-label={`Annuler ${entry.label}`}>×</button></div></article>)}</div>}
  </div>;
}
