import UIKit
import WebKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = .black
        window?.rootViewController = DR7BridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

// MARK: - DR7 bridge

/// Contenitore principale dell'app: registra la regola di navigazione DR7
/// e attiva lo swipe "indietro" tipico di iOS.
class DR7BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(DR7NavigationPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        webView?.isOpaque = false
        webView?.backgroundColor = .black
        webView?.scrollView.backgroundColor = .black
        // Su iPhone non c'è il tasto indietro: si torna con lo swipe dal bordo.
        webView?.allowsBackForwardNavigationGestures = true
    }
}

/// Regola di navigazione DR7.
///
/// - Il sito DR7 e tutto ciò che il sito apre da solo (redirect di pagamento,
///   verifica 3D Secure della banca, Supabase) resta DENTRO l'app.
/// - Social, WhatsApp, mappe, telefono, email e i link esterni toccati dal
///   cliente (es. articoli di giornale) si aprono nelle app di sistema.
@objc(DR7NavigationPlugin)
public class DR7NavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DR7NavigationPlugin"
    public let jsName = "DR7Navigation"
    public let pluginMethods: [CAPPluginMethod] = []

    /// Domini che restano sempre dentro l'app.
    private let inAppHosts = [
        "dr7.app", "dr7ai.com", "dr7trust.com", "supabase.co",
        "nexigroup.com", "nexi.it", "stripe.com", "stripe.network",
    ]

    /// Domini che si aprono sempre fuori dall'app.
    private let externalHosts = [
        "instagram.com", "tiktok.com", "facebook.com", "fb.com", "fb.me",
        "wa.me", "whatsapp.com", "youtube.com", "youtu.be", "linkedin.com",
        "x.com", "twitter.com", "t.me", "maps.apple.com", "maps.google.com",
        "maps.app.goo.gl", "goo.gl", "apps.apple.com", "play.google.com",
        // Google non consente il login dentro le app: si apre in Safari.
        "accounts.google.com",
    ]

    private func host(_ host: String, isIn list: [String]) -> Bool {
        let h = host.lowercased()
        return list.contains { h == $0 || h.hasSuffix("." + $0) }
    }

    @objc public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            return nil
        }

        // Schemi interni del browser: comportamento standard.
        if ["about", "data", "blob", "file", "capacitor"].contains(scheme) {
            return nil
        }

        // tel:, mailto:, sms:, whatsapp:, maps: … → app di sistema.
        if scheme != "http" && scheme != "https" {
            openExternally(url)
            return true
        }

        let isTopLevel = navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true
        guard isTopLevel, let host = url.host else {
            return false // iframe (es. Stripe): sempre dentro.
        }

        if self.host(host, isIn: inAppHosts) {
            // Link DR7 con target="_blank": lo apriamo nella stessa vista
            // invece di mandarlo a Safari.
            if navigationAction.targetFrame == nil {
                let request = navigationAction.request
                DispatchQueue.main.async { [weak self] in
                    _ = self?.bridge?.webView?.load(request)
                }
                return true
            }
            return false
        }
        if self.host(host, isIn: externalHosts) || isGoogleMaps(url) {
            openExternally(url)
            return true
        }
        // Link esterno toccato dal cliente → fuori. Redirect automatici
        // (pagamenti, 3D Secure) → dentro, così il cliente non esce mai a
        // metà pagamento.
        if navigationAction.navigationType == .linkActivated {
            openExternally(url)
            return true
        }
        return false
    }

    private func isGoogleMaps(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return (host == "google.com" || host.hasSuffix(".google.com") || host.hasPrefix("google."))
            && url.path.hasPrefix("/maps")
    }

    private func openExternally(_ url: URL) {
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }
}
