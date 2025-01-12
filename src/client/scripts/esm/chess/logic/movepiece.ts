
/**
 * This script only ever handles global moves, because it
 * purely only affects the gamefile logically.
 * Handling ZERO gui stuff.
 * 
 * Both ends, client & server, should be able to use this script.
 * It SHOULD have a healthy dependancy tree (need to work on that).
 */


// @ts-ignore
import type gamefile from './gamefile.js';
import type { Piece } from './boardchanges.js';
import type { Coords } from '../util/coordutil.js';
import type { MoveState } from './state.js';
import type { Change } from './boardchanges.js';

import colorutil from '../util/colorutil.js';
import coordutil from '../util/coordutil.js';
import state from './state.js';
import boardchanges from './boardchanges.js';
// @ts-ignore
import legalmoves from './legalmoves.js';
// @ts-ignore
import gamefileutility from '../util/gamefileutility.js';
// @ts-ignore
import specialdetect from './specialdetect.js';
// @ts-ignore
import math from '../../util/math.js';
// @ts-ignore
import moveutil from '../util/moveutil.js';
// @ts-ignore
import checkdetection from './checkdetection.js';
// @ts-ignore
import formatconverter from './formatconverter.js';
// @ts-ignore
import wincondition from './wincondition.js';


/** What a move looks like, before movepiece.js creates the `changes`, `state`, `compact`, and `generateIndex` properties on it. */
interface MoveDraft {
	startCoords: Coords,
	endCoords: Coords,
	/** Present if the move was special-move enpassant capture. This will be
	 * 1 for the captured piece is 1 square above, or -1 for 1 square below. */
	enpassant?: -1 | 1,
	/** Present if the move was a special-move promotion. This will be
	 * a string of the type of piece being promoted to: "queensW" */
	promotion?: string,
	/** Present if the move was a special-move casle. This may look like an
	 * object: `{ coord, dir }` where `coord` is the starting coordinates of the
	 * rook being castled with, and `dir` is the direction castled, 1 for right and -1 for left. */
	castle?: { coord: Coords, dir: 1 | -1 },
}

/**
 * Contains all properties a {@link MoveDraft} has, and more!
 * Including the changes it made to the board, the gamefile
 * state before and after the move, etc.
 */
interface Move extends MoveDraft {
	/** The type of piece moved */
	type: string,
	/** A list of changes the move made to the board, whether it moved a piece, captured a piece, added a piece, etc. */
	changes: Array<Change>,
	/** The state of the move is used to know how to modify specific gamefile
	 * properties when forwarding/rewinding this move. */
	state: MoveState,
	generateIndex: number,
	/** The move in most compact notation: `8,7>8,8Q` */
	compact: string,
	/** Whether the move delivered check. */
	check: boolean,
	/** Whether the move delivered mate (or the killing move). */
	mate: boolean,
}

/**
 * Generates a full Move object from a MoveDraft
 */
function generateMove(gamefile: gamefile, moveDraft: MoveDraft): Move {

	const piece = gamefileutility.getPieceAtCoords(gamefile, moveDraft.startCoords);
	if (!piece) throw new Error(`Cannot make move because no piece exists at coords ${JSON.stringify(moveDraft.startCoords)}.`);

	const move: Move = {
		...moveDraft,
		type: piece.type,
		changes: [],
		generateIndex: gamefile.moveIndex + 1,
		state: { local: [], global: [] },
		compact: formatconverter.LongToShort_CompactMove(moveDraft),
		check: false, // This will be set later
		mate: false, // This will be set later
	};

	const trimmedType = colorutil.trimColorExtensionFromType(move.type); // "queens"

	// Do this before making the move, so that if its a pawn double push, enpassant can be reinstated and not deleted.
	deleteEnpassantAndSpecialRightsProperties(gamefile, move);
    
	let specialMoveMade: boolean = false;
	if (gamefile.specialMoves[trimmedType]) specialMoveMade = gamefile.specialMoves[trimmedType](gamefile, piece, move);
	if (!specialMoveMade) movePiece_NoSpecial(gamefile, piece, move); // Move piece regularly (no special tag)

	incrementMoveRule(gamefile, move, boardchanges.wasACapture(move));

	return move;
}

/**
 * Applies a moves changes to the gamefile
 * Does not apply any graphical effects
 */
function applyMove(gamefile: gamefile, move: Move, forward = true, {global = false} = {}) {
	// Stops stupid missing piece errors
	if (gamefile.moveIndex + Number(!forward) !== move.generateIndex) throw new Error(`Move was expected at index ${move.generateIndex} but applied at ${gamefile.moveIndex + Number(!forward)} (forward: ${forward})!`);
	
	boardchanges.runMove(gamefile, move, boardchanges.changeFuncs, forward);
	state.applyMove(gamefile, move, forward, {globalChange: global});
}

/**
 * **Universal** function for executing forward global (not rewinding) moves.
 * Called when we move the selected piece, receive our opponent's move,
 * or need to simulate a move within the checkmate algorithm.
 */
function makeMove(gamefile: gamefile, move: Move) {
	gamefile.moveIndex++;
	gamefile.moves.push(move);

	updateTurn(gamefile);

	applyMove(gamefile, move, true, { global: true });

	// The "check" property will be added inside updateInCheck()...
	// The "mate" property will be added inside our game conclusion checks...

	// ALWAYS DO THIS NOW, no matter what.
	createCheckState(gamefile, move);
	if (gamefile.inCheck) move.check = true;
}

/**
 * Deletes the gamefile's enpassant property, and the moving piece's special right.
 * This needs to be done every time we make a move.
 */
function deleteEnpassantAndSpecialRightsProperties(gamefile: gamefile, move: Move) {
	state.createState(move, "enpassant", gamefile.enpassant, undefined);
	let key = coordutil.getKeyFromCoords(move.startCoords);
	state.createState(move, `specialrights`, gamefile.specialRights[key], undefined, { coords: key });
	key = coordutil.getKeyFromCoords(move.endCoords);
	state.createState(move, `specialrights`, gamefile.specialRights[key], undefined, { coords: key }); // We also delete the captured pieces specialRights for ANY move.
}

/**
 * Standardly moves a piece. Deletes any captured piece. Animates if specified.
 * If the move is a special move, a separate method is needed.
 * @param gamefile - The gamefile
 * @param piece - The piece to move
 * @param move - The move that's being made
*/
function movePiece_NoSpecial(gamefile: gamefile, piece: Piece, move: Move) {

	const capturedPiece = gamefileutility.getPieceAtCoords(gamefile, move.endCoords);

	if (capturedPiece) {
		boardchanges.queueCapture(move.changes, piece, move.endCoords, capturedPiece);
		return;
	};

	boardchanges.queueMovePiece(move.changes, piece, move.endCoords);

}


/**
 * Increments the gamefile's moveRuleStatus property, if the move-rule is in use.
 * @param gamefile - The gamefile
 * @param move - The move
 * @param wasACapture Whether the move made a capture
 */
function incrementMoveRule(gamefile: gamefile, move: Move, wasACapture: boolean) {
	if (!gamefile.gameRules.moveRule) return; // Not using the move-rule
    
	// Reset if it was a capture or pawn movement
	const newMoveRule = (wasACapture || move.type.startsWith('pawns')) ? 0 : gamefile.moveRuleState + 1;
	state.createState(move, 'moverulestate', gamefile.moveRuleState, newMoveRule);
}

/**
 * Flips the `whosTurn` property of the gamefile.
 * @param gamefile - The gamefile
 */
function updateTurn(gamefile: gamefile) {
	gamefile.whosTurn = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
}

function createCheckState(gamefile: gamefile, move: Move) {
	let attackers: [] | undefined = undefined;
	// Only pass in attackers array to be filled by the checking pieces if we're using checkmate win condition.
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = colorutil.getOppositeColor(whosTurnItWasAtMoveIndex);
	if (gamefile.gameRules.winConditions[oppositeColor].includes('checkmate')) attackers = [];

	state.createState(
		move,
		"check",
		gamefile.inCheck,
		checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, attackers),
		{},
		gamefile
	); // Passes in the gamefile as an argument
	state.createState(move, "attackers", gamefile.attackers, attackers || [], {}, gamefile); // Erase the checking pieces calculated from previous turn and pass in new on
}

function updateInCheck(gamefile: gamefile) {
	let attackers: [] | undefined = undefined;
	// Only pass in attackers array to be filled by the checking pieces if we're using checkmate win condition.
	const whosTurnItWasAtMoveIndex = moveutil.getWhosTurnAtMoveIndex(gamefile, gamefile.moveIndex);
	const oppositeColor = colorutil.getOppositeColor(whosTurnItWasAtMoveIndex);
	if (gamefile.gameRules.winConditions[oppositeColor].includes('checkmate')) attackers = [];

	gamefile.inCheck = checkdetection.detectCheck(gamefile, whosTurnItWasAtMoveIndex, attackers); // Passes in the gamefile as an argument
	gamefile.attackers = attackers || []; // Erase the checking pieces calculated from previous turn and pass in new ones!
}

/**
 * Accepts a move list in the most comapact form: `['1,2>3,4','10,7>10,8Q']`,
 * reconstructs each move's properties, INCLUDING special flags, and makes that move
 * in the game. At each step it has to calculate what legal special
 * moves are possible, so it can pass on those flags.
 * On the very final move it test if the game is over, and animate the move.
 * 
 * **THROWS AN ERROR** if any move during the process is in an invalid format.
 * @param {gamefile} gamefile - The gamefile
 * @param {string[]} moves - The list of moves to add to the game, each in the most compact format: `['1,2>3,4','10,7>10,8Q']`
 */
function makeAllMovesInGame(gamefile: gamefile, moves: string[]) {
	if (gamefile.moves.length > 0) throw new Error("Cannot make all moves in game when there are already moves played.");

	moves.forEach((shortmove, i) => {
		const move = calculateMoveFromShortmove(gamefile, shortmove);
		if (!move) throw new Error(`Cannot make all moves in game! There was a move in an invalid format: ${shortmove}. Index: ${i}`);

		// Make the move in the game!
		makeMove(gamefile, move);
	});
}

/**
 * Accepts a move in the most compact short form, and constructs the Move object
 * and most of its properties, EXCLUDING `type` and `captured` which are reconstructed by makeMove().
 * Has to calculate the piece's legal special moves to do add special move flags.
 * 
 * **Returns undefined** if there was an error anywhere in the conversion.
 * This does NOT perform legality checks, so still do that afterward.
 * @param {gamefile} gamefile - The gamefile
 * @param {string} shortmove - The move in most compact form: `1,2>3,4Q`
 * @returns {Move | undefined} The move object, or undefined if there was an error.
 */
function calculateMoveFromShortmove(gamefile: gamefile, shortmove: string): Move | undefined {
	if (!moveutil.areWeViewingLatestMove(gamefile)) {console.error("Cannot calculate Move object from shortmove when we're not viewing the most recently played move."); return;}

	// Reconstruct the startCoords, endCoords, and promotion properties of the longmove

	let moveDraft: MoveDraft;
	try {
		moveDraft = formatconverter.ShortToLong_CompactMove(shortmove); // { startCoords, endCoords, promotion }
	} catch (error) {
		console.error(error);
		console.error(`Failed to calculate Move from shortmove because it's in an incorrect format: ${shortmove}`);
		return;
	}

	// Reconstruct the enpassant and castle properties by calculating what legal
	// special moves this piece can make, comparing them to the move's endCoords,
	// and if there's a match, pass on the special move flag.

	const piece = gamefileutility.getPieceAtCoords(gamefile, moveDraft.startCoords);
	if (!piece) return; // No piece on start coordinates, can't calculate Move, because it's illegal

	const legalSpecialMoves: Coords[] = legalmoves.calculate(gamefile, piece, { onlyCalcSpecials: true }).individual;
	for (let i = 0; i < legalSpecialMoves.length; i++) {
		const thisCoord = legalSpecialMoves[i]!;
		if (!coordutil.areCoordsEqual(thisCoord, moveDraft.endCoords)) continue;
		// Matched coordinates! Transfer any special move tags
		specialdetect.transferSpecialFlags_FromCoordsToMove(thisCoord, moveDraft);
		break;
	}

	return generateMove(gamefile, moveDraft);
}



/**
 * Iterates from moveIndex to the target index
 * Callbacks should not update the board
 */
function forEachMove(gamefile: gamefile, targetIndex: number, callback: CallableFunction) {
	if (targetIndex === gamefile.moveIndex) return;

	const forwards = targetIndex >= gamefile.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = gamefile.moveIndex;
	
	if (gamefile.moves.length <= targetIndex + offset || targetIndex + offset < 0) throw new Error("Target index is outside of the movelist!");

	while (i !== targetIndex) {
		i = math.moveTowards(i, targetIndex, 1);
		const move = gamefile.moves[i + offset];

		if (move === undefined) {
			console.log(`Undefined! ${i}, ${targetIndex}`);
			continue;
		}

		callback(move);
	}
}

/**
 * Iterates to a certain move index.
 * Callable should be a move application function
 * @param {gamefile} gamefile 
 * @param {number} index 
 * @param {CallableFunction} callback 
 */
function gotoMove(gamefile: gamefile, index: number, callback: CallableFunction) {
	if (index === gamefile.moveIndex) return;

	const forwards = index >= gamefile.moveIndex;
	const offset = forwards ? 0 : 1;
	let i = gamefile.moveIndex;
	
	if (gamefile.moves.length <= index + offset || index + offset < 0) throw new Error("Target index is outside of the movelist!");

	while (i !== index) {
		i = math.moveTowards(i, index, 1);
		const move = gamefile.moves[i + offset];

		if (move === undefined) {
			console.log(`Undefined! ${i}, ${index}`);
			continue;
		}
		gamefile.moveIndex = i;
		callback(move);
	}

}

/**
 * **Universal** function for undo'ing or rewinding moves.
 * Called when we're rewinding the game to view past moves,
 * or when the checkmate algorithm is undo'ing a move.
 */
function rewindMove(gamefile: gamefile) {

	const move = moveutil.getMoveFromIndex(gamefile.moves, gamefile.moveIndex); // { type, startCoords, endCoords, captured }

	gamefile.moveIndex--;
	applyMove(gamefile, move, false, { global: true });

	// Finally, delete the move off the top of our moves [] array list
	moveutil.deleteLastMove(gamefile.moves);
	updateTurn(gamefile);
}

/**
 * Wraps a function in a simulated move
 * @returns whatever is returned by the callback
 */
function simulateMoveWrapper<R>(gamefile: gamefile, moveDraft: MoveDraft, callback: () => R): R {
	// Moves the piece without unselecting it or regenerating the pieces model.
	const move = generateMove(gamefile, moveDraft);
	makeMove(gamefile, move);

	// What info can we pull from the game after simulating this move?
	const info = callback();

	// Undo the move, REWIND.
	// We don't have to worry about the index changing, it is the same.
	// BUT THE CAPTURED PIECE MUST be inserted in the exact location!
	// Only remove the move
	rewindMove(gamefile);

	return info;
}

/**
 * Simulates a move to get the check
 * @param {gamefile} gamefile 
 * @param {Move} move 
 * @param {*} colorToTestInCheck 
 * @returns 
 */
function getSimulatedCheck(gamefile: gamefile, move: Move, colorToTestInCheck: string): boolean | Coords[] {
	return simulateMoveWrapper(
		gamefile,
		move,
		() => checkdetection.detectCheck(gamefile, colorToTestInCheck, []),
	);	
}

/**
 * Simulates a move to get the gameConclusion
 * @returns the gameConclusion
 */
function getSimulatedConclusion(gamefile: gamefile, move: Move): string | false {
	return simulateMoveWrapper(
		gamefile,
		move,
		() => wincondition.getGameConclusion(gamefile)
	);
}

export type {
	Move,
	MoveDraft,
};

export default {
	updateInCheck,
	generateMove,
	makeMove,
	updateTurn,
	forEachMove,
	gotoMove,
	makeAllMovesInGame,
	applyMove,
	rewindMove,
	simulateMoveWrapper,
	getSimulatedCheck,
	getSimulatedConclusion,
};