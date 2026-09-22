import { useMemo } from 'react'
import { useCodiceFiscaleCalculator, type CFFieldConfig } from '../../hooks/useCodiceFiscaleCalculator'
import { useTranslation } from '../../hooks/useTranslation'

interface CalcolaCFButtonProps {
  config: CFFieldConfig
  className?: string
}

export default function CalcolaCFButton({ config, className }: CalcolaCFButtonProps) {
  const { calcola, mode } = useCodiceFiscaleCalculator(config)
  const { t } = useTranslation()

  const title = useMemo(() => {
    switch (mode) {
      case 'forward': return t({ it: 'Calcola il Codice Fiscale dai dati anagrafici', en: 'Calculate the Tax Code from personal details' })
      case 'reverse': return t({ it: 'Estrai dati anagrafici dal Codice Fiscale', en: 'Extract personal details from the Tax Code' })
      case 'verify': return t({ it: 'Verifica coerenza tra dati e Codice Fiscale', en: 'Check consistency between details and Tax Code' })
      default: return t({ it: 'Compila i dati anagrafici o il Codice Fiscale', en: 'Fill in personal details or the Tax Code' })
    }
  }, [mode, t])

  return (
    <button
      type="button"
      onClick={calcola}
      title={title}
      className={className || 'px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap transition-colors'}
    >
      {t({ it: 'Calcola', en: 'Calculate' })}
    </button>
  )
}
