import React, { useState, useEffect, useMemo } from 'react';
import { 
  Library, PlusCircle, Search, FileText, Trash2, Edit, Download, LayoutDashboard, 
  Save, X, Filter, CheckSquare, User, Link as LinkIcon, ExternalLink, AlertCircle, 
  Cloud, CloudOff, UploadCloud, Loader2, Lock, LogOut, KeyRound, Chrome 
} from 'lucide-react';

// Import Firebase
import { initializeApp } from "firebase/app";
import { 
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut 
} from "firebase/auth";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, onSnapshot, doc 
} from "firebase/firestore";

// =================================================================================
// CONFIG DATABASE ANDA (SUDAH TERPASANG)
// =================================================================================
const firebaseConfig = {
  apiKey: "AIzaSyAiGYdU3Cel8W3XIiQKz5ELTteJCqbkDt4",
  authDomain: "library-kantor.firebaseapp.com",
  projectId: "library-kantor",
  storageBucket: "library-kantor.firebasestorage.app",
  messagingSenderId: "826768907910",
  appId: "1:826768907910:web:e7b538e09f9cae66aabb07"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Komponen Kartu Statistik ---
const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
    <div className={`p-3 rounded-full ${color} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
    </div>
  </div>
);

// --- Komponen Aplikasi Utama ---
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [catalogs, setCatalogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(false);
  const [view, setView] = useState('dashboard'); 
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  const initialFormState = {
    name: '', date: new Date().toISOString().split('T')[0], source: '', link: '', 
    type: 'Buku', customType: '', attributes: [] as string[], inputter: '', notes: ''
  };
  const [formData, setFormData] = useState(initialFormState);

  // --- Cek Status Login ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u && !formData.inputter) {
        setFormData(prev => ({ ...prev, inputter: u.displayName || u.email || '' }));
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Sinkronisasi Data (Realtime) ---
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    // Mengambil data dari koleksi 'catalogs'
    const catalogsRef = collection(db, 'catalogs'); 
    
    const unsubscribe = onSnapshot(catalogsRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCatalogs(data);
        setLoading(false);
        setIsOnline(true);
      },
      (error) => {
        console.error("Firestore Error:", error);
        setIsOnline(false);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // --- Fungsi Login & Logout ---
  const handleGoogleLogin = async () => {
    setLoginError("");
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login Failed", error);
      setLoginError("Gagal login: " + error.message);
    }
  };

  const handleLogout = async () => {
    try { await signOut(auth); setFormData(initialFormState); setView('dashboard'); } 
    catch (error) { console.error("Logout Error", error); }
  };

  // --- Fungsi Form Input ---
  const handleInputChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (value: string) => {
    setFormData(prev => {
      const current = prev.attributes;
      if (current.includes(value)) return { ...prev, attributes: current.filter(item => item !== value) };
      else return { ...prev, attributes: [...current, value] };
    });
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!user) return alert("Harus login dulu.");
    setIsSaving(true);
    
    const finalType = formData.type === 'Lainnya' ? formData.customType : formData.type;
    const payload = {
      name: formData.name, date: formData.date, source: formData.source, link: formData.link || '',
      type: finalType, customType: formData.type === 'Lainnya' ? formData.customType : '', 
      attributes: formData.attributes, inputter: formData.inputter, notes: formData.notes,
      timestamp: new Date().toISOString(), lastModifiedBy: user.email
    };

    try {
      if (isEditing) {
        await updateDoc(doc(db, 'catalogs', isEditing), payload);
        alert("Data diperbarui!"); setIsEditing(null);
      } else {
        await addDoc(collection(db, 'catalogs'), { ...payload, createdBy: user.email });
        alert("Tersimpan!");
      }
      setFormData({ ...initialFormState, inputter: user.displayName || user.email || '' });
      if(isEditing) setView('list');
    } catch (error: any) { console.error(error); alert("Gagal menyimpan: " + error.message); } 
    finally { setIsSaving(false); }
  };

  // --- Fungsi Edit, Hapus, Export ---
  const handleEdit = (cat: any) => {
    const presets = ['Buku', 'Majalah', 'Brosur', 'Katalog Produk'];
    const isPreset = presets.includes(cat.type);
    setFormData({ ...cat, type: isPreset ? cat.type : 'Lainnya', customType: isPreset ? '' : cat.type, link: cat.link || '' });
    setIsEditing(cat.id); setView('input');
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (window.confirm('Hapus permanen?')) {
      try { await deleteDoc(doc(db, 'catalogs', id)); } catch (error) { alert("Gagal hapus."); }
    }
  };

  const handleExport = () => {
    const headers = ["Nama,Tanggal,Sumber,Link,Jenis,Atribut,Penginput,Ket"];
    const csv = catalogs.map(c => `"${c.name}","${c.date}","${c.source}","${c.link||''}","${c.type}","${c.attributes.join(';') }","${c.inputter}","${c.notes}"`).join("\n");
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([headers + "\n" + csv], { type: 'text/csv' }));
    link.download = 'library.csv'; 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link);
  };

  // --- Logika Search & Sort ---
  const processedCatalogs = useMemo(() => {
    let data = [...catalogs];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      data = data.filter(c => (c.name||'').toLowerCase().includes(lower) || (c.source||'').toLowerCase().includes(lower));
    }
    return data.sort((a,b) => {
      const valA = a[sortConfig.key]||'', valB = b[sortConfig.key]||'';
      return sortConfig.direction === 'asc' ? (valA < valB ? -1 : 1) : (valA > valB ? -1 : 1);
    });
  }, [catalogs, searchTerm, sortConfig]);

  const stats = {
    total: catalogs.length,
    physical: catalogs.filter(c => c.attributes?.includes('Katalog Fisik')).length,
    digital: catalogs.filter(c => c.attributes?.includes('Katalog Digital')).length,
    pricelist: catalogs.filter(c => c.attributes?.includes('Price List')).length
  };

  // --- Render Tampilan ---

  // 1. Loading Awal
  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  // 2. Halaman Login
  if (!user) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
        <Library size={48} className="mx-auto text-blue-600 mb-4"/>
        <h1 className="text-2xl font-bold mb-2">Office Library</h1>
        <p className="text-slate-500 mb-6">Database Katalog Online</p>
        <button onClick={handleGoogleLogin} className="w-full bg-white border hover:bg-slate-50 py-3 rounded-xl flex justify-center gap-2 font-semibold shadow-sm transition-all active:scale-[0.98]">
          <Chrome className="text-blue-600"/> Masuk dengan Google
        </button>
        {loginError && <p className="text-red-500 text-sm mt-4 bg-red-50 p-2 rounded">{loginError}</p>}
      </div>
    </div>
  );

  // 3. Halaman Dashboard (Setelah Login)
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm px-4">
        <div className="container mx-auto max-w-6xl py-3 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Library className="text-blue-600"/> 
            <div>
              <h1 className="font-bold text-lg text-blue-700">OfficeLib</h1>
              <span className="text-[10px] text-green-600 font-bold uppercase block leading-none">{isOnline ? '● Online' : '○ Connecting...'}</span>
            </div>
          </div>
          <nav className="flex gap-2 w-full md:w-auto overflow-x-auto">
            <button onClick={()=>setView('dashboard')} className={`px-3 py-2 rounded-lg text-sm font-medium flex gap-2 ${view==='dashboard'?'bg-blue-50 text-blue-700':'text-slate-600'}`}><LayoutDashboard size={18}/> Dash</button>
            <button onClick={()=>{setView('input');setIsEditing(null);setFormData({...initialFormState, inputter: user.displayName})}} className={`px-3 py-2 rounded-lg text-sm font-medium flex gap-2 ${view==='input'?'bg-blue-50 text-blue-700':'text-slate-600'}`}><PlusCircle size={18}/> Input</button>
            <button onClick={()=>setView('list')} className={`px-3 py-2 rounded-lg text-sm font-medium flex gap-2 ${view==='list'?'bg-blue-50 text-blue-700':'text-slate-600'}`}><FileText size={18}/> Data</button>
            <div className="w-px bg-slate-200 mx-1"></div>
            <div className="flex items-center gap-2">
              {user.photoURL && <img src={user.photoURL} className="w-8 h-8 rounded-full border" alt="User"/>}
              <button onClick={handleLogout} className="text-slate-400 hover:text-red-500"><LogOut size={18}/></button>
            </div>
          </nav>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Total" value={stats.total} icon={Library} color="bg-blue-600"/>
              <StatCard title="Fisik" value={stats.physical} icon={FileText} color="bg-emerald-600"/>
              <StatCard title="Digital" value={stats.digital} icon={Download} color="bg-purple-600"/>
              <StatCard title="Pricelist" value={stats.pricelist} icon={CheckSquare} color="bg-amber-600"/>
            </div>
            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <h3 className="font-bold mb-4">Live Updates</h3>
              {loading ? <p>Loading...</p> : catalogs.length===0 ? <p>Belum ada data.</p> : 
               <div className="overflow-x-auto"><table className="w-full text-sm text-left">
                 <thead><tr className="border-b bg-slate-50"><th className="p-3">Tanggal</th><th className="p-3">Nama</th><th className="p-3">User</th></tr></thead>
                 <tbody>{catalogs.slice(0,5).map(c=><tr key={c.id} className="border-b"><td className="p-3">{c.date}</td><td className="p-3">{c.name}</td><td className="p-3 text-slate-500">{c.inputter}</td></tr>)}</tbody>
               </table></div>}
            </div>
          </div>
        )}

        {view === 'input' && (
          <div className="max-w-3xl mx-auto bg-white rounded-xl border shadow-sm p-6">
            <h2 className="font-bold text-lg mb-6 flex gap-2 items-center">{isEditing?<Edit/>:<PlusCircle/>} {isEditing?'Edit':'Input'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input required name="name" value={formData.name} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Nama Katalog"/>
              <div className="grid grid-cols-2 gap-4">
                <input required type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full p-2 border rounded"/>
                <input required name="source" value={formData.source} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Sumber"/>
              </div>
              <input type="url" name="link" value={formData.link} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Link URL (https://...)"/>
              <div className="flex gap-2">
                <select name="type" value={formData.type} onChange={handleInputChange} className="p-2 border rounded flex-1">
                  <option value="Buku">Buku</option><option value="Majalah">Majalah</option><option value="Brosur">Brosur</option><option value="Katalog Produk">Katalog Produk</option><option value="Lainnya">Lainnya</option>
                </select>
                {formData.type==='Lainnya' && <input required name="customType" value={formData.customType} onChange={handleInputChange} className="p-2 border rounded flex-1" placeholder="Jenis Lain"/>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {['Katalog Fisik','Katalog Digital','Sampel Katalog','Price List'].map(i=>(
                  <label key={i} className="flex gap-2 items-center p-2 border rounded cursor-pointer"><input type="checkbox" checked={formData.attributes.includes(i)} onChange={()=>handleCheckboxChange(i)}/> {i}</label>
                ))}
              </div>
              <div className="flex gap-4">
                <input required name="inputter" value={formData.inputter} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Nama"/>
                <input name="notes" value={formData.notes} onChange={handleInputChange} className="w-full p-2 border rounded" placeholder="Ket"/>
              </div>
              <button disabled={isSaving} className="w-full bg-blue-600 text-white p-3 rounded font-bold">{isSaving?'Menyimpan...':'Simpan'}</button>
            </form>
          </div>
        )}

        {view === 'list' && (
          <div className="space-y-4">
            <div className="flex justify-between gap-4">
              <input value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} className="w-full p-2 border rounded" placeholder="Cari..."/>
              <button onClick={handleExport} className="bg-slate-100 px-4 py-2 rounded flex gap-2 items-center"><Download size={16}/> CSV</button>
            </div>
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b"><tr><th className="p-3 cursor-pointer" onClick={()=>setSortConfig({key:'date',direction:'desc'})}>Tgl</th><th className="p-3">Nama</th><th className="p-3">Link</th><th className="p-3">Jenis</th><th className="p-3">Attr</th><th className="p-3">User</th><th className="p-3">Aksi</th></tr></thead>
                <tbody>
                  {processedCatalogs.map(c => (
                    <tr key={c.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 whitespace-nowrap">{c.date}</td>
                      <td className="p-3 font-medium">{c.name}<div className="text-xs text-slate-500">{c.source}</div></td>
                      <td className="p-3 text-center">{c.link ? <a href={c.link} target="_blank" className="text-blue-600"><ExternalLink size={14}/></a> : '-'}</td>
                      <td className="p-3">{c.type}</td>
                      <td className="p-3"><div className="flex flex-wrap gap-1">{c.attributes.map(a=><span key={a} className="text-[10px] bg-blue-100 px-1 rounded">{a}</span>)}</div></td>
                      <td className="p-3">{c.inputter}</td>
                      <td className="p-3 flex gap-2"><button onClick={()=>handleEdit(c)} className="text-blue-600"><Edit size={16}/></button><button onClick={()=>handleDelete(c.id)} className="text-red-600"><Trash2 size={16}/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}