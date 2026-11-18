// The same registration tear for the ray-marched liquid and the baked take.
// Its band is in stage pixels, so adapting the liquid resolution cannot move it.
export function exposureStrip(age, exposure, w, h) {
  const holdAge = age - exposure.holdStart;
  const entry = age < .09 || (holdAge >= 0 && holdAge < .13);
  if (!entry && (age <= exposure.end - .3 || age >= exposure.end - .18)) return null;

  const seed = exposure.seed;
  const y = h * (entry ? .30 + seed * .18 : .50 + seed * .14);
  const height = h * (entry ? .022 : .012);
  const shift = w * (entry ? -.014 : .009) * (seed > .5 ? -1 : 1);
  const elapsed = entry ? (holdAge >= 0 ? holdAge : age) : age - (exposure.end - .3);
  return { y, height, shift: Math.round(shift * (elapsed < .072 ? 1 : -.32)) };
}
