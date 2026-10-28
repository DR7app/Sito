package app.dr7.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Regola di navigazione DR7.
 *
 * - Il sito DR7, i pagamenti (Nexi, Stripe) e la verifica 3D Secure della
 *   banca restano DENTRO l'app (su Android si torna indietro col tasto back).
 * - Social, WhatsApp, mappe, telefono ed email si aprono nelle app di sistema.
 */
@CapacitorPlugin(name = "DR7Navigation")
public class DR7NavigationPlugin extends Plugin {

    private static final List<String> EXTERNAL_HOSTS = Arrays.asList(
        "instagram.com", "tiktok.com", "facebook.com", "fb.com", "fb.me",
        "wa.me", "whatsapp.com", "youtube.com", "youtu.be", "linkedin.com",
        "x.com", "twitter.com", "t.me", "maps.apple.com", "maps.google.com",
        "maps.app.goo.gl", "goo.gl", "apps.apple.com", "play.google.com",
        // Google non consente il login dentro le app: si apre nel browser.
        "accounts.google.com"
    );

    private static boolean hostIn(String host, List<String> list) {
        String h = host.toLowerCase(Locale.ROOT);
        for (String d : list) {
            if (h.equals(d) || h.endsWith("." + d)) return true;
        }
        return false;
    }

    private static boolean isGoogleMaps(Uri url) {
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);
        String path = url.getPath() == null ? "" : url.getPath();
        boolean google = host.equals("google.com") || host.endsWith(".google.com") || host.startsWith("google.");
        return google && path.startsWith("/maps");
    }

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);

        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob") || scheme.equals("file")) {
            return null;
        }

        // tel:, mailto:, sms:, whatsapp:, geo:, intent: … → app di sistema.
        if (!scheme.equals("http") && !scheme.equals("https")) {
            openExternally(url);
            return true;
        }

        String host = url.getHost();
        if (host != null && (hostIn(host, EXTERNAL_HOSTS) || isGoogleMaps(url))) {
            openExternally(url);
            return true;
        }

        // Tutto il resto resta nell'app (sito, pagamenti, 3D Secure).
        return false;
    }

    private void openExternally(Uri url) {
        try {
            Intent intent;
            if ("intent".equalsIgnoreCase(url.getScheme())) {
                intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, url);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            // Nessuna app installata per questo link: non facciamo nulla.
        }
    }
}
