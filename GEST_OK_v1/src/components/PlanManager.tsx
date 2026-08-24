import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { Plan } from '../types';

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState('');
  const [maxCompanies, setMaxCompanies] = useState(0);
  const [maxUsers, setMaxUsers] = useState(0);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'plans'), (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Plan)));
    });
    return () => unsubscribe();
  }, []);

  const handleAddPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await addDoc(collection(db, 'plans'), { name, maxCompanies: Number(maxCompanies), maxUsers: Number(maxUsers) });
    setName(''); setMaxCompanies(0); setMaxUsers(0);
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleAddPlan} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm grid grid-cols-4 gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-600 font-medium">Nombre Plan</label>
          <input value={name} onChange={e => setName(e.target.value)} className="p-2 border rounded" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-600 font-medium">Máx. Empresas</label>
          <input type="number" value={maxCompanies} onChange={e => setMaxCompanies(Number(e.target.value))} className="p-2 border rounded" required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-600 font-medium">Máx. Usuarios</label>
          <input type="number" value={maxUsers} onChange={e => setMaxUsers(Number(e.target.value))} className="p-2 border rounded" required />
        </div>
        <button type="submit" className="bg-slate-900 text-white px-4 py-2 rounded hover:bg-slate-800 transition-colors">Crear Plan</button>
      </form>
      <ul className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm divide-y">
        {plans.map(plan => (
          <li key={plan.id} className="py-3 flex justify-between items-center">
            <span className="font-medium text-slate-900">{plan.name}</span>
            <span className="text-slate-500 text-sm">Empresas: {plan.maxCompanies} | Usuarios: {plan.maxUsers}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
