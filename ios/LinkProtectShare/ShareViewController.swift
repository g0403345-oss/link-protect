import UIKit
import SwiftUI
import UniformTypeIdentifiers

/// Share-sheet extension: share a link from Safari, Discord or anywhere else
/// and get an instant Link Protect verdict — the same deep check as the
/// website's /check page (threat DB, redirect chain, Safe Browsing). Uses the
/// public checker endpoint, so it works without being signed in.
final class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        let host = UIHostingController(rootView: ShareCheckView(
            extractURL: { [weak self] in await self?.sharedURL() },
            dismiss: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        ))
        addChild(host)
        view.addSubview(host.view)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.view.backgroundColor = .clear
        host.didMove(toParent: self)
    }

    /// First URL in the shared items — either a real URL attachment or a URL
    /// found inside shared plain text (e.g. a copied Discord message).
    private func sharedURL() async -> URL? {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem])?
            .compactMap(\.attachments).flatMap { $0 } ?? []
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = try? await p.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL {
                return url
            }
        }
        for p in providers where p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            if let text = try? await p.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String,
               let match = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
                   .firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
               let url = match.url {
                return url
            }
        }
        return nil
    }
}

// MARK: - Verdict model (mirrors the website's /api/check response)

private struct Verdict: Decodable {
    struct Hop: Decodable {
        let url: String
        let domain: String
        let status: Int
    }
    let url: String
    let domain: String
    let safe: Bool
    let category: String?
    let reason: String
    let seenOnServers: Int
    let redirects: [Hop]?
    let finalDomain: String?
}

// MARK: - UI

private struct ShareCheckView: View {
    let extractURL: () async -> URL?
    let dismiss: () -> Void

    private enum Phase {
        case loading
        case noLink
        case failed(String)
        case done(Verdict)
    }
    @State private var phase: Phase = .loading

    var body: some View {
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.35).ignoresSafeArea()
                .onTapGesture(perform: dismiss)
            card
                .padding(12)
        }
        .task(check)
    }

    @Sendable private func check() async {
        guard let url = await extractURL() else {
            phase = .noLink
            return
        }
        var comps = URLComponents(string: "https://link-protect.com/api/check")!
        comps.queryItems = [
            .init(name: "url", value: url.absoluteString),
            .init(name: "deep", value: "1"),
        ]
        do {
            let (data, resp) = try await URLSession.shared.data(from: comps.url!)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                phase = .failed("The checker is temporarily unavailable.")
                return
            }
            phase = .done(try JSONDecoder().decode(Verdict.self, from: data))
        } catch {
            phase = .failed("Couldn't reach the checker — are you online?")
        }
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "shield.lefthalf.filled")
                    .foregroundStyle(accent)
                Text("Link Protect")
                    .font(.headline)
                Spacer()
                Button(action: dismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(.secondary)
                }
            }

            switch phase {
            case .loading:
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Checking link…").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 24)
            case .noLink:
                message(icon: "questionmark.circle", color: .secondary,
                        title: "No link found",
                        body: "The shared content doesn't contain a checkable URL.")
            case .failed(let why):
                message(icon: "wifi.exclamationmark", color: .orange,
                        title: "Check failed", body: why)
            case .done(let v):
                verdictView(v)
            }

            Button(action: dismiss) {
                Text("Done")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(accent, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)
            }
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20))
    }

    private func verdictView(_ v: Verdict) -> some View {
        let color: Color = v.safe ? .green : .red
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: v.safe ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(color)
                VStack(alignment: .leading, spacing: 2) {
                    Text(v.safe ? "No threat found" : "Dangerous link\(v.category.map { " · \($0)" } ?? "")")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(color)
                    Text(v.domain)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Text(v.reason)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let hops = v.redirects, !hops.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("REDIRECTS")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.tertiary)
                    ForEach(Array(hops.enumerated()), id: \.offset) { i, hop in
                        HStack(spacing: 5) {
                            Image(systemName: "arrow.turn.down.right")
                                .font(.system(size: 9))
                                .foregroundStyle(.tertiary)
                            Text(hop.domain)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(i == hops.count - 1 ? (v.safe ? Color.primary : color) : .secondary)
                                .lineLimit(1)
                        }
                        .padding(.leading, CGFloat(i) * 10)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 10))
            }
            if v.seenOnServers > 0 {
                Label("Seen on \(v.seenOnServers) Discord server\(v.seenOnServers == 1 ? "" : "s")",
                      systemImage: "globe")
                    .font(.system(size: 12))
                    .foregroundStyle(.orange)
            }
        }
    }

    private func message(icon: String, color: Color, title: String, body text: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 28)).foregroundStyle(color)
            Text(title).font(.system(size: 15, weight: .semibold))
            Text(text).font(.system(size: 13)).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
    }

    private var accent: Color {
        Color(.sRGB, red: 0x5B / 255.0, green: 0x6C / 255.0, blue: 0xFF / 255.0, opacity: 1)
    }
}
