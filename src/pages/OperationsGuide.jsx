import React from 'react';
import { SectionHeader } from '../components/UI';

const routines = [
  {
    number:'1', moment:'Avant de commencer', title:'Vérifier les priorités', page:'dashboard', action:"Ouvrir Aujourd'hui",
    checks:['Lire les commandes à préparer', 'Repérer les stocks en alerte', 'Vérifier la production recommandée']
  },
  {
    number:'2', moment:'Quand une commande arrive', title:'Enregistrer la commande', page:'sales', action:'Ouvrir Commandes',
    checks:['Choisir le client et les produits', 'Contrôler les quantités disponibles', 'Faire avancer le statut jusqu’à Payé']
  },
  {
    number:'3', moment:'Avant la production', title:'Préparer les achats', page:'achats', action:'Ouvrir Achats',
    checks:['Ajouter les variétés à produire', 'Saisir les quantités prévues', 'Imprimer la liste consolidée si nécessaire']
  },
  {
    number:'4', moment:'Pendant la production', title:'Enregistrer chaque lot', page:'production', action:'Ouvrir Production',
    checks:['Produire la quantité recommandée', 'Enregistrer le lot terminé', 'Les matières sont déduites automatiquement']
  },
  {
    number:'5', moment:'À chaque livraison fournisseur', title:'Réceptionner le stock', page:'mouvements', action:'Ouvrir Mouvements',
    checks:['Choisir la matière ou le consommable', 'Saisir le nombre de formats reçus', 'Pour un consommable valorisé, la charge Finance est créée']
  },
  {
    number:'6', moment:'Une fois par semaine', title:'Faire l’inventaire', page:'ingredients', action:'Ouvrir Stocks',
    checks:['Compter uniquement le stock physique', 'Corriger les écarts dans Inventaire', 'Traiter les articles sous leur seuil']
  },
  {
    number:'7', moment:'En fin de semaine ou de mois', title:'Contrôler les finances', page:'finance', action:'Ouvrir Finance',
    checks:['Ajouter les charges non liées aux réceptions', 'Mettre à jour Payé / À payer', 'Comparer résultat d’exploitation et trésorerie']
  }
];

export default function OperationsGuide({ onNavigate }) {
  return <div className="page-inner operations-guide">
    <SectionHeader title="Mode d’emploi opérationnel" subtitle="Le parcours simple à suivre au quotidien, de la commande au contrôle financier" />

    <div className="operations-rule">
      <strong>La règle simple</strong>
      <span>Une action réelle = une saisie dans l’outil. Ne saisissez jamais une estimation comme une opération terminée.</span>
    </div>

    <div className="operations-rhythm">
      <div><strong>Chaque jour</strong><span>Commandes · Production · Réceptions</span></div>
      <div><strong>Chaque semaine</strong><span>Inventaire · Stocks bas · Achats</span></div>
      <div><strong>Chaque mois</strong><span>Charges · Paiements · Résultat</span></div>
    </div>

    <div className="operations-flow">
      {routines.map(item => <article key={item.number} className="operations-step">
        <div className="operations-step-number">{item.number}</div>
        <div className="operations-step-content">
          <small>{item.moment}</small>
          <h3>{item.title}</h3>
          <ul>{item.checks.map(check => <li key={check}>{check}</li>)}</ul>
          <button className="btn btn-sm" onClick={() => onNavigate(item.page)}>{item.action} →</button>
        </div>
      </article>)}
    </div>

    <div className="card operations-donts">
      <div className="card-header"><div className="card-title">À éviter</div></div>
      <div className="card-body">
        <p><strong>Ne pas modifier le stock directement</strong><span>Utilisez Réception, Perte ou Inventaire pour garder une trace.</span></p>
        <p><strong>Ne pas créer un consommable comme matière première</strong><span>Le consommable ne doit pas apparaître dans une recette.</span></p>
        <p><strong>Ne pas supprimer une opération Finance pour la corriger</strong><span>Modifiez-la ou annulez-la afin de conserver l’historique.</span></p>
      </div>
    </div>
  </div>;
}
