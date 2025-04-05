
/**
 * This script prepares our variant when a game is constructed
 */

import legalmoves from './legalmoves.js';
import formatconverter from './formatconverter.js';
import typeutil, { ext, players, rawTypes } from '../util/typeutil.js';
import variant from '../variants/variant.js';

/** 
 * Type Definitions 
 * @typedef {import('./gamefile.js').gamefile} gamefile
 */

"use strict";


/**
 * Initializes the startSnapshot and gameRules properties of the provided gamefile.
 * And inits the piece movesets. ..Basically everything unique to the variant!
 * 
 * To load a custom position, include the options within the `options` parameter!
 * All options are a snapshot of the starting position, before any moves are forwarded.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 * @param {Object} [options] - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`. If startingPosition is not specified, the metadata must contain the "Variant".
 */
function setupVariant(gamefile, metadata, options) {
	if (options) initStartSnapshotAndGamerulesFromOptions(gamefile, metadata, options); // Ignores the "Variant" metadata, and just uses the specified startingPosition
	else initStartSnapshotAndGamerules(gamefile, metadata); // Default (built-in variant, not pasted)

	gamefile.startSnapshot.playerCount = new Set(gamefile.gameRules.turnOrder).size;

	initExistingTypes(gamefile);
	initPieceMovesets(gamefile, metadata);
}

/**
 * Sets the `existingTypes` property of the `startSnapshot` of the gamefile,
 * which contains all types of pieces in the game, without their color extension.
 * @param {gamefile} gamefile
 */
function initExistingTypes(gamefile) {
	if (gamefile.editor) { // Editor mode may add any available piece type to the board
		// Repeat each raw type for every single player in the game.
		gamefile.startSnapshot.existingTypes = typeutil.buildAllTypesForPlayers(Object.values(players), Object.values(rawTypes));
		gamefile.startSnapshot.existingRawTypes = Object.values(rawTypes);
		return;
	}

	// Non-editor mode...

	const types = new Set(Object.values(gamefile.startSnapshot.position)); // Make a set of all pieces in game
    
	// Makes sure pieces that are possible to promote to are accounted for.
	if (gamefile.gameRules.promotionsAllowed) {
		for (const [playerString, rawPromotions] of Object.entries(gamefile.gameRules.promotionsAllowed)) {
			const player = Number(playerString);
			for (const rawType of rawPromotions) {
				types.add(typeutil.buildType(rawType, player));
			}
		}
	}

	/** If Player 3 or greater is present (multiplayer game), then gargoyles may appear when a player dies.
	 * Which means we also must add corresponding neutral for every type in the game! */
	if (gamefile.gameRules.turnOrder.some(p => p >= 3)) {
		for (const type of [...types]) { // Spread to avoid problems with infinite iteration when adding to it at the same time.
			// Convert it to neutral, and add it to existingTypes
			const raw = typeutil.getRawType(type);
			types.add(raw + ext.N)
		}
	}

	gamefile.startSnapshot.existingTypes = [...types];
	gamefile.startSnapshot.existingRawTypes = [...new Set(gamefile.startSnapshot.existingTypes.map(typeutil.getRawType))];
}

/**
 * Initiates legalmoves's and the special detect, move, and undo scripts movesets they're using.
 * @param {gamefile} gamefile - The gamefile
 * @param {Object} metadata - The metadata of the variant. This requires the "Variant" metadata, unless `options` is specified with a startingPosition. "UTCDate" & "UTCTime" are required if you want to load a different version of the desired variant.
 */
function initPieceMovesets(gamefile, metadata) {
	// The movesets and methods for detecting and executing special moves
	// are attached to the gamefile. This is because different variants
	// can have different movesets for each piece. For example, the slideLimit gamerule.
	gamefile.pieceMovesets = variant.getMovesetsOfVariant(metadata);
	gamefile.specialMoves = variant.getSpecialMovesOfVariant(metadata);

	// Construct the vicinity objects (helps with check detection)
	gamefile.vicinity = legalmoves.genVicinity(gamefile);
	gamefile.specialVicinity = legalmoves.genSpecialVicinity(gamefile);
}

/**
 * An alternative to `initStartSnapshotAndGamerules()` that initializes the variant
 * according to the provided options, instead of the variant name.
 * This is used when pasting games.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant, with the following properties:
 * - `Variant`: The name of the variant. Only required if `options` doesn't specify "startingPosition".
 * - `UTCDate`: Optional. Controls the version of the variant to initialize its starting position. If not specified, returns latest version.
 * - `UTCTime`: Optional. Controls the version of the variant to initialize its starting position. If not specified, returns latest version.
 * @param {Object} options - An object that may contain various properties: `turn`, `fullMove`, `enpassant`, `moveRule`, `positionString`, `startingPosition`, `specialRights`, `gameRules`. If metadata doesn't contain "Variant", then "startingPosition" is required.
 */
function initStartSnapshotAndGamerulesFromOptions(gamefile, metadata, options) {

	let positionString = options.positionString;
	let position = options.startingPosition;
	let specialRights = options.specialRights;
	if (!options.startingPosition) {
		const result = variant.getStartingPositionOfVariant(metadata);
		positionString = result.positionString;
		position = result.position;
		specialRights = result.specialRights;
	} else positionString = formatconverter.LongToShort_Position(options.startingPosition, options.specialRights);

	gamefile.startSnapshot = {
		position,
		positionString,
		specialRights,
		fullMove: options.fullMove || 1
	};
	if (options.enpassant) gamefile.startSnapshot.enpassant = options.enpassant;
	if (options.moveRule) {
		const [state, max] = options.moveRule.split('/');
		gamefile.startSnapshot.moveRuleState = Number(state);
		options.gameRules.moveRule = Number(max);
	}
    
	gamefile.gameRules = options.gameRules;
}

/**
 * Initializes the startSnapshot and gameRules properties of the provided gamefile.
 * @param {gamefile} gamefile - The gamefile to initialize
 * @param {Object} metadata - The metadata of the variant, with the following properties:
 * @param {string} metadata.Variant - Required. The name of the variant.
 * @param {number} [metadata.Date] - Optional. The version of the variant to initialize its starting position. If not specified, returns latest version.
 */
function initStartSnapshotAndGamerules(gamefile, metadata) {

	const { position, positionString, specialRights } = variant.getStartingPositionOfVariant(metadata); 
	gamefile.startSnapshot = {
		position,
		positionString,
		specialRights
	};
	gamefile.gameRules = variant.getGameRulesOfVariant(metadata);

	// console.log(jsutil.deepCopyObject(position));
	// console.log(jsutil.deepCopyObject(positionString));
	// console.log(jsutil.deepCopyObject(specialRights));
	// console.log(jsutil.deepCopyObject(gamefile.gameRules));

	// Every variant has the exact same initial moveRuleState value.
	if (gamefile.gameRules.moveRule) gamefile.startSnapshot.moveRuleState = 0;
	gamefile.startSnapshot.fullMove = 1; // Every variant has the exact same fullMove value.
}



// function setupCOAIP(gamefile) {

//     // const piecesByKey = getPositionOfCoaip()

//     // Performance statistics (ON NAVIARY'S MACHINE) when drastically increasing the piece count in the game:
//     // 1. Recalculating the piece models every frame:       *Phone lags after rendering 6,000 pieces. *Computer lags after 20,000
//     // 2. Recalculating the piece models only when needed:  *Phone lags after 400,000 pieces.         *Computer after 3.2 million
//     // This is great! This means the rendering method is very efficient. This will help make games with infinite pieces possible.

//     // A perspective view range of 1000 in each direction (4000x4000 maximum render range box)
//     // means at most, when a queen is selected, 8,000 squares are rendered (orthogonals are both 1 quad),
//     // which is only 3% of our PHONE CPU limit!!!!!! BUT the highlighted squares buffer models are now 3D..

//     // Uncomment the following to drastically lengthen the pawn frontlines (for testing purposes)
//     // Dev release
//     // const count = 25_000; // 81 Seconds
//     // const count = 20_000; // 39 Seconds
//     // const count = 15_000; // 20 Seconds
//     // const count = 10_000; // 8.4 Seconds   ~50,000 piece game
//     // const count = 5_000; // 2 Seconds
//     // const count = 2_000; // 2 Seconds

//     // Last release
//     // const count = 500; // 17- Seconds
//     // // const count = 300; // 5 Seconds   ~1500 piece game

//     // const count = 250000; // 5 Seconds   ~1500 piece game
//     // for (let i = 12; i <= count; i++) {
//     //     let key = coordutil.getKeyFromCoords([i, 2])
//     //     piecesByKey[key] = 'pawnsW';
//     //     key = coordutil.getKeyFromCoords([i, 7])
//     //     piecesByKey[key] = 'pawnsB';
//     // }
//     // for (let i = -3; i >= -count; i--) {
//     //     let key = coordutil.getKeyFromCoords([i, 2])
//     //     piecesByKey[key] = 'pawnsW';
//     //     key = coordutil.getKeyFromCoords([i, 7])
//     //     piecesByKey[key] = 'pawnsB';
//     // }

//     // const piecesByType = organizedlines.buildStateFromKeyList(piecesByKey)

//     // gamefile.startingPosition = piecesByType;

//     gamefile.gameRules = getGameRulesOfVariant(gamefile.variant)
//     initPieceMovesets(gamefile.gameRules)
// }

export default {
	setupVariant
};