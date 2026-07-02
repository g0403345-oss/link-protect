import SwiftUI

/// Rounded guild icon with a blurple monogram fallback (Discord style).
struct GuildIcon: View {
    let name: String
    let url: URL?
    var size: CGFloat = 44

    var body: some View {
        Group {
            if let url {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    monogram
                }
            } else {
                monogram
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.3, style: .continuous))
    }

    private var monogram: some View {
        ZStack {
            Theme.blurple.opacity(0.9)
            Text(initials)
                .font(.system(size: size * 0.36, weight: .bold))
                .foregroundStyle(.white)
        }
    }

    private var initials: String {
        let words = name.split(separator: " ").prefix(2)
        return words.compactMap { $0.first }.map(String.init).joined().uppercased()
    }
}
