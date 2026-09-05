/**
 * RentalSearchBar — Booking search box for rental pages
 * Shows pickup/return location, date, time with auto return time (-1h30)
 */
import { useState, useMemo, useCallback, useEffect } from 'react'
import { PICKUP_LOCATIONS as DEFAULT_PICKUP_LOCATIONS } from '../../constants'
import { getPickupLocations } from '../../utils/getLocations'
import { useTranslation } from '../../hooks/useTranslation'

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

// Business hours time slots (15-min intervals)
function getPickupTimes(dateStr: string): string[] {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  if (day === 0) return [] // Sunday closed
  const times: string[] = []
  const add = (start: number, end: number) => {
    for (let i = start; i <= end; i += 15) {
      times.push(`${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`)
    }
  }
  if (day >= 1 && day <= 5) { add(10 * 60 + 30, 12 * 60 + 30); add(16 * 60 + 30, 18 * 60 + 30) }
  else if (day === 6) { add(10 * 60 + 30, 12 * 60 + 30); add(15 * 60 + 30, 17 * 60 + 30) }
  return times
}

function getReturnTimes(dateStr: string): string[] {
  const day = new Date(dateStr + 'T12:00:00').getDay()
  if (day === 0) return []
  const times: string[] = []
  const add = (start: number, end: number) => {
    for (let i = start; i <= end; i += 15) {
      times.push(`${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`)
    }
  }
  if (day >= 1 && day <= 5) { add(9 * 60, 11 * 60); add(15 * 60, 17 * 60) }
  else if (day === 6) { add(9 * 60, 11 * 60); add(14 * 60, 16 * 60) }
  return times
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
  const { t, getTranslated } = useTranslation()
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

  const pickupTimes = useMemo(() => getPickupTimes(pickupDate), [pickupDate])
  const returnTimes = useMemo(() => getReturnTimes(returnDate), [returnDate])

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

  const HOLIDAYS = [
    '01-01', '06-01', '25-04', '01-05', '02-06', '15-08', '01-11', '08-12', '25-12', '26-12',
    '2024-03-31', '2024-04-01', '2025-04-20', '2025-04-21', '2026-04-05', '2026-04-06',
    '2027-03-28', '2027-03-29',
  ]
  const isSunday = (d: string) => new Date(d + 'T12:00:00').getDay() === 0
  const isHoliday = (d: string) => {
    if (!d) return false
    const [, m, dd] = d.split('-')
    return HOLIDAYS.includes(`${dd}-${m}`) || HOLIDAYS.includes(d)
  }
  const isBlocked = (d: string) => isSunday(d) || isHoliday(d)

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

  const isValid = pickupDate && pickupTime && returnDate && returnTime && !isBlocked(pickupDate) && !isBlocked(returnDate)

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

        {/* Pickup Date */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Data ritiro', en: 'Pick-up date' })}</label>
          <input
            type="date"
            value={pickupDate}
            min={fmt(today)}
            onChange={e => {
              if (isBlocked(e.target.value)) return
              setPickupDate(e.target.value)
              if (e.target.value > returnDate) setReturnDate(e.target.value)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white"
          />
          {isBlocked(pickupDate) && <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiusi (domenica o festivo)', en: 'Closed (Sunday or public holiday)' })}</p>}
        </div>

        {/* Pickup Time */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Ora ritiro', en: 'Pick-up time' })}</label>
          <select
            value={pickupTime}
            onChange={e => handlePickupTimeChange(e.target.value)}
            disabled={pickupTimes.length === 0}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white disabled:opacity-50"
          >
            {pickupTimes.length > 0
              ? pickupTimes.map(t => <option key={t} value={t}>{t}</option>)
              : <option>{t({ it: 'Non disponibile', en: 'Not available' })}</option>
            }
          </select>
        </div>

        {/* Return Date */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Data restituzione', en: 'Drop-off date' })}</label>
          <input
            type="date"
            value={returnDate}
            min={pickupDate}
            onChange={e => {
              if (isBlocked(e.target.value)) return
              setReturnDate(e.target.value)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white"
          />
          {isBlocked(returnDate) && <p className="text-xs text-red-400 mt-1">{t({ it: 'Chiusi (domenica o festivo)', en: 'Closed (Sunday or public holiday)' })}</p>}
        </div>

        {/* Return Time */}
        <div>
          <label className="text-xs text-gray-400 font-medium mb-1 block">{t({ it: 'Ora restituzione', en: 'Drop-off time' })}</label>
          <select
            value={returnTime}
            onChange={e => handleReturnTimeChange(e.target.value)}
            disabled={returnTimes.length === 0}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:ring-1 focus:ring-white focus:border-white disabled:opacity-50"
          >
            {returnTimes.length > 0
              ? returnTimes.map(t => <option key={t} value={t}>{t}</option>)
              : <option>{t({ it: 'Non disponibile', en: 'Not available' })}</option>
            }
          </select>
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
    </form>
  )
}
