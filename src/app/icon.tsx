import { ImageResponse } from "next/og";

/**
 * Generated PWA icon — Next 16 file convention. Black background with a
 * stylized to-do list (one completed row + two pending), rendered with
 * simple shapes so we don't depend on a font for any glyph.
 *
 * The first row is "checked" (green box, faded line) so the icon reads
 * as "to-do list" at any size — without needing the user to know what
 * the Eisenhower matrix is.
 */
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <ToDoListIcon padding={32} gap={16} boxSize={24} lineHeight={9} />,
    { ...size },
  );
}

export function ToDoListIcon({
  padding,
  gap,
  boxSize,
  lineHeight,
}: {
  padding: number;
  gap: number;
  boxSize: number;
  lineHeight: number;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#0a0814",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap,
        padding,
      }}
    >
      {[0, 1, 2].map((i) => {
        const checked = i === 0;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: gap * 0.85,
              width: "100%",
            }}
          >
            <div
              style={{
                width: boxSize,
                height: boxSize,
                background: checked ? "#22c55e" : "transparent",
                borderRadius: boxSize * 0.22,
                borderWidth: checked ? 0 : 2.5,
                borderStyle: "solid",
                borderColor: "#ffffff",
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                height: lineHeight,
                background: "#ffffff",
                borderRadius: lineHeight / 2,
                opacity: checked ? 0.4 : 0.92,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
