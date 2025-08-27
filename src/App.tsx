import React, { useEffect, useMemo, useRef, useState } from 'react'
import { initFirebase } from './firebase'
import {
  collection, onSnapshot, addDoc, setDoc, doc, deleteDoc, serverTimestamp
} from 'firebase/firestore'
import { ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage'

type Item = {
  barcode: string
  plush: string
  style: string
  category: string
  color: string
  nameDrop: string
  quantity: number
  tieDye: boolean
  notes: string
  imageUrl: string
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}
function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url; link.download = filename; link.style.display = 'none'
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
function toCSV(items: Item[]) {
  const headers = ['barcode','plush','style','category','color','nameDrop','quantity','tieDye','notes','imageUrl']
  const rows = items.map(it => headers.map(h => {
    // @ts-ignore
    let v: any = it[h]; if (typeof v === 'boolean') v = v ? 'TRUE':'FALSE'
    if (v == null) v = ''; const s = String(v)
    return /[,"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s
  }).join(','))
  return [headers.join(', ' ).replace(', ', ',') , ...rows].join('\n')
}
function parseCSV(text: string): Item[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length)
  if (!lines.length) return []
  const split = (line: string) => line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
  const headers = split(lines[0]).map(h => h.trim())
  const out: any[] = []
  for (let i=1;i<lines.length;i++){
    const parts = split(lines[i]).map(p => {
      let v = p.trim(); if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1).replace(/""/g,'"'); return v
    })
    const obj: any = {}; headers.forEach((h,idx)=> obj[h] = parts[idx] ?? '')
    if (obj.quantity!==undefined) obj.quantity = Number(obj.quantity || 0)
    if (obj.tieDye!==undefined) { const s = String(obj.tieDye).toLowerCase(); obj.tieDye = (s==='true'||s==='yes'||s==='1') }
    out.push(obj)
  }
  return out as Item[]
}

export default function App(){
  const fb = initFirebase()   // null => env missing; not null => cloud mode
  const [items, setItems] = useState<Item[]>([])
  const [docIds, setDocIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ nameDrop:'All', category:'All', plush:'All', color:'All', tieDye:'All' as 'All'|'Yes'|'No' })
  const [sort, setSort] = useState<{key: keyof Item | 'barcode'; dir:'asc'|'desc'}>({ key:'barcode', dir:'asc' })
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<null | { mode:'create'|'edit'; data: Item; index?: number }>(null)
  const [toast, setToast] = useState<string|null>(null)
  const fileInputRef = useRef<HTMLInputElement|null>(null)

  // Cloud subscribe
  useEffect(()=>{
    if (!fb) return;
    const collPath = import.meta.env.VITE_FIRESTORE_COLLECTION || 'items'
    const unsub = onSnapshot(collection(fb.db, collPath), snap => {
      const arr: Item[] = []; const ids: string[] = []
      snap.forEach(d => { arr.push(d.data() as Item); ids.push(d.id) })
      setItems(arr); setDocIds(ids)
    })
    return () => unsub()
  },[fb])

  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),2000); return ()=>clearTimeout(t) },[toast])

  const distinct = useMemo(()=>{
    const pick = (k: keyof Item) => Array.from(new Set(items.map(x => (x as any)[k]).filter(Boolean))).sort((a:any,b:any)=>String(a).localeCompare(String(b)))
    return { nameDrop: pick('nameDrop'), category: pick('category'), plush: pick('plush'), color: pick('color') }
  },[items])

  const filtered = useMemo(()=>{
    const q = String(search||'').trim().toLowerCase()
    const pass = (it: Item) => {
      if (filters.nameDrop!=='All' && it.nameDrop!==filters.nameDrop) return false
      if (filters.category!=='All' && it.category!==filters.category) return false
      if (filters.plush!=='All' && it.plush!==filters.plush) return false
      if (filters.color!=='All' && it.color!==filters.color) return false
      if (filters.tieDye!=='All'){ const want = filters.tieDye==='Yes'; if(!!it.tieDye !== want) return false }
      if (!q) return true
      const hay = `${it.barcode} ${it.plush} ${it.style} ${it.category} ${it.color} ${it.nameDrop} ${it.notes}`.toLowerCase()
      return hay.includes(q)
    }
    const out = items.filter(pass)
    const dir = (sort.dir==='asc') ? 1 : -1
    const key = sort.key
    out.sort((a:any,b:any)=> key==='quantity' ? ((+a[key]||0)-(+b[key]||0))*dir : String(a[key]).localeCompare(String(b[key]))*dir )
    return out
  },[items, search, filters, sort])

  function openNew(){ setEditing({mode:'create', data:{ barcode:'', plush:'', style:'', category:'T-shirt', color:'', nameDrop:'', quantity:0, tieDye:false, notes:'', imageUrl:'' }}); setModalOpen(true); }
  function openEdit(it: Item){ const index = items.findIndex(x => x===it); setEditing({ mode:'edit', data:{...it}, index }); setModalOpen(true); }
  async function remove(it: Item){
    if (!confirm(`Delete ${it.barcode} — ${it.plush} (${it.nameDrop})?`)) return
    if (fb){
      const index = items.findIndex(x => x===it); if (index<0) return
      const id = docIds[index]; if (!id) return
      const collPath = import.meta.env.VITE_FIRESTORE_COLLECTION || 'items'
      await deleteDoc(doc(fb.db, collPath, id))
    }
    setToast('Item deleted')
  }

  function exportCSV(){ const csv = toCSV(items); download(`plush-pals-kids-inventory-${new Date().toISOString().slice(0,10)}.csv`, csv); }
  function importCSVHandler(e: React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file) return;
    const reader=new FileReader()
    reader.onload=async ()=>{
      try{ const parsed=parseCSV(String(reader.result||'')); if(!parsed.length) return alert('No rows found in CSV');

  // === Totals/stat cards ===
  const totalSKUs = items.length;
  const totalUnits = useMemo(() => items.reduce((m, it) => m + (Number(it.quantity) || 0), 0), [items]);
  const filteredSKUs = filtered.length;
  const unitsInSelectedNameDrop = useMemo(() => {
    if (filters.nameDrop === 'All') return 0;
    return items.filter(x => x.nameDrop === filters.nameDrop).reduce((m, it) => m + (Number(it.quantity) || 0), 0);
  }, [items, filters.nameDrop]);
        let skipped=0;
        const normalized=parsed.map(r=>{ const bc=(r.barcode||'').trim(); if(!bc){ skipped++; return null; } return { ...r, barcode: bc } as Item }).filter(Boolean) as Item[]
        if (fb){
          const collPath = import.meta.env.VITE_FIRESTORE_COLLECTION || 'items'
          for (const row of normalized){ await addDoc(collection(fb.db, collPath), { ...row, _ts: serverTimestamp() }) }
        } else {
          setItems(prev => [...prev, ...normalized])
        }
        setToast(skipped ? `CSV imported (skipped ${skipped} rows without barcode)` : 'CSV imported')
      } catch(err){ console.error(err); alert('Failed to import CSV') }
      finally { e.target.value = '' }
    }
    reader.readAsText(file)
  }

  async function handleImageFile(e: React.ChangeEvent<HTMLInputElement>){
    const file = e.target.files?.[0]; if(!file) return
    if (file.size > 2 * 1024 * 1024){ const ok = confirm('This image is larger than 2 MB. Use anyway?'); if(!ok){ e.target.value=''; return; } }
    if (fb){
      const safe = (editing?.data.barcode || 'img') + '_' + Date.now() + '_' + (file.name || 'file')
      const r = sRef((initFirebase() as any).storage, `images/${safe}`)
      await uploadBytes(r, file)
      const url = await getDownloadURL(r)
      setEditing(prev => prev ? ({ ...prev, data: { ...prev.data, imageUrl: url } }) : prev)
    } else {
      const reader = new FileReader()
      reader.onload = () => { setEditing(prev => prev ? ({ ...prev, data: { ...prev.data, imageUrl: String(reader.result) } }) : prev) }
      reader.readAsDataURL(file)
    }
  }

  async function onSubmitForm(e: React.FormEvent<HTMLFormElement>){
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const data: any = Object.fromEntries(form.entries())
    const payload: Item = { barcode:String(data.barcode||'').trim(), plush:String(data.plush||'').trim(), style:String(data.style||'').trim(), category:String(data.category||'T-shirt'), color:String(data.color||'').trim(), nameDrop:String(data.nameDrop||'').trim(), quantity:Number(data.quantity||0), tieDye:data.tieDye==='on', notes:String(data.notes||'').trim(), imageUrl:String(data.imageUrl||'').trim() }
    if (!payload.barcode) return alert('Barcode is required')
    if (!payload.plush) return alert('Plush is required')
    if (!payload.nameDrop) return alert('Name Drop is required')
    if (!Number.isFinite(payload.quantity) || payload.quantity<0) return alert('Quantity must be 0 or more')

    if (fb){
      const collPath = import.meta.env.VITE_FIRESTORE_COLLECTION || 'items'
      if (editing?.mode==='edit' && typeof editing.index === 'number'){
        const id = docIds[editing.index]; if (id) await setDoc(doc(fb.db, collPath, id), { ...payload, _ts: serverTimestamp() })
      } else {
        await addDoc(collection(fb.db, collPath), { ...payload, _ts: serverTimestamp() })
      }
    } else {
      setItems(prev => {
        if (editing?.mode==='edit' && typeof editing.index === 'number'){ const next=[...prev]; next[editing.index]=payload; return next }
        return [...prev, payload]
      })
    }
    setModalOpen(false); setEditing(null); setToast(editing?.mode==='edit'?'Item updated':'Item added')
  }

  const columns = ['#','Barcode','Plush','Style','Category','Color','Name Drop','Qty','Tie-Dye','Notes','Image','Actions']

  return (<div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">
    <header className="sticky top-0 z-30 bg-gradient-to-b from-white to-white/80 backdrop-blur border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div><h1 className="text-2xl font-bold">Plush Pals Kids Inventory — Cloud Sync</h1><p className="text-sm text-gray-600">Realtime across devices. Anonymous auth; no login UI.</p></div>
        <div className="flex gap-2">
          <button className="rounded-xl bg-gray-900 text-white px-4 py-2 hover:bg-black" onClick={()=>openNew()}>Add Item</button>
          <button className="rounded-xl bg-white border px-4 py-2 hover:bg-gray-50" onClick={()=>exportCSV()}>Export CSV</button>
          <button className="rounded-xl bg-white border px-4 py-2 hover:bg-gray-50" onClick={()=>document.getElementById('csvFile')!.click()}>Import CSV</button>
          <input id="csvFile" type="file" accept=".csv,text/csv" className="hidden" onChange={importCSVHandler} />
        </div>
      </div>
    </header>

    <section className="mx-auto max-w-7xl px-4 pt-4 pb-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="block text-sm text-gray-600 mb-1">Search</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} className="w-full rounded-xl border px-3 py-2" placeholder="Search barcode, plush, color, name drop, notes…" />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Name Drop</label>
          <select value={filters.nameDrop} onChange={e=>setFilters({...filters, nameDrop:e.target.value})} className="w-full rounded-xl border px-3 py-2">
            <option>All</option>
            {distinct.nameDrop.map(v=><option key={v as any}>{v as any}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-3 md:col-span-1">
          <div><label className="block text-sm text-gray-600 mb-1">Category</label>
            <select value={filters.category} onChange={e=>setFilters({...filters, category:e.target.value})} className="w-full rounded-xl border px-3 py-2"><option>All</option><option>T-shirt</option><option>Dress</option><option>Onesie</option></select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Plush</label>
            <select value={filters.plush} onChange={e=>setFilters({...filters, plush:e.target.value})} className="w-full rounded-xl border px-3 py-2"><option>All</option>{distinct.plush.map(v=><option key={v as any}>{v as any}</option>)}</select>
          </div>
          <div><label className="block text-sm text-gray-600 mb-1">Color</label>
            <select value={filters.color} onChange={e=>setFilters({...filters, color:e.target.value})} className="w-full rounded-xl border px-3 py-2"><option>All</option>{distinct.color.map(v=><option key={v as any}>{v as any}</option>)}</select>
          </div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-4 pb-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-white/60 backdrop-blur shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total SKUs</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{totalSKUs}</div>
        </div>
        <div className="rounded-2xl bg-white/60 backdrop-blur shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Total Units</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{totalUnits}</div>
        </div>
        <div className="rounded-2xl bg-white/60 backdrop-blur shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">Filtered SKUs</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{filteredSKUs}</div>
        </div>
        <div className="rounded-2xl bg-white/60 backdrop-blur shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-500">{filters.nameDrop !== 'All' ? `Units in ${filters.nameDrop}` : 'Units in (select Name Drop)'}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{unitsInSelectedNameDrop}</div>
        </div>
      </div>
    </section>


    <section className="mx-auto max-w-7xl px-4 pb-10">
      <div className="overflow-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead><tr className="bg-gray-50 text-left">
            {columns.map((h,i)=>(<th key={i} className="px-3 py-2 font-medium text-gray-700 border-b">{h}</th>))}
          </tr></thead>
          <tbody>
            {filtered.map((it, idx)=>(<tr key={it.barcode} className="border-b last:border-0 hover:bg-gray-50/60">
              <td className="px-3 py-2 font-mono text-xs">{it.barcode}</td>
              <td className="px-3 py-2">{it.plush}</td>
              <td className="px-3 py-2">{it.style}</td>
              <td className="px-3 py-2">{it.category}</td>
              <td className="px-3 py-2">{it.color}</td>
              <td className="px-3 py-2">{it.nameDrop}</td>
              <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
              <td className="px-3 py-2"><label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={!!it.tieDye} onChange={async (e)=>{
                  const checked = e.target.checked;
                  if (fb){
                    const index = items.findIndex(x => x===it); if (index<0) return;
                    const id = docIds[index]; if (!id) return;
                    const collPath = import.meta.env.VITE_FIRESTORE_COLLECTION || 'items';
                    await setDoc(doc(fb.db, collPath, id), { ...it, tieDye: checked, _ts: serverTimestamp() });
                  } else {
                    setItems(prev => {
                      const idx = prev.findIndex(x=>x===it); if (idx<0) return prev;
                      const next = [...prev]; next[idx] = { ...it, tieDye: checked }; return next;
                    });
                  }
                }} />
                {it.tieDye ? 'Yes' : 'No'}
              </label></td>
              <td className="px-3 py-2 max-w-[24ch] truncate" title={it.notes}>{it.notes}</td>
              <td className="px-3 py-2">{it.imageUrl ? (<img src={it.imageUrl} alt={it.plush} className="h-10 w-10 object-cover rounded-lg transition-transform duration-200 hover:scale-[2] origin-left" />) : (<span className="text-gray-400">—</span>)}</td>
              <td className="px-3 py-2"><div className="flex gap-2">
                <button className="rounded-lg border px-2 py-1 hover:bg-gray-50" onClick={()=>openEdit(it)}>Edit</button>
                <button className="rounded-lg border px-2 py-1 hover:bg-red-50 text-red-600 border-red-200" onClick={()=>remove(it)}>Delete</button>
              </div></td>
            </tr><td className=\"px-3 py-2 text-xs text-gray-500\">#{idx+1}</td>
            {!filtered.length && (<tr><td colSpan={11} className="px-3 py-10 text-center text-gray-500">No items match your search/filters.</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>

    {modalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={()=>setModalOpen(false)} />
      <div className="relative z-10 w-[min(720px,92vw)] max-h-[90vh] overflow-auto rounded-2xl bg-white shadow-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold">{editing?.mode==='edit' ? `Edit ${editing?.data?.barcode}` : 'Add New Item'}</h3><button className="px-2 py-1 text-gray-500 hover:text-gray-700" onClick={()=>setModalOpen(false)} aria-label="Close">✕</button></div>
        <form onSubmit={onSubmitForm} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="block text-sm text-gray-600 mb-1">Barcode *</label><input name="barcode" required defaultValue={editing?.data?.barcode || ''} className="w-full rounded-xl border px-3 py-2" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Plush *</label><input name="plush" defaultValue={editing?.data?.plush || ''} className="w-full rounded-xl border px-3 py-2" placeholder="Dolphin, Turtle, Mermaid…" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Style</label><input name="style" defaultValue={editing?.data?.style || ''} className="w-full rounded-xl border px-3 py-2" placeholder="Classic, Tie-Dye, etc." /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Category</label><select name="category" defaultValue={editing?.data?.category || 'T-shirt'} className="w-full rounded-xl border px-3 py-2"><option>T-shirt</option><option>Dress</option><option>Onesie</option></select></div>
            <div><label className="block text-sm text-gray-600 mb-1">Color</label><input name="color" defaultValue={editing?.data?.color || ''} className="w-full rounded-xl border px-3 py-2" placeholder="Blue, Green…" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Name Drop *</label><input name="nameDrop" defaultValue={editing?.data?.nameDrop || ''} className="w-full rounded-xl border px-3 py-2" placeholder="Key West, Miami Beach…" /></div>
            <div><label className="block text-sm text-gray-600 mb-1">Quantity *</label><input name="quantity" type="number" min={0} step={1} defaultValue={editing?.data?.quantity ?? 0} className="w-full rounded-xl border px-3 py-2" /></div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Image</label>
              <div className="flex items-center gap-3">
                <input name="imageUrl" defaultValue={editing?.data?.imageUrl || ''} className="w-full rounded-xl border px-3 py-2" placeholder="https://… (or upload)" />
                <input type="file" accept="image/*" onChange={handleImageFile} />
              </div>
              <p className="text-xs text-gray-500">In cloud mode, uploads go to Firebase Storage.</p>
            </div>
            <div className="md:col-span-2"><label className="block text-sm text-gray-600 mb-1">Notes</label><textarea name="notes" rows={3} defaultValue={editing?.data?.notes || ''} className="w-full rounded-xl border px-3 py-2" /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={()=>setModalOpen(false)} className="rounded-xl border px-4 py-2 bg-white hover:bg-gray-50">Cancel</button>
            <button type="submit" className="rounded-xl bg-gray-900 text-white px-4 py-2 hover:bg-black">{editing?.mode==='edit'?'Save Changes':'Add Item'}</button>
          </div>
        </form>
      </div>
    </div>)}

    {toast && (<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50"><div className="rounded-full bg-gray-900 text-white px-4 py-2 shadow-lg">{toast}</div></div>)}

    <footer className="mx-auto max-w-7xl px-4 py-8 text-xs text-gray-500">
      <div>Cloud mode only: set env vars to enable Firestore/Storage. Duplicates allowed; edits replace only the edited row.</div>
    </footer>
  </div>)
}
