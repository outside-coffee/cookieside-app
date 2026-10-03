import React from 'react';
import { SectionHeader } from '../components/UI';

const routines = [
  {
    number:'1', moment:'Avant de commencer', title:'Vérifier les priorités', page:'dashboard', action:"Ouvrir Aujourd'hui",
    checks:['Traiter la liste Actions à traiter', 'Lire les commandes à préparer', 'Vérifier les achats commandés et paiements à faire']
  },
  {
    number:'2', moment:'Quand une commande arrive', title:'Enregistrer la commande', page:'sales', action:'Ouvrir Commandes',
    checks:['Choisir le client et les produits', 'Contrôler les quantités disponibles', 'Faire avancer le statut jusqu’à Payé']
  },
  {
    number:'3', moment:'Avant la production', title:'Préparer les achats', page:'achats', action:'Ouvrir Achats',
    checks:['Ajouter les variétés à produire', 'Enregistrer puis marquer le plan Commandé', 'Réceptionner chaque ligne depuis Mouvements']
  },
  {
    number:'4', moment:'Avant de lancer le lot', title:'Ouvrir la fiche technique', page:'sop', action:'Ouvrir SOP recettes',
    checks:['Choisir le produit et la quantité prévue', 'Vérifier les pesées calculées et les paramètres de cuisson', 'Valider l’hygiène puis suivre les étapes dans l’ordre']
  },
  {
    number:'5', moment:'Après la production', title:'Enregistrer chaque lot', page:'production', action:'Ouvrir Production',
    checks:['Renseigner la quantité réellement obtenue', 'Enregistrer le lot terminé', 'Les matières sont déduites automatiquement']
  },
  {
    number:'6', moment:'À chaque livraison fournisseur', title:'Réceptionner le stock', page:'mouvements', action:'Ouvrir Mouvements',
    checks:['Choisir la matière ou le consommable', 'Vérifier le format, son prix et le fournisseur', 'Valider : le stock, le prix et la charge Finance sont mis à jour ensemble']
  },
  {
    number:'7', moment:'Une fois par semaine', title:'Faire l’inventaire', page:'ingredients', action:'Ouvrir Stocks',
    checks:['Créer ou reprendre le brouillon', 'Compter toutes les matières et vérifier les écarts', 'Valider une seule fois pour corriger le stock']
  },
  {
    number:'8', moment:'En fin de semaine ou de mois', title:'Contrôler les finances', page:'finance', action:'Ouvrir Finance',
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

    <div className="operations-rule">
      <strong>Où modifier les données ?</strong>
      <span>Catalogue sert à gérer produits, recettes, matières, formats et prix. Stocks sert uniquement à contrôler les quantités, réceptionner et inventorier.</span>
    </div>

    <div className="operations-rhythm">
      <div><strong>Chaque jour</strong><span>Commandes · SOP · Production · Réceptions</span></div>
      <div><strong>Chaque semaine</strong><span>Inventaire · Stocks bas · Achats</span></div>
      <div><strong>Chaque mois</strong><span>Charges · Paiements · Résultat</span></div>
    </div>

    <div className="card operations-roles">
      <div className="card-header"><div><div className="card-title">Qui fait quoi dans les SOP ?</div><div className="form-hint">Séparer la préparation des standards de leur exécution quotidienne.</div></div></div>
      <div className="card-body">
        <div><strong>Responsable</strong><span>Crée ou modifie la fiche dans SOP recettes → Gérer la fiche technique, puis valide les étapes, l’hygiène et les paramètres.</span><button className="btn btn-sm" onClick={() => onNavigate('sop')}>Gérer les fiches →</button></div>
        <div><strong>Opérateur</strong><span>Choisit le produit et le lot, suit les cases dans Utiliser la fiche, note les contrôles puis enregistre le lot produit.</span><button className="btn btn-sm" onClick={() => onNavigate('sop')}>Utiliser une SOP →</button></div>
      </div>
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
        <p><strong>Ne pas produire avec une fiche non validée</strong><span>Le responsable doit vérifier les étapes et paramètres avant la première utilisation.</span></p>
        <p><strong>Ne pas marquer un achat reçu manuellement</strong><span>Le plan se ferme automatiquement lorsque toutes ses lignes sont réceptionnées.</span></p>
      </div>
    </div>
  </div>;
}
