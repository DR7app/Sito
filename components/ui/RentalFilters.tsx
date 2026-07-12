/**
 * RentalFilters — Sort and filter controls for vehicle results
 */

interface Props {
  sortBy: string
  onSortChange: (sort: string) => void
  maxBudget: number | null
  onBudgetChange: (budget: number | null) => void
  categories: string[] // available categories in results
  selectedCategories: string[]
  onCategoryChange: (cats: string[]) => void
  totalResults: number
  // Mappa id-categoria → label di display, popolata dalla Centralina
  // Pro a runtime. Fallback alle 4 etichette legacy se non fornita.
  categoryLabels?: Record<string, string>
}

// Fallback per i 4 vehicleType storici. Il caller (RentalPage) deve
// passare categoryLabels caricate dalla Centralina Pro per le categorie
// custom (es. 'hypercar' → 'Hypercar', 'supercar_elite' → 'Supercar Elite').
const LEGACY_LABELS: Record<string, string> = {
  SUPERCAR: 'Supercar & Luxury',
  UTILITARIA: 'Utilitarie',
  V_CLASS: 'Van & Minivan',
  FURGONE: 'Furgoni',
  exotic: 'Supercar & Luxury',
  supercars: 'Supercar & Luxury',
  urban: 'Urban',
  aziendali: 'Aziendali',
}

function humanize(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function RentalFilters({
  sortBy, onSortChange,
  maxBudget, onBudgetChange,
  categories, selectedCategories, onCategoryChange,
  totalResults,
  categoryLabels = {},
}: Props) {
  const labelFor = (id: string) =>
    categoryLabels[id] || LEGACY_LABELS[id] || humanize(id)
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 bg-gray-900/40 border border-gray-800 rounded-xl px-4 py-3">
      {/* Results count */}
      <span className="text-sm text-gray-400 mr-2">
        {totalResults} {totalResults === 1 ? 'veicolo disponibile' : 'veicoli disponibili'}
      </span>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={e => onSortChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:ring-1 focus:ring-white"
      >
        <option value="default">Ordine predefinito</option>
        <option value="price-asc">Prezzo piu basso</option>
        <option value="price-desc">Prezzo piu alto</option>
      </select>

      {/* Category filter (only show if multiple categories) */}
      {/* 2026-07-12: flex-wrap + max-w-full così i chip categoria vanno a capo
          invece di uscire fuori schermo su mobile (prima era 'flex gap-2' senza
          wrap → Hypercar/Urban tagliati sul bordo destro). */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 max-w-full">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => {
                if (selectedCategories.includes(cat)) {
                  onCategoryChange(selectedCategories.filter(c => c !== cat))
                } else {
                  onCategoryChange([...selectedCategories, cat])
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCategories.length === 0 || selectedCategories.includes(cat)
                  ? 'bg-white text-black'
                  : 'bg-gray-800 text-gray-400 border border-gray-700'
              }`}
            >
              {labelFor(cat)}
            </button>
          ))}
        </div>
      )}

      {/* Budget max */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Budget max:</span>
        <input
          type="number"
          value={maxBudget ?? ''}
          onChange={e => onBudgetChange(e.target.value ? Number(e.target.value) : null)}
          placeholder="EUR"
          className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:ring-1 focus:ring-white placeholder-gray-500"
        />
      </div>
    </div>
  )
}
