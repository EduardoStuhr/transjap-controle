import Capacitor
import UIKit
import WebKit

@objc(AppViewController)
final class AppViewController: CAPBridgeViewController {
    private let officialHost = "sistema-transjap.com.br"
    private let startURL = URL(string: "https://sistema-transjap.com.br/operador")!
    private let loadingIndicator = UIActivityIndicatorView(style: .large)
    private var loadingObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        configureWebView()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.02, green: 0.03, blue: 0.05, alpha: 1)
        configureLoadingIndicator()
    }

    deinit {
        loadingObservation?.invalidate()
    }

    private func configureWebView() {
        guard let webView else { return }

        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.keyboardDismissMode = .interactive

        let refresh = UIRefreshControl()
        refresh.tintColor = UIColor(red: 0.93, green: 0.72, blue: 0.23, alpha: 1)
        refresh.addTarget(self, action: #selector(refreshPage), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self] webView, _ in
            DispatchQueue.main.async {
                if webView.isLoading {
                    self?.loadingIndicator.startAnimating()
                } else {
                    self?.loadingIndicator.stopAnimating()
                    webView.scrollView.refreshControl?.endRefreshing()
                }
            }
        }
    }

    private func configureLoadingIndicator() {
        loadingIndicator.color = UIColor(red: 0.93, green: 0.72, blue: 0.23, alpha: 1)
        loadingIndicator.hidesWhenStopped = true
        loadingIndicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loadingIndicator)
        NSLayoutConstraint.activate([
            loadingIndicator.centerXAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerXAnchor),
            loadingIndicator.centerYAnchor.constraint(equalTo: view.safeAreaLayoutGuide.centerYAnchor),
        ])
    }

    @objc private func refreshPage() {
        guard let currentURL = webView?.url, currentURL.host == officialHost else {
            webView?.load(URLRequest(url: startURL))
            return
        }
        webView?.reload()
    }
}
