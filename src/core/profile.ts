import type { ProfileKind } from './params.js';

/** Shape of the transition from base plane to raised plateau across the bevel band. */
export interface ProfileSpec {
  readonly kind: ProfileKind;
  /** Fraction of the band spent on the concave fillet at the bottom of the slope. */
  readonly baseFilletFrac: number;
  /** Fraction of the band spent on the convex round-over at the top of the slope. */
  readonly topRoundFrac: number;
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Fillet fractions clamped to the half-band each may occupy, which bounds their
 * sum at one whole band. Returns the straight-section slope `m` alongside them.
 */
export function resolveFillets(spec: ProfileSpec): { fb: number; ft: number; m: number } {
  const fb = Math.min(0.5, Math.max(0, spec.baseFilletFrac));
  const ft = Math.min(0.5, Math.max(0, spec.topRoundFrac));
  return { fb, ft, m: 1 / (1 - (fb + ft) / 2) };
}

/**
 * Evaluates the height profile at `t`, the normalised position across the bevel
 * band. Always returns 0 at t<=0 and 1 at t>=1.
 *
 * The `filleted` profile is a parabola-line-parabola S-curve: it leaves the base
 * plane and arrives at the plateau with zero slope, so the printed result has a
 * real fillet at the bottom of every ridge and a round-over at the top edge
 * rather than a hard crease.
 */
export function evaluateProfile(spec: ProfileSpec, t: number): number {
  const u = clamp01(t);
  switch (spec.kind) {
    case 'linear':
      return u;
    case 'smoothstep':
      return u * u * (3 - 2 * u);
    case 'smootherstep':
      return u * u * u * (u * (u * 6 - 15) + 10);
    case 'cosine':
      return (1 - Math.cos(Math.PI * u)) / 2;
    case 'filleted': {
      const { fb, ft, m } = resolveFillets(spec);
      if (fb > 0 && u < fb) return (m * u * u) / (2 * fb);
      if (ft > 0 && u > 1 - ft) {
        const d = 1 - u;
        return 1 - (m * d * d) / (2 * ft);
      }
      return m * (u - fb / 2);
    }
  }
}

/**
 * Radii of curvature, in millimetres, where the slope meets the base plane and
 * the plateau. Only meaningful for the `filleted` profile; other profiles report
 * their own curvature at those points, and `linear` reports zero because it
 * arrives at both ends as a crease.
 */
export function filletRadiiMm(spec: ProfileSpec, bandWidthMm: number, heightMm: number): { base: number; top: number } {
  if (bandWidthMm <= 0 || heightMm <= 0) return { base: 0, top: 0 };
  const scale = (bandWidthMm * bandWidthMm) / heightMm;
  switch (spec.kind) {
    case 'linear':
      return { base: 0, top: 0 };
    case 'smoothstep':
      return { base: scale / 6, top: scale / 6 };
    case 'smootherstep':
      return { base: Infinity, top: Infinity };
    case 'cosine':
      return { base: scale / (Math.PI * Math.PI / 2), top: scale / (Math.PI * Math.PI / 2) };
    case 'filleted': {
      const { fb, ft, m } = resolveFillets(spec);
      return {
        base: fb > 0 ? (scale * fb) / m : 0,
        top: ft > 0 ? (scale * ft) / m : 0,
      };
    }
  }
}
