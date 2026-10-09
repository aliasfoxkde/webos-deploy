// CalcError: user-facing evaluation failure (bad syntax, unknown name,
// math domain error). Modes catch it and surface `err.message`.
export class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalcError';
  }
}
