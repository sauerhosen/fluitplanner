import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getPollMeta } from "@/lib/actions/public-polls";

// Request-independent, so read once per instance rather than per render.
const iconFile = await readFile(join(process.cwd(), "app/icon.png"));
const iconData = iconFile.buffer.slice(
  iconFile.byteOffset,
  iconFile.byteOffset + iconFile.byteLength,
);

export const alt = "Fluitplanner umpire availability poll";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * Rendering this PNG is among the most CPU-heavy work the app does, and
 * every share of a poll link makes chat apps and link scanners fetch it — often
 * more than once. The poll lookup reads cookies, so Next serves it dynamically;
 * these headers let Vercel's CDN answer repeats without invoking the function.
 * The image only shows the club name, so a day of staleness is harmless.
 */
const CACHE_CONTROL =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

export default async function Image({ params }: Props) {
  const { token } = await params;
  const meta = await getPollMeta(token);
  const clubName = meta?.clubName ?? "Fluitplanner";

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
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: "48px",
          left: "70px",
          fontSize: 22,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: "#cfe0cf",
          fontWeight: 700,
        }}
      >
        Fluitplanner
      </div>
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
          fontSize: 64,
          fontWeight: 700,
          color: "#f4f2e8",
          maxWidth: "820px",
          lineHeight: 1.15,
        }}
      >
        {clubName}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 30,
          color: "#cfe0cf",
          marginTop: "18px",
        }}
      >
        Umpire availability poll
      </div>
    </div>,
    { ...size, headers: { "Cache-Control": CACHE_CONTROL } },
  );
}
