import React,{useEffect,useState} from 'react';
import toast from 'react-hot-toast';
import {teamAPI} from '../lib/api';
import {EmptyState,LoadingScreen,SectionHeader,SopGuide} from '../components/UI';

export default function Administration({currentUserId}){
  const [members,setMembers]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState('');
  const load=async()=>{setLoading(true);try{setMembers(await teamAPI.getAll());}catch(e){toast.error(e.message);}finally{setLoading(false);}};
  useEffect(()=>{load();},[]);
  const changeRole=async(member,role)=>{
    if(member.user_id===currentUserId&&role!=='admin'&&!window.confirm('Vous retirez votre propre rôle Admin. Continuer ?'))return;
    setSaving(member.user_id);try{await teamAPI.updateRole(member.user_id,role);toast.success('Rôle mis à jour');await load();}catch(e){toast.error(e.message);}finally{setSaving('');}
  };
  if(loading)return <LoadingScreen/>;
  return <div className="page-inner">
    <SectionHeader title="Équipe & rôles" subtitle="Gérer les droits des utilisateurs Inside"/>
    <SopGuide steps={[{title:'Admin',detail:"Accès complet et gestion des rôles"},{title:'Manager',detail:'Accès complet aux opérations partagées'},{title:'Sécurité',detail:'Seul un Admin peut modifier les rôles'}]}/>
    <div className="card"><div className="card-header"><div><div className="card-title">Utilisateurs</div><div className="form-hint">Les nouveaux comptes sont automatiquement Managers.</div></div><span className="badge badge-b2b">{members.length}</span></div>
      {members.length===0?<EmptyState text="Aucun utilisateur"/>:<div className="team-member-list">{members.map(member=><article key={member.user_id}>
        <div className="team-member-avatar">{member.email.slice(0,2).toUpperCase()}</div>
        <div><strong>{member.email}</strong><small>{member.user_id===currentUserId?'Votre compte':'Membre de l’équipe'}</small></div>
        <select className="form-select" value={member.role} disabled={saving===member.user_id} onChange={e=>changeRole(member,e.target.value)}><option value="admin">Admin</option><option value="manager">Manager</option></select>
      </article>)}</div>}
    </div>
  </div>;
}
