import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { LoadingScreen, SectionHeader } from '../components/UI';
import { varietiesAPI } from '../lib/api';
import { batchYield, unitLabel } from '../lib/products';

const hygieneChecks = [
  'Mains lavées, tenue propre, cheveux attachés et bijoux retirés',
  'Plan de travail, balance et ustensiles nettoyés et désinfectés',
  'Matières contrôlées : date, emballage, odeur et température',
  'Allergènes identifiés et risque de contamination croisée maîtrisé',
  'Bacs propres, étiquettes et matériel de traçabilité disponibles'
];

const productionSteps = [
  { title:'Préparer le poste', detail:'Sortir uniquement le matériel nécessaire. Préparer les bacs propres et l’étiquette du lot.' },
  { title:'Peser les matières', detail:'Peser chaque ingrédient séparément selon le tableau. Faire une double vérification avant mélange.' },
  { title:'Réaliser le mélange', detail:'Respecter l’ordre de mélange validé pour le produit. Racler les bords et vérifier l’homogénéité avant de poursuivre.' },
  { title:'Former ou portionner', detail:'Diviser régulièrement selon l’unité du produit. Contrôler le poids de plusieurs pièces pendant le façonnage.' },
  { title:'Cuire ou finaliser', detail:'Appliquer le temps et la température validés dans votre fiche technique. Ne pas improviser un nouveau réglage en production.' },
  { title:'Refroidir et contrôler', detail:'Refroidir sur une zone propre. Vérifier aspect, texture, poids et quantité réellement obtenue.' },
  { title:'Identifier et ranger', detail:'Étiqueter le lot avec produit, date, quantité et opérateur. Ranger selon les conditions de conservation prévues.' },
  { title:'Nettoyer et enregistrer', detail:'Nettoyer le poste, isoler les pertes, puis enregistrer le lot terminé dans Production.' }
];

const getSheet = product => ({
  hygieneChecks:product?.sop_hygiene_checks?.length ? product.sop_hygiene_checks : hygieneChecks,
  steps:product?.sop_steps?.length ? product.sop_steps : productionSteps,
  bakeTemperature:product?.sop_bake_temperature || '',
  bakeMinutes:product?.sop_bake_minutes || '',
  notes:product?.sop_notes || ''
});

export default function RecipeSop({ varieties, loading, onNavigate, onRefresh }) {
  const available = varieties.filter(v => v.product_status !== 'draft');
  const [varietyId, setVarietyId] = useState(available[0]?.id || '');
  const selected = available.find(v => v.id === varietyId) || available[0];
  const [qty, setQty] = useState(selected ? batchYield(selected) : 1);
  const [checked, setChecked] = useState({});
  const [mode, setMode] = useState('use');
  const [sheetForm, setSheetForm] = useState(getSheet(selected));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setSheetForm(getSheet(selected)); }, [selected?.id, selected?.sop_updated_at]);

  const chooseVariety = id => {
    const product = available.find(v => v.id === id);
    setVarietyId(id);
    setQty(product ? batchYield(product) : 1);
    setChecked({});
  };
  const activeHygiene = selected?.sop_hygiene_checks?.length ? selected.sop_hygiene_checks : hygieneChecks;
  const activeSteps = selected?.sop_steps?.length ? selected.sop_steps : productionSteps;
  const saveSheet = async () => {
    if (!selected) return;
    const cleanHygiene = sheetForm.hygieneChecks.map(value => value.trim()).filter(Boolean);
    const cleanSteps = sheetForm.steps.map(step => ({title:step.title.trim(), detail:step.detail.trim()})).filter(step => step.title && step.detail);
    if (!cleanHygiene.length || !cleanSteps.length) return toast.error('Ajoutez au moins une consigne d’hygiène et une étape complète');
    setSaving(true);
    try {
      await varietiesAPI.updateSop(selected.id, {...sheetForm, hygieneChecks:cleanHygiene, steps:cleanSteps});
      await onRefresh();
      toast.success(selected.sop_updated_at ? 'Fiche technique modifiée' : 'Fiche technique créée');
      setMode('use');
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };
  const ingredients = useMemo(() => (selected?.recipes || []).map(recipe => ({
    name:recipe.ingredients?.name || recipe.ingredient_name || 'Ingrédient',
    unit:recipe.ingredients?.unit || 'g',
    quantity:Number(recipe.qty_per_cookie || 0) * Number(qty || 0)
  })), [selected, qty]);

  if (loading) return <LoadingScreen />;
  return <div className="page-inner recipe-sop">
    <SectionHeader title="SOP recettes" subtitle="Créer, modifier et utiliser les fiches techniques de production"
      actions={mode === 'use' ? [<button key="print" className="btn" onClick={() => window.print()}>Imprimer la SOP</button>] : null} />

    <div className="finance-tabs no-print"><button className={mode === 'use' ? 'active' : ''} onClick={() => setMode('use')}>Utiliser la fiche</button><button className={mode === 'manage' ? 'active' : ''} onClick={() => setMode('manage')}>Gérer la fiche technique</button></div>

    <div className="card sop-selector no-print">
      <div className="form-group"><label className="form-label">Produit</label><select className="form-select" value={selected?.id || ''} onChange={e => chooseVariety(e.target.value)}><option value="">Choisir...</option>{available.map(v => <option key={v.id} value={v.id}>{v.product_families?.name || v.family} · {v.name}</option>)}</select></div>
      <div className="form-group"><label className="form-label">Quantité à produire</label><input className="form-input" type="number" min="1" step="1" value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))}/><div className="form-hint">Lot standard : {selected ? batchYield(selected) : 0} {selected ? unitLabel(selected) : 'unités'}</div></div>
    </div>

    {!selected ? <div className="card"><div className="empty-inline" style={{padding:'2rem'}}>Créez d’abord un produit et sa recette.</div></div> : mode === 'manage' ? <TechnicalSheetEditor selected={selected} form={sheetForm} setForm={setSheetForm} saving={saving} onSave={saveSheet} /> : <>
      <div className="sop-sheet-head"><div><small>Fiche de fabrication</small><h2>{selected.name}</h2><span>{qty} {unitLabel(selected)} · {selected.product_families?.name || selected.family || 'Produit'}</span></div><div className="sop-trace"><span>Date : ____ / ____ / ______</span><span>Opérateur : __________________</span><span>Lot : _______________________</span></div></div>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">1. Hygiène avant démarrage</div><div className="form-hint">Toutes les cases doivent être validées avant de peser.</div></div></div>
        <div className="sop-checklist">{activeHygiene.map((label,index) => <label key={`${label}-${index}`}><input type="checkbox" checked={!!checked[`h${index}`]} onChange={e => setChecked(v => ({...v,[`h${index}`]:e.target.checked}))}/><span>{label}</span></label>)}</div>
      </section>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">2. Pesée du lot</div><div className="form-hint">Quantités calculées pour {qty} {unitLabel(selected)}.</div></div></div>
        <div className="table-container"><table><thead><tr><th>Matière</th><th style={{textAlign:'right'}}>Quantité</th><th>Lot / DDM</th><th>Contrôle</th></tr></thead><tbody>{ingredients.map((ingredient,index) => <tr key={`${ingredient.name}-${index}`}><td><strong>{ingredient.name}</strong></td><td style={{textAlign:'right'}}><strong>{Number(ingredient.quantity.toFixed(2))} {ingredient.unit}</strong></td><td>________________</td><td><input type="checkbox" checked={!!checked[`i${index}`]} onChange={e => setChecked(v => ({...v,[`i${index}`]:e.target.checked}))}/></td></tr>)}</tbody></table></div>
        {!ingredients.length && <div className="empty-inline" style={{padding:'1rem'}}>La recette de ce produit ne contient aucun ingrédient.</div>}
      </section>

      <section className="card sop-section">
        <div className="card-header"><div><div className="card-title">3. Fabrication étape par étape</div><div className="form-hint">Cocher chaque étape au moment où elle est terminée.</div></div></div>
        {(selected.sop_bake_temperature || selected.sop_bake_minutes) && <div className="sop-parameters"><strong>Paramètres validés</strong><span>{selected.sop_bake_temperature ? `${selected.sop_bake_temperature} °C` : 'Température non définie'} · {selected.sop_bake_minutes ? `${selected.sop_bake_minutes} min` : 'Durée non définie'}</span></div>}
        <div className="sop-steps">{activeSteps.map((step,index) => <article key={`${step.title}-${index}`}><label><input type="checkbox" checked={!!checked[`s${index}`]} onChange={e => setChecked(v => ({...v,[`s${index}`]:e.target.checked}))}/><b>{index + 1}</b></label><div><strong>{step.title}</strong><p>{step.detail}</p></div></article>)}</div>
        {selected.sop_notes && <div className="sop-notes"><strong>Points de vigilance</strong><p>{selected.sop_notes}</p></div>}
      </section>

      <section className="card sop-section sop-final">
        <div className="card-title">4. Contrôle final et traçabilité</div>
        <div className="sop-final-grid"><label>Quantité obtenue<input className="form-input" placeholder={`${qty} ${unitLabel(selected)}`}/></label><label>Pertes / non-conformes<input className="form-input" placeholder="0"/></label><label>Heure de fin<input className="form-input" type="time"/></label><label>Signature<input className="form-input" placeholder="Nom / initiales"/></label></div>
        <div className="sop-final-actions no-print"><button className="btn btn-primary" onClick={() => onNavigate('production')}>Enregistrer le lot dans Production →</button><button className="btn" onClick={() => setChecked({})}>Réinitialiser les cases</button></div>
      </section>
    </>}
  </div>;
}

function TechnicalSheetEditor({ selected, form, setForm, saving, onSave }) {
  const updateHygiene = (index, value) => setForm(current => ({...current, hygieneChecks:current.hygieneChecks.map((item,i) => i === index ? value : item)}));
  const updateStep = (index, field, value) => setForm(current => ({...current, steps:current.steps.map((step,i) => i === index ? {...step,[field]:value} : step)}));
  return <div className="sop-editor">
    <div className="operations-rule"><strong>{selected.sop_updated_at ? 'Modifier la fiche technique' : 'Créer la fiche technique'}</strong><span>{selected.name} · Les ingrédients et quantités restent gérés dans Produits & recettes.</span></div>
    <section className="card sop-editor-section"><div className="card-header"><div><div className="card-title">Paramètres de fabrication</div><div className="form-hint">Laissez vide si le produit n’est pas cuit.</div></div></div><div className="card-body"><div className="form-row form-row-2"><div className="form-group"><label className="form-label">Température (°C)</label><input className="form-input" type="number" min="1" value={form.bakeTemperature} onChange={e => setForm(v => ({...v,bakeTemperature:e.target.value}))}/></div><div className="form-group"><label className="form-label">Durée (minutes)</label><input className="form-input" type="number" min="1" value={form.bakeMinutes} onChange={e => setForm(v => ({...v,bakeMinutes:e.target.value}))}/></div></div></div></section>
    <section className="card sop-editor-section"><div className="card-header"><div><div className="card-title">Consignes d’hygiène</div><div className="form-hint">Une consigne courte par ligne.</div></div><button className="btn btn-sm" onClick={() => setForm(v => ({...v,hygieneChecks:[...v.hygieneChecks,'']}))}>＋ Ajouter</button></div><div className="sop-editor-list">{form.hygieneChecks.map((item,index) => <div key={index}><span>{index + 1}</span><input className="form-input" value={item} onChange={e => updateHygiene(index,e.target.value)}/><button className="btn btn-icon btn-ghost" onClick={() => setForm(v => ({...v,hygieneChecks:v.hygieneChecks.filter((_,i) => i !== index)}))}>×</button></div>)}</div></section>
    <section className="card sop-editor-section"><div className="card-header"><div><div className="card-title">Étapes de fabrication</div><div className="form-hint">Placez les étapes dans l’ordre réel d’exécution.</div></div><button className="btn btn-sm" onClick={() => setForm(v => ({...v,steps:[...v.steps,{title:'',detail:''}]}))}>＋ Ajouter</button></div><div className="sop-editor-steps">{form.steps.map((step,index) => <article key={index}><b>{index + 1}</b><div><input className="form-input" placeholder="Titre de l’étape" value={step.title} onChange={e => updateStep(index,'title',e.target.value)}/><textarea className="form-textarea" placeholder="Instructions détaillées, contrôles et critères attendus" value={step.detail} onChange={e => updateStep(index,'detail',e.target.value)}/></div><button className="btn btn-icon btn-ghost" onClick={() => setForm(v => ({...v,steps:v.steps.filter((_,i) => i !== index)}))}>×</button></article>)}</div></section>
    <section className="card sop-editor-section"><div className="card-body"><div className="form-group"><label className="form-label">Points de vigilance / qualité</label><textarea className="form-textarea" rows="4" placeholder="Ex : texture attendue, température à cœur, conditions de conservation..." value={form.notes} onChange={e => setForm(v => ({...v,notes:e.target.value}))}/></div><button className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? 'Enregistrement...' : selected.sop_updated_at ? 'Enregistrer les modifications' : 'Créer la fiche technique'}</button></div></section>
  </div>;
}
