import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, CalendarCheck, Camera, FolderOpen, TrendingUp, UploadCloud, 
  Plus, CheckCircle2, Clock, Search, Bell, X, Image as ImageIcon, 
  Copy, PlusCircle, FileText, User, AlertTriangle, Edit2, ChevronRight, 
  FolderPlus, File, History, Phone, MapPin, AlignLeft, Download, 
  ExternalLink, AlertCircle, Filter, ArrowUpDown, Upload, LogOut, Laptop, Cloud,
  Move, Trash2, Award, TrendingDown, Archive, CalendarDays, RefreshCw, Link as LinkIcon
} from 'lucide-react';

// === 1. FIREBASE CONFIGURATION & INITIALIZATION ===
import { initializeApp } from "firebase/app";
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, 
  signOut, signInWithCustomToken, signInAnonymously 
} from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query } from "firebase/firestore";

// Fallback configuration (Untuk Production/Local Anda)
const fallbackConfig = {
  apiKey: "AIzaSyBP8X0JcszhoIO8Vcei-t-UcL79xYJk58s",
  authDomain: "library-kantor-dkpm.firebaseapp.com",
  projectId: "library-kantor-dkpm",
  storageBucket: "library-kantor-dkpm.firebasestorage.app",
  messagingSenderId: "307842167975",
  appId: "1:307842167975:web:4cb9d85ed15452d8395782",
  measurementId: "G-9T0S15CS54"
};

// Deteksi Environment
const isCanvasEnv = typeof __firebase_config !== 'undefined';
const firebaseConfig = isCanvasEnv ? JSON.parse(__firebase_config) : fallbackConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'design-app-dkpm';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// HELPER: Dynamic Firestore Paths
const getCol = (colName) => isCanvasEnv ? collection(db, 'artifacts', appId, 'public', 'data', colName) : collection(db, colName);
const getDoc = (colName, docId) => isCanvasEnv ? doc(db, 'artifacts', appId, 'public', 'data', colName, docId) : doc(db, colName, docId);

// Google Apps Script API URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyLRLeDMmp2ugwHlt4lx_1yXP8M0J9jkuXD7D6_VcSkWUKgQzjPMKs5bxeP_6p8ni6A_w/exec";

// Helpers
const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => {
    const res = reader.result;
    resolve({
      name: (file.name && file.name.trim() !== "") ? file.name : `Dokumen_${new Date().getTime()}`,
      mimeType: file.type || 'application/octet-stream',
      base64: res.includes(',') ? res.split(',')[1] : res 
    });
  };
  reader.onerror = error => reject(error);
});

const getIconComponent = (iconName) => {
  const icons = { TrendingUp, Camera, CalendarCheck, FolderPlus, Edit2, CheckCircle2, Download, PlusCircle, FileText, UploadCloud, Trash2, Award, Archive, RefreshCw, History };
  return icons[iconName] || FileText;
};

const formatTimeAgo = (isoString) => {
  if (!isoString) return 'Baru saja';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 1) return 'Baru saja';
  if (diffMins < 60) return `${diffMins} mnt lalu`;
  const diffHrs = Math.round(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} jam lalu`;
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

// Global Helper untuk Export PDF HD
const executePDFExport = async (elementId, fileName, gdriveFolder, progressCallback) => {
  const element = document.getElementById(elementId);
  if (!element) throw new Error("Template PDF tidak ditemukan.");
  
  element.style.display = 'block';
  
  const opt = {
    margin:       [0, 0, 0, 0],
    filename:     fileName,
    image:        { type: 'jpeg', quality: 1 },
    html2canvas:  { scale: 3, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
    pagebreak:    { mode: ['avoid-all'] }
  };
  
  try {
     if (!window.html2pdf) {
         await new Promise((resolve, reject) => {
             const script = document.createElement('script');
             script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
             script.onload = resolve;
             script.onerror = () => reject(new Error("Gagal memuat library PDF. Cek koneksi internet."));
             document.body.appendChild(script);
         });
     }
     progressCallback(30);
     
     const worker = window.html2pdf().set(opt).from(element).toPdf();
     const pdf = await worker.get('pdf');
     const pdfBase64DataUri = pdf.output('datauristring');
     const base64Str = pdfBase64DataUri.split(',')[1];
     progressCallback(60);

     const link = document.createElement('a');
     link.href = pdfBase64DataUri;
     link.download = fileName;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);

     progressCallback(80);
     const response = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "uploadCatalog",
          folderPath: gdriveFolder,
          fileName: fileName,
          title: fileName,
          fileData: { name: fileName, mimeType: 'application/pdf', base64: base64Str }
        }),
      });
      
      const result = await response.json();
      progressCallback(100);
      element.style.display = 'none';
      if(result.status !== 'success') throw new Error(result.message || "Gagal upload G-Drive");
      
      return result;
  } catch (err) {
     element.style.display = 'none';
     throw err;
  }
};


// === KOMPONEN DRAGGABLE IMAGE ===
function DraggableImage({ src, x = 50, y = 50, onChange, mode = 'cover' }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, startX: 0, startY: 0 });

  const handlePointerDown = (e) => {
    setIsDragging(true);
    dragStart.current = { mouseX: e.clientX || (e.touches && e.touches[0].clientX) || 0, mouseY: e.clientY || (e.touches && e.touches[0].clientY) || 0, startX: x, startY: y };
    if(e.target.setPointerCapture && e.pointerId) e.target.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); 
    const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
    let newX = dragStart.current.startX - ((clientX - dragStart.current.mouseX) * 0.5);
    let newY = dragStart.current.startY - ((clientY - dragStart.current.mouseY) * 0.5);
    onChange(Math.max(0, Math.min(100, newX)), Math.max(0, Math.min(100, newY)));
  };
  const handlePointerUp = () => setIsDragging(false);

  return (
    <div className="w-full h-full relative group" style={{ touchAction: 'none' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onMouseLeave={handlePointerUp}>
      <div className="w-full h-full cursor-move transition-transform active:scale-[0.99]" style={{ backgroundImage: `url(${src})`, backgroundSize: mode, backgroundPosition: `${x}% ${y}%`, backgroundRepeat: 'no-repeat' }} />
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
        <div className="bg-black/60 text-white px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur-sm shadow-lg"><Move size={14} /><span className="text-[10px] font-bold">Geser Area Foto</span></div>
      </div>
    </div>
  );
}


// === APLIKASI UTAMA ===
export default function App() {
  const [activeTab, setActiveTab] = useState('tugas'); 
  const [user, setUser] = useState(null); 
  const [showNotif, setShowNotif] = useState(false); 
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());

  const [databaseProyek, setDatabaseProyek] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogLoans, setCatalogLoans] = useState([]);
  const [forms, setForms] = useState([]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear().toString());

  // === 1. HOOK AUTHENTICATION ===
  useEffect(() => {
    const ALLOWED_EMAILS = [
      "fariddwicahyo24@gmail.com",
      "hardiansyahrizky386@gmail.com",
      "kristiana.budi.h12@gmail.com",
      "irvanranggapratama@gmail.com",
      "fabiantjb@gmail.com",
      "fajarriskyy@gmail.com",
      "dec13790@gmail.com",
      "riyozein0@gmail.com",
      "yogichristianto.bsi@gmail.com"
    ];

    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        try { await signInWithCustomToken(auth, __initial_auth_token); } catch(e){}
      }
    };
    if(isCanvasEnv) initAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.isAnonymous) {
          const name = 'Admin Preview';
          const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          setUser({ name, initials, uid: currentUser.uid, role: 'Admin', email: currentUser.email || 'preview@local.app' });
          return;
        }

        const userEmail = currentUser.email ? currentUser.email.toLowerCase() : "";

        if (ALLOWED_EMAILS.includes(userEmail)) {
          const name = currentUser.displayName || 'Pengguna';
          const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          const userRole = (userEmail === "fariddwicahyo24@gmail.com") ? 'Admin' : 'Staff';
          setUser({ name, initials, uid: currentUser.uid, role: userRole, email: userEmail });
        } else {
          await signOut(auth);
          setUser(null);
          alert(`Akses Ditolak: Akun (${userEmail}) tidak terdaftar dalam sistem. Silakan hubungi Administrator.`);
        }
      } else {
        setUser(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // === 2. HOOK FIRESTORE DATA (REALTIME) ===
  useEffect(() => {
    if (!user) return;
    
    const unsubProyek = onSnapshot(getCol('projects'), (snapshot) => setDatabaseProyek(snapshot.docs.map(doc => doc.data().name)));
    const unsubTasks = onSnapshot(query(getCol('tasks')), (snapshot) => {
      const taskData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTasks(taskData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      setLastSyncTime(new Date());
    });
    const unsubActivities = onSnapshot(query(getCol('activities')), (snapshot) => {
      const actData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActivities(actData.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)));
    });
    const unsubKatalog = onSnapshot(query(getCol('catalogs')), (snapshot) => {
      const catData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCatalogItems(catData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    const unsubCatalogLoans = onSnapshot(query(getCol('catalogLoans')), (snapshot) => {
      const loanData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCatalogLoans(loanData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    const unsubForms = onSnapshot(query(getCol('forms')), (snapshot) => {
      const formData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setForms(formData.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });

    return () => { unsubProyek(); unsubTasks(); unsubActivities(); unsubKatalog(); unsubCatalogLoans(); unsubForms(); };
  }, [user]);

  const deadlineTasks = tasks.filter(t => {
    if (t.status === 'Done' || t.isDeleted) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const taskDate = new Date(t.date); taskDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((taskDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  });

  // === 3. HOOK NOTIFIKASI DEADLINE OS ===
  useEffect(() => {
    if (!user || deadlineTasks.length === 0) return;
    
    const lastNotifTime = localStorage.getItem('lastDeadlineNotifTime');
    const now = new Date().getTime();
    const sixHoursInMs = 6 * 60 * 60 * 1000;

    if (!lastNotifTime || (now - parseInt(lastNotifTime)) >= sixHoursInMs) {
      setShowNotif(true);
      localStorage.setItem('lastDeadlineNotifTime', now.toString());

      try {
        if (typeof window !== "undefined" && "Notification" in window) {
          if (Notification.permission === "granted") {
            try {
              new Notification("Peringatan Deadline Design App DKPM", {
                body: `Ada ${deadlineTasks.length} tugas yang mendekati deadline (≤ 3 hari). Segera cek tab Tugas!`,
                icon: "Logo_DKPM.png" 
              });
            } catch (e) { console.warn("Gagal menampilkan notifikasi sistem:", e); }
          } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
              if (permission === "granted") {
                try {
                  new Notification("Peringatan Deadline Design App DKPM", {
                    body: `Ada ${deadlineTasks.length} tugas yang mendekati deadline (≤ 3 hari).`
                  });
                } catch (e) { console.warn("Gagal menampilkan notifikasi sistem:", e); }
              }
            }).catch(err => {
              console.warn("Izin notifikasi diblokir oleh browser (Wajar di HP):", err);
            });
          }
        }
      } catch (error) {
        console.warn("Sistem OS tidak mendukung Notifikasi Web API:", error);
      }
    }
  }, [deadlineTasks.length, user]); 

  // === 4. HOOK AUTO REFRESH ===
  const handleManualSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      setLastSyncTime(new Date());
    }, 1000);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      handleManualSync();
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // === 5. FUNGSI HANDLER ===
  const handleAddActivity = async (msg, iconName, colorClass, bgClass) => {
    try { await addDoc(getCol('activities'), { msg, time: new Date().toISOString(), icon: iconName, color: colorClass, bg: bgClass, user: user?.name || 'Sistem' }); } catch (error) { console.error(error); }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (error) { console.error("Gagal logout:", error); } };

  const navItems = [
    { id: 'beranda', label: 'Beranda', icon: Home },
    { id: 'tugas', label: 'Tugas', icon: CalendarCheck },
    { id: 'survei', label: 'Survei', icon: Camera },
    { id: 'progres', label: 'Progres', icon: TrendingUp },
    { id: 'katalog', label: 'Katalog', icon: FolderOpen },
    { id: 'formulir', label: 'Formulir', icon: Download },
    { id: 'kinerja', label: 'Kinerja', icon: Award }
  ];

  // === 6. RENDER UTAMA ===
  if (!user) return <LoginScreen />;

  return (
    <div className="min-h-[100dvh] bg-slate-100 font-sans text-slate-800">
      <style>{`
        .pdf-page-break { break-inside: avoid; page-break-inside: avoid; }
        html, body, #root { min-height: 100%; }
      `}</style>
      
      <div className="h-[100dvh] w-full bg-slate-50 flex flex-col md:flex-row">
        {/* SIDEBAR DENGAN LOGO DKPM (THEMA HITAM/BLACK) */}
        <aside className="hidden md:flex md:w-64 lg:w-72 shrink-0 flex-col bg-black text-slate-200 p-5 lg:p-6 shadow-2xl z-30">
          <div className="px-1 pb-6 border-b border-slate-800 flex justify-center">
            <img src="Logo_DKPM.png" alt="Logo DKPM" className="w-full max-h-16 object-contain drop-shadow-md" />
          </div>
          <nav className="flex-1 pt-6 space-y-2" aria-label="Navigasi utama">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-950/40' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-sm font-bold">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-6 rounded-2xl bg-slate-900 p-4 border border-slate-800">
            <p className="text-xs font-bold text-white">{user.name}</p>
            <p className="text-[10px] text-slate-400 mt-1">{user.role}</p>
          </div>
        </aside>
        
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
        <header className="bg-white px-4 pt-4 pb-3 border-b border-slate-200 z-20 shadow-sm sticky top-0 relative md:px-8 md:pt-6 lg:px-10 flex flex-col gap-2">
          <div className="flex justify-between items-center mb-1">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2.5">
              <img src="Logo_DKPM.png" alt="DKPM Logo" className="h-6 object-contain hidden md:block opacity-0" /* Spacer for alignment if needed */ />
              <img src="Logo_DKPM.png" alt="DKPM Logo" className="h-8 object-contain md:hidden block" /> 
              <span className="hidden md:inline">Design App <span className="text-orange-500">DKPM</span></span> 
              <span className="hidden sm:inline text-sm font-medium text-slate-400">/ Workspace</span>
            </h1>
            <div className="flex items-center gap-3">
              <button onClick={handleManualSync} className={`text-slate-400 hover:text-orange-500 transition-colors ${isSyncing ? 'animate-spin text-orange-500' : ''}`} title="Sinkronisasi Data">
                <RefreshCw size={20} />
              </button>
              <button onClick={() => setShowNotif(!showNotif)} className="text-slate-400 hover:text-orange-500 transition-colors relative">
                <Bell size={22} />
                {(deadlineTasks.length > 0 || activities.length > 0) && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white animate-pulse"></span>}
              </button>
              <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm border border-orange-200 hover:bg-orange-200 transition-colors" title="Klik untuk Logout">{user.initials}</button>
            </div>
          </div>
          <div className="text-[9px] text-slate-400 font-medium flex justify-end items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></span>
            Update: {lastSyncTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
          </div>

          {/* ISI PUSAT NOTIFIKASI */}
          {showNotif && (
            <div className="absolute top-[76px] left-4 right-4 md:left-auto md:right-8 md:w-[380px] bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50 animation-fade-in">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Bell size={16} /> Pusat Notifikasi
                </h3>
                <button onClick={() => setShowNotif(false)} className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"><X size={16}/></button>
              </div>

              <div className="space-y-3 max-h-[350px] overflow-y-auto no-scrollbar pb-2 pr-1">
                {deadlineTasks.length > 0 ? (
                  <div className="mb-4">
                    <h4 className="text-xs font-bold text-slate-700 mb-2.5 flex items-center gap-1.5">
                      <Clock size={14} className="text-rose-500"/> Mendekati Deadline
                    </h4>
                    <div className="space-y-2">
                      {deadlineTasks.map(t => (
                        <div key={t.id} className="bg-rose-50 p-3 rounded-xl border border-rose-100 flex justify-between items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-rose-900 leading-tight mb-0.5 truncate">{t.title}</p>
                            <p className="text-[9px] text-rose-700 truncate">{t.project} • PIC: <b className="font-bold">{t.picName}</b></p>
                          </div>
                          <div className="text-right shrink-0 bg-white px-2 py-1.5 rounded-lg shadow-sm border border-rose-100">
                            <p className="text-[10px] font-black text-rose-800">{new Date(t.date).toLocaleDateString('id-ID', {day:'numeric', month:'short'})}</p>
                            <p className="text-[8px] font-bold text-rose-500 uppercase tracking-wider">{t.time}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center mb-4">
                    <CheckCircle2 size={24} className="mx-auto text-slate-300 mb-1"/>
                    <p className="text-[11px] text-slate-500 font-medium">Tim aman! Tidak ada tugas yang mendekati deadline.</p>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <History size={14} className="text-orange-500"/> Aktivitas Terbaru Tim
                  </h4>
                  <div className="space-y-2">
                    {activities.length > 0 ? activities.slice(0, 5).map((act, i) => {
                      const IconComp = getIconComponent(act.icon);
                      // Mapping old colors to new theme
                      let bgClass = act.bg; let textClass = act.color;
                      if(act.bg === 'bg-blue-50' || act.bg === 'bg-emerald-50') bgClass = 'bg-orange-50';
                      if(act.color === 'text-blue-500' || act.color === 'text-emerald-500') textClass = 'text-orange-500';
                      if(act.bg === 'bg-orange-50' && (act.icon === 'Clock' || act.icon === 'AlertTriangle')) { bgClass = 'bg-rose-50'; textClass = 'text-rose-500'; }

                      return (
                        <div key={act.id || i} className="flex gap-3 items-start bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                          <div className={`p-2 rounded-lg shrink-0 ${bgClass} ${textClass}`}>
                            <IconComp size={14}/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-700 leading-snug">{act.msg}</p>
                            <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-400 font-medium">
                              <span className="text-orange-600 truncate max-w-[100px]">{act.user}</span><span>•</span><span>{formatTimeAgo(act.time)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }) : (
                       <p className="text-[10px] text-center text-slate-400 py-2">Belum ada aktivitas baru.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* State Preservation dengan CSS class (block/hidden) */}
        <main className="flex-1 min-h-0 overflow-y-auto p-4 no-scrollbar md:p-8 lg:p-10 relative" onClick={() => showNotif && setShowNotif(false)}>
          <div className={activeTab === 'beranda' ? 'block' : 'hidden'}>
            <BerandaView userName={user.name} tasks={tasks} activities={activities} />
          </div>
          <div className={activeTab === 'tugas' ? 'block' : 'hidden'}>
            <TugasView databaseProyek={databaseProyek} user={user} tasks={tasks} handleAddActivity={handleAddActivity} currentYear={currentYear} />
          </div>
          <div className={activeTab === 'survei' ? 'block' : 'hidden'}>
            <SurveiView title="Survei & Setup Proyek" databaseProyek={databaseProyek} handleAddActivity={handleAddActivity} />
          </div>
          <div className={activeTab === 'progres' ? 'block' : 'hidden'}>
            <ProgresPPTView title="Laporan Progres" databaseProyek={databaseProyek} handleAddActivity={handleAddActivity} />
          </div>
          <div className={activeTab === 'katalog' ? 'block' : 'hidden'}>
            <KatalogView user={user} catalogItems={catalogItems} catalogLoans={catalogLoans} handleAddActivity={handleAddActivity} />
          </div>
          <div className={activeTab === 'formulir' ? 'block' : 'hidden'}>
            <FormulirView user={user} forms={forms} handleAddActivity={handleAddActivity} />
          </div>
          <div className={activeTab === 'kinerja' ? 'block' : 'hidden'}>
            <KinerjaView tasks={tasks} catalogLoans={catalogLoans} currentYear={currentYear} handleAddActivity={handleAddActivity} />
          </div>
        </main>

        <nav className="md:hidden shrink-0 w-full bg-white border-t border-slate-200 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1">
          <div className="flex justify-around items-center px-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center p-1.5 flex-1 transition-all duration-200 ${isActive ? 'text-orange-500 -translate-y-1' : 'text-slate-400 hover:text-slate-600'}`}>
                  <div className={`p-1.5 rounded-xl ${isActive ? 'bg-orange-50 shadow-sm' : ''}`}><Icon size={20} strokeWidth={isActive ? 2.5 : 2} /></div>
                  <span className={`text-[9px] mt-1 ${isActive ? 'font-bold' : 'font-medium'} line-clamp-1`}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        </div>
      </div>
    </div>
  );
}

/* ================= KOMPONEN HALAMAN BERANDA ================= */
function BerandaView({ userName, tasks, activities }) {
  const activeTasksCount = tasks.filter(t => t.status !== 'Done' && !t.isDeleted).length;
  const deadlineTasksCount = tasks.filter(t => {
    if (t.status === 'Done' || t.isDeleted) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const taskDate = new Date(t.date); taskDate.setHours(0,0,0,0);
    const diffDays = Math.ceil((taskDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  }).length;

  return (
    <div className="space-y-6 animation-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Halo, {userName}! 👋</h2>
        <p className="text-sm text-slate-500 mt-0.5">Ringkasan aktivitas sistem hari ini.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-2 relative overflow-hidden">
          <div className="p-2 bg-orange-50 text-orange-500 rounded-xl w-fit relative z-10"><CalendarCheck size={20}/></div>
          <p className="text-slate-500 text-xs font-medium relative z-10">Tugas Aktif</p>
          <p className="text-2xl font-black text-slate-800 relative z-10">{activeTasksCount}</p>
          <div className="absolute -bottom-4 -right-4 text-slate-50 opacity-50 z-0"><CalendarCheck size={64}/></div>
        </div>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-2 relative overflow-hidden">
          <div className="p-2 bg-rose-50 text-rose-500 rounded-xl w-fit relative z-10"><Clock size={20}/></div>
          <p className="text-slate-500 text-xs font-medium relative z-10">Dekat Deadline</p>
          <p className="text-2xl font-black text-rose-600 relative z-10">{deadlineTasksCount}</p>
          <div className="absolute -bottom-4 -right-4 text-rose-50 opacity-30 z-0"><Clock size={64}/></div>
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800">Aktivitas Terakhir</h3></div>
        <div className="space-y-4">
          {activities.length === 0 ? <p className="text-xs text-slate-400 text-center py-4">Belum ada aktivitas di Cloud.</p> : activities.slice(0, 5).map((item, i) => {
              const IconComp = getIconComponent(item.icon);
              let bgClass = item.bg; let textClass = item.color;
              if(item.bg === 'bg-blue-50' || item.bg === 'bg-emerald-50') bgClass = 'bg-orange-50';
              if(item.color === 'text-blue-500' || item.color === 'text-emerald-500') textClass = 'text-orange-500';
              if(item.bg === 'bg-orange-50' && (item.icon === 'Clock' || item.icon === 'AlertTriangle')) { bgClass = 'bg-rose-50'; textClass = 'text-rose-500'; }

              return (
                <div key={item.id || i} className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-full ${bgClass} ${textClass}`}><IconComp size={16} strokeWidth={2.5} /></div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-800 leading-tight">{item.msg}</p>
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500">
                      <User size={10} className="text-slate-400" /><span className="font-medium text-slate-600">{item.user}</span><span>•</span><span>{formatTimeAgo(item.time)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/* ================= KOMPONEN TUGAS VIEW ================= */
function TugasView({ databaseProyek, user, tasks, handleAddActivity, currentYear }) {
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskData, setEditingTaskData] = useState(null); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [proofModal, setProofModal] = useState({ isOpen: false, task: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const proofFileInput = useRef(null);
  const [selectedProof, setSelectedProof] = useState(null);

  const uniquePICs = [...new Set(tasks.map(t => t.picName).filter(name => name && name.trim() !== ""))];
  
  const [newTask, setNewTask] = useState({ title: '', project: '', date: '', time: '', location: '', picName: '', picContact: '', desc: '', points: 0 });

  const handleOpenAddForm = () => {
    if(user.role !== 'Admin') return alert("Hanya Admin yang dapat membuat tugas.");
    setNewTask({title: '', project: '', date: '', time: '', location: '', picName: '', picContact: '', desc: '', points: 0});
    setEditingTaskData(null);
    setIsAddingTask(true);
  };

  const handleOpenEditForm = (task) => {
    if(user.role !== 'Admin') return alert("Hanya Admin yang dapat mengedit tugas.");
    setNewTask({...task, points: task.points || 0});
    setEditingTaskData(task);
    setIsAddingTask(true);
  };

  const handleSaveTask = async () => {
    if (!newTask.title || !newTask.project || !newTask.date || !newTask.time || !newTask.picName) {
      return alert('Judul, Proyek, Tanggal, Waktu, dan Nama PIC wajib diisi!');
    }
    setIsSubmitting(true);
    try {
      if (editingTaskData) {
        await updateDoc(getDoc('tasks', editingTaskData.id), newTask);
        handleAddActivity(`Mengedit tugas "${newTask.title}" untuk ${newTask.picName}`, 'Edit2', 'text-orange-500', 'bg-orange-50');
      } else {
        const addedTask = { ...newTask, status: 'To Do', doneAt: null, proofUrl: null, isDeleted: false, createdAt: new Date().toISOString() };
        await addDoc(getCol('tasks'), addedTask);
        handleAddActivity(`Assign tugas baru "${newTask.title}" ke ${newTask.picName}`, 'CalendarCheck', 'text-orange-500', 'bg-orange-50');
      }
      setIsAddingTask(false);
    } catch (error) { alert("Gagal menyimpan ke Database."); } finally { setIsSubmitting(false); }
  };

  const handleStatusChange = async (task, newStatus) => {
    if (newStatus === 'Done') {
      setProofModal({ isOpen: true, task });
    } else {
      try { 
        await updateDoc(getDoc('tasks', task.id), { status: newStatus, doneAt: null }); 
        handleAddActivity(`Status "${task.title}" jadi ${newStatus}`, 'RefreshCw', 'text-orange-500', 'bg-orange-50'); 
      } catch (error) { console.error(error); }
    }
  };

  const handleUploadProof = async () => {
    if (!selectedProof) return alert("Pilih foto screenshot tugas terlebih dahulu!");
    setIsSubmitting(true);
    setUploadProgress(20);

    try {
       const task = proofModal.task;
       const base64Data = await fileToBase64(selectedProof);
       setUploadProgress(50);
       
       const safeFileName = `Submit_Tugas_${task.picName}_${new Date().getTime()}.jpg`;
       let taskYear = new Date(task.date).getFullYear().toString();
       let taskCategory = "Umum";
       const folderPathStr = `APP DKPM/Proyek ${taskYear}/${taskCategory}/${task.project}/09. SUBMISSION/Task Submit App`;

       const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "uploadCatalog",
            folderPath: folderPathStr,
            fileData: { name: safeFileName, mimeType: base64Data.mimeType, base64: base64Data.base64 },
            title: `Bukti Tugas ${task.title}`,
            fileName: safeFileName
          }),
        });
        
        let resultText = await response.text();
        let result = JSON.parse(resultText);
        setUploadProgress(85);

        if (result && result.status === 'success' && result.url) {
           await updateDoc(getDoc('tasks', task.id), { 
             status: 'Done', 
             doneAt: new Date().toISOString(),
             proofUrl: result.url 
           });
           handleAddActivity(`"${task.picName}" menyelesaikan tugas "${task.title}" dengan bukti foto`, 'CheckCircle2', 'text-green-500', 'bg-green-50');
        } else {
           throw new Error(result.message || "Gagal mendapatkan tautan dari Drive.");
        }
        
        setUploadProgress(100);
        setTimeout(() => {
           setIsSubmitting(false);
           setProofModal({ isOpen: false, task: null });
           setSelectedProof(null);
           setUploadProgress(0);
        }, 500);

    } catch (error) {
       console.error(error);
       setIsSubmitting(false);
       setUploadProgress(0);
       alert("Gagal mengunggah bukti: " + error.message);
    }
  };

  const executeDeleteTask = async () => {
    if(!deleteConfirm) return;
    try {
      await updateDoc(getDoc('tasks', deleteConfirm.id), { isDeleted: true });
      handleAddActivity(`Admin menghapus (arsip) tugas "${deleteConfirm.title}"`, 'Trash2', 'text-red-500', 'bg-red-50');
      setDeleteConfirm(null);
    } catch(err) {
      alert("Gagal menghapus tugas: " + err.message);
    }
  };

  const yearlyTasks = tasks.filter(task => {
    if(!task.date || task.isDeleted) return false;
    const taskYear = new Date(task.date).getFullYear().toString();
    return taskYear === selectedYear;
  });

  const visibleTasks = yearlyTasks.filter(task => {
    if (task.status !== 'Done') return true; 
    if (!task.doneAt) return true; 
    const diffDays = (new Date() - new Date(task.doneAt)) / (1000 * 3600 * 24);
    return diffDays <= 3; 
  });

  const handleExportYearlyReport = async () => {
    if(yearlyTasks.length === 0) return alert(`Tidak ada data tugas aktif di tahun ${selectedYear}`);
    setIsExporting(true);
    try {
      const fileName = `Arsip_Tugas_Tahun_${selectedYear}.pdf`;
      const gdriveFolder = `APP DKPM/Arsip Laporan Tahunan/Tahun ${selectedYear}`;
      await executePDFExport('task-report-template', fileName, gdriveFolder, setUploadProgress);
      handleAddActivity(`Ekspor & Arsip Laporan Tugas ${selectedYear} ke Cloud`, 'Archive', 'text-indigo-500', 'bg-indigo-50');
      alert(`Arsip Tugas Tahun ${selectedYear} berhasil disimpan ke G-Drive!`);
    } catch (err) { alert("Gagal Export: " + err.message); } finally { setIsExporting(false); setUploadProgress(0); }
  };

  const getStatusColor = (status) => {
    switch(status) { case 'To Do': return 'bg-slate-100 text-slate-700 border-slate-200'; case 'In Progress': return 'bg-orange-100 text-orange-700 border-orange-200'; case 'Done': return 'bg-green-100 text-green-700 border-green-200'; default: return 'bg-slate-100 text-slate-700 border-slate-200'; }
  };

  if (isAddingTask) {
    return (
      <div className="space-y-5 animation-fade-in">
        <div className="flex justify-between items-center">
          <div><h2 className="text-xl font-bold text-slate-800">{editingTaskData ? 'Edit Tugas' : 'Buat Tugas Baru'}</h2></div>
          <button onClick={() => setIsAddingTask(false)} className="bg-slate-100 text-slate-500 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200"><X size={18} /></button>
        </div>

        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div className="bg-orange-50 border border-orange-100 text-orange-800 text-[10px] p-2 rounded-lg font-medium flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-600"/> Hak Akses: Form ini hanya dapat digunakan oleh Admin untuk mengassign tugas ke tim.
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">1. Judul / Tugas</label>
            <input type="text" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">2. Nama Proyek</label>
            <input type="text" list="project-list" value={newTask.project} onChange={e => setNewTask({...newTask, project: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
            <datalist id="project-list">{databaseProyek.map((proj, idx) => <option key={idx} value={proj} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">3. Tanggal Deadline</label>
              <input type="date" value={newTask.date} onChange={e => setNewTask({...newTask, date: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Waktu / Jam</label>
              <input type="time" value={newTask.time} onChange={e => setNewTask({...newTask, time: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">4. Nama PIC (Assign Ke)</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input type="text" list="pic-history-list" placeholder="Pilih atau ketik..." value={newTask.picName} onChange={e => setNewTask({...newTask, picName: e.target.value})} className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
                <datalist id="pic-history-list">
                  {uniquePICs.map((name, idx) => <option key={idx} value={name} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Skor Poin Kinerja</label>
              <input type="number" value={newTask.points || ''} onChange={e => setNewTask({...newTask, points: parseInt(e.target.value) || 0})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" placeholder="Cth: 10" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">5. Keterangan Tambahan</label>
            <div className="relative">
              <AlignLeft className="absolute left-3 top-3 text-slate-400" size={16} />
              <textarea rows="3" value={newTask.desc} onChange={e => setNewTask({...newTask, desc: e.target.value})} className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-orange-500" />
            </div>
          </div>
          <div className="flex gap-2 pt-3">
            <button disabled={isSubmitting} onClick={() => setIsAddingTask(false)} className="flex-1 bg-slate-100 text-slate-700 font-bold py-3.5 rounded-xl text-sm hover:bg-slate-200 transition-all disabled:opacity-50">Batal</button>
            <button disabled={isSubmitting} onClick={handleSaveTask} className="flex-1 bg-orange-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-md hover:bg-orange-700 transition-all disabled:opacity-50">
              {isSubmitting ? 'Menyimpan...' : (editingTaskData ? 'Perbarui' : 'Simpan Tugas')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animation-fade-in relative">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Daftar Tugas</h2>
          <div className="flex items-center gap-2 mt-1">
            <CalendarDays size={14} className="text-orange-500" />
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-sm font-bold text-orange-600 outline-none cursor-pointer">
              <option value={(parseInt(currentYear) - 1).toString()}>{parseInt(currentYear) - 1}</option>
              <option value={currentYear}>{currentYear}</option>
              <option value={(parseInt(currentYear) + 1).toString()}>{parseInt(currentYear) + 1}</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportYearlyReport} disabled={isExporting} className="bg-white border border-slate-200 text-slate-600 p-2 rounded-xl shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50" title="Arsip Laporan Tahunan">
             {isExporting ? <span className="text-[10px] font-bold animate-pulse">{uploadProgress}%</span> : <Archive size={18} />}
          </button>
          {user.role === 'Admin' && (
            <button onClick={handleOpenAddForm} className="bg-orange-500 text-white p-2 px-3 rounded-xl flex items-center gap-1 shadow-md hover:bg-orange-600 transition-colors">
              <Plus size={16} /><span className="text-xs font-bold">Tugas</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex justify-between items-center">
        <div>
           <p className="text-[10px] text-orange-800 font-bold">Filter Aktif: Tahun {selectedYear}</p>
           <p className="text-[9px] text-orange-600 mt-0.5">Daftar otomatis ter-reset/disembunyikan berganti tahun.</p>
        </div>
        <div className="text-right">
           <span className="text-lg font-black text-orange-700">{yearlyTasks.length}</span>
           <p className="text-[8px] uppercase font-bold text-orange-500">Total Tugas</p>
        </div>
      </div>

      <div className="space-y-3 pb-6">
        {visibleTasks.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <CalendarCheck size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">Belum ada tugas di tahun {selectedYear}.</p>
          </div>
        ) : (
          visibleTasks.map((task) => (
            <div key={task.id} className={`bg-white p-4 rounded-2xl shadow-sm border ${task.status === 'Done' ? 'border-green-100 opacity-90' : 'border-slate-100'} relative group`}>
              <div className="flex justify-between items-start mb-2">
                <select value={task.status} onChange={(e) => handleStatusChange(task, e.target.value)} className={`appearance-none px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider outline-none cursor-pointer shadow-sm text-center border ${getStatusColor(task.status)}`}>
                  <option value="To Do">TO DO</option><option value="In Progress">IN PROGRESS</option><option value="Done">DONE</option>
                </select>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${task.status === 'Done' ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                    <Clock size={12}/> {new Date(task.date).toLocaleDateString('id-ID', {day:'numeric', month:'short'})}, {task.time}
                  </span>
                  {user.role === 'Admin' && (
                    <div className="flex items-center gap-1 ml-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenEditForm(task)} className="text-slate-400 hover:text-orange-600 p-1 bg-slate-50 hover:bg-orange-50 rounded" title="Edit Tugas"><Edit2 size={12} /></button>
                      <button onClick={() => setDeleteConfirm(task)} className="text-slate-400 hover:text-red-600 p-1 bg-slate-50 hover:bg-red-50 rounded" title="Hapus Tugas (Tidak memotong skor Kinerja)"><Trash2 size={12} /></button>
                    </div>
                  )}
                </div>
              </div>
              <h3 className={`font-bold leading-tight ${task.status === 'Done' ? 'text-slate-500' : 'text-slate-800'}`}>
                {task.title}
                {task.points > 0 && <span className="inline-block align-middle ml-2 text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">{task.points} Pts</span>}
              </h3>
              {task.desc && <div className="mt-2 mb-1 p-2 rounded-r-lg border-l-2 bg-slate-50 border-slate-300"><p className="text-[10px] italic leading-snug text-slate-500">"{task.desc}"</p></div>}
              
              <div className="mt-2 space-y-1">
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5"><FolderOpen size={12} className="text-orange-500"/> {task.project}</p>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-[9px]">
                  {task.picName ? task.picName.substring(0,2).toUpperCase() : 'NN'}
                </div>
                  <span className="text-xs font-bold text-slate-700">{task.picName}</span>
                </div>
                {task.proofUrl && (
                  <button onClick={() => window.open(task.proofUrl, '_blank')} className="flex items-center gap-1 text-[9px] font-bold text-orange-600 bg-orange-50 px-2.5 py-1.5 rounded-lg hover:bg-orange-100 transition-colors shadow-sm">
                    <LinkIcon size={10} /> Cek Bukti Kerja
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {proofModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animation-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
             <button disabled={isSubmitting} onClick={() => setProofModal({ isOpen: false, task: null })} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
             <h3 className="text-lg font-black text-slate-800 mb-1">Tugas Selesai?</h3>
             <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">Wajib melampirkan screenshot/foto bukti kerja. Foto akan diarsip di G-Drive folder `09. SUBMISSION`.</p>
             
             <div className="border-2 border-dashed border-orange-200 bg-orange-50/50 rounded-2xl p-4 text-center mb-5">
               <Camera size={24} className="text-orange-500 mx-auto mb-2" />
               <p className="text-xs font-bold text-orange-800 mb-1">{selectedProof ? selectedProof.name : 'Pilih Foto / Screenshot'}</p>
               <input type="file" accept="image/*" onChange={(e) => setSelectedProof(e.target.files[0])} className="hidden" ref={proofFileInput} />
               <button onClick={() => proofFileInput.current?.click()} className="mt-2 bg-white border border-orange-200 text-orange-600 px-4 py-1.5 rounded-lg text-[10px] font-bold shadow-sm">Buka Galeri/Kamera</button>
             </div>

             {isSubmitting && (
               <div className="mb-4">
                 <div className="flex justify-between text-[10px] font-bold text-orange-700 mb-1"><span>Mengunggah ke G-Drive...</span><span>{uploadProgress}%</span></div>
                 <div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden"><div className="bg-orange-500 h-2 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div>
               </div>
             )}

             <button disabled={isSubmitting} onClick={handleUploadProof} className="w-full py-3 bg-orange-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-orange-700 transition-colors disabled:opacity-50">
               {isSubmitting ? 'Memproses...' : 'Submit Tugas & Bukti'}
             </button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animation-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
             <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 mx-auto"><AlertTriangle size={28} /></div>
             <h3 className="text-lg font-black text-slate-800 mb-2 text-center">Hapus Tugas?</h3>
             <p className="text-sm text-slate-500 mb-6 text-center leading-relaxed">Anda yakin ingin menghapus tugas <b className="text-slate-700">"{deleteConfirm.title}"</b>? (Skor tim yang sudah didapat tidak akan berkurang).</p>
             <div className="flex gap-3 justify-center">
               <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold">Batal</button>
               <button onClick={executeDeleteTask} className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-red-700">Ya, Hapus</button>
             </div>
          </div>
        </div>
      )}

      {/* TEMPLATE PDF ARSIP TUGAS TAHUNAN */}
      <div id="task-report-template" style={{ display: 'none', background: '#fff', padding: '15mm', fontFamily: 'sans-serif', width: '297mm', color: '#1e293b' }}>
         <h1 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '24px', fontWeight: 'bold' }}>REKAPITULASI TUGAS PROYEK</h1>
         <h3 style={{ textAlign: 'center', margin: '0 0 30px 0', fontSize: '16px', color: '#64748b' }}>Tahun Laporan: {selectedYear}</h3>
         <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
               <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>No</th><th style={{ padding: '10px', textAlign: 'left' }}>Nama Tugas</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Proyek</th><th style={{ padding: '10px', textAlign: 'left' }}>PIC (Person)</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Deadline</th><th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
               </tr>
            </thead>
            <tbody>
               {yearlyTasks.sort((a,b) => new Date(a.date) - new Date(b.date)).map((t, i) => (
                 <tr key={i} className="pdf-page-break" style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px' }}>{i + 1}</td><td style={{ padding: '10px', fontWeight: 'bold' }}>{t.title}</td>
                    <td style={{ padding: '10px' }}>{t.project}</td><td style={{ padding: '10px', color: '#f97316', fontWeight: 'bold' }}>{t.picName}</td>
                    <td style={{ padding: '10px' }}>{t.date} {t.time}</td><td style={{ padding: '10px' }}>{t.status}</td>
                 </tr>
               ))}
            </tbody>
         </table>
         <p style={{ marginTop: '30px', fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>Dicetak oleh Sistem Design App DKPM pada {new Date().toLocaleDateString('id-ID')}</p>
      </div>
    </div>
  );
}

/* ================= KOMPONEN KINERJA VIEW ================= */
function KinerjaView({ tasks, catalogLoans, currentYear, handleAddActivity }) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const yearlyTasksForKinerja = tasks.filter(task => {
    // FIX 1: Pengecualian tugas yang telah dihapus (diarsip/isDeleted = true)
    if(!task.date || task.isDeleted) return false;
    return new Date(task.date).getFullYear().toString() === selectedYear;
  });
  const overdueCatalogLoans = catalogLoans.filter(loan => {
    if (!loan.dueDate || loan.returnedAt) return false;
    const dueDate = new Date(`${loan.dueDate}T${loan.dueTime || '23:59'}:00`);
    return dueDate < new Date() && new Date(loan.dueDate).getFullYear().toString() === selectedYear;
  });

  const calculateKinerja = () => {
    const stats = {};
    const ensurePic = (name) => {
      const pic = name?.trim();
      if (!pic) return null;
      if (!stats[pic]) stats[pic] = { name: pic, score: 100, onTime: 0, late: 0, activeLate: 0, tasksList: [], overdueLoans: [], totalCatalogPenaltyDays: 0 };
      return pic;
    };
    yearlyTasksForKinerja.forEach(task => {
      const pic = ensurePic(task.picName);
      if (pic) stats[pic].tasksList.push(task);
    });
    overdueCatalogLoans.forEach(loan => {
      const pic = ensurePic(loan.picName);
      if (pic) stats[pic].overdueLoans.push(loan);
    });

    const nowTime = new Date();

    Object.keys(stats).forEach(pic => {
      let currentScore = 100;
      let onTimeCount = 0; let lateCount = 0; let activeLateCount = 0;
      let activeLatePenalty = 0; // PERBAIKAN: Tampung penalti aktif terpisah

      // Urutkan tugas berdasarkan tanggal
      const picTasks = stats[pic].tasksList.sort((a, b) => new Date(a.date) - new Date(b.date));

      // 1. Evaluasi semua tugas (fokus poin base dan poin Done terlebih dahulu)
      picTasks.forEach(task => {
        if (!task.date || !task.time) return;
        
        const deadline = new Date(`${task.date}T${task.time || '23:59'}:00`);
        
        if (task.status === 'Done') {
          const doneDate = task.doneAt ? new Date(task.doneAt) : new Date(deadline);

          if (doneDate <= deadline) {
            // Selesai tepat waktu -> tambah/pulihkan poin (maksimal 100)
            const earnedPoints = task.points !== undefined ? Number(task.points) : 1; 
            currentScore += earnedPoints;
            if (currentScore > 100) currentScore = 100; 
            
            onTimeCount++;
          } else {
            // Selesai tapi telat -> langsung potong skor utama
            const diffDays = Math.ceil(Math.abs(doneDate - deadline) / (1000 * 60 * 60 * 24));
            currentScore -= diffDays;
            lateCount++;
          }
        } else {
          // PERBAIKAN: Jika tugas BELUM selesai dan lewat deadline, kumpulkan nilai penaltinya
          if (nowTime > deadline) {
             const diffDays = Math.ceil(Math.abs(nowTime - deadline) / (1000 * 60 * 60 * 24));
             activeLatePenalty += diffDays; 
             activeLateCount++;
          }
        }
      });

      // 2. Hitung penalti dari katalog terlambat
      let totalCatalogPenalty = 0;
      stats[pic].overdueLoans.forEach(loan => {
        if(loan.dueDate) {
          const dueDateObj = new Date(`${loan.dueDate}T${loan.dueTime || '23:59'}:00`);
          if(nowTime > dueDateObj) {
             const diffDays = Math.ceil(Math.abs(nowTime - dueDateObj) / (1000 * 60 * 60 * 24));
             totalCatalogPenalty += diffDays;
          }
        }
      });

      // 3. FINALISASI SKOR: Kurangi base skor akhir dengan penalti tugas aktif dan katalog
      currentScore -= activeLatePenalty;
      currentScore -= totalCatalogPenalty;
      
      stats[pic].score = currentScore;
      stats[pic].onTime = onTimeCount;
      stats[pic].late = lateCount;
      stats[pic].activeLate = activeLateCount;
      stats[pic].totalCatalogPenaltyDays = totalCatalogPenalty;
    });

    return Object.values(stats).sort((a, b) => b.score - a.score);
  };
  const leaderboard = calculateKinerja();

  const handleExportPerformanceReport = async () => {
    if(leaderboard.length === 0) return alert(`Belum ada data kinerja di tahun ${selectedYear}`);
    setIsExporting(true);
    try {
      const fileName = `Laporan_Kinerja_Tim_${selectedYear}.pdf`;
      const gdriveFolder = `APP DKPM/Arsip Laporan Tahunan/Tahun ${selectedYear}`;
      await executePDFExport('kinerja-report-template', fileName, gdriveFolder, setUploadProgress);
      handleAddActivity(`Ekspor Report Kinerja Tim ${selectedYear} ke Cloud`, 'Award', 'text-yellow-500', 'bg-yellow-50');
      alert(`Laporan Kinerja Tahun ${selectedYear} berhasil disimpan ke G-Drive!`);
    } catch (err) { alert("Gagal Export: " + err.message); } finally { setIsExporting(false); setUploadProgress(0); }
  };

  const avgScore = leaderboard.length > 0 ? Math.round(leaderboard.reduce((acc, curr) => acc + curr.score, 0) / leaderboard.length) : 0;
  const bestPerformer = leaderboard.length > 0 ? leaderboard[0].name : '-';
  const totalTasksEvaluated = leaderboard.reduce((acc, curr) => acc + curr.tasksList.length, 0);

  return (
    <div className="space-y-5 animation-fade-in pb-4">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Kinerja Tim</h2>
          <div className="flex items-center gap-2 mt-1">
            <CalendarDays size={14} className="text-orange-500" />
            <select value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="bg-transparent text-sm font-bold text-orange-600 outline-none cursor-pointer">
              <option value={(parseInt(currentYear) - 1).toString()}>{parseInt(currentYear) - 1}</option>
              <option value={currentYear}>{currentYear}</option>
              <option value={(parseInt(currentYear) + 1).toString()}>{parseInt(currentYear) + 1}</option>
            </select>
          </div>
        </div>
        <button onClick={handleExportPerformanceReport} disabled={isExporting} className="bg-orange-600 text-white p-2 px-3 rounded-xl flex items-center gap-1.5 shadow-md hover:bg-orange-700 transition-colors disabled:opacity-50">
          {isExporting ? <span className="text-xs font-bold animate-pulse">{uploadProgress}%</span> : <><Download size={14} /><span className="text-xs font-bold">Cetak Rapor</span></>}
        </button>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-3 flex gap-3">
        <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-orange-800 leading-relaxed font-medium">
          <b>Aturan Main:</b> Skor maksimal adalah <b>100 poin</b>. Submit tugas tepat waktu akan memulihkan poin yang hilang (skor kembali naik maksimal ke 100). Jika terlambat, poin tambahan tugas <b>hangus</b> dan skor dikurangi 1 poin/hari. Katalog terlambat juga mengurangi <b>1 poin per hari</b>.
        </p>
      </div>

      <div className="space-y-3">
        {leaderboard.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Award size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">Data Kosong</p>
          </div>
        ) : (
          leaderboard.map((emp, index) => {
            let colorTheme = 'text-green-600 bg-green-50 border-green-200'; let barColor = 'bg-green-500';
            if (emp.score < 75) { colorTheme = 'text-red-600 bg-red-50 border-red-200'; barColor = 'bg-red-500'; } 
            else if (emp.score < 90) { colorTheme = 'text-yellow-600 bg-yellow-50 border-yellow-200'; barColor = 'bg-yellow-500'; }

            return (
              <div key={emp.name} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-slate-100 text-slate-400 text-[10px] font-black px-3 py-1 rounded-bl-xl">#{index + 1}</div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center text-slate-700 font-black text-lg shrink-0">
                    {emp.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 text-base leading-tight">{emp.name}</h3>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">Tugas Selesai: {emp.onTime + emp.late} / {emp.tasksList.length} · Pinjaman telat: {emp.overdueLoans.length} (-{emp.totalCatalogPenaltyDays} hari)</p>
                  </div>
                  <div className={`px-3 py-1.5 rounded-xl border flex flex-col items-center justify-center min-w-[65px] ${colorTheme}`}>
                     <span className="text-lg font-black leading-none">{emp.score}</span><span className="text-[8px] font-bold uppercase tracking-wider mt-0.5">Point</span>
                  </div>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden"><div className={`h-1.5 rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, emp.score))}%` }}></div></div>

                <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100">
                  <div className="flex flex-col items-center"><span className="flex items-center gap-1 text-[10px] font-bold text-green-600"><CheckCircle2 size={10}/> On Time</span><span className="text-sm font-black text-slate-700 mt-0.5">{emp.onTime}</span></div>
                  <div className="flex flex-col items-center border-x border-slate-100"><span className="flex items-center gap-1 text-[10px] font-bold text-yellow-500"><TrendingDown size={10}/> Telat Selesai</span><span className="text-sm font-black text-slate-700 mt-0.5">{emp.late}</span></div>
                  <div className="flex flex-col items-center"><span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><Clock size={10}/> Sedang Telat</span><span className="text-sm font-black text-slate-700 mt-0.5">{emp.activeLate}</span></div>
                  <div className="flex flex-col items-center border-l border-slate-100"><span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><FolderOpen size={10}/> Penalti Katalog</span><span className="text-sm font-black text-slate-700 mt-0.5">-{emp.totalCatalogPenaltyDays} Pts</span></div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {leaderboard.length > 0 && (
        <div className="bg-slate-800 rounded-3xl p-5 shadow-lg mt-6 text-white relative overflow-hidden">
           <div className="absolute -right-4 -bottom-4 opacity-10"><Award size={120} /></div>
           <h3 className="text-sm font-black mb-4 flex items-center gap-2"><TrendingUp size={16}/> Rekap Kinerja {selectedYear}</h3>
           <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="bg-slate-700/50 p-3 rounded-2xl border border-slate-600"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Rata-Rata Tim</p><p className="text-2xl font-black text-green-400">{avgScore} <span className="text-xs">Pts</span></p></div>
              <div className="bg-slate-700/50 p-3 rounded-2xl border border-slate-600"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Top Performer</p><p className="text-sm font-black text-orange-400 mt-1 uppercase line-clamp-1">{bestPerformer}</p></div>
              <div className="col-span-2 bg-slate-700/50 p-3 rounded-2xl border border-slate-600 flex justify-between items-center"><span className="text-xs font-bold text-slate-300">Total Tugas Dievaluasi:</span><span className="text-lg font-black text-white">{totalTasksEvaluated}</span></div>
           </div>
        </div>
      )}

      {/* TEMPLATE PDF KINERJA (HIDDEN) */}
      <div id="kinerja-report-template" style={{ display: 'none', background: '#fff', padding: '15mm', fontFamily: 'sans-serif', width: '297mm', color: '#1e293b' }}>
         <h1 style={{ textAlign: 'center', margin: '0 0 5px 0', fontSize: '24px', fontWeight: 'bold' }}>LAPORAN EVALUASI KINERJA TIM</h1>
         <h3 style={{ textAlign: 'center', margin: '0 0 20px 0', fontSize: '16px', color: '#64748b' }}>Tahun {selectedYear}</h3>
         
         <div style={{ display: 'flex', justifyContent: 'space-around', backgroundColor: '#f1f5f9', padding: '15px', borderRadius: '10px', marginBottom: '30px', fontWeight: 'bold' }}>
            <span>Rata-Rata Skor Tim: {avgScore} Poin</span><span>Total Tugas Dievaluasi: {totalTasksEvaluated}</span><span>Performa Terbaik: {bestPerformer}</span>
         </div>

         {leaderboard.map((emp, idx) => (
           <div key={idx} className="pdf-page-break" style={{ marginBottom: '30px', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #f97316', paddingBottom: '10px', marginBottom: '15px' }}>
                 <h2 style={{ margin: 0, fontSize: '18px', color: '#1e293b', fontWeight: '900' }}>#{idx+1} {emp.name}</h2>
                 <div style={{ fontSize: '14px', fontWeight: 'bold' }}><span style={{ color: emp.score >= 90 ? '#16a34a' : emp.score >= 75 ? '#ea580c' : '#dc2626' }}>Skor Akhir: {emp.score} Poin</span></div>
              </div>
              <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#64748b' }}>Ringkasan: {emp.onTime} Tepat Waktu | {emp.late} Terlambat | {emp.activeLate} Belum Selesai (Lewat Deadline) | {emp.overdueLoans.length} Katalog Belum Kembali (-{emp.totalCatalogPenaltyDays} Poin)</p>
              {emp.overdueLoans.length > 0 && <p style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#dc2626', fontWeight: 'bold' }}>Katalog terlambat: {emp.overdueLoans.map(loan => loan.catalogTitle).join(', ')}</p>}
              
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}><th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Nama Tugas</th><th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Proyek</th><th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Deadline</th><th style={{ border: '1px solid #e2e8f0', padding: '6px', textAlign: 'left' }}>Status</th></tr>
                </thead>
                <tbody>
                  {emp.tasksList.sort((a,b) => new Date(a.date) - new Date(b.date)).map((t, i) => (
                    <tr key={i}>
                       <td style={{ border: '1px solid #e2e8f0', padding: '6px' }}>{t.title}</td><td style={{ border: '1px solid #e2e8f0', padding: '6px' }}>{t.project}</td>
                       <td style={{ border: '1px solid #e2e8f0', padding: '6px' }}>{t.date}</td><td style={{ border: '1px solid #e2e8f0', padding: '6px', color: t.status === 'Done' ? '#16a34a' : '#ea580c', fontWeight:'bold' }}>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
           </div>
         ))}
      </div>
    </div>
  );
}

/* ================= KOMPONEN SURVEI ================= */
function SurveiView({ title, databaseProyek, handleAddActivity }) {
  const [jenisProyek, setJenisProyek] = useState('Panin');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  const [judulProyek, setJudulProyek] = useState('');
  const [keterangan, setKeterangan] = useState('');
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  
  const tahunProyek = tanggal ? new Date(tanggal).getFullYear() : new Date().getFullYear();

  const filteredProjects = judulProyek ? databaseProyek.filter(p => p.toLowerCase().includes(judulProyek.toLowerCase())) : databaseProyek.slice(0, 5); 

  const handleAddProject = async () => {
    if (judulProyek.trim() !== '' && !databaseProyek.includes(judulProyek)) {
      try { await addDoc(getCol('projects'), { name: judulProyek, createdAt: new Date().toISOString() }); alert(`Judul proyek "${judulProyek}" berhasil disimpan ke Firebase Database!`); } catch (error) { console.error("Gagal simpan proyek:", error); }
    }
  };

  const folderStructure = [ "01. DATA & DESIGN BRIEF", "02. SURVEY & PHOTOS", "03. DWG FILES", "04. SKETCHUP FILES", "05. DESIGN PRESENTATION", "06. BILL OF QUANTITY", "07. MATERIAL & SPECIFICATION", "08. METODE & TIME SCHEDULE", "09. SUBMISSION", "10. APPROVAL & FEEDBACK", "11. PDF" ];

  const handlePhotoSelection = (e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files); setSelectedFiles(prev => [...prev, ...filesArray]);
      const previewsArray = filesArray.map(file => URL.createObjectURL(file)); setPhotoPreviews(prev => [...prev, ...previewsArray]);
    }
  };

  const handleRemovePhoto = (index) => { setSelectedFiles(prev => prev.filter((_, i) => i !== index)); setPhotoPreviews(prev => prev.filter((_, i) => i !== index)); };

  const handleSaveData = async () => {
    if (!judulProyek) return alert("Pilih atau ketik Judul Proyek terlebih dahulu!");
    setIsSubmitting(true); 
    setUploadProgress(5);

    try {
      // TAHAP 1: Buat Folder Utama
      const responseFolder = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ 
          action: "createSurveyFoldersOnly", 
          projectName: judulProyek, 
          projectYear: tahunProyek, 
          projectCategory: jenisProyek, 
          briefText: keterangan 
        }),
      });
      
      const resultFolder = await responseFolder.json();
      if (resultFolder.status !== "success") throw new Error("Gagal membuat folder: " + resultFolder.message);
      
      const targetFolderId = resultFolder.folderId; 
      
      // TAHAP 2: Unggah Foto
      if (selectedFiles.length > 0) {
        const totalPhotos = selectedFiles.length;
        let uploaded = 0;
        let failed = 0;

        for (let i = 0; i < totalPhotos; i++) {
          let success = false;
          let attempts = 0;
          const maxAttempts = 3; 

          while (!success && attempts < maxAttempts) {
            attempts++;
            try {
              const base64Data = await fileToBase64(selectedFiles[i]);
              
              const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ 
                  action: "uploadSinglePhoto", 
                  folderId: targetFolderId, 
                  fileData: { 
                    name: selectedFiles[i].name || `Survei_${i+1}.jpg`, 
                    mimeType: selectedFiles[i].type, 
                    base64: base64Data.base64 
                  } 
                }),
              });

              let result;
              try {
                 const text = await response.text();
                 result = JSON.parse(text);
              } catch (parseError) {
                 throw new Error("Respon server tidak valid / Terjadi Timeout dari Google.");
              }

              if (result.status !== "success") {
                 throw new Error(result.message || "Gagal ditolak oleh server.");
              }

              success = true;
              uploaded++;
            } catch (err) {
              console.warn(`Foto ke-${i+1} gagal terunggah (Percobaan ${attempts}):`, err);
              if (attempts === maxAttempts) {
                 failed++; 
              } else {
                 await new Promise(res => setTimeout(res, 2000)); 
              }
            }
          }
          
          setUploadProgress(5 + Math.round(((i + 1) / totalPhotos) * 95));
        }

        handleAddActivity(`Setup Folder Survei "${judulProyek}" & Upload Foto HD`, 'FolderPlus', 'text-green-500', 'bg-green-50'); 
        setSelectedFiles([]); 
        setPhotoPreviews([]); 
        
        setTimeout(() => {
          setIsSubmitting(false); 
          setUploadProgress(0);
          if (failed > 0) {
             alert(`Selesai! ${uploaded} foto berhasil masuk, namun ada ${failed} foto yang gagal karena koneksi terputus/timeout. Silakan upload sisanya secara manual nanti.`);
          } else {
             alert("Sukses! Folder berhasil dibuat dan seluruh foto resolusi tinggi telah diunggah."); 
          }
        }, 600);
      } else {
        handleAddActivity(`Setup Folder Survei "${judulProyek}" (Tanpa Foto)`, 'FolderPlus', 'text-green-500', 'bg-green-50'); 
        setTimeout(() => {
          setIsSubmitting(false); 
          setUploadProgress(0);
          alert("Sukses! Folder proyek berhasil dibuat."); 
        }, 600);
      }

    } catch (error) { 
      setIsSubmitting(false); 
      setUploadProgress(0); 
      alert("Proses terhenti total: " + error.message); 
    }
  };

  return (
    <div className="space-y-5 animation-fade-in">
      <div><h2 className="text-xl font-bold text-slate-800">Survei & Setup Proyek</h2><p className="text-sm text-slate-500 mt-0.5">Setup folder & unggah data awal.</p></div>
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-bl-full z-0 opacity-50"></div>
        <h3 className="font-bold text-slate-800 flex items-center gap-2 relative z-10"><FolderPlus size={18} className="text-orange-600" /> Tahap 1: Setup Proyek</h3>
        <div className="space-y-4 relative z-10">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Kategori Proyek</label>
            <div className="flex bg-slate-100 p-1 rounded-xl"><button onClick={() => setJenisProyek('Panin')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${jenisProyek === 'Panin' ? 'bg-white shadow-sm text-orange-700' : 'text-slate-500 hover:text-slate-700'}`}>Proyek Panin</button><button onClick={() => setJenisProyek('Non Panin')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${jenisProyek === 'Non Panin' ? 'bg-white shadow-sm text-orange-700' : 'text-slate-500 hover:text-slate-700'}`}>Non Panin</button></div>
          </div>
          <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Tanggal Mulai (Filter Tahun)</label><input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-500 outline-none" /><p className="text-[10px] mt-1.5 text-orange-600 font-medium flex items-center gap-1 bg-orange-50 p-1.5 rounded-lg w-fit border border-orange-100"><FolderOpen size={10} /> Folder Induk: <b>Tahun {tahunProyek} &gt; {jenisProyek}</b></p></div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Judul Proyek</label>
            <div className="flex items-center gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" value={judulProyek} onChange={(e) => setJudulProyek(e.target.value)} placeholder="Ketik cari atau buat baru..." className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-orange-500 outline-none" /></div><button onClick={handleAddProject} className="bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-xl shadow-sm transition-colors flex shrink-0"><Plus size={20} /></button></div>
            <div className="mt-2.5">
              <div className="flex items-center gap-1.5 mb-1.5 text-[10px] font-bold text-slate-400 uppercase"><History size={10} /> {judulProyek ? 'Hasil Pencarian:' : 'Proyek Terakhir di Cloud:'}</div>
              {filteredProjects.length > 0 ? ( <div className="flex flex-wrap gap-1.5">{filteredProjects.map((proj, idx) => ( <button key={idx} onClick={() => setJudulProyek(proj)} className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 text-[10px] font-medium px-2.5 py-1 rounded-full transition-colors">{proj}</button> ))}</div> ) : ( <div className="bg-orange-50 border border-orange-100 rounded-lg p-2 flex items-start gap-2"><AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" /><p className="text-[10px] text-orange-800 font-medium leading-tight">Nama proyek tidak ditemukan. Ketuk tombol <b>+ (Plus)</b> oranye di samping untuk menyimpan nama proyek baru.</p></div> )}
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 mt-4 border border-slate-700 shadow-inner"><p className="text-[10px] text-slate-300 font-bold mb-1.5 flex items-center gap-1.5"><FolderPlus size={12} className="text-orange-400 shrink-0" /><span>Struktur G-Drive Otomatis:</span></p><div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-1.5 h-32 overflow-y-auto no-scrollbar pr-1">{folderStructure.map((folderName, idx) => ( <div key={idx} className="flex items-center gap-1.5 text-[9px] text-slate-400"><FolderOpen size={10} className="text-yellow-500 shrink-0" /><span className="truncate">{folderName}</span></div> ))}</div></div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2"><File size={18} className="text-orange-600" /> Tahap 2: Data Survei</h3>
        <div><label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider flex justify-between">Keterangan / Aanwijzing</label><textarea rows="3" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Ketik catatan brief owner di sini..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none" /></div>
        <div className="pt-2">
          <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Dokumentasi Survei (Akan Diunggah)</label>
          <div className="border-2 border-dashed border-orange-300 bg-orange-50/50 rounded-2xl p-4 transition-colors relative">
            <div className="flex flex-col items-center justify-center text-center py-4">
              <div className="flex gap-3 mb-3">
                <input type="file" multiple accept="image/*" capture="environment" className="hidden" id="survey-camera" onChange={handlePhotoSelection} /><label htmlFor="survey-camera" className="cursor-pointer bg-orange-600 text-white p-3 rounded-full shadow-md hover:bg-orange-700 active:scale-95 transition-all flex flex-col items-center justify-center w-14 h-14"><Camera size={20} /></label>
                <input type="file" multiple accept="image/*" className="hidden" id="survey-upload" onChange={handlePhotoSelection} /><label htmlFor="survey-upload" className="cursor-pointer bg-white border border-slate-200 text-slate-700 p-3 rounded-full shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex flex-col items-center justify-center w-14 h-14"><UploadCloud size={20} /></label>
              </div>
              <p className="text-xs font-bold text-orange-800">Kamera Atau Galeri</p>
            </div>
            {photoPreviews.length > 0 && ( <div className="mt-4 pt-4 border-t border-orange-200/60"><p className="text-[10px] font-bold text-slate-500 mb-2">{photoPreviews.length} Foto Siap Unggah:</p><div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{photoPreviews.map((url, idx) => ( <div key={idx} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 shadow-sm"><img src={url} alt={`Preview ${idx}`} className="w-full h-full object-cover" /><button onClick={() => handleRemovePhoto(idx)} className="absolute top-0.5 right-0.5 bg-red-500 text-white p-0.5 rounded-full shadow-sm scale-75 hover:bg-red-600"><X size={12} /></button></div> ))}</div></div> )}
          </div>
        </div>
        <div className="mt-4">
          {isSubmitting && ( <div className="mb-3"><div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-orange-700">Mengunggah ke G-Drive...</span><span className="text-[10px] font-bold text-orange-700">{uploadProgress}%</span></div><div className="w-full bg-orange-100 rounded-full h-2.5 overflow-hidden"><div className="bg-orange-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div></div> )}
          <button disabled={isSubmitting} onClick={handleSaveData} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl active:bg-orange-700 shadow-md transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-wait"><UploadCloud size={18} /> {isSubmitting ? 'Memproses File...' : 'Buat Folder & Unggah Data'}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= KOMPONEN PROGRES PPT ================= */
function ProgresPPTView({ databaseProyek, handleAddActivity }) {
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Panin'); 
  const today = new Date();
  const reportDate = today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const [reportType, setReportType] = useState('Laporan Progres Mingguan');
  
  const [coverPhoto, setCoverPhoto] = useState({ url: null, x: 50, y: 50 });
  const [logoPhoto, setLogoPhoto] = useState(null);
  const [slides, setSlides] = useState([{ id: 1, layoutPhoto: { url: null, x: 50, y: 50 }, progressPhotos: [ { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 } ], description: '' }]);

  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 

  const handleImageUpload = (e, target, slideIndex = null, photoIndex = null) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      if (target === 'cover') setCoverPhoto({ url, x: 50, y: 50 });
      if (target === 'logo') setLogoPhoto(url);
      if (target === 'layout') { const newSlides = [...slides]; newSlides[slideIndex].layoutPhoto = { url, x: 50, y: 50 }; setSlides(newSlides); }
      if (target === 'progress') { const newSlides = [...slides]; newSlides[slideIndex].progressPhotos[photoIndex] = { url, x: 50, y: 50 }; setSlides(newSlides); }
    }
  };

  const updatePhotoPan = (target, newX, newY, slideIndex = null, photoIndex = null) => {
    if (target === 'cover') setCoverPhoto(prev => ({ ...prev, x: newX, y: newY }));
    if (target === 'layout') { const newSlides = [...slides]; newSlides[slideIndex].layoutPhoto.x = newX; newSlides[slideIndex].layoutPhoto.y = newY; setSlides(newSlides); }
    if (target === 'progress') { const newSlides = [...slides]; newSlides[slideIndex].progressPhotos[photoIndex].x = newX; newSlides[slideIndex].progressPhotos[photoIndex].y = newY; setSlides(newSlides); }
  };

  const handleDescriptionChange = (slideIndex, text) => { const newSlides = [...slides]; newSlides[slideIndex].description = text; setSlides(newSlides); };
  const handleAddSlide = () => { setSlides([...slides, { id: Date.now(), layoutPhoto: { url: null, x: 50, y: 50 }, progressPhotos: [ { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 }, { url: null, x: 50, y: 50 } ], description: '' }]); };
  const handleDuplicateLastSlide = () => { if (slides.length > 0) { const lastSlide = slides[slides.length - 1]; setSlides([...slides, { id: Date.now(), layoutPhoto: { ...lastSlide.layoutPhoto }, progressPhotos: lastSlide.progressPhotos.map(p => ({...p})), description: lastSlide.description }]); } };

  const handleExecuteExport = async (actionType) => {
    if (!selectedProject) return alert("Pilih proyek terlebih dahulu!");
    setIsExporting(true); setUploadProgress(10);
    
    const element = document.getElementById('pdf-template-progres');
    if (!element) { setIsExporting(false); return alert("Template PDF tidak ditemukan."); }
    
    element.style.display = 'block';
    const namaFile = `Laporan_Progres_${selectedProject.replace(/\s+/g, '_')}.pdf`;
    const gdriveFolder = `APP DKPM/Proyek ${today.getFullYear()}/${selectedCategory}/${selectedProject}/11. PDF/Progres Proyek`;
    
    const opt = { margin: [0, 0, 0, 0], filename: namaFile, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['avoid-all'] } };
    
    try {
       if (!window.html2pdf) {
           await new Promise((resolve, reject) => {
               const script = document.createElement('script'); script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
               script.onload = resolve; script.onerror = () => reject(new Error("Gagal memuat library PDF. Cek koneksi internet.")); document.body.appendChild(script);
           });
       }
       setUploadProgress(40);
       const worker = window.html2pdf().set(opt).from(element).toPdf();
       const pdf = await worker.get('pdf');
       const expectedPages = slides.length + 1;
       while (pdf.internal.getNumberOfPages() > expectedPages) { pdf.deletePage(pdf.internal.getNumberOfPages()); }
       
       const pdfBase64DataUri = pdf.output('datauristring'); const base64Str = pdfBase64DataUri.split(',')[1]; setUploadProgress(65);

       if (actionType === 'local' || actionType === 'both') {
           const link = document.createElement('a'); link.href = pdfBase64DataUri; link.download = namaFile; document.body.appendChild(link); link.click(); document.body.removeChild(link);
           handleAddActivity(`Ekspor PDF Lokal HD "${selectedProject}"`, 'Download', 'text-slate-500', 'bg-slate-100');
       }

       if (actionType === 'cloud' || actionType === 'both') {
           setUploadProgress(85);
           const response = await fetch(GOOGLE_SCRIPT_URL, {
              method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({ action: "uploadCatalog", folderPath: gdriveFolder, fileName: namaFile, title: namaFile, fileData: { name: namaFile, mimeType: 'application/pdf', base64: base64Str } }),
            });
            const result = await response.json();
            if(result.status === 'success'){ handleAddActivity(`Upload Laporan PDF HD "${selectedProject}" ke G-Drive`, 'Cloud', 'text-orange-500', 'bg-orange-50'); } else { throw new Error(result.message); }
       }
       setUploadProgress(100);
       setTimeout(() => { setIsExporting(false); setShowExportModal(false); setUploadProgress(0); element.style.display = 'none'; alert("Proses Ekspor Selesai!"); }, 500);
    } catch (err) { console.error(err); setIsExporting(false); setUploadProgress(0); element.style.display = 'none'; alert("Gagal memproses laporan: " + err.message); }
  };

  return (
    <div className="space-y-5 animation-fade-in relative">
      <div className="print:hidden">
        <h2 className="text-xl font-bold text-slate-800">Laporan Progres</h2>
        <p className="text-sm text-slate-500 mt-0.5">Format PPT HD (Bisa Geser & Kamera Langsung)</p>
      </div>

      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-5 print:hidden">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Pilih Proyek</label>
            <input type="text" list="ppt-project-list" value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)} placeholder="Cari proyek..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-orange-500" />
            <datalist id="ppt-project-list">{databaseProyek.map((proj, idx) => <option key={idx} value={proj} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Kategori</label><select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none"><option value="Panin">Panin</option><option value="Non Panin">Non Panin</option></select></div>
            <div><label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase">Jenis Laporan</label><input type="text" value={reportType} onChange={(e) => setReportType(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none" /></div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">Cover Laporan</label>
          <div className="w-full aspect-[16/9] bg-slate-100 border-2 border-slate-200 rounded-lg shadow-sm relative overflow-hidden flex flex-col justify-end group">
            {coverPhoto.url ? ( <DraggableImage src={coverPhoto.url} x={coverPhoto.x} y={coverPhoto.y} onChange={(nx, ny) => updatePhotoPan('cover', nx, ny)} /> ) : ( <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400"><ImageIcon size={24} className="mb-2" /><span className="text-[10px] font-bold">16:9 Cover</span></div> )}
            <div className="absolute top-2 left-2 z-10 flex gap-1">
              <input type="file" id="cover-cam" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, 'cover')} />
              <input type="file" id="cover-gal" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'cover')} />
              {coverPhoto.url ? ( <button onClick={() => setCoverPhoto({url: null, x:50, y:50})} className="bg-red-500/90 text-white p-1.5 rounded-md shadow-sm hover:bg-red-600 transition-colors"><X size={14} strokeWidth={3} /></button> ) : ( <><label htmlFor="cover-cam" className="cursor-pointer bg-orange-600/90 text-white px-2 py-1.5 rounded-md shadow-sm text-[10px] font-bold flex items-center gap-1"><Camera size={12} /> Kamera</label><label htmlFor="cover-gal" className="cursor-pointer bg-slate-600/90 text-white px-2 py-1.5 rounded-md shadow-sm text-[10px] font-bold flex items-center gap-1"><UploadCloud size={12} /> Galeri</label></> )}
            </div>
            <div className="absolute top-2 right-2 w-14 h-14 bg-white/80 backdrop-blur-sm border-2 border-dashed border-slate-300 rounded-md z-10 flex flex-col items-center justify-center overflow-hidden">
              <input type="file" id="logo-cam" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, 'logo')} /><input type="file" id="logo-gal" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'logo')} />
              {logoPhoto ? ( <><img src={logoPhoto} className="w-full h-full object-contain p-1" /><button onClick={() => setLogoPhoto(null)} className="absolute -top-1 -right-1 bg-red-500 text-white p-0.5 rounded-full scale-75"><X size={12} /></button></> ) : ( <><span className="text-[6px] font-bold text-slate-500 mb-0.5">LOGO</span><div className="flex gap-1"><label htmlFor="logo-cam" className="cursor-pointer p-1 bg-orange-100 text-orange-600 rounded"><Camera size={10} /></label><label htmlFor="logo-gal" className="cursor-pointer p-1 bg-slate-200 text-slate-600 rounded"><UploadCloud size={10} /></label></div></> )}
            </div>
            <div className="relative z-10 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-3 pt-8 text-white w-full pointer-events-none"><h3 className="text-sm font-black leading-tight">{selectedProject || 'Nama Proyek'}</h3><p className="text-[10px] font-semibold text-orange-200">{reportType}</p></div>
          </div>
        </div>

        <div className="h-px bg-slate-200 w-full my-6"></div>

        <div className="space-y-6">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Isi Laporan (PPT)</label>
          {slides.map((slide, slideIndex) => (
            <div key={slide.id} className="relative mt-4 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-end mb-2 px-1"><span className="text-[10px] font-bold text-slate-500">Lembar {slideIndex + 1}</span>{slideIndex > 0 && <button onClick={() => setSlides(slides.filter((_, i) => i !== slideIndex))} className="text-[10px] text-red-500 font-bold hover:underline">Hapus Slide</button>}</div>
              <div className="w-full aspect-[16/9] bg-white border border-slate-200 rounded shadow-sm flex flex-col p-1.5 relative">
                <div className="flex justify-between items-end border-b-2 border-orange-600 pb-1 mb-1"><span className="text-[7px] font-bold text-slate-800 uppercase truncate max-w-[60%]">{selectedProject || 'NAMA PROYEK'}</span><span className="text-[6px] font-semibold text-slate-500">{reportDate}</span></div>
                <div className="flex-1 grid grid-cols-3 gap-1.5 min-h-0">
                  <div className="col-span-1 flex flex-col gap-1 min-h-0">
                    <div className="flex-1 bg-slate-50 rounded border-2 border-dashed border-slate-300 relative overflow-hidden flex items-center justify-center">
                      <input type="file" id={`layout-cam-${slideIndex}`} accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, 'layout', slideIndex)} /><input type="file" id={`layout-gal-${slideIndex}`} accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'layout', slideIndex)} />
                      {slide.layoutPhoto.url ? ( <><DraggableImage src={slide.layoutPhoto.url} x={slide.layoutPhoto.x} y={slide.layoutPhoto.y} mode="contain" onChange={(nx, ny) => updatePhotoPan('layout', nx, ny, slideIndex)} /><button onClick={() => {const s=[...slides]; s[slideIndex].layoutPhoto.url=null; setSlides(s)}} className="absolute top-0.5 right-0.5 bg-red-500/90 text-white p-0.5 rounded-full scale-75 z-20"><X size={12} strokeWidth={3} /></button></> ) : ( <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1"><span className="text-[5px] font-bold">Denah / Layout</span><div className="flex gap-1"><label htmlFor={`layout-cam-${slideIndex}`} className="cursor-pointer p-1 bg-orange-100 text-orange-600 rounded"><Camera size={10} /></label><label htmlFor={`layout-gal-${slideIndex}`} className="cursor-pointer p-1 bg-slate-200 text-slate-600 rounded"><UploadCloud size={10} /></label></div></div> )}
                    </div>
                    <div className="h-1/3 min-h-[20px]"><textarea placeholder="Keterangan..." value={slide.description} onChange={(e) => handleDescriptionChange(slideIndex, e.target.value)} className="w-full h-full bg-slate-50 border border-slate-200 rounded text-[6px] p-1 text-slate-700 outline-none resize-none" /></div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-1.5">
                    {slide.progressPhotos.map((photoObj, photoIndex) => (
                      <div key={photoIndex} className="bg-slate-50 rounded border-2 border-dashed border-slate-300 relative overflow-hidden flex items-center justify-center">
                        <input type="file" id={`prog-cam-${slideIndex}-${photoIndex}`} accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, 'progress', slideIndex, photoIndex)} /><input type="file" id={`prog-gal-${slideIndex}-${photoIndex}`} accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'progress', slideIndex, photoIndex)} />
                        {photoObj.url ? ( <><DraggableImage src={photoObj.url} x={photoObj.x} y={photoObj.y} onChange={(nx, ny) => updatePhotoPan('progress', nx, ny, slideIndex, photoIndex)} /><button onClick={() => {const s=[...slides]; s[slideIndex].progressPhotos[photoIndex].url=null; setSlides(s)}} className="absolute top-0.5 right-0.5 bg-red-500/90 text-white p-0.5 rounded-full scale-75 z-20"><X size={10} strokeWidth={3} /></button></> ) : ( <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1"><span className="text-[5px] font-bold">Slot Foto</span><div className="flex gap-1"><label htmlFor={`prog-cam-${slideIndex}-${photoIndex}`} className="cursor-pointer p-1 bg-orange-50 text-orange-500 rounded"><Camera size={8} /></label><label htmlFor={`prog-gal-${slideIndex}-${photoIndex}`} className="cursor-pointer p-1 bg-slate-200 text-slate-500 rounded"><UploadCloud size={8} /></label></div></div> )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2"><button onClick={handleAddSlide} className="flex-1 bg-slate-100 border border-slate-200 text-slate-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs hover:bg-slate-200 transition-all"><PlusCircle size={14} /> Tambah Slide</button><button onClick={handleDuplicateLastSlide} className="flex-1 bg-orange-50 border border-orange-200 text-orange-700 font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-[11px] hover:bg-orange-100 active:scale-95 transition-all"><Copy size={14} /> Duplikat</button></div>
        </div>

        <button onClick={() => setShowExportModal(true)} className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl mt-6 shadow-md flex justify-center items-center gap-2 text-sm"><FileText size={18} /> Ekspor Dokumen HD</button>
      </div>

      {showExportModal && (
        <div className="absolute inset-0 z-50 flex items-end justify-center pb-8 px-4 bg-slate-900/40 backdrop-blur-sm animation-fade-in">
          <div className="bg-white w-full rounded-3xl shadow-2xl p-6 relative border border-slate-100">
            <button disabled={isExporting} onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={24} /></button>
            <h3 className="text-lg font-black text-slate-800 mb-5">Simpan Laporan HD</h3>
            <div className="space-y-3">
              <button disabled={isExporting} onClick={() => handleExecuteExport('local')} className="w-full p-4 rounded-xl border border-slate-200 flex items-center gap-4 text-left hover:bg-slate-50 transition-all"><div className="p-3 bg-slate-100 text-slate-600 rounded-full"><Laptop size={20} /></div><div><p className="text-sm font-bold text-slate-800">Simpan Lokal (PDF)</p><p className="text-[10px] text-slate-500">Unduh format A4 Landscape per slide.</p></div></button>
              <button disabled={isExporting} onClick={() => handleExecuteExport('cloud')} className="w-full p-4 rounded-xl border border-orange-200 flex items-center gap-4 bg-orange-50 text-left hover:bg-orange-100 transition-all"><div className="p-3 bg-orange-600 text-white rounded-full"><Cloud size={20} /></div><div><p className="text-sm font-bold text-orange-800">Simpan ke G-Drive</p><p className="text-[10px] text-orange-600">Kirim PDF utuh ke Cloud Proyek.</p></div></button>
              <button disabled={isExporting} onClick={() => handleExecuteExport('both')} className="w-full p-4 rounded-xl border border-green-200 flex items-center gap-4 bg-green-50 text-left hover:bg-green-100 transition-all"><div className="p-3 bg-green-500 text-white rounded-full"><CheckCircle2 size={20} /></div><div><p className="text-sm font-bold text-green-800">Simpan Keduanya</p><p className="text-[10px] text-green-600">Unduh lokal & langsung ke Cloud.</p></div></button>
            </div>
            {isExporting && (
              <div className="mt-5"><div className="flex justify-between text-[10px] font-bold text-orange-700 mb-1"><span>Memproses Render PDF HD...</span><span>{uploadProgress}%</span></div><div className="w-full bg-orange-100 rounded-full h-2.5 overflow-hidden"><div className="bg-orange-600 h-2.5 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div></div>
            )}
          </div>
        </div>
      )}

      {/* TEMPLATE TERSEMBUNYI UNTUK EXPORT PDF - A4 LANDSCAPE (297mm x 210mm) */}
      <div id="pdf-template-progres" style={{ display: 'none', background: '#ffffff', color: '#0f172a', fontFamily: 'sans-serif', width: '297mm' }}>
        <div className="pdf-page-break" style={{ width: '297mm', minHeight: '200mm', position: 'relative', overflow: 'hidden', backgroundColor: '#ffffff', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          {coverPhoto.url ? ( <div style={{ width: '100%', height: '100%', backgroundImage: `url(${coverPhoto.url})`, backgroundSize: 'cover', backgroundPosition: `${coverPhoto.x}% ${coverPhoto.y}%`, backgroundRepeat: 'no-repeat', position: 'absolute', top: 0, left: 0 }} /> ) : ( <div style={{ width: '100%', height: '100%', backgroundColor: '#cbd5e1', position: 'absolute', top: 0, left: 0 }}></div> )}
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.4), transparent)', color: 'white', padding: '60px 45px' }}>
             {logoPhoto && ( <div style={{ position: 'absolute', top: '-110px', right: '45px', background: 'rgba(255,255,255,0.95)', padding: '12px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}><div style={{ width: '90px', height: '90px', backgroundImage: `url(${logoPhoto})`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }} /></div> )}
             <h1 style={{ fontSize: '56px', margin: '0 0 12px 0', fontWeight: '900', letterSpacing: '-1px' }}>{selectedProject || 'NAMA PROYEK'}</h1>
             <p style={{ fontSize: '24px', margin: 0, color: '#f97316', fontWeight: '600' }}>{reportType}</p>
             <p style={{ fontSize: '14px', marginTop: '24px', opacity: 0.8 }}>Tanggal Laporan: {reportDate}</p>
          </div>
        </div>
        {slides.map((s, idx) => (
          <div key={idx} className="pdf-page-break" style={{ width: '297mm', minHeight: '200mm', padding: '10mm 15mm', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', boxSizing: 'border-box' }}>
            <div style={{ borderBottom: '4px solid #ea580c', paddingBottom: '20px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
               <span style={{ fontWeight: '900', fontSize: '28px', textTransform: 'uppercase', color: '#1e293b', letterSpacing: '-1px' }}>{selectedProject || 'NAMA PROYEK'}</span>
               <div style={{ textAlign: 'right' }}><span style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>{reportDate}</span><span style={{ fontSize: '16px', color: '#ea580c', fontWeight: '800' }}>HALAMAN {idx + 1}</span></div>
            </div>
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '24px', minHeight: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: 0 }}>
                <div style={{ flex: 1, backgroundColor: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                  {s.layoutPhoto.url && ( <div style={{ width: '100%', height: '100%', backgroundImage: `url(${s.layoutPhoto.url})`, backgroundSize: 'contain', backgroundPosition: `${s.layoutPhoto.x}% ${s.layoutPhoto.y}%`, backgroundRepeat: 'no-repeat', margin: '6px' }} /> )}
                </div>
                <div style={{ height: '35%', padding: '20px', backgroundColor: '#f1f5f9', border: '2px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', color: '#334155', lineHeight: '1.5' }}>
                  <strong style={{ display: 'block', marginBottom: '10px', color: '#0f172a', fontSize: '16px' }}>Keterangan / Catatan:</strong><div style={{ whiteSpace: 'pre-wrap' }}>{s.description || '-'}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '18px' }}>
                {s.progressPhotos.map((photoObj, pIdx) => (
                  <div key={pIdx} style={{ backgroundColor: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
                    {photoObj.url && ( <div style={{ width: '100%', height: '100%', backgroundImage: `url(${photoObj.url})`, backgroundSize: 'cover', backgroundPosition: `${photoObj.x}% ${photoObj.y}%`, backgroundRepeat: 'no-repeat' }} /> )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= KOMPONEN KATALOG ================= */
function PeminjamanKatalogView({ user, catalogItems, catalogLoans, handleAddActivity, onShowCatalog, defaultCatalogId = '' }) {
  const today = new Date().toISOString().split('T')[0];
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLoan, setNewLoan] = useState({ catalogId: defaultCatalogId, picName: '', borrowDate: today, borrowTime: '09:00', dueDate: '', dueTime: '17:00', note: '' });
  const activeLoans = catalogLoans.filter(loan => !loan.returnedAt);
  const catalogOnLoanIds = new Set(activeLoans.map(loan => loan.catalogId));
  const availableCatalogs = catalogItems.filter(item => !catalogOnLoanIds.has(item.id));
  const isOverdue = (loan) => !loan.returnedAt && loan.dueDate && new Date(`${loan.dueDate}T${loan.dueTime || '23:59'}:00`) < new Date();

  useEffect(() => {
    if (defaultCatalogId) {
      setNewLoan(prev => ({ ...prev, catalogId: defaultCatalogId }));
      setIsAddingLoan(true);
    }
  }, [defaultCatalogId]);

  const resetLoanForm = () => {
    setNewLoan({ catalogId: '', picName: '', borrowDate: today, borrowTime: '09:00', dueDate: '', dueTime: '17:00', note: '' });
    setIsAddingLoan(false);
  };

  const handleSaveLoan = async () => {
    const catalog = catalogItems.find(item => item.id === newLoan.catalogId);
    if (!catalog || !newLoan.picName.trim() || !newLoan.borrowDate || !newLoan.dueDate) return alert('Pilih katalog, isi PIC, tanggal pinjam, dan tanggal kembali.');
    if (newLoan.dueDate < newLoan.borrowDate || (newLoan.dueDate === newLoan.borrowDate && newLoan.dueTime <= newLoan.borrowTime)) return alert('Waktu pengembalian harus setelah waktu peminjaman.');
    setIsSubmitting(true);
    try {
      await addDoc(getCol('catalogLoans'), {
        catalogId: catalog.id, catalogTitle: catalog.title, catalogCategory: catalog.category || '', picName: newLoan.picName.trim(),
        borrowDate: newLoan.borrowDate, borrowTime: newLoan.borrowTime, dueDate: newLoan.dueDate, dueTime: newLoan.dueTime, note: newLoan.note.trim(), status: 'Dipinjam',
        createdBy: user.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      });
      handleAddActivity(`Mencatat peminjaman katalog "${catalog.title}" oleh ${newLoan.picName.trim()}`, 'FolderOpen', 'text-orange-500', 'bg-orange-50');
      resetLoanForm();
    } catch (error) { console.error(error); alert('Gagal mencatat peminjaman: ' + error.message); }
    finally { setIsSubmitting(false); }
  };

  const handleReturnLoan = async (loan) => {
    try {
      const returnedAt = new Date().toISOString();
      await updateDoc(getDoc('catalogLoans', loan.id), { status: 'Dikembalikan', returnedAt, returnedBy: user.name, updatedAt: returnedAt });
      handleAddActivity(`Katalog "${loan.catalogTitle}" dikembalikan oleh ${loan.picName}`, 'CheckCircle2', 'text-green-500', 'bg-green-50');
    } catch (error) { console.error(error); alert('Gagal memperbarui status pengembalian: ' + error.message); }
  };

  return (
    <div className="space-y-5 animation-fade-in">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Daftar Katalog</h2>
        <p className="text-xs font-medium text-slate-500 mt-1">Kelola data katalog dan peminjamannya</p>
      </div>
      <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button onClick={onShowCatalog} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800">Daftar Katalog</button>
        <button className="px-3 py-2 rounded-lg text-xs font-bold bg-white text-orange-600 shadow-sm">Pinjam Katalog <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">{activeLoans.length}</span></button>
      </div>

      {isAddingLoan ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-5">
          <div className="flex items-center justify-between"><div><h3 className="font-bold text-slate-800">Catat Peminjaman Katalog</h3><p className="text-[10px] text-slate-500 mt-1">PIC bertanggung jawab sampai katalog dikembalikan.</p></div><button onClick={resetLoanForm} className="text-slate-400 hover:text-slate-700"><X size={20}/></button></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Katalog yang dipinjam</label><select value={newLoan.catalogId} onChange={e => setNewLoan({ ...newLoan, catalogId: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500"><option value="">Pilih katalog tersedia</option>{availableCatalogs.map(item => <option key={item.id} value={item.id}>{item.title} — {item.category}</option>)}</select>{availableCatalogs.length === 0 && <p className="text-[10px] text-rose-600 mt-1.5">Semua katalog sedang dipinjam atau belum ada katalog.</p>}</div>
            <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">PIC peminjam</label><div className="relative"><User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={newLoan.picName} onChange={e => setNewLoan({ ...newLoan, picName: e.target.value })} placeholder="Nama PIC yang bertanggung jawab" className="w-full pl-9 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tanggal pinjam</label><input type="date" value={newLoan.borrowDate} onChange={e => setNewLoan({ ...newLoan, borrowDate: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Jam pinjam</label><input type="time" value={newLoan.borrowTime} onChange={e => setNewLoan({ ...newLoan, borrowTime: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" /></div></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tanggal kembali</label><input type="date" value={newLoan.dueDate} onChange={e => setNewLoan({ ...newLoan, dueDate: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" /></div><div><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Jam kembali</label><input type="time" value={newLoan.dueTime} onChange={e => setNewLoan({ ...newLoan, dueTime: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" /></div></div>
            <div className="sm:col-span-2"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Keterangan <span className="normal-case font-medium">(opsional)</span></label><textarea rows="3" value={newLoan.note} onChange={e => setNewLoan({ ...newLoan, note: e.target.value })} placeholder="Contoh: keperluan presentasi klien" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-orange-500" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100"><button disabled={isSubmitting} onClick={resetLoanForm} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Batal</button><button disabled={isSubmitting} onClick={handleSaveLoan} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-sm disabled:opacity-50">{isSubmitting ? 'Menyimpan...' : 'Simpan Peminjaman'}</button></div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-orange-50 border border-orange-100 rounded-2xl p-4">
            <div className="flex gap-3"><AlertTriangle size={18} className="text-orange-600 shrink-0 mt-0.5"/><p className="text-[11px] leading-relaxed text-orange-800"><b>Aturan peminjaman:</b> katalog yang terlambat dan belum dikembalikan mengurangi <b>1 poin per hari</b> pada Kinerja PIC.</p></div>
            <button onClick={() => setIsAddingLoan(true)} className="shrink-0 bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-orange-700 flex items-center justify-center gap-1.5"><Plus size={16}/> Catat Pinjam</button>
          </div>
          <div className="space-y-3">
            {catalogLoans.length === 0 ? <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm"><FolderOpen size={32} className="mx-auto text-slate-300 mb-2"/><p className="text-sm font-bold text-slate-600">Belum ada peminjaman</p><p className="text-xs text-slate-400 mt-1">Catat peminjaman katalog pertama Anda.</p></div> : catalogLoans.map(loan => {
              const overdue = isOverdue(loan);
              return <div key={loan.id} className={`bg-white rounded-2xl border p-4 shadow-sm ${overdue ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 mb-1"><h3 className="font-bold text-slate-800">{loan.catalogTitle}</h3><span className={`text-[9px] font-bold px-2 py-1 rounded-full ${loan.returnedAt ? 'bg-green-100 text-green-700' : overdue ? 'bg-red-100 text-red-700' : 'bg-rose-100 text-rose-700'}`}>{loan.returnedAt ? 'Dikembalikan' : overdue ? 'Terlambat' : 'Dipinjam'}</span></div><p className="text-xs text-slate-500 flex items-center gap-1.5"><User size={13}/> PIC: <b className="text-slate-700">{loan.picName}</b></p></div>{!loan.returnedAt && <button onClick={() => handleReturnLoan(loan)} className="shrink-0 bg-green-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-green-700 flex items-center justify-center gap-1.5"><CheckCircle2 size={15}/> Tandai Dikembalikan</button>}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-3 border-t border-slate-100 text-[10px]"><div><p className="font-bold text-slate-400 uppercase">Waktu pinjam</p><p className="font-semibold text-slate-700 mt-1">{loan.borrowDate} · {loan.borrowTime || '-'}</p></div><div><p className="font-bold text-slate-400 uppercase">Batas kembali</p><p className={`font-semibold mt-1 ${overdue ? 'text-red-600' : 'text-slate-700'}`}>{loan.dueDate} · {loan.dueTime || '-'}</p></div><div><p className="font-bold text-slate-400 uppercase">Pengembalian</p><p className="font-semibold text-slate-700 mt-1">{loan.returnedAt ? new Date(loan.returnedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'Belum dikembalikan'}</p></div></div>
                {loan.note && <p className="mt-3 text-[11px] italic text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2.5">“{loan.note}”</p>}
              </div>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

function KatalogView({ user, catalogItems, catalogLoans, handleAddActivity }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCatalogTab, setActiveCatalogTab] = useState('katalog');
  const [selectedBorrowCatalogId, setSelectedBorrowCatalogId] = useState('');
  const [activeFilter, setActiveFilter] = useState('Semua');
  const [sortOption, setSortOption] = useState('Terbaru Ditambah');
  const [isAddingData, setIsAddingData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [editingCatalogId, setEditingCatalogId] = useState(null);
  const [selectedCatalogFile, setSelectedCatalogFile] = useState(null);
  
  const [confirmDelete, setConfirmDelete] = useState(null); 
  const fileInputRef = useRef(null);
  const filterCategories = ['Semua', 'Buku', 'Majalah', 'Brosur', 'Katalog Produk', 'Lainnya'];
  const sortOptionsList = ['Terbaru Ditambah', 'Terbaru Diedit', 'Nama (A-Z)', 'Jenis'];
  const kelengkapanOptions = ['Fisik', 'Digital', 'Pricelist', 'Sampel'];

  const [newData, setNewData] = useState({ title: '', date: new Date().toISOString().split('T')[0], category: 'Buku', source: '', tags: [], webLink: '', fileLink: '', desc: '', fileName: '' });

  const toggleTag = (tag) => { setNewData(prev => ({ ...prev, tags: prev.tags.includes(tag) ? prev.tags.filter(t => t !== tag) : [...prev.tags, tag] })); };
  const handleFileUpload = (e) => { if (e.target.files && e.target.files[0]) { setSelectedCatalogFile(e.target.files[0]); setNewData({...newData, fileName: e.target.files[0].name}); } };

  const handleSaveKatalog = async () => {
    if (!newData.title || !newData.source) return alert('Nama Item dan Sumber wajib diisi!');
    setIsSubmitting(true); setUploadProgress(10);
    try {
      let uploadedFileUrl = null;
      if (selectedCatalogFile) {
        setUploadProgress(40); const base64Data = await fileToBase64(selectedCatalogFile); setUploadProgress(70);
        let safeFileName = `Katalog_File_${new Date().getTime()}.pdf`;
        if (newData.fileName && newData.fileName.trim() !== "") safeFileName = newData.fileName;
        else if (selectedCatalogFile.name && selectedCatalogFile.name.trim() !== "") safeFileName = selectedCatalogFile.name;

        const safeMimeType = selectedCatalogFile.type || "application/pdf";
        const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "uploadCatalog", folderPath: "APP DKPM/Library Katalog", fileData: { name: safeFileName, mimeType: safeMimeType, base64: base64Data.base64 }, title: newData.title || "Katalog Baru", fileName: safeFileName, name: safeFileName }),
        });
        
        let resultText = ""; let result = null;
        try { resultText = await response.text(); result = JSON.parse(resultText); } catch (err) { throw new Error("Respon API G-Drive tidak valid. Cek deployment App Script Anda."); }
        if (result && result.status === 'success' && result.url) uploadedFileUrl = result.url;
        else if (result && result.url) uploadedFileUrl = result.url;
        else throw new Error(result ? result.message : "Tidak dapat menemukan tautan link dari server G-Drive.");
      }
      setUploadProgress(85);
      let finalWebLink = newData.webLink; if (finalWebLink && !finalWebLink.startsWith('http')) finalWebLink = 'https://' + finalWebLink;
      let finalFileLink = uploadedFileUrl || newData.fileLink; if (finalFileLink && !finalFileLink.startsWith('http')) finalFileLink = 'https://' + finalFileLink;

      const catalogPayload = { category: newData.category, title: newData.title, addedBy: user.name, date: newData.date, source: newData.source, tags: newData.tags, webLink: finalWebLink, fileLink: finalFileLink, desc: newData.desc, fileName: newData.fileName, updatedAt: new Date().toISOString() };

      if (editingCatalogId) { await updateDoc(getDoc('catalogs', editingCatalogId), catalogPayload); handleAddActivity(`Mengedit katalog "${newData.title}"`, 'Edit2', 'text-orange-500', 'bg-orange-50'); } 
      else { catalogPayload.createdAt = new Date().toISOString(); await addDoc(getCol('catalogs'), catalogPayload); handleAddActivity(`Menambahkan katalog "${newData.title}"`, 'FolderPlus', 'text-orange-500', 'bg-orange-50'); }

      setUploadProgress(100);
      setTimeout(() => { setIsSubmitting(false); setUploadProgress(0); setIsAddingData(false); setEditingCatalogId(null); setSelectedCatalogFile(null); setNewData({title: '', date: new Date().toISOString().split('T')[0], category: 'Buku', source: '', tags: [], webLink: '', fileLink: '', desc: '', fileName: ''}); }, 500);
    } catch (error) { setIsSubmitting(false); setUploadProgress(0); console.error(error); alert("Gagal simpan Katalog: " + error.message); }
  };

  const handleEditCatalog = (item) => {
    setNewData({ title: item.title || '', date: item.date || new Date().toISOString().split('T')[0], category: item.category || 'Buku', source: item.source || '', tags: item.tags || [], webLink: item.webLink || item.link || '', fileLink: item.fileLink || '', desc: item.desc || '', fileName: item.fileName || '' });
    setEditingCatalogId(item.id); setIsAddingData(true);
  };

  const handleDeleteCatalog = (id, title) => { setConfirmDelete({ id, title }); };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    try { await deleteDoc(getDoc('catalogs', confirmDelete.id)); handleAddActivity(`Menghapus data katalog "${confirmDelete.title}"`, 'Trash2', 'text-red-500', 'bg-red-50'); setConfirmDelete(null); } 
    catch(err) { alert("Gagal menghapus data dari Database: " + err.message); setConfirmDelete(null); }
  };

  const handleDirectBorrow = (catalogId) => {
    setSelectedBorrowCatalogId(catalogId);
    setActiveCatalogTab('peminjaman');
  };

  let filteredItems = catalogItems.filter(item => {
    const matchSearch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase()) || (item.source || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchFilter = activeFilter === 'Semua' || item.category === activeFilter;
    return matchSearch && matchFilter;
  });

  if (sortOption === 'Nama (A-Z)') { filteredItems.sort((a, b) => a.title.localeCompare(b.title)); } 
  else if (sortOption === 'Jenis') { filteredItems.sort((a, b) => a.category.localeCompare(b.category)); }

  if (isAddingData) {
    return (
      <div className="space-y-5 animation-fade-in">
        <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">{editingCatalogId ? <Edit2 size={20} className="text-orange-600"/> : <Plus size={20} className="text-orange-600"/>} {editingCatalogId ? 'Edit Data Katalog' : 'Input Baru'}</h2><button onClick={() => { setIsAddingData(false); setEditingCatalogId(null); setSelectedCatalogFile(null); }} className="text-slate-400 hover:text-slate-600"><X size={24} /></button></div>
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Nama Item</label><input type="text" value={newData.title} onChange={e => setNewData({...newData, title: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" /></div>
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tanggal</label><input type="date" value={newData.date} onChange={e => setNewData({...newData, date: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" /></div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Jenis</label>
              <div className="relative"><select value={newData.category} onChange={e => setNewData({...newData, category: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none appearance-none">{filterCategories.filter(c => c !== 'Semua').map(cat => <option key={cat} value={cat}>{cat}</option>)}</select><ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-slate-400 pointer-events-none"/></div>
            </div>
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Sumber</label><input type="text" value={newData.source} onChange={e => setNewData({...newData, source: e.target.value})} placeholder="Vendor/Penerbit" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" /></div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-2 uppercase">Kelengkapan</label>
            <div className="flex flex-wrap gap-2">{kelengkapanOptions.map(tag => ( <button key={tag} onClick={() => toggleTag(tag)} className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors ${newData.tags.includes(tag) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{tag}</button> ))}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tautan Website / Referensi</label><input type="url" value={newData.webLink} onChange={e => setNewData({...newData, webLink: e.target.value})} placeholder="Ketik www. atau tempel tautan" className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" /></div>
            <div className="col-span-2 sm:col-span-1"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Tautan File Digital (G-Drive)</label><input type="url" value={newData.fileLink} onChange={e => setNewData({...newData, fileLink: e.target.value})} placeholder="Pilih otomatis atau tempel link..." className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none" /></div>
            <div className="col-span-2"><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Penginput</label><input type="text" value={user.name} disabled className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 outline-none cursor-not-allowed" /></div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Atau Unggah Dokumen Langsung</label>
            <div className="border-2 border-dashed border-orange-200 bg-orange-50/30 rounded-xl p-4 flex flex-col items-center justify-center text-center"><Upload size={20} className="text-orange-500 mb-2" /><p className="text-xs font-bold text-orange-700">{newData.fileName || 'Pilih File PDF / Dokumen'}</p><p className="text-[9px] text-slate-500 mt-1 max-w-[250px]">Otomatis diunggah ke G-Drive: <b>APP DKPM &gt; Library Katalog</b></p><input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} className="hidden" ref={fileInputRef} /><button onClick={() => fileInputRef.current?.click()} className="mt-3 bg-white border border-orange-200 text-orange-600 px-4 py-1.5 rounded-lg text-[10px] font-bold hover:bg-orange-50 transition-colors">Jelajahi File</button></div>
          </div>
          <div><label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase">Keterangan</label><textarea rows="3" value={newData.desc} onChange={e => setNewData({...newData, desc: e.target.value})} className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none resize-none" /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 flex-col sm:flex-row">
            {isSubmitting && ( <div className="flex-1 w-full flex flex-col justify-center pr-4"><div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-orange-700">Menyimpan...</span><span className="text-[10px] font-bold text-orange-700">{uploadProgress}%</span></div><div className="w-full bg-orange-100 rounded-full h-2 overflow-hidden"><div className="bg-orange-600 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div></div></div> )}
            <div className="flex gap-2"><button disabled={isSubmitting} onClick={() => { setIsAddingData(false); setEditingCatalogId(null); setSelectedCatalogFile(null); }} className="px-6 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50">Batal</button><button disabled={isSubmitting} onClick={handleSaveKatalog} className="px-6 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-orange-700 transition-all disabled:opacity-50 whitespace-nowrap">{isSubmitting ? 'Memproses...' : (editingCatalogId ? 'Perbarui Data' : 'Simpan ke Cloud')}</button></div>
          </div>
        </div>
      </div>
    );
  }

  if (activeCatalogTab === 'peminjaman') return <PeminjamanKatalogView user={user} catalogItems={catalogItems} catalogLoans={catalogLoans} handleAddActivity={handleAddActivity} onShowCatalog={() => setActiveCatalogTab('katalog')} defaultCatalogId={selectedBorrowCatalogId} />;

  return (
    <div className="space-y-5 animation-fade-in">
      <div className="flex justify-between items-start">
        <div><h2 className="text-xl font-bold text-slate-800">Daftar Katalog</h2><p className="text-xs font-medium text-slate-500 mt-1">Tersinkronisasi dengan Database</p></div>
        <div className="flex gap-2"><button onClick={() => { setNewData({title: '', date: new Date().toISOString().split('T')[0], category: 'Buku', source: '', tags: [], webLink: '', fileLink: '', desc: '', fileName: ''}); setEditingCatalogId(null); setIsAddingData(true); }} className="bg-orange-600 text-white px-3 py-2.5 rounded-xl shadow-sm flex items-center gap-1.5 hover:bg-orange-700 active:scale-95 transition-all"><Plus size={16} strokeWidth={3} /><span className="text-xs font-bold pr-1">Tambah</span></button></div>
      </div>
      <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
        <button className="px-3 py-2 rounded-lg text-xs font-bold bg-white text-orange-600 shadow-sm">Daftar Katalog</button>
        <button onClick={() => { setSelectedBorrowCatalogId(''); setActiveCatalogTab('peminjaman'); }} className="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800">Pinjam Katalog <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">{catalogLoans.filter(loan => !loan.returnedAt).length}</span></button>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="text" placeholder="Cari..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm shadow-sm outline-none focus:ring-2 focus:ring-orange-500" /></div>
        <div className="relative"><select value={sortOption} onChange={(e) => setSortOption(e.target.value)} className="appearance-none bg-white border border-slate-200 text-slate-700 pl-8 pr-6 py-2.5 rounded-xl shadow-sm text-[11px] font-bold outline-none cursor-pointer hover:bg-slate-50 w-full min-w-[130px]">{sortOptionsList.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select><ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" /></div>
      </div>
      <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
        {filterCategories.map(cat => ( <button key={cat} onClick={() => setActiveFilter(cat)} className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${activeFilter === cat ? 'bg-orange-100 text-orange-700 shadow-sm border border-orange-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{cat}</button> ))}
      </div>
      <div className="flex flex-col gap-3">
        {filteredItems.length > 0 ? (
          filteredItems.map(item => {
            const hasWeb = item.webLink || item.link; const hasFile = item.fileLink;
            const isBorrowed = catalogLoans.some(loan => loan.catalogId === item.id && !loan.returnedAt);
            return (
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3 relative overflow-hidden group">
              <div className="flex justify-between items-start"><span className="text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{item.category}</span>
                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"><button onClick={() => handleEditCatalog(item)} className="p-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100" title="Edit Katalog"><Edit2 size={12}/></button><button onClick={() => handleDeleteCatalog(item.id, item.title)} className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Hapus Katalog"><Trash2 size={12}/></button></div>
              </div>
              <div><h3 className="font-bold text-slate-800 text-base leading-tight mb-1.5 pr-10">{item.title}</h3><div className="flex items-center gap-3 text-[10px] font-medium text-slate-500"><span className="flex items-center gap-1.5"><User size={12} className="text-slate-400"/> {item.addedBy}</span><span className="flex items-center gap-1.5"><CalendarCheck size={12} className="text-slate-400"/> {item.date}</span></div></div>
              <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100"><p className="text-[8px] font-bold text-slate-400 uppercase mb-0.5">Sumber</p><p className="text-xs font-bold text-slate-700">{item.source}</p></div>
              <div className="flex flex-wrap gap-1.5">{item.tags?.map((tag, idx) => ( <span key={idx} className="text-[9px] font-medium border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded-full bg-white">{tag}</span> ))}</div>
              <div className="flex gap-2 w-full pt-1">
                <button onClick={() => hasWeb && window.open(hasWeb, '_blank')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${hasWeb ? 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 active:scale-95 cursor-pointer' : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-not-allowed'}`}>{hasWeb ? <><ExternalLink size={14} strokeWidth={2.5}/> Web / Referensi</> : <><AlertCircle size={14} strokeWidth={2.5}/> Web (N/A)</>}</button>
                <button onClick={() => hasFile && window.open(hasFile, '_blank')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all ${hasFile ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 active:scale-95 cursor-pointer' : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-not-allowed'}`}>{hasFile ? <><FileText size={14} strokeWidth={2.5}/> File Digital</> : <><AlertCircle size={14} strokeWidth={2.5}/> File (N/A)</>}</button>
              </div>
              <div className="pt-1 border-t border-slate-100">
                {isBorrowed ? (
                  <button disabled className="w-full py-2 bg-rose-100 text-rose-700 text-xs font-bold rounded-xl cursor-not-allowed">
                    Sedang Dipinjam
                  </button>
                ) : (
                  <button onClick={() => handleDirectBorrow(item.id)} className="w-full py-2 bg-slate-800 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center justify-center gap-1.5">
                    <FolderOpen size={14} /> Pinjam Katalog Ini
                  </button>
                )}
              </div>
            </div>
            );
          })
        ) : (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm"><Search size={32} className="mx-auto text-slate-300 mb-2" /><p className="text-sm font-bold text-slate-600">Database Kosong</p><p className="text-xs text-slate-400 mt-1">Belum ada data yang tersimpan di cloud.</p></div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animation-fade-in">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl relative">
             <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 mx-auto"><AlertTriangle size={28} /></div>
             <h3 className="text-lg font-black text-slate-800 mb-2 text-center">Hapus Katalog?</h3><p className="text-sm text-slate-500 mb-6 text-center leading-relaxed">Anda yakin ingin menghapus <b className="text-slate-700">"{confirmDelete.title}"</b> secara permanen?</p>
             <div className="flex gap-3 justify-center"><button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-colors">Batal</button><button onClick={executeDelete} className="flex-1 py-3 bg-red-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-red-700 transition-colors">Ya, Hapus</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= KOMPONEN FORMULIR / FILE MASTER ================= */
function FormulirView({ user, forms, handleAddActivity }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ title: '', desc: '', link: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    if (!formData.title || !formData.link) return alert("Judul dan Link wajib diisi!");
    setIsSubmitting(true);
    try {
      await addDoc(getCol('forms'), { 
        ...formData, 
        createdAt: new Date().toISOString(), 
        addedBy: user.name 
      });
      handleAddActivity(`Menambahkan form/file "${formData.title}"`, 'FileText', 'text-orange-500', 'bg-orange-50');
      setIsAdding(false);
      setFormData({ title: '', desc: '', link: '' });
    } catch (e) {
      alert("Gagal menyimpan form: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (window.confirm(`Anda yakin ingin menghapus form "${title}"?`)) {
      try {
        await deleteDoc(getDoc('forms', id));
        handleAddActivity(`Menghapus form "${title}"`, 'Trash2', 'text-red-500', 'bg-red-50');
      } catch(e) {
        alert("Gagal menghapus form: " + e.message);
      }
    }
  };

  return (
    <div className="space-y-5 animation-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Form & File Master</h2>
          <p className="text-sm text-slate-500 mt-0.5">Pusat unduhan form dan template dokumen.</p>
        </div>
        {user.role === 'Admin' && (
          <button onClick={() => setIsAdding(true)} className="bg-orange-600 text-white p-2 px-3 rounded-xl flex items-center gap-1 shadow-md hover:bg-orange-700 transition-colors">
            <Plus size={16} /><span className="text-xs font-bold">Tambah Form</span>
          </button>
        )}
      </div>

      {isAdding && (
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-slate-800">Tambah Link Form/File</h3>
            <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Judul Form / Dokumen</label>
            <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Contoh: Form Cuti Karyawan / Template CAD" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Link Download / Tautan G-Drive</label>
            <input type="url" value={formData.link} onChange={e => setFormData({...formData, link: e.target.value})} placeholder="https://..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Keterangan / Instruksi</label>
            <textarea rows="2" value={formData.desc} onChange={e => setFormData({...formData, desc: e.target.value})} placeholder="Penjelasan singkat mengenai fungsi file atau cara pengisian..." className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none resize-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <button disabled={isSubmitting} onClick={handleSave} className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl text-sm shadow-md hover:bg-orange-700 transition-all disabled:opacity-50">
            {isSubmitting ? 'Menyimpan...' : 'Simpan Form'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {forms.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Download size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-600">Belum ada form yang ditambahkan.</p>
          </div>
        ) : (
          forms.map(form => (
            <div key={form.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-xl shrink-0"><FileText size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">{form.title}</h3>
                  {form.desc && <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{form.desc}</p>}
                  <p className="text-[9px] text-slate-400 mt-1.5 flex items-center gap-1">
                    <User size={10}/> Ditambahkan oleh: {form.addedBy}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={form.link.startsWith('http') ? form.link : `https://${form.link}`} target="_blank" rel="noopener noreferrer" className="bg-slate-100 hover:bg-orange-50 hover:text-orange-700 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 border border-slate-200 hover:border-orange-200">
                  <Download size={14} /> Unduh / Buka
                </a>
                {user.role === 'Admin' && (
                  <button onClick={() => handleDelete(form.id, form.title)} className="bg-red-50 text-red-500 p-2.5 rounded-xl hover:bg-red-100 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 border border-red-100" title="Hapus Form">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= KOMPONEN HALAMAN LOGIN ================= */
function LoginScreen() {
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.warn("Google Auth diblokir (Wajar di lingkungan preview). Mengalihkan ke Mode Preview...");
      try {
        await signInAnonymously(auth);
      } catch (fallbackError) {
        console.error("Gagal Login Preview:", fallbackError);
        if (fallbackError.code === 'auth/operation-not-allowed') {
          alert("PENTING: Anda harus mengaktifkan metode login 'Anonymous' di Firebase Console > Authentication > Sign-in method.");
        } else { alert("Gagal mengakses sistem: " + fallbackError.message); }
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-black flex items-center justify-center p-0 sm:p-6 lg:p-10 font-sans relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-orange-500 rounded-full blur-3xl opacity-20"></div>
      <div className="w-full min-h-[100dvh] sm:min-h-[680px] max-w-6xl bg-white shadow-2xl overflow-hidden sm:rounded-3xl flex flex-col relative z-10">
        <div className="flex-1 flex flex-col items-center justify-center p-8 sm:p-12 text-center">
          
          <img src="Logo_DKPM.png" alt="Logo DKPM" className="h-16 mb-6 object-contain" />
          
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">Design App DKPM</h1>
          <p className="text-sm text-slate-500 mb-12 font-medium">Production Database (Live)</p>
          <div className="w-full max-w-md bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <h2 className="text-sm font-bold text-slate-700 mb-4">Akses Terbatas</h2>
            <p className="text-xs text-slate-500 mb-6">Silakan login menggunakan akun Google perusahaan Anda untuk melanjutkan.</p>
            <button onClick={handleGoogleLogin} className="w-full bg-white border border-slate-200 text-slate-700 font-bold py-3.5 rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center gap-3">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Login dengan Google
            </button>
          </div>
        </div>
        <div className="pb-8 pt-4 text-center"><p className="text-[10px] text-slate-400 font-medium">© {new Date().getFullYear()} Internal App</p></div>
      </div>
    </div>
  );
}