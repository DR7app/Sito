import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../supabaseClient';
import { useTranslation } from '../../hooks/useTranslation';
import { dateLocale } from '../../utils/i18nDate';

interface ReferralBonus {
  id: string;
  referee_user_id: string;
  amount: number;
  created_at: string;
}

const SITE_URL = (typeof window !== 'undefined' ? window.location.origin : 'https://dr7.app');

const ReferralProgram: React.FC = () => {
  const { t, lang } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string>('');
  const [bonuses, setBonuses] = useState<ReferralBonus[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);

      const { data: codeRow } = await supabase
        .from('customers_extended')
        .select('referral_code')
        .eq('user_id', user.id)
        .maybeSingle();

      if (codeRow?.referral_code) {
        setReferralCode(codeRow.referral_code);
      }

      const { data: bonusRows } = await supabase
        .from('referral_bonuses')
        .select('id, referee_user_id, amount, created_at')
        .eq('referrer_user_id', user.id)
        .order('created_at', { ascending: false });

      setBonuses(bonusRows || []);
      setLoading(false);
    };
    load();
  }, [user?.id]);

  const referralLink = useMemo(
    () => (referralCode ? `${SITE_URL}/signup?ref=${referralCode}` : ''),
    [referralCode]
  );

  const totalEarned = useMemo(
    () => bonuses.reduce((sum, b) => sum + Number(b.amount || 0), 0),
    [bonuses]
  );

  const handleCopy = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const tmp = document.createElement('textarea');
      tmp.value = referralLink;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareText = `Ciao! Ti invito su DR7 — usa il mio link per registrarti: ${referralLink}\n\nSe ricarichi il wallet con almeno €100, io ricevo un bonus di €50 e tu entri nel mondo DR7.`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent('Entra in DR7')}&body=${encodeURIComponent(shareText)}`;

  if (loading) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 md:p-8 text-center">
        <p className="text-gray-400 text-sm">{t({ it: "Caricamento...", en: "Loading..." })}</p>
      </div>
    );
  }

  if (!referralCode) {
    return (
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 md:p-8 text-center">
        <h2 className="text-xl font-bold text-white">{t({ it: "Invita un amico", en: "Invite a friend" })}</h2>
        <p className="text-sm text-gray-400 mt-2">{t({ it: "Il tuo codice referral non è ancora disponibile. Riprova tra qualche istante.", en: "Your referral code is not available yet. Please try again in a moment." })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 md:p-8">
        <h2 className="text-xl md:text-2xl font-bold text-white">{t({ it: "Invita un amico, ricevi €50", en: "Invite a friend, get €50" })}</h2>
        <p className="text-sm text-gray-400 mt-2 max-w-xl">
          {t({ it: 'Condividi il tuo link personale. Quando un amico si registra e ricarica il wallet con almeno €100, ti accreditiamo €50 sul tuo Credit Wallet. Bonus una tantum per ogni amico invitato.', en: 'Share your personal link. When a friend signs up and tops up their wallet with at least €100, we credit €50 to your Credit Wallet. One-off bonus for each friend invited.' })}
        </p>

        <div className="mt-6">
          <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2">{t({ it: "Il tuo link personale", en: "Your personal link" })}</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              readOnly
              value={referralLink}
              className="flex-1 bg-black border border-gray-700 rounded-md px-4 py-3 text-white text-sm font-mono"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              onClick={handleCopy}
              className="px-5 py-3 bg-white text-black font-bold hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
            >
              {copied ? t({ it: "Copiato!", en: "Copied!" }) : t({ it: "Copia link", en: "Copy link" })}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">{t({ it: "Codice:", en: "Code:" })} <span className="font-mono text-gray-300">{referralCode}</span></p>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 bg-[#25D366] text-white font-semibold hover:opacity-90 text-sm"
          >
            {t({ it: "Condividi su WhatsApp", en: "Share on WhatsApp" })}
          </a>
          <a
            href={emailHref}
            className="px-4 py-2.5 bg-gray-800 text-white font-semibold hover:bg-gray-700 text-sm"
          >
            {t({ it: "Condividi via Email", en: "Share by email" })}
          </a>
        </div>
      </div>

      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-5 md:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div>
            <h3 className="text-lg font-bold text-white">{t({ it: "I tuoi bonus", en: "Your bonuses" })}</h3>
            <p className="text-sm text-gray-400 mt-1">{bonuses.length} {bonuses.length === 1 ? t({ it: "amico", en: "friend" }) : t({ it: "amici", en: "friends" })} — {t({ it: "totale accreditato", en: "total credited" })}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl md:text-3xl font-bold text-white">€{totalEarned.toFixed(2)}</p>
          </div>
        </div>

        {bonuses.length === 0 ? (
          <p className="text-sm text-gray-500">{t({ it: "Ancora nessun amico ha completato una ricarica qualificante. Condividi il tuo link per iniziare.", en: "No friend has completed a qualifying top-up yet. Share your link to get started." })}</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {bonuses.map((b) => (
              <li key={b.id} className="flex justify-between items-center py-3">
                <div className="text-sm text-gray-300">
                  {t({ it: "Amico invitato", en: "Invited friend" })}
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {new Date(b.created_at).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <span className="text-white font-semibold">+€{Number(b.amount).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ReferralProgram;
