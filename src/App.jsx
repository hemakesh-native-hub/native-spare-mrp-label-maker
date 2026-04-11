import React, { useState, useCallback, useRef, useEffect } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── Constants ────────────────────────────────────────────────────────────────
const MARKETED_BY_DEFAULT =
  'Urban Company Limited 7th Floor, GoWorks, Plot 183, Udyog Vihar Phase 1, Gurugram, Haryana - 122008'
const CUSTOMER_CARE_DEFAULT =
  'Contact customer care officer at ucwaterpurifier@urbancompany.com, +911244577306 or reach out at Urban Company Limited, 7th floor, GoWorks, Plot 183, Udyog Vihar Phase 1, Gurugram, Haryana - 122008'
const F = '"Open Sauce One", sans-serif'
const DRIVE_ROOT_FOLDER_ID = '11whQ278ugIk-qhJWhTvIYkOjosfc4VQJ'

const MANUFACTURERS = [
  'Ronch Polymers Private Limited Sur. No. C-38/1, Phase-1, Chakan MIDC, Village Mahalunge, Tal. Khed, Dist. Pune, Maharashtra - 410501',
  'IoTfy Solutions Private Limited 411, D-21 Corporate Park, Sector-21 Dwarka, Delhi - 110077',
  'M/s Accord Power Conversion Private Unit -2, Plot no. S-4/, Sy.114, E-City, Srinagar Village, Maheshwaram Mandal, Dist. Hyderabad - 501359 India',
  'Filtrex Technologies Private Limited No. 36/4, Raghavendra Nagar, 4th Cross, HRBR Layout, Bengaluru, Karnataka - 560043',
  'Lexcru Water Tech Private Limited Survey No. 569, Old Block No. 217 A, Mouje Chandiyel, Tal Daskroi, Ahmedabad, Gujarat - 382433',
  'Geltron Techno Systems Private Limited Gadson House, Plot 9, Road 2, Sector 19, New Panvel, New Mumbai, Maharashtra - 410206',
  'Unisem Electronics Private Limited No. 193, 18th A Main, 4th Cross Road, 6th Block, Koramangala, Bangalore - 560095',
  'Cpfilter Technologies Private Limited No. 295/2, Kariapalli Matta, Muragamalla Road, Kagathi Panchayat, Karnataka - 563125',
  'Sunglownx Electronics Private Limited Gut No. 59, Khandoba Mala, Dhanore Tal, Khed, Pune, Maharashtra - 412105',
  'Gadson Electronics Gadson House, Plot No. 9, Road No 2, Sector 19, New Panvel, Navi Mumbai, Maharashtra - 410206',
  'Kreet Electrovision Plot No. 4, Gali No. 1, DC Enclave, Sector 88, VPO-Wazirpur, Greater Faridabad, Haryana - 121001',
  'No. 2216-2218 Xingfu East Road, Hongqiao Town, Yueqing City, Zhejiang Province, China',
  'VaccFast Gala No. 8,9,10, Badrinath Building, Tungareshwar Industrial Complex, Sativali Naka, Vasai East - 401208',
]

const toTitleCase = (str) => str.replace(/(\b\w)/g, (c) => c.toUpperCase())

// FIX 3: separate filters
// digitsOnly — for weight, MRP (numbers + decimal only)
const digitsOnly = (str) => str.replace(/[^\d.,]/g, '')
// dimsOnly — for dimension fields: allow digits, letters, spaces, ×, x, X, ., -
const dimsOnly = (str) => str.replace(/[^\d\w\s×xX.\-]/g, '')

// ─── State factories ──────────────────────────────────────────────────────────
const makeInnerState = () => ({
  productName: '', skuCode: '', commodity: 'Water Purifier Spare Part',
  mrp: '', unitSalePrice: '', netQuantity: '', boxDimension: '',
  netWeight: '', grossWeight: '', countryOfOrigin: 'India',
  manufacturedOn: '', marketedBy: MARKETED_BY_DEFAULT, manufacturedBy: '',
  customerCare: CUSTOMER_CARE_DEFAULT,
  showUnitSalePrice: true, showNetWeight: true, showGrossWeight: true, showManufacturedOn: true,
})
const makeOuterState = () => ({
  productName: '', skuCode: '', commodity: 'Water Purifier Spare Part',
  qtyInOuterBox: '', innerPackagingDimensions: '', outerBoxDimensions: '',
  netWeight: '', grossWeight: '', countryOfOrigin: 'India',
  manufacturedOn: '', marketedBy: MARKETED_BY_DEFAULT, manufacturedBy: '',
  showManufacturedOn: true,
})

// ─── Google OAuth ─────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

function useGoogleAuth() {
  const [googleReady, setGoogleReady] = useState(false)
  const [user,        setUser]        = useState(null)
  const [authError,   setAuthError]   = useState(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    const existing = document.getElementById('google-gsi-script')
    if (existing) { setGoogleReady(true); return }
    const script = document.createElement('script')
    script.id = 'google-gsi-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => setGoogleReady(true)
    document.head.appendChild(script)
  }, [])

  const signIn = useCallback(() => {
    if (!window.google) { setAuthError('Google Identity Services not loaded.'); return }
    setAuthError(null)
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: `openid email profile ${DRIVE_SCOPE}`,
      callback: async (tokenResponse) => {
        if (tokenResponse.error) { setAuthError(`Sign-in failed: ${tokenResponse.error}`); return }
        try {
          const res     = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
          })
          const profile = await res.json()
          setUser({ name: profile.name, email: profile.email, picture: profile.picture, accessToken: tokenResponse.access_token })
        } catch { setAuthError('Could not fetch user profile.') }
      },
    })
    tokenClient.requestAccessToken()
  }, [])

  const signOut = useCallback(() => {
    if (user?.accessToken && window.google) window.google.accounts.oauth2.revoke(user.accessToken, () => {})
    setUser(null)
  }, [user])

  return { googleReady, user, authError, signIn, signOut }
}

// ─── Google Drive helpers ─────────────────────────────────────────────────────
async function findFolder(name, parentId, accessToken) {
  const q = `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`)
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function createFolder(name, parentId, accessToken) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  })
  if (!res.ok) throw new Error(`Create folder failed: ${res.status}`)
  return (await res.json()).id
}

async function ensureFolder(name, parentId, accessToken) {
  const existing = await findFolder(name, parentId, accessToken)
  return existing ?? await createFolder(name, parentId, accessToken)
}

async function ensureLabelFolder(productName, accessToken) {
  const now         = new Date()
  const yyyy        = now.getFullYear()
  const mm          = String(now.getMonth() + 1).padStart(2, '0')
  const monthName   = now.toLocaleString('en-US', { month: 'long' })
  const monthFolder = `${yyyy}-${mm} ${monthName}`
  const prodFolder  = (productName || 'Untitled').trim()
  const labelsId    = await ensureFolder('Labels',      DRIVE_ROOT_FOLDER_ID, accessToken)
  const monthId     = await ensureFolder(monthFolder,   labelsId,             accessToken)
  const productId   = await ensureFolder(prodFolder,    monthId,              accessToken)
  return { folderId: productId, folderPath: `Labels / ${monthFolder} / ${prodFolder}` }
}

async function uploadToDrive(blob, filename, mimeType, folderId, accessToken) {
  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: filename, parents: [folderId] })], { type: 'application/json' }))
  form.append('file', blob)
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Upload failed: ${res.status}`)
  }
  return (await res.json()).webViewLink
}

// ─── Export engine ────────────────────────────────────────────────────────────
async function fetchAsBase64(url) {
  try {
    const res   = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf   = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let binary  = ''
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } catch (e) {
    console.warn(`Could not load asset ${url}:`, e)
    return null
  }
}

async function fetchLogoDataURIs() {
  const [native, uc] = await Promise.all([
    fetchAsBase64('/logos/native-logo.svg'),
    fetchAsBase64('/logos/uc-logo.svg'),
  ])
  return {
    native: native ? `data:image/svg+xml;base64,${native}` : null,
    uc:     uc     ? `data:image/svg+xml;base64,${uc}`     : null,
  }
}

function buildFilename(productName, labelType, ext) {
  const name   = (productName || 'Untitled').trim()
  const suffix = labelType === 'inner' ? 'Inner LM' : 'Outer LM'
  return `${name} (${suffix}).${ext}`
}

// FIX 1 + FIX 2:
// Render the label to a high-res canvas ONCE, then use that canvas for BOTH
// the SVG export (embedded as a <image> PNG data URI — universally supported)
// and the PDF export (same canvas, no re-render).
// Scale 4× → 1280×1280px raster → razor-sharp at 80×80mm print size (~400 DPI).
async function renderLabelToCanvas(labelRef) {
  return html2canvas(labelRef.current, {
    scale: 4,                    // 4× = 1280px for a 320px element → ~400 DPI at 80mm print
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
    imageTimeout: 0,
  })
}

// FIX 2: SVG now embeds the canvas raster as a <image> PNG — no foreignObject,
// works in every viewer (Illustrator, Chrome, macOS Preview, etc.)
async function buildSVGBlob(canvas) {
  const pngDataURI = canvas.toDataURL('image/png')
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="320" height="320" viewBox="0 0 320 320">
  <image x="0" y="0" width="320" height="320" xlink:href="${pngDataURI}" image-rendering="crisp-edges"/>
</svg>`
  return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
}

// FIX 1: High-quality PDF — use the 4× canvas directly, JPEG at 95% quality
async function buildPDFBlob(canvas) {
  // Convert canvas → JPEG at 95% quality (sharper than PNG→PDF pipeline)
  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 80],
    compress: false,
  })
  pdf.addImage(imgData, 'JPEG', 0, 0, 80, 80, undefined, 'FAST')
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' })
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function runExport(labelRef, productName, labelType, accessToken) {
  const svgFilename = buildFilename(productName, labelType, 'svg')
  const pdfFilename = buildFilename(productName, labelType, 'pdf')

  // Render once at 4×, reuse for both exports
  const canvas = await renderLabelToCanvas(labelRef)

  const [svgBlob, pdfBlob] = await Promise.all([
    buildSVGBlob(canvas),
    buildPDFBlob(canvas),
  ])

  // Local downloads
  downloadBlob(svgBlob, svgFilename)
  downloadBlob(pdfBlob, pdfFilename)

  // Drive upload
  if (!accessToken) return null
  const { folderId, folderPath } = await ensureLabelFolder(productName, accessToken)
  await Promise.all([
    uploadToDrive(svgBlob, svgFilename, 'image/svg+xml',   folderId, accessToken),
    uploadToDrive(pdfBlob, pdfFilename, 'application/pdf', folderId, accessToken),
  ])
  return { folderLink: `https://drive.google.com/drive/folders/${folderId}`, folderPath }
}

// ─── UI Components ────────────────────────────────────────────────────────────
function GoogleSignInButton({ onSignIn }) {
  return (
    <button onClick={onSignIn}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition text-xs font-medium text-gray-700 shadow-sm">
      <svg width="14" height="14" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Sign in with Google
    </button>
  )
}

function UserChip({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition">
        {user.picture
          ? <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
          : <div className="w-6 h-6 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">{user.name?.[0]}</div>
        }
        <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{user.name}</span>
        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 rounded-xl border border-gray-200 bg-white shadow-lg py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-700 truncate">{user.name}</p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <button onClick={() => { setOpen(false); onSignOut() }}
            className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition">Sign out</button>
        </div>
      )}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${checked ? 'bg-indigo-500' : 'bg-gray-300'}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

const ADD_NEW = '__ADD_NEW__'
function ManufacturerField({ value, onChange }) {
  const [isCustom,   setIsCustom]   = useState(false)
  const [customList, setCustomList] = useState([])
  const allOptions = [...MANUFACTURERS, ...customList]
  const isKnown    = allOptions.includes(value)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manufactured By</label>
      {!isCustom ? (
        <>
          <select
            value={isKnown ? value : (value ? ADD_NEW : '')}
            onChange={(e) => {
              if (e.target.value === ADD_NEW) { setIsCustom(true); onChange('') }
              else onChange(e.target.value)
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition appearance-none"
            style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center', paddingRight:'32px' }}>
            <option value="" disabled>Select manufacturer…</option>
            {allOptions.map((m, i) => <option key={i} value={m}>{m.length > 60 ? m.slice(0, 60) + '…' : m}</option>)}
            <option value={ADD_NEW}>+ Add new manufacturer</option>
          </select>
          {value && <div className="mt-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-500 leading-relaxed">{value}</div>}
        </>
      ) : (
        <CustomManufacturerInput
          onSave={(v) => {
            if (v.trim() && !allOptions.includes(v.trim())) setCustomList(p => [...p, v.trim()])
            onChange(v)
            setIsCustom(false)
          }}
          onCancel={() => setIsCustom(false)}
        />
      )}
    </div>
  )
}

function CustomManufacturerInput({ onSave, onCancel }) {
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Enter manufacturer name and full address…" rows={4}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none transition" />
      <div className="flex gap-2">
        <button onClick={() => onSave(text)} disabled={!text.trim()}
          className="flex-1 py-2 text-xs font-semibold text-white rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 transition">Save & Use</button>
        <button onClick={onCancel}
          className="flex-1 py-2 text-xs font-semibold text-gray-500 rounded-lg border border-gray-200 hover:border-gray-300 transition">Cancel</button>
      </div>
    </div>
  )
}

function Field({ label, name, value, onChange, placeholder='', multiline=false, optional=false, shown, onToggle, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
          {hint     && <span className="ml-1 text-gray-400 font-normal normal-case">({hint})</span>}
          {optional && <span className="ml-1 text-gray-400 font-normal normal-case">(optional)</span>}
        </label>
        {optional && <Toggle checked={shown} onChange={onToggle} />}
      </div>
      {(!optional || shown) && (
        multiline
          ? <textarea name={name} value={value} onChange={onChange} placeholder={placeholder} rows={3}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none transition" />
          : <input type="text" name={name} value={value} onChange={onChange} placeholder={placeholder}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition" />
      )}
    </div>
  )
}

function MRPField({ value, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">MRP</label>
      <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
        <span className="pl-3 pr-1 text-sm text-gray-400 select-none">₹</span>
        <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(digitsOnly(e.target.value))} placeholder="500"
          className="flex-1 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent min-w-0" />
        <span className="pr-3 pl-1 text-sm text-gray-300 select-none whitespace-nowrap">(incl. of all taxes)</span>
      </div>
    </div>
  )
}

function SuffixNumberField({ label, value, onChange, suffix, placeholder='', optional=false, shown, onToggle }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}{optional && <span className="ml-1 text-gray-400 font-normal normal-case">(optional)</span>}
        </label>
        {optional && <Toggle checked={shown} onChange={onToggle} />}
      </div>
      {(!optional || shown) && (
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
          <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(digitsOnly(e.target.value))} placeholder={placeholder}
            className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent min-w-0" />
          <span className="pr-3 text-sm text-gray-300 select-none">{suffix}</span>
        </div>
      )}
    </div>
  )
}

// FIX 3: DimensionField — free text input with "mm" suffix hint, allows 120 x 120 mm etc.
function DimensionField({ label, value, onChange, placeholder='e.g. 120 × 120', hint='in mm', optional=false, shown, onToggle }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label}
          {hint && <span className="ml-1 text-gray-400 font-normal normal-case">({hint})</span>}
          {optional && <span className="ml-1 text-gray-400 font-normal normal-case">(optional)</span>}
        </label>
        {optional && <Toggle checked={shown} onChange={onToggle} />}
      </div>
      {(!optional || shown) && (
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent min-w-0"
          />
          <span className="pr-3 text-sm text-gray-300 select-none">mm</span>
        </div>
      )}
    </div>
  )
}

// ─── Label components ─────────────────────────────────────────────────────────
function LabelRow({ label, value, isLast=false }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', paddingTop:0, paddingBottom:3 }}>
        <div style={{ width:80, minWidth:80, fontSize:5, fontWeight:600, color:'#757575', lineHeight:1.5, fontFamily:F, paddingRight:6, flexShrink:0 }}>{label}</div>
        <div style={{ flex:1, fontSize:5, fontWeight:400, color:'#757575', lineHeight:1.5, fontFamily:F }}>{value}</div>
      </div>
      {!isLast && (
        <>
        <div style={{ height:0.5, background:'#FFFFFF', paddingTop:3 }} />
        <div style={{ height:0.5, background:'#EEEEEE' }} />
        </>
      )}
    </div>
  )
}

function LogoBar() {
  return (
    <div style={{ height:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, paddingTop:2 }}>
      <img src="/logos/native-logo.svg" alt="NATIVE" style={{ width:64, height:8, objectFit:'contain', objectPosition:'left center', display:'block' }} />
      <img src="/logos/uc-logo.svg" alt="Urban Company" style={{ width:49, height:14, objectFit:'contain', objectPosition:'right center', display:'block' }} />
    </div>
  )
}

const fmtMRP = (v) => v ? `₹${v} (incl. of all taxes)` : ''
const fmtMm  = (v) => v ? `${v} mm` : ''
const fmtG   = (v) => v ? `${v} g` : ''

function InnerLabel({ data }) {
  const rows = [
    { label:'SKU code',             value:data.skuCode },
    { label:'Commodity',            value:data.commodity },
    { label:'MRP',                  value:fmtMRP(data.mrp) },
    ...(data.showUnitSalePrice ? [{ label:'Unit sale price', value:data.unitSalePrice }] : []),
    { label:'Net quantity',         value:data.netQuantity },
    { label:'Packaging dimensions', value:fmtMm(data.boxDimension) },
    ...(data.showNetWeight   ? [{ label:'Net weight',   value:fmtG(data.netWeight) }]   : []),
    ...(data.showGrossWeight ? [{ label:'Gross weight', value:fmtG(data.grossWeight) }] : []),
    { label:'Country of origin',    value:data.countryOfOrigin },
    ...(data.showManufacturedOn ? [{ label:'Manufactured on', value:data.manufacturedOn }] : []),
    { label:'Marketed by',          value:data.marketedBy },
    { label:'Manufactured by',      value:data.manufacturedBy },
    { label:'Customer care',        value:data.customerCare },
  ]
  return (
    <div style={{ width:320, height:320, background:'#FFFFFF', padding:'20px 20px 0px 20px', display:'flex', flexDirection:'column', boxSizing:'border-box', fontFamily:F }}>
      <div style={{ fontSize:14, fontWeight:500, color:'#757575', lineHeight:1.3, marginBottom:4, fontFamily:F, flexShrink:0 }}>
        {data.productName || <span style={{ color:'#D1D5DB' }}>Product Name</span>}
      </div>
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {rows.map(({ label, value }, i) => <LabelRow key={label} label={label} value={value} isLast={i === rows.length - 1} />)}
      </div>
      <LogoBar />
    </div>
  )
}

function OuterLabel({ data }) {
  const rows = [
    { label:'SKU code',                   value:data.skuCode },
    { label:'Commodity',                  value:data.commodity },
    { label:'Quantity in outer box',      value:data.qtyInOuterBox },
    { label:'Inner packaging dimensions', value:data.innerPackagingDimensions },
    { label:'Outer box dimensions',       value:data.outerBoxDimensions },
    { label:'Net weight',                 value:fmtG(data.netWeight) },
    { label:'Gross weight',               value:fmtG(data.grossWeight) },
    { label:'Country of origin',          value:data.countryOfOrigin },
    ...(data.showManufacturedOn ? [{ label:'Manufactured on', value:data.manufacturedOn }] : []),
    { label:'Marketed by',                value:data.marketedBy },
    { label:'Manufactured by',            value:data.manufacturedBy },
  ]
  return (
    <div style={{ width:320, height:320, background:'#FFFFFF', padding:'20px 20px 16px 20px', display:'flex', flexDirection:'column', boxSizing:'border-box', fontFamily:F }}>
      <div style={{ fontSize:14, fontWeight:500, color:'#757575', lineHeight:1.3, marginBottom:4, fontFamily:F, flexShrink:0 }}>
        {data.productName || <span style={{ color:'#D1D5DB' }}>Product Name</span>}
      </div>
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {rows.map(({ label, value }) => <LabelRow key={label} label={label} value={value} isLast={false} />)}
        <div><div style={{ paddingTop:3, paddingBottom:3 }}><span style={{ fontSize:5, fontWeight:600, color:'#757575', fontFamily:F }}>NOT FOR RETAIL SALE</span></div></div>
      </div>
      <LogoBar />
    </div>
  )
}

// ─── Forms ────────────────────────────────────────────────────────────────────
function InnerForm({ data, onChange }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value })
  const t = (key) => (val) => onChange({ ...data, [key]: val })
  return (
    <div className="flex flex-col gap-4">
      <Field label="Product Name" name="productName" value={data.productName}
        onChange={(e) => onChange({ ...data, productName: toTitleCase(e.target.value) })} placeholder="e.g. Flow Restrictor 300" />
      <Field label="SKU Code" name="skuCode" value={data.skuCode}
        onChange={(e) => onChange({ ...data, skuCode: e.target.value.toUpperCase() })} placeholder="e.g. NATIVE/FR/300" />
      <Field label="Commodity" name="commodity" value={data.commodity}
        onChange={(e) => onChange({ ...data, commodity: toTitleCase(e.target.value) })} />
      <MRPField value={data.mrp} onChange={(v) => onChange({ ...data, mrp: v })} />
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Unit Sale Price <span className="font-normal normal-case text-gray-400">(optional)</span>
          </label>
          <Toggle checked={data.showUnitSalePrice} onChange={t('showUnitSalePrice')} />
        </div>
        {data.showUnitSalePrice && (
          <input type="text" name="unitSalePrice" value={data.unitSalePrice} onChange={h} placeholder="e.g. ₹399"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition" />
        )}
      </div>
      <Field label="Net Quantity" name="netQuantity" value={data.netQuantity} onChange={h} placeholder="e.g. 1 Unit" />

      {/* FIX 3: DimensionField replaces the old numeric-only input */}
      <DimensionField
        label="Packaging Dimensions"
        value={data.boxDimension}
        onChange={(v) => onChange({ ...data, boxDimension: v })}
        placeholder="e.g. 120 × 200"
      />

      <SuffixNumberField label="Net Weight" value={data.netWeight} onChange={(v) => onChange({ ...data, netWeight: v })}
        suffix="g" placeholder="e.g. 20" optional shown={data.showNetWeight} onToggle={t('showNetWeight')} />
      <SuffixNumberField label="Gross Weight" value={data.grossWeight} onChange={(v) => onChange({ ...data, grossWeight: v })}
        suffix="g" placeholder="e.g. 22" optional shown={data.showGrossWeight} onToggle={t('showGrossWeight')} />
      <Field label="Country of Origin" name="countryOfOrigin" value={data.countryOfOrigin} onChange={h} />
      <Field label="Manufactured On" name="manufacturedOn" value={data.manufacturedOn} onChange={h}
        placeholder="e.g. Jan 2024" optional shown={data.showManufacturedOn} onToggle={t('showManufacturedOn')} />
      <Field label="Marketed By" name="marketedBy" value={data.marketedBy} onChange={h} multiline />
      <ManufacturerField value={data.manufacturedBy} onChange={(v) => onChange({ ...data, manufacturedBy: v })} />
      <Field label="Customer Care" name="customerCare" value={data.customerCare} onChange={h} multiline />
    </div>
  )
}

function OuterForm({ data, onChange }) {
  const h = (e) => onChange({ ...data, [e.target.name]: e.target.value })
  const t = (key) => (val) => onChange({ ...data, [key]: val })
  return (
    <div className="flex flex-col gap-4">
      <Field label="Product Name" name="productName" value={data.productName}
        onChange={(e) => onChange({ ...data, productName: toTitleCase(e.target.value) })} placeholder="e.g. Flow Restrictor 300" />
      <Field label="SKU Code" name="skuCode" value={data.skuCode}
        onChange={(e) => onChange({ ...data, skuCode: e.target.value.toUpperCase() })} placeholder="e.g. NATIVE/FR/300" />
      <Field label="Commodity" name="commodity" value={data.commodity}
        onChange={(e) => onChange({ ...data, commodity: toTitleCase(e.target.value) })} />
      <Field label="Quantity in Outer Box" name="qtyInOuterBox" value={data.qtyInOuterBox} onChange={h} placeholder="e.g. 12" />

      {/* FIX 3: free-text dimension fields for Outer LM too */}
      <DimensionField
        label="Inner Packaging Dimensions"
        value={data.innerPackagingDimensions}
        onChange={(v) => onChange({ ...data, innerPackagingDimensions: v })}
        placeholder="e.g. 200 × 150"
      />
      <DimensionField
        label="Outer Box Dimensions"
        value={data.outerBoxDimensions}
        onChange={(v) => onChange({ ...data, outerBoxDimensions: v })}
        placeholder="e.g. 400 × 300 × 250"
      />

      <SuffixNumberField label="Net Weight" value={data.netWeight} onChange={(v) => onChange({ ...data, netWeight: v })}
        suffix="g" placeholder="e.g. 3000" />
      <SuffixNumberField label="Gross Weight" value={data.grossWeight} onChange={(v) => onChange({ ...data, grossWeight: v })}
        suffix="g" placeholder="e.g. 3500" />
      <Field label="Country of Origin" name="countryOfOrigin" value={data.countryOfOrigin} onChange={h} />
      <Field label="Manufactured On" name="manufacturedOn" value={data.manufacturedOn} onChange={h}
        placeholder="e.g. Jan 2024" optional shown={data.showManufacturedOn} onToggle={t('showManufacturedOn')} />
      <Field label="Marketed By" name="marketedBy" value={data.marketedBy} onChange={h} multiline />
      <ManufacturerField value={data.manufacturedBy} onChange={(v) => onChange({ ...data, manufacturedBy: v })} />
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [labelType,    setLabelType]    = useState('inner')
  const [innerData,    setInnerData]    = useState(makeInnerState)
  const [outerData,    setOuterData]    = useState(makeOuterState)
  const [exporting,    setExporting]    = useState(false)
  const [exportError,  setExportError]  = useState(null)
  const [driveError,   setDriveError]   = useState(null)
  const [driveSuccess, setDriveSuccess] = useState(null)
  const labelRef = useRef(null)
  const { googleReady, user, authError, signIn, signOut } = useGoogleAuth()

  const isInner    = labelType === 'inner'
  const activeData = isInner ? innerData : outerData
  const clearStatus = () => { setExportError(null); setDriveError(null); setDriveSuccess(null) }

  const handleExport = useCallback(async () => {
    setExporting(true)
    clearStatus()
    let localOk = false
    try {
      const result = await runExport(labelRef, activeData.productName, labelType, user?.accessToken ?? null)
      localOk = true
      if (result) setDriveSuccess(result)
    } catch (err) {
      const msg = err?.message || 'Unknown error'
      if (!localOk) setExportError(`Export failed — ${msg}`)
      else setDriveError(`Local files downloaded. Drive upload failed — ${msg}`)
    } finally {
      setExporting(false)
    }
  }, [activeData.productName, labelType, user])

  const exportButtonLabel = exporting
    ? (user ? 'Exporting & uploading…' : 'Exporting…')
    : (user ? 'Export + Upload to Drive' : 'Export SVG + PDF')

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F0]" style={{ fontFamily: F }}>

      <aside className="w-[380px] flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Label Maker</h1>
              <p className="text-xs text-gray-400">Native × Urban Company</p>
            </div>
            {GOOGLE_CLIENT_ID && (
              <div className="flex-shrink-0">
                {user ? <UserChip user={user} onSignOut={signOut} />
                  : googleReady ? <GoogleSignInButton onSignIn={signIn} />
                  : <span className="text-xs text-gray-400">Loading…</span>}
              </div>
            )}
          </div>
          {authError && <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-600">{authError}</div>}
          {user && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
              <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              Drive connected — exports will upload automatically
            </div>
          )}
          <div className="mt-3 flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 p-1 gap-1">
            {['inner', 'outer'].map((type) => (
              <button key={type} onClick={() => { setLabelType(type); clearStatus() }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${labelType === type ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>
                {type === 'inner' ? 'Inner LM' : 'Outer LM'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isInner ? <InnerForm data={innerData} onChange={setInnerData} /> : <OuterForm data={outerData} onChange={setOuterData} />}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => { isInner ? setInnerData(makeInnerState()) : setOuterData(makeOuterState()); clearStatus() }}
              className="flex-1 py-2.5 text-xs font-semibold text-gray-500 rounded-xl border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition">
              Reset
            </button>
            <button onClick={handleExport} disabled={exporting}
              className={`flex-1 py-2.5 text-xs font-semibold text-white rounded-xl transition flex items-center justify-center gap-1.5 ${exporting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'}`}>
              {exporting ? (
                <>
                  <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {exportButtonLabel}
                </>
              ) : exportButtonLabel}
            </button>
          </div>

          {!exportError && !driveError && !driveSuccess && (
            <p className="text-xs text-gray-400 text-center truncate">
              {activeData.productName || 'Untitled'} ({isInner ? 'Inner LM' : 'Outer LM'})
            </p>
          )}
          {exportError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 leading-relaxed">{exportError}</div>
          )}
          {driveError && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 leading-relaxed">{driveError}</div>
          )}
          {driveSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 leading-relaxed">
              <p className="font-semibold mb-0.5">Uploaded to Drive ✓</p>
              <p className="text-emerald-600 truncate">{driveSuccess.folderPath}</p>
              <a href={driveSuccess.folderLink} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-indigo-600 hover:underline font-medium">
                Open folder
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center overflow-auto p-10">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="px-2.5 py-1 rounded-full bg-white border border-gray-200 font-medium">320 × 320 px</span>
            <span>→</span>
            <span className="px-2.5 py-1 rounded-full bg-white border border-gray-200 font-medium">80 × 80 mm (print)</span>
            <span className="px-2.5 py-1 rounded-full bg-white border border-gray-200 font-medium capitalize text-indigo-500">
              {isInner ? 'Inner LM' : 'Outer LM'}
            </span>
          </div>
          <div ref={labelRef} style={{ width:320, height:320, boxShadow:'0 0 0 1.5px #CBD5E1, 0 4px 24px 0 rgba(0,0,0,0.08)', borderRadius:2, overflow:'hidden', background:'#FFFFFF', outline:'2px dashed #CBD5E1', outlineOffset:4 }}>
            {isInner ? <InnerLabel data={innerData} /> : <OuterLabel data={outerData} />}
          </div>
          <p className="text-xs text-gray-400 mt-1">Dashed border represents physical sticker edge</p>
        </div>
      </main>
    </div>
  )
}
