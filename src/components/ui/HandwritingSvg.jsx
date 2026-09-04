import React from 'react';

/**
 * HandwritingSvg — an offline, dependency-free "handwriting" reveal.
 *
 * Renders text in a handwriting (cursive) system font and animates it as if it
 * were being written: the letter outlines are stroked on via an SVG
 * stroke-dashoffset animation, then the solid fill settles in.
 *
 * This is a deliberate, offline-safe replacement for the framer-motion +
 * opentype.js registry component. It needs NO extra npm packages and does NOT
 * fetch a font at runtime, so it works inside the packaged desktop app even
 * with no internet. Colour comes from `currentColor` (default: the app
 * --primary token) so it stays on-brand rather than the demo's rose.
 *
 * Props (compatible with the original where it makes sense):
 *   text         string  — the text to "write" (required)
 *   width/height number  — SVG box in px
 *   fontSize     number  — glyph size in user units
 *   strokeWidth  number  — outline thickness while drawing
 *   duration     number  — draw time in seconds
 *   delay        number  — start delay in seconds
 *   ease         'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
 *   color        string  — overrides the --primary default (any CSS colour)
 *   strokeLength number  — override the auto path-length estimate (advanced)
 *   className/style       — forwarded to the <svg>
 */
const EASE = {
  linear: 'linear',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
};

// System handwriting fonts: Segoe Script ships with Windows (this app's target),
// Bradley Hand / Lucida Handwriting cover macOS, then the generic cursive.
const FONT_STACK =
  '"Segoe Script", "Bradley Hand", "Lucida Handwriting", "Comic Sans MS", cursive';

export function HandwritingSvg({
  text = '',
  width = 420,
  height = 120,
  fontSize = 38,
  strokeWidth = 1.25,
  duration = 2.4,
  delay = 0.3,
  ease = 'easeInOut',
  color,
  strokeLength,
  className,
  style,
  ...rest
}) {
  const letters = Math.max(String(text).replace(/\s+/g, '').length, 1);
  // Over-estimate the outline length so the dash fully reveals by offset 0.
  const len = strokeLength ?? letters * fontSize * 4;
  const timing = EASE[ease] || EASE.easeInOut;

  // Force the text to fit the box width so long strings never clip.
  const pad = 14;
  const commonTextProps = {
    x: width / 2,
    y: height / 2,
    textAnchor: 'middle',
    dominantBaseline: 'central',
    fontFamily: FONT_STACK,
    fontSize,
    textLength: Math.max(width - pad * 2, 1),
    lengthAdjust: 'spacingAndGlyphs',
  };

  const rootStyle = {
    color: color || 'var(--primary)',
    overflow: 'visible',
    ...style,
  };

  if (!String(text).trim()) {
    return <svg width={width} height={height} aria-hidden="true" className={className} style={rootStyle} {...rest} />;
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={text}
      className={className}
      style={rootStyle}
      {...rest}
    >
      <title>{text}</title>

      {/* Layer 1 — the "ink" being drawn (outline only). */}
      <text
        {...commonTextProps}
        className="hw-stroke"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: len,
          strokeDashoffset: len,
          animationName: 'hw-draw',
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          animationTimingFunction: timing,
          animationFillMode: 'forwards',
        }}
      >
        {text}
      </text>

      {/* Layer 2 — the solid fill settling in once most of the outline exists. */}
      <text
        {...commonTextProps}
        className="hw-fill"
        fill="currentColor"
        style={{
          fillOpacity: 0,
          animationName: 'hw-fill',
          animationDuration: `${Math.max(duration * 0.6, 0.4)}s`,
          animationDelay: `${delay + duration * 0.5}s`,
          animationTimingFunction: 'ease-out',
          animationFillMode: 'forwards',
        }}
      >
        {text}
      </text>
    </svg>
  );
}

export default HandwritingSvg;
