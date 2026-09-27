import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { financeAPI } from '../lib/api';
import { LoadingScreen, Modal, SectionHeader } from '../components/UI';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const CATEGORIES = {
  expense: ['Achats matières', 'Loyer', 'Énergie', 'Transport', 'Marketing', 'Services', 'Salaires', 'Autre charge'],
  investment: ['Matériel de production', 'Mobilier', 'Informatique', 'Aménagement', 'Véhicule', 'Autre investissement']
};
const emptyForm = type => ({ entry_type:type, category:CATEGORIES[type][0], label:'', amount:'', entry_date:today(), supplier:'', notes:'' });

export default function Finance({ sales, loading }) {
  const [tab, setTab] = useState('result');
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [dates, setDates] = useState({ from:monthStart(), to:today() });
  const [modalType, setModalType] = useState(null);
  const [form, setForm] = useState(emptyForm('expense'));
  const [saving, setSaving] = useState(false);

  const loadEntries = async () => {
    setEntriesLoading(true);
    try { setEntries(await financeAPI.getAll()); }
    catch (error) { toast.error(error.message); }
    finally { setEntriesLoading(false); }
  };
  useEffect(() => { loadEntries(); }, []);

  const filteredEntries = useMemo(() => entries.filter(entry =>
    (!dates.from || entry.entry_date >= dates.from) && (!dates.to || entry.entry_date <= dates.to)
  ), [entries, dates]);
  const filteredSales = useMemo(() => sales.filter(sale => {
    if (sale.status === 'Annulée') return false;
    const date = String(sale.sold_at || sale.created_at || '').slice(0, 10);
    return (!dates.from || date >= dates.from) && (!dates.to || date <= dates.to);
  }), [sales, dates]);
  const stats = useMemo(() => {
    const revenue = filteredSales.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const grossMargin = filteredSales.reduce((sum, row) => sum + Number(row.margin || 0), 0);
    const expenses = filteredEntries.filter(e => e.entry_type === 'expense').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const investments = filteredEntries.filter(e => e.entry_type === 'investment').reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return { revenue, grossMargin, materialCost:revenue-grossMargin, expenses, investments, operatingResult:grossMargin-expenses, cashResult:grossMargin-expenses-investments };
  }, [filteredSales, filteredEntries]);

  const openCreate = type => { setForm(emptyForm(type)); setModalType(type); };
  const save = async () => {
    if (!form.label.trim() || !form.category || Number(form.amount) <= 0) return toast.error('Libellé, catégorie et montant sont requis');
    setSaving(true);
    try {
      await financeAPI.create({ ...form, amount:Number(form.amount), supplier:form.supplier.trim() || null, notes:form.notes.trim() || null });
      toast.success(modalType === 'expense' ? 'Charge ajoutée' : 'Investissement ajouté');
      setModalType(null); await loadEntries();
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  const remove = async entry => {
    if (!window.confirm(`Supprimer « ${entry.label} » ?`)) return;
    try { await financeAPI.delete(entry.id); toast.success('Écriture supprimée'); await loadEntries(); }
    catch (error) { toast.error(error.message); }
  };
  const list = type => filteredEntries.filter(entry => entry.entry_type === type);

  if (loading || entriesLoading) return <LoadingScreen />;
  return <div className="page-inner">
    <SectionHeader title="Finance" subtitle="Suivre les charges, les investissements et le résultat de l'activité" />
    <div className="finance-tabs">
      <button className={tab === 'result' ? 'active' : ''} onClick={() => setTab('result')}>Résultat</button>
      <button className={tab === 'expense' ? 'active' : ''} onClick={() => setTab('expense')}>Charges</button>
      <button className={tab === 'investment' ? 'active' : ''} onClick={() => setTab('investment')}>Investissements</button>
    </div>
    <div className="finance-period card"><div><label className="form-label">Du</label><input className="form-input" type="date" value={dates.from} onChange={e => setDates(v => ({...v, from:e.target.value}))} /></div><div><label className="form-label">Au</label><input className="form-input" type="date" value={dates.to} onChange={e => setDates(v => ({...v, to:e.target.value}))} /></div></div>

    {tab === 'result' && <>
      <div className="finance-kpis">
        <div><small>Chiffre d'affaires</small><strong>{stats.revenue.toFixed(2)} DT</strong></div>
        <div><small>Coût matières</small><strong>{stats.materialCost.toFixed(2)} DT</strong></div>
        <div><small>Marge brute</small><strong>{stats.grossMargin.toFixed(2)} DT</strong></div>
        <div><small>Charges</small><strong>{stats.expenses.toFixed(2)} DT</strong></div>
        <div><small>Investissements</small><strong>{stats.investments.toFixed(2)} DT</strong></div>
      </div>
      <div className="finance-results">
        <div className={stats.operatingResult >= 0 ? 'positive' : 'negative'}><span>Résultat d'exploitation<small>Marge brute − charges</small></span><strong>{stats.operatingResult.toFixed(2)} DT</strong></div>
        <div className={stats.cashResult >= 0 ? 'positive' : 'negative'}><span>Trésorerie après investissements<small>Résultat − investissements</small></span><strong>{stats.cashResult.toFixed(2)} DT</strong></div>
      </div>
    </>}

    {tab !== 'result' && <FinanceList type={tab} entries={list(tab)} onAdd={() => openCreate(tab)} onDelete={remove} />}

    <Modal open={!!modalType} onClose={() => setModalType(null)} title={modalType === 'expense' ? 'Nouvelle charge' : 'Nouvel investissement'} footer={<><button className="btn" onClick={() => setModalType(null)}>Annuler</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button></>}>
      <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Libellé *</label><input className="form-input" value={form.label} onChange={e => setForm(v => ({...v,label:e.target.value}))} placeholder={modalType === 'expense' ? 'Ex : Facture électricité' : 'Ex : Four professionnel'} /></div><div className="form-group"><label className="form-label">Catégorie *</label><select className="form-select" value={form.category} onChange={e => setForm(v => ({...v,category:e.target.value}))}>{(CATEGORIES[modalType] || []).map(c => <option key={c}>{c}</option>)}</select></div></div>
      <div className="form-row form-row-2"><div className="form-group"><label className="form-label">Montant (DT) *</label><input className="form-input" type="number" min="0" step="0.001" value={form.amount} onChange={e => setForm(v => ({...v,amount:e.target.value}))} /></div><div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={form.entry_date} onChange={e => setForm(v => ({...v,entry_date:e.target.value}))} /></div></div>
      <div className="form-group"><label className="form-label">Fournisseur</label><input className="form-input" value={form.supplier} onChange={e => setForm(v => ({...v,supplier:e.target.value}))} /></div>
      <div className="form-group"><label className="form-label">Note</label><textarea className="form-textarea" value={form.notes} onChange={e => setForm(v => ({...v,notes:e.target.value}))} /></div>
    </Modal>
  </div>;
}

function FinanceList({ type, entries, onAdd, onDelete }) {
  const title = type === 'expense' ? 'Charges' : 'Investissements';
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return <div className="card finance-list"><div className="card-header"><div><div className="card-title">{title}</div><div className="form-hint">{entries.length} écriture(s) · {total.toFixed(2)} DT</div></div><button className="btn btn-primary" onClick={onAdd}>＋ Ajouter</button></div>
    {entries.length === 0 ? <div className="empty-inline" style={{padding:'2rem'}}>Aucune écriture sur cette période.</div> : <div>{entries.map(entry => <article key={entry.id}><div><strong>{entry.label}</strong><small>{entry.category}{entry.supplier ? ` · ${entry.supplier}` : ''}</small></div><time>{new Date(`${entry.entry_date}T12:00:00`).toLocaleDateString('fr-FR')}</time><strong>{Number(entry.amount).toFixed(2)} DT</strong><button className="btn btn-icon btn-ghost" onClick={() => onDelete(entry)} aria-label={`Supprimer ${entry.label}`}>×</button></article>)}</div>}
  </div>;
}
