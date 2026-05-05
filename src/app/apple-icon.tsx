import { ImageResponse } from "next/og";

/**
 * Apple touch icon — Next 16 file convention. Served at /apple-icon,
 * used by iOS Safari's `<link rel="apple-touch-icon">` when adding the
 * site to the home screen. iOS applies its own rounded-corner mask, so
 * we render a flat square (the inner cells have their own subtle rounding
 * for visual polish at larger sizes).
 *
 * 180×180 is the recommended resolution for modern iPhones (3× retina).
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          padding: 14,
          gap: 11,
        }}
      >
        <div style={{ display: "flex", flex: 1, gap: 11 }}>
          <div style={{ flex: 1, background: "#ef4444", borderRadius: 14 }} />
          <div style={{ flex: 1, background: "#6366f1", borderRadius: 14 }} />
        </div>
        <div style={{ display: "flex", flex: 1, gap: 11 }}>
          <div style={{ flex: 1, background: "#f97316", borderRadius: 14 }} />
          <div style={{ flex: 1, background: "#a78bfa", borderRadius: 14 }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
