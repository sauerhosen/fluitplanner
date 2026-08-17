import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Fluitplanner — field hockey umpire scheduling";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const iconFile = await readFile(join(process.cwd(), "app/icon.png"));
  const iconData = iconFile.buffer.slice(
    iconFile.byteOffset,
    iconFile.byteOffset + iconFile.byteLength,
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        position: "relative",
        padding: "70px",
        background: "linear-gradient(135deg, #2f5233 0%, #1e3a20 100%)",
      }}
    >
      <img
        src={iconData as unknown as string}
        alt=""
        width={128}
        height={128}
        style={{
          position: "absolute",
          right: "64px",
          bottom: "60px",
          borderRadius: "26px",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.35)",
        }}
      />
      <div
        style={{
          display: "flex",
          fontSize: 76,
          fontWeight: 700,
          color: "#f4f2e8",
        }}
      >
        Fluitplanner
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: "#cfe0cf",
          marginTop: "18px",
          maxWidth: "760px",
        }}
      >
        Field hockey umpire availability &amp; match assignment
      </div>
    </div>,
    { ...size },
  );
}
