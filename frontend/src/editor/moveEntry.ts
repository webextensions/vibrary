// Move the item at `index` one position in `direction` (-1 up, +1 down), returning a NEW array. A move that would fall
// off either end (or an out-of-range index) returns the original array unchanged - so a caller can compare by identity
// to know whether the move was possible, and the reducer stays a no-op at the ends.
const moveEntry = function <T>(items: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
        return items;
    }
    const next = [...items];
    const moved = next[index];
    next[index] = next[target];
    next[target] = moved;
    return next;
};

export { moveEntry };
