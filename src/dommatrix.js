"use strict";

// DOMMatrix / DOMMatrixReadOnly and DOMPoint / DOMPointReadOnly.
//
// Canvas needs these for getTransform(), setTransform(matrix),
// CanvasPattern.setTransform() and Path2D.addPath().

const state = new WeakMap();
const internalKey = Symbol('DOMMatrixReadOnly internals');

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
// Flat index of the component named mIJ. The geometry specification stores the
// sixteen doubles so that m41/m42/m43 hold the translation, which is the
// transpose of the usual column-vector matrix. Every operation below works in
// that convention; a/b/c/d/e/f are m11/m12/m21/m22/m41/m42, matching canvas 2D.
const at = (i, j) => (i - 1) * 4 + (j - 1);
const TWO_D = [[1, 1], [1, 2], [2, 1], [2, 2], [4, 1], [4, 2]];
const TWO_D_INDEX = TWO_D.map(([i, j]) => at(i, j));

function internals(object, Interface) {
    const values = state.get(object);
    if (!values || !(object instanceof Interface)) throw new TypeError('Illegal invocation');
    return values;
}

// A matrix is 2D when the third row and column are untouched. m41/m42 are the
// translation and may hold anything.
const THREE_D = [[1, 3], [1, 4], [2, 3], [2, 4], [3, 1], [3, 2], [3, 4], [4, 3]];
function is2DValues(m) {
    return THREE_D.every(([i, j]) => m[at(i, j)] === 0) && m[at(3, 3)] === 1 && m[at(4, 4)] === 1;
}

// out_ij = sum_k a_ik * b_kj
function multiplyValues(a, b) {
    const out = new Array(16);
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            let sum = 0;
            for (let k = 1; k <= 4; k++) sum += a[at(i, k)] * b[at(k, j)];
            out[at(i, j)] = sum;
        }
    }
    return out;
}

// Every DOMMatrix operation post-multiplies: the new step transforms points
// before the existing matrix does, which in this storage is step x current.
const postMultiply = (step, current) => multiplyValues(step, current);

function minor(m, skipRow, skipColumn) {
    const rows = [1, 2, 3, 4].filter(r => r !== skipRow);
    const columns = [1, 2, 3, 4].filter(c => c !== skipColumn);
    const v = (r, c) => m[at(rows[r], columns[c])];
    return v(0, 0) * (v(1, 1) * v(2, 2) - v(1, 2) * v(2, 1))
         - v(0, 1) * (v(1, 0) * v(2, 2) - v(1, 2) * v(2, 0))
         + v(0, 2) * (v(1, 0) * v(2, 1) - v(1, 1) * v(2, 0));
}

function determinant(m) {
    let sum = 0;
    for (let j = 1; j <= 4; j++) sum += ((1 + j) % 2 ? -1 : 1) * m[at(1, j)] * minor(m, 1, j);
    return sum;
}

function invertValues(m) {
    const det = determinant(m);
    if (!det || !Number.isFinite(det)) return null;
    const inverse = new Array(16);
    for (let i = 1; i <= 4; i++) {
        for (let j = 1; j <= 4; j++) {
            // adjugate: the transposed cofactor matrix
            inverse[at(i, j)] = ((i + j) % 2 ? -1 : 1) * minor(m, j, i) / det;
        }
    }
    return inverse.every(Number.isFinite) ? inverse : null;
}

const RADIANS = Math.PI / 180;
function translationValues(x, y, z) {
    const m = IDENTITY.slice();
    m[at(4, 1)] = x; m[at(4, 2)] = y; m[at(4, 3)] = z;
    return m;
}
function scaleValues(x, y, z) {
    const m = IDENTITY.slice();
    m[at(1, 1)] = x; m[at(2, 2)] = y; m[at(3, 3)] = z;
    return m;
}
function rotateAxisValues(x, y, z, degrees) {
    const length = Math.hypot(x, y, z);
    if (!length || !Number.isFinite(length)) return IDENTITY.slice();
    x /= length; y /= length; z /= length;
    // Quarter turns are exact: sin/cos of a converted angle would leave 6e-17.
    const quarter = degrees / 90;
    let s, c;
    if (Number.isInteger(quarter)) {
        const step = ((quarter % 4) + 4) % 4;
        s = [0, 1, 0, -1][step];
        c = [1, 0, -1, 0][step];
    } else {
        // Chrome converts every angle unit to degrees first, so the radian value
        // is derived here rather than kept from the source literal.
        const angle = degrees * RADIANS;
        s = Math.sin(angle); c = Math.cos(angle);
    }
    const t = 1 - c;
    const m = IDENTITY.slice();
    m[at(1, 1)] = t * x * x + c;     m[at(1, 2)] = t * x * y + s * z; m[at(1, 3)] = t * x * z - s * y;
    m[at(2, 1)] = t * x * y - s * z; m[at(2, 2)] = t * y * y + c;     m[at(2, 3)] = t * y * z + s * x;
    m[at(3, 1)] = t * x * z + s * y; m[at(3, 2)] = t * y * z - s * x; m[at(3, 3)] = t * z * z + c;
    return m;
}
function skewValues(xDegrees, yDegrees) {
    const m = IDENTITY.slice();
    m[at(2, 1)] = Math.tan(xDegrees * RADIANS);
    m[at(1, 2)] = Math.tan(yDegrees * RADIANS);
    return m;
}
function perspectiveValues(distance) {
    const m = IDENTITY.slice();
    if (distance > 0) m[at(3, 4)] = -1 / distance;
    return m;
}
function from2D(list) {
    const m = IDENTITY.slice();
    TWO_D_INDEX.forEach((index, position) => { m[index] = list[position]; });
    return m;
}

// ---------------------------------------------------------------------------
// CSS <transform-list> parsing for the string constructor and setMatrixValue.

const ANGLE_UNITS = {deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360};
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;
// CSS units are ASCII case-insensitive; every angle becomes degrees.
function parseAngle(token) {
    const match = new RegExp(`^(${NUMBER})(deg|grad|rad|turn)?$`, 'i').exec(token);
    if (!match) return null;
    if (match[2] === undefined) return Number(match[1]) === 0 ? 0 : null;
    return Number(match[1]) * ANGLE_UNITS[match[2].toLowerCase()];
}
function parseLength(token) {
    const match = new RegExp(`^(${NUMBER})(px)?$`, 'i').exec(token);
    if (!match) return null;
    if (match[2] === undefined && Number(match[1]) !== 0) return null;
    return Number(match[1]);
}
function parseNumber(token) {
    return new RegExp(`^${NUMBER}$`).test(token) ? Number(token) : null;
}

function parseTransformList(source) {
    const text = String(source).trim();
    if (text === '' || text.toLowerCase() === 'none') return {values: IDENTITY.slice(), is2D: true};
    let values = IDENTITY.slice();
    let is2D = true;
    const pattern = /([a-zA-Z0-9]+)\(([^()]*)\)/g;
    let consumed = 0, match;
    while ((match = pattern.exec(text)) !== null) {
        if (text.slice(consumed, match.index).trim() !== '') return null;
        consumed = match.index + match[0].length;
        const args = match[2].trim() === '' ? [] : match[2].split(',').map(part => part.trim());
        if (args.some(part => part === '')) return null;
        const step = transformFunction(match[1].toLowerCase(), args);
        if (!step) return null;
        if (!step.is2D) is2D = false;
        // Later functions in a transform list transform points first.
        values = postMultiply(step.values, values);
    }
    if (consumed === 0 || text.slice(consumed).trim() !== '') return null;
    return {values, is2D: is2D && is2DValues(values)};
}

function transformFunction(name, args) {
    const lengths = args.map(parseLength);
    const numbers = args.map(parseNumber);
    const angles = args.map(parseAngle);
    const ok = list => list.every(value => value !== null);
    switch (name) {
        case 'matrix':
            if (args.length !== 6 || !ok(numbers)) return null;
            return {values: from2D(numbers), is2D: true};
        case 'matrix3d':
            if (args.length !== 16 || !ok(numbers)) return null;
            return {values: numbers.slice(), is2D: false};
        case 'translate':
            if (args.length < 1 || args.length > 2 || !ok(lengths)) return null;
            return {values: translationValues(lengths[0], lengths[1] ?? 0, 0), is2D: true};
        case 'translatex':
            if (args.length !== 1 || !ok(lengths)) return null;
            return {values: translationValues(lengths[0], 0, 0), is2D: true};
        case 'translatey':
            if (args.length !== 1 || !ok(lengths)) return null;
            return {values: translationValues(0, lengths[0], 0), is2D: true};
        case 'translatez':
            if (args.length !== 1 || !ok(lengths)) return null;
            return {values: translationValues(0, 0, lengths[0]), is2D: false};
        case 'translate3d':
            if (args.length !== 3 || !ok(lengths)) return null;
            return {values: translationValues(lengths[0], lengths[1], lengths[2]), is2D: false};
        case 'scale':
            if (args.length < 1 || args.length > 2 || !ok(numbers)) return null;
            return {values: scaleValues(numbers[0], numbers[1] ?? numbers[0], 1), is2D: true};
        case 'scalex':
            if (args.length !== 1 || !ok(numbers)) return null;
            return {values: scaleValues(numbers[0], 1, 1), is2D: true};
        case 'scaley':
            if (args.length !== 1 || !ok(numbers)) return null;
            return {values: scaleValues(1, numbers[0], 1), is2D: true};
        case 'scalez':
            if (args.length !== 1 || !ok(numbers)) return null;
            return {values: scaleValues(1, 1, numbers[0]), is2D: false};
        case 'scale3d':
            if (args.length !== 3 || !ok(numbers)) return null;
            return {values: scaleValues(numbers[0], numbers[1], numbers[2]), is2D: false};
        case 'rotate':
        case 'rotatez':
            if (args.length !== 1 || !ok(angles)) return null;
            return {values: rotateAxisValues(0, 0, 1, angles[0]), is2D: name === 'rotate'};
        case 'rotatex':
            if (args.length !== 1 || !ok(angles)) return null;
            return {values: rotateAxisValues(1, 0, 0, angles[0]), is2D: false};
        case 'rotatey':
            if (args.length !== 1 || !ok(angles)) return null;
            return {values: rotateAxisValues(0, 1, 0, angles[0]), is2D: false};
        case 'rotate3d': {
            if (args.length !== 4) return null;
            const axis = args.slice(0, 3).map(parseNumber);
            const angle = parseAngle(args[3]);
            if (!ok(axis) || angle === null) return null;
            return {values: rotateAxisValues(axis[0], axis[1], axis[2], angle), is2D: false};
        }
        case 'skew':
            if (args.length < 1 || args.length > 2 || !ok(angles)) return null;
            return {values: skewValues(angles[0], angles[1] ?? 0), is2D: true};
        case 'skewx':
            if (args.length !== 1 || !ok(angles)) return null;
            return {values: skewValues(angles[0], 0), is2D: true};
        case 'skewy':
            if (args.length !== 1 || !ok(angles)) return null;
            return {values: skewValues(0, angles[0], 0), is2D: true};
        case 'perspective':
            if (args.length !== 1 || !ok(lengths) || lengths[0] < 0) return null;
            return {values: perspectiveValues(lengths[0]), is2D: false};
        default:
            return null;
    }
}

// CSS number serialization for toString().
function serializeNumber(value) {
    return Object.is(value, -0) ? '0' : String(value);
}

// ---------------------------------------------------------------------------
// DOMPointReadOnly / DOMPoint

class DOMPointReadOnly {
    constructor(x = 0, y = 0, z = 0, w = 1) {
        state.set(this, {values: [+x, +y, +z, +w]});
    }
    static fromPoint(other = {}) {
        // Compare prototypes, not constructors: the exported interface may be a
        // native wrapper around this class.
        const target = this?.prototype === DOMPointReadOnly.prototype ? DOMPointReadOnly : DOMPoint;
        return new target(other.x ?? 0, other.y ?? 0, other.z ?? 0, other.w ?? 1);
    }
    matrixTransform(matrix = {}) {
        const source = matrix instanceof DOMMatrixReadOnly
            ? internals(matrix, DOMMatrixReadOnly) : matrixFromInit(matrix);
        const m = source.values;
        const p = internals(this, DOMPointReadOnly).values;
        // out_j = sum_i p_i * m_ij
        const out = [1, 2, 3, 4].map(j =>
            p[0] * m[at(1, j)] + p[1] * m[at(2, j)] + p[2] * m[at(3, j)] + p[3] * m[at(4, j)]);
        return new DOMPoint(...out);
    }
    toJSON() {
        const [x, y, z, w] = internals(this, DOMPointReadOnly).values;
        return {x, y, z, w};
    }
}
for (const [index, name] of ['x', 'y', 'z', 'w'].entries()) {
    Object.defineProperty(DOMPointReadOnly.prototype, name, {
        get() { return internals(this, DOMPointReadOnly).values[index]; },
        enumerable: true, configurable: true
    });
}
Object.defineProperty(DOMPointReadOnly.prototype, Symbol.toStringTag,
    {value: 'DOMPointReadOnly', configurable: true});

class DOMPoint extends DOMPointReadOnly {}
for (const [index, name] of ['x', 'y', 'z', 'w'].entries()) {
    Object.defineProperty(DOMPoint.prototype, name, {
        get() { return internals(this, DOMPointReadOnly).values[index]; },
        set(value) { internals(this, DOMPointReadOnly).values[index] = +value; },
        enumerable: true, configurable: true
    });
}
Object.defineProperty(DOMPoint.prototype, Symbol.toStringTag, {value: 'DOMPoint', configurable: true});

// ---------------------------------------------------------------------------
// DOMMatrixReadOnly

const THREE_D_NAMES = ['m13', 'm14', 'm23', 'm24', 'm31', 'm32', 'm33', 'm34', 'm43', 'm44'];
function matrixFromInit(init) {
    if (init instanceof DOMMatrixReadOnly) {
        const source = internals(init, DOMMatrixReadOnly);
        return {values: source.values.slice(), is2D: source.is2D};
    }
    if (init === null || (typeof init !== 'object' && typeof init !== 'function')) {
        throw new TypeError('Expected a matrix dictionary');
    }
    const read = key => { const value = init[key]; return value === undefined ? undefined : +value; };
    const pairs = [['a', 'm11', 1], ['b', 'm12', 0], ['c', 'm21', 0],
                   ['d', 'm22', 1], ['e', 'm41', 0], ['f', 'm42', 0]];
    const two = pairs.map(([key, alias, fallback]) => {
        const first = read(key), second = read(alias);
        if (first !== undefined && second !== undefined && first !== second &&
            !(Number.isNaN(first) && Number.isNaN(second))) {
            throw new TypeError('Conflicting matrix dictionary aliases');
        }
        return first === undefined ? (second === undefined ? fallback : second) : first;
    });
    const extras = Object.fromEntries(THREE_D_NAMES.map(key => [key, read(key)]));
    const declared = init.is2D === undefined ? undefined : !!init.is2D;
    const dirty = THREE_D_NAMES.some(key => extras[key] !== undefined &&
        extras[key] !== (key === 'm33' || key === 'm44' ? 1 : 0));
    if (declared === true && dirty) throw new TypeError('Matrix is not 2D');
    const values = from2D(two);
    for (const key of THREE_D_NAMES) {
        if (extras[key] !== undefined) values[at(Number(key[1]), Number(key[2]))] = extras[key];
    }
    return {values, is2D: declared === undefined ? !dirty : declared};
}

class DOMMatrixReadOnly {
    constructor(init) {
        if (init === internalKey) return; // internal: the caller assigns the state
        let values = IDENTITY.slice(), is2D = true;
        if (init !== undefined && init !== null) {
            if (typeof init === 'string') {
                const parsed = parseTransformList(init);
                if (!parsed) throw new DOMException(`Failed to parse '${init}'.`, 'SyntaxError');
                values = parsed.values; is2D = parsed.is2D;
            } else {
                const list = Array.from(init, value => +value);
                if (list.length === 6) values = from2D(list);
                else if (list.length === 16) { values = list; is2D = is2DValues(list); }
                else throw new TypeError(`Expected a sequence of 6 or 16 numbers, found ${list.length}.`);
            }
        }
        state.set(this, {values, is2D});
    }
    static fromMatrix(other = {}) {
        const {values, is2D} = matrixFromInit(other);
        const target = this?.prototype === DOMMatrixReadOnly.prototype ? DOMMatrixReadOnly : DOMMatrix;
        return construct(target, values, is2D);
    }
    static fromFloat32Array(array) { return matrixFromArray(this, array, Float32Array); }
    static fromFloat64Array(array) { return matrixFromArray(this, array, Float64Array); }

    get isIdentity() {
        return internals(this, DOMMatrixReadOnly).values.every((value, index) => value === IDENTITY[index]);
    }
    translate(x = 0, y = 0, z = 0) { return derive(this, translationValues(+x, +y, +z), +z === 0); }
    scale(x = 1, y, z = 1, ox = 0, oy = 0, oz = 0) {
        x = +x; y = y === undefined ? x : +y; z = +z;
        ox = +ox; oy = +oy; oz = +oz;
        // translate(origin) then scale then translate(-origin), each post-multiplied
        const step = postMultiply(translationValues(-ox, -oy, -oz),
            postMultiply(scaleValues(x, y, z), translationValues(ox, oy, oz)));
        return derive(this, step, z === 1 && oz === 0);
    }
    scaleNonUniform(x = 1, y = 1) { return this.scale(+x, +y, 1, 0, 0, 0); }
    scale3d(scale = 1, ox = 0, oy = 0, oz = 0) { return this.scale(+scale, +scale, +scale, +ox, +oy, +oz); }
    rotate(rx = 0, ry, rz) {
        if (ry === undefined && rz === undefined) { rz = +rx; rx = 0; ry = 0; }
        else { rx = +rx; ry = ry === undefined ? 0 : +ry; rz = rz === undefined ? 0 : +rz; }
        // Z, then Y, then X, each post-multiplied.
        let step = rotateAxisValues(0, 0, 1, rz);
        if (ry) step = postMultiply(rotateAxisValues(0, 1, 0, ry), step);
        if (rx) step = postMultiply(rotateAxisValues(1, 0, 0, rx), step);
        return derive(this, step, !rx && !ry);
    }
    rotateFromVector(x = 0, y = 0) {
        const angle = (+x === 0 && +y === 0) ? 0 : Math.atan2(+y, +x) / RADIANS;
        return derive(this, rotateAxisValues(0, 0, 1, angle), true);
    }
    rotateAxisAngle(x = 0, y = 0, z = 0, angle = 0) {
        return derive(this, rotateAxisValues(+x, +y, +z, +angle), +x === 0 && +y === 0);
    }
    skewX(angle = 0) { return derive(this, skewValues(+angle, 0), true); }
    skewY(angle = 0) { return derive(this, skewValues(0, +angle), true); }
    multiply(other = {}) {
        const right = matrixFromInit(other);
        return derive(this, right.values, right.is2D);
    }
    flipX() { const m = IDENTITY.slice(); m[at(1, 1)] = -1; return derive(this, m, true); }
    flipY() { const m = IDENTITY.slice(); m[at(2, 2)] = -1; return derive(this, m, true); }
    inverse() {
        const self = internals(this, DOMMatrixReadOnly);
        const inverted = invertValues(self.values);
        if (!inverted) return construct(DOMMatrix, new Array(16).fill(NaN), false);
        return construct(DOMMatrix, inverted, self.is2D);
    }
    transformPoint(point = {}) { return DOMPoint.fromPoint(point).matrixTransform(this); }
    toFloat32Array() { return Float32Array.from(internals(this, DOMMatrixReadOnly).values); }
    toFloat64Array() { return Float64Array.from(internals(this, DOMMatrixReadOnly).values); }
    toJSON() {
        const self = internals(this, DOMMatrixReadOnly);
        const out = {};
        // Chrome serializes the 2D aliases before the full component grid.
        for (const [name, [i, j]] of Object.entries(ALIASES)) out[name] = self.values[at(i, j)];
        for (let i = 1; i <= 4; i++) {
            for (let j = 1; j <= 4; j++) out[`m${i}${j}`] = self.values[at(i, j)];
        }
        out.is2D = self.is2D;
        out.isIdentity = this.isIdentity;
        return out;
    }
    toString() {
        const self = internals(this, DOMMatrixReadOnly);
        if (self.values.some(value => !Number.isFinite(value))) {
            throw new DOMException('Cannot serialize a matrix with non-finite values.', 'InvalidStateError');
        }
        const parts = self.is2D ? TWO_D_INDEX.map(index => self.values[index]) : self.values;
        return `${self.is2D ? 'matrix' : 'matrix3d'}(${parts.map(serializeNumber).join(', ')})`;
    }
}

function construct(Interface, values, is2D) {
    const matrix = new Interface(internalKey);
    state.set(matrix, {values: values.slice(), is2D: !!is2D && is2DValues(values)});
    return matrix;
}
function derive(matrix, step, keeps2D) {
    const self = internals(matrix, DOMMatrixReadOnly);
    return construct(DOMMatrix, postMultiply(step, self.values), self.is2D && keeps2D);
}
function matrixFromArray(Interface, array, Kind) {
    if (!(array instanceof Kind)) throw new TypeError(`Expected a ${Kind.name}`);
    const values = Array.from(array);
    const target = Interface?.prototype === DOMMatrixReadOnly.prototype ? DOMMatrixReadOnly : DOMMatrix;
    if (values.length === 6) return construct(target, from2D(values), true);
    if (values.length === 16) return construct(target, values, is2DValues(values));
    throw new TypeError(`Expected a sequence of 6 or 16 numbers, found ${values.length}.`);
}

const ALIASES = {a: [1, 1], b: [1, 2], c: [2, 1], d: [2, 2], e: [4, 1], f: [4, 2]};
function defineComponents(Interface, writable) {
    const define = (name, index) => {
        const descriptor = {
            get() { return internals(this, DOMMatrixReadOnly).values[index]; },
            enumerable: true, configurable: true
        };
        if (writable) descriptor.set = function (value) {
            const self = internals(this, DOMMatrixReadOnly);
            self.values[index] = +value;
            if (!is2DValues(self.values)) self.is2D = false;
        };
        Object.defineProperty(Interface.prototype, name, descriptor);
    };
    for (let i = 1; i <= 4; i++) for (let j = 1; j <= 4; j++) define(`m${i}${j}`, at(i, j));
    for (const [name, [i, j]] of Object.entries(ALIASES)) define(name, at(i, j));
}
defineComponents(DOMMatrixReadOnly, false);
Object.defineProperty(DOMMatrixReadOnly.prototype, 'is2D', {
    get() { return internals(this, DOMMatrixReadOnly).is2D; },
    enumerable: true, configurable: true
});
Object.defineProperty(DOMMatrixReadOnly.prototype, Symbol.toStringTag,
    {value: 'DOMMatrixReadOnly', configurable: true});

// ---------------------------------------------------------------------------
// DOMMatrix adds writable components and the mutating operations.

class DOMMatrix extends DOMMatrixReadOnly {
    static fromMatrix(other = {}) {
        const {values, is2D} = matrixFromInit(other);
        return construct(DOMMatrix, values, is2D);
    }
    static fromFloat32Array(array) { return matrixFromArray(DOMMatrix, array, Float32Array); }
    static fromFloat64Array(array) { return matrixFromArray(DOMMatrix, array, Float64Array); }

    multiplySelf(other = {}) {
        const right = matrixFromInit(other);
        return assign(this, postMultiply(right.values, internals(this, DOMMatrixReadOnly).values), right.is2D);
    }
    preMultiplySelf(other = {}) {
        const left = matrixFromInit(other);
        return assign(this, postMultiply(internals(this, DOMMatrixReadOnly).values, left.values), left.is2D);
    }
    translateSelf(x = 0, y = 0, z = 0) { return adopt(this, this.translate(x, y, z)); }
    scaleSelf(x = 1, y, z = 1, ox = 0, oy = 0, oz = 0) { return adopt(this, this.scale(x, y, z, ox, oy, oz)); }
    scale3dSelf(scale = 1, ox = 0, oy = 0, oz = 0) { return adopt(this, this.scale3d(scale, ox, oy, oz)); }
    rotateSelf(rx = 0, ry, rz) { return adopt(this, this.rotate(rx, ry, rz)); }
    rotateFromVectorSelf(x = 0, y = 0) { return adopt(this, this.rotateFromVector(x, y)); }
    rotateAxisAngleSelf(x = 0, y = 0, z = 0, angle = 0) { return adopt(this, this.rotateAxisAngle(x, y, z, angle)); }
    skewXSelf(angle = 0) { return adopt(this, this.skewX(angle)); }
    skewYSelf(angle = 0) { return adopt(this, this.skewY(angle)); }
    invertSelf() {
        const self = internals(this, DOMMatrixReadOnly);
        const inverted = invertValues(self.values);
        if (!inverted) { self.values = new Array(16).fill(NaN); self.is2D = false; }
        else self.values = inverted;
        return this;
    }
    setMatrixValue(source) {
        const parsed = parseTransformList(String(source));
        if (!parsed) throw new DOMException(`Failed to parse '${source}'.`, 'SyntaxError');
        const self = internals(this, DOMMatrixReadOnly);
        self.values = parsed.values;
        self.is2D = parsed.is2D;
        return this;
    }
}

function assign(matrix, values, keeps2D) {
    const self = internals(matrix, DOMMatrixReadOnly);
    self.values = values;
    self.is2D = self.is2D && keeps2D && is2DValues(values);
    return matrix;
}
function adopt(matrix, result) {
    const self = internals(matrix, DOMMatrixReadOnly);
    const next = internals(result, DOMMatrixReadOnly);
    self.values = next.values;
    self.is2D = next.is2D;
    return matrix;
}

defineComponents(DOMMatrix, true);
Object.defineProperty(DOMMatrix.prototype, Symbol.toStringTag, {value: 'DOMMatrix', configurable: true});

// Web IDL constructor arity.
for (const Interface of [DOMMatrixReadOnly, DOMMatrix, DOMPoint, DOMPointReadOnly]) {
    Object.defineProperty(Interface, 'length', {value: 0, configurable: true});
}

// Used by the Canvas implementation to read or build a 2D matrix without going
// through property lookups that user code could intercept.
function matrixComponents(matrix) {
    const self = state.get(matrix);
    if (!self || !(matrix instanceof DOMMatrixReadOnly)) return null;
    return TWO_D_INDEX.map(index => self.values[index]);
}
function createMatrix(a, b, c, d, e, f) {
    return construct(DOMMatrix, from2D([a, b, c, d, e, f]), true);
}

module.exports = {DOMMatrix, DOMMatrixReadOnly, DOMPoint, DOMPointReadOnly,
    matrixComponents, createMatrix};
