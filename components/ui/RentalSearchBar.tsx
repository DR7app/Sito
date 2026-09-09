/**
 * RentalSearchBar — Booking search box for rental pages
 * Shows pickup/return location, date, time with auto return time (-1h30)
 */
import { useState, useCallback, useEffect } from 'react'
import { PICKUP_LOCATIONS as DEFAULT_PICKUP_LOCATIONS } from '../../constants'
import { getPickupLocations } from '../../utils/getLocations'
import { useTranslation } from '../../hooks/useTranslation'
import CalendarioGiornoOrario from './CalendarioGiornoOrario'
import {
  getPickupTimesForDateString,
  getReturnTimesForDateString,
} from '../../utils/noleggioHours'

export interface SearchParams {
  pickupLocation: string
  returnLocation: string
  pickupDate: string
  pickupTime: string
  returnDate: string
  returnTime: string
}

interface Props {
  onSearch: (params: SearchParams) => void
  isSearching: boolean
}

// Gli orari sono quelli di Centralina Pro > Orari Noleggio: qui erano
// scritti a mano e restavano fermi anche quando l'ufficio cambiava turni.
// Domeniche e festivi tornano [] da soli (giorno chiuso).
function getPickupTimes(dateStr: string): string[] {
  return getPickupTimesForDateString(dateStr)
}

function getReturnTimes(dateStr: string): string[] {
  return getReturnTimesForDateString(dateStr)
}

// Subtract 90 minutes from a time string, return nearest valid return time
function autoReturnTime(pickupTime: string, returnDate: string): string {
  const [h, m] = pickupTime.split(':').map(Number)
  let totalMin = h * 60 + m - 90
  if (totalMin < 0) totalMin = 0

  const validTimes = getReturnTimes(returnDate)
  if (validTimes.length === 0) return '09:00'

  // Find closest valid time <= target
  const target = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`
  let best = validTimes[0]
  for (const t of validTimes) {
    if (t <= target) best = t
  }
  return best
}

export default function RentalSearchBar({ onSearch, isSearching }: Props) {
  const { t, getTranslated, lang } = useTranslation()
  const [pickupLocs, setPickupLocs] = useState(DEFAULT_PICKUP_LOCATIONS)
  useEffect(() => { let c = false; getPickupLocations().then(l => { if (!c) setPickupLocs(l) }); return () => { c = true } }, [])
  const today = new Date()
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  // Skip to next non-Sunday
  const skipSunday = (d: Date) => {
    const result = new Date(d)
    if (result.getDay() === 0) result.setDate(result.getDate() + 1)
    return result
  }

  const defaultPickupDate = fmt(skipSunday(tomorrow))
  const defaultReturnDate = fmt(skipSunday(dayAfter))

  const [pickupLocation, setPickupLocation] = useState('dr7_office')
  const [returnLocation, setReturnLocation] = useState('dr7_office')
  const [sameLocation, setSameLocation] = useState(true)
  const [pickupDate, setPickupDate] = useState(defaultPickupDate)
  const [pickupTime, setPickupTime] = useState('10:30')
  const [returnDate, setReturnDate] = useState(defaultReturnDate)
  const [returnTime, setReturnTime] = useState('09:00')
  const [returnTimeManual, setReturnTimeManual] = useState(false)

  // Auto-set return time when pickup time changes (unless manually modified)
  useEffect(() => {
    if (!returnTimeManual && pickupTime && returnDate) {
      const auto = autoReturnTime(pickupTime, returnDate)
      setReturnTime(auto)
    }
  }, [pickupTime, returnDate, returnTimeManual])

  // Reset auto mode when pickup time changes
  const handlePickupTimeChange = useCallback((value: string) => {
    setPickupTime(value)
    setReturnTimeManual(false) // re-enable auto
  }, [])

  const handleReturnTimeChange = useCallback((value: string) => {
    setReturnTime(value)
    setReturnTimeManual(true) // user took control
  }, [])

  // Un giorno e' chiuso quando Centralina non offre nessun orario: domeniche,
  // festivi e chiusure straordinarie arrivano tutte da li'.
  const isBlockedRitiro = (d: string) => !d || getPickupTimes(d).length === 0
  const isBlockedRiconsegna = (d: string) => !d || getReturnTimes(d).length === 0

  const [calendario, setCalendario] = useState<null | 'ritiro' | 'riconsegna'>(null)

  const mostraDataOra = (d: string, o: string) => {
    if (!d) return t({ it: 'Scegli giorno e ora', en: 'Pick day and time' })
    const giorno = new Date(d + 'T12:00:00').toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
    return `${giorno}${o ? ` · ${o}` : ''}`
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch({
      pickupLocation,
      returnLocation: sameLocation ? pickupLocation : returnLocation,
      pickupDate,
      pickupTime,
      returnDate,
      returnTime,
    })
  }

  const isValid = pickupDate && pickupTime && returnDate && returnTime && !isBlockedRitiro(pickupDate) && !isBlockedRiconsegna(returnDate)

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900/60 backdrop-blur-sm border border-gray-800 rounded-2xl p-5 md:p-6 mb-8">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {/* Pickup Location */}
        <div className="col-span-2 md:col-span-3 lg:col-span-2">
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Luogo di ritiro', en: 'Pick-up location' })}</label>
          <select
            value={pickupLocation}
            onChange={e => { setPickupLocation(e.target.value); if (sameLocation) setReturnLocation(e.target.value) }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white"
          >
            {pickupLocs.map(loc => (
              <option key={loc.id} value={loc.id}>{getTranslated(loc.label)}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" checked={sameLocation} onChange={e => setSameLocation(e.target.checked)} className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-white focus:ring-white" />
            <span className="text-xs text-gray-400">{t({ it: 'Stesso luogo di riconsegna', en: 'Same drop-off location' })}</span>
          </label>
          {!sameLocation && (
            <div className="mt-2">
              <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Luogo di riconsegna', en: 'Drop-off location' })}</label>
              <select
                value={returnLocation}
                onChange={e => setReturnLocation(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white"
              >
                {pickupLocs.map(loc => (
                  <option key={loc.id} value={loc.id}>{getTranslated(loc.label)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Ritiro: prima il giorno, poi l'orario (stesso calendario di Mare e Casa) */}
        <div className="col-span-2 lg:col-span-2">
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Ritiro', en: 'Pick-up' })}</label>
          <button
            type="button"
            onClick={() => setCalendario('ritiro')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-left text-white text-sm hover:border-white transition-colors"
          >
            {mostraDataOra(pickupDate, pickupTime)}
          </button>
          {isBlockedRitiro(pickupDate) && <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiusi in questa data', en: 'Closed on this date' })}</p>}
        </div>

        {/* Riconsegna */}
        <div className="col-span-2 lg:col-span-2">
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Riconsegna', en: 'Drop-off' })}</label>
          <button
            type="button"
            onClick={() => setCalendario('riconsegna')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-left text-white text-sm hover:border-white transition-colors"
          >
            {mostraDataOra(returnDate, returnTime)}
          </button>
          {isBlockedRiconsegna(returnDate) && <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiusi in questa data', en: 'Closed on this date' })}</p>}
        </div>
      </div>

      {/* Red warning + Search button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 gap-3">
        <p className="text-xs text-red-400 font-medium">{t({ it: 'La tariffa puo subire variazioni', en: 'Rates are subject to change' })}</p>
        <button
          type="submit"
          disabled={!isValid || isSearching}
          className="px-8 py-3 bg-white text-black font-bold uppercase tracking-wider text-sm hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isSearching ? t({ it: 'Ricerca...', en: 'Searching...' }) : t({ it: 'Verifica Disponibilita', en: 'Check availability' })}
        </button>
      </div>
      <CalendarioGiornoOrario
        aperto={calendario === 'ritiro'}
        onClose={() => setCalendario(null)}
        minDate={fmt(today)}
        orariDelGiorno={getPickupTimes}
        dataIniziale={pickupDate}
        oraIniziale={pickupTime}
        titolo={{ it: 'Ritiro: scegli il giorno', en: 'Pick-up: choose the day' }}
        onConferma={(data, ora) => {
          setPickupDate(data)
          if (data > returnDate) setReturnDate(data)
          handlePickupTimeChange(ora)
        }}
      />

      <CalendarioGiornoOrario
        aperto={calendario === 'riconsegna'}
        onClose={() => setCalendario(null)}
        minDate={pickupDate || fmt(today)}
        orariDelGiorno={getReturnTimes}
        dataIniziale={returnDate}
        oraIniziale={returnTime}
        titolo={{ it: 'Riconsegna: scegli il giorno', en: 'Drop-off: choose the day' }}
        onConferma={(data, ora) => {
          setReturnDate(data)
          handleReturnTimeChange(ora)
        }}
      />
    </form>
  )
}
