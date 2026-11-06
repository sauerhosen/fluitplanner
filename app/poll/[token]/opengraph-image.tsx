import { ImageResponse } from "next/og";
import { loadOgIcon } from "@/lib/og/icon";
import { getPollClubName, type PollClubName } from "@/lib/og/poll-club-name";

export const alt = "Fluitplanner umpire availability poll";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ token: string }>;
};

/**
 * Rendering this PNG is among the most CPU-heavy work the app does, and every
 * share of a poll link makes chat apps and link scanners fetch it, often more
 * than once. A public Cache-Control lets Vercel's CDN answer repeats without
 * invoking the function. Only a definite hit is cached for long: the image
 * shows just the club name, so a day of staleness is harmless. An unknown
 * token is cached briefly (a link can be shared before its poll exists), and
 * a failed lookup not at all, so a transient error never pins the club-less
 * fallback image.
 */
const CACHE_FOUND =
  "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const CACHE_NOT_FOUND = "public, max-age=300, s-maxage=300";
const CACHE_ERROR = "no-store";

export default async function Image({ params }: Props) {
  const { token } = await params;
  let lookup: PollClubName | null;
  try {
    lookup = await getPollClubName(token);
  } catch (error) {
    console.error("[poll og-image] club name lookup failed:", error);
    lookup = null;
  }
  const clubName = lookup?.clubName ?? "Fluitplanner";
  const cacheControl = !lookup
    ? CACHE_ERROR
    : lookup.found
      ? CACHE_FOUND
      : CACHE_NOT_FOUND;
  const iconData = await loadOgIcon();

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
    { ...size, headers: { "Cache-Control": cacheControl } },
  );
}
