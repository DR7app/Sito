import { useContext } from 'react';
import { CarrelloContext } from '../contexts/CarrelloContext';

export const useCarrello = () => {
  const context = useContext(CarrelloContext);
  if (context === undefined) {
    throw new Error('useCarrello va usato dentro CarrelloProvider');
  }
  return context;
};
