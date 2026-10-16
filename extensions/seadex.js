// Independent integration scaffold. Endpoint mapping is not yet implemented.
// Deliberately throws a descriptive error rather than silently returning empty results.
const unavailable = () => { throw new Error('NekoMagic integration not yet implemented: API contract needs verification'); };
export default { single: unavailable, batch: unavailable, movie: unavailable, test: unavailable };
