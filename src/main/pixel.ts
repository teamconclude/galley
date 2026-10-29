// A coordinate or size as Electron takes one: a whole number. Math.round alone does not
// give that: it rounds -0.3 to -0, which is no whole number to Electron, and a window
// placed there throws in the main process.
export const pixel = (n: number): number => Math.round(n) || 0
