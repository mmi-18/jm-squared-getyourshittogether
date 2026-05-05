import { ImageResponse } from "next/og";

/**
 * Generated PWA icon — Next 16 file convention. Served at /icon, used by
 * `<link rel="icon">` in the document head and the `/manifest.webmanifest`
 * (which references `/icon` for Android Add-to-Home-Screen).
 *
 * Visual: 2×2 grid of the quadrant accent colors on a white background.
 * Reads as "Eisenhower matrix" instantly without needing text.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: 16,
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flex: 1, gap: 12 }}>
          <div style={{ flex: 1, background: "#ef4444", borderRadius: 16 }} />
          <div style={{ flex: 1, background: "#6366f1", borderRadius: 16 }} />
        </div>
        <div style={{ display: "flex", flex: 1, gap: 12 }}>
          <div style={{ flex: 1, background: "#f97316", borderRadius: 16 }} />
          <div style={{ flex: 1, background: "#a78bfa", borderRadius: 16 }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
