import localFont from "next/font/local";

// Bundled locally so builds never depend on fetching Google Fonts.
export const transportNoteFont = localFont({
  src: "../app/fonts/NotoSansLao-Bold-Lao.woff2",
  weight: "700",
});
