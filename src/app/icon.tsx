import { ImageResponse } from "next/og";

export const dynamic = "force-dynamic";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 7,
          background:
            "linear-gradient(135deg, #3b82f6 0%, #a855f7 50%, #22d3ee 100%)",
        }}
      >
        {/* Trackeamento.Online: scope + pulse wave + dot central */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 12a8.5 8.5 0 0 1 14.5 -6" opacity="0.55" />
          <path d="M20.5 12a8.5 8.5 0 0 1 -14.5 6" opacity="0.55" />
          <path d="M2 12 L6.5 12 L8.5 8.5 L11 16 L13.5 9.5 L15.5 13 L22 13" />
          <circle cx="12" cy="12" r="1.4" fill="white" stroke="none" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
