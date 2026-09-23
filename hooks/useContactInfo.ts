// useContactInfo — tiny hook returning the bits of ContactCopy that other
// components need at a glance (whatsapp_url, phone, email). Shares the
// siteCopy loadOnce() cache so multiple mounts don't re-fetch.
import { useEffect, useState } from 'react';
import { getContactCopy } from '../utils/siteCopy';
import { WHATSAPP_URL_DI_FABBRICA } from '../utils/whatsapp';

export interface ContactInfo {
  whatsapp_url: string;
  phone_display: string;
  phone_tel_url: string;
  email_address: string;
}

const DEFAULT: ContactInfo = {
  whatsapp_url: WHATSAPP_URL_DI_FABBRICA,
  phone_display: '+39 345 790 5205',
  phone_tel_url: 'tel:+393457905205',
  email_address: 'info@dr7.app',
};

export function useContactInfo(): ContactInfo {
  const [info, setInfo] = useState<ContactInfo>(DEFAULT);
  useEffect(() => {
    let cancelled = false;
    getContactCopy().then(cp => {
      if (cancelled) return;
      setInfo({
        whatsapp_url: cp.whatsapp_url || DEFAULT.whatsapp_url,
        phone_display: cp.phone_display || DEFAULT.phone_display,
        phone_tel_url: cp.phone_tel_url || DEFAULT.phone_tel_url,
        email_address: cp.email_address || DEFAULT.email_address,
      });
    });
    return () => { cancelled = true; };
  }, []);
  return info;
}
