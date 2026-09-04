# Asset originali sostituiti

Copie intatte delle immagini rimpiazzate durante il restyling, tenute qui e non
in `public/` per non finire nel sito costruito.

Motivo della sostituzione (audit 04/09/2026, § 3.3 di AUDIT.md): entrambe
mostravano un veicolo che **non è nella flotta DR7** presentandolo come tale.

| File | Cosa mostrava | Sostituito con |
|---|---|---|
| `menu-mobilita.jpeg` | Bugatti Chiron di notte | ritaglio astratto: asfalto bagnato e riflessi, nessun veicolo riconoscibile |
| `car.jpeg` | supercar inesistente con stemma DR7 sulla calandra | tavola verticale astratta: ciottoli bagnati e luci calde |

Per ripristinare: `cp _asset-originali/<file> public/`.
