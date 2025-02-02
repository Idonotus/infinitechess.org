
/**
 * This script contains many generalized mathematical operations that
 * SEVERAL scripts use.
 */


import { Coords } from "../chess/util/coordutil";


// Type Definitions ------------------------------------------------------------------


/** A rectangle object with properties for the coordinates of its sides. */
interface BoundingBox {
	/** The x-coordinate of the left side of the box. */
	left: number,
	/** The x-coordinate of the right side of the box. */
	right: number,
	/** The y-coordinate of the bottom side of the box. */
	bottom: number,
	/** The y-coordinate of the top side of the box. */
	top: number
};

/** A length-2 number array. Commonly used for storing directions. */
type Vec2 = [number,number]

/** A length-3 number array. Commonly used for storing positional and scale transformations. */
type Vec3 = [number,number,number]

/**
 * The directions a line may come from when it intersects a {@link BoundingBox}
 * 
 * If a line's slope is even SLIGHTLY off perfectly horizontal or vertical,
 * it is considered to be coming from a diagonal/hippogonal direction.
 */
type Corner = 'top' | 'topright' | 'right' | 'bottomright' | 'bottom' | 'bottomleft' | 'left';


// Geometry -------------------------------------------------------------------------------------------


/**
 * Finds the intersection point of two lines given in the form dx * x + dy * y = c.
 * This will return `null` if there isn't one, or if there's infinite (colinear).
 * @param dx1 - The coefficient of x for the first line.
 * @param dy1 - The coefficient of y for the first line.
 * @param c1 - The constant term for the first line.
 * @param dx2 - The coefficient of x for the second line.
 * @param dy2 - The coefficient of y for the second line.
 * @param c2 - The constant term for the second line.
 * @returns - The intersection point [x, y], or null if there isn't one, or if there's infinite.
 */
function getLineIntersection(dx1: number, dy1: number, c1: number, dx2: number, dy2: number, c2: number): Coords | null {
	// Idon us's old code
	// return [
	//     ((dx2*c1)-(dx1*c2))/((dx1*dy2)-(dx2*dy1)),
	//     ((dy2*c1)-(dy1*c2))/((dx1*dy2)-(dx2*dy1))
	// ]

	// Naviary's new code
	const denominator = (dx1 * dy2) - (dx2 * dy1);
	if (denominator === 0) {
		// The lines are parallel or coincident (no single intersection point)
		return null;
	}
    
	const x = ((dx2 * c1) - (dx1 * c2)) / denominator;
	const y = ((dy2 * c1) - (dy1 * c2)) / denominator;
    
	return [x, y];
}

/**
 * Calculates the X and Y components of a unit vector given an angle in radians.
 * @param theta - The angle in radians.
 * @returns A tuple containing the X and Y components, both between -1 and 1.
 */
function getXYComponents_FromAngle(theta: number): Coords {
	return [Math.cos(theta), Math.sin(theta)]; // When hypotenuse is 1.0
}

/**
 * Rounds the given point to the nearest grid point multiple of the provided gridSize.
 * 
 * For example, a point of [5200,1100] and gridSize of 10000 would yield [10000,0]
 */
function roundPointToNearestGridpoint(point: Coords, gridSize: number): Coords { // point: [x,y]  gridSize is width of cells, typically 10,000
	const nearestX = Math.round(point[0] / gridSize) * gridSize;
	const nearestY = Math.round(point[1] / gridSize) * gridSize;

	return [nearestX, nearestY];
}

/**
 * Determines if one bounding box (`innerBox`) is entirely contained within another bounding box (`outerBox`).
 */
function boxContainsBox(outerBox: BoundingBox, innerBox: BoundingBox): boolean {
	if (innerBox.left < outerBox.left) return false;
	if (innerBox.right > outerBox.right) return false;
	if (innerBox.bottom < outerBox.bottom) return false;
	if (innerBox.top > outerBox.top) return false;

	return true;
}

/**
 * Returns true if the provided box contains the square coordinate.
 */
function boxContainsSquare(box: BoundingBox, square: Coords): boolean {
	if (square[0] < box.left) return false;
	if (square[0] > box.right) return false;
	if (square[1] < box.bottom) return false;
	if (square[1] > box.top) return false;

	return true;
}

/**
 * Calculates the minimum bounding box that contains all the provided coordinates.
 */
function getBoxFromCoordsList(coordsList: Coords[]): BoundingBox {
	// Initialize the bounding box using the first coordinate
	const firstPiece = coordsList.shift()!;
	const box: BoundingBox = {
		left: firstPiece[0],
		right: firstPiece[0],
		bottom: firstPiece[1],
		top: firstPiece[1],
	};

	// Expands the bounding box to include every coordinate
	for (const coord of coordsList) {
		expandBoxToContainSquare(box, coord);
	}

	return box;
}

/**
 * Expands the bounding box to include the provided coordinates, if it doesn't already.
 * DESTRUCTIVE. Modifies the original box.
 */
function expandBoxToContainSquare(box: BoundingBox, coord: Coords): void {
	if (coord[0] < box.left) box.left = coord[0];
	else if (coord[0] > box.right) box.right = coord[0];
	if (coord[1] < box.bottom) box.bottom = coord[1];
	else if (coord[1] > box.top) box.top = coord[1];
}

/**
 * Returns the mimimum bounding box that contains both of the provided boxes.
 */
function mergeBoundingBoxes(box1: BoundingBox, box2: BoundingBox): BoundingBox {
	return {
		left: Math.min(box1.left, box2.left),
		right: Math.max(box1.right, box2.right),
		bottom: Math.min(box1.bottom, box2.bottom),
		top: Math.max(box1.top, box2.top),
	};
}

/**
 * Returns the point on the line SEGMENT that is nearest/perpendicular to the given point.
 * @param lineStart - The starting point of the line segment.
 * @param lineEnd - The ending point of the line segment.
 * @param point - The point to find the nearest point on the line to.
 * @returns An object containing the properties `coords`, which is the closest point on our segment to our point, and the `distance` to it.
 */
function closestPointOnLine(lineStart: Coords, lineEnd: Coords, point: Coords): { coords: Coords, distance: number } {
	let closestPoint: Coords | undefined;

	const dx = lineEnd[0] - lineStart[0];
	const dy = lineEnd[1] - lineStart[1];

	if (dx === 0) { // Vertical line
		closestPoint = [lineStart[0], clamp(lineStart[1], lineEnd[1], point[1])];
	} else { // Not vertical
		const m = dy / dx;
		const b = lineStart[1] - m * lineStart[0];
        
		// Calculate x and y coordinates of closest point on line
		let x = (m * (point[1] - b) + point[0]) / (m * m + 1);
		x = clamp(lineStart[0], lineEnd[0], x);
		const y = m * x + b;

		closestPoint = [x, y];
	}

	return {
		coords: closestPoint,
		distance: euclideanDistance(closestPoint, point)
	};
}

/**
 * Returns the side of the box, in english language, the line intersects with the box.
 * If {@link negateSide} is false, it will return the positive X/Y side.
 * If the line is orthogonal, it will only return top/bottom/left/right.
 * Otherwise, it will return the corner name.
 * @param line - [dx,dy]
 * @param negateSide - If false, it will return the positive X/Y side.
 * @returns Which side/corner the line passes through. [0,1] & false => "top"   [2,1] & true => "bottomleft"
 */
function getAABBCornerOfLine(line: Vec2, negateSide: boolean): Corner {
	let corner = "";
	v: {
		if (line[1] === 0) break v; // Horizontal so parallel with top/bottom lines
		corner += ((line[0] > 0 === line[1] > 0) === negateSide === (line[0] !== 0)) ? "bottom" : "top"; 
		// Gonna be honest I have no idea how this works but it does sooooooo its staying
	}
	h: {
		if (line[0] === 0) break h; // Vertical so parallel with left/right lines
		corner += negateSide ? "left" : "right";
	}
	return corner as Corner;
}

/**
 * Get the corner coordinate of the bounding box.
 * Will revert to top left if the corners sides aren't provided.
 */
function getCornerOfBoundingBox(boundingBox: BoundingBox, corner: Corner): Coords {
	const yval = corner.startsWith('bottom') ? boundingBox.bottom : boundingBox.top;
	const xval = corner.endsWith('right') ? boundingBox.right : boundingBox.left;
	return [xval, yval];
}

/**
 * Returns the point the line intersects, on the specified side, of the provided box.
 * DOES NOT round to nearest tile, but returns the coordinates as floating points.
 * @param dx - X change of the line
 * @param dy - Y change of the line
 * @param c - The c value of the line
 * @param boundingBox - The box
 * @param corner - What side/corner the line intersects, in english language. "left"/"topright"...
 * @returns {Coords | undefined} - The tile the line intersects, on the specified side, of the provided box, if it does intersect, otherwise undefined.
 */
function getLineIntersectionEntryPoint(dx: number, dy: number, c: number, boundingBox: BoundingBox, corner: Corner): Coords | undefined {
	const { left, right, top, bottom } = boundingBox;

	// Check for intersection with left side of rectangle
	if (corner.endsWith('left')) {
		const yIntersectLeft = ((left * dy) + c) / dx;
		if (yIntersectLeft >= bottom && yIntersectLeft <= top) return [left, yIntersectLeft];
	}
    
	// Check for intersection with bottom side of rectangle
	if (corner.startsWith('bottom')) {
		const xIntersectBottom = ((bottom * dx) - c) / dy;
		if (xIntersectBottom >= left && xIntersectBottom <= right) return [xIntersectBottom, bottom];
	}

	// Check for intersection with right side of rectangle
	if (corner.endsWith('right')) {
		const yIntersectRight = ((right * dy) + c) / dx;
		if (yIntersectRight >= bottom && yIntersectRight <= top) return [right, yIntersectRight];
	}

	// Check for intersection with top side of rectangle
	if (corner.startsWith('top')) {
		const xIntersectTop = ((top * dx) - c) / dy;
		if (xIntersectTop >= left && xIntersectTop <= right) return [xIntersectTop, top];
	}

	// Doesn't intersect any tile in the box.

	return; // We need this so typescript is happy
}

/**
 * Checks if all lines are colinear aka `[[1,0],[2,0]]` would be as they are both the same direction
 */
function areLinesCollinear(lines: Vec2[]): boolean {
	let gradient: number | undefined;
	for (const line of lines) {
		const lgradient = line[1] / line[0];
		if (gradient === undefined) gradient = lgradient;
		else if (!Number.isFinite(gradient) && !Number.isFinite(lgradient)) continue;
		else if (!isAproxEqual(lgradient, gradient)) return false;
	}
	return true;
}


// Number-Theoretic Algorithms -----------------------------------------------------------------------------------------------


/**
 * Calculates the greatest common divisor between two numbers.
 */
function GCD(a: number, b: number) {
	// Copied from https://www.geeksforgeeks.org/gcd-greatest-common-divisor-practice-problems-for-competitive-programming/
	if (b === 0) return a;
	else return GCD(b, a % b);
}

/**
 * Calculates the least common multiple between all integers in an array.
 */
function LCM(array: number[]): number {
	// Copied from https://www.geeksforgeeks.org/lcm-of-given-array-elements/

	if (array.length === 0) throw Error('Array of numbers must have atleast one number to calculate the LCM.');

	// Initialize result
	let answer: number = array[0]!;

	// answer will contain the LCM of arr[0], ..arr[i] after the i'th iteration, 
	for (let i = 1; i < array.length; i++) {
		answer = ((array[i]! * answer) / GCD(array[i]!, answer)); 
	}

	return answer; 
}


// Distance Calculation ----------------------------------------------------------------------------


/**
 * Returns the euclidean (hypotenuse) distance between 2 points.
 */
function euclideanDistance(point1: Coords, point2: Coords): number { // [x,y]
	return Math.hypot(point2[0] - point1[0], point2[1] - point1[1]);
}

/**
 * Returns the manhatten distance between 2 points.
 * This is the sum of the distances between the points' x distance and y distance.
 * This is often the distance of roads, because you can't move diagonally.
 */
function manhattanDistance(point1: Coords, point2: Coords): number {
	return Math.abs(point2[0] - point1[0]) + Math.abs(point2[1] - point1[1]);
}

/**
 * Returns the chebyshev distance between 2 points.
 * This is the maximum between the points' x distance and y distance.
 * This is often used for chess pieces, because moving
 * diagonally 1 is the same distance as moving orthogonally one.
 */
function chebyshevDistance(point1: Coords, point2: Coords): number {
	return Math.max(Math.abs(point2[0] - point1[0]), Math.abs(point2[1] - point1[1]));
}


// Mathematical ---------------------------------------------------------------------------------------


/**
 * Tests if the provided value is a power of 2.
 * 
 * It does this efficiently by using bitwise operations.
 */
function isPowerOfTwo(value: number): boolean {
	return (value & (value - 1)) === 0;
}

/**
 * Returns true if the given values are approximately equal, with the most amount
 * of difference allowed being the provided epsilon value.
 * @param a - The first value.
 * @param b - The second value.
 * @param epsilon - The allowed maximum difference between `a` and `b` for them to be considered equal.
 * @returns `true` if the values are approximately equal within the epsilon tolerance, otherwise `false`.
 */
function isAproxEqual(a: number, b: number, epsilon: number = 0.000001): boolean {
	return Math.abs(a - b) < epsilon;
}

/**
 * Returns the base-10 logarithm of a given value.
 */
function getBaseLog10(value: number): number {
	return Math.log(value) / Math.log(10);
}

/**
 * Clamps a value between a minimum and a maximum value.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @param value - The value to clamp.
 * @returns The clamped value.
 */
function clamp(min: number, max: number, value: number): number {
	if (min > value) return min;
	if (max < value) return max;
	return value;
}

/**
 * Rounds a number away from zero.
 * If it's positive, it rounds up.
 * If it's negative, it rounds down.
 */
function roundAwayFromZero(value: number): number {
	return value > 0 ? Math.ceil(value) : Math.floor(value);
}

/**
 * Converts an angle in degrees to radians
 */
function degreesToRadians(angleDegrees: number): number {
	return angleDegrees * (Math.PI / 180);
}

/**
 * Rounds up the given number to the next lowest power of two.
 * 
 * Time complexity O(1), because bitwise operations are extremely fast.
 * @param num - The number to round up.
 * @returns The nearest power of two greater than or equal to the given number.
 */
function roundUpToNextPowerOf2(num: number): number {
	if (num <= 1) return 1; // Handle edge case for numbers 0 and 1
	num--; // Step 1: Decrease by 1 to handle numbers like 8
	num |= num >> 1; // Step 2: Propagate the most significant bit to the right
	num |= num >> 2;
	num |= num >> 4;
	num |= num >> 8;
	num |= num >> 16; // Additional shift for 32-bit numbers
	return num + 1; // Step 3: Add 1 to get the next power of 2
}

/**
 * Computes the positive modulus of two numbers.
 * @param a - The dividend.
 * @param b - The divisor.
 * @returns The positive remainder of the division.
 */
function posMod(a: number, b: number): number {
	return a - (Math.floor(a / b) * b);
}

/**
 * Starts with `s`, steps it by +-`progress` towards `e`, then returns that number.
 */
function moveTowards(s: number, e: number, progress: number): number {
	return s + Math.sign(e - s) * Math.min(Math.abs(e - s), progress);
}


// Random Number Generation ----------------------------------------------------------------------


class PseudoRandomGenerator {
	private a: number = 16807;
	private c: number = 2491057;
	private b: number = 2147483647;

	private current: number;

	constructor(seed: number) {
		this.current = seed;
	}

	private iterate() {
		const next = (this.current * this.a + this.c) % this.b;
		this.current = next;
	}

	/**
     * Generates the next random integer in the sequence.
     * @returns A pseudo-random integer between 0 and 2147483647.
     */
	nextInt(): number {
		this.iterate();
		return this.current;
	}

	/**
     * Generates the next random floating point number in the sequence.
     * @returns A pseudo-random float between 0 and 1.
     */
	nextFloat(): number {
		this.iterate();
		return this.current / this.b;
	}
}



export default {
	getLineIntersection,
	getXYComponents_FromAngle,
	roundPointToNearestGridpoint,
	boxContainsBox,
	boxContainsSquare,
	getBoxFromCoordsList,
	expandBoxToContainSquare,
	mergeBoundingBoxes,
	closestPointOnLine,
	getAABBCornerOfLine,
	getCornerOfBoundingBox,
	getLineIntersectionEntryPoint,
	areLinesCollinear,
	GCD,
	LCM,
	euclideanDistance,
	manhattanDistance,
	chebyshevDistance,
	isPowerOfTwo,
	isAproxEqual,
	getBaseLog10,
	clamp,
	roundAwayFromZero,
	degreesToRadians,
	roundUpToNextPowerOf2,
	posMod,
	moveTowards,
	PseudoRandomGenerator,
};

export type {
	BoundingBox,
	Vec2,
	Vec3,
	Corner,
};