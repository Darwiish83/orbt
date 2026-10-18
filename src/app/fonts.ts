import { Archivo, JetBrains_Mono } from "next/font/google";

/**
 * Self-hosted via next/font (no runtime Google Fonts CDN call).
 * Archivo carries the width axis the DS display style uses (wdth 118).
 */
export const archivo = Archivo({
  subsets: ["latin"],
  // Variable font: the full 100–900 weight range is included automatically.
  // The width axis (wdth) powers the DS display style (wdth 118).
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});
