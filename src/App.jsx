import React, { useState, useCallback, useRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── Constants ────────────────────────────────────────────────────────────────
const MARKETED_BY_DEFAULT =
  'Urban Company Limited 7th Floor, GoWorks, Plot 183, Udyog Vihar Phase 1, Gurugram, Haryana - 122008'

const CUSTOMER_CARE_DEFAULT =
  'Contact customer care officer at ucwaterpurifier@urbancompany.com, +911244577306 or reach out at Urban Company Limited, 7th floor, GoWorks, Plot 183, Udyog Vihar Phase 1, Gurugram, Haryana - 122008'

const F = '"Open Sauce One", sans-serif'

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
const digitsOnly  = (str) => str.replace(/[^\d.]/g, '')

// ─── State factories ──────────────────────────────────────────────────────────
const makeInnerState = () => ({
  productName: '',
  skuCode: '',
  commodity: 'Water Purifier Spare Part',
  mrp: '',
  unitSalePrice: '',
  netQuantity: '',
  boxDimension: '',
  netWeight: '',
  grossWeight: '',
  countryOfOrigin: 'India',
  manufacturedOn: '',
  marketedBy: MARKETED_BY_DEFAULT,
  manufacturedBy: '',
  customerCare: CUSTOMER_CARE_DEFAULT,
  showUnitSalePrice: true,
  showNetWeight: true,
  showGrossWeight: true,
  showManufacturedOn: true,
})

const makeOuterState = () => ({
  productName: '',
  skuCode: '',
  commodity: 'Water Purifier Spare Part',
  qtyInOuterBox: '',
  innerPackagingDimensions: '',
  outerBoxDimensions: '',
  netWeight: '',
  grossWeight: '',
  countryOfOrigin: 'India',
  manufacturedOn: '',
  marketedBy: MARKETED_BY_DEFAULT,
  manufacturedBy: '',
  showManufacturedOn: true,
})

// ─── Export engine ────────────────────────────────────────────────────────────

// Fetch any public asset and return a base64 string. Falls back gracefully.
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

// Build the @font-face CSS block with base64 data URIs embedded inline.
async function buildEmbeddedFontCSS() {
  const [regular, medium, semibold] = await Promise.all([
    fetchAsBase64('/fonts/OpenSauceOne-Regular.woff2'),
    fetchAsBase64('/fonts/OpenSauceOne-Medium.woff2'),
    fetchAsBase64('/fonts/OpenSauceOne-SemiBold.woff2'),
  ])

  const face = (weight, b64) => b64
    ? `@font-face{font-family:'Open Sauce One';src:url('data:font/woff2;base64,${b64}') format('woff2');font-weight:${weight};font-style:normal;}`
    : ''

  return [
    face(400, regular),
    face(500, medium),
    face(600, semibold),
    '* { box-sizing: border-box; }',
  ].join('\n')
}

// Fetch both logos as base64 data URIs for SVG/PDF embedding.
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

// Derive export filename from product name + label type
function buildFilename(productName, labelType, ext) {
  const name = (productName || 'Untitled').trim()
  const suffix = labelType === 'inner' ? 'Inner LM' : 'Outer LM'
  return `${name} (${suffix}).${ext}`
}

// SVG export — embeds font + logos as base64 inside <defs>
async function exportSVG(labelRef, productName, labelType, logoDataURIs) {
  const fontCSS   = await buildEmbeddedFontCSS()

  // Replace src="/logos/..." in the captured HTML with base64 data URIs
  let labelHTML = labelRef.current.innerHTML
  if (logoDataURIs.native) labelHTML = labelHTML.replaceAll('/logos/native-logo.svg', logoDataURIs.native)
  if (logoDataURIs.uc)     labelHTML = labelHTML.replaceAll('/logos/uc-logo.svg',     logoDataURIs.uc)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
  <defs>
    <style>${fontCSS}</style>
  </defs>
  <foreignObject x="0" y="0" width="320" height="320">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:320px;height:320px;overflow:hidden;font-family:'Open Sauce One',sans-serif;">
      ${labelHTML}
    </div>
  </foreignObject>
</svg>`

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = buildFilename(productName, labelType, 'svg')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// PDF export — renders label div to canvas at 2× scale for crisp output,
// then places it on an 80×80mm jsPDF page.
async function exportPDF(labelRef, productName, labelType) {
  const el = labelRef.current

  // Render to canvas at 2× pixel ratio for sharpness
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const imgData = canvas.toDataURL('image/png')

  // 80×80mm page, no margins
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 80],
  })

  pdf.addImage(imgData, 'PNG', 0, 0, 80, 80)
  pdf.save(buildFilename(productName, labelType, 'pdf'))
}

// Master export — fetches logos once, then runs SVG and PDF in parallel
async function runExport(labelRef, productName, labelType) {
  const logoDataURIs = await fetchLogoDataURIs()
  await Promise.all([
    exportSVG(labelRef, productName, labelType, logoDataURIs),
    exportPDF(labelRef, productName, labelType),
  ])
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
        checked ? 'bg-indigo-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Manufacturer dropdown ────────────────────────────────────────────────────
const ADD_NEW = '__ADD_NEW__'

function ManufacturerField({ value, onChange }) {
  const [isCustom,   setIsCustom]   = useState(false)
  const [customList, setCustomList] = useState([])
  const allOptions = [...MANUFACTURERS, ...customList]
  const isKnown    = allOptions.includes(value)

  const handleSelect = (e) => {
    if (e.target.value === ADD_NEW) { setIsCustom(true); onChange('') }
    else { setIsCustom(false); onChange(e.target.value) }
  }

  const handleCustomSave = (v) => {
    if (v.trim() && !allOptions.includes(v.trim())) setCustomList((p) => [...p, v.trim()])
    setIsCustom(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Manufactured By</label>
      {!isCustom ? (
        <>
          <select
            value={isKnown ? value : (value ? ADD_NEW : '')}
            onChange={handleSelect}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition appearance-none"
            style={{ backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 12px center', paddingRight:'32px' }}
          >
            <option value="" disabled>Select manufacturer…</option>
            {allOptions.map((m, i) => (
              <option key={i} value={m}>{m.length > 60 ? m.slice(0, 60) + '…' : m}</option>
            ))}
            <option value={ADD_NEW}>+ Add new manufacturer</option>
          </select>
          {value && (
            <div className="mt-1 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-xs text-gray-500 leading-relaxed">{value}</div>
          )}
        </>
      ) : (
        <CustomManufacturerInput onSave={(v) => { onChange(v); handleCustomSave(v) }} onCancel={() => setIsCustom(false)} />
      )}
    </div>
  )
}

function CustomManufacturerInput({ onSave, onCancel }) {
  const [text, setText] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <textarea
        autoFocus value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Enter manufacturer name and full address…" rows={4}
        className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none transition"
      />
      <div className="flex gap-2">
        <button onClick={() => onSave(text)} disabled={!text.trim()}
          className="flex-1 py-2 text-xs font-semibold text-white rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 transition">
          Save & Use
        </button>
        <button onClick={onCancel}
          className="flex-1 py-2 text-xs font-semibold text-gray-500 rounded-lg border border-gray-200 hover:border-gray-300 transition">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Form components ──────────────────────────────────────────────────────────
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
        <input type="text" inputMode="numeric" value={value} onChange={(e) => onChange(digitsOnly(e.target.value))}
          placeholder="500"
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
          {label}
          {optional && <span className="ml-1 text-gray-400 font-normal normal-case">(optional)</span>}
        </label>
        {optional && <Toggle checked={shown} onChange={onToggle} />}
      </div>
      {(!optional || shown) && (
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
          <input type="text" inputMode="numeric" value={value}
            onChange={(e) => onChange(digitsOnly(e.target.value))} placeholder={placeholder}
            className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent min-w-0" />
          <span className="pr-3 text-sm text-gray-300 select-none">{suffix}</span>
        </div>
      )}
    </div>
  )
}

// ─── Label components ─────────────────────────────────────────────────────────
function LabelRow({ label, value, isLast=false }) {
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', paddingTop:3, paddingBottom:3 }}>
        <div style={{ width:80, minWidth:80, fontSize:5, fontWeight:600, color:'#757575', lineHeight:1.5, fontFamily:F, paddingRight:6, flexShrink:0 }}>
          {label}
        </div>
        <div style={{ flex:1, fontSize:5, fontWeight:400, color:'#757575', lineHeight:1.5, fontFamily:F }}>
          {value}
        </div>
      </div>
      {!isLast && <div style={{ height:0.5, background:'#EEEEEE' }} />}
    </div>
  )
}

function LogoBar() {
  return (
    <div style={{ height:14, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, paddingTop:2 }}>
      {/* NATIVE logo — 8h × 64w px */}
      <img
        src="/logos/native-logo.svg"
        alt="NATIVE"
        style={{ width:64, height:8, objectFit:'contain', objectPosition:'left center', display:'block' }}
      />
      {/* Urban Company logo — 14h × 49w px */}
      <img
        src="/logos/uc-logo.svg"
        alt="Urban Company"
        style={{ width:49, height:14, objectFit:'contain', objectPosition:'right center', display:'block' }}
      />
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
    <div style={{ width:320, height:320, background:'#FFFFFF', padding:'20px 20px 16px 20px', display:'flex', flexDirection:'column', boxSizing:'border-box', fontFamily:F }}>
      <div style={{ fontSize:14, fontWeight:500, color:'#757575', lineHeight:1.3, marginBottom:4, fontFamily:F, flexShrink:0 }}>
        {data.productName || <span style={{ color:'#D1D5DB' }}>Product Name</span>}
      </div>
      <div style={{ flex:1, overflow:'hidden', minHeight:0 }}>
        {rows.map(({ label, value }, i) => (
          <LabelRow key={label} label={label} value={value} isLast={i === rows.length - 1} />
        ))}
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
        {rows.map(({ label, value }, i) => (
          <LabelRow key={label} label={label} value={value} isLast={false} />
        ))}
        <div>
          <div style={{ paddingTop:3, paddingBottom:3 }}>
            <span style={{ fontSize:5, fontWeight:600, color:'#757575', fontFamily:F }}>NOT FOR RETAIL SALE</span>
          </div>
        </div>
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
        onChange={(e) => onChange({ ...data, productName: toTitleCase(e.target.value) })}
        placeholder="e.g. Flow Restrictor 300" />
      <Field label="SKU Code" name="skuCode" value={data.skuCode}
        onChange={(e) => onChange({ ...data, skuCode: e.target.value.toUpperCase() })}
        placeholder="e.g. NATIVE/FR/300" />
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

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Packaging Dimensions <span className="font-normal normal-case text-gray-400">(in mm)</span>
        </label>
        <div className="flex items-center rounded-lg border border-gray-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
          <input type="text" inputMode="numeric" value={data.boxDimension}
            onChange={(e) => onChange({ ...data, boxDimension: digitsOnly(e.target.value) })}
            placeholder="e.g. 120"
            className="flex-1 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 focus:outline-none bg-transparent min-w-0" />
          <span className="pr-3 text-sm text-gray-300 select-none">mm</span>
        </div>
      </div>

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
        onChange={(e) => onChange({ ...data, productName: toTitleCase(e.target.value) })}
        placeholder="e.g. Flow Restrictor 300" />
      <Field label="SKU Code" name="skuCode" value={data.skuCode}
        onChange={(e) => onChange({ ...data, skuCode: e.target.value.toUpperCase() })}
        placeholder="e.g. NATIVE/FR/300" />
      <Field label="Commodity" name="commodity" value={data.commodity}
        onChange={(e) => onChange({ ...data, commodity: toTitleCase(e.target.value) })} />
      <Field label="Quantity in Outer Box" name="qtyInOuterBox" value={data.qtyInOuterBox} onChange={h} placeholder="e.g. 12" />
      <Field label="Inner Packaging Dimensions" name="innerPackagingDimensions" value={data.innerPackagingDimensions} onChange={h} placeholder="e.g. 200×150mm" />
      <Field label="Outer Box Dimensions" name="outerBoxDimensions" value={data.outerBoxDimensions} onChange={h} placeholder="e.g. 400×300×250mm" />
      <SuffixNumberField label="Net Weight" value={data.netWeight} onChange={(v) => onChange({ ...data, netWeight: v })} suffix="g" placeholder="e.g. 3000" />
      <SuffixNumberField label="Gross Weight" value={data.grossWeight} onChange={(v) => onChange({ ...data, grossWeight: v })} suffix="g" placeholder="e.g. 3500" />
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
  const [labelType,   setLabelType]   = useState('inner')
  const [innerData,   setInnerData]   = useState(makeInnerState)
  const [outerData,   setOuterData]   = useState(makeOuterState)
  const [exporting,   setExporting]   = useState(false)
  const [exportError, setExportError] = useState(null)
  const labelRef = useRef(null)
  const isInner  = labelType === 'inner'
  const activeData = isInner ? innerData : outerData

  const handleExport = useCallback(async () => {
    setExporting(true)
    setExportError(null)
    try {
      await runExport(labelRef, activeData.productName, labelType)
    } catch (err) {
      console.error('Export failed:', err)
      setExportError('Export failed — ' + (err?.message || 'unknown error. Please try again.'))
    } finally {
      setExporting(false)
    }
  }, [activeData.productName, labelType])

  return (
    <div className="flex h-screen overflow-hidden bg-[#F5F5F0]" style={{ fontFamily: F }}>

      {/* ── Left panel ── */}
      <aside className="w-[380px] flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h1 className="text-lg font-semibold text-gray-900 tracking-tight">Label Maker</h1>
          <p className="text-xs text-gray-400 mt-0.5">Native × Urban Company</p>
          <div className="mt-4 flex rounded-xl overflow-hidden border border-gray-200 bg-gray-50 p-1 gap-1">
            {['inner', 'outer'].map((type) => (
              <button key={type} onClick={() => { setLabelType(type); setExportError(null) }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
                  labelType === type ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'
                }`}>
                {type === 'inner' ? 'Inner LM' : 'Outer LM'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isInner
            ? <InnerForm data={innerData} onChange={setInnerData} />
            : <OuterForm data={outerData} onChange={setOuterData} />
          }
        </div>

        {/* Footer — reset + export */}
        <div className="px-6 py-4 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => { isInner ? setInnerData(makeInnerState()) : setOuterData(makeOuterState()); setExportError(null) }}
              className="flex-1 py-2.5 text-xs font-semibold text-gray-500 rounded-xl border border-gray-200 hover:border-gray-300 hover:text-gray-700 transition"
            >
              Reset
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className={`flex-1 py-2.5 text-xs font-semibold text-white rounded-xl transition flex items-center justify-center gap-1.5 ${
                exporting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600'
              }`}
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                'Export SVG + PDF'
              )}
            </button>
          </div>

          {/* Filename preview */}
          {!exportError && (
            <p className="text-xs text-gray-400 text-center truncate">
              {activeData.productName || 'Untitled'} ({isInner ? 'Inner LM' : 'Outer LM'})
            </p>
          )}

          {/* Error message */}
          {exportError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 leading-relaxed">
              {exportError}
            </div>
          )}
        </div>
      </aside>

      {/* ── Right panel ── */}
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

          <div
            ref={labelRef}
            style={{
              width:320, height:320,
              boxShadow:'0 0 0 1.5px #CBD5E1, 0 4px 24px 0 rgba(0,0,0,0.08)',
              borderRadius:2, overflow:'hidden', background:'#FFFFFF',
              outline:'2px dashed #CBD5E1', outlineOffset:4,
            }}
          >
            {isInner ? <InnerLabel data={innerData} /> : <OuterLabel data={outerData} />}
          </div>

          <p className="text-xs text-gray-400 mt-1">Dashed border represents physical sticker edge</p>
        </div>
      </main>
    </div>
  )
}
