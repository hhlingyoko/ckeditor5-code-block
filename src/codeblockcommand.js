/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module code-block/codeblockcommand
 */

import Command from '@ckeditor/ckeditor5-core/src/command';

import first from '@ckeditor/ckeditor5-utils/src/first';

/**
 * The block quote command plugin.
 *
 * @extends module:core/command~Command
 */
export default class CodeBlockCommand extends Command {
	/**
	 * Whether the selection starts in a block quote.
	 *
	 * @observable
	 * @readonly
	 * @member {Boolean} #value
	 */

	/**
	 * @inheritDoc
	 */
	refresh() {
		this.value = this._getValue();
		this.isEnabled = this._checkEnabled();
		console.log(this.isEnabled,'this.isEnabled')
	}

	/**
	 * Executes the command. When the command {@link #value is on}, all block quotes within
	 * the selection will be removed. If it is off, all selected blocks will be wrapped with
	 * a block quote.
	 *
	 * @fires execute
	 */
	execute() {
		const model = this.editor.model;
		const doc = model.document;
		const schema = model.schema;
		const blocks = Array.from( doc.selection.getSelectedBlocks() );

		model.change( writer => {
			if ( this.value ) {
				this._removeQuote( writer, blocks.filter( findQuote ) );
			} else {
				const blocksToQuote = blocks.filter( block => {
					// Already quoted blocks needs to be considered while quoting too
					// in order to reuse their <bQ> elements.
					return findQuote( block ) || checkCanBeQuoted( schema, block );
				} );

				this._applyQuote( writer, blocksToQuote );
			}
		} );
	}

	/**
	 * Checks the command's {@link #value}.
	 *
	 * @private
	 * @returns {Boolean} The current value.
	 */
	_getValue() {
		const firstBlock = first( this.editor.model.document.selection.getSelectedBlocks() );
		console.log(firstBlock,'firstBlock')
		// In the current implementation, the block quote must be an immediate parent of a block element.
		return !!( firstBlock && findQuote( firstBlock ) );
	}

	/**
	 * Checks whether the command can be enabled in the current context.
	 *
	 * @private
	 * @returns {Boolean} Whether the command should be enabled.
	 */
	_checkEnabled() {
		if ( this.value ) {
			return true;
		}

		const selection = this.editor.model.document.selection;
		const schema = this.editor.model.schema;

		const firstBlock = first( selection.getSelectedBlocks() );

		if ( !firstBlock ) {
			return false;
		}

		return checkCanBeQuoted( schema, firstBlock );
	}

	/**
	 * Removes the quote from given blocks.
	 *
	 * If blocks which are supposed to be "unquoted" are in the middle of a quote,
	 * start it or end it, then the quote will be split (if needed) and the blocks
	 * will be moved out of it, so other quoted blocks remained quoted.
	 *
	 * @private
	 * @param {module:engine/model/writer~Writer} writer
	 * @param {Array.<module:engine/model/element~Element>} blocks
	 */
	_removeQuote( writer, blocks ) {
		console.log(1111111)
		// Unquote all groups of block. Iterate in the reverse order to not break following ranges.
		getRangesOfBlockGroups( writer, blocks ).reverse().forEach( groupRange => {
			console.log(groupRange,'groupRange')
			console.log(groupRange.start.isAtStart,'groupRange.start.isAtStart')
			if ( groupRange.start.isAtStart && groupRange.end.isAtEnd ) {
				// writer.unwrap( groupRange.start.parent );
				console.log(groupRange.start.parent,'groupRange.start.parent')
				console.log(groupRange.end,'groupRange.end')
				writer.unwrap( groupRange.start.parent );
				console.log(groupRange.start.parent,'groupRange.start.parent1')
				console.log(groupRange.end,'groupRange.end2')
				return;
			}

			// The group of blocks are at the beginning of an <bQ> so let's move them left (out of the <bQ>).
			if ( groupRange.start.isAtStart ) {
				const positionBefore = writer.createPositionBefore( groupRange.start.parent );
				console.log(positionBefore,'positionBefore')
				writer.move( groupRange, positionBefore );

				return;
			}

			// The blocks are in the middle of an <bQ> so we need to split the <bQ> after the last block
			// so we move the items there.
			console.log(groupRange.end.isAtEnd)

			if ( !groupRange.end.isAtEnd ) {
				writer.split( groupRange.end );
			}

			// Now we are sure that groupRange.end.isAtEnd is true, so let's move the blocks right.

			const positionAfter = writer.createPositionAfter( groupRange.end.parent );
			console.log(positionAfter,'----------------positionAfter')
			writer.move( groupRange, positionAfter );
		} );
	}

	/**
	 * Applies the quote to given blocks.
	 *
	 * @private
	 * @param {module:engine/model/writer~Writer} writer
	 * @param {Array.<module:engine/model/element~Element>} blocks
	 */
	_applyQuote( writer, blocks ) {
		const quotesToMerge = [];

		// Quote all groups of block. Iterate in the reverse order to not break following ranges.
		getRangesOfBlockGroups( writer, blocks ).reverse().forEach( groupRange => {
			let quote = findQuote( groupRange.start );
			if ( !quote ) {
				const codeBlock =  writer.createElement( 'codeBlock' );
				const codeBlockInner =  writer.createElement( 'codeBlockInner' );

				writer.wrap( groupRange, codeBlockInner);
				writer.wrap( groupRange,  codeBlock);
				quote  = codeBlock;
				quotesToMerge.push(codeBlockInner)
			}
			console.log(quote,'--->quote')
			quotesToMerge.push( quote );
		} );

		// Merge subsequent <bQ> elements. Reverse the order again because this time we want to go through
		// the <bQ> elements in the source order (due to how merge works – it moves the right element's content
		// to the first element and removes the right one. Since we may need to merge a couple of subsequent `<bQ>` elements
		// we want to keep the reference to the first (furthest left) one.
		quotesToMerge.reverse().reduce( ( currentQuote, nextQuote ) => {
			if ( currentQuote.nextSibling == nextQuote ) {
				writer.merge( writer.createPositionAfter( currentQuote ) );
				console.log(currentQuote,'currentQuote')

				return currentQuote;

			}
			console.log(nextQuote,'nextQuote')
			return nextQuote;
		} );
	}
}

function findQuote( elementOrPosition ) {
	return elementOrPosition.parent.name == 'codeBlock'||elementOrPosition.parent.name == 'codeBlockInner'  ? elementOrPosition.parent : null;
}

// Returns a minimal array of ranges containing groups of subsequent blocks.
//
// content:         abcdefgh
// blocks:          [ a, b, d , f, g, h ]
// output ranges:   [ab]c[d]e[fgh]
//
// @param {Array.<module:engine/model/element~Element>} blocks
// @returns {Array.<module:engine/model/range~Range>}
function getRangesOfBlockGroups( writer, blocks ) {
	let startPosition;
	let i = 0;
	const ranges = [];

	while ( i < blocks.length ) {
		const block = blocks[ i ];
		const nextBlock = blocks[ i + 1 ];

		if ( !startPosition ) {
			startPosition = writer.createPositionBefore( block );
		}

		if ( !nextBlock || block.nextSibling != nextBlock ) {
			ranges.push( writer.createRange( startPosition, writer.createPositionAfter( block ) ) );
			startPosition = null;
		}

		i++;
	}

	return ranges;
}

// Checks whether <bQ> can wrap the block.
function checkCanBeQuoted( schema, block ) {
	// TMP will be replaced with schema.checkWrap().
	const isBQAllowed = schema.checkChild( block.parent, 'codeBlock' );
	const isBlockAllowedInBQ = schema.checkChild( [ '$root', 'codeBlock' ], block );

	return isBQAllowed && isBlockAllowedInBQ;
}
