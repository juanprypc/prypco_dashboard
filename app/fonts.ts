import localFont from "next/font/local";

export const aeonik = localFont({
  variable: "--font-aeonik",
  display: "swap",
  src: [
    { path: "../public/fonts/aeonik/Aeonik-Thin.ttf", weight: "100", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-ThinItalic.ttf", weight: "100", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Air.ttf", weight: "200", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-AirItalic.ttf", weight: "200", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Light.ttf", weight: "300", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-LightItalic.ttf", weight: "300", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Regular.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-RegularItalic.ttf", weight: "400", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Medium.ttf", weight: "500", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-MediumItalic.ttf", weight: "500", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Bold.ttf", weight: "700", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-BoldItalic.ttf", weight: "700", style: "italic" },
    { path: "../public/fonts/aeonik/Aeonik-Black.ttf", weight: "900", style: "normal" },
    { path: "../public/fonts/aeonik/Aeonik-BlackItalic.ttf", weight: "900", style: "italic" },
  ],
});
