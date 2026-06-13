import React from 'react';
import type { RentalCategory, MembershipTier, Amenity } from './types';
// FIX: Consolidate and correct icon imports
import {
  UsersIcon,
  CogIcon,
  ZapIcon,
  AnchorIcon,
  HomeIcon,
  PaperAirplaneIcon,
  BedIcon,
  BathIcon,
  WifiIcon,
  CarIcon,
  WavesIcon,
  TreePineIcon,
  Building2Icon,
  ShieldIcon,
  CrownIcon,
  StarIcon,
  PlusIcon,
  CreditCardIcon,
  CalendarIcon,
  ClockIcon,
  DevicePhoneMobileIcon,
  CubeTransparentIcon,
  HelicopterIcon,
  SparklesIcon,
} from './components/icons/Icons';

const newCarsRawData = [
  // REMOVED: RS3 Verde - Hidden per request
  // {
  //   "id": 2,
  //   "name": "Audi RS3 Verde",
  //   "dailyPrice": 40,
  //   "specs": {
  //     "acceleration": "0–100 in 3.8s",
  //     "maxSpeed": "Max speed: 250km/h",
  //     "power": "400Cv",
  //     "torque": "500Nm",
  //     "engine": "2.5L inline 5-cylinder"
  //   },
  //   "image": "/audi-rs3.jpeg",
  //   "color": "Verde"
  // },
  {
    "id": 3,
    "name": "Audi RS3 Rossa",
    "dailyPrice": 70,
    "specs": {
      "acceleration": "0–100 in 3.8s",
      "power": "400Cv",
      "torque": "500Nm",
      "engine": "2.5L inline 5-cylinder"
    },
    "image": "/rs3.jpeg",
    "color": "Rossa"
  },
  {
    "id": 4,
    "name": "Mercedes A45 S AMG",
    "dailyPrice": 70,
    "specs": {
      "acceleration": "0–100 in 3.9s",
      "power": "421Cv",
      "torque": "500Nm",
      "engine": "2.0L 4-cylinder Turbo"
    },
    "image": "/mercedes_amg.jpeg"
  },
  {
    "id": 5,
    "name": "BMW M3 Competition",
    "dailyPrice": 120,
    "specs": {
      "acceleration": "0–100 in 3.9s",
      "maxSpeed": "Max speed: 250km/h",
      "power": "510Cv",
      "torque": "650Nm",
      "engine": "3.0L inline 6-cylinder"
    },
    "image": "/bmw-m3.jpeg"
  },
  {
    "id": 6,
    "name": "BMW M4 Competition",
    "dailyPrice": 80,
    "specs": {
      "acceleration": "0–100 in 3.8s",
      "power": "510Cv",
      "torque": "650Nm",
      "engine": "3.0L inline 6-cylinder"
    },
    "image": "/bmw-m4.jpeg"
  },
  {
    "id": 7,
    "name": "Porsche 992 Carrera 4S",
    "dailyPrice": 250,
    "specs": {
      "acceleration": "0–100 in 3.6s",
      "maxSpeed": "Max speed: 306km/h",
      "power": "450Cv",
      "torque": "530Nm",
      "engine": "3.0L Twin-Turbo Flat-6"
    },
    "image": "/porsche-911.jpeg"
  },
  {
    "id": 8,
    "name": "Mercedes C63 S AMG",
    "dailyPrice": 200,
    "specs": {
      "acceleration": "0–100 in 3.9s",
      "power": "510Cv",
      "torque": "700Nm",
      "engine": "4.0L V8 BiTurbo"
    },
    "image": "/c63.jpeg"
  },
  // REMOVED: Porsche Macan GTS - Hidden per request
  // {
  //   "id": 9,
  //   "name": "Porsche Macan GTS",
  //   "dailyPrice": 80,
  //   "specs": {
  //     "acceleration": "0–100 in 4.5s",
  //     "power": "440Cv",
  //     "torque": "550Nm",
  //     "engine": "2.9L Twin-Turbo V6"
  //   },
  //   "image": "/macan.jpeg"
  // },
  {
    "id": 10,
    "name": "Mercedes GLE 63 AMG",
    "dailyPrice": 80,
    "specs": {
      "acceleration": "0–100 in 3.8s",
      "power": "612Cv",
      "torque": "850Nm",
      "engine": "4.0L V8 BiTurbo"
    },
    "image": "/mercedes-gle.jpeg"
  }
];

const specMappings: Record<string, { label: { en: string; it: string }; icon: React.FC<{ className?: string }>; transform?: (val: string) => string }> = {
  acceleration: { label: { en: '0-100km/h', it: '0-100km/h' }, icon: ZapIcon, transform: (val: string) => val.split(' in ')[1] || val },
  power: { label: { en: 'Power', it: 'Potenza' }, icon: ZapIcon },
  torque: { label: { en: 'Torque', it: 'Coppia' }, icon: CogIcon },
  engine: { label: { en: 'Engine', it: 'Motore' }, icon: CogIcon },
  maxSpeed: { label: { en: 'Max Speed', it: 'Velocità Max' }, icon: ZapIcon, transform: (val: string) => val.split(': ')[1] || val },
  special: { label: { en: 'Special', it: 'Speciale' }, icon: StarIcon },
  extras: { label: { en: 'Extras', it: 'Extra' }, icon: PlusIcon },
  color: { label: { en: 'Color', it: 'Colore' }, icon: CarIcon }
};

const EUR_TO_USD_RATE = 1.1;

const urbanCarsRawData = [
  {
    "id": 201,
    "name": "Fiat Panda Benzina (Arancione)",
    "dailyPrice": 19.90,
    "specs": {
      "power": "70Cv",
      "engine": "1.2L Benzina",
      "seats": "5 posti"
    },
    "image": "/panda1.jpeg",
    "color": "Arancione"
  },
  {
    "id": 202,
    "name": "Fiat Panda Benzina (Bianca)",
    "dailyPrice": 19.90,
    "specs": {
      "power": "70Cv",
      "engine": "1.2L Benzina",
      "seats": "5 posti"
    },
    "image": "/panda2.jpeg",
    "color": "Bianca"
  },
  {
    "id": 203,
    "name": "Fiat Panda Diesel (Grigia)",
    "dailyPrice": 24.90,
    "specs": {
      "power": "95Cv",
      "engine": "1.3L MultiJet Diesel",
      "seats": "5 posti"
    },
    "image": "/panda3.jpeg",
    "color": "Grigia"
  },
  {
    "id": 204,
    "name": "Renault Captur",
    "dailyPrice": 44.90,
    "specs": {
      "power": "130Cv",
      "engine": "1.3L TCe",
      "seats": "5 posti"
    },
    "image": "/captur.jpeg"
  }
];

const corporateFleetRawData = [
  {
    "id": 205,
    "name": "Mercedes Vito VIP DR7",
    "dailyPrice": 199,
    "specs": {
      "power": "163Cv",
      "engine": "2.0L Diesel",
      "seats": "7 posti"
    },
    "image": "/vito.jpeg"
  },
  {
    "id": 206,
    "name": "Furgone DR7 (Fiat Ducato Maxi)",
    "dailyPrice": 59,
    "specs": {
      "power": "140Cv",
      "engine": "2.3L MultiJet",
      "seats": "9 posti"
    },
    "image": "/ducato.jpeg"
  }
];

const mappedCars = newCarsRawData.map(car => {
  const specs: any[] = [];
  if (car.specs) {
    for (const [key, value] of Object.entries(car.specs)) {
      const mapping = specMappings[key as keyof typeof specMappings];
      if (mapping) {
        specs.push({
          label: mapping.label,
          value: 'transform' in mapping && mapping.transform ? mapping.transform(value as string) : value,
          icon: mapping.icon
        });
      }
    }
  }
  if ('color' in car && car.color) {
    specs.push({
      label: specMappings.color.label,
      value: car.color,
      icon: specMappings.color.icon
    });
  }

  const isAvailable = (car as any).available !== false;
  return {
    id: `car-${car.id}`,
    name: car.name,
    image: car.image,
    available: isAvailable,
    pricePerDay: isAvailable && car.dailyPrice ? {
      usd: Math.round(car.dailyPrice * EUR_TO_USD_RATE),
      eur: car.dailyPrice,
      crypto: 0
    } : undefined,
    specs: specs
  };
});

const mappedUrbanCars = urbanCarsRawData.map(car => {
  const specs: any[] = [];
  if (car.specs) {
    for (const [key, value] of Object.entries(car.specs)) {
      const mapping = specMappings[key as keyof typeof specMappings];
      if (mapping) {
        specs.push({
          label: mapping.label,
          value: 'transform' in mapping && mapping.transform ? mapping.transform(value as string) : value,
          icon: mapping.icon
        });
      }
    }
  }

  const isAvailable = (car as any).available !== false;

  return {
    id: `urban-car-${car.id}`,
    name: car.name,
    image: car.image,
    available: isAvailable,
    pricePerDay: isAvailable && car.dailyPrice ? {
      usd: Math.round(car.dailyPrice * EUR_TO_USD_RATE),
      eur: car.dailyPrice,
      crypto: 0
    } : undefined,
    specs: specs
  };
});

const mappedCorporateFleet = corporateFleetRawData.map(car => {
  const specs: any[] = [];
  if (car.specs) {
    for (const [key, value] of Object.entries(car.specs)) {
      const mapping = specMappings[key as keyof typeof specMappings];
      if (mapping) {
        specs.push({
          label: mapping.label,
          value: 'transform' in mapping && mapping.transform ? mapping.transform(value as string) : value,
          icon: mapping.icon
        });
      }
    }
  }

  const isAvailable = (car as any).available !== false;

  return {
    id: `corporate-fleet-${car.id}`,
    name: car.name,
    image: car.image,
    available: isAvailable,
    pricePerDay: isAvailable && car.dailyPrice ? {
      usd: Math.round(car.dailyPrice * EUR_TO_USD_RATE),
      eur: car.dailyPrice,
      crypto: 0
    } : undefined,
    specs: specs
  };
});


const yachtSpecs = [
  { label: { en: 'Guests', it: 'Ospiti' }, value: '12', icon: UsersIcon },
  { label: { en: 'Length', it: 'Lunghezza' }, value: '70m', icon: AnchorIcon },
  { label: { en: 'Cabins', it: 'Cabine' }, value: '6', icon: BedIcon },
];

const helicopterSpecs = [
  { label: { en: 'Passengers', it: 'Passeggeri' }, value: '5', icon: UsersIcon },
  { label: { en: 'Range', it: 'Autonomia' }, value: '300 nm', icon: PaperAirplaneIcon },
  { label: { en: 'Speed', it: 'Velocità' }, value: '150 kt', icon: ZapIcon },
];

export const RENTAL_CATEGORIES: RentalCategory[] = [
  {
    id: 'cars',
    label: { en: 'DR7 Supercar & Luxury Division', it: 'DR7 Supercar & Luxury Division' },
    data: mappedCars,
    icon: CarIcon,
  },
  {
    id: 'urban-cars',
    label: { en: 'DR7 Urban Mobility Division', it: 'DR7 Urban Mobility Division' },
    data: mappedUrbanCars,
    icon: CarIcon,
  },
  {
    id: 'corporate-fleet',
    label: { en: 'DR7 Corporate & Utility Fleet Division', it: 'DR7 Corporate & Utility Fleet Division' },
    data: mappedCorporateFleet,
    icon: CarIcon,
  },
  {
    id: 'yachts',
    label: { en: 'DR7 Yachting Division', it: 'DR7 Yachting Division' },
    data: [
      { id: 'yacht-1', name: 'Luxury Yacht', image: '/yacht1.jpeg', images: ['/yacht1.jpeg'], pricePerDay: { usd: 12000, eur: 11000, crypto: 0 }, specs: yachtSpecs },
    ],
    icon: AnchorIcon,
  },
  {
    id: 'jets',
    label: { en: 'DR7 Aviation Division', it: 'DR7 Aviation Division' },
    data: [
      {
        id: 'jet-1',
        name: 'Cessna Citation Mustang',
        image: '/jet1.jpeg',
        images: ['/jet1.jpeg', '/jet2.jpeg'],
        specs: [
          { label: { en: 'Passengers', it: 'Passeggeri' }, value: '4', icon: UsersIcon },
          { label: { en: 'Year', it: 'Anno' }, value: '2008', icon: CalendarIcon },
          { label: { en: 'Type', it: 'Tipo' }, value: 'Entry Level Jet', icon: PaperAirplaneIcon },
        ],
        petsAllowed: false,
        smokingAllowed: false
      },
      {
        id: 'jet-2',
        name: 'Cessna Citation CJ2',
        image: '/jet3.jpeg',
        images: ['/jet3.jpeg', '/jet4.jpeg'],
        specs: [
          { label: { en: 'Passengers', it: 'Passeggeri' }, value: '6', icon: UsersIcon },
          { label: { en: 'Year', it: 'Anno' }, value: '2004', icon: CalendarIcon },
          { label: { en: 'Type', it: 'Tipo' }, value: 'Light Jet', icon: PaperAirplaneIcon },
        ],
        petsAllowed: false,
        smokingAllowed: false
      },
      { id: 'heli-1', name: 'Airbus H125', image: '/heli1.jpeg', specs: helicopterSpecs },
      { id: 'heli-2', name: 'Bell 505 Jet Ranger X', image: '/heli2.jpeg', specs: helicopterSpecs },
    ],
    icon: PaperAirplaneIcon,
  },
  {
    id: 'car-wash-services',
    label: { en: 'Lavaggio Meccanica', it: 'Lavaggio Meccanica' },
    data: [],
    icon: SparklesIcon,
  },
  {
    id: 'membership',
    label: { en: 'DR7 Exclusive Members Club', it: 'DR7 Exclusive Members Club' },
    data: [],
    icon: CrownIcon,
  },
  {
    id: 'credit-wallet',
    label: { en: 'DR7 Credit Wallet', it: 'DR7 Credit Wallet' },
    data: [],
    icon: CreditCardIcon,
  },
];

// DR7 Club — single membership plan
export const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    id: 'dr7club',
    name: { en: 'DR7 Club', it: 'DR7 Club' },
    price: {
      monthly: { usd: 5.39, eur: 4.90, crypto: 0 },
      annually: { usd: 42.90, eur: 39, crypto: 0 },
    },
    features: {
      en: [
        'Wallet reward system activated on every booking',
        '2% cashback on full prepayment bookings (up to 4%)',
        '1% cashback on deposit bookings (30% advance)',
        '2% cashback on extra services',
        '3% cashback on Prime Wash services',
        'Priority booking access',
        'Access to "DR7 Members" WhatsApp group for flash offers',
        'Invitations to exclusive DR7 events and partner evenings',
      ],
      it: [
        'Sistema wallet reward attivo su ogni prenotazione',
        '2% di cashback su prenotazioni con pagamento anticipato (fino al 4%)',
        '1% di cashback su prenotazioni con acconto (30%)',
        '2% di cashback su servizi extra',
        '3% di cashback su servizi Prime Wash',
        'Accesso prioritario alle prenotazioni',
        'Inviti a eventi esclusivi DR7 e serate partner',
      ],
    },
    isPopular: true,
  },
];


export const PICKUP_LOCATIONS = [
  { id: 'dr7_cagliari', label: { en: 'DR7 Cagliari — Viale Marconi 229, 09131', it: 'DR7 Cagliari — Viale Marconi 229, 09131' } },
  { id: 'home_delivery', label: { en: 'Home Delivery', it: 'Consegna a domicilio' } },
];

export const RETURN_LOCATIONS = [
  { id: 'dr7_cagliari', label: { en: 'DR7 Cagliari — Viale Marconi 229, 09131', it: 'DR7 Cagliari — Viale Marconi 229, 09131' } },
  { id: 'home_delivery', label: { en: 'Home Pickup', it: 'Ritiro/riconsegna a domicilio' } },
];

export const LICENSE_OBTENTION_YEAR_OPTIONS = Array.from({ length: 70 }, (_, i) => new Date().getFullYear() - i);

export const YACHT_PICKUP_MARINAS = [
  { id: 'marina_di_cagliari', label: { en: 'Marina di Cagliari', it: 'Marina di Cagliari' } },
  { id: 'porto_cervo', label: { en: 'Marina di Porto Cervo', it: 'Marina di Porto Cervo' } },
];

export const AIRPORTS = [
  { iata: 'CAG', name: 'Cagliari Elmas Airport', city: 'Cagliari' },
  { iata: 'OLB', name: 'Olbia Costa Smeralda Airport', city: 'Olbia' },
  { iata: 'AHO', name: 'Alghero-Fertilia Airport', city: 'Alghero' },
  { iata: 'FCO', name: 'Leonardo da Vinci-Fiumicino Airport', city: 'Rome' },
  { iata: 'LIN', name: 'Linate Airport', city: 'Milan' },
  { iata: 'NCE', name: 'Nice Côte d\'Azur Airport', city: 'Nice' },
  { iata: 'LBG', name: 'Paris-Le Bourget Airport', city: 'Paris' },
  { iata: 'LTN', name: 'London Luton Airport', city: 'London' },
  { iata: 'IBZ', name: 'Ibiza Airport', city: 'Ibiza' },
];

export const HELI_DEPARTURE_POINTS = [
  { id: 'cagliari', name: 'Cagliari Heliport' },
  { id: 'porto_cervo', name: 'Porto Cervo Heliport' },
  { id: 'forte_village', name: 'Forte Village Resort' },
];

export const HELI_ARRIVAL_POINTS = [
  ...HELI_DEPARTURE_POINTS,
  { id: 'cala_di_volpe', name: 'Hotel Cala di Volpe' },
  { id: 'villasimius', name: 'Villasimius Private Pad' },
];


