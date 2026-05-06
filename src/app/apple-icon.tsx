import { ImageResponse } from "next/og";
import { ToDoListIcon } from "./icon";

/**
 * Apple touch icon (Add to Home Screen). 180×180 — recommended for
 * 3× retina iPhones. iOS adds its own rounded-corner mask, so we render
 * a flat square with no outer border-radius.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <ToDoListIcon padding={28} gap={15} boxSize={22} lineHeight={8} />,
    { ...size },
  );
}
